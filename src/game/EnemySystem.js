import { distanceSquared, normalize, TAU } from '../core/MathUtils.js';
const enemyProjectileColors = {
    physical: '#f0b87a',
    fire: '#ff7144',
    ice: '#72d8ff',
    lightning: '#6fa8ff',
    poison: '#6bdd73',
    arcane: '#d57cff',
};
export class EnemySystem {
    statusAudioCooldown = new Map();
    update(dt, world) {
        for (const [cue, remaining] of this.statusAudioCooldown) {
            this.statusAudioCooldown.set(cue, Math.max(0, remaining - dt));
        }
        for (const enemy of world.spawner.pool.allItems()) {
            if (!enemy.active)
                continue;
            enemy.flashTimer = Math.max(0, enemy.flashTimer - dt);
            enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);
            enemy.attackTimer -= dt;
            enemy.abilityTimer -= dt;
            enemy.stateTimer = Math.max(0, enemy.stateTimer - dt);
            if (this.updateStatuses(enemy, dt, world))
                continue;
            const dx = world.player.x - enemy.x;
            const dy = world.player.y - enemy.y;
            const distanceSq = dx * dx + dy * dy;
            // Tinh Anh cuối màn phải luôn được giữ trong pool cho tới khi bị hạ;
            // nếu thu hồi theo khoảng cách, trận có thể mất mục tiêu và khóa tiến trình.
            if (!enemy.isBoss && !enemy.isFinalEncounter && distanceSq > 2100 * 2100) {
                world.spawner.pool.release(enemy);
                continue;
            }
            enemy.x += enemy.knockbackX * dt;
            enemy.y += enemy.knockbackY * dt;
            enemy.knockbackX *= Math.exp(-7 * dt);
            enemy.knockbackY *= Math.exp(-7 * dt);
            if (enemy.status.stunTime <= 0 && enemy.status.paralysisTime <= 0)
                this.updateAI(enemy, dt, world, dx, dy, Math.sqrt(distanceSq));
            this.applySeparation(enemy, dt, world);
            this.contactAttack(enemy, world);
        }
    }
    updateStatuses(enemy, dt, world) {
        const status = enemy.status;
        const hadPoison = status.poisonTime > 0 || status.poisonCloudTime > 0;
        let fatalSource = enemy.lastHitWeapon || 'status';
        status.blindCooldown = Math.max(0, status.blindCooldown - dt);
        status.blindTime = Math.max(0, status.blindTime - dt);
        status.paralysisTime = Math.max(0, status.paralysisTime - dt);
        if (status.bleedTime > 0) {
            const activeDt = Math.min(dt, status.bleedTime);
            status.bleedTime = Math.max(0, status.bleedTime - dt);
            status.bleedTick -= activeDt;
            while (status.bleedTick <= 0.0000001) {
                status.bleedTick += 1;
                this.playStatusCue(world, 'bleed', 0.18, 0.14);
                if (world.damageStatus(enemy, enemy.health * status.bleedDps, 'physical', status.bleedSourceWeapon || fatalSource, 'bleed'))
                    return true;
                fatalSource = status.bleedSourceWeapon || fatalSource;
            }
            if (world.rng.chance(dt * 5))
                world.particles.spawn('spark', enemy.x, enemy.y, '#c83e4d', 2.4, 0.25, world.rng.float(-14, 14), world.rng.float(-30, -8));
        }
        else {
            status.bleedDps = 0;
            status.bleedTick = 1;
            status.bleedSourceWeapon = '';
        }
        if (status.burnTime > 0) {
            status.burnTime -= dt;
            status.burnTick -= dt;
            while (status.burnTick <= 0 && status.burnTime > 0) {
                status.burnTick += 0.25;
                this.playStatusCue(world, 'burn-tick', 0.16, 0.19);
                const burnDamage = enemy.maxHealth * status.burnPercent + status.burnDps * 0.25;
                const applied = Math.min(enemy.health, burnDamage);
                enemy.health -= applied;
                world.player?.healFromBossBlessing?.(applied);
            }
            if (world.rng.chance(dt * 8))
                world.particles.spawn('spark', enemy.x, enemy.y, '#ff7a3c', 2.5, 0.24, world.rng.float(-20, 20), world.rng.float(-40, -10));
        }
        else {
            status.burnDps = 0;
            status.burnPercent = 0;
            if (status.poisonTime <= 0)
                status.healingReduction = 0;
        }
        if (status.poisonTime > 0) {
            const activeDt = Math.min(dt, status.poisonTime);
            status.poisonTime -= dt;
            if (status.poisonDps > 0)
                this.playStatusCue(world, 'poison-tick', 0.14, 0.225);
            const applied = Math.min(enemy.health, status.poisonDps * activeDt);
            enemy.health -= applied;
            world.player?.healFromBossBlessing?.(applied);
            if (world.rng.chance(dt * 5))
                world.particles.spawn('smoke', enemy.x, enemy.y, '#6cdf72', 4, 0.4, world.rng.float(-12, 12), world.rng.float(-22, -5));
        }
        else {
            status.poisonDps = 0;
            if (status.burnTime <= 0)
                status.healingReduction = 0;
        }
        if (status.poisonCloudTime > 0) {
            const activeDt = Math.min(dt, status.poisonCloudTime);
            status.poisonCloudTime = Math.max(0, status.poisonCloudTime - dt);
            status.poisonCloudTick -= activeDt;
            while (status.poisonCloudTick <= 0.0000001) {
                status.poisonCloudTick += 1;
                this.playStatusCue(world, 'poison-tick', 0.18, 0.225);
                if (world.damageStatus(enemy, enemy.health * status.poisonCloudPercent + status.poisonCloudDps, 'poison', status.poisonCloudSourceWeapon || fatalSource))
                    return true;
                fatalSource = status.poisonCloudSourceWeapon || fatalSource;
            }
            if (world.rng.chance(dt * 7))
                world.particles.spawn('smoke', enemy.x, enemy.y, '#7be35c', 5, 0.45, world.rng.float(-14, 14), world.rng.float(-28, -6));
        }
        else {
            status.poisonCloudDps = 0;
            status.poisonCloudPercent = 0;
            status.poisonCloudTick = 1;
            status.poisonCloudSourceWeapon = '';
        }
        if (hadPoison && status.poisonTime <= 0 && status.poisonCloudTime <= 0) {
            this.playStatusCue(world, 'poison-expire', 0.16, 0.165);
        }
        if (status.slowTime > 0)
            status.slowTime = Math.max(0, status.slowTime - dt);
        if (status.slowTime <= 0)
            status.slowFactor = 1;
        if (status.stunTime > 0)
            status.stunTime -= dt;
        if (status.shockTime > 0)
            status.shockTime -= dt;
        if (enemy.health <= 0) {
            world.killEnemy(enemy, fatalSource);
            return true;
        }
        return false;
    }
    /** Giới hạn từ nguồn trước voice budget để bầy quái không tạo hàng trăm Promise âm thanh mỗi frame. */
    playStatusCue(world, cue, intensity, cooldown) {
        if ((this.statusAudioCooldown.get(cue) ?? 0) > 0)
            return;
        this.statusAudioCooldown.set(cue, cooldown);
        world.audio?.play(cue, intensity);
    }
    updateAI(enemy, dt, world, dx, dy, distance) {
        const direction = normalize(dx, dy);
        const slow = enemy.status.slowTime > 0 ? enemy.status.slowFactor : 1;
        const ultimateKind = world.player.ultimateActive > 0 ? world.player.character.ultimate?.kind : undefined;
        const ultimateSlow = ultimateKind === 'void-collapse' ? 0.45 : ultimateKind === 'rift-storm' ? 0.7 : 1;
        const speed = enemy.speed * slow * ultimateSlow;
        switch (enemy.config.ai) {
            case 'melee':
            case 'fast':
            case 'tank':
            case 'shield':
            case 'splitter':
            case 'leech':
                this.move(enemy, direction.x, direction.y, speed, dt);
                break;
            case 'flying': {
                const wobble = Math.sin(performance.now() * 0.004 + enemy.id) * 0.32;
                const side = { x: -direction.y, y: direction.x };
                this.move(enemy, direction.x + side.x * wobble, direction.y + side.y * wobble, speed, dt);
                break;
            }
            case 'ranged':
                this.updateRanged(enemy, world, direction, distance, speed, dt, 1, 0.08);
                break;
            case 'sniper':
                this.updateRanged(enemy, world, direction, distance, speed, dt, 1, 0, true);
                break;
            case 'mage':
                this.updateRanged(enemy, world, direction, distance, speed, dt, 3, 0.25);
                break;
            case 'charger':
                if (enemy.stateTimer > 0) {
                    this.move(enemy, enemy.chargeX, enemy.chargeY, speed * 4.5, dt);
                }
                else {
                    this.move(enemy, direction.x, direction.y, speed, dt);
                    if (enemy.abilityTimer <= 0 && distance < 560) {
                        enemy.chargeX = direction.x;
                        enemy.chargeY = direction.y;
                        enemy.stateTimer = 0.48;
                        enemy.abilityTimer = 3.2;
                        world.particles.line(enemy.x, enemy.y, world.player.x, world.player.y, '#f0b87a', 3, 0.35);
                    }
                }
                break;
            case 'healer':
                this.keepRange(enemy, direction, distance, speed, dt, 240, 360);
                if (enemy.abilityTimer <= 0) {
                    enemy.abilityTimer = 4.2;
                    const nearby = world.enemySpatial.queryCircle(enemy.x, enemy.y, 220);
                    for (const ally of nearby) {
                        if (!ally.active || ally.id === enemy.id)
                            continue;
                        this.healEnemy(ally, ally.maxHealth * 0.12);
                    }
                    world.particles.ring(enemy.x, enemy.y, '#6ee48e', 220, 0.55);
                }
                break;
            case 'summoner':
                this.keepRange(enemy, direction, distance, speed, dt, 260, 380);
                if (enemy.abilityTimer <= 0) {
                    enemy.abilityTimer = 5.1;
                    const count = enemy.isElite ? 5 : 2;
                    for (let index = 0; index < count; index += 1)
                        world.spawner.spawnChild(index % 2 ? 'razorling' : 'riftling', enemy.x, enemy.y, world.scaling, 0.72);
                    world.particles.ring(enemy.x, enemy.y, '#c779ff', 86, 0.5);
                }
                break;
            case 'exploder':
                this.move(enemy, direction.x, direction.y, speed * 1.1, dt);
                if (distance < 66 + world.player.radius) {
                    if (enemy.status.blindTime <= 0)
                        world.damagePlayer(enemy.damage * 1.45, enemy.x, enemy.y);
                    world.particles.ring(enemy.x, enemy.y, '#ff7548', 96, 0.4);
                    world.particles.burst(enemy.x, enemy.y, '#ff7548', 20, 220, 4);
                    world.screenShake(4);
                    world.killEnemy(enemy, 'self-destruct');
                }
                break;
            case 'assassin':
                this.move(enemy, direction.x, direction.y, speed * (distance < 190 ? 1.45 : 1), dt);
                if (enemy.abilityTimer <= 0 && distance > 170) {
                    enemy.abilityTimer = 4.5;
                    const behind = normalize(world.player.vx || world.player.lastMove.x, world.player.vy || world.player.lastMove.y);
                    enemy.x = world.player.x - behind.x * 165 + world.rng.float(-35, 35);
                    enemy.y = world.player.y - behind.y * 165 + world.rng.float(-35, 35);
                    world.particles.ring(enemy.x, enemy.y, '#c779ff', 42, 0.32);
                }
                break;
            case 'burrow':
                this.move(enemy, direction.x, direction.y, speed, dt);
                if (enemy.abilityTimer <= 0) {
                    enemy.abilityTimer = 4.8;
                    enemy.alpha = 0.25;
                    const angle = world.rng.float(0, TAU);
                    enemy.x = world.player.x + Math.cos(angle) * world.rng.float(115, 220);
                    enemy.y = world.player.y + Math.sin(angle) * world.rng.float(115, 220);
                    enemy.alpha = 1;
                    world.particles.ring(enemy.x, enemy.y, '#a58d72', 50, 0.38);
                }
                break;
            case 'elite':
                this.move(enemy, direction.x, direction.y, speed, dt);
                if (enemy.abilityTimer <= 0) {
                    enemy.abilityTimer = 2.6;
                    this.radialVolley(enemy, world, 10, enemy.damage * 0.55, 260, '#d47cff');
                }
                break;
            case 'boss':
                this.keepRange(enemy, direction, distance, speed, dt, 210, 360);
                break;
        }
    }
    move(enemy, dx, dy, speed, dt) {
        const normalized = normalize(dx, dy);
        enemy.vx = normalized.x * speed;
        enemy.vy = normalized.y * speed;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.facing = Math.atan2(normalized.y, normalized.x);
    }
    keepRange(enemy, direction, distance, speed, dt, minimum, maximum) {
        if (distance > maximum)
            this.move(enemy, direction.x, direction.y, speed, dt);
        else if (distance < minimum)
            this.move(enemy, -direction.x, -direction.y, speed * 0.9, dt);
        else {
            const side = enemy.id % 2 === 0 ? 1 : -1;
            this.move(enemy, -direction.y * side, direction.x * side, speed * 0.42, dt);
        }
    }
    updateRanged(enemy, world, direction, distance, speed, dt, count, spread, sniper = false) {
        this.keepRange(enemy, direction, distance, speed, dt, sniper ? 360 : 230, sniper ? 520 : 410);
        if (enemy.attackTimer > 0)
            return;
        enemy.attackTimer = enemy.config.attackCooldown * (sniper ? 1.1 : 1);
        const blindOffset = enemy.status.blindTime > 0 ? (enemy.id % 2 === 0 ? 0.78 : -0.78) : 0;
        const angle = Math.atan2(direction.y, direction.x) + blindOffset;
        const element = enemy.config.element ?? (enemy.config.ai === 'mage' ? 'arcane' : 'physical');
        const color = enemyProjectileColors[element] ?? '#f0b87a';
        if (sniper)
            world.particles.line(enemy.x, enemy.y, world.player.x, world.player.y, '#ef716a', 2, 0.32);
        for (let index = 0; index < count; index += 1) {
            const shotAngle = angle + (index - (count - 1) / 2) * spread;
            world.projectiles.spawn({
                faction: 'enemy',
                sourceWeaponId: `enemy:${enemy.config.id}`,
                element,
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(shotAngle) * enemy.config.projectileSpeed,
                vy: Math.sin(shotAngle) * enemy.config.projectileSpeed,
                damage: enemy.damage * (sniper ? 1.25 : 0.8),
                radius: sniper ? 7 : 6,
                life: sniper ? 2.1 : 2.6,
                pierce: 0,
                color,
                trail: true,
                canHitPlayer: enemy.status.blindTime <= 0,
            });
        }
    }
    radialVolley(enemy, world, count, damage, speed, color) {
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + enemy.id * 0.17;
            world.projectiles.spawn({
                faction: 'enemy',
                sourceWeaponId: `enemy:${enemy.config.id}`,
                element: 'arcane',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                damage,
                radius: 6,
                life: 3,
                color,
                canHitPlayer: enemy.status.blindTime <= 0,
            });
        }
        world.particles.ring(enemy.x, enemy.y, color, 75, 0.35);
    }
    applySeparation(enemy, dt, world) {
        if (enemy.isBoss)
            return;
        const nearby = world.enemySpatial.queryCircle(enemy.x, enemy.y, enemy.radius * 2.7);
        let pushX = 0;
        let pushY = 0;
        let count = 0;
        for (const other of nearby) {
            if (!other.active || other.id === enemy.id)
                continue;
            const dx = enemy.x - other.x;
            const dy = enemy.y - other.y;
            const distSq = dx * dx + dy * dy;
            const min = enemy.radius + other.radius;
            if (distSq <= 0.0001 || distSq > min * min)
                continue;
            const inv = 1 / Math.sqrt(distSq);
            pushX += dx * inv;
            pushY += dy * inv;
            count += 1;
        }
        if (count > 0) {
            enemy.x += pushX / count * 32 * dt;
            enemy.y += pushY / count * 32 * dt;
        }
    }
    contactAttack(enemy, world) {
        if (enemy.status.blindTime > 0 || enemy.status.stunTime > 0 || enemy.status.paralysisTime > 0)
            return;
        const combined = enemy.radius + world.player.radius;
        if (distanceSquared(enemy.x, enemy.y, world.player.x, world.player.y) > combined * combined || enemy.contactTimer > 0)
            return;
        enemy.contactTimer = enemy.isBoss ? 0.6 : 0.82;
        world.damagePlayer(enemy.damage, enemy.x, enemy.y);
        if (enemy.config.ai === 'leech')
            this.healEnemy(enemy, enemy.damage * 1.5);
        const away = normalize(enemy.x - world.player.x, enemy.y - world.player.y);
        enemy.knockbackX += away.x * 120;
        enemy.knockbackY += away.y * 120;
    }
    healEnemy(enemy, amount) {
        const multiplier = 1 - Math.min(0.95, Math.max(0, enemy.status.healingReduction));
        enemy.health = Math.min(enemy.maxHealth, enemy.health + amount * multiplier);
    }
}
//# sourceMappingURL=EnemySystem.js.map