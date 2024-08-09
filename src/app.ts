import interact from 'interactjs';

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
        // var resetTimeout

        interact(gestureArea)
            .gesturable({
                listeners: {
                    start(event) {
                        const tf = inputRepo.checked ? tfRef : tfArea;
                        tf.angle -= event.angle
                    },
                    move(event) {
                        const tf = inputRepo.checked ? tfRef : tfArea;
                        const currentAngle = event.angle + tf.angle;
                        const currentScale = event.scale * tf.scale;
                        tf.dx += 100 * event.dx / window.innerWidth;
                        tf.dy += 100 * event.dy / window.innerWidth;

                        const target = inputRepo.checked ? imgRef : area;
                        target.style.transform = `translate(${tf.dx}svw, ${tf.dy}svw) rotate(${currentAngle}deg) scale(${currentScale})`;
                    },
                    end(event) {
                        const tf = inputRepo.checked ? tfRef : tfArea;
                        tf.angle += event.angle;
                        tf.scale *= event.scale;
                        tf.dx += event.dx;
                        tf.dy += event.dy;
                    }
                }
            })
            .draggable({
                listeners: {
                    move(event) {
                        const tf = inputRepo.checked ? tfRef : tfArea;
                        tf.dx += 100 * event.dx / window.innerWidth;
                        tf.dy += 100 * event.dy / window.innerWidth;

                        const target = inputRepo.checked ? imgRef : area;
                        target.style.transform = `translate(${tf.dx}svw, ${tf.dy}svw) rotate(${tf.angle}deg) scale(${tf.scale})`;
                    }
                }
            });
    }
});
