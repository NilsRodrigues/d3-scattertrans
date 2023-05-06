import { ScatterTransition, ScatterTransitionParams } from './base';
import { ScatterView } from '../view';
import { DataPoint } from '../data';
import { lerp } from './util';

export class StraightTransition implements ScatterTransition {
    static requiresCommonDimensions = false;
    static canSwapDimensions = true;
    static params: ScatterTransitionParams<{}> = {};

    constructor(public views: ScatterView[]) {}

    hasMeaningfulIntermediates = true;
    isReady = true;
    async prepare() {}

    getX(t: number, point: DataPoint) {
        t *= this.views.length - 1;
        const startView = this.views[Math.floor(t)];
        const endView = this.views[Math.floor(t + 1)] || startView;
        return lerp(startView.getX(point), endView.getX(point), t - Math.floor(t));
    }
    getY(t: number, point: DataPoint) {
        t *= this.views.length - 1;
        const startView = this.views[Math.floor(t)];
        const endView = this.views[Math.floor(t + 1)] || startView;
        return lerp(startView.getY(point), endView.getY(point), t - Math.floor(t));
    }
}
