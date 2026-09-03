export class AssetManager {
    images = new Map();
    failed = new Set();
    key(path) {
        return path.replace(/^\.\//, '');
    }
    async preload(paths) {
        const unique = [...new Set(paths.filter(Boolean).map((path) => this.key(path)))];
        await Promise.all(unique.map((path) => this.load(path)));
    }
    async load(path) {
        const key = this.key(path);
        const existing = this.images.get(key);
        if (existing)
            return existing;
        if (this.failed.has(key))
            return null;
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
    get(path) {
        return this.images.get(this.key(path)) ?? null;
    }
}
//# sourceMappingURL=AssetManager.js.map