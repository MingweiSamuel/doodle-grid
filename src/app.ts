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
        console.log(inputRepo);
        const tfArea = {
            angle: 0,
            scale: 1,
            dx: 0,
            dy: 0,
        }
        const tfRef = {
            angle: 0,
            scale: 1,
            dx: 0,
            dy: 0,
        };
        const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;
        const area: HTMLDivElement = document.getElementById('transform-area')! as HTMLDivElement;
        const imgRef: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;

        // const ongoingTouches = [];
        // gestureArea.addEventListener('touchstart', event => {
        //     event.preventDefault();

        //     for (let i = 0; i < event.changedTouches.length; i++) {
        //         const newTouch = event.changedTouches[i];
        //         ongoingTouches.push(newTouch.identifier);
        //     }
        // });
        // const mat = [
        //     [0, 0, 1, 0],
        //     [0, 0, 0, 1],
        //     [100, -100, 1, 0],
        //     [100, 100, 0, 1],
        // ];
        // const matInv = math.inv(mat);

        // /// a c e
        // /// b d f
        // /// 0 0 1
        // let transformMatrix6 = [1, 0, 0, 1, 0, 0];

        // sc, ss, tx, ty
        // scaled cos, scaled sin, translate x, translate y
        let transform = [1, 0, 0, 0];

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
                const { identifier, pageX, pageY } = event.changedTouches[i];
                const [sc, ss, tx, ty] = transform;
                // Apply the transformation to the pageX/Y.
                const [x, y, _z] = math.flatten(math.lusolve([
                    [sc, -ss, tx],
                    [ss, +sc, ty],
                    [0, 0, 1],
                ], [pageX, pageY, 1]));
                console.log({ x, y, _z });
                // console.log({x, y});
                activeGestureStarts.push({ identifier, x, y } as any);
            }
        });
        gestureArea.addEventListener('touchmove', event => {
            event.preventDefault();

            if (1 === event.touches.length) {
                console.assert(1 === activeGestureStarts.length, activeGestureStarts);
                const s = activeGestureStarts[0];
                const e = event.touches[0];

                // console.log(math.index([[0], [1], [2]], 0));
                // https://math.stackexchange.com/a/2790865/180371
                transform = math.flatten(math.lusolve([
                    [0, 0, 1, 0],
                    [0, 0, 0, 1],
                    [s.x, -s.y, 1, 0],
                    [s.y, +s.x, 0, 1],
                ], [0, 0, e.pageX, e.pageY])) as number[];
            }
            else if (2 === event.touches.length) {
                const e1 = event.touches[0];
                const e2 = event.touches[1];
                const s1 = activeGestureStarts[findActiveGestureIdx(e1)];
                const s2 = activeGestureStarts[findActiveGestureIdx(e2)];

                // https://math.stackexchange.com/a/2790865/180371
                transform = math.flatten(math.lusolve([
                    [s1.x, -s1.y, 1, 0],
                    [s1.y, +s1.x, 0, 1],
                    [s2.x, -s2.y, 1, 0],
                    [s2.y, +s2.x, 0, 1],
                ], [e1.pageX, e1.pageY, e2.pageX, e2.pageY])) as number[];
            }
            else {

            }

            {
                const [sc, ss, tx, ty] = transform;
                imgRef.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
            }
        });
        const touchEnd = (event: TouchEvent) => {
            outer:
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
