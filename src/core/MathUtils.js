export const TAU = Math.PI * 2;
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function smoothLerp(a, b, speed, dt) {
    return lerp(a, b, 1 - Math.exp(-speed * dt));
}
export function length(x, y) {
    return Math.hypot(x, y);
}
export function normalize(x, y) {
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 0.00001)
        return { x: 0, y: 0 };
    return { x: x / magnitude, y: y / magnitude };
}
export function distanceSquared(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
}
export function distance(ax, ay, bx, by) {
    return Math.sqrt(distanceSquared(ax, ay, bx, by));
}
export function angleDelta(a, b) {
    let delta = (b - a + Math.PI) % TAU - Math.PI;
    if (delta < -Math.PI)
        delta += TAU;
    return delta;
}
export function pointToSegmentDistanceSquared(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq <= 0.00001)
        return distanceSquared(px, py, ax, ay);
    const t = clamp((apx * abx + apy * aby) / lengthSq, 0, 1);
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return distanceSquared(px, py, cx, cy);
}
export function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
export function formatNumber(value) {
    const absolute = Math.abs(value);
    const decimal = (number, digits) => number.toFixed(digits).replace('.', ',');
    if (absolute < 1000)
        return Math.round(value).toLocaleString('vi-VN');
    if (absolute < 1_000_000)
        return `${decimal(value / 1000, absolute >= 10_000 ? 0 : 1)} N`;
    return `${decimal(value / 1_000_000, 1)} Tr`;
}
export function formatDecimal(value, fractionDigits) {
    return value.toLocaleString('vi-VN', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}
export function hashString(value) {
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const value = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export function circleIntersects(ax, ay, ar, bx, by, br) {
    return distanceSquared(ax, ay, bx, by) <= (ar + br) * (ar + br);
}
//# sourceMappingURL=MathUtils.js.map