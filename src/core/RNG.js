export class RNG {
    state;
    constructor(seed) {
        this.state = (seed >>> 0) || 0x6d2b79f5;
    }
    nextUint() {
        let value = this.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.state = value >>> 0;
        return this.state;
    }
    next() {
        return this.nextUint() / 0x1_0000_0000;
    }
    float(min = 0, max = 1) {
        return min + (max - min) * this.next();
    }
    int(min, maxInclusive) {
        if (maxInclusive <= min)
            return min;
        return min + Math.floor(this.next() * (maxInclusive - min + 1));
    }
    chance(probability) {
        return this.next() < probability;
    }
    pick(items) {
        if (items.length === 0)
            return undefined;
        return items[this.int(0, items.length - 1)];
    }
    weighted(choices) {
        let total = 0;
        for (const choice of choices)
            total += Math.max(0, choice.weight);
        if (total <= 0)
            return choices[0]?.item;
        let cursor = this.float(0, total);
        for (const choice of choices) {
            cursor -= Math.max(0, choice.weight);
            if (cursor <= 0)
                return choice.item;
        }
        return choices.at(-1)?.item;
    }
    shuffle(items) {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = this.int(0, index);
            const current = result[index];
            result[index] = result[swapIndex];
            result[swapIndex] = current;
        }
        return result;
    }
    fork(salt) {
        return new RNG((this.nextUint() ^ salt) >>> 0);
    }
    getSeedState() {
        return this.state >>> 0;
    }
}
//# sourceMappingURL=RNG.js.map