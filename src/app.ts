import * as math from 'mathjs';

document.addEventListener("DOMContentLoaded", function (_event) {
    {
        const buttonFs: HTMLButtonElement = document.getElementById('button-fs')! as HTMLButtonElement;
        buttonFs.addEventListener('click', _e => {
            document.body.requestFullscreen({
                navigationUI: 'hide',
            });
        });
    }

    {
        const inputBg: HTMLInputElement = document.querySelector('input[type=file][name=input-bg]')! as HTMLInputElement;
        const imgBg: HTMLImageElement = document.getElementById('img-bg')! as HTMLImageElement;
        inputBg.addEventListener('change', _e => {
            const file = inputBg.files?.[0];
            if (file) {
                imgBg.src = URL.createObjectURL(file)
            }
        });
    }

    {
        const inputRef: HTMLInputElement = document.querySelector('input[type=file][name=input-ref]')! as HTMLInputElement;
        const imgRef: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;
        inputRef.addEventListener('change', _e => {
            const file = inputRef.files?.[0];
            if (file) {
                imgRef.src = URL.createObjectURL(file)
            }
        });

        const inputOpacity: HTMLInputElement = document.querySelector('input[type=range][name=input-opacity]')! as HTMLInputElement;
        const updateOpacity = (): void => {
            imgRef.style.opacity = `${inputOpacity.value}%`;
        };
        inputOpacity.addEventListener('input', updateOpacity);
        updateOpacity();
    }

    {
        const inputRepo = document.querySelector('input[type=checkbox][name=input-repo]')! as HTMLInputElement;
        const ghBg = new GestureHandler(document.getElementById('img-bg')!);
        const ghRf = new GestureHandler(document.getElementById('img-ref')!);
        const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;
        gestureArea.addEventListener('touchstart', event => {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const pointer = event.changedTouches[i];
                if (!inputRepo.checked) ghBg.start(pointer);
                ghRf.start(pointer);
            }
        });
        gestureArea.addEventListener('touchmove', event => {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const pointer = event.changedTouches[i];
                if (!inputRepo.checked) ghBg.move(pointer);
                ghRf.move(pointer);
            }
        });
        const touchEnd = (event: TouchEvent) => {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const pointer = event.changedTouches[i];
                if (!inputRepo.checked) ghBg.end(pointer);
                ghRf.end(pointer);
            }
        };
        gestureArea.addEventListener('touchcancel', touchEnd);
        gestureArea.addEventListener('touchend', touchEnd);
    }
});

type Pointer = { identifier: number, screenX: number, screenY: number };

class GestureHandler {
    _activePointers: Map<Number, { startX: number, startY: number, screenX: number, screenY: number }> = new Map();
    _transform: [number, number, number, number] = [1, 0, 0, 0];
    _target: HTMLElement;

    constructor(transformTarget: HTMLElement) {
        this._target = transformTarget;
    }

    start({ screenX, screenY, identifier }: Pointer): void {
        const [sc, ss, tx, ty] = this._transform;
        const [startX, startY, _z] = math.flatten(math.lusolve([
            [sc, -ss, tx],
            [ss, +sc, ty],
            [0, 0, 1],
        ], [screenX, screenY, 1])) as [number, number, 1];
        this._activePointers.set(identifier, {
            startX, startY, screenX, screenY
        });
    }

    move({ screenX, screenY, identifier }: Pointer): void {
        const active = this._activePointers.get(identifier);
        if (null == active) return;

        this._activePointers.set(identifier, {
            ...active,
            screenX,
            screenY,
        });

        this._update();
    }

    end({ identifier }: Pointer): void {
        if (!this._activePointers.delete(identifier)) {
            console.error('Failed to remove activePointer with identifier:', identifier);
        }
    }

    _update(): void {
        const activePointers = Array.from(this._activePointers);
        if (0 === activePointers.length) {
            return;
        }
        else if (1 === activePointers.length) {
            const [_id, p] = activePointers[0];

            // Reference.
            const [sc, ss, ..._] = this._transform;
            const [tx, ty] = math.subtract(
                [p.screenX, p.screenY],
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
            // const ed1 = event.touches[0];
            // const ed2 = event.touches[1];
            // const st1 = activeGestureStarts.get(ed1.identifier)!;
            // const st2 = activeGestureStarts.get(ed2.identifier)!;
            // console.assert(null != st1);
            // console.assert(null != st2);

            this._transform = math.flatten(math.lusolve([
                [a.startX, -a.startY, 1, 0],
                [a.startY, +a.startX, 0, 1],
                [b.startX, -b.startY, 1, 0],
                [b.startY, +b.startX, 0, 1],
            ], [a.screenX, a.screenY, b.screenX, b.screenY])) as [number, number, number, number];
        }

        // TODO: check if transform is actually changed?
        const [sc, ss, tx, ty] = this._transform;
        this._target.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
    }
};
