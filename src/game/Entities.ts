import type {
  BossTelegraph,
  ElementType,
  EnemyConfig,
  PickupType,
  ProjectileFaction,
  StatusState,
  WeaponSignatureConfig,
} from '../core/Types.js';
import type { Poolable } from '../core/ObjectPool.js';

let nextEntityId = 1;

export class Enemy implements Poolable {
  public id = nextEntityId++;
  public active = false;
  public config!: EnemyConfig;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public health = 1;
  public maxHealth = 1;
  public damage = 1;
  public armor = 0;
  public speed = 1;
  public radius = 12;
  public exp = 1;
  public gold = 0;
  public attackTimer = 0;
  public abilityTimer = 0;
  public stateTimer = 0;
  public contactTimer = 0;
  public flashTimer = 0;
  public facing = 0;
  public phase = 1;
  public shield = 0;
  public isBoss = false;
  public isElite = false;
  public isFinalEncounter = false;
  public chargeX = 0;
  public chargeY = 0;
  public alpha = 1;
  public spawnPortalTime = 0;
  public spawnPortalDuration = 0;
  public lastHitWeapon = '';
  public knockbackX = 0;
  public knockbackY = 0;
  public status: StatusState = {
    bleedTime: 0, bleedDps: 0, bleedTick: 1, bleedSourceWeapon: '', burnTime: 0, burnDps: 0,
    poisonTime: 0, poisonDps: 0, poisonCloudTime: 0, poisonCloudDps: 0,
    poisonCloudPercent: 0, poisonCloudTick: 1, poisonCloudSourceWeapon: '', slowTime: 0,
    slowFactor: 1, stunTime: 0, shockTime: 0, paralysisTime: 0, blindTime: 0,
    blindCooldown: 0, burnTick: 0, burnPercent: 0, healingReduction: 0,
  };

  public reset(): void {
    this.vx = 0;
    this.vy = 0;
    this.health = 0;
    this.maxHealth = 1;
    this.armor = 0;
    this.attackTimer = 0;
    this.abilityTimer = 0;
    this.stateTimer = 0;
    this.contactTimer = 0;
    this.flashTimer = 0;
    this.phase = 1;
    this.shield = 0;
    this.isBoss = false;
    this.isElite = false;
    this.isFinalEncounter = false;
    this.chargeX = 0;
    this.chargeY = 0;
    this.alpha = 1;
    this.spawnPortalTime = 0;
    this.spawnPortalDuration = 0;
    this.lastHitWeapon = '';
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.status.bleedTime = 0;
    this.status.bleedDps = 0;
    this.status.bleedTick = 1;
    this.status.bleedSourceWeapon = '';
    this.status.burnTime = 0;
    this.status.burnDps = 0;
    this.status.poisonTime = 0;
    this.status.poisonDps = 0;
    this.status.poisonCloudTime = 0;
    this.status.poisonCloudDps = 0;
    this.status.poisonCloudPercent = 0;
    this.status.poisonCloudTick = 1;
    this.status.poisonCloudSourceWeapon = '';
    this.status.slowTime = 0;
    this.status.slowFactor = 1;
    this.status.stunTime = 0;
    this.status.shockTime = 0;
    this.status.paralysisTime = 0;
    this.status.blindTime = 0;
    this.status.blindCooldown = 0;
    this.status.burnTick = 0;
    this.status.burnPercent = 0;
    this.status.healingReduction = 0;
  }
}

export class Projectile implements Poolable {
  public id = nextEntityId++;
  public active = false;
  public faction: ProjectileFaction = 'player';
  public sourceWeaponId = '';
  public element: ElementType = 'physical';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public damage = 0;
  public radius = 5;
  public life = 0;
  public maxLife = 0;
  public pierce = 0;
  public maxRange = 1000;
  public travelled = 0;
  public homing = 0;
  public explosiveRadius = 0;
  public statusChance = 0;
  public knockback = 0;
  public critical = false;
  public color = '#ffffff';
  public trail = true;
  public pullStrength = 0;
  public persistent = false;
  public tickRate = 0.45;
  public tickTimer = 0;
  public targetId = -1;
  public canHitPlayer = true;
  public hitEffect: WeaponSignatureConfig | null = null;
  public deployAreaDuration = 0;
  public deployAreaRadius = 0;
  public deployAreaTickRate = 1;
  public deployAreaDamage = 0;
  public deployAreaHitEffect: WeaponSignatureConfig | null = null;
  public readonly hitIds = new Set<number>();

  public reset(): void {
    this.sourceWeaponId = '';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.damage = 0;
    this.radius = 5;
    this.life = 0;
    this.maxLife = 0;
    this.pierce = 0;
    this.maxRange = 1000;
    this.travelled = 0;
    this.homing = 0;
    this.explosiveRadius = 0;
    this.statusChance = 0;
    this.knockback = 0;
    this.critical = false;
    this.color = '#ffffff';
    this.trail = true;
    this.pullStrength = 0;
    this.persistent = false;
    this.tickRate = 0.45;
    this.tickTimer = 0;
    this.targetId = -1;
    this.canHitPlayer = true;
    this.hitEffect = null;
    this.deployAreaDuration = 0;
    this.deployAreaRadius = 0;
    this.deployAreaTickRate = 1;
    this.deployAreaDamage = 0;
    this.deployAreaHitEffect = null;
    this.hitIds.clear();
  }
}

export class Pickup implements Poolable {
  public id = nextEntityId++;
  public active = false;
  public type: PickupType = 'exp';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public radius = 8;
  public value = 1;
  public age = 0;
  public magnetized = false;
  public color = '#69d8e2';
  public statId = '';

  public reset(): void {
    this.type = 'exp';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 8;
    this.value = 1;
    this.age = 0;
    this.magnetized = false;
    this.color = '#69d8e2';
    this.statId = '';
  }
}

export type ParticleKind = 'spark' | 'ring' | 'line' | 'smoke' | 'trail' | 'burst' | 'slash';

export class Particle implements Poolable {
  public id = nextEntityId++;
  public active = false;
  public kind: ParticleKind = 'spark';
  public x = 0;
  public y = 0;
  public x2 = 0;
  public y2 = 0;
  public vx = 0;
  public vy = 0;
  public life = 0;
  public maxLife = 0;
  public size = 2;
  public color = '#ffffff';
  public alpha = 1;
  public rotation = 0;

  public reset(): void {
    this.kind = 'spark';
    this.x = 0;
    this.y = 0;
    this.x2 = 0;
    this.y2 = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 0;
    this.size = 2;
    this.color = '#ffffff';
    this.alpha = 1;
    this.rotation = 0;
  }
}

export type FloatingTextKind = ElementType | 'bleed' | 'incoming' | 'dodge' | 'healing' | 'neutral';

export class FloatingText implements Poolable {
  public id = nextEntityId++;
  public active = false;
  public x = 0;
  public y = 0;
  public value = '';
  public life = 0;
  public maxLife = 0;
  public color = '#ffffff';
  public size = 14;
  public critical = false;
  public kind: FloatingTextKind = 'neutral';
  public horizontalOffset = 0;

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.value = '';
    this.life = 0;
    this.maxLife = 0;
    this.color = '#ffffff';
    this.size = 14;
    this.critical = false;
    this.kind = 'neutral';
    this.horizontalOffset = 0;
  }
}

export class Telegraph implements Poolable, BossTelegraph {
  public id = nextEntityId++;
  public active = false;
  public x = 0;
  public y = 0;
  public radius = 80;
  public time = 0;
  public maxTime = 1;
  public damage = 10;
  public kind: 'circle' | 'ring' = 'circle';
  public bossId = '';

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.radius = 80;
    this.time = 0;
    this.maxTime = 1;
    this.damage = 10;
    this.kind = 'circle';
    this.bossId = '';
  }
}
