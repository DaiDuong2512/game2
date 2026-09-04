import {
  angleDelta,
  distance,
  distanceSquared,
  normalize,
  pointToSegmentDistanceSquared,
  TAU,
} from '../core/MathUtils.js';
import type {
  DamageResult,
  ElementType,
  EvolutionConfig,
  GameData,
  WeaponConfig,
  WeaponRuntime,
  WeaponSignatureConfig,
  WeaponSlot,
} from '../core/Types.js';
import type { SoundId } from '../core/AudioManager.js';
import type { ProjectileWorld } from './ProjectileSystem.js';
import { signatureHitSound } from './ProjectileSystem.js';
import type { Enemy } from './Entities.js';
import type { ProjectileSystem } from './ProjectileSystem.js';
import type { ParticleSystem } from './ParticleSystem.js';
import { WeaponBase } from './WeaponBase.js';

export interface WeaponWorld extends ProjectileWorld {
  projectiles: ProjectileSystem;
  autoAim: boolean;
  particles: ParticleSystem;
  screenShake(amount: number): void;
}

const elementColors: Record<ElementType, string> = {
  physical: '#dbe7e7',
  fire: '#ff7b39',
  ice: '#78d7ff',
  lightning: '#65baff',
  poison: '#6ee06a',
  arcane: '#d77cff',
};

const MAX_CATCH_UP_SHOTS = 6;
export const SWORD_PULSE_COUNT = 4;
export const SWORD_PULSE_DAMAGE_SHARE = 1 / SWORD_PULSE_COUNT;
export const SWORD_PULSE_KNOCKBACK_SHARE = 0.22;
export const SWORD_LAYER_SPACING = 28;
export const SWORD_MAX_VISIBLE_LAYERS = 12;
export const SUMMON_ORBIT_SPEED = 1.65;
export const SUMMONS_PER_ORBIT_LAYER = 3;
export const SUMMON_AUXILIARY_RAY_DAMAGE_SHARE = 1 / 3;
export const SUMMON_AUXILIARY_RAY_COUNT = 2;
export const ORBIT_GUARDIAN_SPEED = 2.25;
export const ORBIT_GUARDIAN_RAY_RANGE = 560;
export const ORBIT_GUARDIAN_RAY_SPEED = 760;
export const ORBIT_GUARDIAN_RAY_DAMAGE_SHARE = 1 / 3;

const WEAPON_BALANCE_DAMAGE_MULTIPLIERS: Readonly<Record<WeaponConfig['behavior'], number>> = {
  slash: 1.18,
  bow: 1,
  gun: 1.1,
  darts: 1.16,
  bomb: 1.18,
  lightning: 1.14,
  fireball: 1.15,
  ice: 1.18,
  laser: 1.12,
  poison: 1.2,
  'poison-bomb': 1.18,
  orbit: 1.16,
  summon: 1.15,
  nova: 1.18,
};

export function weaponBalanceDamageMultiplier(behavior: WeaponConfig['behavior']): number {
  return WEAPON_BALANCE_DAMAGE_MULTIPLIERS[behavior];
}

/** Bonus riêng của vũ khí khởi đầu, tránh cộng thêm đạn cho toàn bộ kho vũ khí của nhân vật. */
export function characterWeaponCountBonus(characterId: string | undefined, weaponId: string): number {
  return characterId === 'zarek' && weaponId === 'venom-bloom' ? 1 : 0;
}

export function swordLayerRadius(baseRange: number, layerIndex: number): number {
  return baseRange + Math.max(0, layerIndex) * SWORD_LAYER_SPACING;
}

/** Các tia không còn bị ép thành cặp 180°. Mỗi chỉ số luôn tạo một hướng riêng. */
export function volleyAngleOffset(index: number, count: number, spread: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * spread;
}

const DIRECTIONAL_BEHAVIORS = new Set<WeaponConfig['behavior']>([
  'bow',
  'gun',
  'darts',
  'bomb',
  'lightning',
  'fireball',
  'laser',
  'poison',
]);

interface WeaponTargetPlan {
  weapon: DataDrivenWeapon;
  slotIndex: number;
  slotAngle: number;
  candidates: Enemy[];
}

/** Một cue khai hỏa duy nhất theo hình thái vũ khí, tránh chồng tiếng generic. */
export function weaponFireSound(weapon: Pick<WeaponConfig, 'behavior' | 'element'>): SoundId {
  switch (weapon.behavior) {
    case 'slash': return 'slash';
    case 'bow': return 'bow';
    case 'lightning': return 'lightning';
    case 'fireball': return 'fire';
    case 'poison-bomb': return 'poison-throw';
    case 'poison': return 'poison-cloud';
    default: return weapon.element === 'arcane' ? 'arcane' : 'shoot';
  }
}

function playDirectSignatureHit(world: WeaponWorld, effect?: WeaponSignatureConfig): void {
  const cue = signatureHitSound(effect);
  if (cue) world.audio?.play(cue, cue === 'bleed' ? 0.24 : 0.2);
}

class DataDrivenWeapon extends WeaponBase<WeaponWorld> {
  private readonly data: GameData;
  private foldedRateMultiplier = 1;
  private foldedVolleyMultiplier = 1;
  private swordPulsesRemaining = 0;
  private swordPulseInterval = 0.25;

  public constructor(config: WeaponConfig, data: GameData, slot: WeaponSlot) {
    super(config, slot);
    this.data = data;
  }

  public override update(dt: number, world: WeaponWorld, assignedTarget?: Enemy | null): void {
    const orbitSpeed = this.config.behavior === 'summon' ? SUMMON_ORBIT_SPEED
      : this.config.behavior === 'orbit' ? ORBIT_GUARDIAN_SPEED
        : this.config.behavior === 'slash' ? TAU : 0.75;
    const orbitAttackSpeed = this.config.behavior === 'orbit' || this.config.behavior === 'summon'
      ? Math.max(0.5, world.player.effectiveAttackSpeed?.() ?? world.player.stats.get('attackSpeed'))
      : 1;
    this.runtime.summonAngle = (this.runtime.summonAngle + dt * orbitSpeed * orbitAttackSpeed) % TAU;
    if (this.config.behavior === 'slash') {
      this.updateSwordSpin(dt, world);
      return;
    }
    this.runtime.cooldown -= dt;
    let catchUpShots = 0;
    let lastInterval = 0.055;
    while (this.runtime.cooldown <= 0 && catchUpShots < MAX_CATCH_UP_SHOTS) {
      const level = this.levelData();
      const evolution = this.runtime.evolutionId ? this.data.evolutionById.get(this.runtime.evolutionId) : undefined;
      const cooldownMultiplier = evolution?.cooldownMultiplier ?? 1;
      const summonSpeedBonus = this.config.behavior === 'summon' && world.player.character.passive.kind === 'summon-bonus' ? world.player.character.passive.value : 0;
      const rawCooldown = level.cooldown * cooldownMultiplier * (1 - world.player.stats.get('cooldownReduction'))
        / Math.max(0.001, (world.player.effectiveAttackSpeed?.() ?? world.player.stats.get('attackSpeed')) * (1 + summonSpeedBonus));
      lastInterval = Math.max(0.055, rawCooldown);
      this.foldedRateMultiplier = Math.max(1, 0.055 / Math.max(0.001, rawCooldown));
      // Cộng vào số âm để giữ phần thời gian vượt quá mốc bắn. Gán thẳng
      // interval làm tốc độ bắn phụ thuộc FPS, đặc biệt gần giới hạn 55 ms.
      this.runtime.cooldown += lastInterval;
      this.fire(world, evolution, assignedTarget);
      catchUpShots += 1;
    }
    if (catchUpShots >= MAX_CATCH_UP_SHOTS && this.runtime.cooldown <= 0) {
      // Tránh vòng lặp đuổi nợ vô hạn sau một frame bị treo dài; gameplay bình
      // thường (dt <= 33 ms) không chạm nhánh bảo vệ này.
      this.runtime.cooldown = lastInterval;
    }
  }

  private updateSwordSpin(dt: number, world: WeaponWorld): void {
    this.runtime.cooldown -= dt;
    this.runtime.orbitHitClock -= dt;
    let steps = 0;
    while (steps < MAX_CATCH_UP_SHOTS) {
      if (this.swordPulsesRemaining > 0 && this.runtime.orbitHitClock <= 0) {
        const evolution = this.runtime.evolutionId ? this.data.evolutionById.get(this.runtime.evolutionId) : undefined;
        this.fireSwordPulse(world, evolution, SWORD_PULSE_COUNT - this.swordPulsesRemaining);
        this.swordPulsesRemaining -= 1;
        this.runtime.orbitHitClock += this.swordPulseInterval;
        steps += 1;
        continue;
      }
      if (this.swordPulsesRemaining === 0 && this.runtime.cooldown <= 0) {
        const level = this.levelData();
        const evolution = this.runtime.evolutionId ? this.data.evolutionById.get(this.runtime.evolutionId) : undefined;
        const rawCycle = level.cooldown * (evolution?.cooldownMultiplier ?? 1)
          * (1 - world.player.stats.get('cooldownReduction'))
          / Math.max(0.001, world.player.effectiveAttackSpeed?.() ?? world.player.stats.get('attackSpeed'));
        const cycle = Math.max(0.22, rawCycle);
        this.foldedRateMultiplier = Math.max(1, 0.22 / Math.max(0.001, rawCycle));
        this.runtime.cooldown += cycle;
        this.swordPulseInterval = cycle / SWORD_PULSE_COUNT;
        this.swordPulsesRemaining = SWORD_PULSE_COUNT;
        this.runtime.orbitHitClock = Math.min(0, this.runtime.orbitHitClock);
        const facing = world.player.lastMove;
        world.player.triggerPrimaryAttack?.(this.config.behavior, Math.atan2(facing.y, facing.x));
        world.audio?.play('slash', 0.3);
        continue;
      }
      break;
    }
  }

  private fire(world: WeaponWorld, evolution?: EvolutionConfig, assignedTarget?: Enemy | null): void {
    const level = this.levelData();
    const requestedCount = Math.max(
      1,
      level.count
        + (evolution?.countBonus ?? 0)
        + (world.player.effectiveBonusProjectiles?.() ?? world.player.stats.get('bonusProjectiles'))
        + characterWeaponCountBonus(world.player.character.id, this.config.id),
    );
    const visualCap = this.config.behavior === 'poison' ? 8
      : this.config.behavior === 'poison-bomb' ? 4
      : this.config.behavior === 'summon' ? 12
        : this.config.behavior === 'lightning' ? 16 : 24;
    const count = Math.min(visualCap, requestedCount);
    this.foldedVolleyMultiplier = requestedCount / count;
    const range = level.range * world.player.stats.get('range');
    const speed = level.speed * world.player.stats.get('projectileSpeed');
    const color = elementColors[this.config.element];
    const target = world.autoAim
      ? assignedTarget === undefined
        ? world.nearestEnemy(world.player.x, world.player.y, range)
        : assignedTarget?.active
          ? assignedTarget
          : assignedTarget
            ? world.nearestEnemy(world.player.x, world.player.y, range)
            : null
      : null;
    const aim = target ? normalize(target.x - world.player.x, target.y - world.player.y) : world.player.aim;
    const baseAngle = Math.atan2(aim.y, aim.x);

    // Chỉ vũ khí chính điều khiển tay/tư thế của nhân vật. Ba vũ khí phụ vẫn
    // tự động khai hỏa nhưng không làm animation bị giật liên tục.
    if (this.runtime.slot === 'primary') world.player.triggerPrimaryAttack?.(this.config.behavior, baseAngle);

    // Chỉ một nhánh được phát cho mỗi lần khai hỏa, nên cue nhận diện không
    // chồng thêm tiếng `shoot` chung phía sau.
    if (this.config.behavior === 'slash') world.audio?.play('slash', 0.3);
    else if (this.config.behavior === 'bow') world.audio?.play('bow', 0.26);
    else if (this.config.behavior === 'lightning') world.audio?.play('lightning', 0.3);
    else if (this.config.behavior === 'fireball') world.audio?.play('fire', 0.26);
    else if (this.config.behavior === 'poison-bomb') world.audio?.play('poison-throw', 0.48);
    else if (this.config.behavior === 'poison') world.audio?.play('poison-cloud', 0.22);
    else if (this.config.element === 'arcane') world.audio?.play('arcane', 0.22);
    else world.audio?.play('shoot', this.config.behavior === 'bomb' ? 0.24 : 0.16);

    switch (this.config.behavior) {
      case 'slash': this.fireSwordPulse(world, evolution); break;
      case 'bow': this.fireProjectiles(world, count, baseAngle, speed, range, color, 0.13, level.pierce, level.size, 0, false, evolution, target); break;
      case 'gun': this.fireProjectiles(world, count, baseAngle, speed, range, color, 0.045, level.pierce, level.size, 0, false, evolution, target); break;
      case 'darts': this.fireProjectiles(world, count, baseAngle, speed, range, color, 0.17, level.pierce, level.size, 0, false, evolution, target); break;
      case 'bomb': this.fireBomb(world, target, aim, speed, range, color, count, evolution); break;
      // Sét chuỗi cần một mục tiêu khởi đầu ngay cả khi người chơi
      // tắt tự ngắm. Nếu chỉ dùng `target` ở đây, vũ khí sẽ ngừng
      // hoạt động hoàn toàn trong chế độ ngắm thủ công.
      case 'lightning': this.fireLightning(world, target ?? world.nearestEnemy(world.player.x, world.player.y, range), range, color, count, evolution); break;
      case 'fireball': this.fireFireball(world, count, baseAngle, speed, range, color, evolution); break;
      case 'ice': this.fireIce(world, count, speed, range, color, evolution); break;
      case 'laser': this.fireLaser(world, range, baseAngle, color, count, evolution); break;
      case 'poison': this.firePoison(world, target, aim, range, color, count, evolution); break;
      case 'poison-bomb': this.firePoisonBomb(world, range, speed, color, count, evolution); break;
      case 'orbit': this.fireOrbit(world, range, color, count, evolution); break;
      case 'summon': this.fireSummon(world, range, speed, color, count, evolution); break;
      case 'nova': this.fireNova(world, count, speed, range, color, evolution); break;
    }
  }

  private rollDamage(world: WeaponWorld, evolution?: EvolutionConfig, canCrit = true): { damage: number; critical: boolean } {
    const level = this.levelData();
    const critical = canCrit && world.rng.chance(world.player.stats.get('critChance'));
    let damage = level.damage * weaponBalanceDamageMultiplier(this.config.behavior)
      * world.player.effectiveDamageMultiplier() * (evolution?.damageMultiplier ?? 1)
      * (1 + this.runtime.masteryLevel * 0.08) * (1 + this.runtime.refinementBonus)
      * this.foldedRateMultiplier * this.foldedVolleyMultiplier;
    if (this.config.behavior === 'summon' && world.player.character.passive.kind === 'summon-bonus') {
      damage *= 1 + world.player.character.passive.value;
    }
    if (critical) damage *= world.player.effectiveCritDamage();
    return { damage, critical };
  }

  private fireSwordPulse(world: WeaponWorld, evolution?: EvolutionConfig, pulseIndex = 0): void {
    const level = this.levelData();
    const requestedCount = Math.max(
      1,
      level.count
        + (evolution?.countBonus ?? 0)
        + (world.player.effectiveBonusProjectiles?.() ?? world.player.stats.get('bonusProjectiles')),
    );
    const visibleBlades = Math.min(SWORD_MAX_VISIBLE_LAYERS, evolution?.effect === 'phantom' ? Math.max(3, requestedCount) : requestedCount);
    this.foldedVolleyMultiplier = requestedCount / visibleBlades;
    const baseRange = level.range * world.player.stats.get('range') * (evolution?.effect === 'phantom' ? 1.85 : 1);
    const outerRange = swordLayerRadius(baseRange, visibleBlades - 1);
    const candidates = world.enemySpatial.queryCircle(world.player.x, world.player.y, outerRange + 35);
    for (const enemy of candidates) {
      if (!enemy.active) continue;
      const enemyDistance = distance(world.player.x, world.player.y, enemy.x, enemy.y);
      let layersInReach = 0;
      for (let layer = 0; layer < visibleBlades; layer += 1) {
        if (enemyDistance <= swordLayerRadius(baseRange, layer) + enemy.radius) layersInReach += 1;
      }
      if (layersInReach === 0) continue;
      const hit = this.rollDamage(world, evolution);
      world.damageEnemy(enemy, hit.damage * SWORD_PULSE_DAMAGE_SHARE * layersInReach, this.config.element, this.config.id,
        this.statusChance(level.statusChance), level.knockback * SWORD_PULSE_KNOCKBACK_SHARE,
        hit.critical, world.player.x, world.player.y, this.config.signature);
      playDirectSignatureHit(world, this.config.signature);
    }
    for (let layer = 0; layer < visibleBlades; layer += 1) {
      const radius = swordLayerRadius(baseRange, layer);
      const direction = layer % 2 === 0 ? 1 : -1;
      const angle = this.runtime.summonAngle * direction + layer * 0.73 + pulseIndex * TAU / SWORD_PULSE_COUNT;
      const x = world.player.x + Math.cos(angle) * radius;
      const y = world.player.y + Math.sin(angle) * radius;
      const tangentX = -Math.sin(angle) * direction;
      const tangentY = Math.cos(angle) * direction;
      const halfBlade = 17 + Math.min(9, layer * 1.5);
      world.particles.line(
        x - tangentX * halfBlade,
        y - tangentY * halfBlade,
        x + tangentX * halfBlade,
        y + tangentY * halfBlade,
        elementColors[this.config.element],
        6,
        this.swordPulseInterval * 0.9,
      );
      world.particles.ring(world.player.x, world.player.y, elementColors[this.config.element], radius, this.swordPulseInterval * 0.55);
    }
    world.screenShake(0.8);
  }

  private fireProjectiles(
    world: WeaponWorld,
    count: number,
    baseAngle: number,
    speed: number,
    range: number,
    color: string,
    spread: number,
    pierce: number,
    size: number,
    homing: number,
    explosive: boolean,
    evolution?: EvolutionConfig,
    preferredTarget?: Enemy | null,
  ): void {
    const nearbyTargets = [...new Map(
      (world.autoAim ? world.enemySpatial.queryCircle(world.player.x, world.player.y, range) : [])
        .filter((enemy) => enemy.active)
        .map((enemy) => [enemy.id, enemy] as const),
    ).values()].sort((left, right) =>
      distanceSquared(world.player.x, world.player.y, left.x, left.y)
      - distanceSquared(world.player.x, world.player.y, right.x, right.y)
      || left.id - right.id);
    // Giữ mục tiêu đã được bộ phân phối liên-vũ-khí giao cho tia đầu, sau đó
    // dùng từng kẻ địch gần nhất còn lại. Chỉ lặp lại khi số tia vượt số địch.
    const distinctTargets = preferredTarget?.active
      ? [preferredTarget, ...nearbyTargets.filter((enemy) => enemy.id !== preferredTarget.id)]
      : nearbyTargets;
    for (let index = 0; index < count; index += 1) {
      const target = distinctTargets.length > 0 ? distinctTargets[index % distinctTargets.length] : null;
      const angle = target
        ? Math.atan2(target.y - world.player.y, target.x - world.player.x)
        : baseAngle + volleyAngleOffset(index, count, spread);
      const hit = this.rollDamage(world, evolution);
      const splitArrow = evolution?.effect === 'split';
      const barrage = evolution?.effect === 'barrage';
      const phaseEcho = evolution?.effect === 'phase-echo';
      const evolvedPierce = splitArrow ? Math.max(24, pierce)
        : pierce + (phaseEcho ? 4 : barrage ? 2 : 0);
      const evolvedHoming = splitArrow && hit.critical ? 2.1
        : phaseEcho ? 1.25
          : barrage ? 0.42 : homing;
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x + Math.cos(angle) * 22,
        y: world.player.y + Math.sin(angle) * 22,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: hit.damage * (splitArrow && hit.critical ? 1.15 : 1),
        radius: Math.max(3, size * (barrage ? 0.6 : 0.52)),
        life: Math.max(0.35, range / Math.max(1, speed)),
        pierce: explosive ? Math.max(1, evolvedPierce) : evolvedPierce,
        maxRange: range,
        homing: evolvedHoming,
        explosiveRadius: explosive ? size * 2.3 : 0,
        statusChance: this.statusChance(this.levelData().statusChance),
        knockback: this.levelData().knockback,
        critical: hit.critical,
        color,
        hitEffect: this.config.signature,
      });
    }
    world.particles.burst(world.player.x + Math.cos(baseAngle) * 22, world.player.y + Math.sin(baseAngle) * 22, color, 4, 75, 2);
  }

  private fireBomb(
    world: WeaponWorld,
    target: Enemy | null,
    aim: { x: number; y: number },
    speed: number,
    range: number,
    color: string,
    count: number,
    evolution?: EvolutionConfig,
  ): void {
    const level = this.levelData();
    for (let index = 0; index < count; index += 1) {
      const angle = Math.atan2(aim.y, aim.x) + volleyAngleOffset(index, count, 0.22);
      const targetDistance = target ? Math.min(range, distance(world.player.x, world.player.y, target.x, target.y)) : range * 0.7;
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x,
        y: world.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: hit.damage,
        radius: level.size * 0.22,
        life: Math.max(0.3, targetDistance / Math.max(1, speed)),
        pierce: 999,
        maxRange: targetDistance,
        explosiveRadius: level.size * (evolution?.effect === 'gravity' ? 2.15 : 1.45),
        statusChance: this.statusChance(level.statusChance),
        knockback: level.knockback,
        critical: hit.critical,
        color,
        pullStrength: evolution?.effect === 'gravity' ? 260 : 90,
        hitEffect: this.config.signature,
      });
    }
    world.screenShake(1.2);
  }

  private fireLightning(world: WeaponWorld, target: Enemy | null, range: number, color: string, count: number, evolution?: EvolutionConfig): void {
    if (!target) return;
    const visited = new Set<number>();
    let current: Enemy | null = target;
    let fromX = world.player.x;
    let fromY = world.player.y;
    const maxChain = count + (evolution?.effect === 'storm' ? 3 : 0);
    for (let chain = 0; chain < maxChain && current; chain += 1) {
      visited.add(current.id);
      const hit = this.rollDamage(world, evolution);
      world.damageEnemy(current, hit.damage * Math.max(0.55, 1 - chain * 0.055), this.config.element, this.config.id, this.statusChance(this.levelData().statusChance), this.levelData().knockback, hit.critical, fromX, fromY, this.config.signature);
      playDirectSignatureHit(world, this.config.signature);
      world.particles.line(fromX, fromY, current.x, current.y, color, evolution ? 6 : 4, 0.16);
      fromX = current.x;
      fromY = current.y;
      current = world.nearestEnemy(fromX, fromY, Math.min(range, 230), visited);
    }
    world.screenShake(evolution ? 3.3 : 1.6);
  }

  private fireFireball(world: WeaponWorld, count: number, baseAngle: number, speed: number, range: number, color: string, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + volleyAngleOffset(index, count, 0.18);
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x,
        y: world.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: hit.damage,
        radius: level.size * (evolution?.effect === 'meteor' ? 0.9 : 0.45),
        life: range / Math.max(1, speed),
        pierce: 0,
        maxRange: range,
        explosiveRadius: level.size * (evolution?.effect === 'meteor' ? 3.4 : 1.8),
        statusChance: this.statusChance(1),
        knockback: level.knockback,
        critical: hit.critical,
        color,
        hitEffect: this.config.signature,
      });
    }
    world.screenShake(evolution ? 3.5 : 1.2);
  }

  private fireIce(world: WeaponWorld, count: number, speed: number, range: number, color: string, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    const total = count + (evolution?.effect === 'cathedral' ? 4 : 0);
    for (let index = 0; index < total; index += 1) {
      const angle = index / total * TAU + this.runtime.summonAngle;
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x,
        y: world.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: hit.damage,
        radius: level.size * 0.52,
        life: range / Math.max(1, speed),
        pierce: level.pierce + (evolution ? 2 : 0),
        maxRange: range,
        statusChance: this.statusChance(evolution ? 1 : level.statusChance),
        knockback: level.knockback,
        critical: hit.critical,
        color,
        hitEffect: this.config.signature,
      });
    }
    world.particles.ring(world.player.x, world.player.y, color, 65, 0.32);
  }

  private fireLaser(world: WeaponWorld, range: number, baseAngle: number, color: string, count: number, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    const prismatic = evolution?.effect === 'prism';
    const beams = Math.max(1, Math.min(prismatic ? 7 : 3, count));
    // Tia đạn cộng dồn vẫn có giá trị sau giới hạn số tia hiển thị. Phần vượt
    // giới hạn được gộp vào sát thương để không tạo hàng trăm đường vẽ mỗi nhịp.
    const foldedBeamMultiplier = count / beams;
    for (let beam = 0; beam < beams; beam += 1) {
      const angle = baseAngle + volleyAngleOffset(beam, beams, prismatic ? 0.18 : 0.22);
      const endX = world.player.x + Math.cos(angle) * range;
      const endY = world.player.y + Math.sin(angle) * range;
      const candidates = world.enemySpatial.queryCircle(world.player.x + Math.cos(angle) * range * 0.5, world.player.y + Math.sin(angle) * range * 0.5, range * 0.65);
      for (const enemy of candidates) {
        if (!enemy.active) continue;
        if (pointToSegmentDistanceSquared(enemy.x, enemy.y, world.player.x, world.player.y, endX, endY) > (enemy.radius + level.size * 0.48) ** 2) continue;
        const hit = this.rollDamage(world, evolution);
        world.damageEnemy(enemy, hit.damage * foldedBeamMultiplier, this.config.element, this.config.id, this.statusChance(level.statusChance), level.knockback, hit.critical, world.player.x, world.player.y, this.config.signature);
        playDirectSignatureHit(world, this.config.signature);
      }
      world.particles.line(world.player.x, world.player.y, endX, endY, color, level.size * 0.6, 0.24);
    }
    world.screenShake(1.2);
  }

  private firePoison(world: WeaponWorld, target: Enemy | null, aim: { x: number; y: number }, range: number, color: string, count: number, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    for (let index = 0; index < count; index += 1) {
      const angle = Math.atan2(aim.y, aim.x) + (index - (count - 1) / 2) * 0.5;
      const spread = 80 + index * 22;
      const x = target ? target.x + Math.cos(angle + 1.7) * spread : world.player.x + Math.cos(angle) * range * 0.55;
      const y = target ? target.y + Math.sin(angle + 1.7) * spread : world.player.y + Math.sin(angle) * range * 0.55;
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x,
        y,
        vx: 0,
        vy: 0,
        damage: hit.damage * 0.46,
        radius: level.size * (evolution?.effect === 'garden' ? 1.45 : 1),
        life: level.duration * (evolution ? 1.5 : 1),
        pierce: 9999,
        maxRange: 1,
        statusChance: this.statusChance(1),
        knockback: 0,
        critical: hit.critical,
        color,
        trail: false,
        persistent: true,
        tickRate: evolution ? 0.32 : 0.52,
        hitEffect: this.config.signature,
      });
    }
  }

  private firePoisonBomb(
    world: WeaponWorld,
    range: number,
    speed: number,
    color: string,
    count: number,
    evolution?: EvolutionConfig,
  ): void {
    const level = this.levelData();
    const cluster = this.densestClusterTarget(world, range, level.size * 1.15);
    const fallbackAim = normalize(world.player.aim.x, world.player.aim.y);
    const targetDirection = cluster
      ? normalize(cluster.x - world.player.x, cluster.y - world.player.y)
      : fallbackAim.x === 0 && fallbackAim.y === 0 ? { x: 1, y: 0 } : fallbackAim;
    const clusterDistance = cluster
      ? distance(world.player.x, world.player.y, cluster.x, cluster.y)
      : range * 0.62;
    const throwDistance = Math.min(range, Math.max(96, clusterDistance));
    const baseAngle = Math.atan2(targetDirection.y, targetDirection.x);

    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + volleyAngleOffset(index, count, 0.22);
      // Vùng độc gây đúng 90% sát thương hiện tại mỗi nhịp. Không roll chí
      // mạng một lần cho cả vùng vì điều đó tạo ra crit ẩn kéo dài 3–5 giây.
      const hit = this.rollDamage(world, evolution, false);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x + Math.cos(angle) * 18,
        y: world.player.y + Math.sin(angle) * 18,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: 0,
        radius: Math.max(6, level.size * 0.12),
        life: Math.max(0.24, throwDistance / Math.max(1, speed)),
        pierce: 9999,
        maxRange: throwDistance,
        statusChance: 0,
        knockback: 0,
        critical: false,
        color,
        deployAreaDuration: Math.min(5, level.duration),
        deployAreaRadius: level.size * (evolution?.effect === 'miasma' ? 1.25 : 1),
        deployAreaTickRate: 1,
        deployAreaDamage: hit.damage,
        deployAreaHitEffect: this.config.signature,
      });
    }
    world.particles.burst(world.player.x, world.player.y, color, 7, 95, 3);
  }

  private densestClusterTarget(world: WeaponWorld, range: number, clusterRadius: number): Enemy | null {
    const candidates = [...world.enemySpatial.queryCircle(world.player.x, world.player.y, range)]
      .filter((enemy) => enemy.active && distanceSquared(world.player.x, world.player.y, enemy.x, enemy.y) <= range * range);
    let best: Enemy | null = null;
    let bestCount = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      let nearbyCount = 0;
      for (const neighbor of candidates) {
        if (distanceSquared(candidate.x, candidate.y, neighbor.x, neighbor.y) <= clusterRadius * clusterRadius) nearbyCount += 1;
      }
      const playerDistance = distanceSquared(world.player.x, world.player.y, candidate.x, candidate.y);
      if (nearbyCount > bestCount
        || (nearbyCount === bestCount && playerDistance < bestDistance)
        || (nearbyCount === bestCount && playerDistance === bestDistance && candidate.id < (best?.id ?? Number.POSITIVE_INFINITY))) {
        best = candidate;
        bestCount = nearbyCount;
        bestDistance = playerDistance;
      }
    }
    return best;
  }

  private fireOrbit(world: WeaponWorld, range: number, color: string, count: number, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    const citadel = evolution?.effect === 'citadel';
    const sniperRange = Math.max(ORBIT_GUARDIAN_RAY_RANGE, range * 4.5);
    const raySpeed = ORBIT_GUARDIAN_RAY_SPEED * world.player.stats.get('projectileSpeed');
    for (let index = 0; index < count; index += 1) {
      const angle = this.runtime.summonAngle + index / count * TAU;
      const orbitRange = citadel
        ? Math.min(190, range) * (index % 2 === 0 ? 0.72 : 1.12)
        : Math.min(190, range);
      const x = world.player.x + Math.cos(angle) * orbitRange;
      const y = world.player.y + Math.sin(angle) * orbitRange;
      const nearby = world.enemySpatial.queryCircle(x, y, level.size + 22);
      for (const enemy of nearby) {
        if (!enemy.active || distanceSquared(x, y, enemy.x, enemy.y) > (level.size + enemy.radius) ** 2) continue;
        const hit = this.rollDamage(world, evolution);
        world.damageEnemy(enemy, hit.damage, this.config.element, this.config.id, this.statusChance(level.statusChance), level.knockback, hit.critical, x, y, this.config.signature);
        playDirectSignatureHit(world, this.config.signature);
      }
      const target = world.nearestEnemy(x, y, sniperRange);
      if (target) {
        const direction = normalize(target.x - x, target.y - y);
        const hit = this.rollDamage(world, evolution);
        world.projectiles.spawn({
          sourceWeaponId: this.config.id,
          element: this.config.element,
          x,
          y,
          vx: direction.x * raySpeed,
          vy: direction.y * raySpeed,
          damage: hit.damage * ORBIT_GUARDIAN_RAY_DAMAGE_SHARE,
          radius: Math.max(3, level.size * 0.22),
          life: sniperRange / Math.max(1, raySpeed),
          pierce: 0,
          maxRange: sniperRange,
          homing: citadel ? 1.15 : 0.55,
          statusChance: this.statusChance(level.statusChance),
          knockback: level.knockback * 0.3,
          critical: hit.critical,
          color,
          hitEffect: this.config.signature,
        });
        world.particles.line(x, y, x + direction.x * 34, y + direction.y * 34, '#9ef6ff', 3, 0.11);
      }
      world.particles.spawn('spark', x, y, color, 3, 0.25);
    }
  }

  private fireSummon(world: WeaponWorld, range: number, speed: number, color: string, count: number, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    const actual = Math.max(1, count);
    for (let index = 0; index < actual; index += 1) {
      const layer = Math.floor(index / SUMMONS_PER_ORBIT_LAYER);
      const indexInLayer = index % SUMMONS_PER_ORBIT_LAYER;
      const membersInLayer = Math.min(SUMMONS_PER_ORBIT_LAYER, actual - layer * SUMMONS_PER_ORBIT_LAYER);
      const orbitAngle = this.runtime.summonAngle * (1 + layer * 0.08)
        + indexInLayer / membersInLayer * TAU + layer * 0.34;
      const orbitRadius = 68 + layer * 30;
      const sx = world.player.x + Math.cos(orbitAngle) * orbitRadius;
      const sy = world.player.y + Math.sin(orbitAngle) * orbitRadius;
      const target = world.nearestEnemy(sx, sy, range);
      if (!target) continue;
      const direction = normalize(target.x - sx, target.y - sy);
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: sx,
        y: sy,
        vx: direction.x * speed,
        vy: direction.y * speed,
        damage: hit.damage,
        radius: level.size * 0.52,
        life: range / Math.max(1, speed),
        pierce: level.pierce,
        maxRange: range,
        homing: evolution?.effect === 'legion' ? 2.2 : 0.8,
        statusChance: this.statusChance(level.statusChance),
        knockback: level.knockback,
        critical: hit.critical,
        color,
        hitEffect: this.config.signature,
      });
      const formationOffset = (indexInLayer - (membersInLayer - 1) / 2) * 0.035;
      for (let rayIndex = 0; rayIndex < SUMMON_AUXILIARY_RAY_COUNT; rayIndex += 1) {
        const rayOffset = (rayIndex - (SUMMON_AUXILIARY_RAY_COUNT - 1) / 2) * 0.12;
        const rayAngle = Math.atan2(direction.y, direction.x) + formationOffset + rayOffset;
        world.projectiles.spawn({
          sourceWeaponId: this.config.id,
          element: this.config.element,
          x: sx,
          y: sy,
          vx: Math.cos(rayAngle) * speed * 1.24,
          vy: Math.sin(rayAngle) * speed * 1.24,
          damage: hit.damage * SUMMON_AUXILIARY_RAY_DAMAGE_SHARE,
          radius: Math.max(2, level.size * 0.26),
          life: range / Math.max(1, speed * 1.24),
          pierce: 0,
          maxRange: range,
          homing: evolution?.effect === 'legion' ? 2.7 : 1.3,
          statusChance: this.statusChance(level.statusChance),
          knockback: level.knockback * 0.3,
          critical: hit.critical,
          color,
          hitEffect: this.config.signature,
        });
        world.particles.line(sx, sy, sx + Math.cos(rayAngle) * 31, sy + Math.sin(rayAngle) * 31, color, 2, 0.13);
      }
    }
  }

  private fireNova(world: WeaponWorld, count: number, speed: number, range: number, color: string, evolution?: EvolutionConfig): void {
    const level = this.levelData();
    const supernova = evolution?.effect === 'supernova';
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * TAU + this.runtime.summonAngle;
      const hit = this.rollDamage(world, evolution);
      world.projectiles.spawn({
        sourceWeaponId: this.config.id,
        element: this.config.element,
        x: world.player.x,
        y: world.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: hit.damage,
        radius: level.size * 0.6,
        life: range / Math.max(1, speed),
        pierce: level.pierce,
        maxRange: range,
        homing: 0,
        explosiveRadius: supernova ? level.size * 2.6 : 0,
        statusChance: this.statusChance(level.statusChance),
        knockback: level.knockback,
        critical: hit.critical,
        color,
        hitEffect: this.config.signature,
      });
    }
    world.particles.ring(world.player.x, world.player.y, color, 90, 0.3);
  }

  private statusChance(base: number): number {
    // Rage chuẩn đã được áp một lần trong Player (x3 tốc đánh, x0,9 sát
    // thương và bonus riêng). Không đọc các `kind` legacy ở đây để dữ liệu
    // nhân vật tương lai không vô tình nhân đôi sức mạnh.
    return Math.min(1, base);
  }

  public usesDirectionalTargeting(): boolean {
    return DIRECTIONAL_BEHAVIORS.has(this.config.behavior);
  }

  public targetingRange(world: WeaponWorld): number {
    const evolution = this.runtime.evolutionId ? this.data.evolutionById.get(this.runtime.evolutionId) : undefined;
    const phantomMultiplier = this.config.behavior === 'slash' && evolution?.effect === 'phantom' ? 1.85 : 1;
    return this.levelData().range * world.player.stats.get('range') * phantomMultiplier;
  }
}

export class WeaponSystem {
  public static readonly MAX_AUXILIARY_WEAPONS = 3;

  private readonly data: GameData;
  private readonly weapons: DataDrivenWeapon[] = [];

  public constructor(data: GameData) {
    this.data = data;
  }

  public addWeapon(id: string, requestedSlot?: WeaponSlot): boolean {
    if (this.weapons.some((weapon) => weapon.config.id === id)) return false;
    const config = this.data.weaponById.get(id);
    if (!config) return false;
    const slot = requestedSlot ?? (this.primaryEntry() ? 'auxiliary' : 'primary');
    if (slot === 'primary' && this.primaryEntry()) return false;
    if (slot === 'auxiliary' && !this.canAddAuxiliary()) return false;
    this.weapons.push(new DataDrivenWeapon(config, this.data, slot));
    return true;
  }

  public equipPrimaryWeapon(id: string): boolean {
    return this.addWeapon(id, 'primary');
  }

  public addAuxiliaryWeapon(id: string): boolean {
    return this.addWeapon(id, 'auxiliary');
  }

  public levelWeapon(id: string): boolean {
    return this.weapons.find((weapon) => weapon.config.id === id)?.levelUp() ?? false;
  }

  public masterWeapon(id: string): boolean {
    const weapon = this.weapons.find((item) => item.config.id === id);
    if (!weapon || weapon.runtime.level < weapon.config.maxLevel) return false;
    weapon.addMastery();
    return true;
  }

  public refineWeapon(id: string, bonus: number): boolean {
    const weapon = this.weapons.find((item) => item.config.id === id);
    if (!weapon || !Number.isFinite(bonus) || bonus <= 0) return false;
    weapon.runtime.refinementBonus += bonus;
    return true;
  }

  public evolve(id: string, evolutionId: string): boolean {
    const weapon = this.weapons.find((item) => item.config.id === id);
    const evolution = this.data.evolutionById.get(evolutionId);
    if (!weapon || !evolution || weapon.runtime.evolutionId) return false;
    weapon.evolve(evolution);
    return true;
  }

  public update(dt: number, world: WeaponWorld): void {
    const assignments = this.planDirectionalTargets(world);
    for (const weapon of this.weapons) weapon.update(dt, world, assignments.get(weapon));
  }

  private planDirectionalTargets(world: WeaponWorld): Map<DataDrivenWeapon, Enemy | null> {
    const assignments = new Map<DataDrivenWeapon, Enemy | null>();
    if (!world.autoAim) return assignments;
    const directional = this.weapons.filter((weapon) => weapon.usesDirectionalTargeting());
    // Một vũ khí phải giữ đúng hành vi cũ: luôn chọn mục tiêu gần nhất, không
    // đổi sang ưu tiên góc chỉ vì bộ phân phối tồn tại.
    if (directional.length < 2) return assignments;

    const aim = normalize(world.player.aim.x, world.player.aim.y);
    const baseAngle = aim.x === 0 && aim.y === 0 ? 0 : Math.atan2(aim.y, aim.x);
    const plans: WeaponTargetPlan[] = directional.map((weapon, slotIndex) => {
      const range = Math.max(0, weapon.targetingRange(world));
      const rangeSquared = range * range;
      const unique = new Map<number, Enemy>();
      for (const enemy of world.enemySpatial.queryCircle(world.player.x, world.player.y, range)) {
        if (!enemy.active || distanceSquared(world.player.x, world.player.y, enemy.x, enemy.y) > rangeSquared) continue;
        unique.set(enemy.id, enemy);
      }
      return {
        weapon,
        slotIndex,
        slotAngle: baseAngle + slotIndex / directional.length * TAU,
        candidates: [...unique.values()],
      };
    });

    // Vũ khí có ít lựa chọn được xếp trước để vũ khí tầm xa không chiếm mất
    // mục tiêu duy nhất trong tầm của một vũ khí tầm ngắn.
    plans.sort((left, right) => left.candidates.length - right.candidates.length || left.slotIndex - right.slotIndex);
    const claimed = new Set<number>();
    for (const plan of plans) {
      const sorted = [...plan.candidates].sort((left, right) => {
        const leftClaimed = claimed.has(left.id) ? 1 : 0;
        const rightClaimed = claimed.has(right.id) ? 1 : 0;
        if (leftClaimed !== rightClaimed) return leftClaimed - rightClaimed;
        const leftAngle = Math.atan2(left.y - world.player.y, left.x - world.player.x);
        const rightAngle = Math.atan2(right.y - world.player.y, right.x - world.player.x);
        const angularDifference = Math.abs(angleDelta(plan.slotAngle, leftAngle))
          - Math.abs(angleDelta(plan.slotAngle, rightAngle));
        if (Math.abs(angularDifference) > 1e-9) return angularDifference;
        const distanceDifference = distanceSquared(world.player.x, world.player.y, left.x, left.y)
          - distanceSquared(world.player.x, world.player.y, right.x, right.y);
        if (distanceDifference !== 0) return distanceDifference;
        return left.id - right.id;
      });
      const target = sorted[0] ?? null;
      assignments.set(plan.weapon, target);
      if (target) claimed.add(target.id);
    }
    return assignments;
  }

  public has(id: string): boolean {
    return this.weapons.some((weapon) => weapon.config.id === id);
  }

  public levelOf(id: string): number {
    return this.weapons.find((weapon) => weapon.config.id === id)?.runtime.level ?? 0;
  }

  public evolutionOf(id: string): string | null {
    return this.weapons.find((weapon) => weapon.config.id === id)?.runtime.evolutionId ?? null;
  }

  public evolutionConfigOf(id: string): EvolutionConfig | null {
    const evolutionId = this.evolutionOf(id);
    return evolutionId ? this.data.evolutionById.get(evolutionId) ?? null : null;
  }

  public recordDamage(id: string, amount: number): void {
    const weapon = this.weapons.find((item) => item.config.id === id);
    if (weapon) weapon.runtime.damageDealt += amount;
  }

  public runtimes(): readonly WeaponRuntime[] {
    return this.weapons.map((weapon) => weapon.runtime);
  }

  public entries(): ReadonlyArray<{ config: WeaponConfig; runtime: WeaponRuntime }> {
    return this.weapons.map((weapon) => ({ config: weapon.config, runtime: weapon.runtime }));
  }

  public primaryEntry(): { config: WeaponConfig; runtime: WeaponRuntime } | null {
    const weapon = this.weapons.find((item) => item.runtime.slot === 'primary');
    return weapon ? { config: weapon.config, runtime: weapon.runtime } : null;
  }

  public auxiliaryEntries(): ReadonlyArray<{ config: WeaponConfig; runtime: WeaponRuntime }> {
    return this.weapons
      .filter((weapon) => weapon.runtime.slot === 'auxiliary')
      .map((weapon) => ({ config: weapon.config, runtime: weapon.runtime }));
  }

  public auxiliaryCount(): number {
    return this.weapons.reduce((count, weapon) => count + Number(weapon.runtime.slot === 'auxiliary'), 0);
  }

  public canAddAuxiliary(): boolean {
    return this.auxiliaryCount() < WeaponSystem.MAX_AUXILIARY_WEAPONS;
  }

  public isPrimary(id: string): boolean {
    return this.weapons.some((weapon) => weapon.config.id === id && weapon.runtime.slot === 'primary');
  }

  public clear(): void {
    this.weapons.length = 0;
  }
}
