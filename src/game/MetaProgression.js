import { RNG } from '../core/RNG.js';
export class MetaProgression {
    data;
    saveSystem;
    constructor(data, saveSystem) {
        this.data = data;
        this.saveSystem = saveSystem;
    }
    cost(config) {
        const level = this.level(config.id);
        const rawCost = config.baseCost * Math.pow(config.costGrowth, level);
        if (!Number.isFinite(rawCost) || rawCost >= Number.MAX_SAFE_INTEGER)
            return Number.MAX_SAFE_INTEGER;
        return Math.max(1, Math.round(rawCost));
    }
    level(id) {
        const savedLevel = this.saveSystem.data.metaLevels[id] ?? 0;
        return Number.isSafeInteger(savedLevel) && savedLevel > 0 ? savedLevel : 0;
    }
    purchase(id) {
        const config = this.data.metaUpgrades.find((item) => item.id === id);
        if (!config)
            return false;
        const level = this.level(id);
        if (level >= Number.MAX_SAFE_INTEGER)
            return false;
        const cost = this.cost(config);
        if (this.saveSystem.data.goldReserve < cost)
            return false;
        this.saveSystem.data.goldReserve -= cost;
        this.saveSystem.data.metaLevels[id] = level + 1;
        this.saveSystem.save();
        return true;
    }
    commitRun(stats, stageRewardGold, stageRewardShards) {
        const save = this.saveSystem.data;
        save.recordedRuns += 1;
        save.goldReserve += stats.gold + (stats.result === 'victory' ? stageRewardGold : 0);
        save.riftShards += stats.shards + (stats.result === 'victory' ? stageRewardShards : 0);
        if (stats.result === 'victory') {
            save.highestCompletedStage = Math.max(save.highestCompletedStage, Math.min(20, stats.stageIndex));
            save.highestStage = Math.max(save.highestStage, Math.min(20, stats.stageIndex + 1));
        }
        const unlocked = [];
        for (const character of this.data.characters) {
            if (character.unlockStage <= save.highestStage && !save.unlockedCharacters.includes(character.id)) {
                save.unlockedCharacters.push(character.id);
                unlocked.push(character.name);
            }
        }
        this.saveSystem.save();
        return unlocked;
    }
    prepareVictoryRewards(stats) {
        const save = this.saveSystem.data;
        if (stats.result !== 'victory')
            return [];
        if (save.pendingPermanentChoices.length > 0)
            return [...save.pendingPermanentChoices];
        const rng = new RNG((stats.seed ^ Math.imul(stats.stageIndex + 1, 0x9e3779b1)) >>> 0);
        const statsPool = ['attackSpeed', 'moveSpeed', 'armor', 'damage', 'lifeSteal', 'luck'];
        for (let index = 0; index < 10; index += 1) {
            const stat = rng.pick(statsPool) ?? 'damage';
            save.permanentPoints[stat] = (save.permanentPoints[stat] ?? 0) + 1;
        }
        const labels = {
            attackSpeed: { title: 'Nhịp đánh bền vững', description: 'Tăng vĩnh viễn tốc đánh cơ bản.' },
            moveSpeed: { title: 'Bước chân tiền tuyến', description: 'Tăng vĩnh viễn tốc độ di chuyển.' },
            armor: { title: 'Gia cố giáp', description: 'Tăng vĩnh viễn giáp cơ bản.' },
            damage: { title: 'Lõi sát thương', description: 'Tăng vĩnh viễn toàn bộ sát thương.' },
            lifeSteal: { title: 'Mạch hút sinh lực', description: 'Tăng vĩnh viễn hút máu.' },
            luck: { title: 'Vận may khe nứt', description: 'Tăng vĩnh viễn May mắn và cơ hội rơi mảnh.' },
        };
        save.pendingPermanentChoices = rng.shuffle(statsPool).slice(0, 3).map((stat, index) => ({
            id: `stage-${stats.stageIndex}-${stats.seed}-${index}-${stat}`,
            stat,
            title: labels[stat].title,
            description: `${labels[stat].description} Nhận thêm 5 điểm chỉ số.`,
            points: 5,
        }));
        save.pendingPermanentStage = stats.stageIndex;
        this.saveSystem.save();
        return [...save.pendingPermanentChoices];
    }
    claimPermanentReward(choiceId) {
        const save = this.saveSystem.data;
        const choice = save.pendingPermanentChoices.find((item) => item.id === choiceId);
        if (!choice)
            return false;
        save.permanentPoints[choice.stat] = (save.permanentPoints[choice.stat] ?? 0) + choice.points;
        save.pendingPermanentChoices = [];
        save.pendingPermanentStage = 0;
        this.saveSystem.save();
        return true;
    }
    pendingPermanentRewards() {
        return this.saveSystem.data.pendingPermanentChoices;
    }
}
//# sourceMappingURL=MetaProgression.js.map