import * as state from './state';
import GestureHandler from './gesture_handler';
import { BASE_PATHNAME, EDIT_REGEX } from './path';

const { HAS_WEBP } = state;

/// Anchor click handler that doesn't reload the page.
function anchorOnClick(this: HTMLAnchorElement, e: MouseEvent) {
    e.preventDefault();
    history.pushState(null, '', this.href);
    routeUpdate();
    return false;
}

/// Call when the route is updated.
function routeUpdate() {
    const match = EDIT_REGEX.exec(window.location.pathname);
    if (null != match) {
        loadEdit(+match[1]);
    } else {
        if (BASE_PATHNAME !== window.location.pathname) {
            history.pushState(null, '', BASE_PATHNAME);
        }
        loadDocs();
    }
}
window.addEventListener('popstate', routeUpdate);

async function loadEdit(docId: state.DbDocId) {
    document.body.setAttribute('data-page', 'edit');

    console.log('loadEdit', docId);
    // TODO
}

async function loadDocs() {
    document.body.setAttribute('data-page', 'docs');

    const pageDocs: HTMLDivElement = document.getElementById('pageDocs')! as HTMLDivElement;

    // Revoke old URLs.
    pageDocs.querySelectorAll('&>a[data-url]').forEach(anchor => URL.revokeObjectURL(anchor.getAttribute('data-url')!));

    // Replace with new children.
    const docs = await state.getAllDocs();
    const newChildren = docs.map(doc => {
        const { thumb, dateModified, id } = doc;
        const anchor = document.createElement('a');
        anchor.setAttribute('href', `${BASE_PATHNAME}${id}`);
        anchor.innerText = dateModified.toString();
        if (null != thumb) {
            const thumbUrl = URL.createObjectURL(thumb);
            anchor.style.backgroundImage = `url("${CSS.escape(thumbUrl)}")`;
            anchor.setAttribute('data-url', thumbUrl);
        }
        anchor.addEventListener('click', anchorOnClick);
        return anchor;
    });
    pageDocs.replaceChildren(...newChildren);
}

document.addEventListener("DOMContentLoaded", function (_event) {
    routeUpdate(); // TODO

    {
        const buttonFs: HTMLButtonElement = document.getElementById('button-fs')! as HTMLButtonElement;
        buttonFs.addEventListener('click', _e => {
            if (null == document.fullscreenElement) {
                document.body.requestFullscreen({
                    navigationUI: 'hide',
                });
            }
            else {
                document.exitFullscreen();
            }
        });
    }

    {
        const buttonHide: HTMLButtonElement = document.getElementById('button-hide')! as HTMLButtonElement;
        buttonHide.addEventListener('click', _e => {
            const hidden = buttonHide.parentElement!.classList.toggle('hidden');
            buttonHide.innerText = hidden ? '>' : '<';
        });
    }

    {
        const buttonReset: HTMLButtonElement = document.getElementById('button-reset')! as HTMLButtonElement;
        buttonReset.addEventListener('click', _e => {
            if (confirm('Are you sure you want to reset the grid?')) {
                localStorage.clear();
                location.reload();
            }
        });
    }

    const setupFileInput = (input: HTMLInputElement, img: HTMLImageElement): void => {
        const saved = localStorage.getItem(input.name);
        if (null != saved) img.src = saved;

        input.addEventListener('change', ((event: Event & { target: HTMLInputElement }) => {
            const file = event.target?.files?.[0];
            if (file) {
                const bgOrRef = 'input-bg' === event.target.name ? 'background' : 'input-ref' === event.target.name ? 'reference' : null;
                if (null == bgOrRef) throw new Error(`Unknown name: ${JSON.stringify(event.target.name)}`);
                state.uploadImage(file, bgOrRef).then(console.log, console.error);

                // 2.4 MB.
                const MAX_SIZE = 2 * 1000 * 1000;
                if (file.size < MAX_SIZE) {
                    // Smaller, save as-is.
                    const reader = new FileReader();
                    reader.onload = e => {
                        const dataUrl = e.target!.result! as string;
                        localStorage.setItem(event.target.name, dataUrl);
                    }
                    reader.readAsDataURL(file);
                }
                else {
                    // Large, re-encode as webp or lower-quality jpg.
                    img.onload = _e => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;

                        const ctx = canvas.getContext('2d')!;
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const dataUrl = canvas.toDataURL(HAS_WEBP ? 'image/webp' : 'image/jpeg', HAS_WEBP ? 0.9 : 0.7);
                        localStorage.setItem(event.target.name, dataUrl);
                    };
                }

                img.src = URL.createObjectURL(file);
            }
        }) as (e: Event) => void);
    };

    {
        const inputBg: HTMLInputElement = document.querySelector('input[type=file][name=input-bg]')! as HTMLInputElement;
        const imgBg: HTMLImageElement = document.getElementById('img-bg')! as HTMLImageElement;
        setupFileInput(inputBg, imgBg);
    }

    {
        const inputRef: HTMLInputElement = document.querySelector('input[type=file][name=input-ref]')! as HTMLInputElement;
        const imgRef: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;
        setupFileInput(inputRef, imgRef);

        const inputOpacity: HTMLInputElement = document.querySelector('input[type=range][name=input-opacity]')! as HTMLInputElement;
        const updateOpacity = (): void => {
            imgRef.style.opacity = `${inputOpacity.value}%`;
        };
        inputOpacity.addEventListener('input', updateOpacity);
        updateOpacity();
    }

    let updateTid: number | undefined = undefined;
    const updateStorage = () => {
        clearTimeout(updateTid);
        updateTid = setTimeout(() => {
            localStorage.setItem('tf-bg', JSON.stringify(ghBg._transform));
            localStorage.setItem('tf-ref', JSON.stringify(ghRf._transform));
        }, 250);
    };

    const PSEUDO_POINTER_ID = -1;

    const imgBg = document.getElementById('img-bg')! as HTMLImageElement;
    const ghBg = new GestureHandler(([sc, ss, tx, ty]) => {
        imgBg.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
        updateStorage();
    }, JSON.parse(localStorage.getItem('tf-bg') || 'null'));

    const imgRf = document.getElementById('img-ref')! as HTMLImageElement;
    const ghRf = new GestureHandler(([sc, ss, tx, ty]) => {
        imgRf.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
        updateStorage();
    }, JSON.parse(localStorage.getItem('tf-ref') || 'null'));

    const inputRepo = document.querySelector('input[type=checkbox][name=input-repo]')! as HTMLInputElement;
    const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;

    gestureArea.addEventListener('pointerdown', event => {
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
    });

    gestureArea.addEventListener('pointermove', event => {
        event.preventDefault();
        if (!inputRepo.checked) ghBg.move(event);
        ghRf.move(event);
    });

    const pointerEnd = (event: PointerEvent) => {
        event.preventDefault();
        if (!inputRepo.checked) {
            ghBg.end(event);
            ghBg.end({ pointerId: PSEUDO_POINTER_ID });
        }
        ghRf.end(event);
        ghRf.end({ pointerId: PSEUDO_POINTER_ID });
    };
    gestureArea.addEventListener('pointercancel', pointerEnd);
    gestureArea.addEventListener('pointerup', pointerEnd);
    gestureArea.addEventListener('contextmenu', e => {
        e.preventDefault();
        return false;
    });

    gestureArea.addEventListener('wheel', e => {
        if (e.metaKey || e.altKey || e.ctrlKey) return;

        const scale = 1.0 - e.deltaY / 2000;
        if (!inputRepo.checked) {
            ghBg.zoom(e, scale);
        }
        ghRf.zoom(e, scale);
    });

    const buttonSave: HTMLButtonElement = document.getElementById('button-save')! as HTMLButtonElement;
    buttonSave.addEventListener('click', _e => {
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
        });
    });
});

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

