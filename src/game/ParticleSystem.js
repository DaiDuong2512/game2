import { ObjectPool } from '../core/ObjectPool.js';
import { clamp, TAU } from '../core/MathUtils.js';
import { Particle } from './Entities.js';
/**
 * Sự kiện VFX ngắn dùng trực tiếp atlas pixel. Tách khỏi particle thường để
 * impact có silhouette rõ mà không cần sinh hàng trăm sprite entity mới.
 */
export class AtlasVfxEvent {
    active = false;
    x = 0;
    y = 0;
    row = 0;
    sheet = 'element';
    size = 48;
    life = 0;
    maxLife = 0;
    alpha = 1;
    reverse = false;
    semantic = 'physical';
    reset() {
        this.x = 0;
        this.y = 0;
        this.row = 0;
        this.sheet = 'element';
        this.size = 48;
        this.life = 0;
        this.maxLife = 0;
        this.alpha = 1;
        this.reverse = false;
        this.semantic = 'physical';
    }
}
const ELEMENT_ATLAS_ROW = {
    lightning: 0,
    fire: 1,
    ice: 2,
    arcane: 3,
};
export class ParticleSystem {
    pool = new ObjectPool(() => new Particle(), 360, 2200);
    atlasPool = new ObjectPool(() => new AtlasVfxEvent(), 56, 220);
    rng;
    reduced = false;
    emissionTokens = 650;
    atlasTokens = 72;
    constructor(rng) {
        this.rng = rng;
    }
    setReduced(reduced) {
        this.reduced = reduced;
    }
    spawn(kind, x, y, color, size, life, vx = 0, vy = 0) {
        const cost = kind === 'line' || kind === 'ring' ? 2 : 1;
        if (this.emissionTokens < cost)
            return null;
        this.emissionTokens -= cost;
        const particle = this.pool.acquire();
        if (!particle)
            return null;
        particle.kind = kind;
        particle.x = x;
        particle.y = y;
        particle.x2 = x;
        particle.y2 = y;
        particle.color = color;
        particle.size = size;
        particle.life = life;
        particle.maxLife = life;
        particle.vx = vx;
        particle.vy = vy;
        particle.rotation = this.rng.float(0, TAU);
        return particle;
    }
    burst(x, y, color, count = 10, speed = 130, size = 3) {
        const actual = this.reduced ? Math.max(3, Math.floor(count * 0.45)) : count;
        for (let index = 0; index < actual; index += 1) {
            const angle = this.rng.float(0, TAU);
            const velocity = this.rng.float(speed * 0.35, speed);
            this.spawn('spark', x, y, color, this.rng.float(size * 0.6, size * 1.4), this.rng.float(0.22, 0.5), Math.cos(angle) * velocity, Math.sin(angle) * velocity);
        }
        // Các lần burst từ ProjectileSystem chính là điểm va chạm. Một frame atlas
        // ngắn tạo cảm giác "hit-stop" thị giác và giữ được chất pixel khi đông quái.
        if (count >= 4 && size >= 2) {
            const atlas = this.atlasForColor(color);
            if (atlas !== null) {
                const impactSize = Math.min(128, Math.max(28, size * 9 + (count >= 16 ? 34 : 0)));
                if (atlas.sheet === 'status') {
                    this.spawnStatusAtlas(atlas.row, x, y, impactSize, count >= 16 ? 0.42 : 0.24, count >= 16 ? 0.88 : 0.7, false, atlas.semantic);
                }
                else {
                    this.spawnAtlas(atlas.row, x, y, impactSize, count >= 16 ? 0.42 : 0.24, count >= 16 ? 0.88 : 0.7, false, atlas.semantic);
                }
            }
        }
    }
    ring(x, y, color, radius, life = 0.35) {
        this.spawn('ring', x, y, color, radius, life);
    }
    line(x, y, x2, y2, color, size = 3, life = 0.12) {
        const particle = this.spawn('line', x, y, color, size, life);
        if (particle) {
            particle.x2 = x2;
            particle.y2 = y2;
        }
    }
    slash(x, y, x2, y2, color, size = 5, life = 0.16) {
        const particle = this.spawn('slash', x, y, color, size, life);
        if (particle) {
            particle.x2 = x2;
            particle.y2 = y2;
        }
    }
    impact(element, x, y, size = 52, life = 0.3, alpha = 0.9) {
        if (element === 'poison')
            return this.spawnStatusAtlas(0, x, y, size, life, alpha, false, 'poison');
        if (element === 'physical')
            return this.spawnStatusAtlas(1, x, y, size, life, alpha, false, 'physical');
        const row = ELEMENT_ATLAS_ROW[element];
        if (row === undefined)
            return null;
        return this.spawnAtlas(row, x, y, size, life, alpha, false, element);
    }
    spawnAtlas(row, x, y, size, life = 0.32, alpha = 0.9, reverse = false, semantic) {
        return this.acquireAtlas('element', row, x, y, size, life, alpha, reverse, semantic);
    }
    spawnStatusAtlas(row, x, y, size, life = 0.32, alpha = 0.9, reverse = false, semantic) {
        return this.acquireAtlas('status', row, x, y, size, life, alpha, reverse, semantic);
    }
    acquireAtlas(sheet, row, x, y, size, life, alpha, reverse, semantic) {
        const cost = size >= 180 ? 6 : size >= 96 ? 4 : 2;
        if (this.atlasTokens < cost)
            return null;
        this.atlasTokens -= cost;
        const effect = this.atlasPool.acquire();
        if (!effect)
            return null;
        effect.sheet = sheet;
        effect.row = Math.round(clamp(row, 0, sheet === 'element' ? 4 : 1));
        effect.x = x;
        effect.y = y;
        effect.size = Math.max(12, size);
        effect.life = Math.max(0.06, life);
        effect.maxLife = effect.life;
        effect.alpha = clamp(alpha, 0.08, 1);
        effect.reverse = reverse;
        effect.semantic = semantic ?? this.defaultSemantic(sheet, effect.row);
        return effect;
    }
    update(dt) {
        const rate = this.reduced ? 220 : 650;
        this.emissionTokens = Math.min(rate, this.emissionTokens + rate * Math.max(0, dt));
        const atlasRate = this.reduced ? 24 : 72;
        this.atlasTokens = Math.min(atlasRate, this.atlasTokens + atlasRate * Math.max(0, dt));
        this.pool.forEachActive((particle) => {
            particle.life -= dt;
            if (particle.life <= 0) {
                this.pool.release(particle);
                return;
            }
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.vx *= Math.exp(-3.5 * dt);
            particle.vy *= Math.exp(-3.5 * dt);
            particle.alpha = Math.max(0, particle.life / Math.max(0.001, particle.maxLife));
            particle.rotation += dt * 3;
        });
        this.atlasPool.forEachActive((effect) => {
            effect.life -= dt;
            if (effect.life <= 0)
                this.atlasPool.release(effect);
        });
    }
    clear() {
        this.pool.releaseAll();
        this.atlasPool.releaseAll();
    }
    defaultSemantic(sheet, row) {
        if (sheet === 'status')
            return row === 0 ? 'poison' : 'physical';
        return row === 0 ? 'lightning'
            : row === 1 ? 'fire'
                : row === 2 ? 'ice'
                    : row === 3 ? 'arcane' : 'physical';
    }
    atlasForColor(color) {
        const value = color.trim().toLowerCase();
        const match = /^#([0-9a-f]{6})$/.exec(value);
        if (!match?.[1])
            return { sheet: 'status', row: 1, semantic: 'physical' };
        const packed = Number.parseInt(match[1], 16);
        const red = packed >> 16 & 0xff;
        const green = packed >> 8 & 0xff;
        const blue = packed & 0xff;
        if (green > red * 1.18 && green > blue * 1.08)
            return { sheet: 'status', row: 0, semantic: 'poison' };
        if (red > green * 1.2 && red > blue * 1.08) {
            const semantic = Math.abs(green - blue) < 24 && blue > 74 ? 'bleed' : 'fire';
            return semantic === 'bleed'
                ? { sheet: 'status', row: 1, semantic }
                : { sheet: 'element', row: 1, semantic };
        }
        if (red > 135 && blue > green * 1.12)
            return { sheet: 'element', row: 3, semantic: 'arcane' };
        if (blue > red * 1.15 && green > red * 1.12) {
            return green > blue * 0.78
                ? { sheet: 'element', row: 2, semantic: 'ice' }
                : { sheet: 'element', row: 0, semantic: 'lightning' };
        }
        if (blue > green * 1.08)
            return { sheet: 'element', row: 3, semantic: 'arcane' };
        return { sheet: 'status', row: 1, semantic: 'physical' };
    }
}
//# sourceMappingURL=ParticleSystem.js.map