import * as math from 'mathjs';

const hasWebP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') == 0;

document.addEventListener("DOMContentLoaded", function (_event) {
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
                        const dataUrl = canvas.toDataURL(hasWebP ? 'image/webp' : 'image/jpeg', hasWebP ? 0.9 : 0.7);
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
        canvas.toBlob(blob => {
            const blobUrl = URL.createObjectURL(blob!);
            const anchor = document.createElement('a');

            document.body.appendChild(anchor);
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('download', 'doodlegrid.jpg');
            anchor.setAttribute('href', blobUrl);
            anchor.click();

            URL.revokeObjectURL(blobUrl);
            anchor.remove();
        }, hasWebP ? 'image/webp' : 'image/jpeg', 0.9);
    });
});

type Pointer = { pointerId: number, clientX: number, clientY: number };

class GestureHandler {
    _activePointers: Map<Number, { startX: number, startY: number, clientX: number, clientY: number }> = new Map();
    _transform: [sc: number, ss: number, tx: number, ty: number] = [1, 0, 0, 0];
    _target: HTMLElement;
    _onUpdate: (_: [sc: number, ss: number, tx: number, ty: number]) => void;

    constructor(onUpdate: (_: [sc: number, ss: number, tx: number, ty: number]) => any, transform?: [number, number, number, number]) {
        this._onUpdate = onUpdate;
        if (null != transform) {
            this._transform = transform;
            this._update();
        }
    }

    start({ clientX, clientY, pointerId }: Pointer): void {
        const [startX, startY] = this.clientToImageXy({ clientX, clientY });
        this._activePointers.set(pointerId, {
            startX, startY, clientX, clientY
        });
    }

    move({ clientX, clientY, pointerId }: Pointer): void {
        const active = this._activePointers.get(pointerId);
        if (null == active) return;

        this._activePointers.set(pointerId, {
            ...active,
            clientX,
            clientY,
        });

        this._update();
    }

    end({ pointerId }: Pick<Pointer, "pointerId">): void {
        this._activePointers.delete(pointerId);
    }

    zoom({ clientX, clientY }: Pick<Pointer, "clientX" | "clientY">, ratio: number): void {
        this._transform[0] *= ratio;
        this._transform[1] *= ratio;
        this._transform[2] *= ratio;
        this._transform[2] += clientX * (1 - ratio);
        this._transform[3] *= ratio;
        this._transform[3] += clientY * (1 - ratio);
        this._update();
    }

    scale(): number {
        const [sc, ss, ..._] = this._transform;
        return Math.sqrt(sc * sc + ss * ss);
    }

    imageToclientXy([x, y]: [number, number]): [number, number] {
        const [sc, ss, tx, ty] = this._transform;
        const [sx, sy] = math.multiply([
            [sc, -ss, tx],
            [ss, +sc, ty],
            [0, 0, 1]
        ], [x, y, 1]) as [number, number, 1];
        return [sx, sy];
    }

    clientToImageXy({ clientX, clientY }: Pick<Pointer, "clientX" | "clientY">): [number, number] {
        const [sc, ss, tx, ty] = this._transform;
        const [x, y, _z] = math.flatten(math.lusolve([
            [sc, -ss, tx],
            [ss, +sc, ty],
            [0, 0, 1],
        ], [clientX, clientY, 1])) as [number, number, 1];
        return [x, y];
    }

    _update(): void {
        const activePointers = Array.from(this._activePointers);
        if (0 === activePointers.length) {
            // No change.
        }
        else if (1 === activePointers.length) {
            const [_id, p] = activePointers[0];

            const [sc, ss, ..._] = this._transform;
            const [tx, ty] = math.subtract(
                [p.clientX, p.clientY],
                math.multiply([
                    [sc, -ss],
                    [ss, +sc],
                ], [p.startX, p.startY])
            );
            this._transform[2] = tx;
            this._transform[3] = ty;
        }
        else {
            const [_idA, a] = activePointers[0];
            const [_idB, b] = activePointers[1];

            // https://math.stackexchange.com/a/2790865/180371
            this._transform = math.flatten(math.lusolve([
                [a.startX, -a.startY, 1, 0],
                [a.startY, +a.startX, 0, 1],
                [b.startX, -b.startY, 1, 0],
                [b.startY, +b.startX, 0, 1],
            ], [a.clientX, a.clientY, b.clientX, b.clientY])) as [number, number, number, number];
        }

        // TODO: check if transform is actually changed?
        this._onUpdate(this._transform);
    }
};
