import interact from 'interactjs';

document.addEventListener("DOMContentLoaded", function (_event) {
    const buttonFs: HTMLButtonElement = document.getElementById('button-fs')! as HTMLButtonElement;
    buttonFs.addEventListener('click', _e => {
        document.body.requestFullscreen({
            navigationUI: "hide",
        });
    });

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
        const angleScale = {
            angle: 0,
            scale: 1,
            dx: 0,
            dy: 0,
        };
        const gestureArea: HTMLDivElement = document.getElementById('gesture-area')! as HTMLDivElement;
        const scaleElement: HTMLImageElement = document.getElementById('img-ref')! as HTMLImageElement;
        // var resetTimeout

        interact(gestureArea)
            .gesturable({
                listeners: {
                    start(event) {
                        angleScale.angle -= event.angle
                    },
                    move(event) {
                        // document.body.appendChild(new Text(event.scale))
                        const currentAngle = event.angle + angleScale.angle;
                        const currentScale = event.scale * angleScale.scale;
                        const currentX = event.dx + angleScale.dx;
                        const currentY = event.dy + angleScale.dy;

                        scaleElement.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${currentAngle}deg) scale(${currentScale})`;
                        // 'rotate(' + currentAngle + 'deg)' + 'scale(' + currentScale + ')' + trabn

                        // // uses the dragMoveListener from the draggable demo above
                        // dragMoveListener(event, scaleElement);


                    },
                    end(event) {
                        angleScale.angle += event.angle;
                        angleScale.scale *= event.scale;
                        angleScale.dx += event.dx;
                        angleScale.dy += event.dy;
                    }
                }
            })
            .draggable({
                listeners: {
                    move(event) {
                        angleScale.dx += event.dx;
                        angleScale.dy += event.dy;

                        scaleElement.style.transform = `translate(${angleScale.dx}px, ${angleScale.dy}px) rotate(${angleScale.angle}deg) scale(${angleScale.scale})`;
                    }
                }
            });
    }
});

// function dragMoveListener(event: any, scaleElement: HTMLElement) {
//     // keep the dragged position in the data-x/data-y attributes
//     var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
//     var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

//     // translate the element
//     target.style.transform = 'translate(' + x + 'px, ' + y + 'px)'

//     // update the posiion attributes
//     target.setAttribute('data-x', x)
//     target.setAttribute('data-y', y)
// }
