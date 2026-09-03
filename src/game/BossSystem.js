import { distanceSquared, normalize, TAU } from '../core/MathUtils.js';
import { ObjectPool } from '../core/ObjectPool.js';
import { Telegraph } from './Entities.js';
export const BOSS_LEASH_REPOSITION_COOLDOWN = 6;
export const BOSS_ABILITY_TELEPORT_COOLDOWN = 7;
export const BOSS_REPOSITION_MIN_DISTANCE = 250;
export const BOSS_REPOSITION_MAX_DISTANCE = 380;
export function bossRepositionDistance(leashRadius) {
    return Math.min(BOSS_REPOSITION_MAX_DISTANCE, Math.max(BOSS_REPOSITION_MIN_DISTANCE, leashRadius * 0.42));
}
export class BossSystem {
    telegraphs = new ObjectPool(() => new Telegraph(), 16, 60);
    static CAST_CUE_WINDOW = 0.65;
    boss = null;
    castTimer = 0;
    spiralOffset = 0;
    castCuePlayed = false;
    leashRepositionCooldown = 0;
    abilityTeleportCooldown = 0;
    abilityVisuals = [];
    setBoss(enemy) {
        this.boss = enemy;
        this.castTimer = 1.4;
        this.spiralOffset = 0;
        this.castCuePlayed = false;
        this.leashRepositionCooldown = 1.5;
        this.abilityTeleportCooldown = 4;
        this.abilityVisuals.length = 0;
    }
    clearBoss() {
        this.boss = null;
        this.telegraphs.releaseAll();
        this.castCuePlayed = false;
        this.leashRepositionCooldown = 0;
        this.abilityTeleportCooldown = 0;
        this.abilityVisuals.length = 0;
    }
    getBoss() {
        return this.boss?.active ? this.boss : null;
    }
    getAbilityVisuals() {
        return this.abilityVisuals;
    }
    /** Cửa sổ wind-up chung để Renderer báo trước mọi đòn của trùm bằng hình học. */
    getCastCue() {
        const boss = this.getBoss();
        if (!boss
            || boss.status.stunTime > 0
            || boss.status.paralysisTime > 0
            || this.castTimer <= 0
            || this.castTimer > BossSystem.CAST_CUE_WINDOW)
            return null;
        return {
            x: boss.x,
            y: boss.y,
            radius: boss.radius + 34 + boss.phase * 7,
            progress: 1 - this.castTimer / BossSystem.CAST_CUE_WINDOW,
            phase: boss.phase,
            element: boss.config.element ?? 'arcane',
            bossId: boss.config.id,
        };
    }
    update(dt, world) {
        this.updateAbilityVisuals(dt);
        this.updateTelegraphs(dt, world);
        const boss = this.getBoss();
        if (!boss)
            return;
        this.leashRepositionCooldown = Math.max(0, this.leashRepositionCooldown - dt);
        this.abilityTeleportCooldown = Math.max(0, this.abilityTeleportCooldown - dt);
        this.repositionIfLeashed(boss, world);
        const healthRatio = boss.health / Math.max(1, boss.maxHealth);
        const phase = healthRatio > 0.66 ? 1 : healthRatio > 0.33 ? 2 : 3;
        if (phase !== boss.phase) {
            boss.phase = phase;
            world.toast(`${boss.config.name} bước vào giai đoạn ${phase}`);
            world.audio.play('boss');
            world.particles.ring(boss.x, boss.y, '#e7bb63', 220, 0.7);
            world.particles.impact?.('physical', boss.x, boss.y, 190, 0.55, 0.9);
            world.screenShake(6);
            this.castTimer = 0.5;
            this.castCuePlayed = false;
        }
        // Kỹ năng Trùm chạy ngoài EnemySystem, nên cần tôn trọng
        // choáng/tê liệt riêng ở đây.
        if (boss.status.stunTime > 0 || boss.status.paralysisTime > 0)
            return;
        this.castTimer -= dt;
        this.spiralOffset += dt * (0.75 + phase * 0.22);
        if (this.castTimer > 0 && this.castTimer <= BossSystem.CAST_CUE_WINDOW && !this.castCuePlayed) {
            this.castCuePlayed = true;
            world.audio.play('boss-warning', 0.72);
            world.particles.ring(boss.x, boss.y, '#ffcf70', boss.radius + 56, BossSystem.CAST_CUE_WINDOW);
        }
        if (this.castTimer > 0)
            return;
        this.castTimer = Math.max(0.75, 2.7 - phase * 0.42);
        this.castCuePlayed = false;
        switch (boss.config.id) {
            case 'void-devourer':
                this.castVoid(boss, phase, world);
                break;
            case 'iron-behemoth':
                this.castIron(boss, phase, world);
                break;
            case 'frost-queen':
                this.castFrost(boss, phase, world);
                break;
            case 'lord-infernus':
                this.castInfernus(boss, phase, world);
                break;
            default: this.radialVolley(boss, world, 10 + phase * 3, 250, boss.damage * 0.55, '#c879ff');
        }
    }
    repositionIfLeashed(boss, world) {
        if (this.leashRepositionCooldown > 0)
            return;
        const deltaX = boss.x - world.player.x;
        const deltaY = boss.y - world.player.y;
        const leashRadius = world.bossLeashRadius?.() ?? Number.POSITIVE_INFINITY;
        if (deltaX * deltaX + deltaY * deltaY <= leashRadius * leashRadius)
            return;
        const direction = normalize(deltaX, deltaY);
        const arrivalDistance = bossRepositionDistance(leashRadius);
        const oldX = boss.x;
        const oldY = boss.y;
        boss.x = world.player.x + direction.x * arrivalDistance;
        boss.y = world.player.y + direction.y * arrivalDistance;
        this.leashRepositionCooldown = BOSS_LEASH_REPOSITION_COOLDOWN;
        this.abilityTeleportCooldown = Math.max(this.abilityTeleportCooldown, BOSS_ABILITY_TELEPORT_COOLDOWN * 0.6);
        this.telegraphs.releaseAll();
        world.particles.ring(oldX, oldY, '#8df8ff', 82, 0.35);
        world.particles.ring(boss.x, boss.y, '#ffcf70', 104, 0.45);
        world.particles.impact?.(boss.config.element ?? 'arcane', boss.x, boss.y, 126, 0.42, 0.9);
        world.audio.play('boss-warning', 0.78);
        world.screenShake(3.5);
        world.toast(`${boss.config.name} dịch chuyển áp sát`);
    }
    castVoid(boss, phase, world) {
        this.radialVolley(boss, world, 10 + phase * 4, 235 + phase * 25, boss.damage * 0.52, '#bd78ff', this.spiralOffset);
        if (phase >= 2 && this.abilityTeleportCooldown <= 0) {
            const angle = world.rng.float(0, TAU);
            boss.x = world.player.x + Math.cos(angle) * 350;
            boss.y = world.player.y + Math.sin(angle) * 350;
            this.abilityTeleportCooldown = BOSS_ABILITY_TELEPORT_COOLDOWN;
            world.particles.ring(boss.x, boss.y, '#bd78ff', 90, 0.42);
            world.particles.impact?.('arcane', boss.x, boss.y, 118, 0.38, 0.92);
        }
        if (phase === 3)
            this.createTelegraph(world.player.x, world.player.y, 150, 0.85, boss.status.blindTime > 0 ? 0 : boss.damage * 1.35, 'circle');
    }
    castIron(boss, phase, world) {
        const predictionX = world.player.x + world.player.vx * 0.6;
        const predictionY = world.player.y + world.player.vy * 0.6;
        this.createTelegraph(predictionX, predictionY, 130 + phase * 18, 1.05, boss.status.blindTime > 0 ? 0 : boss.damage * 1.55, 'circle');
        if (phase >= 2) {
            for (let index = 0; index < phase; index += 1)
                world.spawner.spawnChild(index % 2 ? 'iron-brute' : 'aegis-shell', boss.x, boss.y, world.scaling, 0.75);
        }
        if (phase === 3)
            this.radialVolley(boss, world, 16, 210, boss.damage * 0.48, '#f0a85d', this.spiralOffset);
    }
    castFrost(boss, phase, world) {
        const count = 4 + phase * 2;
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + this.spiralOffset;
            world.projectiles.spawn({
                faction: 'enemy', sourceWeaponId: 'boss:frost-queen', element: 'ice', x: boss.x, y: boss.y,
                vx: Math.cos(angle) * (260 + phase * 25), vy: Math.sin(angle) * (260 + phase * 25),
                damage: boss.damage * 0.55, radius: 8, life: 3.4, color: '#72d8ff', trail: true,
                canHitPlayer: boss.status.blindTime <= 0,
            });
            const reverse = angle + Math.PI / count;
            world.projectiles.spawn({
                faction: 'enemy', sourceWeaponId: 'boss:frost-queen', element: 'ice', x: boss.x, y: boss.y,
                vx: Math.cos(reverse) * (170 + phase * 20), vy: Math.sin(reverse) * (170 + phase * 20),
                damage: boss.damage * 0.42, radius: 7, life: 4.6, color: '#b5efff', trail: true,
                canHitPlayer: boss.status.blindTime <= 0,
            });
        }
        if (phase >= 2)
            this.createTelegraph(world.player.x, world.player.y, 210, 1.2, boss.status.blindTime > 0 ? 0 : boss.damage * 1.1, 'ring');
    }
    castInfernus(boss, phase, world) {
        const meteors = 2 + phase * 2;
        for (let index = 0; index < meteors; index += 1) {
            const angle = world.rng.float(0, TAU);
            const distance = world.rng.float(30, 310);
            const x = world.player.x + Math.cos(angle) * distance + world.player.vx * 0.45;
            const y = world.player.y + Math.sin(angle) * distance + world.player.vy * 0.45;
            this.createTelegraph(x, y, 88 + phase * 10, world.rng.float(0.65, 1.0), boss.status.blindTime > 0 ? 0 : boss.damage * 1.4, 'circle');
        }
        this.radialVolley(boss, world, 12 + phase * 4, 275, boss.damage * 0.48, '#ff7444', -this.spiralOffset);
        if (phase === 3) {
            for (let index = 0; index < 3; index += 1)
                world.spawner.spawnChild('cinder-sac', boss.x, boss.y, world.scaling, 1.1);
        }
    }
    radialVolley(boss, world, count, speed, damage, color, offset = 0) {
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + offset;
            world.projectiles.spawn({
                faction: 'enemy', sourceWeaponId: `boss:${boss.config.id}`, element: boss.config.element ?? 'arcane',
                x: boss.x, y: boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                damage, radius: 7 + boss.phase, life: 3.7, color, trail: true,
                canHitPlayer: boss.status.blindTime <= 0,
            });
        }
        world.particles.ring(boss.x, boss.y, color, 105, 0.4);
        world.particles.impact?.(boss.config.element ?? 'arcane', boss.x, boss.y, 104 + boss.phase * 10, 0.34, 0.78);
        this.pushAbilityVisual(boss.config.id, boss.x, boss.y, 104 + boss.phase * 12, 0.58);
        world.screenShake(2.5);
    }
    createTelegraph(x, y, radius, time, damage, kind) {
        const telegraph = this.telegraphs.acquire();
        if (!telegraph)
            return;
        telegraph.x = x;
        telegraph.y = y;
        telegraph.radius = radius;
        telegraph.time = time;
        telegraph.maxTime = time;
        telegraph.damage = damage;
        telegraph.kind = kind;
        telegraph.bossId = this.boss?.config.id ?? '';
    }
    updateTelegraphs(dt, world) {
        this.telegraphs.forEachActive((telegraph) => {
            telegraph.time -= dt;
            if (telegraph.time > 0)
                return;
            const distanceSq = distanceSquared(world.player.x, world.player.y, telegraph.x, telegraph.y);
            const hit = telegraph.kind === 'circle'
                ? distanceSq <= (telegraph.radius + world.player.radius) ** 2
                : Math.abs(Math.sqrt(distanceSq) - telegraph.radius * 0.72) <= 42 + world.player.radius;
            const owner = this.getBoss();
            const ownerControlled = Boolean(owner && (owner.status.blindTime > 0 || owner.status.stunTime > 0 || owner.status.paralysisTime > 0));
            if (hit && telegraph.damage > 0 && !ownerControlled)
                world.damagePlayer(telegraph.damage, telegraph.x, telegraph.y);
            world.particles.ring(telegraph.x, telegraph.y, '#ff7a4d', telegraph.radius, 0.42);
            world.particles.burst(telegraph.x, telegraph.y, '#ff7a4d', 20, 240, 4);
            world.particles.impact?.('fire', telegraph.x, telegraph.y, Math.min(250, telegraph.radius * 1.55), 0.48, 0.94);
            this.pushAbilityVisual(telegraph.bossId, telegraph.x, telegraph.y, telegraph.radius, 0.72);
            world.screenShake(4.5);
            this.telegraphs.release(telegraph);
        });
    }
    pushAbilityVisual(bossId, x, y, radius, duration) {
        if (!bossId)
            return;
        this.abilityVisuals.push({ bossId, x, y, radius, time: duration, maxTime: duration });
        if (this.abilityVisuals.length > 18)
            this.abilityVisuals.splice(0, this.abilityVisuals.length - 18);
    }
    updateAbilityVisuals(dt) {
        for (let index = this.abilityVisuals.length - 1; index >= 0; index -= 1) {
            const visual = this.abilityVisuals[index];
            if (!visual)
                continue;
            visual.time -= dt;
            if (visual.time <= 0)
                this.abilityVisuals.splice(index, 1);
        }
    }
}
//# sourceMappingURL=BossSystem.js.map