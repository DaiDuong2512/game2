import type { RNG, WeightedChoice } from '../core/RNG.js';
import type { EnemyConfig, EnemySizeClass, GameData, ScaleSnapshot, StageConfig } from '../core/Types.js';
import type { EnemySpawner, SpawnViewport } from './EnemySpawner.js';

// Bộ nội tại mới tăng mạnh sức quét đám đông, vì vậy ngân sách sinh quái được
// nhân đôi thêm một lần từ nhịp 2,5 hiện tại. Hệ số kích cỡ và quái nhỏ khi có
// Trùm vẫn được áp dụng ở lớp lựa chọn phía dưới.
export const ENEMY_SPAWN_RATE_MULTIPLIER = 5;
export const BOSS_SMALL_SPAWN_RATE_MULTIPLIER = 2;
export const RANGED_ENEMY_SPAWN_MULTIPLIER = 0.5;
export const ENEMY_SIZE_SELECTION_MULTIPLIERS: Readonly<Record<EnemySizeClass, number>> = Object.freeze({
  small: 2,
  medium: 1.25,
  large: 1.15,
});
const BASE_SPAWN_DENSITY = 0.065;
const BASE_OPENING_BUDGET = 3;

export function directorSpawnDensity(spawnBase: number, spawnRate: number): number {
  return spawnBase * spawnRate * BASE_SPAWN_DENSITY * ENEMY_SPAWN_RATE_MULTIPLIER;
}

/** Giữ tương thích với dữ liệu cũ chưa khai báo sizeClass tường minh. */
export function resolveEnemySizeClass(
  config: Partial<Pick<EnemyConfig, 'sizeClass' | 'radius'>>,
): EnemySizeClass {
  if (config.sizeClass) return config.sizeClass;
  const radius = Number.isFinite(config.radius) ? config.radius ?? 15 : 15;
  if (radius >= 20) return 'large';
  if (radius >= 15) return 'medium';
  return 'small';
}

export function enemySizeSelectionMultiplier(
  config: Partial<Pick<EnemyConfig, 'sizeClass' | 'radius'>>,
): number {
  return ENEMY_SIZE_SELECTION_MULTIPLIERS[resolveEnemySizeClass(config)];
}

/**
 * Trọng số đội hình theo tiến độ đợt.
 *
 * Chi phí đã tiếp tục được trừ khỏi ngân sách khi sinh quái, vì vậy không nên
 * phạt quái đắt tiền thêm một lần nữa bằng 1 / cost như trước. Đầu đợt vẫn ưu
 * tiên đám đông dễ đọc; cuối đợt tăng dần tanker, áp sát và đơn vị chiến thuật.
 */
export function directorChoiceWeight(config: EnemyConfig, wave: number, waveCount: number): number {
  const denominator = Math.max(1, waveCount - 1);
  const progress = Math.max(0, Math.min(1, (Math.max(1, wave) - 1) / denominator));
  const costExponent = 0.72 - progress * 0.34;
  const costWeight = 1 / Math.pow(Math.max(1, config.cost), costExponent);

  let roleWeight = 1;
  switch (config.ai) {
    case 'melee':
    case 'splitter': roleWeight = 1.12 - progress * 0.4; break;
    case 'fast':
    case 'flying': roleWeight = 1.28 - progress * 0.33; break;
    case 'tank':
    case 'shield': roleWeight = 0.55 + progress * 0.7; break;
    case 'healer':
    case 'summoner': roleWeight = 0.28 + progress * 0.82; break;
    case 'charger':
    case 'exploder':
    case 'assassin':
    case 'burrow': roleWeight = 0.48 + progress * 0.72; break;
    case 'ranged':
    case 'sniper':
    case 'mage': roleWeight = (0.52 + progress * 0.66) * RANGED_ENEMY_SPAWN_MULTIPLIER; break;
    case 'leech': roleWeight = 0.65 + progress * 0.45; break;
    default: roleWeight = 0.8 + progress * 0.2; break;
  }
  return Math.max(0.05, costWeight * roleWeight * enemySizeSelectionMultiplier(config));
}

export class Director {
  private readonly data: GameData;
  private readonly rng: RNG;
  private readonly spawner: EnemySpawner;
  private candidates: EnemyConfig[] = [];
  private stage: StageConfig | null = null;
  private budget = 0;
  private spawnPulse = 0;
  private bossSmallBudget = 0;
  private qaMode = false;

  public constructor(data: GameData, rng: RNG, spawner: EnemySpawner) {
    this.data = data;
    this.rng = rng;
    this.spawner = spawner;
  }

  public start(stage: StageConfig, qaMode: boolean): void {
    this.stage = stage;
    this.qaMode = qaMode;
    this.budget = BASE_OPENING_BUDGET * ENEMY_SPAWN_RATE_MULTIPLIER;
    this.spawnPulse = 0;
    this.bossSmallBudget = 0;
    this.candidates = stage.allowedEnemies
      .map((id) => this.data.enemyById.get(id))
      .filter((item): item is EnemyConfig => Boolean(item && item.tier === 'normal'));
    if (this.candidates.length === 0) {
      const fallback = this.data.enemyById.get('riftling');
      if (fallback) this.candidates = [fallback];
    }
  }

  public update(
    dt: number,
    playerX: number,
    playerY: number,
    scaling: ScaleSnapshot,
    wave: number,
    intermission: number,
    activeCount: number,
    viewport?: SpawnViewport,
    bossActive = false,
  ): void {
    if (!this.stage || intermission > 0) return;
    const cap = Math.min(1000, 260 + this.stage.index * 36 + wave * 28);
    if (activeCount >= cap) return;

    const density = directorSpawnDensity(this.stage.spawnBase, scaling.spawnRate);
    this.budget += dt * density;
    this.bossSmallBudget = bossActive
      ? this.bossSmallBudget + dt * density * (BOSS_SMALL_SPAWN_RATE_MULTIPLIER - 1)
      : 0;
    this.spawnPulse -= dt;
    if (this.spawnPulse > 0 && this.budget < 4) return;

    let spawned = 0;
    const maxPerFrame = 10;
    while (this.budget >= 1 && activeCount + spawned < cap && spawned < maxPerFrame) {
      const choices: WeightedChoice<EnemyConfig>[] = this.candidates.map((config) => ({
        item: config,
        weight: directorChoiceWeight(config, wave, this.stage?.waveCount ?? 1),
      }));
      let config = this.rng.weighted(choices);
      if (!config) break;
      if (this.budget < config.cost) {
        const affordable = this.candidates.filter((candidate) => candidate.cost <= this.budget);
        config = this.rng.weighted(affordable.map((candidate) => ({
          item: candidate,
          weight: directorChoiceWeight(candidate, wave, this.stage?.waveCount ?? 1),
        })));
      }
      if (!config) break;
      const eliteRoll = this.rng.chance(scaling.eliteRate * 0.22) && this.stage.index >= 4;
      const enemy = this.spawner.spawnAround(
        config.id,
        playerX,
        playerY,
        scaling,
        eliteRoll ? 1.75 : 1,
        viewport,
      );
      if (!enemy) break;
      if (eliteRoll) {
        enemy.isElite = true;
        enemy.radius *= 1.15;
        enemy.exp *= 2.6;
        enemy.gold += 6;
      }
      this.budget -= config.cost;
      spawned += 1;
    }

    if (bossActive && activeCount + spawned < cap && spawned < maxPerFrame) {
      const smallCandidates = this.candidates.filter((candidate) => resolveEnemySizeClass(candidate) === 'small');
      while (smallCandidates.length > 0 && activeCount + spawned < cap && spawned < maxPerFrame) {
        const affordable = smallCandidates.filter((candidate) => candidate.cost <= this.bossSmallBudget + 1e-9);
        const config = this.rng.weighted(affordable.map((candidate) => ({
          item: candidate,
          weight: directorChoiceWeight(candidate, wave, this.stage?.waveCount ?? 1),
        })));
        if (!config) break;
        const enemy = this.spawner.spawnAround(config.id, playerX, playerY, scaling, 1, viewport);
        if (!enemy) break;
        this.bossSmallBudget = Math.max(0, this.bossSmallBudget - config.cost);
        spawned += 1;
      }
    }
    if (spawned > 0) this.spawnPulse = 0.04;
  }
}
