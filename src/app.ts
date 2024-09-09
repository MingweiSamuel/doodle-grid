import * as state from './state';
import GestureHandler from './gesture_handler';
import { BASE_PATHNAME, EDIT_REGEX } from './path';

const { HAS_WEBP } = state;

// let stateHandler: null | Promise<state.StateHandler> = null;

/// Called when the route is updated.
function routeUpdate() {
    const match = EDIT_REGEX.exec(window.location.pathname);
    if (null != match) {
        state.StateHandler.create(+match[1]).then(loadEdit).catch(console.error);
    }
    else if ('/new' === window.location.pathname) {
        state.StateHandler.create().then(sh => {
            history.replaceState(null, '', `${BASE_PATHNAME}${sh.getDocId()}`);
            loadEdit(sh);
        }).catch(console.error);
    }
    else {
        if (BASE_PATHNAME !== window.location.pathname) {
            history.replaceState(null, '', BASE_PATHNAME);
        }
        loadDocs();
    }
}
window.addEventListener('popstate', routeUpdate);
document.addEventListener('DOMContentLoaded', routeUpdate);

/// Anchor click handler that doesn't reload the page.
function anchorOnClick(e: MouseEvent) {
    e.preventDefault();
    history.pushState(null, '', (e.currentTarget as HTMLAnchorElement).href);
    routeUpdate();
    return false;
}

async function loadDocs() {
    document.body.setAttribute('data-page', 'docs');

    const pageDocs: HTMLDivElement = document.getElementById('pageDocs')! as HTMLDivElement;

    // Revoke old URLs.
    pageDocs.querySelectorAll('&>a[data-url]').forEach(anchor => URL.revokeObjectURL(anchor.getAttribute('data-url')!));

    // Replace with new children.
    const docs = await state.getAllDocs();
    const newChildren = [
        (() => {
            const anchor = document.createElement('a');
            anchor.setAttribute('href', `${BASE_PATHNAME}new`);
            anchor.innerText = 'Create New';
            anchor.onclick = anchorOnClick;
            return anchor;
        })(),
        ...docs.map(doc => {
            const { thumb, dateModified, id } = doc;
            const anchor = document.createElement('a');
            anchor.setAttribute('href', `${BASE_PATHNAME}${id}`);
            anchor.innerText = dateModified.toString();
            if (null != thumb) {
                const thumbUrl = URL.createObjectURL(thumb);
                anchor.style.backgroundImage = `url("${CSS.escape(thumbUrl)}")`;
                anchor.setAttribute('data-url', thumbUrl);
            }
            anchor.onclick = anchorOnClick;
            return anchor;
        })
    ];
    pageDocs.replaceChildren(...newChildren);
}

async function loadEdit(stateHandler: state.StateHandler) {
    document.body.setAttribute('data-page', 'edit');

    {
        const back = document.getElementById('back')! as HTMLAnchorElement;
        back.onclick = anchorOnClick;
    }

    {
        const buttonFs: HTMLButtonElement = document.getElementById('button-fs')! as HTMLButtonElement;
        buttonFs.onclick = _e => {
            if (null == document.fullscreenElement) {
                document.body.requestFullscreen({
                    navigationUI: 'hide',
                });
            }
            else {
                document.exitFullscreen();
            }
        };
    }

    {
        const buttonHide: HTMLButtonElement = document.getElementById('button-hide')! as HTMLButtonElement;
        buttonHide.onclick = _e => {
            const hidden = buttonHide.parentElement!.classList.toggle('hidden');
            buttonHide.innerText = hidden ? '>' : '<';
        };
    }

    const setupFileInput = (input: HTMLInputElement, img: HTMLImageElement): void => {
        const bgOrRef = 'input-bg' === input.name ? 'background' : 'input-ref' === input.name ? 'reference' : null;
        if (null == bgOrRef) {
            throw new Error(`Unknown name: ${JSON.stringify(input.name)}`);
        }

        {
            const imgUrl = stateHandler._imgUrls[bgOrRef];
            if (null != imgUrl) {
                img.src = imgUrl;
            }
        }

        input.onchange = (event: Event) => {
            const target = event.currentTarget! as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                img.src = URL.createObjectURL(file);
                stateHandler.uploadImage(file, img.src, bgOrRef).catch(console.error);
            }
        };
    };

    const imgBg: HTMLImageElement = document.getElementById('img-bg')! as HTMLImageElement;
    const imgRf: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;

    {
        const inputBg: HTMLInputElement = document.querySelector('input[type=file][name=input-bg]')! as HTMLInputElement;
        setupFileInput(inputBg, imgBg);
    }

    const setAlpha = (() => {
        const inputRef: HTMLInputElement = document.querySelector('input[type=file][name=input-ref]')! as HTMLInputElement;
        setupFileInput(inputRef, imgRf);

        const inputOpacity: HTMLInputElement = document.querySelector('input[type=range][name=input-opacity]')! as HTMLInputElement;
        inputOpacity.value = `${stateHandler.getCurrState().reference.alpha * 100}`;
        const updateOpacity = (): void => {
            imgRf.style.opacity = `${inputOpacity.value}%`;
        };
        inputOpacity.oninput = updateOpacity;
        inputOpacity.onchange = () => stateHandler.pushAlpha(+inputOpacity.value / 100, 'reference');
        updateOpacity();

        return (alpha: number) => {
            inputOpacity.value = `${100 * alpha}`;
            updateOpacity();
        };
    })();

    const PSEUDO_POINTER_ID = -1;

    const tf6Bg = stateHandler.getCurrState().background.transform;
    const ghBg = new GestureHandler(([sc, ss, tx, ty]) => {
        imgBg.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
    }, transform6toTransform4(tf6Bg));

    let pushTransformTimeoutId: number | undefined = undefined;

    const tf6Rf = stateHandler.getCurrState().reference.transform;
    const ghRf = new GestureHandler(([sc, ss, tx, ty]) => {
        imgRf.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;

        // Reference always moves, so we only trigger state changes here. Bit of a hack.
        clearTimeout(pushTransformTimeoutId);
        pushTransformTimeoutId = setTimeout(() => {
            const bgTransform = ghBg._transform;
            const rfTransform = ghRf._transform;
            stateHandler.pushTransforms(state.transform4toTransform6(bgTransform), state.transform4toTransform6(rfTransform));
        }, 250);
    }, transform6toTransform4(tf6Rf));

    const inputRepo = document.querySelector('input[type=checkbox][name=input-repo]')! as HTMLInputElement;
    const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;

    gestureArea.onpointerdown = event => {
        event.preventDefault();
        if (!inputRepo.checked) ghBg.start(event);
        ghRf.start(event);
        if (1 === event.button || 2 === event.button || event.altKey || event.ctrlKey || event.metaKey) {
            if (!inputRepo.checked) {
                const [clientX, clientY] = ghBg.imageToclientXy([imgBg.width / 2, imgBg.height / 2]);
                const dist2 = (Math.pow(event.clientX - clientX, 2) + Math.pow(event.clientY - clientY, 2));
                if (dist2 < Math.pow(50, 2)) return;

                ghBg.start({
                    pointerId: PSEUDO_POINTER_ID,
                    clientX, clientY,
                });
                ghRf.start({
                    pointerId: PSEUDO_POINTER_ID,
                    clientX, clientY,
                });
            }
            else {
                const [clientX, clientY] = ghRf.imageToclientXy([imgRf.width / 2, imgRf.height / 2]);
                const dist2 = (Math.pow(event.clientX - clientX, 2) + Math.pow(event.clientY - clientY, 2));
                if (dist2 < Math.pow(50, 2)) return;

                ghRf.start({
                    pointerId: PSEUDO_POINTER_ID,
                    clientX, clientY,
                });
            }
        }
    };

    gestureArea.onpointermove = event => {
        event.preventDefault();
        if (!inputRepo.checked) ghBg.move(event);
        ghRf.move(event);
    };

    gestureArea.onwheel = e => {
        if (e.metaKey || e.altKey || e.ctrlKey) return;

        const scale = 1.0 - e.deltaY / 2000;
        if (!inputRepo.checked) {
            ghBg.zoom(e, scale);
        }
        ghRf.zoom(e, scale);
    };

    const pointerEnd = (event: PointerEvent) => {
        event.preventDefault();
        if (!inputRepo.checked) {
            ghBg.end(event);
            ghBg.end({ pointerId: PSEUDO_POINTER_ID });
        }
        ghRf.end(event);
        ghRf.end({ pointerId: PSEUDO_POINTER_ID });
    };
    gestureArea.onpointercancel = pointerEnd;
    gestureArea.onpointerup = pointerEnd;

    gestureArea.oncontextmenu = e => {
        e.preventDefault();
        return false;
    };

    const buttonSave: HTMLButtonElement = document.getElementById('button-save')! as HTMLButtonElement;
    buttonSave.onclick = _e => {
        let scale = 1.5 / (Math.min(ghBg.scale(), ghRf.scale()));
        scale = Math.min(
            scale,
            5,
            // Max image dimensions:
            10_000 / window.innerWidth,
            10_000 / window.innerHeight,
        );

        renderImage(scale, imgBg, ghBg, imgRf, ghRf).then(blob => {
            console.assert(null != blob);

            const blobUrl = URL.createObjectURL(blob!);
            const anchor = document.createElement('a');

            document.body.appendChild(anchor);
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('download', 'doodlegrid.jpg');
            anchor.setAttribute('href', blobUrl);
            anchor.click();

            URL.revokeObjectURL(blobUrl);
            anchor.remove();
        }).catch(console.error);
    };

    {
        const buttonUndo: HTMLButtonElement = document.getElementById('button-undo')! as HTMLButtonElement;
        buttonUndo.onclick = _e => {
            (async () => {
                if (await stateHandler.undoState()) {
                    const state = stateHandler.getCurrState();
                    ghBg.setTransform(transform6toTransform4(state.background.transform));
                    ghRf.setTransform(transform6toTransform4(state.reference.transform));
                    imgBg.src = stateHandler._imgUrls.background || 'data:,'; // TODO(mingwei): handle null.
                    imgRf.src = stateHandler._imgUrls.reference || 'data:,'; // TODO(mingwei): handle null.
                    setAlpha(state.reference.alpha);
                }
            })().catch(console.error);
        };
    }
    {
        const buttonRedo: HTMLButtonElement = document.getElementById('button-redo')! as HTMLButtonElement;
        buttonRedo.onclick = _e => {
            (async () => {
                if (await stateHandler.redoState()) {
                    const state = stateHandler.getCurrState();
                    ghBg.setTransform(transform6toTransform4(state.background.transform));
                    ghRf.setTransform(transform6toTransform4(state.reference.transform));
                    imgBg.src = stateHandler._imgUrls.background || 'data:,'; // TODO(mingwei): handle null.
                    imgRf.src = stateHandler._imgUrls.reference || 'data:,'; // TODO(mingwei): handle null.
                    setAlpha(state.reference.alpha);
                }
            })().catch(console.error);
        };
    }
}

function renderImage(scale: number, imgBg: HTMLImageElement, ghBg: GestureHandler, imgRf: HTMLImageElement, ghRf: GestureHandler): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth * scale;
    canvas.height = window.innerHeight * scale;

    const ctx = canvas.getContext('2d')!;
    if (10 < imgBg.src.length) {
        const [sc, ss, tx, ty] = ghBg._transform;
        ctx.globalAlpha = 1.0;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.transform(sc, ss, -ss, sc, tx, ty);
        ctx.drawImage(imgBg, 0, 0);
    }
    if (10 < imgRf.src.length) {
        const [sc, ss, tx, ty] = ghRf._transform;
        ctx.globalAlpha = +imgRf.style.opacity;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.transform(sc, ss, -ss, sc, tx, ty);
        ctx.drawImage(imgRf, 0, 0);
    }

    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), HAS_WEBP ? 'image/webp' : 'image/jpeg', 0.9));
}

function transform6toTransform4(tf6: state.Transform6): [sc: number, ss: number, tx: number, ty: number] {
    return [tf6[0], tf6[1], tf6[4], tf6[5]];
}