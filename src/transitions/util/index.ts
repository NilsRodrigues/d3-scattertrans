export * from './cluster';

export function lerp(a: number, b: number, t: number) {
    return (b - a) * t + a;
}
export function clamp(x: number, l: number, h: number) {
    return Math.max(l, Math.min(x, h));
}
