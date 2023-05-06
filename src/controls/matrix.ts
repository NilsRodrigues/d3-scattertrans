import { create, Selection, BaseType } from 'd3-selection';
import { easeExpInOut, easeExpOut } from 'd3-ease';
import EventEmitter from 'events';
import { Scatterplot } from './scatterplot';
import { ScatterView } from '../view';
import { DataPoint, Dimension } from '../data';
import {
    ScatterTransitionType,
    ScatterTransition,
    ScatterTransitionParams,
    STParam
} from '../transitions/base';
import { StraightTransition } from '../transitions/straight';
import { RotationTransition } from '../transitions/rotation';
import { SplineTransition } from '../transitions/spline';
import { PathTransform, straight, manhattan, diagonalStart, diagonalEnd, diagonalStairs } from '../path';

export class ScatterplotMatrix extends EventEmitter {
    private _data: DataPoint[] = [];
    private _dimensions: Dimension[] = [];
    private _transition?: ScatterTransition;
    private _plot?: Scatterplot;

    private _container: Selection<HTMLDivElement, undefined, null, undefined>;
    private _svgContainer: Selection<SVGSVGElement, undefined, null, undefined>;
    private _matrixPlotsCtx: CanvasRenderingContext2D;
    private _matrixCells: MatrixCells;
    private _transPath: TransitionPath;
    private _transBuilder: TransitionBuilder;

    private _width = 200;
    private _height = 200;
    private _labelPadding = 20;
    private _canvasScale = 1;
    private _rotateLabels = false;

    constructor() {
        super();
        this._container = create('div')
            .attr('class', 'd3st-scatterplot-matrix')
            .style('display', 'inline-block');

        this._svgContainer = this._container.append('svg')
            .attr('class', 'd3st-inner-plot')
            .style('overflow', 'visible');

        this._svgContainer.append('g').attr('class', 'd3st-plot-axis d3st-plot-axis-top');
        this._svgContainer.append('g').attr('class', 'd3st-plot-axis d3st-plot-axis-left');
        this._svgContainer.selectAll('.d3st-plot-axis')
            .attr('font-family', 'sans-serif')
            .attr('font-size', '10');

        this._matrixPlotsCtx = (this._svgContainer
            .append('foreignObject')
            .attr('class', 'd3st-plot-canvas-container')
            .style('pointer-events', 'none')
            .append('xhtml:canvas')
            .attr('class', 'd3st-plot-canvas')
            .node()! as HTMLCanvasElement)
            .getContext('2d')!;

        this._transPath = new TransitionPath();
        this._svgContainer.node()!.appendChild(this._transPath.node.node()!);

        this._transBuilder = new TransitionBuilder();
        this._container.node()!.appendChild(this._transBuilder.node());
        this._svgContainer.node()!.appendChild(this._transBuilder.path.node.node()!);

        this._matrixCells = new MatrixCells();
        this._svgContainer.node()!.appendChild(this._matrixCells.cells.node()!);

        this._matrixCells.on('select', (x, y) => this._transBuilder.onSelect(x, y));
        this._transBuilder.on('beginBuild', () => {
            this._matrixCells.transitionBuilderDidBegin();
            this._transPath.setVisible(false);
        });
        this._transBuilder.on('endBuild', (didCommit: boolean) => {
            this._matrixCells.transitionBuilderDidEnd();
            this._transPath.forceClear();
            if (!didCommit) this._transPath.renderPaths();
            this._transPath.setVisible(true);
        });
        this._transBuilder.on('transition', (transition) => {
            this._transPath.forceClear();
            setTimeout(() => {
                this._plot?.transition(transition);
                this._plot?.playing(true);
                this.render();
            }, 0);
        });
        this._transBuilder.on('createTransition', (transition, isRebuild) => {
            const time = this._plot?.transitionTime();
            this._plot?.transition(transition);
            if (isRebuild) {
                // keep time
                this._plot?.transitionTime(time!)?.updateLastRender();
            }
        });
    }

    node(): HTMLDivElement {
        return this._container.node()!;
    }

    size(): [number, number];
    size(widthAndHeight: number): this;
    size(width: number, height: number): this;
    size(width?: number, height?: number): this | [number, number] {
        if (typeof width === 'number') {
            this._width = width;
            this._height = typeof height === 'number' ? height : width;
            this.setDirty();
            return this;
        }
        return [this._width, this._height];
    }

    data(): DataPoint[];
    data(data: DataPoint[]): this;
    data(data?: DataPoint[]): this | DataPoint[] {
        if (data) {
            this._data = data;
            this.setDirty();
            return this;
        }
        return this._data;
    }

    dimensions(): Dimension[];
    dimensions(dimensions: Dimension[]): this;
    dimensions(dimensions?: Dimension[]): this | Dimension[] {
        if (dimensions) {
            this._dimensions = dimensions;
            this.setDirty();
            return this;
        }
        return this._dimensions;
    }

    private _dirtyRerenderTimeout = -1;
    setDirty() {
        clearTimeout(this._dirtyRerenderTimeout);
        this._dirtyRerenderTimeout = window.setTimeout(() => {
            this.render();
        }, 50);
    }

    render() {
        this._svgContainer
            .attr('width', this._width)
            .attr('height', this._height);

        this._matrixCells.width = this._width - this._labelPadding;
        this._matrixCells.height = this._height - this._labelPadding;
        this._matrixCells.cells.attr('transform', `translate(${this._labelPadding}, ${this._labelPadding})`);
        this._matrixCells.dimensions = this._dimensions;

        const handlePath = (path: TransitionPath) => {
            path.node.attr('transform', `translate(${this._labelPadding}, ${this._labelPadding})`);
            path.plotWidth = this._width - this._labelPadding;
            path.plotHeight = this._height - this._labelPadding;
            path.dimensions = this._dimensions;
        };
        handlePath(this._transPath);
        handlePath(this._transBuilder.path);

        this._transPath.views = this._transition?.views;
        this._transBuilder.data = this._data;
        this._transBuilder.dimensions = this._dimensions;
        this._transBuilder.plot = this._plot;

        this._matrixCells.render();
        this._transPath.renderPaths();
        this.renderAxes();
        this.drawPlots();
        this.renderCurrentView();
    }

    transBuilder(): TransitionBuilder {
        return this._transBuilder;
    }

    rotateLabels(): boolean;
    rotateLabels(rotate: boolean): this;
    rotateLabels(rotate?: boolean): this | boolean {
        if (typeof rotate === 'boolean') {
            this._rotateLabels = rotate;
            this._container.selectAll('.axis-label').remove();
            this.renderAxes();
            return this;
        }
        return this._rotateLabels;
    }

    renderAxes() {
        const cellSizeX = (this._width - this._labelPadding) / this._dimensions.length;
        const cellSizeY = (this._height - this._labelPadding) / this._dimensions.length;

        const color = getComputedStyle(this.node()).color;

        const top = this._container.select('.d3st-plot-axis-top')
            .attr('transform', `translate(${this._labelPadding},${this._labelPadding})`)
            .attr('text-anchor', 'start')
            .selectAll('.axis-label')
            .data(this._dimensions)
            .attr('x', (dim, idx) => idx * cellSizeX)
            .text(dim => dim.name.toString())
            .call(sel => sel.exit().remove())
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('dominant-baseline', 'text-bottom')
            .style('fill', 'currentColor')
            .attr('dy', '-5')
            .attr('x', (dim, idx) => idx * cellSizeX)
            .text(dim => dim.name.toString());

        const left = this._container.select('.d3st-plot-axis-left')
            .attr('transform', `translate(${this._labelPadding},${this._labelPadding}) rotate(-90)`)
            .attr('text-anchor', 'end')
            .selectAll('.axis-label')
            .data(this._dimensions)
            .attr('x', (dim, idx) => -(this._height - this._labelPadding)
                  + (this._dimensions.length - idx) * cellSizeY)
            .text(dim => dim.name.toString())
            .call(sel => sel.exit().remove())
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('dominant-baseline', 'text-bottom')
            .attr('x', (dim, idx) => -(this._height - this._labelPadding)
                  + (this._dimensions.length - idx) * cellSizeY)
            .attr('dy', '-5')
            .style('fill', 'currentColor')
            .text(dim => dim.name.toString());

        if (this._rotateLabels) {
            top.attr('transform', (dim, idx) => `rotate(-45, ${(idx + 0.3) * cellSizeX}, -10)`);
            left.attr('transform', (dim, idx) => `rotate(90, ${-(idx + 0.3) * cellSizeY}, -10)`);
        }
    }

    drawPlots() {
        const width = this._width - this._labelPadding;
        const height = this._height - this._labelPadding;
        this._canvasScale = Math.ceil(window.devicePixelRatio);

        this._container.select('.d3st-plot-canvas-container')
            .attr('x', this._labelPadding)
            .attr('y', this._labelPadding)
            .attr('width', width)
            .attr('height', height);

        this._container.select('.d3st-plot-canvas')
            .attr('width', width * this._canvasScale)
            .attr('height', height * this._canvasScale)
            .style('width', width + 'px')
            .style('height', height + 'px');
        const ctx = this._matrixPlotsCtx;
        ctx.save();
        ctx.scale(this._canvasScale, this._canvasScale);
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = ctx.strokeStyle = getComputedStyle(this.node()).color;

        const cellSizeX = width / this._dimensions.length;
        const cellSizeY = height / this._dimensions.length;

        // background grid
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.rect(0.5, 0.5, width - 1, height - 1);
        for (let i = 1; i < this._dimensions.length; i++) {
            ctx.moveTo(i * cellSizeX, 0);
            ctx.lineTo(i * cellSizeX, height);
            ctx.moveTo(0, i * cellSizeY);
            ctx.lineTo(width, i * cellSizeY);
        }
        ctx.stroke();
        ctx.restore();

        // individual scatterplots
        for (let y = 0; y < this._dimensions.length; y++) {
            for (let x = 0; x < this._dimensions.length; x++) {
                const view = new ScatterView(this._dimensions[x], this._dimensions[y]);

                ctx.beginPath();

                for (const point of this._data) {
                    const pointX = view.getX(point);
                    const pointY = view.getY(point);

                    // don't draw out of bounds points because they would overlap with adjacent cells
                    if (pointX < 0 || pointY < 0 || pointX > 1 || pointY > 1) continue;

                    const screenX = (x + pointX) * cellSizeX;
                    const screenY = (y + 1 - pointY) * cellSizeY;
                    ctx.moveTo(screenX, screenY);
                    ctx.arc(screenX, screenY, 0.5, 0, 2 * Math.PI);
                }

                ctx.fill();
            }
        }
        ctx.restore();
    }

    renderCurrentView() {
        if (this._plot) {
            this._matrixCells.currentTransition = this._plot.transition() || undefined;
            this._matrixCells.currentView = this._plot.view() || undefined;
            this._matrixCells.currentTransitionTime = this._plot.transitionTime();
        } else {
            this._matrixCells.currentTransition = undefined;
            this._matrixCells.currentView = undefined;
        }
        this._matrixCells.renderCurrentView();
    }

    connect(plot: Scatterplot): this {
        this.disconnect();
        this._plot = plot;
        this._plot.on('transitionChange', this.onPlotTransitionChange);
        this._plot.on('transitionTimeUpdate', this.onPlotTimeUpdate);

        this.onPlotTransitionChange();
        this.onPlotTimeUpdate();

        return this;
    }

    plot(): Scatterplot | undefined {
        return this._plot;
    }

    disconnect(): this {
        if (this._plot) {
            this._plot.removeListener('transitionChange', this.onPlotTransitionChange);
            this._plot.removeListener('transitionTimeUpdate', this.onPlotTimeUpdate);
        }

        return this;
    }

    onPlotTransitionChange = () => {
        this._transition = this._plot!.transition() || undefined;
        this.setDirty();
    };
    onPlotTimeUpdate = () => {
        this.renderCurrentView();
    };
}

type Cell = { x: number, y: number };

/** Handles matrix cell outlines and interaction. */
class MatrixCells extends EventEmitter {
    cells: Selection<SVGGElement, undefined, null, undefined>;
    dimensions: Dimension[] = [];
    width = 100;
    height = 100;
    hoverCell?: Cell;
    currentView?: ScatterView;
    currentTransition?: ScatterTransition;
    currentTransitionTime = 0;

    constructor() {
        super();
        this.cells = (create('svg:g') as Selection<SVGGElement, undefined, null, undefined>)
            .attr('class', 'd3st-matrix-cells');
    }

    render() {
        const cells = [];
        for (let y = 0; y < this.dimensions.length; y++) {
            for (let x = 0; x < this.dimensions.length; x++) cells.push({ x, y });
        }

        const cellSizeX = this.width / this.dimensions.length;
        const cellSizeY = this.height / this.dimensions.length;

        this.cells.selectAll('.d3st-matrix-cell')
            .data(cells)
            .call(sel => sel.exit().remove())
            .call(sel => sel
                .enter()
                .append('g')
                .attr('class', 'd3st-matrix-cell')
                .call(sel => sel.append('rect')
                    .attr('class', 'd3st-matrix-cell-cursor')
                    .attr('fill', 'none')
                    .attr('stroke', 'blue')
                    .attr('stroke-width', 0))
                .call(sel => sel.append('rect')
                    .attr('class', 'd3st-matrix-cell-hover')
                    .attr('fill', 'none')
                    .attr('stroke', 'currentColor')
                    .attr('stroke-width', 0))
                .call(sel => sel.append('rect')
                    .attr('class', 'd3st-matrix-cell-hitbox')
                    .attr('fill', 'black')
                    .style('opacity', '0')
                    .on('mouseover', (event) => {
                        const { x, y } = event.currentTarget.parentNode!.dataset;
                        this.hoverCell = { x: +x, y: +y };
                        this.hoverCellDidChange();
                    })
                    .on('mouseout', (event) => {
                        const { x, y } = event.currentTarget.parentNode!.dataset;
                        const cell = { x: +x, y: +y };
                        if (this.hoverCell?.x === cell.x && this.hoverCell?.y === cell.y) this.hoverCell = undefined;
                        this.hoverCellDidChange();
                    })
                    .on('click', (event) => {
                        const { x, y } = event.currentTarget.parentNode!.dataset;
                        this.emit('select', +x, +y);
                    }))
            );

        this.cells.selectAll('.d3st-matrix-cell')
            .data(cells)
            .attr('data-x', cell => cell.x)
            .attr('data-y', cell => cell.y)
            .attr('transform', cell => `translate(${cell.x * cellSizeX}, ${cell.y * cellSizeY})`)
            .call(sel => sel.selectAll('rect').attr('width', cellSizeX).attr('height', cellSizeY));
    }

    renderCurrentView() {
        this.cells.selectAll('.d3st-matrix-cell-cursor')
            .transition()
            .duration(400)
            .ease(easeExpOut)
            .attr('stroke-width', this.currentStrokeWidth);

        const dimIndex = (dim: Dimension) => this.dimensions.map(d => d.name).indexOf(dim.name);

        const activeViews = [];
        if (this.currentTransition) {
            const views = this.currentTransition.views;
            const maxIndex = views.length - 1;
            const viewIndex = this.currentTransitionTime * maxIndex;
            const indexLo = Math.min(Math.floor(viewIndex), maxIndex);
            const indexHi = Math.min(Math.ceil(viewIndex), maxIndex);
            const t = indexLo === indexHi
                ? 0
                : (viewIndex - indexLo) / (indexHi - indexLo);

            activeViews.push({
                x: dimIndex(views[indexLo].x),
                y: dimIndex(views[indexLo].y),
                z: 1 - t
            });
            if (indexLo !== indexHi) {
                activeViews.push({
                    x: dimIndex(views[indexHi].x),
                    y: dimIndex(views[indexHi].y),
                    z: t
                });
            }
        } else if (this.currentView) {
            activeViews.push({
                x: dimIndex(this.currentView.x),
                y: dimIndex(this.currentView.y),
                z: 1
            });
        }
        for (const view of activeViews) {
            this.cells.select(`.d3st-matrix-cell[data-x="${view.x}"][data-y="${view.y}"]`)
                .select('.d3st-matrix-cell-cursor')
                .transition()
                .duration(0)
                .attr('stroke-width', Math.sqrt(view.z) * 3);
        }
    }

    private currentStrokeWidth = 0;
    hoverCellDidChange() {
        this.cells.selectAll('.d3st-matrix-cell-hover')
            .transition()
            .duration(400)
            .ease(easeExpOut)
            .attr('stroke-width', this.currentStrokeWidth);

        const cell = this.hoverCell;
        if (cell) {
            this.cells.select(`.d3st-matrix-cell[data-x="${cell.x}"][data-y="${cell.y}"]`)
                .select('.d3st-matrix-cell-hover')
                .transition()
                .duration(0)
                .attr('stroke-width', 3);
        }
    }

    waveEffect(strokeColor: string, strokeWidth: number, delay: ((x: number, y: number) => number)) {
        for (let y = 0; y < this.dimensions.length; y++) {
            for (let x = 0; x < this.dimensions.length; x++) {

                this.cells.select(`.d3st-matrix-cell[data-x="${x}"][data-y="${y}"]`)
                    .select('.d3st-matrix-cell-hover')
                    .transition()
                    .delay(delay(x, y))
                    .duration(200)
                    .ease(easeExpInOut)
                    .attr('stroke', strokeColor)
                    .attr('stroke-width', 3)
                    .transition()
                    .duration(400)
                    .ease(easeExpOut)
                    .attr('stroke-width', strokeWidth);
            }
        }
    }
    transitionBuilderDidBegin() {
        const cornerX = 0;
        const cornerY = this.dimensions.length - 1;
        const timeScale = 250 / this.dimensions.length;
        this.currentStrokeWidth = 1;
        this.waveEffect('red', 1, (x, y) => Math.hypot(x - cornerX, (y - cornerY) / 2) * timeScale + Math.random() * 20);
    }
    transitionBuilderDidEnd() {
        const cornerX = 0;
        const cornerY = this.dimensions.length - 1;
        const timeScale = 250 / this.dimensions.length;
        const maxIndex = this.dimensions.length - 1;
        const maxDelay = Math.hypot(maxIndex - cornerX, (maxIndex - cornerY) / 2) * timeScale;
        this.currentStrokeWidth = 0;
        this.waveEffect('currentColor', 0, (x, y) => maxDelay - Math.hypot(x - cornerX, (y - cornerY) / 2) * timeScale);
    }
}

type PathSegment = {
    x1: symbol | string,
    y1: symbol | string,
    x2: symbol | string,
    y2: symbol | string
};
function pathToSegments(path: ScatterView[]): PathSegment[] {
    const segments = [];
    let prevItem;
    for (const item of path) {
        if (prevItem) {
            segments.push({
                x1: prevItem.x.name,
                y1: prevItem.y.name,
                x2: item.x.name,
                y2: item.y.name
            });
        }
        prevItem = item;
    }
    return segments;
}

class TransitionPath {
    node: Selection<SVGGElement, undefined, null, undefined>;
    private _actualPath: Selection<SVGGElement, undefined, null, undefined>;
    _innerPath: Selection<SVGGElement, undefined, null, undefined>;

    plotWidth = 200;
    plotHeight = 200;
    dimensions: Dimension[] = [];
    views?: ScatterView[];
    postTransform?: PathTransform;

    constructor() {
        this.node = (create('svg:g') as (typeof this.node))
            .attr('class', 'd3st-transition-path')
            .attr('fill', 'none')
            .attr('stroke', 'currentColor')
            .attr('stroke-width', 3)
            .attr('stroke-linecap', 'round');

        this._actualPath = this.node.append('g')
            .attr('class', 'd3st-actual-path')
            .style('opacity', '0.25');
        this._innerPath = this.node.append('g')
            .attr('class', 'd3st-inner-path')
            .style('opacity', '0.5');
    }

    setVisible(visible: boolean) {
        this.node.transition()
            .duration(200)
            .attr('stroke-width', visible ? 3 : 0);
    }

    forceClear() {
        this.node.selectAll('.path-segment, .stop-point').remove();
    }

    renderPaths() {
        let actualPath: ScatterView[] = [];
        let path: ScatterView[] = [];

        if (this.views) {
            path = [...this.views];
            actualPath = this.postTransform ? this.postTransform(path, this.dimensions!) : path;
        }

        const actualPathSegments = actualPath.length ? pathToSegments(actualPath) : [];
        const pathSegments = pathToSegments(path);

        const cellSizeX = this.plotWidth / this.dimensions.length;
        const cellSizeY = this.plotHeight / this.dimensions.length;

        const dims = this.dimensions.map(dim => dim.name);

        const getX = (name: string | symbol) => (dims.indexOf(name) + 0.5) * cellSizeX;
        const getY = (name: string | symbol) => (dims.indexOf(name) + 0.5) * cellSizeY;

        const renderSegments = (sel: Selection<BaseType, PathSegment, SVGGElement, undefined>) => sel
            .attr('x1', segment => getX(segment.x1))
            .attr('y1', segment => getY(segment.y1))
            .attr('x2', segment => getX(segment.x2))
            .attr('y2', segment => getY(segment.y2))
            .call(sel => sel.exit().remove())
            .call(sel => sel.enter()
                .append('line')
                .attr('class', 'path-segment')
                .attr('x1', segment => getX(segment.x1))
                .attr('y1', segment => getY(segment.y1))
                .attr('x2', segment => getX(segment.x1))
                .attr('y2', segment => getY(segment.y1))
                .transition()
                .attr('x2', segment => getX(segment.x2))
                .attr('y2', segment => getY(segment.y2))
            );

        this._actualPath.selectAll('.path-segment')
            .data(actualPathSegments)
            .call(renderSegments);

        this._innerPath.selectAll('.path-segment')
            .data(pathSegments)
            .call(renderSegments);

        this._innerPath.selectAll('.stop-point')
            .data(path)
            .attr('cx', c => getX(c.x.name))
            .attr('cy', c => getY(c.y.name))
            .call(sel => sel.exit().remove())
            .enter()
            .append('circle')
            .attr('class', 'stop-point')
            .attr('cx', c => getX(c.x.name))
            .attr('cy', c => getY(c.y.name))
            .attr('r', 0)
            .transition()
            .attr('r', 2);
    }
}

const TRANSITION_TYPES = {
    straight: StraightTransition,
    spline: SplineTransition,
    rotation: RotationTransition,
} as { [name: string]: ScatterTransitionType<unknown> };

const makeIcon = (content: string) => `<svg xmlns="http://www.w3.org/2000/xml" viewBox="0 0 24 24" width="14" height="14"><g stroke="currentColor" stroke-width="2" fill="none">${content}</g></svg>`;
const TRANSFORM_TYPES = {
    straight: {
        icon: makeIcon(`<line x1="3.5" y1="20.5" x2="20.5" y2="3.5"></line><polyline points="16 3 21 3 21 8"></polyline>`),
        transform: straight
    },
    manhattan: {
        icon: makeIcon(`<polyline points="2.5 19.5 17.5 19.5 17.5 4.5"></polyline><polyline points="14 7 17.5 3.5 21 7"></polyline>`),
        transform: manhattan
    },
    diagonalStart: {
        icon: makeIcon(`<polyline points="3 20 11.5 7 19.5 7"></polyline><polyline points="17 4 20 7 17 10"></polyline>`),
        transform: diagonalStart
    },
    diagonalEnd: {
        icon: makeIcon(`<polyline points="3.5 19 12 19 19.5 6"></polyline><polyline points="15.5 6.5 20 5.5 21 10"></polyline>`),
        transform: diagonalEnd
    },
    diagonalStairs: {
        icon: makeIcon(`<polyline points="2 21 8 21 8 16 13 16 13 11 18 11 18 4.5"></polyline><polyline points="21 7 18 4 15 7"></polyline>`),
        transform: diagonalStairs
    },
} as { [name: string]: { icon: string, transform: PathTransform } };

class TransitionBuilder extends EventEmitter {
    private _node: HTMLDivElement;
    private _modeButton: HTMLButtonElement;
    private _buildButton: HTMLButtonElement;
    private _builderSettings: HTMLDivElement;
    private _transParams: HTMLDivElement;
    plot?: Scatterplot;
    data: DataPoint[] = [];
    dimensions: Dimension[] = [];
    path: TransitionPath;

    buildingTransition = false;
    transType = Object.keys(TRANSITION_TYPES)[0];
    tfType = Object.keys(TRANSFORM_TYPES)[0];
    transParams: { [type: string]: unknown } = {};

    constructor() {
        super();
        this._node = document.createElement('div');
        this._node.className = 'd3st-transition-builder';

        this._modeButton = document.createElement('button');
        this._node.appendChild(this._modeButton);
        this._modeButton.textContent = 'Build Transition';
        this._modeButton.addEventListener('click', this.toggleBuilder);

        this._buildButton = document.createElement('button');
        this._node.appendChild(this._buildButton);
        this._buildButton.textContent = 'Rebuild With New Parameters';
        this._buildButton.addEventListener('click', this.commit);

        this._builderSettings = document.createElement('div');
        this._node.appendChild(this._builderSettings);
        {
            const typeSelect = document.createElement('select');
            for (const id in TRANSITION_TYPES) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id;
                typeSelect.appendChild(option);
            }
            typeSelect.addEventListener('change', () => {
                this.transType = typeSelect.value;
                this.renderParams();
            });
            this._builderSettings.appendChild(typeSelect);

            const pathTransformSelect = document.createElement('span');
            Object.assign(pathTransformSelect.style, {
                display: 'inline-block',
                borderRadius: '4px',
                overflow: 'hidden',
                verticalAlign: 'middle',
                border: '1px solid rgba(0, 0, 0, 0.2)'
            });
            let selectedOption: HTMLButtonElement | null = null;
            for (const id in TRANSFORM_TYPES) {
                const option = document.createElement('button');
                option.value = id;
                option.title = id;
                option.innerHTML = TRANSFORM_TYPES[id].icon;
                pathTransformSelect.appendChild(option);
                Object.assign(option.style, {
                    margin: '0',
                    color: 'inherit',
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px'
                });

                if (!selectedOption) {
                    selectedOption = option;
                    selectedOption.style.background = '#000';
                    selectedOption.style.color = '#fff';
                }

                option.addEventListener('click', () => {
                    selectedOption!.style.background = 'none';
                    selectedOption!.style.color = 'inherit';
                    selectedOption = option;
                    selectedOption.style.background = '#000';
                    selectedOption.style.color = '#fff';

                    this.tfType = id;
                    this.renderParams();
                });
            }
            this._builderSettings.appendChild(pathTransformSelect);

            this._transParams = document.createElement('div');
            this._builderSettings.appendChild(this._transParams);
        }

        this.path = new TransitionPath();
        this.path._innerPath.attr('stroke', 'red').style('opacity', 1);
        this.path.setVisible(false);
    }

    node(): HTMLDivElement {
        return this._node;
    }

    getTransConstructor() {
        return TRANSITION_TYPES[this.transType];
    }

    getPathPostTransform(): PathTransform {
        const { transform } = TRANSFORM_TYPES[this.tfType];

        if (this.getTransConstructor().requiresCommonDimensions) {
            return (path, dims) => manhattan(transform(path, dims), dims);
        }

        return transform;
    }

    renderParams() {
        renderTransitionParams(
            this._transParams,
            this.getTransConstructor().params,
            this.transParams[this.transType] || {},
            this.onTransParamsChange
        );

        this.path.postTransform = this.getPathPostTransform();
        this.path.renderPaths();
    }

    onTransParamsChange = (params: unknown) => {
        this.transParams[this.transType] = params;
        this.renderParams();
    }

    buildTransition(path: ScatterView[]) {
        const Trans = this.getTransConstructor();
        const postTransform = this.getPathPostTransform();
        if (postTransform) path = postTransform(path, this.dimensions);

        return new Trans(path, {
            data: this.data,
            ...((this.transParams[this.transType] as {}) || {})
        });
    }

    onSelect(x: number, y: number) {
        const xDim = this.dimensions[x];
        const yDim = this.dimensions[y];
        const view = new ScatterView(xDim, yDim);

        if (this.buildingTransition) {
            this.path.views?.push(view);
            this.path.renderPaths();
        } else if (this.plot) {
            const path = [];
            path.push(this.plot.closestView());
            path.push(view);
            const transition = this.buildTransition(path);
            transition.prepare().then(() => {
                this.emit('transition', transition);
            });
        }
    }

    toggleBuilder = () => {
        if (this.buildingTransition) this.end();
        else this.begin();
    }

    begin = () => {
        this._modeButton.textContent = 'Cancel';
        this._buildButton.textContent = 'Build';
        this.emit('beginBuild');
        this.buildingTransition = true;

        this.path.setVisible(true);
        this.path.views = [];
        this.path.renderPaths();
    }
    end = (didCommit = false) => {
        this._modeButton.textContent = 'Build Transition';
        this._buildButton.textContent = 'Rebuild With New Parameters';
        this.emit('endBuild', didCommit);
        this.buildingTransition = false;

        this.path.setVisible(false);
    }
    commit = () => {
        let views: ScatterView[];
        let isRebuild = false;
        if (this.buildingTransition) {
            views = this.path.views!;
        } else {
            const currentTrans = this.plot?.transition();
            if (!currentTrans) return;
            views = currentTrans.views;
            isRebuild = true;
        }
        if (!views.length) return;

        this.end(true);

        const transition = this.buildTransition(views);
        transition.prepare().then(() => {
            this.emit('createTransition', transition, isRebuild);
        });
    }
}

function renderTransitionParams(
    node: HTMLDivElement,
    params: ScatterTransitionParams<any>,
    values: any,
    onChange: (values: any) => void
) {
    let domCursor = 0;
    let didRenderNew = false;

    (node as any)._values = values;

    const currentChildren = [];
    for (let i = 0; i < node.children.length; i++) currentChildren.push(node.children[i]);

    for (const key in params) {
        const param = params[key];
        const itemId = param.type + ' ' + key;
        if ((currentChildren[domCursor] as HTMLElement)?.dataset?.id !== itemId) {
            currentChildren[domCursor]?.parentNode?.removeChild(currentChildren[domCursor]);

            const onParamChange = (thunk: (v: any) => any) => {
                onChange({
                    ...(node as any)._values,
                    [key]: thunk((node as any)._values[key])
                });
            };

            const newNode = document.createElement('div');
            newNode.className = 'd3st-transition-param';
            newNode.dataset.id = itemId;
            const defaultValue = createTransitionParam(newNode, param, onParamChange);
            if (!(key in values)) values[key] = defaultValue;
            node.insertBefore(newNode, currentChildren[domCursor + 1]);
            currentChildren[domCursor] = newNode;
            didRenderNew = true;
        }

        updateTransitionParam(currentChildren[domCursor] as HTMLDivElement, param, key, values);

        domCursor++;
    }

    if (didRenderNew) {
        onChange(values);
    }

    for (let i = domCursor; i < currentChildren.length; i++) {
        currentChildren[i]?.parentNode?.removeChild(currentChildren[i]);
    }
}
function createTransitionParam<P>(node: HTMLElement, param: STParam<P>, onChange: (thunk: (v: any) => any) => void) {
    if (param.type === 'number') {
        const container = document.createElement('div');
        container.className = 'd3st-tp-number';
        node.appendChild(container);
        Object.assign(container.style, {
            position: 'relative',
            padding: '4px',
            cursor: 'ew-resize',
            background: 'rgba(0, 0, 0, 0.1)'
        });
        const sliderValue = document.createElement('div');
        sliderValue.className = 'd3st-tp-n-value';
        container.appendChild(sliderValue);
        Object.assign(sliderValue.style, {
            position: 'absolute',
            inset: '0',
            background: 'currentColor',
            opacity: '0.2',
            transformOrigin: '0 0'
        });
        const label = document.createElement('span');
        label.className = 'd3st-tp-n-label';
        Object.assign(label.style, {
            font: '10px sans-serif'
        });
        container.appendChild(label);
        const input = document.createElement('input');
        input.type = 'number';
        Object.assign(input.style, {
            font: '10px sans-serif',
            position: 'absolute',
            inset: '0',
            display: 'none'
        });
        container.appendChild(input);

        let inputMode = false;
        let pointerIsDown = false;
        let lastPointerX = 0;
        let movedDistance = 0;
        let currentValue = 0;
        container.addEventListener('pointerdown', e => {
            if (inputMode) return;
            e.preventDefault();
            pointerIsDown = true;
            lastPointerX = e.clientX;
            movedDistance = 0;
            onChange(value => currentValue = value);
            container.setPointerCapture(e.pointerId);
        });
        container.addEventListener('pointermove', e => {
            e.preventDefault();
            if (!pointerIsDown) return;
            const delta = (e.clientX - lastPointerX);
            lastPointerX = e.clientX;
            const valueDelta = delta / container.getBoundingClientRect().width * (param.domain[1] - param.domain[0]);

            movedDistance += Math.abs(delta);

            if (movedDistance >= 2) {
                currentValue += valueDelta;
                onChange(value => {
                    return Math.min(Math.max(param.round ? Math.round(currentValue) : currentValue, param.domain[0]), param.domain[1]);
                });
            }
        });
        container.addEventListener('pointerup', e => {
            if (!pointerIsDown) return;
            pointerIsDown = false;
            container.releasePointerCapture(e.pointerId);

            if (movedDistance < 2) {
                inputMode = true;
                input.style.display = 'block';
                onChange(value => input.value = value);
                input.focus();
            }
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                if (Number.isFinite(+input.value)) {
                    onChange(() => {
                        return Math.min(Math.max(param.round ? Math.round(+input.value) : +input.value, param.domain[0]), param.domain[1]);
                    });
                }
                input.blur();
            } else if (e.key === 'Escape') input.blur();
        });
        input.addEventListener('blur', () => {
            inputMode = false;
            input.style.display = 'none';
        });

        return param.default;
    } else if (param.type === 'bool') {
        const checkbox = document.createElement('input');
        checkbox.className = 'd3st-tp-b-checkbox';
        checkbox.type = 'checkbox';
        checkbox.id = Math.random().toString();
        node.appendChild(checkbox);

        node.appendChild(document.createTextNode(' '));

        const label = document.createElement('label');
        label.className = 'd3st-tp-b-label';
        label.setAttribute('for', checkbox.id);
        label.style.font = '10px sans-serif';
        node.appendChild(label);

        checkbox.addEventListener('change', () => {
            onChange(() => checkbox.checked);
        });

        return param.default;
    } else if (param.type === 'enum') {
        const id = Math.random().toString();
        const label = document.createElement('label');
        label.className = 'd3st-tp-b-label';
        label.setAttribute('for', id);
        label.style.font = '10px sans-serif';
        node.appendChild(label);

        const select = document.createElement('select');
        select.id = id;
        select.className = 'd3st-tp-e-select';
        let index = 0;
        for (const variant of param.variants) {
            const option = document.createElement('option');
            option.textContent = variant.label;
            option.value = (index++).toString();
            select.appendChild(option);
        }
        node.appendChild(select);

        select.addEventListener('change', () => {
            onChange(() => param.variants[+select.value].value);
        });

        return param.variants[param.default].value;
    } else if (param.type === 'group') {
        const header = document.createElement('div');
        header.className = 'd3st-tp-g-header';
        node.appendChild(header);

        const label = document.createElement('label');
        label.className = 'd3st-tp-g-label';
        label.style.font = '10px sans-serif';
        header.appendChild(label);

        const contents = document.createElement('ul');
        contents.className = 'd3st-tp-g-contents';
        node.appendChild(contents);
        Object.assign(contents.style, {
            listStyle: 'none',
            padding: '0',
            margin: '0',
            paddingLeft: '16px'
        });

        const defaults: { [id: string]: any } = {};
        for (const itemId in param.contents) {
            const itemNode = document.createElement('li');
            itemNode.className = 'd3st-tp-g-item';
            itemNode.dataset.id = itemId;
            contents.appendChild(itemNode);
            defaults[itemId] = createTransitionParam(
                itemNode,
                param.contents[itemId],
                (thunk: (v: any) => any) => onChange(v => ({
                    ...v,
                    [itemId]: thunk(v[itemId])
                }))
            );
        }

        if (param.nullable) {
            header.insertBefore(document.createTextNode(' '), header.firstChild);
            const checkbox = document.createElement('input');
            checkbox.className = 'd3st-tp-g-checkbox';
            checkbox.type = 'checkbox';
            checkbox.id = Math.random().toString();
            header.insertBefore(checkbox, header.firstChild);
            label.setAttribute('for', checkbox.id);

            let values = defaults;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    onChange(() => values);
                } else {
                    onChange(v => {
                        values = v;
                        return null;
                    });
                }
            });

            return null;
        } else {
            return defaults;
        }
    } else if (param.type === 'derived') {
        node.style.display = 'none';
        (node as any)._paramOnChange = onChange;
    }
}
function updateTransitionParam(node: HTMLElement, param: STParam<any>, paramId: string, values: any, topValues = values) {
    if (param.shouldShow) {
        const shouldShow = param.shouldShow(values);
        if (shouldShow) node.style.display = 'block';
        else node.style.display = 'none';
    }

    if (param.type === 'number') {
        const sliderValue = node.querySelector('.d3st-tp-n-value') as HTMLDivElement;
        const label = node.querySelector('.d3st-tp-n-label') as HTMLSpanElement;

        const scale = (values[paramId] - param.domain[0]) / (param.domain[1] - param.domain[0]);
        sliderValue.style.transform = `scaleX(${scale})`;

        label.textContent = paramId + ': ' + (param.round ? Math.round(values[paramId]) : values[paramId].toFixed(2));
    } else if (param.type === 'bool') {
        const checkbox = node.querySelector('.d3st-tp-b-checkbox') as HTMLInputElement;
        const label = node.querySelector('.d3st-tp-b-label') as HTMLLabelElement;
        checkbox.checked = values[paramId];
        label.textContent = paramId;
    } else if (param.type === 'enum') {
        const select = node.querySelector('.d3st-tp-e-select') as HTMLSelectElement;
        const label = node.querySelector('.d3st-tp-b-label') as HTMLLabelElement;
        select.value = param.variants.map(v => v.value).indexOf(values[paramId]).toString();
        label.textContent = paramId;
    } else if (param.type === 'group') {
        const label = node.querySelector('.d3st-tp-g-label') as HTMLLabelElement;
        const contents = node.querySelector('.d3st-tp-g-contents') as HTMLDivElement;
        label.textContent = paramId;

        let shouldUpdateContents = false;
        if (param.nullable) {
            const checkbox = node.querySelector('.d3st-tp-g-checkbox') as HTMLInputElement;
            checkbox.checked = values[paramId] !== null;
        }

        if (values[paramId] !== null) {
            contents.style.display = '';

            const nodes: { [id: string]: HTMLElement } = {};
            for (let i = 0; i < contents.children.length; i++) {
                const child = contents.children[i] as HTMLElement;
                if (child.dataset?.id) nodes[child.dataset.id] = child;
            }

            for (const itemId in param.contents) {
                updateTransitionParam(nodes[itemId], param.contents[itemId], itemId, values[paramId] || {}, values);
            }
        } else {
            contents.style.display = 'none';
        }
    } else if (param.type === 'derived') {
        const derived = param.derive(topValues);
        if (values[paramId] !== derived) {
            (node as any)._paramOnChange(() => derived);
        }
    }
}

export function scatterplotMatrix() {
    return new ScatterplotMatrix();
}
