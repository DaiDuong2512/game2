import { circleIntersects, distanceSquared, normalize } from '../core/MathUtils.js';
import { ObjectPool } from '../core/ObjectPool.js';
import { Pickup as PickupEntity } from './Entities.js';
const pickupColors = {
    exp: '#65d6e5',
    gold: '#efbd5c',
    heal: '#67e58d',
    magnet: '#7abfff',
    fury: '#ff7b50',
    chest: '#d899ff',
    shard: '#c878ff',
    'stat-shard': '#f5f2de',
    'skill-crit-shard': '#ff4fd8',
};
const shardStats = [
    'damage', 'attackSpeed', 'moveSpeed', 'armor', 'maxHp', 'lifeSteal', 'hpRegen',
    'luck', 'armorPenetration', 'statusResistance', 'bodyScale',
    'critChance', 'critDamage', 'heal',
];
export const BONUS_PROJECTILE_STAT_SHARD_CHANCE = 0.15;
/**
 * Tia đạn là chỉ số nguyên (`PlayerStats` luôn floor), nên “+15% tia” không
 * thể được áp thành +0,15. 15% được dùng làm tỉ lệ mảnh chỉ số rơi đúng buff
 * +1 tia; phần còn lại tiếp tục chia ngẫu nhiên cho các chỉ số khác.
 */
export function rollStatShardStat(rng) {
    if (rng.chance(BONUS_PROJECTILE_STAT_SHARD_CHANCE))
        return 'bonusProjectiles';
    return rng.pick(shardStats) ?? 'damage';
}
/**
 * Mảnh chỉ số ngẫu nhiên là phần thưởng duy nhất buộc người chơi tự bước tới
 * nhặt. Mọi vật phẩm còn lại, kể cả kinh nghiệm, vàng, Mảnh Khe Nứt và mảnh
 * chí mạng kỹ năng, đều tự bay về Hộ Vệ từ mọi khoảng cách.
 */
export function pickupHomesAutomatically(type) {
    return type !== 'stat-shard';
}
export class LootSystem {
    pool = new ObjectPool(() => new PickupEntity(), 220, 520);
    rng;
    magnetAllTime = 0;
    constructor(rng) {
        this.rng = rng;
    }
    spawnOnDeath(enemy, luck) {
        const effectiveLuck = Math.max(0, luck);
        this.spawn('exp', enemy.x, enemy.y, Math.max(1, enemy.exp));
        const guaranteedGold = enemy.isElite || enemy.isBoss;
        if (enemy.gold > 0 && (guaranteedGold || this.rng.chance(Math.min(0.85, 0.34 + effectiveLuck * 0.18)))) {
            this.spawn('gold', enemy.x + this.rng.float(-10, 10), enemy.y + this.rng.float(-10, 10), enemy.gold);
        }
        if (enemy.isBoss) {
            this.spawn('chest', enemy.x, enemy.y, 1);
            this.spawn('shard', enemy.x + 20, enemy.y, 5);
            const statPickup = this.spawn('stat-shard', enemy.x - 20, enemy.y, 1);
            if (statPickup)
                statPickup.statId = rollStatShardStat(this.rng);
            if (this.rng.chance(Math.min(0.01, 0.00012 * (1 + effectiveLuck * 2))))
                this.spawn('skill-crit-shard', enemy.x, enemy.y - 22, 1);
            return;
        }
        if (enemy.isElite) {
            this.spawn('chest', enemy.x, enemy.y, 1);
            if (this.rng.chance(0.55))
                this.spawn('shard', enemy.x + 14, enemy.y, 1);
        }
        // Luck rất lớn không được biến một loại vật phẩm thành 100% rồi chặn mọi
        // nhánh sau. Mỗi tiện ích có trần riêng để giữ sự ngẫu nhiên và mật độ nhặt.
        if (this.rng.chance(Math.min(0.18, 0.012 + effectiveLuck * 0.018)))
            this.spawn('heal', enemy.x, enemy.y, 0.24);
        else if (this.rng.chance(Math.min(0.08, 0.004 + effectiveLuck * 0.012)))
            this.spawn('magnet', enemy.x, enemy.y, 1);
        else if (this.rng.chance(Math.min(0.1, 0.005 + effectiveLuck * 0.014)))
            this.spawn('fury', enemy.x, enemy.y, 1);
        const statShardChance = Math.min(0.22, (enemy.isElite ? 0.085 : Math.min(0.045, 0.012 + enemy.radius * 0.0005)) * (1 + effectiveLuck * 1.8));
        if (this.rng.chance(statShardChance)) {
            const pickup = this.spawn('stat-shard', enemy.x + this.rng.float(-12, 12), enemy.y + this.rng.float(-12, 12), 1);
            if (pickup)
                pickup.statId = rollStatShardStat(this.rng);
        }
        const sizeClass = enemy.config.sizeClass ?? (enemy.radius >= 20 ? 'large' : enemy.radius >= 15 ? 'medium' : 'small');
        if ((sizeClass === 'medium' || sizeClass === 'large')
            && this.rng.chance(Math.min(0.01, 0.00012 * (1 + effectiveLuck * 2)))) {
            this.spawn('skill-crit-shard', enemy.x, enemy.y - 18, 1);
        }
    }
    spawn(type, x, y, value) {
        if (type === 'exp' && this.pool.countActive() > 285) {
            const mergeRadiusSq = 110 * 110;
            for (const pickup of this.pool.allItems()) {
                if (!pickup.active || pickup.type !== 'exp')
                    continue;
                if (distanceSquared(x, y, pickup.x, pickup.y) <= mergeRadiusSq) {
                    pickup.value += value;
                    pickup.radius = Math.min(15, pickup.radius + 0.15);
                    return pickup;
                }
            }
        }
        const pickup = this.pool.acquire();
        if (!pickup)
            return null;
        pickup.type = type;
        pickup.x = x;
        pickup.y = y;
        pickup.value = value;
        pickup.color = pickupColors[type];
        pickup.radius = type === 'chest' ? 17 : type === 'magnet' ? 12 : type === 'skill-crit-shard' ? 13 : 8;
        pickup.vx = this.rng.float(-22, 22);
        pickup.vy = this.rng.float(-22, 22);
        pickup.magnetized = pickupHomesAutomatically(type);
        return pickup;
    }
    update(dt, world) {
        this.magnetAllTime = Math.max(0, this.magnetAllTime - dt);
        this.pool.forEachActive((pickup) => {
            pickup.age += dt;
            pickup.vx *= Math.exp(-5 * dt);
            pickup.vy *= Math.exp(-5 * dt);
            pickup.x += pickup.vx * dt;
            pickup.y += pickup.vy * dt;
            // Đừng để hiệu ứng nam châm cũ hoặc trạng thái pool làm mảnh chỉ số bay
            // về người chơi. Nó phải luôn nằm trên mặt đất cho tới khi chạm trực tiếp.
            pickup.magnetized = pickupHomesAutomatically(pickup.type);
            if (pickup.magnetized) {
                const direction = normalize(world.player.x - pickup.x, world.player.y - pickup.y);
                const magnetSpeedBoost = this.magnetAllTime > 0 ? 1.7 : 1;
                const speed = (260 + Math.min(760, pickup.age * 260)) * magnetSpeedBoost;
                pickup.x += direction.x * speed * dt;
                pickup.y += direction.y * speed * dt;
            }
            const distanceFromPlayer = distanceSquared(pickup.x, pickup.y, world.player.x, world.player.y);
            if (pickup.age > 70 && distanceFromPlayer > 1800 * 1800) {
                if (pickup.type === 'stat-shard')
                    return;
                if (pickupHomesAutomatically(pickup.type))
                    this.collect(pickup, world);
                else
                    this.pool.release(pickup);
                return;
            }
            if (circleIntersects(pickup.x, pickup.y, pickup.radius, world.player.x, world.player.y, world.player.radius + 6)) {
                this.collect(pickup, world);
            }
        });
    }
    collect(pickup, world) {
        switch (pickup.type) {
            case 'exp':
                world.gainExperience(pickup.value);
                break;
            case 'gold':
                world.gainGold(Math.max(1, Math.round(pickup.value * world.player.stats.get('goldGain'))));
                break;
            case 'heal':
                world.player.heal(world.player.stats.get('maxHp') * pickup.value);
                world.toast('Đã nhặt bộ sửa chữa dã chiến');
                break;
            case 'magnet':
                this.magnetAllTime = 4.5;
                this.pool.forEachActive((item) => { item.magnetized = pickupHomesAutomatically(item.type); });
                world.toast('Nam châm khe nứt — tăng tốc thu hồi vật phẩm');
                break;
            case 'fury':
                world.player.furyTime = Math.max(world.player.furyTime, 10);
                world.toast('Quá tải — tăng sát thương và hồi phục');
                break;
            case 'chest':
                world.openChest();
                break;
            case 'shard':
                world.gainShards(Math.max(1, Math.round(pickup.value)));
                break;
            case 'stat-shard':
                world.applyStatShard(pickup.statId || 'damage');
                break;
            case 'skill-crit-shard':
                world.gainSkillCritShard();
                break;
        }
        world.particles.burst(pickup.x, pickup.y, pickup.color, pickup.type === 'chest' ? 18 : 6, 115, 3);
        this.pool.release(pickup);
    }
    clear() {
        this.pool.releaseAll();
        this.magnetAllTime = 0;
    }
}
//# sourceMappingURL=LootSystem.js.map