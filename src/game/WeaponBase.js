export class WeaponBase {
    config;
    runtime;
    constructor(config, slot) {
        this.config = config;
        this.runtime = {
            id: config.id,
            slot,
            level: 1,
            masteryLevel: 0,
            refinementBonus: 0,
            cooldown: 0.15,
            damageDealt: 0,
            evolutionId: null,
            orbitHitClock: 0,
            summonAngle: 0,
        };
    }
    levelData() {
        return this.config.levels[Math.max(0, Math.min(this.config.levels.length - 1, this.runtime.level - 1))];
    }
    levelUp() {
        if (this.runtime.level >= this.config.maxLevel)
            return false;
        this.runtime.level += 1;
        return true;
    }
    addMastery() {
        this.runtime.masteryLevel += 1;
    }
    evolve(evolution) {
        this.runtime.evolutionId = evolution.id;
        this.runtime.cooldown = Math.min(this.runtime.cooldown, 0.12);
    }
}
//# sourceMappingURL=WeaponBase.js.map