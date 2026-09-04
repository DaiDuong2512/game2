import type { EvolutionConfig, GameData } from '../core/Types.js';
import type { WeaponSystem } from './WeaponSystem.js';

export class EvolutionSystem {
  private readonly data: GameData;

  public constructor(data: GameData) {
    this.data = data;
  }

  public eligible(weapons: WeaponSystem, passiveLevels: ReadonlyMap<string, number>): EvolutionConfig[] {
    return this.data.evolutions.filter((evolution) =>
      weapons.levelOf(evolution.weapon) >= 8
      && weapons.evolutionOf(evolution.weapon) === null
      && (passiveLevels.get(evolution.passive) ?? 0) > 0,
    );
  }
}
