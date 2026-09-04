import type { EvolutionConfig, WeaponConfig, WeaponLevelConfig, WeaponRuntime, WeaponSlot } from '../core/Types.js';

export abstract class WeaponBase<TWorld> {
  public readonly config: WeaponConfig;
  public readonly runtime: WeaponRuntime;

  protected constructor(config: WeaponConfig, slot: WeaponSlot) {
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

  public levelData(): WeaponLevelConfig {
    return this.config.levels[Math.max(0, Math.min(this.config.levels.length - 1, this.runtime.level - 1))] as WeaponLevelConfig;
  }

  public levelUp(): boolean {
    if (this.runtime.level >= this.config.maxLevel) return false;
    this.runtime.level += 1;
    return true;
  }

  public addMastery(): void {
    this.runtime.masteryLevel += 1;
  }

  public evolve(evolution: EvolutionConfig): void {
    this.runtime.evolutionId = evolution.id;
    this.runtime.cooldown = Math.min(this.runtime.cooldown, 0.12);
  }

  public abstract update(dt: number, world: TWorld): void;
}
