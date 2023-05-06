// Perspective or orthographic rotation

import { vec3, vec4, mat4 } from 'gl-matrix';
import { ScatterTransition, ScatterTransitionParams } from './base';
import { ScatterView } from '../view';
import { DataPoint } from '../data';
import { lerp } from './util';
import { easeQuad, easeCubic, easeExp } from 'd3-ease';

export type RotationParams = {
    /**
     * How much perspective to use. 0 for orthographic, 1 for perspective. Default: 0
     */
    perspective?: number,
    /**
     * Perspective FOV in degrees. Default: 60
     */
    perspFov?: number,
    /**
     * Camera distance. Default: 1.5
     */
    cameraDistance?: number,
    /**
     * If true, will use staged animation. Default: false
     */
    staged?: boolean,
    /**
     * Inner easing function for multi-part rotations (only). Default: quadratic.
     */
    ease?: (t: number) => number,
    /**
     * If staged is true, how much t will be used to zoom in/out of perspective.
     */
    zoomTime?: number,
};

/**
 * A rotation transition can swap out a single dimension.
 * It uses depth to add the new dimension and rotates the entire view to the new dimension pair.
 * If perspective is used, it will first "zoom out" from orthographic to perspective projection.
 */
export class RotationTransition implements ScatterTransition {
    static requiresCommonDimensions = true;
    static canSwapDimensions = false;

    static params: ScatterTransitionParams<RotationParams> = {
        perspective: {
            type: 'number',
            domain: [0, 1],
            default: 0,
            round: false
        },
        perspFov: {
            shouldShow: (params: RotationParams) => (params.perspective || 0) > 0,
            type: 'number',
            domain: [0, 90],
            default: 60,
            round: true
        },
        cameraDistance: {
            shouldShow: (params: RotationParams) => (params.perspective || 0) > 0,
            type: 'number',
            domain: [0, 5],
            default: 1.5,
            round: false
        },
        staged: {
            shouldShow: (params: RotationParams) => (params.perspective || 0) > 0,
            type: 'bool',
            default: false
        },
        ease: {
            shouldShow: (params: RotationParams) => params.staged || false,
            type: 'enum',
            variants: [
                { label: 'linear', value: (t: number) => t },
                { label: 'quad', value: easeQuad },
                { label: 'cubic', value: easeCubic },
                { label: 'exp', value: easeExp }
            ],
            default: 1
        },
        zoomTime: {
            shouldShow: (params: RotationParams) => params.staged || false,
            type: 'number',
            domain: [0, 0.5],
            default: 0.2,
            round: false
        }
    };

    private transitions: SingleRotationTransition[];
    constructor(public views: ScatterView[], public params: RotationParams) {
        this.transitions = [];
        for (let i = 0; i < views.length - 1; i++) {
            this.transitions.push(new SingleRotationTransition(views[i], views[i + 1], params));
        }
    }

    hasMeaningfulIntermediates = true;
    isReady = true;
    async prepare() {}

    getX(t: number, point: DataPoint) {
        t *= this.views.length - 1;
        const transIndex = Math.min(Math.floor(t), this.transitions.length - 1);
        return this.transitions[transIndex].getX(t - transIndex, point);
    }
    getY(t: number, point: DataPoint) {
        t *= this.views.length - 1;
        const transIndex = Math.min(Math.floor(t), this.transitions.length - 1);
        return this.transitions[transIndex].getY(t - transIndex, point);
    }
}

export class SingleRotationTransition {
    private rotAxis;

    constructor(public startView: ScatterView, public endView: ScatterView, public params: RotationParams) {
        this.params.perspective = this.params.perspective || 0;
        this.params.perspFov = this.params.perspFov || 60;
        this.params.cameraDistance = this.params.cameraDistance || 1.5;

        this.rotAxis = startView.x === endView.x ? 'x' : 'y';
    }

    getRotAxisAsVector(): vec3 {
        if (this.rotAxis === 'x') return [1, 0, 0];
        if (this.rotAxis === 'y') return [0, 1, 0];
        if (this.rotAxis === 'z') return [0, 0, 1];
        throw new Error('invalid axis');
    }

    ease(t: number): number {
        if (this.params.ease) {
            return this.params.ease(t);
        }
        return easeQuad(t);
    }

    cachedT?: number;
    cachedProjection?: mat4;
    cachedRotation?: mat4;
    cacheData(t: number) {
        this.cachedT = t;

        let rotation = 0;
        let perspFactor = 0;
        const perspTransTime = (this.params.zoomTime || 0.2) * this.params.perspective! * (this.params.staged ? 1 : 0);
        if (t < perspTransTime) {
            perspFactor = this.ease(t / perspTransTime);
        } else if (t < 1 - perspTransTime) {
            const uneased = (t - perspTransTime) / (1 - 2 * perspTransTime);
            const eased = this.params.staged ? this.ease(uneased) : uneased; // don't need to ease if there's no staging
            rotation = lerp(uneased, eased, this.params.perspective!);
            perspFactor = 1;
        } else {
            rotation = 1;
            perspFactor = perspTransTime ? 1 - this.ease((t - 1 + perspTransTime) / perspTransTime) : 0;
        }
        if (!this.params.staged) {
            // ease in sync with rotation (sort of)
            // perspFactor = Math.sin(Math.acos(2 * t - 1));
            // scaled solution to (x)^2 + (y+1)^2 = 2; a small circle segment
            perspFactor = 2.41 * (Math.sqrt(2 - (2 * t - 1) ** 2) - 1);
        }

        // TODO: allow user to specify direction
        if (this.rotAxis === 'x') rotation *= -1; // FIXME: why

        this.cachedRotation = mat4.create();
        // rotate around center
        mat4.translate(this.cachedRotation, this.cachedRotation, [0.5, 0.5, 0.5]);
        mat4.rotate(this.cachedRotation, this.cachedRotation, rotation * Math.PI / 2, this.getRotAxisAsVector());
        mat4.translate(this.cachedRotation, this.cachedRotation, [-0.5, -0.5, -0.5]);

        const ortho = mat4.ortho(mat4.create(), -0.5, 0.5, -0.5, 0.5, 0.1, 1.5);
        const persp = mat4.perspective(mat4.create(), this.params.perspFov! / 180 * Math.PI, 1, 0.1, 1.5);
        const viewOffset = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, -this.params.cameraDistance!]);

        this.cachedProjection = mat4.multiplyScalar(mat4.create(), ortho, 1 - perspFactor * this.params.perspective!);
        this.cachedProjection = mat4.multiplyScalarAndAdd(this.cachedProjection, this.cachedProjection, persp, perspFactor * this.params.perspective!);

        mat4.mul(this.cachedProjection, this.cachedProjection, viewOffset);
    }

    getProjection(t: number) {
        if (t !== this.cachedT) this.cacheData(t);
        return this.cachedProjection!;
    }
    getRotation(t: number) {
        if (t !== this.cachedT) this.cacheData(t);
        return this.cachedRotation!;
    }

    projectPoint(t: number, point: DataPoint): vec4 {
        const proj = this.getProjection(t);
        const rot = this.getRotation(t);

        const p = vec4.create();
        p[3] = 1;
        if (this.rotAxis === 'x') {
            p[0] = this.startView.getX(point);
            p[1] = this.startView.getY(point);
            p[2] = this.endView.getY(point);
        } else if (this.rotAxis === 'y') {
            p[0] = this.startView.getX(point);
            p[1] = this.startView.getY(point);
            p[2] = this.endView.getX(point);
        }

        vec4.transformMat4(p, p, rot);
        vec4.transformMat4(p, p, proj);

        p[0] /= p[3];
        p[1] /= p[3];
        p[2] /= p[3];
        p[3] = 1;
        return p;
    }

    getX(t: number, point: DataPoint) {
        return this.projectPoint(t, point)[0] / 2 + 0.5;
    }
    getY(t: number, point: DataPoint) {
        return this.projectPoint(t, point)[1] / 2 + 0.5;
    }
}

