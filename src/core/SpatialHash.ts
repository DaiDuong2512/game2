export interface SpatialItem {
  id: number;
  active: boolean;
  x: number;
  y: number;
  radius: number;
}

export class SpatialHash<T extends SpatialItem> {
  private readonly cellSize: number;
  private readonly rows = new Map<number, Map<number, T[]>>();
  private readonly freeRows: Map<number, T[]>[] = [];
  private readonly freeCells: T[][] = [];
  private readonly seenGeneration = new Map<number, number>();
  private queryGeneration = 0;
  private queryDepth = 0;

  public constructor(cellSize = 128) {
    this.cellSize = cellSize;
  }

  public clear(): void {
    for (const row of this.rows.values()) {
      for (const list of row.values()) {
        list.length = 0;
        this.freeCells.push(list);
      }
      row.clear();
      this.freeRows.push(row);
    }
    this.rows.clear();
  }

  public insert(item: T): void {
    if (!item.active) return;
    const minX = Math.floor((item.x - item.radius) / this.cellSize);
    const maxX = Math.floor((item.x + item.radius) / this.cellSize);
    const minY = Math.floor((item.y - item.radius) / this.cellSize);
    const maxY = Math.floor((item.y + item.radius) / this.cellSize);
    for (let y = minY; y <= maxY; y += 1) {
      let row = this.rows.get(y);
      if (!row) {
        row = this.freeRows.pop() ?? new Map<number, T[]>();
        this.rows.set(y, row);
      }
      for (let x = minX; x <= maxX; x += 1) {
        const list = row.get(x);
        if (list) list.push(item);
        else {
          const nextList = this.freeCells.pop() ?? [];
          nextList.push(item);
          row.set(x, nextList);
        }
      }
    }
  }

  public rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  public queryCircle(x: number, y: number, radius: number): readonly T[] {
    // Results remain invocation-owned because callers can retain them. The
    // common, non-reentrant path avoids allocating a Set by tagging ids with a
    // monotonically increasing query generation. A rare nested query uses its
    // own Set so it cannot overwrite the outer query's generation tags.
    const result: T[] = [];
    const isNestedQuery = this.queryDepth > 0;
    const nestedSeen = isNestedQuery ? new Set<number>() : null;
    let generation = 0;
    if (!isNestedQuery) {
      if (this.queryGeneration >= Number.MAX_SAFE_INTEGER) {
        this.seenGeneration.clear();
        this.queryGeneration = 0;
      }
      generation = ++this.queryGeneration;
    }
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    this.queryDepth += 1;
    try {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const row = this.rows.get(cy);
        if (!row) continue;
        for (let cx = minX; cx <= maxX; cx += 1) {
          const list = row.get(cx);
          if (!list) continue;
          for (const item of list) {
            if (!item.active) continue;
            if (nestedSeen) {
              if (nestedSeen.has(item.id)) continue;
              nestedSeen.add(item.id);
            } else {
              if (this.seenGeneration.get(item.id) === generation) continue;
              this.seenGeneration.set(item.id, generation);
            }
            result.push(item);
          }
        }
      }
    } finally {
      this.queryDepth -= 1;
    }
    return result;
  }
}
