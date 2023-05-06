import { DataPoint, Dimension } from '../../data';
// @ts-ignore
import d3stWasm from '../../../d3st-wasm/Cargo.toml';

/**
 * Clustering algorithm.
 *
 * All data points must have the same dimensions.
 *
 * Returns arrays of indices; one for each cluster.
 */
export type ClusterFn<P> = (data: DataPoint[], dimensions: Dimension[], params: P) => Promise<number[][]>;

type DimKeys = (string | symbol)[];

function getClusterMean(data: DataPoint[], dimKeys: DimKeys, cluster: number[]): DataPoint {
    if (!cluster.length) throw new Error('empty cluster');
    const mean: { [key: string | symbol]: number } = {};
    for (const key of dimKeys) {
        let dimSum = 0;
        for (const i of cluster) {
            dimSum += data[i][key];
        }
        mean[key] = dimSum / cluster.length;
    }
    return mean;
}

function eucDistFinite(dimKeys: DimKeys, a: DataPoint, b: DataPoint) {
    let sqSum = 0;
    for (const key of dimKeys) {
        const dimDist = Math.abs(a[key] - b[key]);
        if (Number.isFinite(dimDist)) sqSum += dimDist * dimDist;
    }
    return Math.sqrt(sqSum);
}

function hierarchicalClusterStep(data: DataPoint[], dimKeys: DimKeys, clusters: number[][]): number[][] | null {
    const clusterMeans = clusters.map(cluster => getClusterMean(data, dimKeys, cluster));

    let shortestPair = null;
    for (let i = 0; i < clusters.length; i++) {
        for (let j = 0; j < clusters.length; j++) {
            if (i === j) break; // don't need to check reverse pairs (also ensures i < j)
            const distance = eucDistFinite(dimKeys, clusterMeans[i], clusterMeans[j]);
            if (!shortestPair || distance < shortestPair[0]) {
                shortestPair = [distance, i, j];
            }
        }
    }

    if (shortestPair) {
        const [, i, j] = shortestPair;
        const newClusters = clusters.slice();
        newClusters[i] = newClusters[i].concat(newClusters.splice(j, 1)[0]);
        return newClusters;
    }
    return null;
}

export type ClusterTargetParams = {
    targetCount: number | null,
    targetRadius: number | null,
};

function isClusteringDone(data: DataPoint[], dimKeys: DimKeys, clusters: number[][], params: ClusterTargetParams) {
    if (params.targetCount && clusters.length > params.targetCount) return false;

    if (params.targetRadius) {
        // ensure half of all clusters fulfill the radius requirement
        let passingClusters = 0;
        for (const cluster of clusters) {
            const mean = getClusterMean(data, dimKeys, cluster);
            let distanceSum = 0;
            for (const i of cluster) {
                distanceSum += eucDistFinite(dimKeys, mean, data[i]);
            }
            if (distanceSum / cluster.length > params.targetRadius) {
                passingClusters++;
            }
        }
        if (passingClusters < clusters.length / 2) return false;
    }

    return true;
}

/**
 * Simple hierarchical clustering.
 */
export const hierarchicalCluster: ClusterFn<ClusterTargetParams> = async function hierarchicalCluster(data, dimensions, params) {
    if (!data.length) return [];
    const dimKeys = dimensions.map(dim => dim.name);

    let clusters = [];
    // start with every data point in its own cluster
    for (let i = 0; i < data.length; i++) clusters.push([i]);

    // iterate
    do {
        const newClusters = hierarchicalClusterStep(data, dimKeys, clusters);
        if (newClusters) clusters = newClusters;
        else break;
    } while (!isClusteringDone(data, dimKeys, clusters, params));

    return clusters;
};

export type FuzzyParams = {
    epsMin: number,
    epsMax: number,
    ptsMin: number,
    ptsMax: number,
};

export const fuzzyCluster: ClusterFn<FuzzyParams> = async function fuzzyCluster(data, dimensions, params) {
    const d3st = await d3stWasm();
    const clustering = new d3st.FuzzyCluster(params.epsMin, params.epsMax, params.ptsMin, params.ptsMax);

    const dimensionCount = dimensions.length;
    const packedData = new Float32Array(data.length * dimensionCount);

    for (let i = 0; i < data.length; i++) {
        let offset = i * dimensionCount;
        for (const dim of dimensions) {
            packedData[offset] = dim.normalize(data[i][dim.name]);
            offset++;
        }
    }

    const result = clustering.cluster(new Uint8Array(packedData.buffer), dimensionCount);
    const packedClusters = new Uint16Array(result.buffer);

    const clusters = [];
    const noise = [];

    let cursor = 0;
    while (cursor < packedClusters.length) {
        const pointCount = packedClusters[cursor++];
        const cluster = [];
        for (let i = 0; i < pointCount; i++) {
            const id = packedClusters[cursor++];
            const category = id >> 14;
            const index = id & 0x3FFF;
            const label = packedClusters[cursor++];
            if (category === 2) {
                // noise gets to be in its own cluster
                noise.push(index);
            } else {
                cluster.push(index);
            }
        }
        if (cluster.length > 0) {
            clusters.push(cluster);
        }
    }
    if (noise.length > 0) {
        clusters.push(noise);
    }

    //const counts = clusters.map(c => c.length).join(", ");
    //console.info(`Found ${clusters.length} clusters: ${counts}`);
    //console.info(`${noise.length} points in noise cluster.`);
    return clusters;
}
