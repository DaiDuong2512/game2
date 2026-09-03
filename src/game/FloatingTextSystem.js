import { ObjectPool } from '../core/ObjectPool.js';
import { FloatingText } from './Entities.js';
export function inferFloatingTextKind(value, color, critical) {
    const normalized = color.trim().toLowerCase();
    if (value === 'NÉ')
        return 'dodge';
    if (value.startsWith('+'))
        return 'healing';
    if (value.startsWith('-'))
        return 'incoming';
    if (normalized === '#ff8a55' || normalized === '#ff7546')
        return 'fire';
    if (normalized === '#79ddff' || normalized === '#72d8ff')
        return 'ice';
    if (normalized === '#79e47c' || normalized === '#68dc72' || normalized === '#7df18a')
        return 'poison';
    if (normalized === '#79b3ff' || normalized === '#62a7ff')
        return 'lightning';
    if (normalized === '#d892ff' || normalized === '#6ac7e8')
        return 'arcane';
    if (normalized === '#c8443f' || normalized === '#d7554e')
        return 'bleed';
    if (normalized === '#e7f0ef' || normalized === '#fff0c7')
        return 'physical';
    return 'neutral';
}
export class FloatingTextSystem {
    pool = new ObjectPool(() => new FloatingText(), 90, 500);
    spawn(x, y, value, color, critical = false, kind) {
        const text = this.pool.acquire();
        if (!text)
            return;
        text.x = x;
        text.y = y;
        text.value = value;
        text.color = color;
        text.critical = critical;
        text.size = critical ? 21 : 14;
        text.life = critical ? 0.78 : 0.58;
        text.maxLife = text.life;
        text.kind = kind ?? inferFloatingTextKind(value, color, critical);
        text.horizontalOffset = (text.id % 3 - 1) * (critical ? 7 : 5);
    }
    /** API rõ nghĩa để damage pipeline có thể giữ nguyên nguyên tố cả khi crit. */
    spawnDamage(x, y, value, color, element, critical = false, status) {
        this.spawn(x, y, value, color, critical, status ?? element);
    }
    update(dt) {
        this.pool.forEachActive((text) => {
            text.life -= dt;
            if (text.life <= 0) {
                this.pool.release(text);
                return;
            }
            text.y -= (text.critical ? 52 : 38) * dt;
        });
    }
    clear() {
        this.pool.releaseAll();
    }
}
//# sourceMappingURL=FloatingTextSystem.js.map