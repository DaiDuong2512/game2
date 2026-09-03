export class EvolutionSystem {
    data;
    constructor(data) {
        this.data = data;
    }
    eligible(weapons, passiveLevels) {
        return this.data.evolutions.filter((evolution) => weapons.levelOf(evolution.weapon) >= 8
            && weapons.evolutionOf(evolution.weapon) === null
            && (passiveLevels.get(evolution.passive) ?? 0) > 0);
    }
}
//# sourceMappingURL=EvolutionSystem.js.map