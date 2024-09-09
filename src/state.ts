export type DbImgId = IDBValidKey;
export type DbDocId = IDBValidKey;

export interface DbImg {
    /// PK
    id: DbImgId,
    /// Creation date.
    dateCreated: Date,
    /// Number of times the image is referenced.
    /// See `ImgState.imgId`. Used for garbage collection.
    rc: number,
    /// The image data.
    blob: Blob,
}
export type DbImgAdd = Omit<DbImg, 'id'>;

export interface DbDoc {
    /// PK
    id: DbDocId,
    /// Creation date.
    dateCreated: Date,
    /// Latest modification date.
    dateModified: Date,

    /// Thumbnail of doc, small image.
    thumb: Blob | null,

    /// Index of current state in `states`.
    /// Usually `states.length - 1`, but will be smaller if undo-ing.
    stateCursor: number,
    /// Stack of states as history.
    states: DocState[],
}
export type DbDocAdd = Omit<DbDoc, 'id'>;

export interface DocState {
    /// State for the background image.
    background: ImgState,
    /// State for the reference drawing image.
    reference: ImgState,
}

export interface ImgState {
    /// Transformation in [`matrix(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix) form.
    transform: Transform6,
    /// Transparency alpha.
    alpha: number,
    /// Image PK ID. This increases the RC value by one.
    imgId: DbImgId | null,
}

export type Transform6 = [number, number, number, number, number, number];

const DB = (async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('doodlegrid', 1);
        request.onsuccess = event => {
            (resolve)((event.target as IDBOpenDBRequest).result);
        };
        request.onerror = reject;
        request.onupgradeneeded = event => {
            // Save the IDBDatabase interface
            const db = (event.target as IDBOpenDBRequest).result;

            // Create stores
            const docStore = db.createObjectStore('doc', { keyPath: 'id', autoIncrement: true });
            docStore.createIndex('dateModified', 'dateModified', { unique: false });

            const imgStore = db.createObjectStore('img', { keyPath: 'id', autoIncrement: true });
            imgStore.createIndex('dateCreated', 'dateCreated', { unique: false });
        };
    });

    {
        // Update from old `localStorage` to idb.
        const inputBg = localStorage.getItem('input-bg');
        const inputRf = localStorage.getItem('input-ref');
        const tfBg: [number, number, number, number] = JSON.parse(localStorage.getItem('tf-bg') || 'null');
        const tfRf: [number, number, number, number] = JSON.parse(localStorage.getItem('tf-ref') || 'null');
        if (inputBg && inputRf && tfBg && tfRf) {
            const bgTrans: Transform6 = transform4toTransform6(tfBg);
            const rfTrans: Transform6 = transform4toTransform6(tfRf);
            const refAlpha = 0.5;

            // Get blobs via `fetch`-ing the data URLs.
            const [bgBlob, rfBlob] = await Promise.all((await Promise.all([
                fetch(inputBg),
                fetch(inputRf),
            ])).map(resp => resp.blob()));
            const bgUrl = URL.createObjectURL(bgBlob);
            const rfUrl = URL.createObjectURL(rfBlob);
            const thumb = await renderThumb(bgUrl, bgTrans, rfUrl, rfTrans, refAlpha);
            URL.revokeObjectURL(bgUrl);
            URL.revokeObjectURL(rfUrl);

            const tx = db.transaction(['img', 'doc'], 'readwrite');
            const commit = idbTx(tx);
            const imgStore = tx.objectStore('img');
            const docStore = tx.objectStore('doc');

            const addBgImg = idbReq(
                imgStore.add({
                    dateCreated: (new Date),
                    rc: 1,
                    blob: bgBlob,
                } as DbImgAdd));
            const addRfImg = idbReq(
                imgStore.add({
                    dateCreated: (new Date),
                    rc: 1,
                    blob: rfBlob,
                } as DbImgAdd));
            const [bgImgId, rfImgId] = await Promise.all([addBgImg, addRfImg]);

            const currState: DocState = {
                background: {
                    imgId: bgImgId,
                    transform: bgTrans,
                    alpha: 1.0,
                },
                reference: {
                    imgId: rfImgId,
                    transform: rfTrans,
                    alpha: refAlpha,
                },
            };
            const dbDoc: DbDocAdd = {
                dateCreated: (new Date),
                dateModified: (new Date),
                thumb,
                stateCursor: 0,
                states: [currState],
            }
            const docId = await idbReq<DbDocId>(docStore.add(dbDoc));

            await commit;

            console.log('loaded doc from `localStorage`', docId, dbDoc);
        }
        localStorage.removeItem('input-bg');
        localStorage.removeItem('input-ref');
        localStorage.removeItem('tf-bg');
        localStorage.removeItem('tf-ref');
    }

    return db;
})();

class ImageHandler {
    _imageUrls: Map<DbImgId, Promise<string>> = new Map();

    getImg(dbImgId: DbImgId): null | Promise<string> {
        return this._imageUrls.get(dbImgId) || null;
    }

    loadImg(dbImgId: null | DbImgId, ref: { tx?: IDBTransaction }): null | Promise<string> {
        if (null == dbImgId) {
            return null;
        }
        const stored = this.getImg(dbImgId);
        if (null != stored) {
            return stored;
        }
        const promise: Promise<string> = (async () => {
            // TODO: seems suspicious to have a transaction in here.
            if (null == ref.tx) {
                ref.tx = (await DB).transaction(['img'], 'readonly');
            }
            const dbImg = await idbReq<DbImg>(ref.tx.objectStore('img').get(dbImgId));
            const imgUrl = URL.createObjectURL(dbImg.blob);
            return imgUrl;
        })();
        this._imageUrls.set(dbImgId, promise);
        return promise;
    }

    async uploadImg(blob: Blob, imgUrl: string, ref: { tx?: IDBTransaction }): Promise<DbImgId> {
        if (null == ref.tx) {
            ref.tx = (await DB).transaction(['img'], 'readwrite');
        }
        const dbImgId = await idbReq<DbImgId>(ref.tx.objectStore('img').add({
            dateCreated: new Date,
            rc: 1,
            blob,
        } as DbImgAdd));
        this._imageUrls.set(dbImgId, Promise.resolve(imgUrl));
        return dbImgId;
    }

    async handleStateChange(dbStates: DocState[], thisStates: DocState[], ref: { tx?: IDBTransaction }): Promise<void> {
        const decImgIds = decrementImgIds(dbStates, thisStates);
        if (0 === decImgIds.size) {
            return;
        }

        if (null == ref.tx) {
            ref.tx = (await DB).transaction(['img'], 'readwrite');
        }
        const imgStore = ref.tx.objectStore('img');
        await Promise.all(Array.from(decImgIds).map(imgId => idbReq<DbImg>(imgStore.get(imgId))))
            .then(dbImgs => {
                dbImgs.forEach(dbImg => { dbImg.rc--; });
                return Promise.all(dbImgs.map(async dbImg => {
                    // Delete any that have rc <= 0.
                    if (0 < dbImg.rc) {
                        await idbReq(imgStore.put(dbImg));
                    } else {
                        const url = this._imageUrls.get(dbImg.id);
                        if (null != url) {
                            URL.revokeObjectURL(await url);
                        }
                        this._imageUrls.delete(dbImg.id);
                        await imgStore.delete(dbImg.id);
                    }
                }));
            });
    }
}
const IMAGE_HANDLER = new ImageHandler();

export class StateHandler {
    _dbDoc: DbDoc;
    _flushTimeoutId: number;
    _flushDebounceMillis: number;
    _imgUrls: {
        background: null | string,
        reference: null | string,
    };

    static async create(id?: DbDocId): Promise<StateHandler> {
        let dbDoc: DbDoc;
        let backgroundImgUrl: string | null;
        let referenceImgUrl: string | null;
        if (null == id) {
            const dbDocAdd: DbDocAdd = {
                dateCreated: (new Date),
                dateModified: (new Date),
                thumb: null,
                stateCursor: 0,
                states: [{
                    background: {
                        transform: [1, 0, 0, 1, 0, 0],
                        imgId: null,
                        alpha: 1.0,
                    },
                    reference: {
                        transform: [1, 0, 0, 1, 0, 0],
                        imgId: null,
                        alpha: 0.5,
                    },
                }]
            };
            const tx = (await DB).transaction(['doc'], 'readwrite');
            const dbDocId = await idbReq<DbDocId>(tx.objectStore('doc').add(dbDocAdd));
            dbDoc = { id: dbDocId, ...dbDocAdd };
            backgroundImgUrl = null;
            referenceImgUrl = null;
        }
        else {
            const tx = (await DB).transaction(['doc', 'img'], 'readonly');
            dbDoc = await idbReq<DbDoc>(tx.objectStore('doc').get(id));
            const state = dbDoc.states[dbDoc.stateCursor];
            console.log('load state', state);
            const bgProm = IMAGE_HANDLER.loadImg(state.background.imgId, { tx });
            const rfProm = IMAGE_HANDLER.loadImg(state.reference.imgId, { tx });
            ([backgroundImgUrl, referenceImgUrl] = await Promise.all([bgProm, rfProm]));
        }
        return new StateHandler(dbDoc, backgroundImgUrl, referenceImgUrl);
    }

    constructor(dbDoc: DbDoc, backgroundImgUrl: string | null, referenceImgUrl: string | null) {
        this._dbDoc = dbDoc;
        this._flushTimeoutId = setTimeout(() => { }, 0);
        this._flushDebounceMillis = 500;
        this._imgUrls = {
            background: backgroundImgUrl,
            reference: referenceImgUrl,
        };
    }

    getDocId(): DbDocId {
        return this._dbDoc.id;
    }

    getCurrState(): DocState {
        return this._dbDoc.states[this._dbDoc.stateCursor];
    }

    async _updateThumb() {
        const state = this.getCurrState();
        const [bgUrl, rfUrl] = await Promise.all([
            null == state.background.imgId ? null : IMAGE_HANDLER.getImg(state.background.imgId),
            null == state.reference.imgId ? null : IMAGE_HANDLER.getImg(state.reference.imgId),
        ]);
        const thumb = await renderThumb(bgUrl, state.background.transform, rfUrl, state.reference.transform, state.reference.alpha);
        this._dbDoc.thumb = thumb;
    }

    _pushState(newState: DocState): boolean {
        const prevState = this.getCurrState();
        if (!deepEqual(prevState, newState)) {
            this._dbDoc.stateCursor += 1;
            this._dbDoc.states.splice(this._dbDoc.stateCursor, Number.POSITIVE_INFINITY, newState);
            this._stateChanged();
            return true;
        }
        return false;
    }

    async undoState(): Promise<boolean> {
        if (0 < this._dbDoc.stateCursor) {
            this._dbDoc.stateCursor--;
            this._updateImgUrls();
            this._stateChanged();
            return true;
        }
        return false;
    }

    async redoState(): Promise<boolean> {
        if (this._dbDoc.stateCursor + 1 < this._dbDoc.states.length) {
            this._dbDoc.stateCursor++;
            this._updateImgUrls();
            this._stateChanged();
            return true;
        }
        return false;
    }

    async _updateImgUrls() {
        const state = this.getCurrState();

        const ref: { tx?: IDBTransaction } = {};
        const [bgImgUrl, rfImgUrl] = await Promise.all([
            IMAGE_HANDLER.loadImg(state.background.imgId, ref),
            IMAGE_HANDLER.loadImg(state.reference.imgId, ref),
        ]);

        this._imgUrls.background = bgImgUrl;
        this._imgUrls.reference = rfImgUrl;
    }

    _stateChanged() {
        this._dbDoc.dateModified = (new Date);
        this._flushTimeoutId = setTimeout(() => {
            clearTimeout(this._flushTimeoutId);
            (async () => {
                await this._updateThumb();
                const ref: { tx?: IDBTransaction } = {};
                await this._flushState(ref);
                await idbTx(ref.tx!);
            })().catch(console.error);
        }, this._flushDebounceMillis);
    }

    /// Pushes the locally stored state to the DB.
    async _flushState(ref: { tx?: IDBTransaction }) {
        clearTimeout(this._flushTimeoutId);

        if (null == ref.tx) {
            ref.tx = (await DB).transaction(['doc'], 'readwrite');
        }
        const docStore = ref.tx.objectStore('doc');

        const dbDoc = await idbReq<DbDoc>(docStore.get(this._dbDoc.id));
        const updateImgsPromise = IMAGE_HANDLER.handleStateChange(dbDoc.states, this._dbDoc.states, ref);
        const putDocPromise = idbReq(docStore.put(this._dbDoc));

        await Promise.all([updateImgsPromise, putDocPromise]);
    }

    async uploadImage(blob: Blob, imgUrl: string, type: 'background' | 'reference'): Promise<void> {
        const tx = (await DB).transaction(['img', 'doc'], 'readwrite');
        const commit = new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
        const dbImgId = await IMAGE_HANDLER.uploadImg(blob, imgUrl, { tx });

        const newState: DocState = JSON.parse(JSON.stringify(this.getCurrState()));
        newState[type].imgId = dbImgId;
        this._pushState(newState);
        await this._flushState({ tx });

        this._imgUrls[type] = imgUrl;

        await commit;
    }

    pushTransforms(transformBackground: Transform6, transformReference: Transform6): void {
        const newState: DocState = JSON.parse(JSON.stringify(this.getCurrState()));
        newState.background.transform = transformBackground;
        newState.reference.transform = transformReference;
        this._pushState(newState);
    }

    pushAlpha(alpha: number, type: 'background' | 'reference'): void {
        const newState: DocState = JSON.parse(JSON.stringify(this.getCurrState()));
        newState[type].alpha = alpha;
        this._pushState(newState);
    }
}

export async function getAllDocs(): Promise<DbDoc[]> {
    const tx = (await DB).transaction(['doc'], 'readonly');
    const commit = idbTx(tx);

    const docStore = tx.objectStore('doc');
    const docDateModIdx = docStore.index('dateModified')

    const docs = await idbReq<DbDoc[]>(docDateModIdx.getAll());
    docs.reverse();

    await commit;
    return docs;
}

/// Returns images that are no longer pointed to by states.
function decrementImgIds(prev: DocState[], next: DocState[]): Set<DbImgId> {
    const deletedImgIds = new Set(
        prev.flatMap(s => [s.background.imgId, s.reference.imgId])
            .filter(id => null != id)
    );
    next.flatMap(s => [s.background.imgId, s.reference.imgId])
        .filter(id => null != id)
        .forEach(imgId => deletedImgIds.delete(imgId));
    return deletedImgIds;
}

export const HAS_WEBP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') == 0;

const THUMB_SIZE = 320;

async function renderThumb(bgUrl: null | string, bgTrans: Transform6, rfUrl: null | string, rfTrans: Transform6, refAlpha: number): Promise<Blob | null> {
    const [bgImg, rfImg] = await Promise.all([
        null == bgUrl ? null : loadImgFromUrl(bgUrl),
        null == rfUrl ? null : loadImgFromUrl(rfUrl),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const viewportSize = 0.5 * (window.innerWidth + window.innerHeight);
    const scale = THUMB_SIZE / viewportSize;
    const tx = 0.5 * (THUMB_SIZE - scale * window.innerWidth);
    const ty = 0.5 * (THUMB_SIZE - scale * window.innerHeight);

    const ctx = canvas.getContext('2d')!;
    if (null != bgImg && 10 < bgImg.src.length) {
        ctx.globalAlpha = 1.0;
        ctx.setTransform(scale, 0, 0, scale, tx, ty);
        ctx.transform(...bgTrans);
        ctx.drawImage(bgImg, 0, 0);
    }
    if (null != rfImg && 10 < rfImg.src.length) {
        ctx.globalAlpha = refAlpha;
        ctx.setTransform(scale, 0, 0, scale, tx, ty);
        ctx.transform(...rfTrans);
        ctx.drawImage(rfImg, 0, 0);
    }

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, HAS_WEBP ? 'image/webp' : 'image/png', 0.9));
    return blob;
}

function loadImgFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.onerror = reject;
        img.onload = _e => resolve(img);
        img.src = url;
    });
}

/// https://stackoverflow.com/a/32922084/2398020
function deepEqual(x: any, y: any) {
    const ok = Object.keys, tx = typeof x, ty = typeof y;
    return x && y && tx === 'object' && tx === ty ? (
        ok(x).length === ok(y).length &&
        ok(x).every(key => deepEqual(x[key], y[key]))
    ) : (x === y);
}

export function transform4toTransform6([sc, ss, tx, ty]: [sc: number, ss: number, tx: number, ty: number]): Transform6 {
    return [sc, ss, -ss, sc, tx, ty];
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = e => resolve((e.target as IDBRequest).result);
        request.onerror = reject;
    });
}

function idbTx(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = reject;
    });
}