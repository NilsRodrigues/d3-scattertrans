import EventEmitter from 'events';
import { BaseType, Selection } from 'd3-selection';
import { DataPoint, Dimension } from '../data';
import { ScatterView, TwoDimensional } from '../view';
import { ScatterTransition, ScatterTransitionType } from '../transitions';
import { Transition } from 'd3-transition';
import { clamp } from '../transitions/util';

/**
 * A scatterplot.
 */
export class Scatterplot extends EventEmitter {
    private _data: DataPoint[] = [];

    // Position and size on drawing area.
    private _x: number = 0;
    private _y: number = 0;
    private _width: number = 200;
    private _height: number = 200;

    // How much padding to add for axes.
    private _axisPaddingTop: number = 0;
    private _axisPaddingLeft: number = 0;
    private _axisPaddingRight: number = 0;
    private _axisPaddingBottom: number = 0;

    /** Current view */
    private _currentView?: ScatterView;
    /** Current transition */
    private _currentTransition?: ScatterTransition;
    private _currentTransitionTime = 0;

    private _playing = false;
    private _playingBackwards = false;
    private _speed = 1;

    //#region builder methods

    x(): number;
    x(value: number): this;
    x(value?: number): this | number {
        if (value !== undefined) {
            this._x = value;
            this.emit('dimensionsChange');
            return this;
        }
        return this._x;
    }

    y(): number;
    y(value: number): this;
    y(value?: number): this | number {
        if (value !== undefined) {
            this._y = value;
            this.emit('dimensionsChange');
            return this;
        }
        return this._y;
    }

    width(): number;
    width(value: number): this;
    width(value?: number): this | number {
        if (value !== undefined) {
            this._width = value;
            this.emit('dimensionsChange');
            return this;
        }
        return this._width;
    }

    height(): number;
    height(value: number): this;
    height(value?: number): this | number {
        if (value !== undefined) {
            this._height = value;
            this.emit('dimensionsChange');
            return this;
        }
        return this._height;
    }

    pos(): [number, number];
    pos(x: number, y: number): this;
    pos(x?: number, y?: number): this | [number, number] {
        if (x !== undefined && y !== undefined) {
            this._x = x;
            this._y = y;
            this.emit('dimensionsChange');
            return this;
        }
        return [this._x, this._y];
    }

    size(): [number, number];
    size(width: number, height: number): this;
    size(width?: number, height?: number): this | [number, number] {
        if (width !== undefined && height !== undefined) {
            this._width = width;
            this._height = height;
            this.emit('dimensionsChange');
            return this;
        }
        return [this._width, this._height];
    }

    rect(x: number, y: number, width: number, height: number): this {
        return this.pos(x, y).size(width, height);
    }

    data(): DataPoint[];
    data(data: DataPoint[]): this;
    data(data?: DataPoint[]) {
        if (data) {
            this._data = data;
            this.emit('dataChange');
            return this;
        }
        return this._data;
    }

    axisPadding(top: number, right: number, bottom: number, left: number): this {
        this._axisPaddingTop = top;
        this._axisPaddingLeft = left;
        this._axisPaddingRight = right;
        this._axisPaddingBottom = bottom;
        this.emit('dimensionsChange');
        return this;
    }

    //#endregion

    //#region views and transitions

    view(): ScatterView;
    view(view: ScatterView): this;
    view(x: Dimension, y: Dimension): this;
    view(x: string | symbol, y: string | symbol, padding?: number): this;
    view(viewOrX?: ScatterView | Dimension | string | symbol, y?: Dimension | string | symbol, padding?: number): this | ScatterView {
        if (viewOrX && viewOrX instanceof ScatterView) {
            this.setCurrentView(viewOrX);
            return this;
        } else if (viewOrX && y) {
            const x = viewOrX;
            const xDim = x instanceof Dimension
                ? x
                : Dimension.fromData(x, this._data, padding);
            const yDim = y instanceof Dimension
                ? y
                : Dimension.fromData(y, this._data, padding);
            this.setCurrentView(new ScatterView(xDim, yDim));
            return this;
        }
        return this.getCurrentView();
    }

    private getCurrentView() {
        if (!this._currentView) {
            if (this._data.length) {
                console.warn('No scatterplot view set! Creating something random. To set a view, use .view(...)');
            }
            const keys = Object.keys(this._data[0] || {});
            const x = keys[0] || 'x';
            const y = keys[1] || 'y';
            this._currentView = new ScatterView(Dimension.fromData(x, this._data), Dimension.fromData(y, this._data));
        }
        return this._currentView;
    }

    private setCurrentView(view: ScatterView) {
        this.clearTransition();
        this._currentView = view;
        this.emit('viewChange');
    }

    /** Returns the current transition, if any. */
    transition(): ScatterTransition | null;
    /**
     * Sets the current transition to the given transition. Note that views must be compatible with
     * the loaded dataset.
     */
    transition(transition: ScatterTransition): this;
    /** Returns a new transition builder for this scatterplot. */
    transition<P>(withType: ScatterTransitionType<P>, andParams: P): ScatterplotTransitionBuilder<P>;
    transition<P>(transitionOrType?: ScatterTransition | ScatterTransitionType<P>, params?: P): ScatterTransition | null | this | ScatterplotTransitionBuilder<P> {
        if (!transitionOrType) return this._currentTransition || null;
        if ('isReady' in transitionOrType) {
            this._currentTransition = transitionOrType;
            this.transitionTime(0);
            this.emit('transitionChange');
            this.updateLastRender();
            return this;
        }
        return new ScatterplotTransitionBuilder(this, transitionOrType, params as P);
    }

    /** Finishes the transition and applies the final view as the current view. */
    finishTransition(): this {
        if (!this._currentTransition) throw new Error('cannot finish transition: no transition loaded');
        const transitionViews = this._currentTransition.views;
        this.setCurrentView(transitionViews[transitionViews.length - 1]);
        return this;
    }

    /** Clears the current transition. */
    clearTransition(): this {
        this._currentTransition = undefined;
        this.emit('transitionChange');
        return this;
    }

    /**
     * Returns the current view as specified by the transition (if the current time happens to
     * land on one), or null.
     */
    getCurrentTransitionView(): ScatterView | null {
        const transition = this.transition();
        if (!transition) return this.getCurrentView();
        if (transition.hasMeaningfulIntermediates) {
            const transitionCount = transition.views.length - 1;
            const viewTime = this._currentTransitionTime * transitionCount;
            const closestView = Math.round(viewTime);
            if (Math.abs(viewTime - closestView) < 1e-2) {
                return transition.views[closestView];
            }
        } else if (Math.abs(this._currentTransitionTime - Math.round(this._currentTransitionTime)) < 1e-2) {
            return transition.views[Math.round(this._currentTransitionTime)];
        }
        return null;
    }

    closestView(): ScatterView {
        const transition = this.transition();
        if (!transition) return this.getCurrentView();
        const transitionCount = transition.views.length - 1;
        const viewTime = this._currentTransitionTime * transitionCount;
        const closestView = Math.round(viewTime);
        return transition.views[closestView];
    }

    /** Used to determine whether effectiveViewChange should be fired. */
    private _prevViewUpdate: ScatterView | null = null;
    /** Current transition time. */
    transitionTime(): number;
    /** Sets the current transition time. */
    transitionTime(time: number): this;
    transitionTime(time?: number): this | number {
        if (typeof time === 'number') {
            this._currentTransitionTime = clamp(time, 0, 1);
            this.emit('transitionTimeUpdate');

            const currentView = this.getCurrentTransitionView();
            if (currentView !== this._prevViewUpdate) {
                this.emit('effectiveViewChange', currentView);
                this._prevViewUpdate = currentView;
            }
            return this;
        }
        return this._currentTransitionTime;
    }

    //#endregion

    /** Returns the X drawing position for a normalized point position. */
    normalizedXToDrawing(x: number): number {
        return this._x + this._axisPaddingLeft + x * (this._width - this._axisPaddingLeft - this._axisPaddingRight);
    }
    /** Returns the Y drawing position for a normalized point position. */
    normalizedYToDrawing(y: number): number {
        return this._y + this._axisPaddingTop + (1 - y) * (this._height - this._axisPaddingTop - this._axisPaddingBottom);
    }
    /** Returns the 2D drawing position for a normalized point position. */
    normalizedToDrawing(position: TwoDimensional<number>): TwoDimensional<number> {
        return {
            x: this.normalizedXToDrawing(position.x),
            y: this.normalizedYToDrawing(position.y)
        };
    }

    /** Returns the normalized point position for an X drawing position. */
    drawingToNormalizedX(x: number): number {
        return (x - this._x - this._axisPaddingLeft) / (this._width - this._axisPaddingLeft - this._axisPaddingRight);
    }
    /** Returns the normalized point position for a Y drawing position. */
    drawingToNormalizedY(y: number): number {
        return (-y - this._y - this._axisPaddingTop) / (this._height - this._axisPaddingTop - this._axisPaddingBottom) + 1;
    }
    /** Returns the normalized point position for a 2D drawing position. */
    drawingToNormalized(position: TwoDimensional<number>): TwoDimensional<number> {
        return {
            x: this.drawingToNormalizedX(position.x),
            y: this.drawingToNormalizedY(position.y)
        };
    }


    /** Returns the domain point position for a normalized X point position */
    normalizedToDomainX(x: number): number {
        let view = this.getCurrentTransitionView();
        if (!(view instanceof ScatterView)) {
            throw "Can't map between domain and normalized coordinates without a view.";
        }
        return view.x.expand(x);
    }
    /** Returns the domain point position for a normalized Y point position */
    normalizedToDomainY(y: number): number {
        let view = this.getCurrentTransitionView();
        if (!(view instanceof ScatterView)) {
            throw "Can't map between domain and normalized coordinates without a view.";
        }
        return view.y.expand(y);
    }
    /** Returns the domain point position for a normalized 2D point position */
    normalizedToDomain(position: TwoDimensional<number>): TwoDimensional<number> {
        let view = this.getCurrentTransitionView();
        if (!(view instanceof ScatterView)) {
            throw "Can't map between domain and normalized coordinates without a view.";
        }
        return {
            x: view.x.expand(position.x),
            y: view.y.expand(position.y)
        };
    }

    /** Returns the domain point position for an X drawing position */
    drawingToDomainX(x: number): number {
        return this.normalizedToDomainX(this.drawingToNormalizedX(x));
    }
    /** Returns the domain point position for a Y drawing position */
    drawingToDomainY(y: number): number {
        return this.normalizedToDomainY(this.drawingToNormalizedY(y));
    }
    /** Returns the domain point position for a 2D drawing position */
    drawingToDomain(position: TwoDimensional<number>): TwoDimensional<number> {
        return this.normalizedToDomain(this.drawingToNormalized(position));
    }

    /** Returns the current normalized X position of the given data point. */
    dataPointX(dataPoint: DataPoint): number {
        if (this._currentTransition && this._currentTransition.isReady) {
            return this._currentTransition.getX(this._currentTransitionTime, dataPoint);
        }
        return this.getCurrentView().getX(dataPoint);
    }
    /** Returns the current normalized Y position of the given data point. */
    dataPointY(dataPoint: DataPoint): number {
        if (this._currentTransition && this._currentTransition.isReady) {
            return this._currentTransition.getY(this._currentTransitionTime, dataPoint);
        }
        return this.getCurrentView().getY(dataPoint);
    }

    /** The circle selection created with createCircles. Used to update the view. */
    private _circles?: Selection<SVGCircleElement, DataPoint, any, any>;

    /**
     * Returns the new selection of circles.
     * @param container the container
     */
    createCircles = <G extends BaseType, D, P extends BaseType, PD>(container: Selection<G, D, P, PD>) => {
        // empty existing content
        container.selectAll('.d3st-data').remove();
        // create new circles
        return this._circles = container
            .selectAll('.d3st-data')
            .data(this._data)
            .enter()
            .append('circle')
            .attr('class', 'd3st-data')
            .attr('r', 1)
            .style('fill', 'black')
            .call(this.updateCircles);
    }

    /**
     * Updates a previously created selection of circles.
     * @param circles the selection of circles
     */
    updateCircles = <P extends BaseType, PD>(circles: Selection<SVGCircleElement, DataPoint, P, PD>) => {
        return circles
            .attr('cx', dataPoint => this.normalizedXToDrawing(this.dataPointX(dataPoint)).toString())
            .attr('cy', dataPoint => this.normalizedYToDrawing(this.dataPointY(dataPoint)).toString());
    }

    /**
     * Transitions a previously created selection of circles with the given D3 transition.
     * Note that this will not interact with transitionTime.
     *
     * @param circles the selection of circles
     */
    transitionCircles = <P extends BaseType, PD>(circles: Transition<SVGCircleElement, DataPoint, P, PD>) => {
        if (!this._currentTransition) throw new Error('cannot transition: no transition loaded');
        if (!this._currentTransition.isReady) throw new Error('cannot transition: transition is not ready. call ScatterTransition#prepare() first');
        const transition = this._currentTransition;
        return circles
            .attrTween('cx', (dataPoint) => t => this.normalizedXToDrawing(transition.getX(t, dataPoint)).toString())
            .attrTween('cy', (dataPoint) => t => this.normalizedYToDrawing(transition.getY(t, dataPoint)).toString());
    }

    /**
     * Updates the last rendered dataset with the new view.
     */
    updateLastRender() {
        this._circles?.call(this.updateCircles);
    }

    //#region playback

    /** Returns the current transition speed. */
    speed(): number;
    /** Sets the transition speed. */
    speed(value: number): this;
    speed(value?: number): this | number {
        if (typeof value === 'number') {
            this._speed = value;
            this.emit('speedChange', value);
            return this;
        }
        return this._speed;
    }

    private _lastFrameTime = 0;

    /** Returns whether the slider is currently playing a transition. */
    playing(): boolean;
    /** Sets whether the slider is currently playing a transition. */
    playing(value: boolean, backwards?: boolean): this;
    playing(value?: boolean, backwards = false): this | boolean {
        if (value !== undefined) {
            if (this._playing === value) return this;

            this._playing = value;
            if (this._playing) {
                this._lastFrameTime = Date.now();
                this._playingBackwards = backwards;
                this.playbackFrame();

                this.emit('play');
            } else {
                this._playingBackwards = false;
                this.emit('pause');
            }

            return this;
        }
        return this._playing;
    }

    playingBackwards() {
        return this._playingBackwards;
    }

    /** Toggles playback. */
    togglePlayback = () => {
        this.playing(!this.playing());
    }

    private playbackFrame = () => {
        if (!this._playing) return;

        const transition = this.transition();
        if (!transition) {
            this.playing(false);
            return;
        }

        const deltaTime = (Date.now() - this._lastFrameTime) / 1000;
        this._lastFrameTime = Date.now();

        const transitionCount = transition.views.length - 1;
        const direction = this._playingBackwards ? -1 : 1;
        const newTime = this.transitionTime() + this._speed * direction * deltaTime / transitionCount;
        this.transitionTime(newTime);
        this.updateLastRender();

        const shouldStop = (direction * this._speed) > 0 ? newTime >= 1 : newTime <= 0;
        if (shouldStop) requestAnimationFrame(() => this.playing(false));
        else requestAnimationFrame(this.playbackFrame);
    }

    //#endregion
}

/**
 * Builds a scatterplot transition.
 */
class ScatterplotTransitionBuilder<P extends {}> {
    constructor(private plot: Scatterplot, private type: ScatterTransitionType<P>, private params: P) {}
    private views: ScatterView[] = [];
    /** Adds a new stage transitioning to the given view. The view must be compatible with the dataset. */
    toView(view: ScatterView): this;
    /** Adds a new stage transitioning to the given X and Y dimensions. The dimensions must be present in the dataset */
    toView(x: Dimension, y: Dimension): this;
    /** Adds a new stage transitioning to the given X and Y dimension names. Optionally adds padding. */
    toView(x: string | symbol, y: string | symbol, padding?: number): this;
    toView(viewOrX: ScatterView | Dimension | string | symbol, y?: Dimension | string | symbol, padding?: number): this {
        if (viewOrX instanceof ScatterView) {
            this.views.push(viewOrX);
        } else {
            if (!y) throw new Error('Missing dimension Y');
            const xDim = viewOrX instanceof Dimension
                ? viewOrX
                : Dimension.fromData(viewOrX, this.plot.data(), padding);
            const yDim = y instanceof Dimension
                ? y
                : Dimension.fromData(y, this.plot.data(), padding);
            this.views.push(new ScatterView(xDim, yDim));
        }
        return this;
    }
    /**
     * Adds a new transition stage transitioning to the given X dimension, while keeping the Y
     * dimension.
     */
    toX(x: Dimension): this;
    /**
     * Adds a new transition stage transitioning to the given X dimension name, while keeping the
     * Y dimension. Optionally adds padding to the X dimension.
     */
    toX(x: string | symbol, padding?: number): this;
    toX(x: Dimension | string | symbol, padding?: number): this {
        const lastView = this.views[this.views.length - 1] || this.plot.view();
        const xDim = x instanceof Dimension ? x : Dimension.fromData(x, this.plot.data(), padding);
        this.views.push(new ScatterView(xDim, lastView.y));
        return this;
    }
    toY(y: Dimension): this;
    /**
     * Adds a new transition stage transitioning to the given Y dimension name, while keeping the
     * X dimension. Optionally adds padding to the Y dimension.
     */
    toY(y: string | symbol, padding?: number): this;
    toY(y: Dimension | string | symbol, padding?: number): this {
        const lastView = this.views[this.views.length - 1] || this.plot.view();
        const yDim = y instanceof Dimension ? y : Dimension.fromData(y, this.plot.data(), padding);
        this.views.push(new ScatterView(lastView.x, yDim));
        return this;
    }
    /** Adds several new stages transitioning to each of the given views. */
    toViews(views: ScatterView[]): this {
        this.views.push(...views);
        return this;
    }
    /**
     * Builds and prepares the transition.
     * When done, the transition will be loaded into the owner scatterplot.
     */
    async build(): Promise<Scatterplot> {
        // typescript doesn't like this assignment for some reason
        // @ts-ignore
        this.params = this.params || {};
        // automatically provide data to transitions
        // @ts-ignore
        this.params.data = this.plot.data();
        const transition = this.plot.closestView().transitionTo(this.type, this.params, ...this.views);
        await transition.prepare();
        return this.plot.transition(transition);
    }
}

/**
 * Creates a new scatterplot.
 */
export function scatterplot() {
    return new Scatterplot();
}
