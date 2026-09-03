import { ObjectPool } from '../core/ObjectPool.js';
import { Enemy } from './Entities.js';
/**
 * 2/3 bán kính màn hình tương đương 1/3 toàn bộ chiều rộng/chiều cao.
 * Vành ngoài 1.0 tương đương 1/2 toàn bộ kích thước: đúng gần mép nhìn.
 */
export const VIEWPORT_SPAWN_INNER_RADIUS = 2 / 3;
export const VIEWPORT_SPAWN_OUTER_RADIUS = 1;
export const DEFAULT_SPAWN_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
function clampUnit(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
/**
 * Lấy một điểm trong vành ellipse bao quanh người chơi.
 *
 * `angleSample` và `radiusSample` được truyền từ RNG thay vì gọi Math.random,
 * giúp replay theo seed và kiểm thử luôn xác định. Căn bậc hai phân bố quái đều
 * theo diện tích vành, tránh dồn quá nhiều quái vào mép trong.
 */
export function viewportSpawnOffset(viewport, angleSample, radiusSample) {
    const width = Number.isFinite(viewport.width) ? Math.max(1, viewport.width) : DEFAULT_SPAWN_VIEWPORT.width;
    const height = Number.isFinite(viewport.height) ? Math.max(1, viewport.height) : DEFAULT_SPAWN_VIEWPORT.height;
    const angle = clampUnit(angleSample) * Math.PI * 2;
    const innerSquared = VIEWPORT_SPAWN_INNER_RADIUS ** 2;
    const outerSquared = VIEWPORT_SPAWN_OUTER_RADIUS ** 2;
    const normalizedRadius = Math.sqrt(innerSquared + (outerSquared - innerSquared) * clampUnit(radiusSample));
    return {
        x: Math.cos(angle) * width * 0.5 * normalizedRadius,
        y: Math.sin(angle) * height * 0.5 * normalizedRadius,
        normalizedRadius,
    };
}
export class EnemySpawner {
    pool = new ObjectPool(() => new Enemy(), 220, 1100);
    data;
    rng;
    constructor(data, rng) {
        this.data = data;
        this.rng = rng;
    }
    spawn(configId, x, y, scaling, bonusScale = 1) {
        const config = this.data.enemyById.get(configId);
        if (!config)
            return null;
        const enemy = this.pool.acquire();
        if (!enemy)
            return null;
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
        enemy.alpha = 1;
        return enemy;
    }
    spawnAround(configId, centerX, centerY, scaling, bonusScale = 1, viewport = DEFAULT_SPAWN_VIEWPORT) {
        const offset = viewportSpawnOffset(viewport, this.rng.next(), this.rng.next());
        return this.spawn(configId, centerX + offset.x, centerY + offset.y, scaling, bonusScale);
    }
    spawnChild(configId, x, y, scaling, bonusScale = 0.6) {
        const angle = this.rng.float(0, Math.PI * 2);
        const radius = this.rng.float(20, 70);
        return this.spawn(configId, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, scaling, bonusScale);
    }
    findConfig(id) {
        return this.data.enemyById.get(id);
    }
    clear() {
        this.pool.releaseAll();
    }
}
//# sourceMappingURL=EnemySpawner.js.map