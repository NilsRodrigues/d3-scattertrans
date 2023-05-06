import { vec2 } from 'gl-matrix';
import { DataPoint, Dimension } from '../data';
import { ScatterView } from '../view';
import { SplineParams, PathGuide, Path, PathSegment, bezierEval, RetimeInfo, RetimeClusterInfo } from './spline-common';
import { fuzzyCluster } from './util';

/** Creates a polyline for each cluster that approximates the motion of all of its points. */
function clustersToPolylines(data: DataPoint[], clusters: number[][], views: ScatterView[]): vec2[][] {
    const polylines = [];
    for (const cluster of clusters) {
        const polyline: vec2[] = [];
        for (const view of views) {
            let xSum = 0;
            let ySum = 0;
            for (const pointId of cluster) {
                xSum += view.getX(data[pointId]);
                ySum += view.getY(data[pointId]);
            }
            polyline.push(vec2.fromValues(xSum / cluster.length, ySum / cluster.length));
        }
        polylines.push(polyline);
    }
    return polylines;
}

/** Creates a PathGuide from a polyline. */
function polylineToClusterGuide(polyline: vec2[], params: SplineParams): PathGuide {
    const pointTangents = [];

    for (let i = 0; i < polyline.length; i++) {
        const prevPoint = polyline[i - 1];
        const point = polyline[i];
        const nextPoint = polyline[i + 1];
        let tangent = vec2.create();

        if (prevPoint && nextPoint) {
            const tangentPrev = vec2.sub(vec2.create(), point, prevPoint);
            const tangentNext = vec2.sub(vec2.create(), nextPoint, point);
            vec2.normalize(tangentPrev, tangentPrev);
            vec2.normalize(tangentNext, tangentNext);

            vec2.add(tangent, tangentPrev, tangentNext);
            vec2.normalize(tangent, tangent);
        }

        pointTangents.push(tangent);
    }

    const bundlingStrength = params?.bundlingStrength ?? 0;

    const guides = [];
    for (let i = 0; i < polyline.length - 1; i++) {
        const point = polyline[i];
        const nextPoint = polyline[i + 1];
        const pointTan = pointTangents[i];
        const nextTan = pointTangents[i + 1];

        const bundlingPoint = vec2.create();
        vec2.lerp(bundlingPoint, point, nextPoint, 0.5);

        const bundlingPoints = [];
        for (let i = 0; i < bundlingStrength; i++) {
            bundlingPoints.push(bundlingPoint);
        }

        guides.push({
            inTangent: pointTan,
            outTangent: nextTan,
            bundlingPoints
        });
    }

    return guides;
}

/** Creates a PathSegment from a bézier curve by adding an arc length LUT. */
function createPathSegment(curve: vec2[]): PathSegment {
    const startPoint = bezierEval(curve, 0);

    let stepLength = 1;
    let tStep = 1;
    while (Number.isFinite(stepLength) && stepLength > 0.01) {
        tStep /= 2;
        const point = bezierEval(curve, tStep);
        stepLength = Math.max(0.01, vec2.distance(startPoint, point));
    }

    // t -> arc length
    const lut = [];
    let totalLen = 0;
    let prevPoint = startPoint;
    for (let i = 0; i <= 1; i += stepLength) {
        const point = bezierEval(curve, i);
        totalLen += vec2.distance(prevPoint, point);
        prevPoint = point;
        lut.push(totalLen);
    }

    // retime data will be assigned later (see below)
    const retime = { index: 0, total: 0, clusters: [] };
    return { curve, lut, retime };
}

/** Creates a path from a point and the PathGuide of its cluster. */
function clusterGuideToPointPath(
    point: DataPoint,
    guideSegments: PathGuide,
    views: ScatterView[],
    params: SplineParams,
    retimeData: RetimeInfo,
): Path[] {
    const looseIntermediates = params?.looseIntermediates ?? false;

    const paths = [];
    let path = [];
    let curve = [];

    for (let i = 0; i < views.length - 1; i++) {
        const view = views[i];
        const nextView = views[i + 1];
        const guide = guideSegments[i];

        const viewPos = vec2.fromValues(view.getX(point), view.getY(point));
        const nextPos = vec2.fromValues(nextView.getX(point), nextView.getY(point));

        const distance = vec2.distance(viewPos, nextPos);

        if (!looseIntermediates) {
            path = [];
            curve = [];
        }

        // TODO: make this a config parameter
        const tangentLength = distance / 2;

        curve.push(viewPos);
        curve.push(vec2.add(vec2.create(), viewPos, vec2.scale(vec2.create(), guide.inTangent, tangentLength)));
        for (const bundlingPoint of guide.bundlingPoints) {
            curve.push(bundlingPoint);
        }
        curve.push(vec2.add(vec2.create(), nextPos, vec2.scale(vec2.create(), guide.outTangent, -tangentLength)));
        curve.push(nextPos);

        if (!looseIntermediates) {
            path.push(createPathSegment(curve));
            paths.push(path);
        }
    }

    if (looseIntermediates) {
        path.push(createPathSegment(curve));
        paths.push(path);
    }

    for (const path of paths) {
        for (const segment of path) {
            segment.retime = retimeData;
        }
    }

    return paths;
}

type SplineInitParams = {
    data: DataPoint[],
    views: ScatterView[],
    params: SplineParams
};

async function initSpline ({ data, views, params }: SplineInitParams) {
    const dimensions: Dimension[] = [];
    for (const view of views) {
        if (!dimensions.includes(view.x)) dimensions.push(view.x);
        if (!dimensions.includes(view.y)) dimensions.push(view.y);
    }

    let clusters;
    if (params.clustering) {
        clusters = await fuzzyCluster(data, dimensions, params.clustering);
    } else {
        clusters = [];
        for (let i = 0; i < data.length; i++) clusters.push([i]); // a cluster for every point
    }
    const polylines = clustersToPolylines(data, clusters, views);
    const clusterGuides = polylines.map(pline => polylineToClusterGuide(pline, params));

    const clusterInfo: RetimeClusterInfo[] = [];
    for (const cluster of clusters) {
        clusterInfo.push({ points: cluster.length });
    }

    const pointPaths = new Map();
    for (let clusterId = 0; clusterId < clusters.length; clusterId++) {
        const clusterGuide = clusterGuides[clusterId];

        const retime: RetimeInfo = {
            index: clusterId,
            total: clusters.length,
            clusters: clusterInfo,
        };

        for (const itemId of clusters[clusterId]) {
            const point = data[itemId];
            const path = clusterGuideToPointPath(point, clusterGuide, views, params, retime);
            pointPaths.set(itemId, path);
        }
    }

    return { clusterGuides, pointPaths };
}

addEventListener('message', e => {
    const input = e.data as SplineInitParams;

    // having been sent over a channel, objects don't have their prototype anymore!
    // hence, we need to recreate them
    for (let i = 0; i < input.views.length; i++) {
        const view = input.views[i];
        const x = new Dimension(view.x.name, view.x.domain, view.x.mapping);
        const y = new Dimension(view.y.name, view.y.domain, view.y.mapping);
        input.views[i] = new ScatterView(x, y);
    }

    initSpline(e.data as SplineInitParams).then(result => {
        postMessage([true, result]);
    }).catch(error => {
        postMessage([false, error]);
    });
});
