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
    /// Opacity of the reference.
    refAlpha: number,
}

export interface ImgState {
    /// Transformation in [`matrix(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix) form.
    transform: Transform6,
    /// Image PK ID. This increases the RC value by one.
    imgId: DbImgId,
}

export type Transform6 = [number, number, number, number, number, number];

let currDoc: DbDoc;

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
            const bgTrans: Transform6 = [tfBg[0], tfBg[1], -tfBg[1], tfBg[0], tfBg[2], tfBg[3]];
            const rfTrans: Transform6 = [tfRf[0], tfRf[1], -tfRf[1], tfRf[0], tfRf[2], tfRf[3]];
            const refAlpha = 0.5;

            // Get blobs via `fetch`-ing the data URLs.
            const [bgBlob, rfBlob] = await Promise.all((await Promise.all([
                fetch(inputBg),
                fetch(inputRf),
            ])).map(resp => resp.blob()));
            const thumb = await renderThumb(bgBlob, bgTrans, rfBlob, rfTrans, refAlpha);

            const tx = db.transaction(['img', 'doc'], 'readwrite');
            const commit = new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });
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
                },
                reference: {
                    imgId: rfImgId,
                    transform: rfTrans,
                },
                refAlpha,
            };
            const dbDoc: DbDocAdd = {
                dateCreated: (new Date),
                dateModified: (new Date),
                thumb,
                stateCursor: 0,
                states: [currState],
            }
            const docId = await idbReq<DbDocId>(docStore.add(dbDoc));
            currDoc = {
                ...dbDoc,
                id: docId,
            };

            await commit;

            console.log(currDoc);
        }
        localStorage.removeItem('input-bg');
        localStorage.removeItem('input-ref');
        localStorage.removeItem('tf-bg');
        localStorage.removeItem('tf-ref');
    }

    return db;
})();

export async function uploadImage(blob: Blob, type: 'background' | 'reference') {
    const tx = (await DB).transaction(['img', 'doc'], 'readwrite');
    const commit = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
    const imgStore = tx.objectStore('img');
    const docStore = tx.objectStore('doc');

    const addImgPromise = idbReq<DbImgId>(imgStore.add({
        dateCreated: new Date,
        rc: 1,
        blob,
    } as DbImgAdd));
    const getDocPromise = idbReq<DbDoc>(docStore.get(currDoc.id));

    // Push state onto the states stack.
    const currState: DocState = {
        ...currDoc.states[currDoc.stateCursor],
        [type]: await addImgPromise,
    };
    currDoc.stateCursor += 1;
    currDoc.states.splice(currDoc.stateCursor, Number.POSITIVE_INFINITY, currState);

    const dbDoc = await getDocPromise;
    const decImgIds = decrementImgIds(dbDoc.states, currDoc.states);

    const updateDbImgRcs = Promise.all(Array.from(decImgIds).map(imgId => idbReq<DbImg>(imgStore.get(imgId))))
        .then(dbImgs => {
            dbImgs.forEach(dbImg => { dbImg.rc--; });
            return Promise.all(dbImgs.map(dbImg =>
                // Delete any that have rc <= 0.
                0 < dbImg.rc ? idbReq(imgStore.put(dbImg)) : idbReq(imgStore.delete(dbImg.id))
            ));
        });
    const putDocPromise = idbReq(docStore.put(dbDoc));

    await Promise.all([updateDbImgRcs, putDocPromise]);
    await commit;
}

export async function getAllDocs(): Promise<DbDoc[]> {
    const tx = (await DB).transaction(['doc'], 'readonly');
    const commit = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });

    const docStore = tx.objectStore('doc');
    const docDateModIdx = docStore.index('dateModified')

    const docs = await idbReq<DbDoc[]>(docDateModIdx.getAll());
    docs.reverse();

    await commit;
    return docs;
}

/// Returns images that are no longer pointed to by states.
function decrementImgIds(prev: DocState[], next: DocState[]): Set<DbImgId> {
    const deletedImgIds = new Set(prev.flatMap(s => [s.background.imgId, s.reference.imgId]));
    next.flatMap(s => [s.background.imgId, s.reference.imgId]).forEach(imgId => deletedImgIds.delete(imgId));
    return deletedImgIds;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = e => resolve((e.target as IDBRequest).result);
        request.onerror = reject;
    });
}

export const HAS_WEBP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') == 0;

const THUMB_SIZE = 320;

async function renderThumb(bgBlob: Blob, bgTrans: Transform6, rfBlob: Blob, rfTrans: Transform6, refAlpha: number): Promise<Blob | null> {
    const [bgImg, rfImg] = await Promise.all([
        loadImg(bgBlob),
        loadImg(rfBlob),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const scale = THUMB_SIZE / window.innerWidth;

    const ctx = canvas.getContext('2d')!;
    if (10 < bgImg.src.length) {
        ctx.globalAlpha = 1.0;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.transform(...bgTrans);
        ctx.drawImage(bgImg, 0, 0);
    }
    if (10 < rfImg.src.length) {
        ctx.globalAlpha = refAlpha;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.transform(...rfTrans);
        ctx.drawImage(rfImg, 0, 0);
    }

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, HAS_WEBP ? 'image/webp' : 'image/png', 0.9));
    return blob;
}

function loadImg(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const blobUrl = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.addEventListener('error', e => {
            URL.revokeObjectURL(blobUrl);
            reject(e);
        });
        img.addEventListener('load', _e => {
            URL.revokeObjectURL(blobUrl);
            resolve(img);
        });
        img.setAttribute('src', blobUrl);
    });
}

