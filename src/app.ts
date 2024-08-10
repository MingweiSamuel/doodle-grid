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
        const imgBg: HTMLDivElement = document.getElementById('img-bg')! as HTMLDivElement;
        const imgRef: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;

        let transformArea = [1, 0, 0, 0];
        let transformRef = [1, 0, 0, 0];

        const updateTransform = () => {
            {
                const [sc, ss, tx, ty] = transformArea;
                imgBg.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
            }
            {
                const [sc, ss, tx, ty] = transformRef;
                imgRef.style.transform = `${imgBg.style.transform} matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
            }
        };

        let transform = transformArea;

        const inputRepo = document.querySelector('input[type=checkbox][name=input-repo]')! as HTMLInputElement;
        inputRepo.addEventListener('change', _e => {
            transform = inputRepo.checked ? transformRef : transformArea;
        });

        const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;

        type GestureStart = { identifier: number, x: number, y: number };
        const activeGestureStarts: GestureStart[] = [];
        const findActiveGestureIdx = ({ identifier }: { identifier: number }): number => {
            for (let i = 0; i < activeGestureStarts.length; i++) {
                if (identifier === activeGestureStarts[i].identifier) {
                    return i;
                }
            }
            return -1;
        };

        gestureArea.addEventListener('touchstart', event => {
            event.preventDefault();
            for (let i = 0; i < event.changedTouches.length; i++) {
                console.log(transform);
                const { identifier, screenX, screenY } = event.changedTouches[i];
                const [sc, ss, tx, ty] = transform;
                // Un-apply the transformation to the screenX/Y.
                const [x, y, _z] = math.flatten(math.lusolve([
                    [sc, -ss, tx],
                    [ss, +sc, ty],
                    [0, 0, 1],
                ], [screenX, screenY, 1]));
                activeGestureStarts.push({ identifier, x, y } as any);
            }
        });
        gestureArea.addEventListener('touchmove', event => {
            event.preventDefault();

            if (1 === event.touches.length) {
                console.assert(1 === activeGestureStarts.length, activeGestureStarts);
                const st = activeGestureStarts[0];
                const ed = event.touches[0];

                const [sc, ss, ..._] = transform;
                const [tx, ty] = math.subtract(
                    [ed.screenX, ed.screenY],
                    math.multiply([
                        [sc, -ss],
                        [ss, +sc],
                    ], [st.x, st.y])
                );
                transform[2] = tx;
                transform[3] = ty;
            }
            else if (2 === event.touches.length) {
                const ed1 = event.touches[0];
                const ed2 = event.touches[1];
                const st1 = activeGestureStarts[findActiveGestureIdx(ed1)];
                const st2 = activeGestureStarts[findActiveGestureIdx(ed2)];

                // https://math.stackexchange.com/a/2790865/180371
                transform = math.flatten(math.lusolve([
                    [st1.x, -st1.y, 1, 0],
                    [st1.y, +st1.x, 0, 1],
                    [st2.x, -st2.y, 1, 0],
                    [st2.y, +st2.x, 0, 1],
                ], [ed1.screenX, ed1.screenY, ed2.screenX, ed2.screenY])) as number[];
            }
            else {
                console.log('Too many points!');
            }

            if (inputRepo.checked) {
                transformRef = transform;
            } else {
                transformArea = transform;
            }
            updateTransform();
        });
        const touchEnd = (event: TouchEvent) => {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const j = findActiveGestureIdx(event.changedTouches[i])
                if (0 <= j) {
                    activeGestureStarts.splice(j, 1);
                }
                else {
                    console.error('Failed to remove!!!');
                }
            }
        };
        gestureArea.addEventListener('touchcancel', touchEnd);
        gestureArea.addEventListener('touchend', touchEnd);
    }
});
