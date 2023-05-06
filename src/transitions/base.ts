import { DataPoint } from '../data';
import { ScatterView } from '../view';

/**
 * A scatterplot transition type represents a single method of transitioning between
 * scatterplot views.
 */
export interface ScatterTransitionType<P> {
    /** If true, adjacent views must share at least one dimension.  */
    readonly requiresCommonDimensions: boolean;
    /** If true, adjacent views may swap dimensions (x, y -> y, x). */
    readonly canSwapDimensions: boolean;
    /** The name of this type. This is usually automatically provided by the function prototype. */
    readonly name: string;

    readonly params: ScatterTransitionParams<P>;

    new(path: ScatterView[], params: P): ScatterTransition;
}

/**
 * The transition parameter controls for a particular transition type.
 */
export type ScatterTransitionParams<P> = { [key: string]: STParam<P> };
type STParamBase<P> = {
    shouldShow?: (params: P) => boolean
}
type STParamNumber<P> = STParamBase<P> & {
    type: 'number',
    domain: [number, number],
    default: number,
    round: boolean
}
type STParamBool<P> = STParamBase<P> & {
    type: 'bool',
    default: boolean
}
type STParamEnum<P> = STParamBase<P> & {
    type: 'enum',
    variants: {
        label: string,
        value: unknown
    }[],
    default: number // index
}
type STParamDerived<P> = STParamBase<P> & {
    type: 'derived',
    derive: (params: P) => unknown
}
type STParamGroup<P> = STParamBase<P> & {
    type: 'group',
    nullable: boolean,
    contents: { [key: string]: STParam<P> }
}
export type STParam<P> = STParamNumber<P> | STParamBool<P> | STParamEnum<P> | STParamGroup<P> | STParamDerived<P>;

/**
 * An instance of a particular scatterplot transition.
 *
 * The t parameter in getX and getY corresponds to the current view index, normalized to 0..1
 * (e.g. for [view1, view2, view3, view4], 1/3 will correspond exactly to view2).
 */
export interface ScatterTransition {
    /** If false, the transition still needs to be prepared. */
    readonly isReady: boolean;
    /** Prepares the transition. */
    prepare(): Promise<void>;
    /** Each of the views this transition will transition through. */
    readonly views: ScatterView[];
    /**
     * If true, this transition has meaningful intermediate views of the data.
     * I.e. a transition from views A -> B -> C has meaningful intermediates if t = 0.5 shows B
     * exactly.
     */
    readonly hasMeaningfulIntermediates: boolean;
    /** Returns the X position of a point for time t. */
    getX(t: number, point: DataPoint): number;
    /** Returns the Y position of a point for time t. */
    getY(t: number, point: DataPoint): number;
}
