/** Shared by combat and rendering: the impact frame is the damage frame. */
export const TITAN_BREAKER_DURATION = 0.64;
export const TITAN_BREAKER_IMPACT = 0.32;
export const TITAN_FALL_DURATION = 0.88;
export const TITAN_FALL_IMPACT = 0.56;
export const TITAN_IMPACT_VFX_DURATION = 0.75;

export function titanActionFrame(elapsed: number, ultimate: boolean): number {
  const times = ultimate ? [0, 0.1, 0.22, 0.36, TITAN_FALL_IMPACT, 0.72]
    : [0, 0.06, 0.14, 0.25, TITAN_BREAKER_IMPACT, 0.48];
  let frame = 0;
  for (let index = 1; index < times.length; index += 1) {
    if (elapsed >= times[index]!) frame = index;
  }
  return frame;
}

export function inDamageCircle(x: number, y: number, radius: number, target: { x: number; y: number; radius?: number }): boolean {
  return (target.x - x) ** 2 + (target.y - y) ** 2 <= (radius + (target.radius ?? 0)) ** 2;
}
