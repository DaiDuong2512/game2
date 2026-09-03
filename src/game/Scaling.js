import { clamp } from '../core/MathUtils.js';
export const WAVE_SCALING_DELTAS = Object.freeze({
    health: 0.12,
    damage: 0.06,
    speed: 0.015,
    spawnRate: 0.09,
    eliteRate: 0.0085,
});
export const SCALING_CAPS = Object.freeze({
    speed: 1.38,
    spawnRate: 2.9,
    eliteRate: 0.18,
});
export function computeScaling(stageIndex, wave) {
    const stage = Math.max(1, stageIndex);
    const currentWave = Math.max(1, wave);
    const stageOffset = stage - 1;
    const waveOffset = currentWave - 1;
    return {
        health: 1 + 0.16 * stageOffset + 0.006 * stageOffset * stageOffset + WAVE_SCALING_DELTAS.health * waveOffset,
        damage: 1 + 0.09 * stageOffset + WAVE_SCALING_DELTAS.damage * waveOffset,
        speed: clamp(1 + 0.012 * stageOffset + WAVE_SCALING_DELTAS.speed * waveOffset, 1, SCALING_CAPS.speed),
        spawnRate: clamp(1 + 0.07 * stageOffset + WAVE_SCALING_DELTAS.spawnRate * waveOffset, 1, SCALING_CAPS.spawnRate),
        eliteRate: clamp(0.012 + 0.0045 * stage + WAVE_SCALING_DELTAS.eliteRate * waveOffset, 0.01, SCALING_CAPS.eliteRate),
    };
}
//# sourceMappingURL=Scaling.js.map