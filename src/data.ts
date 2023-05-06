/**
 * A data point of arbitrary dimensions.
 */
export type DataPoint = { [dimKey: string | symbol]: number };

interface DimensionMapping {
    toNormalized(domain: [number, number], value: number): number;
    toDomain(domain: [number, number], value: number): number;
}

export enum DimensionMappingType {
    Linear = 'linear',
    Log = 'log'
}

const mappings: { [name: string]: DimensionMapping } = {
    [DimensionMappingType.Linear]: {
        toNormalized([min, max]: [number, number], value: number) {
            return (value - min) / (max - min);
        },
        toDomain([min, max]: [number, number], value: number) {
            return min + value * (max - min);
        }
    },
    [DimensionMappingType.Log]: {
        toNormalized([min, max]: [number, number], value: number) {
            const a = value - min;
            const b = max - min;

            return Math.log(a + 1) / Math.log(b + 1);
        },
        toDomain([min, max]: [number, number], value: number) {
            value = value * Math.log(max - min + 1);
            return min + Math.exp(value) - 1;
        }
    }
};

/**
 * A data dimension.
 *
 * In general, dimensions are assumed to be usable as a dimension in euclidean space.
 */
export class Dimension {
    constructor(public name: string | symbol, public domain: [number, number], public mapping = Dimension.Linear) {}

    /** Normalizes a value from this dimension's domain to 0..1.  */
    normalize(value: number) {
        return mappings[this.mapping].toNormalized(this.domain, value);
    }

    /** Expands a normalized value [0..1] to a value in the regular domain range. */
    expand(value: number) {
        return mappings[this.mapping].toDomain(this.domain, value);
    }

    /** Returns true if this object equals the other object. */
    eq(other: Dimension): boolean {
        return this.name === other.name && this.domain[0] === other.domain[0] && this.domain[1] === other.domain[1];
    }

    /**
     * Creates a new dimension from the given data.
     *
     * @param key the key in the DataPoints that contains this dimension's data
     * @param data the data with which to calculate the domain
     * @param padding additional padding (multiplicative: the domain will be scaled by padding + 1)
     */
    static fromData(key: string | symbol, data: DataPoint[], padding = 0) {
        let min = Infinity;
        let max = -Infinity;
        for (const point of data) {
            const value = point[key];
            if (value < min) min = value;
            if (value > max) max = value;
        }
        if (!Number.isFinite(min)) min = 0;
        if (!Number.isFinite(max)) max = 0;
        if (padding) {
            const range = max - min;
            min -= range * padding / 2;
            max += range * padding / 2;
        }
        return new Dimension(key, [min, max]);
    }

    static Linear = DimensionMappingType.Linear;
    static Log = DimensionMappingType.Log;
}
