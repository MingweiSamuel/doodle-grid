import * as math from 'mathjs';

export type Pointer = { pointerId: number, clientX: number, clientY: number };

export default class GestureHandler {
    _activePointers: Map<Number, { startX: number, startY: number, clientX: number, clientY: number }> = new Map();
    _transform: [sc: number, ss: number, tx: number, ty: number] = [1, 0, 0, 0];
    _target: HTMLElement;
    _onUpdate: (_: [sc: number, ss: number, tx: number, ty: number]) => void;

    constructor(onUpdate: (_: [sc: number, ss: number, tx: number, ty: number]) => any, transform?: [number, number, number, number]) {
        this._onUpdate = onUpdate;
        if (null != transform) {
            this.setTransform(transform);
        }
    }

    /// Manually set the transform (for undo/redo);
    setTransform(transform: [sc: number, ss: number, tx: number, ty: number]) {
        this._transform = transform;
        this._update();
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
