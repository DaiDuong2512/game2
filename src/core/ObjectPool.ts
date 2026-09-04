export interface Poolable {
  active: boolean;
  reset(): void;
}

export class ObjectPool<T extends Poolable> {
  private readonly items: T[];
  private readonly factory: () => T;
  private readonly hardLimit: number;
  private readonly freeIndices: number[] = [];
  private readonly isFree: boolean[] = [];
  private readonly itemIndices = new Map<T, number>();

  public constructor(factory: () => T, initialSize: number, hardLimit: number) {
    this.factory = factory;
    this.hardLimit = hardLimit;
    this.items = Array.from({ length: initialSize }, factory);

    // Push in reverse order so the first acquisitions retain the pool's
    // previous, deterministic item order while still using O(1) stack pops.
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (!item) continue;
      this.itemIndices.set(item, index);
      const available = !item.active;
      this.isFree[index] = available;
      if (available) this.freeIndices.push(index);
    }
  }

  public acquire(): T | null {
    while (this.freeIndices.length > 0) {
      const index = this.freeIndices.pop();
      if (index === undefined || this.isFree[index] !== true) continue;

      this.isFree[index] = false;
      const item = this.items[index];
      if (!item || item.active) continue;

      item.active = true;
      return item;
    }

    if (this.items.length >= this.hardLimit) return null;

    const item = this.factory();
    const index = this.items.length;
    item.active = true;
    this.items.push(item);
    this.itemIndices.set(item, index);
    this.isFree[index] = false;
    return item;
  }

  public release(item: T): void {
    if (!item.active) return;
    item.reset();
    item.active = false;

    const index = this.itemIndices.get(item);
    if (index === undefined || this.isFree[index] === true) return;
    this.isFree[index] = true;
    this.freeIndices.push(index);
  }

  public releaseAll(): void {
    for (const item of this.items) {
      if (item.active) this.release(item);
    }
  }

  public activeItems(): T[] {
    return this.items.filter((item) => item.active);
  }

  public forEachActive(callback: (item: T) => void): void {
    for (const item of this.items) {
      if (item.active) callback(item);
    }
  }

  public countActive(): number {
    let count = 0;
    for (const item of this.items) if (item.active) count += 1;
    return count;
  }

  public allItems(): readonly T[] {
    return this.items;
  }

  public capacity(): number {
    return this.items.length;
  }
}
