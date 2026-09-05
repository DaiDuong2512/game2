import { formatDecimal } from '../core/MathUtils.js';
import { EvolutionSystem } from './EvolutionSystem.js';
const endlessStats = new Set([
    'damage', 'bonusProjectiles', 'attackSpeed', 'hpRegen', 'healingPower', 'maxHp',
    'armor', 'armorPenetration', 'moveSpeed', 'statusResistance', 'range',
    'projectileSpeed', 'lifeSteal', 'bodyScale', 'flatBlock',
]);
export class UpgradeSystem {
    data;
    rng;
    player;
    weapons;
    evolutions;
    passives = new Map();
    banished = new Set();
    current = [];
    starterCurrent = [];
    currentChoiceLevel = null;
    rerolls = 2;
    banishes = 2;
    constructor(data, rng, player, weapons) {
        this.data = data;
        this.rng = rng;
        this.player = player;
        this.weapons = weapons;
        this.evolutions = new EvolutionSystem(data);
    }
    generateStarterOptions() {
        const buffs = [
            { id: 'starter-damage', name: 'Lõi sức mạnh', description: '+6% sát thương trong trận.', stat: 'damage', mode: 'multiply', value: 0.06 },
            { id: 'starter-speed', name: 'Nhịp chiến đấu', description: '+5% tốc đánh trong trận.', stat: 'attackSpeed', mode: 'multiply', value: 0.05 },
            { id: 'starter-hp', name: 'Sinh lực dự phòng', description: '+10% Sinh lực tối đa trong trận.', stat: 'maxHp', mode: 'multiply', value: 0.1 },
            { id: 'starter-armor', name: 'Lớp giáp phụ', description: '+1 giáp trong trận.', stat: 'armor', mode: 'add', value: 1 },
            { id: 'starter-lifesteal', name: 'Mạch hút sinh lực', description: '+0,8% hút máu trong trận.', stat: 'lifeSteal', mode: 'add', value: 0.008 },
            { id: 'starter-regen', name: 'Tự sửa chữa', description: '+0,25 Sinh lực hồi mỗi giây.', stat: 'hpRegen', mode: 'add', value: 0.25 },
            { id: 'starter-move', name: 'Bước chân nhẹ', description: '+4% tốc độ di chuyển.', stat: 'moveSpeed', mode: 'multiply', value: 0.04 },
            { id: 'starter-luck', name: 'Dấu ấn may mắn', description: '+5% may mắn trong trận.', stat: 'luck', mode: 'add', value: 0.05 },
        ];
        if (!this.weapons.canAddAuxiliary()) {
            this.starterCurrent = [];
            return [];
        }
        const candidates = this.rng.shuffle(this.data.weapons.filter((weapon) => !this.weapons.has(weapon.id))).slice(0, 3);
        const starterBuffs = this.rng.shuffle(buffs).slice(0, candidates.length);
        this.starterCurrent = candidates.map((weapon, index) => {
            // Ba lựa chọn đầu trận luôn khác cả vũ khí lẫn hướng phát triển. Điều này
            // tránh màn chọn đồ giả, ví dụ cả ba thẻ cùng tăng sát thương.
            const buff = starterBuffs[index] ?? buffs[index % buffs.length];
            return {
                id: `starter:${weapon.id}:${buff.id}`,
                weaponId: weapon.id,
                title: weapon.name,
                description: weapon.description,
                icon: weapon.icon,
                buff: { ...buff },
            };
        });
        return [...this.starterCurrent];
    }
    applyStarter(optionId) {
        const option = this.starterCurrent.find((item) => item.id === optionId);
        if (!option || !this.weapons.addAuxiliaryWeapon(option.weaponId))
            return false;
        const previousMaxHp = this.player.stats.get('maxHp');
        this.player.stats.apply(option.buff.stat, option.buff.value, option.buff.mode);
        if (option.buff.secondaryStat && option.buff.secondaryValue !== undefined) {
            this.player.stats.apply(option.buff.secondaryStat, option.buff.secondaryValue, 'add');
        }
        this.player.syncMaxHp(previousMaxHp);
        this.starterCurrent = [];
        return true;
    }
    generateOptions(choiceLevel = this.player.level) {
        this.currentChoiceLevel = choiceLevel;
        const weaponMilestone = choiceLevel > 1 && choiceLevel % 5 === 0;
        const optionCount = weaponMilestone ? 3 : this.player.character.passive.kind === 'extra-choice' ? 4 : 3;
        const pool = [];
        const passiveLevels = new Map([...this.passives.entries()].map(([id, runtime]) => [id, runtime.level]));
        if (weaponMilestone) {
            for (const evolution of this.evolutions.eligible(this.weapons, passiveLevels)) {
                const weapon = this.data.weaponById.get(evolution.weapon);
                if (!weapon || this.isBanished('evolution', evolution.id))
                    continue;
                pool.push({
                    id: `evolution:${evolution.id}`,
                    type: 'evolution',
                    title: evolution.name,
                    description: evolution.description,
                    icon: weapon.icon,
                    rarity: this.legendaryRarity(),
                    targetId: evolution.id,
                });
            }
        }
        if (weaponMilestone) {
            for (const weapon of this.data.weapons) {
                if (this.isBanished('weapon', weapon.id))
                    continue;
                const entry = this.weapons.entries().find((item) => item.config.id === weapon.id);
                const level = entry?.runtime.level ?? 0;
                if (level > 0 && level < weapon.maxLevel) {
                    pool.push({
                        id: `weapon-level:${weapon.id}`,
                        type: 'weapon-level',
                        title: weapon.name,
                        description: this.weaponLevelDescription(weapon.id, level + 1),
                        icon: weapon.icon,
                        rarity: this.rollRarity(),
                        targetId: weapon.id,
                        nextLevel: level + 1,
                    });
                }
                else if (level >= weapon.maxLevel && entry) {
                    pool.push({
                        id: `weapon-mastery:${weapon.id}`,
                        type: 'weapon-mastery',
                        title: `Tinh thông: ${weapon.name}`,
                        description: `Tăng 8% sát thương riêng của ${weapon.name}; có thể cộng dồn vô hạn.`,
                        icon: weapon.icon,
                        rarity: this.rollRarity(),
                        targetId: weapon.id,
                        nextLevel: entry.runtime.masteryLevel + 1,
                    });
                }
                else if (level === 0 && this.weapons.canAddAuxiliary()) {
                    pool.push({
                        id: `weapon-new:${weapon.id}`,
                        type: 'weapon-new',
                        title: weapon.name,
                        description: weapon.description,
                        icon: weapon.icon,
                        rarity: this.rollRarity(),
                        targetId: weapon.id,
                        nextLevel: 1,
                    });
                }
            }
        }
        if (!weaponMilestone)
            for (const passive of this.data.passives) {
                if (this.isBanished('passive', passive.id))
                    continue;
                const level = this.passives.get(passive.id)?.level ?? 0;
                const endless = endlessStats.has(passive.stat) || (passive.secondaryStat ? endlessStats.has(passive.secondaryStat) : false);
                if (level > 0 && (level < passive.maxLevel || endless)) {
                    pool.push({
                        id: `passive-level:${passive.id}`,
                        type: 'passive-level',
                        title: passive.name,
                        description: passive.description,
                        icon: passive.icon,
                        rarity: this.rollRarity(),
                        targetId: passive.id,
                        nextLevel: level + 1,
                    });
                }
                else if (level === 0 && this.passives.size < 6) {
                    pool.push({
                        id: `passive-new:${passive.id}`,
                        type: 'passive-new',
                        title: passive.name,
                        description: passive.description,
                        icon: passive.icon,
                        rarity: this.rollRarity(),
                        targetId: passive.id,
                        nextLevel: 1,
                    });
                }
            }
        if (!weaponMilestone)
            for (const boost of this.data.upgrades.statBoosts) {
                if (this.isBanished('stat', boost.id))
                    continue;
                // Hồi máu khi đang gần đầy Sinh lực là một lựa chọn rỗng. Loại thẻ này
                // khỏi lượt hiện tại, nhưng tự động đưa trở lại khi người chơi bị thương.
                if (boost.kind === 'heal' && this.player.health >= this.player.stats.get('maxHp') * 0.88)
                    continue;
                pool.push({
                    id: `stat:${boost.id}`,
                    type: 'stat',
                    title: boost.name,
                    description: boost.description,
                    icon: boost.icon,
                    rarity: this.rollRarity(),
                    targetId: boost.id,
                    statBoost: boost,
                });
            }
        const guaranteedEvolutions = pool.filter((option) => option.type === 'evolution');
        const normalPool = pool.filter((option) => option.type !== 'evolution');
        const selected = guaranteedEvolutions.slice(0, 1);
        // Mỗi lượt nên có ít nhất một quyết định giúp hoàn thiện build hiện tại.
        // Ưu tiên cặp Tiến Hóa, sau đó mới tới nâng cấp vũ khí/passive đang sở hữu.
        if (selected.length === 0) {
            const synergy = normalPool.filter((option) => this.isEvolutionSynergy(option));
            const focus = this.weightedOption(synergy)
                ?? this.weightedOption(normalPool.filter((option) => option.type === 'weapon-level' || option.type === 'passive-level'));
            if (focus)
                selected.push(focus);
        }
        while (selected.length < optionCount) {
            const candidates = normalPool.filter((option) => !selected.some((existing) => existing.id === option.id || existing.targetId === option.targetId)
                && !(option.type === 'weapon-new' && selected.some((existing) => existing.type === 'weapon-new')));
            const option = this.weightedOption(candidates);
            if (!option)
                break;
            selected.push(option);
        }
        // Giữ độ đa dạng khi pool còn rộng, nhưng không để giới hạn một vũ khí mới
        // làm màn mốc hụt thẻ sau Banish. Khi không còn loại hợp lệ khác, nhiều
        // weapon-new vẫn là các lựa chọn khác mục tiêu và có thể lấp đủ ba ô.
        while (selected.length < optionCount) {
            const candidates = normalPool.filter((option) => !selected.some((existing) => existing.id === option.id || existing.targetId === option.targetId));
            const option = this.weightedOption(candidates);
            if (!option)
                break;
            selected.push(option);
        }
        this.current = selected;
        return [...this.current];
    }
    reroll() {
        if (this.rerolls <= 0)
            return null;
        this.rerolls -= 1;
        return this.generateOptions(this.currentChoiceLevel ?? this.player.level);
    }
    banish(optionId) {
        if (this.banishes <= 0)
            return null;
        const option = this.current.find((item) => item.id === optionId);
        if (!option)
            return null;
        this.banishes -= 1;
        const category = option.type.startsWith('weapon') ? 'weapon' : option.type.startsWith('passive') ? 'passive' : option.type;
        this.banished.add(`${category}:${option.targetId}`);
        return this.generateOptions(this.currentChoiceLevel ?? this.player.level);
    }
    apply(optionId) {
        const option = this.current.find((item) => item.id === optionId);
        if (!option)
            return false;
        const previousMaxHp = this.player.stats.get('maxHp');
        let applied = false;
        switch (option.type) {
            case 'weapon-new':
                applied = this.weapons.addAuxiliaryWeapon(option.targetId);
                break;
            case 'weapon-level':
                applied = this.weapons.levelWeapon(option.targetId);
                break;
            case 'weapon-mastery':
                applied = this.weapons.masterWeapon(option.targetId);
                break;
            case 'passive-new':
            case 'passive-level': {
                const config = this.data.passiveById.get(option.targetId);
                if (!config)
                    break;
                const runtime = this.passives.get(option.targetId) ?? { id: option.targetId, level: 0 };
                const endless = endlessStats.has(config.stat) || (config.secondaryStat ? endlessStats.has(config.secondaryStat) : false);
                if (runtime.level >= config.maxLevel && !endless)
                    break;
                runtime.level += 1;
                this.passives.set(option.targetId, runtime);
                this.player.stats.applyPassive(config, 1);
                applied = true;
                break;
            }
            case 'evolution': {
                const evolution = this.data.evolutionById.get(option.targetId);
                if (evolution)
                    applied = this.weapons.evolve(evolution.weapon, evolution.id);
                break;
            }
            case 'stat':
                applied = option.statBoost ? this.applyStatBoost(option.statBoost, option.rarity.multiplier) : false;
                break;
        }
        if (applied && option.type.startsWith('weapon')) {
            const rarityBonus = Math.max(0, option.rarity.multiplier - 1) * 0.025;
            if (rarityBonus > 0)
                this.weapons.refineWeapon(option.targetId, rarityBonus);
        }
        else if (applied && option.type !== 'stat' && option.type !== 'evolution') {
            const rarityBonus = Math.max(0, option.rarity.multiplier - 1) * 0.025;
            if (rarityBonus > 0)
                this.player.stats.apply('damage', rarityBonus, 'multiply');
        }
        this.player.syncMaxHp(previousMaxHp);
        return applied;
    }
    applyStatBoost(boost, rarityMultiplier) {
        if (boost.kind === 'heal') {
            this.player.heal(this.player.stats.get('maxHp') * boost.value * rarityMultiplier);
            return true;
        }
        if (!boost.stat)
            return false;
        const mode = boost.mode ?? 'add';
        this.player.stats.apply(boost.stat, boost.value * rarityMultiplier, mode);
        if (boost.kind === 'dual-stat' && boost.secondaryStat && boost.secondaryValue !== undefined) {
            this.player.stats.apply(boost.secondaryStat, boost.secondaryValue * rarityMultiplier, 'add');
        }
        if (boost.id === 'giant-form') {
            this.player.stats.apply('maxHp', 0.04 * rarityMultiplier, 'multiply');
            this.player.stats.apply('range', 0.02 * rarityMultiplier, 'multiply');
        }
        return true;
    }
    weaponLevelDescription(id, nextLevel) {
        const config = this.data.weaponById.get(id);
        const level = config?.levels[nextLevel - 1];
        if (!config || !level)
            return 'Tăng sức mạnh vũ khí.';
        const stackedBonus = this.player.stats.get('bonusProjectiles');
        const totalProjectiles = level.count + stackedBonus;
        const projectileBreakdown = stackedBonus > 0
            ? `${totalProjectiles} tia (${level.count} cơ bản + ${stackedBonus} cộng dồn)`
            : `${totalProjectiles} tia`;
        return `Cấp ${nextLevel}: ${Math.round(level.damage)} sát thương, ${projectileBreakdown}, xuyên ${level.pierce} mục tiêu, hồi chiêu ${formatDecimal(level.cooldown, 2)} giây.`;
    }
    rollRarity() {
        const luck = this.player.stats.get('luck');
        const choices = this.data.upgrades.rarities.map((rarity) => {
            let weight = rarity.weight;
            if (rarity.id === 'common')
                weight *= Math.max(0.25, 1 - luck * 1.4);
            if (rarity.id === 'rare')
                weight *= 1 + luck * 0.7;
            if (rarity.id === 'epic')
                weight *= 1 + luck * 1.7;
            if (rarity.id === 'legendary')
                weight *= 1 + luck * 3.2 + (this.player.character.passive.kind === 'extra-choice' ? 0.6 : 0);
            return { item: rarity, weight };
        });
        return this.rng.weighted(choices) ?? this.data.upgrades.rarities[0];
    }
    legendaryRarity() {
        return this.data.upgrades.rarities.find((rarity) => rarity.id === 'legendary') ?? this.data.upgrades.rarities.at(-1);
    }
    weightedOption(options) {
        if (options.length === 0)
            return undefined;
        const auxiliaryCount = this.weapons.auxiliaryCount();
        const passiveCount = this.passives.size;
        const choices = options.map((option) => {
            let weight = 1;
            switch (option.type) {
                case 'weapon-level':
                    weight = 3.8;
                    break;
                case 'weapon-mastery':
                    weight = 3.4;
                    break;
                case 'passive-level':
                    weight = 3.15;
                    break;
                case 'weapon-new':
                    weight = auxiliaryCount === 0 ? 1.35 : auxiliaryCount === 1 ? 0.85 : auxiliaryCount === 2 ? 0.48 : 0;
                    break;
                case 'passive-new':
                    weight = passiveCount < 3 ? 1.6 : passiveCount < 5 ? 0.9 : 0.48;
                    break;
                case 'stat':
                    weight = 1.15;
                    break;
                case 'evolution':
                    weight = 8;
                    break;
            }
            if (this.isEvolutionSynergy(option))
                weight *= 2.6;
            return { item: option, weight };
        });
        return this.rng.weighted(choices);
    }
    isEvolutionSynergy(option) {
        for (const evolution of this.data.evolutions) {
            if (this.weapons.evolutionOf(evolution.weapon))
                continue;
            if (option.targetId === evolution.passive
                && this.weapons.has(evolution.weapon)
                && this.passiveLevel(evolution.passive) === 0)
                return true;
            if (option.targetId === evolution.weapon && this.passiveLevel(evolution.passive) > 0)
                return true;
        }
        return false;
    }
    isBanished(category, id) {
        return this.banished.has(`${category}:${id}`);
    }
    passiveEntries() {
        return [...this.passives.values()];
    }
    passiveLevel(id) {
        return this.passives.get(id)?.level ?? 0;
    }
    scheduledChoiceLevel() {
        return this.currentChoiceLevel;
    }
}
//# sourceMappingURL=UpgradeSystem.js.map