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
        const imgRf: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;

        let transformBg = [1, 0, 0, 0];
        let transformRf = [1, 0, 0, 0];

        const updateTransform = () => {
            const svw = 100 / window.innerWidth;
            {
                const [sc, ss, tx, ty] = transformBg;
                imgBg.style.transform = `translate(${svw * tx}svw, ${svw * ty}svw) matrix(${sc}, ${ss}, ${-ss}, ${sc}, 0, 0)`;
                console.log(imgBg.style.transform);
            }
            {
                const [sc, ss, tx, ty] = transformRf;
                imgRf.style.transform = `translate(${svw * tx}svw, ${svw * ty}svw) matrix(${sc}, ${ss}, ${-ss}, ${sc}, 0, 0)`;
            }
        };

        const inputRepo = document.querySelector('input[type=checkbox][name=input-repo]')! as HTMLInputElement;

        type GestureStart = { identifier: number, bgX: number, bgY: number, rfX: number, rfY: number };
        const activeGestureStarts: GestureStart[] = [];
        const findActiveGestureIdx = ({ identifier }: { identifier: number }): number => {
            for (let i = 0; i < activeGestureStarts.length; i++) {
                if (identifier === activeGestureStarts[i].identifier) {
                    return i;
                }
            }
            return -1;
        };

        const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;
        gestureArea.addEventListener('touchstart', event => {
            event.preventDefault();
            for (let i = 0; i < event.changedTouches.length; i++) {
                const { identifier, screenX, screenY } = event.changedTouches[i];

                // Un-apply the transformation to the screenX/Y.

                // Background.
                let [sc, ss, tx, ty] = transformBg;
                const [bgX, bgY, _bgZ] = math.flatten(math.lusolve([
                    [sc, -ss, tx],
                    [ss, +sc, ty],
                    [0, 0, 1],
                ], [screenX, screenY, 1]));

                // Reference image.
                ([sc, ss, tx, ty] = transformRf);
                const [rfX, rfY, _rfZ] = math.flatten(math.lusolve([
                    [sc, -ss, tx],
                    [ss, +sc, ty],
                    [0, 0, 1],
                ], [screenX, screenY, 1]));

                activeGestureStarts.push({ identifier, bgX, bgY, rfX, rfY } as any);
            }
        });
        gestureArea.addEventListener('touchmove', event => {
            event.preventDefault();

            if (1 === event.touches.length) {
                console.assert(1 === activeGestureStarts.length, activeGestureStarts);
                const st = activeGestureStarts[0];
                const ed = event.touches[0];

                if (!inputRepo.checked) {
                    // Background.
                    const [sc, ss, ..._] = transformBg;
                    const [tx, ty] = math.subtract(
                        [ed.screenX, ed.screenY],
                        math.multiply([
                            [sc, -ss],
                            [ss, +sc],
                        ], [st.bgX, st.bgY])
                    );
                    transformBg[2] = tx;
                    transformBg[3] = ty;
                }

                {
                    // Reference.
                    const [sc, ss, ..._] = transformRf;
                    const [tx, ty] = math.subtract(
                        [ed.screenX, ed.screenY],
                        math.multiply([
                            [sc, -ss],
                            [ss, +sc],
                        ], [st.rfX, st.rfY])
                    );
                    transformRf[2] = tx;
                    transformRf[3] = ty;
                }
            }
            else if (2 === event.touches.length) {
                const ed1 = event.touches[0];
                const ed2 = event.touches[1];
                const st1 = activeGestureStarts[findActiveGestureIdx(ed1)];
                const st2 = activeGestureStarts[findActiveGestureIdx(ed2)];

                // https://math.stackexchange.com/a/2790865/180371
                if (!inputRepo.checked) {
                    transformBg = math.flatten(math.lusolve([
                        [st1.bgX, -st1.bgY, 1, 0],
                        [st1.bgY, +st1.bgX, 0, 1],
                        [st2.bgX, -st2.bgY, 1, 0],
                        [st2.bgY, +st2.bgX, 0, 1],
                    ], [ed1.screenX, ed1.screenY, ed2.screenX, ed2.screenY])) as number[];
                }

                {
                    transformRf = math.flatten(math.lusolve([
                        [st1.rfX, -st1.rfY, 1, 0],
                        [st1.rfY, +st1.rfX, 0, 1],
                        [st2.rfX, -st2.rfY, 1, 0],
                        [st2.rfY, +st2.rfX, 0, 1],
                    ], [ed1.screenX, ed1.screenY, ed2.screenX, ed2.screenY])) as number[];

                }
            }
            else {
                console.log('Too many points!');
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
