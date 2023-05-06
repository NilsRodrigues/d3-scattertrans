// Spline transition

import { vec2 } from 'gl-matrix';
import { ScatterTransition, ScatterTransitionParams } from './base';
import { ScatterView } from '../view';
import { DataPoint } from '../data';
import { SplineParams, Path, PathGuide, bezierEval, RetimeFn } from './spline-common';
import SplineWorker from 'web-worker:./spline-worker';
import { easeQuad, easeCubic, easeExp } from 'd3-ease';
import * as retimePresets from './retime-presets';
export * from './retime-presets';

/**
 * A spline transition animates points on splines.
 * Points are clustered in an attempt to minimize confusing paths by having points that are adjacent
 * move similarly.
 */
export class SplineTransition implements ScatterTransition {
    static requiresCommonDimensions = false;
    static canSwapDimensions = true;

    static params: ScatterTransitionParams<SplineParams> = {
        clustering: {
            type: 'group',
            nullable: true,
            contents: {
                epsMin: {
                    type: 'number',
                    domain: [0, 1],
                    default: 0.1,
                    round: false
                },
                ptsMin: {
                    type: 'number',
                    domain: [0, 100],
                    default: 1,
                    round: false
                },
                epsMax: {
                    type: 'derived',
                    derive: (params: SplineParams) => params.clustering!.epsMin
                },
                ptsMax: {
                    type: 'derived',
                    derive: (params: SplineParams) => params.clustering!.ptsMin
                }
            }
        },
        looseIntermediates: {
            type: 'bool',
            default: false
        },
        bundlingStrength: {
            shouldShow: (params: SplineParams) => !!params.clustering,
            type: 'number',
            domain: [0, 10],
            default: 0,
            round: true
        },
        ease: {
            type: 'enum',
            variants: [
                { label: 'linear', value: (t: number) => t },
                { label: 'quad', value: easeQuad },
                { label: 'cubic', value: easeCubic },
                { label: 'exp', value: easeExp }
            ],
            default: 1
        },
        timeOffset: {
            shouldShow: (params: SplineParams) => !!params.clustering && !params.retime,
            type: 'bool',
            default: false
        },
        retime: {
            shouldShow: (params: SplineParams) => !!params.clustering && !params.timeOffset,
            type: 'enum',
            variants: [
                { label: 'identity', value: null },
                { label: 'cascade', value: retimePresets.retimeEqualNonOverlappingCascade },
                { label: 'proportional cascade', value: retimePresets.retimeProportionalNonOverlappingCascade }
            ],
            default: 0,
        },
    };

    private clusterGuides: PathGuide[] = [];
    private pointPaths: Map<number, Path[]> = new Map();

    constructor(public views: ScatterView[], public params: SplineParams) {}

    hasMeaningfulIntermediates = !this.params.looseIntermediates;
    isReady = false;
    async prepare() {
        const worker = new SplineWorker();
        worker.postMessage({
            data: this.params.data,
            views: this.views,
            params: {
                clustering: this.params?.clustering,
                looseIntermediates: this.params?.looseIntermediates,
                bundlingStrength: this.params?.bundlingStrength,
            }
        });
        const [ok, result] = await new Promise(resolve => {
            const callback = (e: MessageEvent) => {
                resolve(e.data);
                worker.removeEventListener('message', callback);
            };
            worker.addEventListener('message', callback);
        });
        if (!ok) throw result;
        this.clusterGuides = result.clusterGuides;
        this.pointPaths = result.pointPaths;
        this.isReady = true;
    }

    ease(t: number): number {
        if (this.params.ease) {
            return this.params.ease(t);
        }
        return easeQuad(t);
    }

    getPointPos(t: number, point: DataPoint) {
        // looseIntermediates creates a single curve
        if (!this.params.looseIntermediates) t *= this.views.length - 1;

        const pathSegments = this.pointPaths.get(this.params.data!.indexOf(point));
        if (pathSegments === undefined) throw new Error('unknown point passed to spline transition');

        const segmentIndex = Math.min(Math.floor(t), pathSegments.length - 1);
        const currentPath = pathSegments[segmentIndex];

        let easing = (t: number) => t;

        // if we're animating over multiple views, we'll need easing because the path segments
        // are different lengths and thus different speeds
        if (!this.params.looseIntermediates && this.views.length > 2) {
            easing = (t: number) => this.ease(t);
        }

        let retimeFn: RetimeFn = retimePresets.retimeIdentity;
        if (this.params.retime) retimeFn = this.params.retime;
        else if (this.params.timeOffset) retimeFn = retimePresets.retimeLegacyTimeOffset;

        return pathEval(currentPath, t - segmentIndex, easing, retimeFn);
    }

    getX(t: number, point: DataPoint) {
        return this.getPointPos(t, point)[0];
    }
    getY(t: number, point: DataPoint) {
        return this.getPointPos(t, point)[1];
    }

    drawDebug(node: HTMLElement, mapPos: (pos: vec2) => vec2) {
        for (const path of this.pointPaths.values()) {
            let d = [];
            for (const segment of path) {
                for (const curve of segment) {
                    d.push(`M ${mapPos(curve.curve[0]).join(',')}`);
                    // svg doesn't support higher order curves
                    for (let i = 1; i <= 50; i++) {
                        const pos = bezierEval(curve.curve, i / 50);
                        d.push(`L ${mapPos(pos).join(',')}`);
                    }
                }
            }
            const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathNode.setAttribute('d', d.join(' '));
            pathNode.setAttribute('fill', 'none');
            pathNode.setAttribute('stroke', '#' + ('000000' + (Math.random() * 0xFFFFFF).toString(16)).substr(-6));
            node.appendChild(pathNode);
        }
    }
}

/** Finds the index where the given element would be sorted into the array. */
function binarySearch<T>(arr: T[], toFind: T): [number, number] {
    let low = 0;
    let high = arr.length - 1;
    while (high - low > 1) {
        const avg = Math.floor((high + low) / 2);
        const sample = arr[avg];
        if (sample > toFind) {
            high = avg;
        } else {
            low = avg;
        }
    }
    return [low, high];
}

/** Evaluates a point path (polybézier) for the given time t. */
function pathEval(path: Path, t: number, easing: (t: number) => number, retime: RetimeFn) {
    t *= path.length;
    const curveIndex = Math.min(Math.floor(t), path.length - 1);
    const curve = path[curveIndex];

    let offsetTime = t - curveIndex;

    offsetTime = retime(offsetTime, curve.retime);
    offsetTime = easing(offsetTime);

    // use arc length LUT
    const targetLen = offsetTime * curve.lut[curve.lut.length - 1];

    const [lutDownIdx, lutUpIdx] = binarySearch(curve.lut, targetLen);
    const lutDownT = lutDownIdx / (curve.lut.length - 1);
    const lutUpT = lutUpIdx / (curve.lut.length - 1);
    const lutDownLen = curve.lut[lutDownIdx];
    const lutUpLen = curve.lut[lutUpIdx];

    let curveT;
    if (lutDownLen === lutUpLen) {
        curveT = lutDownT;
    } else {
        curveT = lutDownT === lutUpT
            ? lutDownT
            : lutDownT + (lutUpT - lutDownT) * ((targetLen - lutDownLen) / (lutUpLen - lutDownLen));
    }

    return bezierEval(curve.curve, curveT);
}

