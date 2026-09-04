import type { Player } from './Player.js';

export const EXP_REQUIREMENT_MULTIPLIER = 1.8;
export const EXPERIENCE_GAIN_MULTIPLIER = 1.25;

export class ExperienceSystem {
  private readonly player: Player;
  private readonly pendingLevels: number[] = [];

  public constructor(player: Player) {
    this.player = player;
    this.player.expToNext = this.threshold(this.player.level);
  }

  public gain(rawAmount: number): number {
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

  public hasPending(): boolean {
    return this.pendingLevels.length > 0;
  }

  public consumePending(): number | null {
    return this.pendingLevels.shift() ?? null;
  }

  public threshold(level: number): number {
    const baseRequirement = 24 + 13 * Math.pow(Math.max(1, level - 1), 1.24);
    return Math.round(baseRequirement * EXP_REQUIREMENT_MULTIPLIER);
  }
}
