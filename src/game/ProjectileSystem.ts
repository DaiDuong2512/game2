import { distanceSquared, normalize } from '../core/MathUtils.js';
import { ObjectPool } from '../core/ObjectPool.js';
import type { AudioManager, SoundId } from '../core/AudioManager.js';
import type { RNG } from '../core/RNG.js';
import type { DamageResult, ElementType, ProjectileFaction, WeaponSignatureConfig } from '../core/Types.js';
import type { SpatialHash } from '../core/SpatialHash.js';
import { Enemy, Projectile } from './Entities.js';
import type { ParticleSystem } from './ParticleSystem.js';
import type { Player } from './Player.js';
import type { TerrainSystem } from './TerrainSystem.js';

export interface ProjectileSpec {
  faction?: ProjectileFaction;
  sourceWeaponId: string;
  element: ElementType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  pierce?: number;
  maxRange?: number;
  homing?: number;
  explosiveRadius?: number;
  statusChance?: number;
  knockback?: number;
  critical?: boolean;
  color?: string;
  trail?: boolean;
  pullStrength?: number;
  persistent?: boolean;
  tickRate?: number;
  canHitPlayer?: boolean;
  hitEffect?: WeaponSignatureConfig;
  deployAreaDuration?: number;
  deployAreaRadius?: number;
  deployAreaTickRate?: number;
  deployAreaDamage?: number;
  deployAreaHitEffect?: WeaponSignatureConfig;
}

export interface ProjectileWorld {
  player: Player;
  enemies: readonly Enemy[];
  enemySpatial: SpatialHash<Enemy>;
  rng: RNG;
  particles: ParticleSystem;
  terrain?: Pick<TerrainSystem, 'firstProjectileBlock'>;
  audio?: Pick<AudioManager, 'play'>;
  damageEnemy(
    enemy: Enemy,
    damage: number,
    element: ElementType,
    sourceWeaponId: string,
    statusChance: number,
    knockback: number,
    critical: boolean,
    originX: number,
    originY: number,
    hitEffect?: WeaponSignatureConfig,
  ): DamageResult;
  damagePlayer(rawDamage: number, sourceX: number, sourceY: number): void;
  nearestEnemy(x: number, y: number, range: number, exclude?: ReadonlySet<number>): Enemy | null;
}

/** Dấu âm va chạm của hiệu ứng riêng; poison-cloud có vòng đời cue riêng. */
export function signatureHitSound(effect?: WeaponSignatureConfig | null): SoundId | null {
  switch (effect?.kind) {
    case 'bleed': return 'bleed';
    case 'slow': return 'slow';
    case 'stun': return 'stun';
    default: return null;
  }
}

function playSignatureHit(world: ProjectileWorld, effect?: WeaponSignatureConfig | null): void {
  const cue = signatureHitSound(effect);
  if (cue) world.audio?.play(cue, cue === 'bleed' ? 0.24 : 0.2);
}

export class ProjectileSystem {
  public readonly pool = new ObjectPool(() => new Projectile(), 280, 1800);
  private playerSpeedMultiplier = 1;
  private playerSizeMultiplier = 1;

  private static readonly COLLISION_EPSILON = 0.000001;

  public setPlayerEmpowerment(speedMultiplier: number, sizeMultiplier: number): void {
    this.playerSpeedMultiplier = Math.max(1, Number.isFinite(speedMultiplier) ? speedMultiplier : 1);
    this.playerSizeMultiplier = Math.max(1, Number.isFinite(sizeMultiplier) ? sizeMultiplier : 1);
  }

  public spawn(spec: ProjectileSpec): Projectile | null {
    const projectile = this.pool.acquire();
    if (!projectile) return null;
    projectile.faction = spec.faction ?? 'player';
    const playerProjectile = projectile.faction === 'player';
    const speedMultiplier = playerProjectile ? this.playerSpeedMultiplier : 1;
    const sizeMultiplier = playerProjectile ? this.playerSizeMultiplier : 1;
    projectile.sourceWeaponId = spec.sourceWeaponId;
    projectile.element = spec.element;
    projectile.x = spec.x;
    projectile.y = spec.y;
    projectile.vx = spec.vx * speedMultiplier;
    projectile.vy = spec.vy * speedMultiplier;
    projectile.damage = spec.damage;
    projectile.radius = spec.radius * sizeMultiplier;
    projectile.life = spec.life;
    projectile.maxLife = spec.life;
    projectile.pierce = spec.pierce ?? 0;
    projectile.maxRange = spec.maxRange ?? Math.hypot(projectile.vx, projectile.vy) * spec.life;
    projectile.homing = spec.homing ?? 0;
    projectile.explosiveRadius = (spec.explosiveRadius ?? 0) * sizeMultiplier;
    projectile.statusChance = spec.statusChance ?? 0;
    projectile.knockback = spec.knockback ?? 0;
    projectile.critical = spec.critical ?? false;
    projectile.color = spec.color ?? '#ffffff';
    projectile.trail = spec.trail ?? true;
    projectile.pullStrength = spec.pullStrength ?? 0;
    projectile.persistent = spec.persistent ?? false;
    projectile.tickRate = spec.tickRate ?? 0.45;
    projectile.tickTimer = 0;
    projectile.canHitPlayer = spec.canHitPlayer ?? true;
    projectile.hitEffect = spec.hitEffect ? { ...spec.hitEffect } : null;
    projectile.deployAreaDuration = spec.deployAreaDuration ?? 0;
    projectile.deployAreaRadius = (spec.deployAreaRadius ?? 0) * sizeMultiplier;
    projectile.deployAreaTickRate = spec.deployAreaTickRate ?? 1;
    projectile.deployAreaDamage = spec.deployAreaDamage ?? 0;
    projectile.deployAreaHitEffect = spec.deployAreaHitEffect ? { ...spec.deployAreaHitEffect } : null;
    return projectile;
  }

  public update(dt: number, world: ProjectileWorld): void {
    const frameDt = Math.max(0, dt);
    this.pool.forEachActive((projectile) => {
      if (projectile.life <= 0 || this.hasReachedMaxRange(projectile)) {
        this.expire(projectile, world);
        return;
      }

      const speed = Math.hypot(projectile.vx, projectile.vy);
      let movementDt = Math.min(frameDt, projectile.life);
      if (speed > ProjectileSystem.COLLISION_EPSILON && projectile.maxRange > 0) {
        const remainingRange = Math.max(0, projectile.maxRange - projectile.travelled);
        movementDt = Math.min(movementDt, remainingRange / speed);
      }

      if (projectile.faction === 'player' && projectile.homing > 0) {
        const target = world.nearestEnemy(projectile.x, projectile.y, 360, projectile.hitIds);
        if (target) {
          const desired = normalize(target.x - projectile.x, target.y - projectile.y);
          const blend = Math.min(1, projectile.homing * movementDt);
          const current = normalize(projectile.vx, projectile.vy);
          const direction = normalize(current.x * (1 - blend) + desired.x * blend, current.y * (1 - blend) + desired.y * blend);
          projectile.vx = direction.x * speed;
          projectile.vy = direction.y * speed;
        }
      }

      const oldX = projectile.x;
      const oldY = projectile.y;
      projectile.x += projectile.vx * movementDt;
      projectile.y += projectile.vy * movementDt;
      projectile.travelled += Math.hypot(projectile.x - oldX, projectile.y - oldY);
      projectile.life = Math.max(0, projectile.life - frameDt);
      const expiresAfterSegment = projectile.life <= 0 || this.hasReachedMaxRange(projectile);

      if (!projectile.persistent && movementDt > 0) {
        const terrainHit = world.terrain?.firstProjectileBlock(
          oldX,
          oldY,
          projectile.x,
          projectile.y,
          projectile.radius,
        );
        if (terrainHit) {
          projectile.x = terrainHit.x;
          projectile.y = terrainHit.y;
          const color = terrainHit.feature.kind === 'tree' ? '#7fcf8c' : '#a7b2ba';
          world.particles.burst(terrainHit.x, terrainHit.y, color, 4, 62, 2);
          this.pool.release(projectile);
          return;
        }
      }

      if (projectile.trail && movementDt > 0 && world.rng.chance(Math.min(1, movementDt * 30))) {
        world.particles.spawn('trail', oldX, oldY, projectile.color, Math.max(1.5, projectile.radius * 0.55), 0.18, 0, 0);
      }

      if (projectile.faction === 'enemy') {
        // Đạn bắn ra khi kẻ địch bị mù vẫn bay và hiển thị,
        // nhưng không thể chạm hoặc gây sát thương lên người chơi.
        if (!projectile.canHitPlayer) {
          if (expiresAfterSegment) this.pool.release(projectile);
          return;
        }
        const hitTime = this.segmentCircleEntryTime(
          oldX,
          oldY,
          projectile.x,
          projectile.y,
          world.player.x,
          world.player.y,
          projectile.radius + world.player.radius,
        );
        if (hitTime !== null) {
          const impactX = oldX + (projectile.x - oldX) * hitTime;
          const impactY = oldY + (projectile.y - oldY) * hitTime;
          projectile.x = impactX;
          projectile.y = impactY;
          world.damagePlayer(projectile.damage, impactX, impactY);
          world.particles.burst(impactX, impactY, projectile.color, 5, 80, 2);
          this.pool.release(projectile);
          return;
        }
        if (expiresAfterSegment) this.pool.release(projectile);
        return;
      }

      // Expiring projectiles still resolve their final swept collision first, but
      // they do not apply an extra frame of pull after their lifetime/range ends.
      if (!expiresAfterSegment && projectile.pullStrength > 0) {
        const pullRadius = Math.max(projectile.explosiveRadius, projectile.radius * 2);
        const nearby = world.enemySpatial.queryCircle(projectile.x, projectile.y, pullRadius);
        for (const enemy of nearby) {
          if (!enemy.active || enemy.isBoss) continue;
          const direction = normalize(projectile.x - enemy.x, projectile.y - enemy.y);
          enemy.knockbackX += direction.x * projectile.pullStrength * frameDt;
          enemy.knockbackY += direction.y * projectile.pullStrength * frameDt;
        }
      }

      if (projectile.persistent) {
        // Persistent areas keep their existing point/area tick behavior. Like the
        // previous implementation, an area that expires this frame does not tick.
        if (expiresAfterSegment) {
          this.pool.release(projectile);
          return;
        }
        projectile.tickTimer -= frameDt;
        if (projectile.hitEffect?.kind === 'poison-cloud') {
          // Tiếp xúc được làm mới mỗi khung hình để thời gian lưu độc được tính
          // chính xác từ lúc rời vùng; tickRate chỉ điều khiển nhịp VFX của vùng.
          this.refreshPoisonCloudContacts(projectile, world);
          if (projectile.tickTimer <= 0) {
            projectile.tickTimer = projectile.tickRate;
            world.particles.ring(projectile.x, projectile.y, projectile.color, projectile.radius, 0.32);
          }
        } else if (projectile.tickTimer <= 0) {
          projectile.tickTimer = projectile.tickRate;
          projectile.hitIds.clear();
          this.hitAreaEnemies(projectile, world);
          world.particles.ring(projectile.x, projectile.y, projectile.color, projectile.radius, 0.32);
        }
      } else {
        if (projectile.deployAreaDuration > 0) {
          if (expiresAfterSegment) this.expire(projectile, world);
          return;
        }
        this.hitEnemiesAlongSegment(projectile, world, oldX, oldY, projectile.x, projectile.y);
        if (!projectile.active) return;
        if (expiresAfterSegment) this.expire(projectile, world);
      }
    });
  }

  private hitEnemiesAlongSegment(
    projectile: Projectile,
    world: ProjectileWorld,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const segmentLength = Math.hypot(deltaX, deltaY);
    const midpointX = startX + deltaX * 0.5;
    const midpointY = startY + deltaY * 0.5;
    const nearby = world.enemySpatial.queryCircle(midpointX, midpointY, segmentLength * 0.5 + projectile.radius);
    const hits: Array<{ enemy: Enemy; time: number }> = [];

    for (const enemy of nearby) {
      if (!enemy.active || projectile.hitIds.has(enemy.id)) continue;
      const time = this.segmentCircleEntryTime(
        startX,
        startY,
        endX,
        endY,
        enemy.x,
        enemy.y,
        projectile.radius + enemy.radius,
      );
      if (time !== null) hits.push({ enemy, time });
    }

    hits.sort((left, right) => left.time - right.time || left.enemy.id - right.enemy.id);
    for (const hit of hits) {
      const enemy = hit.enemy;
      if (!enemy.active || projectile.hitIds.has(enemy.id)) continue;
      const impactX = startX + deltaX * hit.time;
      const impactY = startY + deltaY * hit.time;
      projectile.hitIds.add(enemy.id);
      world.damageEnemy(
        enemy,
        projectile.damage,
        projectile.element,
        projectile.sourceWeaponId,
        projectile.statusChance,
        projectile.knockback,
        projectile.critical,
        impactX,
        impactY,
        projectile.hitEffect ?? undefined,
      );
      playSignatureHit(world, projectile.hitEffect);
      world.particles.burst(enemy.x, enemy.y, projectile.color, projectile.critical ? 9 : 4, 90, projectile.critical ? 3.2 : 2);
      if (projectile.explosiveRadius > 0) {
        projectile.x = impactX;
        projectile.y = impactY;
        this.explode(projectile, world);
        this.pool.release(projectile);
        return;
      }
      projectile.pierce -= 1;
      if (projectile.pierce < 0) {
        projectile.x = impactX;
        projectile.y = impactY;
        this.pool.release(projectile);
        return;
      }
    }
  }

  private hitAreaEnemies(projectile: Projectile, world: ProjectileWorld): void {
    const nearby = [...world.enemySpatial.queryCircle(projectile.x, projectile.y, projectile.radius)];
    for (const enemy of nearby) {
      if (!enemy.active || projectile.hitIds.has(enemy.id)) continue;
      if (distanceSquared(projectile.x, projectile.y, enemy.x, enemy.y) > projectile.radius * projectile.radius) continue;
      projectile.hitIds.add(enemy.id);
      world.damageEnemy(
        enemy,
        projectile.damage,
        projectile.element,
        projectile.sourceWeaponId,
        projectile.statusChance,
        projectile.knockback,
        projectile.critical,
        projectile.x,
        projectile.y,
        projectile.hitEffect ?? undefined,
      );
      playSignatureHit(world, projectile.hitEffect);
    }
  }

  private segmentCircleEntryTime(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    circleX: number,
    circleY: number,
    radius: number,
  ): number | null {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const offsetX = startX - circleX;
    const offsetY = startY - circleY;
    const radiusSquared = radius * radius;
    const constant = offsetX * offsetX + offsetY * offsetY - radiusSquared;
    if (constant <= 0) return 0;

    const quadratic = deltaX * deltaX + deltaY * deltaY;
    if (quadratic <= ProjectileSystem.COLLISION_EPSILON) return null;
    const linear = 2 * (offsetX * deltaX + offsetY * deltaY);
    const discriminant = linear * linear - 4 * quadratic * constant;
    if (discriminant < 0) return null;

    const entry = (-linear - Math.sqrt(Math.max(0, discriminant))) / (2 * quadratic);
    if (entry < -ProjectileSystem.COLLISION_EPSILON || entry > 1 + ProjectileSystem.COLLISION_EPSILON) return null;
    return Math.max(0, Math.min(1, entry));
  }

  private hasReachedMaxRange(projectile: Projectile): boolean {
    return projectile.maxRange > 0
      && projectile.travelled >= projectile.maxRange - ProjectileSystem.COLLISION_EPSILON;
  }

  private expire(projectile: Projectile, world: ProjectileWorld): void {
    if (projectile.faction === 'player' && projectile.deployAreaDuration > 0) {
      this.deployPersistentArea(projectile, world);
      return;
    }
    if (projectile.faction === 'player' && projectile.explosiveRadius > 0 && !projectile.persistent) {
      this.explode(projectile, world);
    }
    this.pool.release(projectile);
  }

  private explode(projectile: Projectile, world: ProjectileWorld): void {
    const nearby = [...world.enemySpatial.queryCircle(projectile.x, projectile.y, projectile.explosiveRadius)];
    for (const enemy of nearby) {
      if (!enemy.active) continue;
      const distanceSq = distanceSquared(projectile.x, projectile.y, enemy.x, enemy.y);
      if (distanceSq > (projectile.explosiveRadius + enemy.radius) ** 2) continue;
      const falloff = Math.max(0.55, 1 - Math.sqrt(distanceSq) / Math.max(1, projectile.explosiveRadius) * 0.35);
      world.damageEnemy(
        enemy,
        projectile.damage * falloff,
        projectile.element,
        projectile.sourceWeaponId,
        projectile.statusChance,
        projectile.knockback,
        projectile.critical,
        projectile.x,
        projectile.y,
        projectile.hitEffect ?? undefined,
      );
      playSignatureHit(world, projectile.hitEffect);
    }
    world.particles.ring(projectile.x, projectile.y, projectile.color, projectile.explosiveRadius, 0.42);
    world.particles.burst(projectile.x, projectile.y, projectile.color, 18, 210, 4);
  }

  private deployPersistentArea(projectile: Projectile, world: ProjectileWorld): void {
    projectile.vx = 0;
    projectile.vy = 0;
    projectile.damage = projectile.deployAreaDamage;
    projectile.radius = projectile.deployAreaRadius;
    projectile.life = projectile.deployAreaDuration;
    projectile.maxLife = projectile.deployAreaDuration;
    projectile.maxRange = 0;
    projectile.travelled = 0;
    projectile.persistent = true;
    projectile.trail = false;
    projectile.tickRate = projectile.deployAreaTickRate;
    projectile.tickTimer = 0;
    projectile.hitEffect = projectile.deployAreaHitEffect ? { ...projectile.deployAreaHitEffect } : null;
    projectile.deployAreaDuration = 0;
    projectile.deployAreaRadius = 0;
    projectile.deployAreaDamage = 0;
    projectile.deployAreaHitEffect = null;
    projectile.hitIds.clear();
    if (projectile.hitEffect?.kind === 'poison-cloud') world.audio?.play('poison-cloud', 0.52);
    world.particles.ring(projectile.x, projectile.y, projectile.color, projectile.radius, 0.45);
    world.particles.burst(projectile.x, projectile.y, projectile.color, 15, 145, 5);
  }

  private refreshPoisonCloudContacts(projectile: Projectile, world: ProjectileWorld): void {
    const nearby = world.enemySpatial.queryCircle(projectile.x, projectile.y, projectile.radius);
    for (const enemy of nearby) {
      if (!enemy.active) continue;
      if (distanceSquared(projectile.x, projectile.y, enemy.x, enemy.y) > (projectile.radius + enemy.radius) ** 2) continue;
      world.damageEnemy(
        enemy,
        projectile.damage,
        projectile.element,
        projectile.sourceWeaponId,
        0,
        0,
        false,
        projectile.x,
        projectile.y,
        projectile.hitEffect ?? undefined,
      );
    }
  }

  public clear(): void {
    this.pool.releaseAll();
  }
}
