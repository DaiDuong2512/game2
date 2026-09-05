import { clamp } from '../core/MathUtils.js';
const statKeys = [
    'maxHp', 'armor', 'moveSpeed', 'attackSpeed', 'critChance', 'critDamage', 'damage',
    'cooldownReduction', 'range', 'projectileSpeed', 'lifeSteal', 'hpRegen', 'dodge',
    'luck', 'expGain', 'goldGain',
    'bonusProjectiles', 'healingPower', 'armorPenetration', 'statusResistance',
    'bodyScale', 'flatBlock',
];
function zeroStats() {
    return {
        maxHp: 0, armor: 0, moveSpeed: 0, attackSpeed: 0, critChance: 0, critDamage: 0,
        damage: 0, cooldownReduction: 0, range: 0, projectileSpeed: 0, lifeSteal: 0,
        hpRegen: 0, dodge: 0, luck: 0, expGain: 0, goldGain: 0, bonusProjectiles: 0,
        healingPower: 0, armorPenetration: 0, statusResistance: 0, bodyScale: 0, flatBlock: 0,
    };
}
function oneStats() {
    return {
        maxHp: 1, armor: 1, moveSpeed: 1, attackSpeed: 1, critChance: 1, critDamage: 1,
        damage: 1, cooldownReduction: 1, range: 1, projectileSpeed: 1, lifeSteal: 1,
        hpRegen: 1, dodge: 1, luck: 1, expGain: 1, goldGain: 1, bonusProjectiles: 1,
        healingPower: 1, armorPenetration: 1, statusResistance: 1, bodyScale: 1, flatBlock: 1,
    };
}
const statDefaults = {
    maxHp: 1, armor: 0, moveSpeed: 120, attackSpeed: 1, critChance: 0.1, critDamage: 1.8,
    damage: 1, cooldownReduction: 0, range: 1, projectileSpeed: 1, lifeSteal: 0,
    hpRegen: 0, dodge: 0, luck: 0, expGain: 1, goldGain: 1, bonusProjectiles: 0,
    healingPower: 1, armorPenetration: 0, statusResistance: 0, bodyScale: 1, flatBlock: 0,
};
export const PERMANENT_POINT_EFFECTS = {
    attackSpeed: { mode: 'multiply', perPoint: 0.0025 },
    moveSpeed: { mode: 'multiply', perPoint: 0.002 },
    armor: { mode: 'add', perPoint: 0.12 },
    damage: { mode: 'multiply', perPoint: 0.003 },
    lifeSteal: { mode: 'add', perPoint: 0.0008 },
    luck: { mode: 'add', perPoint: 0.002 },
};
export function permanentPointEffect(stat, points) {
    const effect = PERMANENT_POINT_EFFECTS[stat];
    const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
    return { mode: effect.mode, value: effect.perPoint * safePoints };
}
function resolveStatValue(stat, input) {
    let value = input;
    switch (stat) {
        // Các chỉ số phần trăm phòng thủ/giảm hồi chiêu dùng đường cong tiệm cận:
        // cộng dồn mãi vẫn có ích nhưng không bao giờ tạo miễn nhiễm hay hồi chiêu 0.
        case 'cooldownReduction':
            value = 0.78 * (1 - Math.exp(-Math.max(0, value) / 0.78));
            break;
        case 'attackSpeed':
            value = Math.max(0.25, value);
            break;
        case 'moveSpeed':
            value = Math.max(80, value);
            break;
        case 'critChance':
            value = clamp(value, 0, 1);
            break;
        case 'critDamage':
            value = Math.max(1.25, value);
            break;
        case 'lifeSteal':
            value = 1 - Math.exp(-Math.max(0, value));
            break;
        case 'dodge':
            value = 0.65 * (1 - Math.exp(-Math.max(0, value) / 0.65));
            break;
        case 'range':
            value = Math.max(0.55, value);
            break;
        case 'projectileSpeed':
            value = Math.max(0.5, value);
            break;
        case 'armor':
            value = Math.max(0, value);
            break;
        case 'maxHp':
            value = Math.max(1, value);
            break;
        case 'bonusProjectiles':
            value = Math.max(0, Math.floor(value));
            break;
        case 'healingPower':
            value = Math.max(0, value);
            break;
        case 'armorPenetration':
            value = 1 - Math.exp(-Math.max(0, value));
            break;
        case 'statusResistance':
            value = 1 - Math.exp(-Math.max(0, value));
            break;
        case 'bodyScale':
            value = Math.max(0.5, value);
            break;
        case 'flatBlock':
            value = Math.max(0, value);
            break;
        default: break;
    }
    return value;
}
export class PlayerStats {
    base;
    additive = zeroStats();
    multipliers = oneStats();
    constructor(base) {
        this.base = { ...statDefaults, ...base };
    }
    applyMeta(configs, levels) {
        for (const config of configs) {
            const level = levels[config.id] ?? 0;
            if (level <= 0)
                continue;
            const value = config.perLevel * level;
            const multiplicative = ['damage', 'moveSpeed', 'expGain', 'goldGain'].includes(config.stat);
            this.apply(config.stat, value, multiplicative ? 'multiply' : 'add');
        }
    }
    applyPassive(config, levels = 1) {
        const amount = config.perLevel * levels;
        this.apply(config.stat, amount, config.mode);
        if (config.secondaryStat && config.secondaryPerLevel !== undefined) {
            this.apply(config.secondaryStat, config.secondaryPerLevel * levels, config.mode);
        }
        if (config.id === 'giant-bloodline') {
            this.apply('maxHp', 0.025 * levels, 'multiply');
            this.apply('range', 0.012 * levels, 'multiply');
        }
    }
    applyPermanentPoints(points) {
        for (const stat of Object.keys(PERMANENT_POINT_EFFECTS)) {
            const effect = permanentPointEffect(stat, points[stat] ?? 0);
            if (effect.value > 0)
                this.apply(stat, effect.value, effect.mode);
        }
    }
    apply(stat, value, mode) {
        if (mode === 'add')
            this.additive[stat] += value;
        else
            this.multipliers[stat] *= 1 + value;
    }
    get(stat) {
        return resolveStatValue(stat, (this.base[stat] + this.additive[stat]) * this.multipliers[stat]);
    }
    /** Xem trước giá trị hiệu lực mà không thay đổi build hiện tại. */
    preview(stat, value, mode) {
        const additive = this.additive[stat] + (mode === 'add' ? value : 0);
        const multiplier = this.multipliers[stat] * (mode === 'multiply' ? 1 + value : 1);
        return resolveStatValue(stat, (this.base[stat] + additive) * multiplier);
    }
    snapshot() {
        const output = zeroStats();
        for (const key of statKeys)
            output[key] = this.get(key);
        return output;
    }
}
//# sourceMappingURL=PlayerStats.js.map