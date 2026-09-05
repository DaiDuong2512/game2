export class AssetManager {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly failed = new Set<string>();
  private readonly pending = new Map<string, Promise<HTMLImageElement | null>>();

  private key(path: string): string {
    return path.replace(/^\.\//, '');
  }

  public async preload(paths: readonly string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean).map((path) => this.key(path)))];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
      while (next < unique.length) await this.load(unique[next++]!);
    }));
  }

  public async load(path: string): Promise<HTMLImageElement | null> {
    const key = this.key(path);
    const existing = this.images.get(key);
    if (existing) return existing;
    if (this.failed.has(key)) return null;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        this.images.set(key, image);
        resolve(image);
      };
      image.onerror = () => {
        this.failed.add(key);
        console.warn(`Không thể tải tài nguyên: ${key}`);
        resolve(null);
      };
      image.src = `./${key}`;
    });
    this.pending.set(key, request);
    try { return await request; }
    finally { this.pending.delete(key); }
  }

  public get(path: string): HTMLImageElement | null {
    return this.images.get(this.key(path)) ?? null;
  }
}
