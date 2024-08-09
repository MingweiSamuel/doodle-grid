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
        const mat = [
            [0, 0, 1, 0],
            [0, 0, 0, 1],
            [100, -100, 1, 0],
            [100, 100, 0, 1],
        ];
        const matInv = math.inv(mat);

        gestureArea.addEventListener('touchmove', event => {
            event.preventDefault();
            if (1 !== event.touches.length) return;

            // const tl = event.touches[0];
            // const br = event.touches[1] || { pageX: tl.pageX + 100, pageY: tl.pageY + 100 };
            const tl = { pageX: 0, pageY: 0 };
            const br = event.touches[0];

            // https://math.stackexchange.com/a/2790865/180371
            const [sc, ss, tx, ty] = math.multiply(matInv, [tl.pageX, tl.pageY, br.pageX, br.pageY]);
            console.log({sc, ss, tx, ty});

            imgRef.style.transform = `matrix(${sc}, ${ss}, ${-ss}, ${sc}, ${tx}, ${ty})`;
            // console.log(out);
        });
    }
});
