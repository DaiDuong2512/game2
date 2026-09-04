export interface WeightedChoice<T> {
  item: T;
  weight: number;
}

export class RNG {
  private state: number;

  public constructor(seed: number) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  public nextUint(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  public next(): number {
    return this.nextUint() / 0x1_0000_0000;
  }

  public float(min = 0, max = 1): number {
    return min + (max - min) * this.next();
  }

  public int(min: number, maxInclusive: number): number {
    if (maxInclusive <= min) return min;
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  public weighted<T>(choices: readonly WeightedChoice<T>[]): T | undefined {
    let total = 0;
    for (const choice of choices) total += Math.max(0, choice.weight);
    if (total <= 0) return choices[0]?.item;
    let cursor = this.float(0, total);
    for (const choice of choices) {
      cursor -= Math.max(0, choice.weight);
      if (cursor <= 0) return choice.item;
    }
    return choices.at(-1)?.item;
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      const current = result[index];
      result[index] = result[swapIndex] as T;
      result[swapIndex] = current as T;
    }
    return result;
  }

  public fork(salt: number): RNG {
    return new RNG((this.nextUint() ^ salt) >>> 0);
  }

  public getSeedState(): number {
    return this.state >>> 0;
  }
}
