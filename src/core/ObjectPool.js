export class ObjectPool {
    items;
    factory;
    hardLimit;
    freeIndices = [];
    isFree = [];
    itemIndices = new Map();
    constructor(factory, initialSize, hardLimit) {
        this.factory = factory;
        this.hardLimit = hardLimit;
        this.items = Array.from({ length: initialSize }, factory);
        // Push in reverse order so the first acquisitions retain the pool's
        // previous, deterministic item order while still using O(1) stack pops.
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            if (!item)
                continue;
            this.itemIndices.set(item, index);
            const available = !item.active;
            this.isFree[index] = available;
            if (available)
                this.freeIndices.push(index);
        }
    }
    acquire() {
        while (this.freeIndices.length > 0) {
            const index = this.freeIndices.pop();
            if (index === undefined || this.isFree[index] !== true)
                continue;
            this.isFree[index] = false;
            const item = this.items[index];
            if (!item || item.active)
                continue;
            item.active = true;
            return item;
        }
        if (this.items.length >= this.hardLimit)
            return null;
        const item = this.factory();
        const index = this.items.length;
        item.active = true;
        this.items.push(item);
        this.itemIndices.set(item, index);
        this.isFree[index] = false;
        return item;
    }
    release(item) {
        if (!item.active)
            return;
        item.reset();
        item.active = false;
        const index = this.itemIndices.get(item);
        if (index === undefined || this.isFree[index] === true)
            return;
        this.isFree[index] = true;
        this.freeIndices.push(index);
    }
    releaseAll() {
        for (const item of this.items) {
            if (item.active)
                this.release(item);
        }
    }
    activeItems() {
        return this.items.filter((item) => item.active);
    }
    forEachActive(callback) {
        for (const item of this.items) {
            if (item.active)
                callback(item);
        }
    }
    countActive() {
        let count = 0;
        for (const item of this.items)
            if (item.active)
                count += 1;
        return count;
    }
    allItems() {
        return this.items;
    }
    capacity() {
        return this.items.length;
    }
}
//# sourceMappingURL=ObjectPool.js.map