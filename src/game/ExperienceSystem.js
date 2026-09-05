export const EXP_REQUIREMENT_MULTIPLIER = 1.8;
export const EXPERIENCE_GAIN_MULTIPLIER = 1.25;
export class ExperienceSystem {
    player;
    pendingLevels = [];
    constructor(player) {
        this.player = player;
        this.player.expToNext = this.threshold(this.player.level);
    }
    gain(rawAmount) {
        const amount = rawAmount * EXPERIENCE_GAIN_MULTIPLIER * this.player.stats.get('expGain');
        this.player.exp += amount;
        let gained = 0;
        while (this.player.exp >= this.player.expToNext) {
            this.player.exp -= this.player.expToNext;
            this.player.level += 1;
            this.player.expToNext = this.threshold(this.player.level);
            this.pendingLevels.push(this.player.level);
            gained += 1;
        }
        return gained;
    }
    hasPending() {
        return this.pendingLevels.length > 0;
    }
    consumePending() {
        return this.pendingLevels.shift() ?? null;
    }
    threshold(level) {
        const baseRequirement = 24 + 13 * Math.pow(Math.max(1, level - 1), 1.24);
        return Math.round(baseRequirement * EXP_REQUIREMENT_MULTIPLIER);
    }
}
//# sourceMappingURL=ExperienceSystem.js.map