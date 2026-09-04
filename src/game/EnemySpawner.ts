import { ObjectPool } from '../core/ObjectPool.js';
import type { RNG } from '../core/RNG.js';
import type { EnemyConfig, GameData, ScaleSnapshot } from '../core/Types.js';
import { Enemy } from './Entities.js';

/** Kích thước vùng nhìn theo CSS pixel, không nhân devicePixelRatio. */
export interface SpawnViewport {
  width: number;
  height: number;
}

export interface ViewportSpawnOffset {
  x: number;
  y: number;
  /** Bán kính đã chuẩn hóa trong ellipse màn hình (1 = đúng mép màn). */
  normalizedRadius: number;
}

/**
 * 2/3 bán kính màn hình tương đương 1/3 toàn bộ chiều rộng/chiều cao.
 * Vành ngoài 1.0 tương đương 1/2 toàn bộ kích thước: đúng gần mép nhìn.
 */
export const VIEWPORT_SPAWN_INNER_RADIUS = 2 / 3;
export const VIEWPORT_SPAWN_OUTER_RADIUS = 1.5;
export const VIEWPORT_SPAWN_NEAR_OUTER_RADIUS = 1;
export const VIEWPORT_SPAWN_FAR_REROUTE_CHANCE = 0.35;
export const DEFAULT_SPAWN_VIEWPORT: Readonly<SpawnViewport> = Object.freeze({ width: 1280, height: 720 });

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Lấy một điểm trong vành ellipse bao quanh người chơi.
 *
 * `angleSample` và `radiusSample` được truyền từ RNG thay vì gọi Math.random,
 * giúp replay theo seed và kiểm thử luôn xác định. Căn bậc hai phân bố quái đều
 * theo diện tích vành, tránh dồn quá nhiều quái vào mép trong.
 */
export function viewportSpawnOffset(
  viewport: SpawnViewport,
  angleSample: number,
  radiusSample: number,
  nearIfFarSample = 1,
): ViewportSpawnOffset {
  const width = Number.isFinite(viewport.width) ? Math.max(1, viewport.width) : DEFAULT_SPAWN_VIEWPORT.width;
  const height = Number.isFinite(viewport.height) ? Math.max(1, viewport.height) : DEFAULT_SPAWN_VIEWPORT.height;
  const angle = clampUnit(angleSample) * Math.PI * 2;
  const innerSquared = VIEWPORT_SPAWN_INNER_RADIUS ** 2;
  const outerSquared = VIEWPORT_SPAWN_OUTER_RADIUS ** 2;
  let normalizedRadius = Math.sqrt(
    innerSquared + (outerSquared - innerSquared) * clampUnit(radiusSample),
  );
  // Cổng được phép nằm tới 1,5 màn hình. Nếu lần chọn đầu quá xa, một phần
  // cổng được kéo lại gần mép nhìn để người chơi không phải đuổi theo bầy quái.
  if (normalizedRadius > VIEWPORT_SPAWN_NEAR_OUTER_RADIUS
    && clampUnit(nearIfFarSample) < VIEWPORT_SPAWN_FAR_REROUTE_CHANCE) {
    const nearOuterSquared = VIEWPORT_SPAWN_NEAR_OUTER_RADIUS ** 2;
    normalizedRadius = Math.sqrt(
      innerSquared + (nearOuterSquared - innerSquared) * (1 - clampUnit(radiusSample)),
    );
  }

  return {
    x: Math.cos(angle) * width * 0.5 * normalizedRadius,
    y: Math.sin(angle) * height * 0.5 * normalizedRadius,
    normalizedRadius,
  };
}

export class EnemySpawner {
  public readonly pool = new ObjectPool(() => new Enemy(), 260, 1500);
  private readonly data: GameData;
  private readonly rng: RNG;

  public constructor(data: GameData, rng: RNG) {
    this.data = data;
    this.rng = rng;
  }

  public spawn(configId: string, x: number, y: number, scaling: ScaleSnapshot, bonusScale = 1): Enemy | null {
    const config = this.data.enemyById.get(configId);
    if (!config) return null;
    const enemy = this.pool.acquire();
    if (!enemy) return null;
    enemy.config = config;
    enemy.x = x;
    enemy.y = y;
    enemy.radius = config.radius * (config.tier === 'boss' ? 1.15 : 1);
    enemy.maxHealth = config.baseHealth * scaling.health * bonusScale;
    enemy.health = enemy.maxHealth;
    enemy.damage = config.baseDamage * 0.82 * scaling.damage * Math.min(1.35, bonusScale);
    enemy.speed = config.speed * 0.78 * scaling.speed;
    const inferredArmor = config.tier === 'boss' ? 22 : config.tier === 'elite' ? 13 : Math.max(0, (config.radius - 10) * 0.42);
    enemy.armor = (config.baseArmor ?? inferredArmor) * Math.min(2.25, Math.sqrt(scaling.health));
    enemy.exp = config.exp * Math.sqrt(scaling.health);
    enemy.gold = Math.max(0, Math.round(config.gold * (0.8 + this.rng.next() * 0.4)));
    enemy.attackTimer = this.rng.float(0.1, Math.max(0.2, config.attackCooldown));
    enemy.abilityTimer = this.rng.float(0.5, 2.5);
    enemy.isBoss = config.tier === 'boss';
    enemy.isElite = config.tier === 'elite';
    enemy.shield = config.ai === 'shield' ? enemy.maxHealth * 0.35 : 0;
    enemy.phase = 1;
    enemy.spawnPortalDuration = config.tier === 'boss' ? 0.9 : 0.55;
    enemy.spawnPortalTime = enemy.spawnPortalDuration;
    enemy.alpha = 0;
    return enemy;
  }

  public spawnAround(
    configId: string,
    centerX: number,
    centerY: number,
    scaling: ScaleSnapshot,
    bonusScale = 1,
    viewport: SpawnViewport = DEFAULT_SPAWN_VIEWPORT,
  ): Enemy | null {
    const offset = viewportSpawnOffset(viewport, this.rng.next(), this.rng.next(), this.rng.next());
    return this.spawn(configId, centerX + offset.x, centerY + offset.y, scaling, bonusScale);
  }

  public spawnChild(configId: string, x: number, y: number, scaling: ScaleSnapshot, bonusScale = 0.6): Enemy | null {
    const angle = this.rng.float(0, Math.PI * 2);
    const radius = this.rng.float(20, 70);
    return this.spawn(configId, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, scaling, bonusScale);
  }

  public findConfig(id: string): EnemyConfig | undefined {
    return this.data.enemyById.get(id);
  }

  public clear(): void {
    this.pool.releaseAll();
  }
}
