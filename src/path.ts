import { Dimension } from './data';
import { ScatterView } from './view';

export type PathTransform = (path: ScatterView[], dims: Dimension[]) => ScatterView[];

export function straight(path: ScatterView[]) {
    return path;
}

export function manhattan(path: ScatterView[], dimensions: Dimension[]) {
    const dims = dimensions.map(dim => dim.name);

    const result = [];
    let prevItem;
    for (const item of path) {
        if (prevItem) {
            const x = dims.indexOf(item.x.name);
            const y = dims.indexOf(item.y.name);
            const prevX = dims.indexOf(prevItem.x.name);
            const prevY = dims.indexOf(prevItem.y.name);
            if (x !== prevX && y !== prevY) {
                // if possible, don't cross the diagonal by always picking a point
                // on the same side as (x, y)

                let cornerX = x;
                let cornerY = prevY;
                for (const cx of [x, prevX]) {
                    for (const cy of [y, prevY]) {
                        const overlap = (cx === prevX && cy == prevY) || (cx === x && cy === y);
                        if (overlap) continue;
                        const sideA = x > y && prevX > prevY && cx > cy;
                        const sideB = x < y && prevX < prevY && cx < cy;
                        if (sideA || sideB) {
                            cornerX = cx;
                            cornerY = cy;
                            break;
                        }
                    }
                }

                result.push(new ScatterView(dimensions[cornerX], dimensions[cornerY]));
            }
        }
        result.push(item);
        prevItem = item;
    }
    return result;
}

enum DiagonalBias { Start, End }
function diagonalBiased(path: ScatterView[], dimensions: Dimension[], bias: DiagonalBias) {
    const dims = dimensions.map(dim => dim.name);

    const result = [];
    let prevItem;
    for (const item of path) {
        if (prevItem) {
            const x = dims.indexOf(item.x.name);
            const y = dims.indexOf(item.y.name);
            const prevX = dims.indexOf(prevItem.x.name);
            const prevY = dims.indexOf(prevItem.y.name);

            const dx = x - prevX;
            const dy = y - prevY;

            if (dx && dy && Math.abs(dx) !== Math.abs(dy)) {
                // has partial diagonal component (like _/)
                let diagOffX, diagOffY;
                if (Math.abs(dx) > Math.abs(dy)) {
                    diagOffX = Math.sign(dx) * Math.abs(dy);
                    diagOffY = dy;
                } else {
                    diagOffX = dx;
                    diagOffY = Math.sign(dy) * Math.abs(dx);
                }

                if (bias === DiagonalBias.Start) {
                    const pointX = prevX + diagOffX;
                    const pointY = prevY + diagOffY;
                    result.push(new ScatterView(dimensions[pointX], dimensions[pointY]));
                } else {
                    const pointX = x - diagOffX;
                    const pointY = y - diagOffY;
                    result.push(new ScatterView(dimensions[pointX], dimensions[pointY]));
                }
            }
        }
        result.push(item);
        prevItem = item;
    }
    return result;
}

export function stairs(path: ScatterView[], dims: Dimension[]) {
    // TODO
}

export function diagonalStart(path: ScatterView[], dims: Dimension[]) {
    return diagonalBiased(path, dims, DiagonalBias.Start);
}
export function diagonalEnd(path: ScatterView[], dims: Dimension[]) {
    return diagonalBiased(path, dims, DiagonalBias.End);
}

export function diagonalStairs(path: ScatterView[], dimensions: Dimension[]) {
    const dims = dimensions.map(dim => dim.name);

    const result = [];
    let prevItem;
    for (const item of path) {
        if (prevItem) {
            const x = dims.indexOf(item.x.name);
            const y = dims.indexOf(item.y.name);
            const prevX = dims.indexOf(prevItem.x.name);
            const prevY = dims.indexOf(prevItem.y.name);

            // 0 - horizontal; 1 - vertical
            let orientation = Math.abs(x - prevX) > Math.abs(y - prevY) ? 0 : 1;
            let cursorX = prevX;
            let cursorY = prevY;
            let moves = 0;
            while (cursorX !== x || cursorY !== y) {
                const current = [cursorX, cursorY][orientation];
                const target = [x, y][orientation];
                const possibleMoves = [];
                if (current > 0) possibleMoves.push(-1);
                if (current < dims.length - 1) possibleMoves.push(1);

                if (!possibleMoves.length) break;

                let move = possibleMoves[0];
                for (const potentialMove of possibleMoves) {
                    const currentDist = Math.abs(target - (current + move));
                    const pmDist = Math.abs(target - (current + potentialMove));
                    if (pmDist < currentDist) {
                        move = potentialMove;
                    }
                }

                if (orientation === 0) cursorX += move;
                else cursorY += move;

                if (cursorX === x && cursorY === y) break; // don't duplicate last view
                result.push(new ScatterView(dimensions[cursorX], dimensions[cursorY]));

                orientation ^= 1; // flip orientation to create stairs

                // this algorithm will hopefully always halt, but just in case
                if (moves++ > 1000) break;
            }
        }

        result.push(item);
        prevItem = item;
    }

    return result;
}
