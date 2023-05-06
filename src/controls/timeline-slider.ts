import { Scatterplot } from './scatterplot';
import { create, Selection } from 'd3-selection';

const icons = {
    play: 'M6,3L22,12L6,21',
    pause: 'M4,3L10,3L10,21L4,21Z M14,3L20,3L20,21L14,21Z',
    snapLeft: 'M20,3L8,12L20,21Z M3,3L8,3L8,21L3,21Z',
    snapRight: 'M4,3L16,12L4,21Z M16,3L21,3L21,21L16,21Z',
};

/**
 * A slider control for scatterplot transitions.
 */
export class TimelineSlider {
    private _plot?: Scatterplot;
    private _node: Selection<HTMLDivElement, undefined, null, undefined>;
    private _playButtonSvg: Selection<SVGSVGElement, undefined, null, undefined>;
    private _playButtonIcon: Selection<SVGPathElement, undefined, null, undefined>;
    private _interactive = false;
    private _playBackwards = false;

    constructor() {
        const slider = create('div')
            .attr('class', 'd3st-timeline-slider')
            .style('display', 'flex')
            .style('position', 'relative')
            .style('align-items', 'center');

        const sliderButtons = slider.append('div')
            .attr('class', 'd3st-slider-buttons')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('flex-shrink', '0');
        const createButton = (button: Selection<HTMLButtonElement, undefined, null, undefined>) => {
            button
                .attr('class', 'd3st-slider-button')
                .attr('type', 'button')
                .style('width', '32px')
                .style('height', '32px')
                .style('border', 'none')
                .style('padding', '0')
                .style('box-sizing', 'border-box')
                .style('display', 'inline-flex')
                .style('justify-content', 'center')
                .style('align-items', 'center')
                .style('background', 'none')
                .style('color', 'inherit')
                .on('pointerdown', () => button.style('opacity', '0.5'))
                .on('pointerup', () => button.style('opacity', ''));
        };
        sliderButtons.append('button')
            .call(createButton)
            .on('click', this.snapToPrevView)
            .append('svg')
            .attr('width', '24')
            .attr('height', '24')
            .append('path')
            .attr('fill', 'currentColor')
            .attr('d', icons.snapLeft);

        this._playButtonSvg = sliderButtons.append('button')
            .call(createButton)
            .on('click', this.togglePlayback)
            .append('svg')
            .style('transition', 'all 0.3s cubic-bezier(0.4, 0.3, 0, 1.5)')
            .attr('width', '24')
            .attr('height', '24');
        this._playButtonIcon = this._playButtonSvg
            .append('path')
            .attr('fill', 'currentColor')
            .attr('d', icons.play);

        window.addEventListener('keydown', e => {
            this.playBackwards(e.altKey);
        });
        window.addEventListener('keyup', e => {
            this.playBackwards(e.altKey);
        });

        sliderButtons.append('button')
            .call(createButton)
            .on('click', this.snapToNextView)
            .append('svg')
            .attr('width', '24')
            .attr('height', '24')
            .append('path')
            .attr('fill', 'currentColor')
            .attr('d', icons.snapRight);

        const sliderTrack = slider.append('div')
            .attr('class', 'd3st-slider-track')
            .style('position', 'relative')
            .style('flex', '1')
            .style('height', '20px');
        sliderTrack.append('div')
            .attr('class', 'd3st-slider-rail')
            .style('position', 'absolute')
            .style('top', '50%')
            .style('left', '10px')
            .style('right', '10px')
            .style('margin-top', '-1px')
            .style('height', '2px')
            .style('background', 'currentColor');
        sliderTrack.append('div')
            .attr('class', 'd3st-slider-ticks');
        sliderTrack.append('div')
            .attr('class', 'd3st-slider-thumb')
            .style('position', 'absolute')
            .style('width', '20px')
            .style('height', '20px')
            .style('margin-left', '-10px')
            .style('border-radius', '10px')
            .style('background', 'currentColor')
            .on('pointerdown', this.onThumbPointerDown);

        const speedSlider = slider.append('div')
            .attr('class', 'd3st-slider-speed')
            .style('position', 'relative')
            .style('width', '100px')
            .style('height', '22px')
            .style('background', 'rgba(0, 0, 0, 0.1)')
            .style('clip-path', 'polygon(0 80%, 100% 0, 100% 100%, 0 100%)')
            .style('cursor', 'ew-resize')
            .on('pointerdown', this.onSpeedPointerDown);
        speedSlider.append('div')
            .attr('class', 'd3st-slider-speed-value')
            .style('position', 'absolute')
            .style('width', '100%')
            .style('height', '100%')
            .style('transform-origin', '0 0')
            .style('background', 'rgba(0, 0, 0, 0.2)');
        speedSlider.append('div')
            .attr('class', 'd3st-slider-speed-label')
            .style('position', 'absolute')
            .style('right', '8px')
            .style('bottom', '2px')
            .style('pointer-events', 'none')
            .style('font', '10px sans-serif');

        this._node = slider;
    }

    private renderSliderTicks(viewCount: number) {
        const sliderTicks = [];
        for (let i = 0; i < viewCount; i++) sliderTicks.push(i / (viewCount - 1));

        this._node.select('.d3st-slider-ticks')
            .selectAll('.d3st-slider-tick')
            .data(sliderTicks)
            .style('left', d => `calc(calc(${d} * calc(100% - 20px)) + 10px)`)
            .call(sel => sel.exit().remove())
            .enter()
            .append('div')
            .attr('class', 'd3st-slider-tick')
            .style('position', 'absolute')
            .style('width', '2px')
            .style('height', '18px')
            .style('left', d => `calc(calc(${d} * calc(100% - 20px)) + 10px)`)
            .style('margin-left', '-1px')
            .style('background', 'currentColor');
    }

    private renderSpeed() {
        if (!this._plot) return;
        const speed = this._plot.speed();

        this._node.select('.d3st-slider-speed-value')
            .style('transform', `scaleX(${speed / 2})`);
        this._node.select('.d3st-slider-speed-label')
            .text(`speed: ${Math.round(speed * 100) / 100}/s`);
    }

    /**
     * Connects this slider to a scatterplot.
     * Will disconnect from any previously connected scatterplot, if applicable.
     * @param plot the scatterplot
     */
    connect(plot: Scatterplot): this {
        this.disconnect();
        this._plot = plot;

        this._plot.on('transitionChange', this.plotTransitionDidChange);
        this._plot.on('play', this.plotStartedPlaying);
        this._plot.on('pause', this.plotStoppedPlaying);
        this._plot.on('transitionTimeUpdate', this.plotTransitionDidUpdateTime);
        this._plot.on('speedChange', this.plotSpeedDidChange);

        this.plotTransitionDidChange();
        this.plotTransitionDidUpdateTime();
        this.plotSpeedDidChange();
        return this;
    }
    /** Disconnects this slider from any currently connected scatterplot. */
    disconnect(): this {
        if (this._plot) {
            this._plot.removeListener('transitionChange', this.plotTransitionDidChange);
            this._plot.removeListener('transitionTimeUpdate', this.plotTransitionDidUpdateTime);
            this._plot.removeListener('play', this.plotStartedPlaying);
            this._plot.removeListener('pause', this.plotStoppedPlaying);
            this._plot.removeListener('speedChange', this.plotSpeedDidChange);
            this._plot = undefined;
        }
        return this;
    }

    private plotTransitionDidChange = () => {
        const transition = this._plot?.transition();
        if (transition) {
            // has a transition
            this._node.style('opacity', '1');
            const viewCount = transition.hasMeaningfulIntermediates ? transition.views.length : 2;
            this.renderSliderTicks(viewCount);
            this._interactive = true;
        } else {
            this._node.style('opacity', '0.5');
            this.renderSliderTicks(0);
            this._interactive = false;
        }
    }
    private plotTransitionDidUpdateTime = () => {
        const thumbPos = this._plot?.transitionTime() || 0;

        this._node
            .select('.d3st-slider-thumb')
            .style('left', `calc(calc(calc(100% - 20px) * ${thumbPos}) + 10px)`);
    }

    private plotStartedPlaying = () => {
        this._playButtonIcon.attr('d', icons.pause);
        this.updatePlayBackwardsDisplay();
    }
    private plotStoppedPlaying = () => {
        this._playButtonIcon.attr('d', icons.play);
        this.updatePlayBackwardsDisplay();
    }

    private plotSpeedDidChange = () => {
        this.renderSpeed();
    }

    private onThumbPointerDown = (e: PointerEvent) => {
        if (!this._plot || !this._interactive) return;

        e.preventDefault();

        const plot = this._plot;
        const sliderTrack = this._node.select('.d3st-slider-track').node()! as HTMLDivElement;
        const thumb = this._node.select('.d3st-slider-thumb').node()! as HTMLDivElement;
        thumb.setPointerCapture(e.pointerId);

        const sliderTrackRect = sliderTrack.getBoundingClientRect();
        const startPos = (e.clientX - sliderTrackRect.x) / sliderTrackRect.width;
        const startTime = plot.transitionTime();

        const onMove = (e: PointerEvent) => {
            e.preventDefault();
            const newPos = (e.clientX - sliderTrackRect.x) / sliderTrackRect.width;
            plot.transitionTime(startTime + (newPos - startPos));
            this.snapToClosestViewIfWithinTolerance(3 / sliderTrackRect.width);
            plot.updateLastRender();
        };
        const onUp = (e: PointerEvent) => {
            e.preventDefault();
            thumb.releasePointerCapture(e.pointerId);
            thumb.removeEventListener('pointermove', onMove);
            thumb.removeEventListener('pointerup', onUp);
        };
        thumb.addEventListener('pointermove', onMove);
        thumb.addEventListener('pointerup', onUp);
    };

    private speedPointerDblClickTime = 0;
    private onSpeedPointerDown = (e: PointerEvent) => {
        if (!this._plot) return;

        e.preventDefault();

        const plot = this._plot;
        const speedSlider = this._node.select('.d3st-slider-speed').node()! as HTMLDivElement;
        speedSlider.setPointerCapture(e.pointerId);

        const trackRect = speedSlider.getBoundingClientRect();
        const startPosScreen = e.clientX;
        const startPos = (e.clientX - trackRect.x) / trackRect.width;
        const startSpeed = plot.speed();
        let didMove = false;

        const onMove = (e: PointerEvent) => {
            e.preventDefault();
            const newPos = (e.clientX - trackRect.x) / trackRect.width;
            plot.speed(Math.max(0, startSpeed + (newPos - startPos) * 2));

            if (Math.abs(e.clientX - startPosScreen) > 2) {
                didMove = true;
            }
        };
        const onUp = (e: PointerEvent) => {
            e.preventDefault();
            speedSlider.releasePointerCapture(e.pointerId);
            speedSlider.removeEventListener('pointermove', onMove);
            speedSlider.removeEventListener('pointerup', onUp);

            if (!didMove) {
                const prevDownTime = this.speedPointerDblClickTime;
                const thisDownTime = this.speedPointerDblClickTime = Date.now();
                if (thisDownTime - prevDownTime < 400) {
                    plot.speed(1); // reset on double-click
                }
            } else {
                this.speedPointerDblClickTime = 0;
            }
        };
        speedSlider.addEventListener('pointermove', onMove);
        speedSlider.addEventListener('pointerup', onUp);
    };

    /** Returns this slider's node. */
    node(): HTMLDivElement {
        return this._node.node()!;
    }

    private updatePlayBackwardsDisplay() {
        const plot = this._plot;
        if (!plot) return;
        if (plot.playing() ? plot.playingBackwards() : this._playBackwards) {
            this._playButtonSvg.style('transform', 'rotate(-180deg)');
        } else {
            this._playButtonSvg.style('transform', '');
        }
    }

    private togglePlayback = () => {
        const plot = this._plot;
        if (!plot) return;

        if (plot.playing()) {
            plot.playing(false);
        } else {
            let didRewind = false;
            if (!this._playBackwards && plot.transitionTime() === 1) {
                // rewind
                plot.transitionTime(0);
                didRewind = true;
            }
            if (this._playBackwards && plot.transitionTime() === 0) {
                // rewind (backwards)
                plot.transitionTime(1);
                didRewind = true;
            }

            if (didRewind) {
                // show initial image for a bit
                plot.updateLastRender();
                this.plotStartedPlaying(); // pretend we're already playing

                setTimeout(() => {
                    plot.playing(true, this._playBackwards);
                }, 300);
            } else {
                plot.playing(true, this._playBackwards);
            }
        }
    }

    /** Returns whether the animation should be played backwards. */
    playBackwards(): boolean;
    /** Sets whether the animation should be played backwards. */
    playBackwards(value: boolean): this;
    playBackwards(value?: boolean): this | boolean {
        if (value !== undefined) {
            this._playBackwards = value;
            this.updatePlayBackwardsDisplay();
            return this;
        }
        return this._playBackwards;
    }

    /** Snaps time to the previous view in the transition. */
    snapToPrevView = () => {
        const plot = this._plot;
        const transition = plot?.transition();
        if (!plot || !transition) return;
        const transitionCount = transition.hasMeaningfulIntermediates ? transition.views.length - 1 : 1;
        const viewTime = plot.transitionTime() * transitionCount;
        const newTime = Math.floor(viewTime - 1e-9) / transitionCount;
        plot.transitionTime(newTime);
        plot.updateLastRender();
    }
    /** Snaps time to the next view in the transition. */
    snapToNextView = () => {
        const plot = this._plot;
        const transition = plot?.transition();
        if (!plot || !transition) return;
        const transitionCount = transition.hasMeaningfulIntermediates ? transition.views.length - 1 : 1;
        const viewTime = plot.transitionTime() * transitionCount;
        const newTime = Math.ceil(viewTime + 1e-9) / transitionCount;
        plot.transitionTime(newTime);
        plot.updateLastRender();
    }
    /** Snaps time to the closest view if time is within the given tolernace. */
    snapToClosestViewIfWithinTolerance(tolerance: number) {
        const plot = this._plot;
        const transition = plot?.transition();
        if (!plot || !transition) return;
        const transitionCount = transition.hasMeaningfulIntermediates ? transition.views.length - 1 : 1;
        const viewTime = plot.transitionTime() * transitionCount;
        const closestView = Math.round(viewTime);
        if (Math.abs(viewTime - closestView) <= tolerance * transitionCount) {
            plot.transitionTime(closestView / transitionCount);
            plot.updateLastRender();
        }
    }
}

export function timelineSlider() {
    return new TimelineSlider();
}
