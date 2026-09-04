export class AssetManager {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly failed = new Set<string>();

  private key(path: string): string {
    return path.replace(/^\.\//, '');
  }

  public async preload(paths: readonly string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean).map((path) => this.key(path)))];
    await Promise.all(unique.map((path) => this.load(path)));
  }

  public async load(path: string): Promise<HTMLImageElement | null> {
    const key = this.key(path);
    const existing = this.images.get(key);
    if (existing) return existing;
    if (this.failed.has(key)) return null;
    return await new Promise((resolve) => {
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
  }

  public get(path: string): HTMLImageElement | null {
    return this.images.get(this.key(path)) ?? null;
  }
}
