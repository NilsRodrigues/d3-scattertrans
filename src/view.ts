import { DataPoint, Dimension } from './data';
import { ScatterTransitionType } from './transitions';

export interface TwoDimensional<Type> {
    x: Type;
    y: Type;
}

/**
 * Represents a view of two data dimensions as a scatter plot.
 */
export class ScatterView {
    constructor (public x: Dimension, public y: Dimension) {}

    /** Returns the normalized X position of a point (in 0..1). */
    getX(point: DataPoint) {
        return this.x.normalize(point[this.x.name]);
    }

    /** Returns the normalized Y position of a point (in 0..1). */
    getY(point: DataPoint) {
        return this.y.normalize(point[this.y.name]);
    }

    toString() {
        return `ScatterView(x: ${this.x.name.toString()}, y: ${this.y.name.toString()})`;
    }

    /**
    * Checks whether this view can be transitioned to the given view with the given transition.
    * If not, this function will throw an error.
    */
    validateTransitionTo<P>(view: ScatterView, withType: ScatterTransitionType<P>) {
        const transType = withType;
        if (transType.requiresCommonDimensions) {
            if (!this.x.eq(view.x) && !this.x.eq(view.y) && !this.y.eq(view.x) && !this.y.eq(view.y)) {
                throw new Error(`cannot transitions between view ${this.toString()} and ${view.toString()} with ${transType.name}: no common dimensions`);
            }
        }
        if (!transType.canSwapDimensions) {
            if (this.x.eq(view.y) || this.y.eq(view.x)) {
                throw new Error(`cannot transitions between view ${this.toString()} and ${view.toString()} with ${transType.name}: swapping is not supported`);
            }
        }
    }

    /**
     * Transitions this view with the given transition type and parameters to the last view across
     * all intermediate views.
     *
     * @param withType the transition type
     * @param params parameters for the transition
     * @param views intermediate views and a final view. The final view is required
     */
    transitionTo<P>(withType: ScatterTransitionType<P>, params: P, ...views: ScatterView[]) {
        if (!views.length) throw new Error('cannot transition to nothing');
        const transType = withType;
        const transitionViews = [this, ...views];
        for (let i = 0; i < transitionViews.length - 1; i++) {
            transitionViews[i].validateTransitionTo(transitionViews[i + 1], transType);
        }
        return new transType(transitionViews, params);
    }
}
