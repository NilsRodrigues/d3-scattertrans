// Common data types for spline and spline-worker

import { vec2 } from 'gl-matrix';
import { DataPoint } from '../data';
import { FuzzyParams } from './util';

export type SplineParams = {
    /**
     * The spline transition requires all data to be known beforehand to be able to calculate
     * curves.
     */
    data?: DataPoint[],
    /**
     * Clustering parameters for DBSCAN. Clustering will be skipped if not set.
     */
    clustering?: FuzzyParams,
    /**
     * If true, intermediate views will only be approximated, i.e. they will be control points of
     * a long bézier curve instead of being end points in a polybézier curve.
     */
    looseIntermediates?: boolean,
    /**
     * Integer factor for how many "bundling points" to add to the transitions.
     * Bundling points squeeze points' paths more toward the cluster's center line.
     */
    bundlingStrength?: number,
    /**
     * Inner easing function for multi-stage animation (only). Default: quadratic.
     */
    ease?: (t: number) => number,
    /**
     * If true, clusters will have different time offsets on their animation.
     */
    timeOffset?: boolean,
    /**
     * Accepts a function for retiming the animation for each cluster.
     * Overrides timeOffset.
     */
    retime?: RetimeFn
};

/**
 * Retimes the animation for a cluster.
 *
 * - t: animation time from 0 to 1
 * - index: group index
 * - total: total number of groups
 *
 * Returns new animation time from 0 to 1.
 */
export type RetimeFn = (t: number, data: RetimeInfo) => number;

/** A guide for points in a cluster. */
export type PathGuide = PathSegmentGuide[];
/** A PathGuide segment. */
export type PathSegmentGuide = {
    /** The incoming tangent direction for directional continuity. */
    inTangent: vec2,
    /** The outgoing tangent direction for directional continuity. */
    outTangent: vec2,
    /** Control points to add between end points, for bundling. */
    bundlingPoints: vec2[],
};

export type RetimeClusterInfo = {
    points: number
};

export type RetimeInfo = {
    /** Group index */
    index: number,
    /** Total number of groups */
    total: number,
    /** Information about all clusters */
    clusters: RetimeClusterInfo[]
};

/** A point path. */
export type Path = PathSegment[];
/** A point path segment. */
export type PathSegment = {
    /** Bézier control points. */
    curve: vec2[],
    /** Lookup table mapping t [0, 1] -> approx. arc length [0, (approx. length of the curve)] */
    lut: number[],
    /** Retime group info */
    retime: RetimeInfo
};

/** Evaluates a bézier curve. */
export function bezierEval(bezier: vec2[], t: number): vec2 {
    if (bezier.length <= 1) {
        return bezier[0];
    } else {
        const newBezier = [];
        for (let i = 0; i < bezier.length - 1; i++) {
            newBezier.push(vec2.lerp(vec2.create(), bezier[i], bezier[i + 1], t));
        }
        return bezierEval(newBezier, t);
    }
}
