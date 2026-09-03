import { distanceSquared, TAU } from '../core/MathUtils.js';
import { kaelBloodiedRageRatio } from './Player.js';
import { weaponBalanceDamageMultiplier } from './WeaponSystem.js';
export const TITAN_RIFT_RADIUS = 250;
export const NOVA_VOID_INTERVAL = 8;
export const NOVA_VOID_DURATION = 2;
export const ELARA_SHIELD_INTERVAL = 2;
export const ELARA_SOLDIER_DURATION = 5;
export const ZAREK_TRAIL_DURATION = 1.5;
export const ZAREK_TRAIL_DAMAGE_SHARE = 0.8;
export const NYRA_BURN_SPREAD_RADIUS = 300;
export const NYRA_INFERNO_COST = 100;
export const NYRA_INFERNO_DURATION = 10;
export const TOREN_FORGE_KILLS = 50;
export const MIRA_DAMAGE_PER_KILL = 0.005;
export class CharacterPassiveSystem {
    nyraBurnPoints = 0;
    torenForgeKills = 0;
    miraKillStacks = 0;
    titanRiftCooldown = 0;
    novaVoidCooldown = NOVA_VOID_INTERVAL;
    novaVoidTime = 0;
    novaVoidX = 0;
    novaVoidY = 0;
    elaraShieldCooldown = ELARA_SHIELD_INTERVAL;
    elaraSoldierAttackCooldown = 0;
    zarekTrailCooldown = 0;
    nyraBurnTick = 1;
    nyraInfernoTime = 0;
    nyraInfernoX = 0;
    nyraInfernoY = 0;
    update(dt, world, playerTravel = 0) {
        const step = Math.max(0, dt);
        this.titanRiftCooldown = Math.max(0, this.titanRiftCooldown - step);
        switch (world.player.character.id) {
            case 'nova':
                this.updateNova(step, world);
                break;
            case 'elara':
                this.updateElara(step, world);
                break;
            case 'zarek':
                this.updateZarek(step, world, playerTravel);
                break;
            case 'nyra-sol':
                this.updateNyra(step, world);
                break;
        }
    }
    onDamageDealt(world, enemy, sourceWeaponId, appliedDamage) {
        if (appliedDamage <= 0)
            return;
        if (world.player.character.id === 'titan'
            && this.titanRiftCooldown <= 0
            && ['gravity-bomb', 'active-gravity-breaker'].includes(sourceWeaponId)) {
            this.triggerTitanRift(world, enemy.x, enemy.y, appliedDamage);
        }
        if (world.player.character.id === 'toren-vale' && !sourceWeaponId.startsWith('passive-')) {
            const wasBurning = enemy.status.burnTime > 0;
            enemy.status.burnTime = Math.max(enemy.status.burnTime, 2.4);
            enemy.status.burnTick = wasBurning ? Math.min(enemy.status.burnTick, 0.25) : 0.25;
            enemy.status.burnDps = Math.max(enemy.status.burnDps, appliedDamage * 0.06);
            enemy.status.healingReduction = Math.max(enemy.status.healingReduction, 0.12);
        }
    }
    onEnemyKilled(world) {
        if (world.player.character.id === 'mira-voss') {
            this.miraKillStacks += 1;
            world.player.stats.apply('damage', MIRA_DAMAGE_PER_KILL, 'add');
            if (this.miraKillStacks % 10 === 0)
                world.toast(`Xuyên Táo · +${this.miraKillStacks * 0.5}% sát thương`);
        }
        if (world.player.character.id === 'toren-vale') {
            this.torenForgeKills += 1;
            if (this.torenForgeKills % TOREN_FORGE_KILLS === 0)
                this.grantTorenWeapon(world);
        }
    }
    statusText(world) {
        const player = world.player;
        switch (player.character.id) {
            case 'kael-orin': {
                const ratio = kaelBloodiedRageRatio(player.health, player.stats.get('maxHp'));
                return `Cuồng nộ: +${Math.round(ratio * 50)}% hút máu · +${Math.round(ratio * 200)}% tốc đánh`;
            }
            case 'mira-voss': return `Xuyên Táo: ${this.miraKillStacks} mạng · +${(this.miraKillStacks * 0.5).toLocaleString('vi-VN')}% sát thương`;
            case 'toren-vale': return `Luyện Lò: ${this.torenForgeKills % TOREN_FORGE_KILLS}/${TOREN_FORGE_KILLS} giáp thu thập`;
            case 'nyra-sol': return `Cháy Càng Cháy: ${this.nyraBurnPoints}/${NYRA_INFERNO_COST} điểm`;
            case 'zarek': return 'Bộ Pháp Khói Độc: vệt độc gây 80% sát thương Bom Khói Độc';
            case 'elara': return `Thánh Khiên: ${player.holyShieldLayers}/1 · Lính ánh sáng ${player.lightSoldierTime > 0 ? `${player.lightSoldierTime.toFixed(1)} giây` : 'chưa triệu hồi'}`;
            case 'titan': return `Địa Liệt: bán kính ${TITAN_RIFT_RADIUS} · ${this.titanRiftCooldown > 0 ? `${this.titanRiftCooldown.toFixed(1)} giây` : 'sẵn sàng'}`;
            case 'nova': return `Hố Nuốt: ${this.novaVoidTime > 0 ? `đang mở ${this.novaVoidTime.toFixed(1)} giây` : `${this.novaVoidCooldown.toFixed(1)} giây`}`;
            default: return player.character.passive.name;
        }
    }
    updateNova(dt, world) {
        this.novaVoidCooldown -= dt;
        this.novaVoidTime = Math.max(0, this.novaVoidTime - dt);
        if (this.novaVoidCooldown <= 0) {
            this.novaVoidCooldown += NOVA_VOID_INTERVAL;
            const target = world.nearestEnemy(world.player.x, world.player.y, 720);
            this.novaVoidX = target?.x ?? world.player.x;
            this.novaVoidY = target?.y ?? world.player.y;
            this.novaVoidTime = NOVA_VOID_DURATION;
            const damage = this.weaponDamage(world, 'arcane-nova', 0.42);
            world.projectiles.spawn({
                sourceWeaponId: 'passive-nova-void-maw', element: 'arcane',
                x: this.novaVoidX, y: this.novaVoidY, vx: 0, vy: 0,
                damage, radius: 220, life: NOVA_VOID_DURATION, maxRange: 0,
                persistent: true, tickRate: 0.4, pullStrength: 760,
                statusChance: 0.35, knockback: 0, color: '#a45cff', trail: false,
            });
            world.particles.ring(this.novaVoidX, this.novaVoidY, '#b66cff', 220, 0.55);
        }
        if (this.novaVoidTime <= 0)
            return;
        for (const enemy of world.enemySpatial.queryCircle(this.novaVoidX, this.novaVoidY, 220)) {
            if (!enemy.active || enemy.isBoss)
                continue;
            if (distanceSquared(this.novaVoidX, this.novaVoidY, enemy.x, enemy.y) > (220 + enemy.radius) ** 2)
                continue;
            const threshold = enemy.isElite ? 0.08 : 0.12;
            if (enemy.health / Math.max(1, enemy.maxHealth) > threshold)
                continue;
            world.damageEnemy(enemy, enemy.health, 'arcane', 'passive-nova-devour', 0, 0, false, this.novaVoidX, this.novaVoidY);
        }
    }
    updateElara(dt, world) {
        const player = world.player;
        player.lightSoldierTime = Math.max(0, player.lightSoldierTime - dt);
        this.elaraShieldCooldown -= dt;
        while (this.elaraShieldCooldown <= 0) {
            this.elaraShieldCooldown += ELARA_SHIELD_INTERVAL;
            if (player.holyShieldLayers < 1) {
                player.holyShieldLayers = 1;
                world.particles.ring(player.x, player.y, '#fff2a8', player.radius + 22, 0.42);
            }
            else {
                player.lightSoldierTime = ELARA_SOLDIER_DURATION;
                this.elaraSoldierAttackCooldown = 0;
                world.particles.burst(player.x, player.y, '#fff2a8', 18, 150, 4);
            }
        }
        if (player.lightSoldierTime <= 0)
            return;
        player.lightSoldierAngle = (player.lightSoldierAngle + dt * 2.4) % TAU;
        this.elaraSoldierAttackCooldown -= dt;
        if (this.elaraSoldierAttackCooldown > 0)
            return;
        this.elaraSoldierAttackCooldown += 0.65;
        const soldierX = player.x + Math.cos(player.lightSoldierAngle) * 78;
        const soldierY = player.y + Math.sin(player.lightSoldierAngle) * 78;
        const target = world.nearestEnemy(soldierX, soldierY, 310);
        if (!target)
            return;
        const damage = this.weaponDamage(world, 'rift-blade', 0.5);
        world.damageEnemy(target, damage, 'physical', 'passive-elara-light-soldier', 0.18, 22, false, soldierX, soldierY);
        world.particles.slash(soldierX, soldierY, target.x, target.y, '#fff1a3', 5, 0.18);
    }
    updateZarek(dt, world, playerTravel) {
        this.zarekTrailCooldown = Math.max(0, this.zarekTrailCooldown - dt);
        if (playerTravel <= 0.35 || this.zarekTrailCooldown > 0)
            return;
        this.zarekTrailCooldown = 0.42;
        const player = world.player;
        const damage = this.weaponDamage(world, 'toxic-smoke-bomb', ZAREK_TRAIL_DAMAGE_SHARE);
        world.projectiles.spawn({
            sourceWeaponId: 'passive-zarek-toxic-trail', element: 'poison',
            x: player.x, y: player.y, vx: 0, vy: 0,
            damage, radius: 86, life: ZAREK_TRAIL_DURATION, maxRange: 0,
            persistent: true, tickRate: 0.35, statusChance: 1, knockback: 0,
            color: '#7de52a', trail: false,
            hitEffect: { kind: 'poison-cloud', duration: ZAREK_TRAIL_DURATION, chance: 1, magnitude: 0.82, damageScale: 1 },
        });
    }
    updateNyra(dt, world) {
        this.nyraBurnTick -= dt;
        while (this.nyraBurnTick <= 0) {
            this.nyraBurnTick += 1;
            const burning = world.enemies.filter((enemy) => enemy.active && enemy.status.burnTime > 0);
            this.nyraBurnPoints += burning.length;
            for (const source of burning) {
                const target = world.enemySpatial.queryCircle(source.x, source.y, NYRA_BURN_SPREAD_RADIUS)
                    .find((enemy) => enemy.active && enemy.id !== source.id && enemy.status.burnTime <= 0
                    && distanceSquared(source.x, source.y, enemy.x, enemy.y) <= NYRA_BURN_SPREAD_RADIUS ** 2);
                if (!target)
                    continue;
                target.status.burnTime = 2.5;
                target.status.burnTick = 0.25;
                target.status.burnDps = Math.max(target.status.burnDps, source.status.burnDps * 0.7);
                target.status.burnPercent = Math.max(target.status.burnPercent, source.status.burnPercent * 0.7);
                target.status.healingReduction = Math.max(target.status.healingReduction, 0.2);
                world.particles.line(source.x, source.y, target.x, target.y, '#ff8b3d', 3, 0.18);
            }
            if (this.nyraBurnPoints >= NYRA_INFERNO_COST) {
                this.nyraBurnPoints -= NYRA_INFERNO_COST;
                this.triggerNyraInferno(world);
            }
        }
        this.nyraInfernoTime = Math.max(0, this.nyraInfernoTime - dt);
        if (this.nyraInfernoTime > 0
            && distanceSquared(world.player.x, world.player.y, this.nyraInfernoX, this.nyraInfernoY) <= 190 ** 2) {
            world.player.heal(world.player.stats.get('maxHp') * 0.035 * dt, false);
        }
    }
    triggerNyraInferno(world) {
        const target = world.nearestEnemy(world.player.x, world.player.y, 820);
        this.nyraInfernoX = target?.x ?? world.player.x;
        this.nyraInfernoY = target?.y ?? world.player.y;
        this.nyraInfernoTime = NYRA_INFERNO_DURATION;
        const damage = this.weaponDamage(world, 'ember-orb', 0.5);
        world.projectiles.spawn({
            sourceWeaponId: 'passive-nyra-inferno', element: 'fire',
            x: this.nyraInfernoX, y: this.nyraInfernoY - 280, vx: 0, vy: 880,
            damage, radius: 18, life: 0.32, maxRange: 290, explosiveRadius: 110,
            statusChance: 1, knockback: 35, color: '#ff7b39',
            deployAreaDuration: NYRA_INFERNO_DURATION, deployAreaRadius: 190,
            deployAreaTickRate: 1, deployAreaDamage: damage,
        });
        world.toast('Cháy Càng Cháy · Thiên Hỏa giáng xuống');
    }
    triggerTitanRift(world, x, y, damage) {
        this.titanRiftCooldown = 0.7;
        const player = world.player;
        player.titanRiftShield = Math.max(player.titanRiftShield, player.stats.get('maxHp') * 0.1);
        player.titanRiftShieldTime = 0.5;
        player.titanRiftImpactTime = 0.5;
        player.titanRiftImpactX = x;
        player.titanRiftImpactY = y;
        for (const target of [...world.enemySpatial.queryCircle(x, y, TITAN_RIFT_RADIUS)]) {
            if (!target.active || distanceSquared(x, y, target.x, target.y) > (TITAN_RIFT_RADIUS + target.radius) ** 2)
                continue;
            world.damageEnemy(target, Math.max(10, damage * 0.48), 'physical', 'passive-titan-rift', 1, 78, false, x, y);
        }
        world.particles.ring(x, y, '#ffd16d', TITAN_RIFT_RADIUS, 0.48);
        world.particles.burst(x, y, '#e0a348', 22, 230, 5);
    }
    grantTorenWeapon(world) {
        if (world.weapons.canAddAuxiliary()) {
            const available = world.data.weapons.filter((weapon) => !world.weapons.has(weapon.id));
            const choice = world.rng.pick(available);
            if (choice && world.weapons.addAuxiliaryWeapon(choice.id)) {
                world.toast(`Luyện Lò · Tạo ${choice.name}`);
                return;
            }
        }
        const upgradable = world.weapons.entries().filter((entry) => entry.runtime.level < entry.config.maxLevel);
        const choice = world.rng.pick(upgradable);
        if (choice && world.weapons.levelWeapon(choice.config.id)) {
            world.toast(`Luyện Lò · ${choice.config.name} lên cấp ${choice.runtime.level}`);
            return;
        }
        const mastery = world.rng.pick(world.weapons.entries());
        if (mastery && world.weapons.masterWeapon(mastery.config.id))
            world.toast(`Luyện Lò · Cường hóa ${mastery.config.name}`);
    }
    weaponDamage(world, weaponId, scale) {
        const weapon = world.data.weaponById.get(weaponId);
        if (!weapon)
            return 10 * scale * world.player.effectiveDamageMultiplier();
        const ownedLevel = Math.max(1, world.weapons.levelOf(weaponId));
        const level = weapon.levels[Math.min(weapon.levels.length - 1, ownedLevel - 1)] ?? weapon.levels[0];
        return (level?.damage ?? 10)
            * weaponBalanceDamageMultiplier(weapon.behavior)
            * world.player.effectiveDamageMultiplier()
            * scale;
    }
}
//# sourceMappingURL=CharacterPassiveSystem.js.map