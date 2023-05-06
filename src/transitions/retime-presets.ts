import { RetimeFn, RetimeInfo } from './spline-common';

export const retimeIdentity: RetimeFn = (t: number) => t;

/** Legacy retime function used when timeOffset is true */
export const retimeLegacyTimeOffset: RetimeFn = (t: number, data: RetimeInfo) => {
    const timeOffset = data.index / data.total - 0.5;
    if (timeOffset  > 0) {
        t = Math.min(1, Math.max(0, (t - timeOffset) / (1 - timeOffset)));
    } else if (timeOffset < 0) {
        t = Math.min(1, Math.max(0, t / (1 + timeOffset)));
    }
    return t;
};

/** Retime function that animates every cluster in sequence with no overlapping animation. */
export const retimeEqualNonOverlappingCascade: RetimeFn = (t: number, data: RetimeInfo) => {
    t = t * data.total - data.index;
    return Math.min(1, Math.max(0, t));
};

/**
 * Retime function that animates every cluster in sequence with no overlapping animation.
 * The duration of the animation is proportional to the cluster size.
 */
export const retimeProportionalNonOverlappingCascade: RetimeFn = (t: number, data: RetimeInfo) => {
    const clusterPoints = data.clusters.map(c => c.points);
    const totalPoints = clusterPoints.reduce((a, b) => a + b, 0);
    const pointsIndexMin = clusterPoints.slice(0, data.index).reduce((a, b) => a + b, 0);

    t = ((t * totalPoints) - pointsIndexMin) / clusterPoints[data.index];
    return Math.min(1, Math.max(0, t));
};

