import { normalize, TAU } from '../core/MathUtils.js';
import { RAGE_ACTIVATION_THRESHOLD, ULTIMATE_ACTIVATION_THRESHOLD } from './Player.js';
export class SkillSystem {
    ultimateTick = 0;
    ultimatePulseIndex = 0;
    ragePulseTick = 0;
    ultimateRegenTick = 1;
    rageWasActive = false;
    ultimateWasActive = false;
    update(dt, world) {
        const rageActiveAtFrameStart = world.player.rageActive > 0;
        if (this.rageWasActive && !rageActiveAtFrameStart)
            this.playRageAudio(world, 'end', 0.72);
        this.rageWasActive = rageActiveAtFrameStart;
        const ultimateActiveAtFrameStart = world.player.ultimateActive > 0;
        // Player xử lý nhịp hồi cuối cùng trước SkillSystem trong GameManager.
        // Cạnh 1 -> 0 vì thế chính là nhịp âm thanh hồi phục thứ năm.
        if (this.ultimateWasActive && !ultimateActiveAtFrameStart)
            this.playUltimateAudio(world, 'regen', 0.58);
        this.ultimateWasActive = ultimateActiveAtFrameStart;
        const dashPressed = world.input.wasPressed('Space') || world.input.gamepadPressed(0);
        if (dashPressed && world.player.tryDash()) {
            world.audio.play('dash');
            world.particles.ring(world.player.x, world.player.y, '#65d7cb', 42, 0.28);
            world.particles.burst(world.player.x, world.player.y, '#65d7cb', 12, 170, 3);
            world.screenShake(1.5);
        }
        const activePressed = world.input.wasPressed('KeyQ') || world.input.gamepadPressed(2);
        if (activePressed && world.player.activeCooldown <= 0)
            this.castActive(world);
        const ragePressed = world.input.wasPressed('KeyE') || world.input.gamepadPressed(1);
        if (ragePressed) {
            if (world.player.consumeRage()) {
                const rage = world.player.character.rage;
                world.player.triggerAbilityCast(`rage-${rage?.kind ?? 'overdrive'}`);
                this.ragePulseTick = 0.55;
                this.rageWasActive = true;
                this.playRageAudio(world, 'start', 0.86);
                world.toast(`${rage?.name ?? 'NỘ CHIẾN'} — Tốc đánh ×3 trong 5 giây; sát thương còn 90%.`);
                world.particles.ring(world.player.x, world.player.y, '#ffb14d', 92, 0.45);
                this.emitRageCast(world, world.player.character.id, rage?.bonus ?? 'extra-projectile');
                world.screenShake(3);
            }
            else if (world.player.rageMeter < RAGE_ACTIVATION_THRESHOLD) {
                world.toast(`Nộ ${Math.floor(world.player.rageMeter)}/${RAGE_ACTIVATION_THRESHOLD}%`);
            }
        }
        this.updateRage(dt, world);
        const ultimatePressed = world.input.wasPressed('KeyR') || world.input.gamepadPressed(3);
        let ultimateStartedThisFrame = false;
        if (ultimatePressed) {
            if (world.player.consumeUltimate()) {
                this.ultimateTick = 0;
                this.ultimatePulseIndex = 0;
                this.ultimateRegenTick = 1;
                this.ultimateWasActive = true;
                ultimateStartedThisFrame = true;
                this.playUltimateAudio(world, 'cast', 0.98);
                const ultimate = world.player.character.ultimate;
                world.player.triggerAbilityCast(`ultimate-${ultimate?.kind ?? 'rift-storm'}`);
                world.toast(`${ultimate?.name ?? 'TUYỆT KỸ'} — ${ultimate?.description ?? 'Giải phóng toàn bộ năng lượng.'}`);
                this.emitUltimateCast(world, ultimate?.kind ?? 'rift-storm');
                world.screenShake(6);
            }
            else if (world.player.ultimateMeter < ULTIMATE_ACTIVATION_THRESHOLD) {
                world.toast(`Tuyệt kỹ ${Math.floor(world.player.ultimateMeter)}/${ULTIMATE_ACTIVATION_THRESHOLD}%`);
            }
        }
        if (world.player.ultimateActive > 0) {
            if (!ultimateStartedThisFrame) {
                this.ultimateRegenTick -= dt;
                while (this.ultimateRegenTick <= 0) {
                    this.ultimateRegenTick += 1;
                    this.playUltimateAudio(world, 'regen', 0.58);
                }
            }
            this.ultimateTick -= dt;
            if (this.ultimateTick <= 0) {
                this.ultimateTick = this.ultimateInterval(world.player.character.ultimate?.kind ?? 'rift-storm');
                this.castUltimatePulse(world);
            }
        }
    }
    castActive(world) {
        const kind = world.player.character.active?.kind ?? 'rift-blooddraw';
        const target = kind === 'gale-volley'
            ? world.nearestEnemy(world.player.x, world.player.y, 720 * world.player.stats.get('range'))
            : null;
        const castDirection = target
            ? normalize(target.x - world.player.x, target.y - world.player.y)
            : world.player.aim;
        world.player.triggerAbilityCast(`active-${kind}`, castDirection);
        const range = world.player.stats.get('range');
        const primary = this.primarySkillContext(world);
        switch (kind) {
            case 'rift-blooddraw': {
                const total = this.damageArea(world, 205 * range, 62, primary.element ?? 'physical', 'active-rift-blooddraw', 0.85, 145, primary, (enemy) => {
                    const direction = normalize(enemy.x - world.player.x, enemy.y - world.player.y);
                    enemy.knockbackX += direction.x * 45;
                    enemy.knockbackY += direction.y * 45;
                });
                world.player.heal(Math.min(world.player.stats.get('maxHp') * 0.16, total * 0.3), false);
                break;
            }
            case 'gale-volley':
                this.castGaleVolley(world, primary);
                break;
            case 'sanctuary-guard':
                world.player.invulnerable = Math.max(world.player.invulnerable, 1.6);
                this.damageArea(world, 175 * range, 30, primary.element ?? 'physical', 'active-sanctuary-guard', 1, 210, primary, (enemy) => {
                    enemy.status.stunTime = Math.max(enemy.status.stunTime, enemy.isBoss ? 0.08 : enemy.isElite ? 0.22 : 0.48);
                });
                break;
            case 'frost-ruin':
                // Nyra đập vỡ chính Hỏa Cầu Than Hồng: sát thương gốc vẫn là Lửa
                // của vũ khí chính, còn lớp băng hoại là hiệu ứng khống chế chuyên biệt.
                this.damageArea(world, 255 * range, 44, primary.element ?? 'fire', 'active-ember-frost-ruin', 1, 35, primary, (enemy) => {
                    enemy.status.slowTime = Math.max(enemy.status.slowTime, 3.2);
                    enemy.status.slowFactor = Math.min(enemy.status.slowFactor, 0.36);
                    enemy.status.stunTime = Math.max(enemy.status.stunTime, enemy.isBoss ? 0.12 : enemy.isElite ? 0.34 : 0.72);
                });
                break;
            case 'hemotoxic-draw': {
                const total = this.damageArea(world, 235 * range, 36, primary.element ?? 'poison', 'active-hemotoxic-draw', 1, 25, primary, (enemy) => {
                    enemy.status.poisonTime = Math.max(enemy.status.poisonTime, 5);
                    enemy.status.healingReduction = Math.max(enemy.status.healingReduction, 0.3);
                });
                world.player.heal(Math.min(world.player.stats.get('maxHp') * 0.12, total * 0.2), false);
                break;
            }
            case 'echo-pack':
                this.castEchoPack(world, primary);
                break;
            case 'gravity-breaker':
                this.damageArea(world, 205 * range, 70, primary.element ?? 'physical', 'active-gravity-breaker', 1, 340, primary, (enemy) => {
                    const direction = normalize(enemy.x - world.player.x, enemy.y - world.player.y);
                    const force = enemy.isBoss ? 30 : enemy.isElite ? 90 : 190;
                    enemy.knockbackX += direction.x * force;
                    enemy.knockbackY += direction.y * force;
                    enemy.status.stunTime = Math.max(enemy.status.stunTime, enemy.isBoss ? 0.1 : enemy.isElite ? 0.3 : 0.62);
                });
                break;
            case 'astral-fold':
                this.damageArea(world, 300 * range, 50, primary.element ?? 'arcane', 'active-astral-fold', 1, 0, primary, (enemy) => {
                    const pull = normalize(world.player.x - enemy.x, world.player.y - enemy.y);
                    const force = enemy.isBoss ? 24 : enemy.isElite ? 74 : 150;
                    enemy.knockbackX += pull.x * force;
                    enemy.knockbackY += pull.y * force;
                    if (enemy.status.blindCooldown <= 0) {
                        enemy.status.blindTime = Math.max(enemy.status.blindTime, enemy.isBoss ? 0.8 : 1.6);
                        enemy.status.blindCooldown = 8;
                    }
                });
                break;
            default:
                this.damageArea(world, 220 * range, 52, primary.element ?? 'arcane', `active-${kind}`, 0.7, 180, primary);
                break;
        }
        world.player.activeCooldown = world.player.activeCooldownDuration();
        this.playClassSkillAudio(world, kind, 0.88);
        this.emitActiveCast(world, kind);
        world.screenShake(4);
    }
    primarySkillContext(world) {
        const entry = world.weapons?.primaryEntry() ?? null;
        if (!entry)
            return { damageMultiplier: 1 };
        const levels = entry.config.levels;
        const levelOne = levels[0];
        const currentLevel = levels[Math.max(0, Math.min(levels.length - 1, entry.runtime.level - 1))] ?? levelOne;
        const levelMultiplier = levelOne && levelOne.damage > 0 && currentLevel
            ? currentLevel.damage / levelOne.damage
            : 1;
        // Tinh thông cộng dồn vô hạn; refinementBonus là phẩm chất nhận từ thẻ rarity.
        const masteryMultiplier = 1 + Math.max(0, entry.runtime.masteryLevel) * 0.08;
        const refinementMultiplier = 1 + Math.max(0, entry.runtime.refinementBonus);
        const evolution = entry.runtime.evolutionId
            ? world.data?.evolutionById.get(entry.runtime.evolutionId)
            : undefined;
        return {
            element: entry.config.element,
            damageMultiplier: levelMultiplier * masteryMultiplier * refinementMultiplier * (evolution?.damageMultiplier ?? 1),
            signature: entry.config.signature,
        };
    }
    damageArea(world, radius, baseDamage, element, sourceWeaponId, statusChance, knockback, primary, afterHit) {
        let totalDamage = 0;
        const candidates = world.enemySpatial.queryCircle(world.player.x, world.player.y, radius);
        for (const enemy of candidates) {
            if (!enemy.active)
                continue;
            const critical = this.rollSkillCritical(world);
            const damage = baseDamage * primary.damageMultiplier * world.player.effectiveDamageMultiplier()
                * (critical ? world.player.skillCritDamage() : 1);
            totalDamage += world.damageEnemy(enemy, damage, element, sourceWeaponId, statusChance, knockback, critical, world.player.x, world.player.y, primary.signature).amount;
            // damageEnemy có thể tiêu diệt và trả Enemy về pool ngay trong lệnh gọi.
            // Không ghi trạng thái vào một phần tử đã release vì lần spawn kế tiếp
            // sẽ thừa hưởng dữ liệu sai.
            if (enemy.active)
                afterHit?.(enemy);
        }
        return totalDamage;
    }
    castGaleVolley(world, primary) {
        const requestedCount = 9 + world.player.stats.get('bonusProjectiles');
        const count = Math.min(16, requestedCount);
        const foldedDamage = requestedCount / count;
        const target = world.nearestEnemy(world.player.x, world.player.y, 720 * world.player.stats.get('range'));
        const aim = target ? normalize(target.x - world.player.x, target.y - world.player.y) : world.player.aim;
        const baseAngle = Math.atan2(aim.y, aim.x);
        const speed = 690 * world.player.stats.get('projectileSpeed');
        const range = 760 * world.player.stats.get('range');
        for (let index = 0; index < count; index += 1) {
            const angle = baseAngle + (index - (count - 1) / 2) * 0.085;
            const critical = this.rollSkillCritical(world);
            const damage = 23 * foldedDamage * primary.damageMultiplier * world.player.effectiveDamageMultiplier()
                * (critical ? world.player.skillCritDamage() : 1);
            world.projectiles.spawn({
                sourceWeaponId: 'active-gale-volley', element: primary.element ?? 'physical', x: world.player.x, y: world.player.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, radius: 5,
                life: range / speed, maxRange: range, pierce: 1, statusChance: 0.85, knockback: 34,
                critical, color: '#fff0a0', homing: 0.08, hitEffect: primary.signature,
            });
        }
    }
    castEchoPack(world, primary) {
        const requestedCount = 6 + world.player.stats.get('bonusProjectiles');
        const count = Math.min(12, requestedCount);
        const foldedDamage = requestedCount / count;
        const speed = 450 * world.player.stats.get('projectileSpeed');
        const range = 650 * world.player.stats.get('range');
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + this.ultimatePulseIndex * 0.17;
            const critical = this.rollSkillCritical(world);
            const damage = 29 * foldedDamage * primary.damageMultiplier * world.player.effectiveDamageMultiplier()
                * (critical ? world.player.skillCritDamage() : 1);
            world.projectiles.spawn({
                sourceWeaponId: 'active-echo-pack', element: primary.element ?? 'arcane',
                x: world.player.x + Math.cos(angle) * 32, y: world.player.y + Math.sin(angle) * 32,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, radius: 7,
                life: range / speed, maxRange: range, pierce: 2, statusChance: 0.62, knockback: 20,
                critical, color: '#e4a5ff', homing: 0.38, hitEffect: primary.signature,
            });
        }
    }
    castUltimatePulse(world) {
        const kind = world.player.character.ultimate?.kind ?? 'rift-storm';
        const radiusMultiplier = kind === 'titanfall' ? 0.72 : kind === 'arrow-rain' ? 1.15 : kind === 'void-collapse' ? 0.9 : 1;
        const radius = 420 * radiusMultiplier * world.player.stats.get('range');
        const elements = ['fire', 'ice', 'lightning', 'poison'];
        const pulseIndex = this.ultimatePulseIndex;
        const element = kind === 'elemental-tempest' ? (elements[pulseIndex % elements.length] ?? 'fire')
            : kind === 'plague-night' ? 'poison'
                : kind === 'forgequake' ? 'fire'
                    : kind === 'arrow-rain' || kind === 'titanfall' ? 'physical' : 'arcane';
        this.ultimatePulseIndex += 1;
        const candidates = world.enemySpatial.queryCircle(world.player.x, world.player.y, radius);
        for (const enemy of candidates) {
            if (!enemy.active)
                continue;
            const baseDamage = (kind === 'titanfall' ? (pulseIndex === 0 ? 92 : 18)
                : kind === 'arrow-rain' ? 26
                    : kind === 'forgequake' ? 32
                        : kind === 'elemental-tempest' ? 24
                            : kind === 'plague-night' ? 18
                                : kind === 'echo-legion' ? 14
                                    : kind === 'void-collapse' ? 30 : 24) * world.player.effectiveDamageMultiplier();
            const critical = this.rollSkillCritical(world);
            const damage = baseDamage * (critical ? world.player.skillCritDamage() : 1);
            world.damageEnemy(enemy, damage, element, `ultimate-${kind}`, 1, kind === 'void-collapse' ? 0 : 45, critical, world.player.x, world.player.y);
            if (!enemy.active)
                continue;
            if (kind === 'void-collapse') {
                // Sát thương Huyền Thuật không đi qua nhánh đẩy lùi Vật Lý
                // trong GameManager, vì vậy lực hút cần được áp dụng trực tiếp.
                const pull = normalize(world.player.x - enemy.x, world.player.y - enemy.y);
                enemy.knockbackX += pull.x * (enemy.isBoss ? 28 : enemy.isElite ? 72 : 145);
                enemy.knockbackY += pull.y * (enemy.isBoss ? 28 : enemy.isElite ? 72 : 145);
            }
            if (kind === 'rift-storm') {
                const push = normalize(enemy.x - world.player.x, enemy.y - world.player.y);
                enemy.knockbackX += push.x * (enemy.isBoss ? 20 : enemy.isElite ? 52 : 105);
                enemy.knockbackY += push.y * (enemy.isBoss ? 20 : enemy.isElite ? 52 : 105);
            }
            if (kind === 'plague-night') {
                enemy.status.healingReduction = Math.max(enemy.status.healingReduction, 0.3);
            }
            if (kind === 'rift-storm' || kind === 'void-collapse') {
                enemy.status.slowTime = Math.max(enemy.status.slowTime, 0.8);
                enemy.status.slowFactor = Math.min(enemy.status.slowFactor, 0.35);
            }
            if (kind === 'forgequake' || kind === 'titanfall')
                enemy.status.stunTime = Math.max(enemy.status.stunTime, enemy.isBoss ? 0.08 : 0.32);
        }
        if (kind === 'echo-legion')
            this.spawnEchoLegion(world, pulseIndex);
        this.emitUltimatePulseVfx(world, kind, element, pulseIndex, radius);
        if (element === 'lightning')
            world.audio.play('lightning', 0.38);
        else if (element === 'fire')
            world.audio.play('fire', 0.36);
        if (kind === 'titanfall' && pulseIndex === 0)
            world.screenShake(8);
        const color = element === 'fire' ? '#ff7b39' : element === 'ice' ? '#78d7ff' : element === 'lightning' ? '#65baff' : element === 'poison' ? '#77e56f' : element === 'physical' ? '#f2d28b' : '#d77cff';
        world.particles.ring(world.player.x, world.player.y, color, radius * 0.68, 0.32);
    }
    updateRage(dt, world) {
        if (!(world.player.rageActive > 0))
            return;
        this.ragePulseTick -= dt;
        if (this.ragePulseTick > 0)
            return;
        this.ragePulseTick += 0.65;
        const immunity = world.player.rageStatusImmune;
        this.playRageAudio(world, 'loop', 0.34);
        world.particles.ring(world.player.x, world.player.y, immunity ? '#8df8ff' : '#ffbd58', immunity ? 66 : 58, 0.2);
        if (immunity)
            world.particles.spawnAtlas?.(4, world.player.x, world.player.y, 74, 0.24, 0.42);
    }
    spawnEchoLegion(world, pulseIndex) {
        const count = 8;
        const speed = 520 * world.player.stats.get('projectileSpeed');
        const range = 520 * world.player.stats.get('range');
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + pulseIndex * 0.22;
            const critical = this.rollSkillCritical(world);
            const damage = 17 * world.player.effectiveDamageMultiplier() * (critical ? world.player.skillCritDamage() : 1);
            world.projectiles.spawn({
                sourceWeaponId: 'ultimate-echo-legion',
                element: 'arcane',
                x: world.player.x + Math.cos(angle) * 42,
                y: world.player.y + Math.sin(angle) * 42,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                damage,
                radius: 6,
                life: range / speed,
                pierce: 1,
                maxRange: range,
                statusChance: 0.55,
                knockback: 25,
                critical,
                color: '#d77cff',
            });
        }
    }
    emitActiveCast(world, kind) {
        const x = world.player.x;
        const y = world.player.y;
        switch (kind) {
            case 'rift-blooddraw': {
                const direction = world.player.actionDirection;
                const baseAngle = Math.atan2(direction.y, direction.x);
                const slashCenterX = x + direction.x * 44;
                const slashCenterY = y + direction.y * 44;
                // Atlas chém là phản hồi ở đầu vũ khí, không phải một sprite lớn
                // phủ giữa thân nhân vật. Mọi streak dùng cùng vector pose đã khóa để
                // hình và vùng phản hồi không lệch nhau nếu aim đổi giữa hai frame.
                world.particles.spawnStatusAtlas?.(1, slashCenterX, slashCenterY, 112, 0.38, 0.86);
                for (let index = -2; index <= 2; index += 1) {
                    const angle = baseAngle + index * 0.22;
                    world.particles.slash?.(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, x + Math.cos(angle) * 190, y + Math.sin(angle) * 190, '#ff6f74', 5, 0.27);
                }
                world.particles.ring(x, y, '#6fe3d5', 142, 0.36);
                break;
            }
            case 'gale-volley':
                world.particles.spawnStatusAtlas?.(1, x, y, 112, 0.34, 0.88);
                world.particles.ring(x, y, '#fff0a0', 96, 0.28);
                break;
            case 'sanctuary-guard':
                world.particles.spawnAtlas?.(4, x, y, 196, 0.7, 1);
                world.particles.ring(x, y, '#8df8ff', 122, 0.55);
                world.particles.ring(x, y, '#fff0a0', 94, 0.46);
                break;
            case 'frost-ruin':
                world.particles.spawnAtlas?.(1, x, y, 184, 0.48, 0.9);
                world.particles.spawnAtlas?.(2, x, y, 238, 0.62, 1);
                for (let index = 0; index < 12; index += 1) {
                    const angle = index / 12 * TAU;
                    world.particles.line(x + Math.cos(angle) * 32, y + Math.sin(angle) * 32, x + Math.cos(angle) * 252, y + Math.sin(angle) * 252, '#89e8ff', 4, 0.36);
                }
                break;
            case 'hemotoxic-draw':
                world.particles.spawnStatusAtlas?.(0, x, y, 206, 0.64, 0.96);
                for (let index = 0; index < 16; index += 1) {
                    const angle = index / 16 * TAU;
                    const distance = 42 + index % 4 * 28;
                    world.particles.spawn?.('smoke', x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, '#73e878', 8, 0.7, -Math.cos(angle) * 25, -Math.sin(angle) * 25 - 12);
                }
                break;
            case 'echo-pack':
                world.particles.spawnAtlas?.(3, x, y, 188, 0.58, 0.98, true);
                for (let index = 0; index < 6; index += 1) {
                    const angle = index / 6 * TAU;
                    world.particles.slash?.(x + Math.cos(angle) * 35, y + Math.sin(angle) * 35, x + Math.cos(angle) * 126, y + Math.sin(angle) * 126, '#e4a5ff', 4, 0.4);
                }
                break;
            case 'gravity-breaker':
                world.particles.spawnStatusAtlas?.(1, x, y, 226, 0.66, 1);
                world.particles.spawnAtlas?.(1, x, y, 168, 0.5, 0.9);
                this.emitRadialCracks(world, x, y, 210, '#ffd27a', 14, 7, 0.04);
                break;
            case 'astral-fold':
                world.particles.spawnAtlas?.(3, x, y, 224, 0.68, 1, true);
                world.particles.ring(x, y, '#d58aff', 250, 0.58);
                for (let index = 0; index < 10; index += 1) {
                    const angle = index / 10 * TAU;
                    world.particles.line(x + Math.cos(angle) * 275, y + Math.sin(angle) * 275, x + Math.cos(angle) * 44, y + Math.sin(angle) * 44, '#d58aff', 4, 0.42);
                }
                break;
            default:
                world.particles.spawnAtlas?.(3, x, y, 176, 0.5, 0.8);
                world.particles.ring(x, y, '#c779ff', 180, 0.42);
                break;
        }
    }
    emitRageCast(world, characterId, bonus) {
        const x = world.player.x;
        const y = world.player.y;
        const colors = {
            'kael-orin': '#69e1d3', 'mira-voss': '#fff0a0', 'toren-vale': '#ffb15b', 'nyra-sol': '#89dfff',
            zarek: '#70e878', elara: '#e4a5ff', titan: '#ffd27a', nova: '#d58aff',
        };
        const color = colors[characterId] ?? '#ffb14d';
        world.particles.spawnAtlas?.(bonus === 'status-immunity' ? 4 : 0, x, y, 142, 0.5, 0.9);
        world.particles.ring(x, y, color, 116, 0.48);
        if (bonus === 'extra-projectile') {
            for (let index = -1; index <= 1; index += 1) {
                const angle = Math.atan2(world.player.aim.y, world.player.aim.x) + index * 0.26;
                world.particles.slash?.(x, y, x + Math.cos(angle) * 126, y + Math.sin(angle) * 126, color, 4, 0.34);
            }
        }
        else {
            world.particles.ring(x, y, '#eaffff', 82, 0.4);
        }
    }
    emitUltimateCast(world, kind) {
        const x = world.player.x;
        const y = world.player.y;
        // Hai biên vàng/cyan là ngôn ngữ chung cho "Tuyệt kỹ đã kích hoạt";
        // choreography bên trong vẫn khác nhau hoàn toàn giữa tám nhân vật.
        world.particles.ring(x, y, '#ffe187', 370, 0.88);
        world.particles.ring(x, y, '#7deeff', 312, 0.7);
        switch (kind) {
            case 'arrow-rain':
                world.particles.spawnStatusAtlas?.(1, x, y, 178, 0.62, 0.94);
                world.particles.ring(x, y, '#ffe187', 330, 0.75);
                for (let index = -3; index <= 3; index += 1) {
                    const endX = x + index * 52;
                    world.particles.slash?.(endX - 42, y - 285, endX + 18, y - 38, '#fff1a8', 5, 0.46);
                }
                break;
            case 'forgequake':
                world.particles.spawnAtlas?.(1, x, y, 238, 0.7, 1);
                world.particles.spawnAtlas?.(4, x, y, 184, 0.52, 0.82);
                this.emitRadialCracks(world, x, y, 260, '#ff9a4f', 12, 7, 0);
                break;
            case 'elemental-tempest':
                for (let row = 0; row < 4; row += 1) {
                    const angle = row / 4 * TAU - Math.PI / 2;
                    world.particles.spawnAtlas?.(row, x + Math.cos(angle) * 76, y + Math.sin(angle) * 76, 112, 0.66, 0.9);
                }
                world.particles.ring(x, y, '#f7f0d2', 315, 0.78);
                break;
            case 'plague-night':
                world.particles.spawnAtlas?.(3, x, y, 210, 0.72, 0.8, true);
                for (let index = 0; index < 20; index += 1) {
                    const angle = index / 20 * TAU;
                    const distance = 45 + index % 4 * 30;
                    world.particles.spawn?.('smoke', x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, '#6fe378', 9, 0.9, Math.cos(angle) * 38, Math.sin(angle) * 38 - 12);
                }
                world.particles.ring(x, y, '#87f08c', 335, 0.82);
                break;
            case 'echo-legion':
                world.particles.spawnAtlas?.(3, x, y, 230, 0.72, 0.96, true);
                for (let index = 0; index < 8; index += 1) {
                    const angle = index / 8 * TAU;
                    const fromX = x + Math.cos(angle) * 54;
                    const fromY = y + Math.sin(angle) * 54;
                    world.particles.slash?.(fromX, fromY, x + Math.cos(angle) * 260, y + Math.sin(angle) * 260, '#e4a5ff', 4, 0.42);
                }
                break;
            case 'titanfall':
                world.particles.spawnStatusAtlas?.(1, x, y, 286, 0.82, 1);
                world.particles.spawnAtlas?.(1, x, y, 210, 0.62, 0.9);
                this.emitRadialCracks(world, x, y, 315, '#ffd27a', 16, 8, 0.08);
                break;
            case 'void-collapse':
                world.particles.spawnAtlas?.(3, x, y, 284, 0.86, 1, true);
                world.particles.ring(x, y, '#d58aff', 350, 0.84);
                for (let index = 0; index < 12; index += 1) {
                    const angle = index / 12 * TAU;
                    world.particles.slash?.(x + Math.cos(angle) * 310, y + Math.sin(angle) * 310, x + Math.cos(angle) * 68, y + Math.sin(angle) * 68, '#d58aff', 5, 0.62);
                }
                break;
            default:
                world.particles.spawnAtlas?.(0, x, y, 226, 0.7, 0.95);
                world.particles.spawnAtlas?.(3, x, y, 176, 0.58, 0.76);
                world.particles.ring(x, y, '#8eeeff', 340, 0.8);
                this.emitRadialCracks(world, x, y, 290, '#8eeeff', 14, 5, 0.03);
                break;
        }
    }
    emitUltimatePulseVfx(world, kind, element, pulseIndex, radius) {
        const x = world.player.x;
        const y = world.player.y;
        const phase = pulseIndex * 0.83;
        switch (kind) {
            case 'arrow-rain': {
                for (let index = 0; index < 3; index += 1) {
                    const angle = phase + index / 3 * TAU;
                    const distance = radius * (0.25 + (index + pulseIndex) % 3 * 0.2);
                    const impactX = x + Math.cos(angle) * distance;
                    const impactY = y + Math.sin(angle) * distance;
                    world.particles.slash?.(impactX - 24, impactY - 132, impactX + 8, impactY, '#fff0a0', 4, 0.24);
                    world.particles.spawnStatusAtlas?.(1, impactX, impactY, 58, 0.28, 0.78);
                }
                break;
            }
            case 'forgequake':
                world.particles.spawnAtlas?.(1, x, y, 152, 0.38, 0.86);
                this.emitRadialCracks(world, x, y, radius * 0.72, '#ff8848', 8, 5, phase);
                break;
            case 'elemental-tempest': {
                const row = element === 'lightning' ? 0 : element === 'fire' ? 1 : element === 'ice' ? 2 : 3;
                const angle = phase + pulseIndex % 4 * Math.PI / 2;
                const impactX = x + Math.cos(angle) * radius * 0.38;
                const impactY = y + Math.sin(angle) * radius * 0.38;
                if (element === 'poison') {
                    for (let index = 0; index < 7; index += 1)
                        world.particles.spawn?.('smoke', impactX, impactY, '#73e47b', 7, 0.54, (index - 3) * 11, -24 - index * 2);
                }
                else
                    world.particles.spawnAtlas?.(row, impactX, impactY, 118, 0.36, 0.9);
                break;
            }
            case 'plague-night':
                for (let index = 0; index < 5; index += 1) {
                    const angle = phase + index / 5 * TAU;
                    const cloudX = x + Math.cos(angle) * radius * 0.5;
                    const cloudY = y + Math.sin(angle) * radius * 0.5;
                    world.particles.spawn?.('smoke', cloudX, cloudY, '#69df73', 8, 0.68, Math.cos(angle) * 18, Math.sin(angle) * 18 - 14);
                }
                if (pulseIndex % 3 === 0)
                    world.particles.spawnAtlas?.(3, x, y, 142, 0.44, 0.52, true);
                break;
            case 'echo-legion':
                world.particles.spawnAtlas?.(3, x, y, 104, 0.3, 0.72, pulseIndex % 2 === 0);
                break;
            case 'titanfall':
                if (pulseIndex === 0)
                    world.particles.spawnStatusAtlas?.(1, x, y, 278, 0.68, 0.94);
                else
                    world.particles.spawnAtlas?.(1, x, y, 138, 0.34, 0.94);
                if (pulseIndex === 0)
                    this.emitRadialCracks(world, x, y, radius * 0.88, '#ffe093', 18, 8, 0.04);
                break;
            case 'void-collapse':
                world.particles.spawnAtlas?.(3, x, y, 132 + pulseIndex % 3 * 18, 0.4, 0.76, true);
                for (let index = 0; index < 6; index += 1) {
                    const angle = phase + index / 6 * TAU;
                    world.particles.line(x + Math.cos(angle) * radius * 0.58, y + Math.sin(angle) * radius * 0.58, x + Math.cos(angle) * 48, y + Math.sin(angle) * 48, '#c982ff', 3, 0.25);
                }
                break;
            default:
                world.particles.spawnAtlas?.(pulseIndex % 2 === 0 ? 0 : 3, x, y, 128, 0.34, 0.76);
                this.emitRadialCracks(world, x, y, radius * 0.62, '#77dfff', 7, 4, phase);
                break;
        }
    }
    emitRadialCracks(world, x, y, radius, color, count, size, offset) {
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * TAU + offset;
            const midX = x + Math.cos(angle + 0.06) * radius * 0.48;
            const midY = y + Math.sin(angle + 0.06) * radius * 0.48;
            const endX = x + Math.cos(angle) * radius;
            const endY = y + Math.sin(angle) * radius;
            world.particles.slash?.(x, y, midX, midY, color, size, 0.38);
            world.particles.slash?.(midX, midY, endX, endY, color, Math.max(2, size - 2), 0.38);
        }
    }
    ultimateInterval(kind) {
        switch (kind) {
            case 'arrow-rain': return 0.27;
            case 'forgequake': return 0.48;
            case 'elemental-tempest': return 0.34;
            case 'plague-night': return 0.25;
            case 'echo-legion': return 0.42;
            case 'titanfall': return 0.72;
            case 'void-collapse': return 0.4;
            default: return 0.34;
        }
    }
    rollSkillCritical(world) {
        return world.player.skillCritShards > 0 && world.rng.chance(0.1);
    }
    playClassSkillAudio(world, kind, intensity) {
        const audio = world.audio;
        if (typeof audio.playClassSkill === 'function')
            audio.playClassSkill(kind, intensity);
        else
            audio.play('skill', intensity);
    }
    playRageAudio(world, phase, intensity) {
        const audio = world.audio;
        if (typeof audio.playRagePhase === 'function')
            audio.playRagePhase(phase, intensity);
        else if (phase === 'start')
            audio.play('rage', intensity);
    }
    playUltimateAudio(world, phase, intensity) {
        const audio = world.audio;
        if (typeof audio.playUltimatePhase === 'function')
            audio.playUltimatePhase(phase, intensity);
        else if (phase === 'cast')
            audio.play('ultimate', intensity);
    }
}
//# sourceMappingURL=SkillSystem.js.map