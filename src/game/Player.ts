import type { InputManager } from '../core/InputManager.js';
import { clamp, normalize, smoothLerp } from '../core/MathUtils.js';
import type { CharacterConfig, MetaUpgradeConfig, SaveData, Vec2, WeaponBehavior } from '../core/Types.js';
import type { RNG } from '../core/RNG.js';
import { PlayerStats } from './PlayerStats.js';

const DASH_DURATION = 0.18;
const DASH_START_SPEED = 940;
const DASH_END_SPEED = 620;
const IMPACT_DECAY = 19;
export const RAGE_ACTIVATION_THRESHOLD = 35;
export const ULTIMATE_ACTIVATION_THRESHOLD = 75;
export const BASE_DAMAGE_BOOST = 0.2;
export const BASE_ATTACK_SPEED_BOOST = 0.2;
export const BOSS_BLESSING_LIFE_STEAL = 0.15;
export const BOSS_BLESSING_ATTACK_SPEED = 0.3;
export const BOSS_AFTERMATH_DURATION = 10;
export const BOSS_AFTERMATH_DAMAGE_MULTIPLIER = 11;
export const BOSS_AFTERMATH_PROJECTILE_SPEED_MULTIPLIER = 11;
export const BOSS_AFTERMATH_PROJECTILE_SIZE_MULTIPLIER = 11;
export const BOSS_AFTERMATH_BONUS_PROJECTILES = 10;

/** 0..1, đạt cực đại khi Kael còn 30% Sinh lực hoặc thấp hơn. */
export function kaelBloodiedRageRatio(health: number, maxHealth: number): number {
  const healthRatio = clamp(health / Math.max(1, maxHealth), 0, 1);
  return clamp((1 - healthRatio) / 0.7, 0, 1);
}

export type PlayerAnimationState = 'idle' | 'run' | 'dash' | 'hurt' | 'attack' | 'cast';
export type PlayerActionKind = 'none' | 'primary' | 'ability';
export type PlayerActionPhase = 'none' | 'anticipation' | 'release' | 'recovery';

const PRIMARY_ACTION_DURATION: Record<WeaponBehavior, number> = {
  slash: 0.28,
  bow: 0.25,
  gun: 0.18,
  darts: 0.2,
  bomb: 0.32,
  lightning: 0.3,
  fireball: 0.32,
  ice: 0.3,
  laser: 0.24,
  poison: 0.3,
  'poison-bomb': 0.34,
  orbit: 0.26,
  summon: 0.34,
  nova: 0.36,
};

const WEAPON_BEHAVIOR_BY_ID: Readonly<Record<string, WeaponBehavior>> = {
  'rift-blade': 'slash',
  'echo-bow': 'bow',
  'pulse-rifle': 'gun',
  'phase-darts': 'darts',
  'gravity-bomb': 'bomb',
  'storm-call': 'lightning',
  'ember-orb': 'fireball',
  'frost-shards': 'ice',
  'void-laser': 'laser',
  'venom-bloom': 'poison',
  'toxic-smoke-bomb': 'poison-bomb',
  'aegis-orbit': 'orbit',
  'echo-summon': 'summon',
  'arcane-nova': 'nova',
};

function facingFromVector(x: number, y: number): number {
  return (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
}

export function primaryBehaviorFromWeaponId(weaponId: string): WeaponBehavior {
  return WEAPON_BEHAVIOR_BY_ID[weaponId] ?? 'slash';
}

export class Player {
  public readonly character: CharacterConfig;
  public readonly stats: PlayerStats;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public radius = 18;
  public health: number;
  public level = 1;
  public exp = 0;
  public expToNext = 24;
  public invulnerable = 0;
  public hitCooldown = 0;
  public dashCooldown = 0;
  public dashTime = 0;
  public dashX = 0;
  public dashY = 0;
  public activeCooldown = 0;
  public ultimateMeter = 0;
  public ultimateActive = 0;
  public rageMeter = 0;
  public rageActive = 0;
  public rageShield = 0;
  public sealShield = 0;
  public bossBlessingActive = false;
  public bossAftermathTime = 0;
  public terrainSpeedMultiplier = 1;
  public holyShieldLayers = 0;
  public titanRiftShield = 0;
  public titanRiftShieldTime = 0;
  public titanRiftImpactTime = 0;
  public titanRiftImpactX = 0;
  public titanRiftImpactY = 0;
  public lightSoldierTime = 0;
  public lightSoldierAngle = 0;
  public rageExtraProjectiles = 0;
  public rageStatusImmune = false;
  public skillCritShards = 0;
  public statShards = 0;
  public animationClock = 0;
  public animationState: PlayerAnimationState = 'idle';
  public movementBlend = 0;
  public stridePhase = 0;
  public footstepSerial = 0;
  public footstepSide: -1 | 1 = -1;
  public facing8 = 0;
  public aim: Vec2 = { x: 1, y: 0 };
  public lastMove: Vec2 = { x: 1, y: 0 };
  public furyTime = 0;
  public killHasteStacks = 0;
  public killHasteTimer = 0;
  public flash = 0;
  public hurtTime = 0;
  public dashSerial = 0;
  public actionKind: PlayerActionKind = 'none';
  public actionTimer = 0;
  public actionDuration = 0;
  public actionAngle = 0;
  public actionDirection: Vec2 = { x: 1, y: 0 };
  public primaryWeaponBehavior: WeaponBehavior;
  public primaryAttackSerial = 0;
  public abilityCastSerial = 0;
  public abilityCastKind = '';
  private impactVx = 0;
  private impactVy = 0;
  private lastFootstepIndex = 0;
  private rageStatsApplied = false;
  private ultimateHealClock = 0;
  private ultimateHealPulses = 0;

  public constructor(character: CharacterConfig, metaConfigs: readonly MetaUpgradeConfig[], save: SaveData) {
    this.character = character;
    this.stats = new PlayerStats(character.stats);
    this.stats.applyMeta(metaConfigs, save.metaLevels);
    this.stats.applyPermanentPoints(save.permanentPoints);
    this.stats.apply('damage', 0.12, 'multiply');
    this.stats.apply('attackSpeed', 0.08, 'multiply');
    this.stats.apply('damage', BASE_DAMAGE_BOOST, 'multiply');
    this.stats.apply('attackSpeed', BASE_ATTACK_SPEED_BOOST, 'multiply');
    this.health = this.stats.get('maxHp');
    this.primaryWeaponBehavior = primaryBehaviorFromWeaponId(character.startWeapon);
  }

  public update(dt: number, input: InputManager, screenCenterX: number, screenCenterY: number): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.bossAftermathTime = Math.max(0, this.bossAftermathTime - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.activeCooldown = Math.max(0, this.activeCooldown - dt);
    this.titanRiftShieldTime = Math.max(0, this.titanRiftShieldTime - dt);
    this.titanRiftImpactTime = Math.max(0, this.titanRiftImpactTime - dt);
    if (this.titanRiftShieldTime <= 0) this.titanRiftShield = 0;
    const ultimateWasActive = this.ultimateActive > 0;
    const ultimateStep = ultimateWasActive ? Math.min(dt, this.ultimateActive) : 0;
    this.ultimateActive = Math.max(0, this.ultimateActive - dt);
    if (ultimateWasActive) {
      this.ultimateHealClock = Math.min(5, this.ultimateHealClock + ultimateStep);
      // Khi bước cuối dùng phần thời gian còn lại (ví dụ 0,008 giây), sai số
      // dấu phẩy động có thể để tổng ở 4,999999... và làm mất nhịp thứ năm.
      // Cạnh kết thúc tự nhiên của E luôn tương ứng đúng mốc 5 giây.
      if (this.ultimateActive <= 0) this.ultimateHealClock = 5;
      const duePulses = Math.min(5, Math.floor(this.ultimateHealClock + 1e-7));
      while (this.ultimateHealPulses < duePulses) {
        this.ultimateHealPulses += 1;
        const missingHealth = Math.max(0, this.stats.get('maxHp') - this.health);
        this.heal(missingHealth * 0.1, false);
      }
      if (this.ultimateActive <= 0) {
        this.ultimateHealClock = 0;
        this.ultimateHealPulses = 0;
      }
    }
    const rageWasActive = this.rageActive > 0;
    this.rageActive = Math.max(0, this.rageActive - dt);
    if (rageWasActive && this.rageActive <= 0) this.endRage();
    this.furyTime = Math.max(0, this.furyTime - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    if (this.actionTimer > 0) {
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      if (this.actionTimer <= 0) this.actionKind = 'none';
    }
    if (this.killHasteTimer > 0) this.killHasteTimer -= dt;
    else this.killHasteStacks = 0;

    const move = input.getMoveVector();
    const moveMagnitude = Math.min(1, Math.hypot(move.x, move.y));
    const moving = moveMagnitude > 0.035;
    const moveDirection = moving ? normalize(move.x, move.y) : { x: 0, y: 0 };
    if (moving) {
      this.lastMove = moveDirection;
      if (this.dashTime <= 0 && this.actionTimer <= 0) this.facing8 = facingFromVector(moveDirection.x, moveDirection.y);
    }
    const pointerAim = input.getAimVector(screenCenterX, screenCenterY);
    if (Math.hypot(pointerAim.x, pointerAim.y) > 0.05) {
      this.aim = pointerAim;
    }

    const haste = 1 + this.killHasteStacks * 0.04;
    const healthySpeed = this.character.passive.kind === 'healthy-bonus' && this.health / this.stats.get('maxHp') > 0.6 ? 1.06 : 1;
    const moveSpeed = this.stats.get('moveSpeed') * haste * healthySpeed * this.terrainSpeedMultiplier;

    let movementDt = dt;
    if (this.dashTime > 0) {
      const dashStep = Math.min(movementDt, this.dashTime);
      const startProgress = 1 - this.dashTime / DASH_DURATION;
      const endDashTime = Math.max(0, this.dashTime - dashStep);
      const endProgress = 1 - endDashTime / DASH_DURATION;
      const startSpeed = DASH_START_SPEED + (DASH_END_SPEED - DASH_START_SPEED) * startProgress;
      const endSpeed = DASH_START_SPEED + (DASH_END_SPEED - DASH_START_SPEED) * endProgress;
      const dashDistance = (startSpeed + endSpeed) * 0.5 * dashStep;
      this.x += this.dashX * dashDistance;
      this.y += this.dashY * dashDistance;
      this.vx = this.dashX * endSpeed;
      this.vy = this.dashY * endSpeed;
      this.dashTime = endDashTime;
      this.invulnerable = Math.max(this.invulnerable, 0.08);
      movementDt -= dashStep;

      if (this.dashTime <= 0) {
        // Giữ một phần động lượng để kết thúc dash không bị khựng, sau đó
        // bộ điều khiển gia tốc bên dưới sẽ nhanh chóng trả về tốc độ thường.
        const exitSpeed = Math.min(DASH_END_SPEED, moveSpeed * 0.78);
        this.vx = this.dashX * exitSpeed;
        this.vy = this.dashY * exitSpeed;
      }
    }

    if (movementDt > 0) {
      const targetVx = moveDirection.x * moveMagnitude * moveSpeed;
      const targetVy = moveDirection.y * moveMagnitude * moveSpeed;
      const reversing = moving && this.vx * moveDirection.x + this.vy * moveDirection.y < -4;
      const response = moving ? (reversing ? 34 : 22) : 30;
      this.vx = smoothLerp(this.vx, targetVx, response, movementDt);
      this.vy = smoothLerp(this.vy, targetVy, response, movementDt);
      this.x += this.vx * movementDt;
      this.y += this.vy * movementDt;
    }

    // Lực va chạm được tích phân và giảm dần độc lập với điều khiển. Cách này
    // giữ phản hồi trúng đòn rõ mà không giật tức thời vị trí nhân vật.
    if (Math.abs(this.impactVx) + Math.abs(this.impactVy) > 0.01) {
      const decay = Math.exp(-IMPACT_DECAY * dt);
      const displacementScale = (1 - decay) / IMPACT_DECAY;
      this.x += this.impactVx * displacementScale;
      this.y += this.impactVy * displacementScale;
      this.impactVx *= decay;
      this.impactVy *= decay;
      if (Math.abs(this.impactVx) + Math.abs(this.impactVy) < 0.5) {
        this.impactVx = 0;
        this.impactVy = 0;
      }
    }

    const actualSpeed = Math.hypot(this.vx, this.vy);
    const movementTarget = clamp(actualSpeed / Math.max(1, moveSpeed), 0, 1);
    this.movementBlend = smoothLerp(this.movementBlend, movementTarget, 14, dt);
    if (actualSpeed > 4) {
      this.animationClock += dt * clamp(actualSpeed / 215, 0.55, 1.9);
    }
    this.stridePhase = (this.animationClock * 1.75) % 1;
    const footstepIndex = Math.floor(this.animationClock * 3.5);
    if (this.dashTime <= 0 && actualSpeed > moveSpeed * 0.28 && footstepIndex > this.lastFootstepIndex) {
      this.footstepSerial += 1;
      this.footstepSide = footstepIndex % 2 === 0 ? -1 : 1;
    }
    this.lastFootstepIndex = footstepIndex;
    this.animationState = this.dashTime > 0 ? 'dash'
      : this.hurtTime > 0 ? 'hurt'
        : this.actionTimer > 0 && this.actionKind === 'ability' ? 'cast'
          : this.actionTimer > 0 && this.actionKind === 'primary' ? 'attack'
            : actualSpeed > 4 && this.movementBlend > 0.035 ? 'run' : 'idle';

    const scale = this.stats.get('bodyScale');
    this.radius = 18 * (1 + Math.max(0, scale - 1) * 0.35);

    const regen = this.stats.get('hpRegen') * this.stats.get('healingPower') * (this.furyTime > 0 ? 1.5 : 1);
    this.health = clamp(this.health + regen * dt, 0, this.stats.get('maxHp'));
  }

  public tryDash(direction?: Vec2): boolean {
    if (this.dashCooldown > 0 || this.dashTime > 0) return false;
    const dash = normalize(direction?.x ?? this.lastMove.x, direction?.y ?? this.lastMove.y);
    if (Math.hypot(dash.x, dash.y) < 0.01) return false;
    this.dashX = dash.x;
    this.dashY = dash.y;
    this.dashTime = DASH_DURATION;
    this.dashCooldown = 2.8;
    this.invulnerable = 0.28;
    this.vx = this.dashX * DASH_START_SPEED;
    this.vy = this.dashY * DASH_START_SPEED;
    this.facing8 = facingFromVector(this.dashX, this.dashY);
    this.animationState = 'dash';
    this.dashSerial += 1;
    return true;
  }

  public addMovementImpulse(x: number, y: number): void {
    this.impactVx += x;
    this.impactVy += y;
    const magnitude = Math.hypot(this.impactVx, this.impactVy);
    if (magnitude > 260) {
      this.impactVx = this.impactVx / magnitude * 260;
      this.impactVy = this.impactVy / magnitude * 260;
    }
  }

  public get motionVx(): number {
    return this.vx + this.impactVx;
  }

  public get motionVy(): number {
    return this.vy + this.impactVy;
  }

  public get dashProgress(): number {
    if (this.dashTime <= 0) return 0;
    return clamp(1 - this.dashTime / DASH_DURATION, 0, 1);
  }

  public get actionProgress(): number {
    if (this.actionTimer <= 0 || this.actionDuration <= 0) return 0;
    return clamp(1 - this.actionTimer / this.actionDuration, 0, 1);
  }

  public get actionPhase(): PlayerActionPhase {
    if (this.actionTimer <= 0 || this.actionKind === 'none') return 'none';
    const progress = this.actionProgress;
    if (progress < 0.26) return 'anticipation';
    if (progress < 0.62) return 'release';
    return 'recovery';
  }

  public triggerPrimaryAttack(behavior: WeaponBehavior, angle: number): void {
    const safeAngle = Number.isFinite(angle) ? angle : Math.atan2(this.aim.y, this.aim.x);
    const direction = { x: Math.cos(safeAngle), y: Math.sin(safeAngle) };
    this.primaryWeaponBehavior = behavior;
    this.primaryAttackSerial += 1;
    // Q/E/R có pose ưu tiên; đòn đánh tự động vẫn được ghi serial nhưng không
    // cắt ngang động tác kỹ năng đang hiển thị.
    if (this.actionKind === 'ability' && this.actionTimer > 0) return;
    // Tốc đánh có thể cộng dồn vượt xa thời lượng pose. Không khởi động lại
    // timer giữa chu kỳ để release/recovery luôn đọc được và tay không rung ở
    // mỗi projectile; serial phía trên vẫn ghi nhận đầy đủ mọi phát bắn thật.
    if (this.actionKind === 'primary' && this.actionTimer > 0) return;
    this.actionKind = 'primary';
    this.actionDuration = PRIMARY_ACTION_DURATION[behavior];
    this.actionTimer = this.actionDuration;
    this.actionAngle = safeAngle;
    this.actionDirection = direction;
    this.aim = direction;
    if (this.dashTime <= 0 && this.hurtTime <= 0) {
      this.facing8 = facingFromVector(direction.x, direction.y);
      this.animationState = 'attack';
    }
  }

  public triggerAbilityCast(kind: string, directionOverride?: Vec2): void {
    const source = directionOverride ?? this.aim;
    const aimMagnitude = Math.hypot(source.x, source.y);
    const direction = aimMagnitude > 0.05 ? normalize(source.x, source.y) : this.lastMove;
    this.actionKind = 'ability';
    this.actionDuration = kind === 'ultimate' || kind.startsWith('ultimate-') ? 0.52
      : kind === 'rage' || kind.startsWith('rage-') ? 0.42 : 0.38;
    this.actionTimer = this.actionDuration;
    this.actionAngle = Math.atan2(direction.y, direction.x);
    this.actionDirection = { ...direction };
    this.abilityCastKind = kind;
    this.abilityCastSerial += 1;
    if (this.dashTime <= 0 && this.hurtTime <= 0) {
      this.facing8 = facingFromVector(direction.x, direction.y);
      this.animationState = 'cast';
    }
  }

  public takeDamage(rawDamage: number, rng: RNG): number {
    if (rawDamage <= 0) return 0;
    if (this.bossAftermathTime > 0) return 0;
    if (this.invulnerable > 0 || this.hitCooldown > 0) return 0;
    const dodgeChance = Math.min(0.75, this.stats.get('dodge'));
    if (rng.chance(dodgeChance)) {
      this.hitCooldown = 0.12;
      return -1;
    }
    if (this.holyShieldLayers > 0) {
      this.holyShieldLayers = 0;
      this.hitCooldown = 0.1;
      this.flash = 0.08;
      return 0;
    }
    let incoming = rawDamage;
    if (this.titanRiftShield > 0) {
      const shielded = Math.min(this.titanRiftShield, incoming);
      this.titanRiftShield -= shielded;
      incoming -= shielded;
      if (incoming <= 0) {
        this.hitCooldown = 0.1;
        this.flash = 0.08;
        return 0;
      }
    }
    if (this.sealShield > 0) {
      const shielded = Math.min(this.sealShield, incoming);
      this.sealShield -= shielded;
      incoming -= shielded;
      if (incoming <= 0) {
        this.hitCooldown = 0.1;
        this.flash = 0.08;
        return 0;
      }
    }
    if (this.rageShield > 0) {
      const shielded = Math.min(this.rageShield, incoming);
      this.rageShield -= shielded;
      incoming -= shielded;
      if (incoming <= 0) {
        this.hitCooldown = 0.1;
        this.flash = 0.08;
        return 0;
      }
    }
    const blocked = Math.min(Math.max(0, incoming - 1), this.stats.get('flatBlock'));
    const afterBlock = Math.max(0, incoming - blocked);
    const armor = this.stats.get('armor');
    const baseReduction = Math.min(0.68, armor / (armor + 28));
    const forgeReduction = this.character.passive.kind === 'armor-conversion' ? Math.min(0.18, Math.floor(armor / 7) * 0.01) : 0;
    const reduction = Math.min(0.78, baseReduction + forgeReduction);
    const damage = Math.max(1, afterBlock * (1 - reduction));
    this.health = Math.max(0, this.health - damage);
    this.hitCooldown = 0.38;
    this.invulnerable = 0.1;
    this.flash = 0.14;
    this.hurtTime = 0.16;
    this.animationState = 'hurt';
    this.addRage(Math.min(12, 2 + damage * 0.16));
    return damage;
  }

  public heal(amount: number, amplify = true): void {
    const healing = amount * (amplify ? this.stats.get('healingPower') : 1);
    this.health = clamp(this.health + healing, 0, this.stats.get('maxHp'));
  }

  public grantBossBlessing(): boolean {
    if (this.bossBlessingActive) return false;
    this.bossBlessingActive = true;
    this.stats.apply('attackSpeed', BOSS_BLESSING_ATTACK_SPEED, 'multiply');
    this.sealShield = Math.max(this.sealShield, this.stats.get('maxHp'));
    return true;
  }

  public activateBossAftermath(duration = BOSS_AFTERMATH_DURATION): void {
    this.bossAftermathTime = Math.max(this.bossAftermathTime, duration);
    this.health = Math.max(1, this.health);
    this.invulnerable = Math.max(this.invulnerable, duration + 0.25);
  }

  public bossAftermathActive(): boolean {
    return this.bossAftermathTime > 0;
  }

  public effectiveBonusProjectiles(): number {
    return this.stats.get('bonusProjectiles')
      + (this.bossAftermathActive() ? BOSS_AFTERMATH_BONUS_PROJECTILES : 0);
  }

  public bossAftermathProjectileSpeedMultiplier(): number {
    return this.bossAftermathActive() ? BOSS_AFTERMATH_PROJECTILE_SPEED_MULTIPLIER : 1;
  }

  public bossAftermathProjectileSizeMultiplier(): number {
    return this.bossAftermathActive() ? BOSS_AFTERMATH_PROJECTILE_SIZE_MULTIPLIER : 1;
  }

  public healFromBossBlessing(damage: number): void {
    if (!this.bossBlessingActive || damage <= 0) return;
    this.heal(damage * BOSS_BLESSING_LIFE_STEAL, false);
  }

  public syncMaxHp(previousMax: number): void {
    const newMax = this.stats.get('maxHp');
    if (newMax <= previousMax) return;
    this.health += newMax - previousMax;
    this.health = Math.min(newMax, this.health);
  }

  public addUltimate(amount: number): void {
    this.ultimateMeter = clamp(this.ultimateMeter + amount, 0, 100);
  }

  public addRage(amount: number): void {
    this.rageMeter = clamp(this.rageMeter + amount, 0, 100);
  }

  public consumeRage(): boolean {
    if (this.rageMeter < RAGE_ACTIVATION_THRESHOLD || this.rageActive > 0) return false;
    this.rageMeter = 0;
    this.rageActive = 5;
    this.stats.apply('attackSpeed', 2, 'multiply');
    this.rageStatsApplied = true;
    if (this.character.rage?.bonus === 'extra-projectile') {
      this.stats.apply('bonusProjectiles', 1, 'add');
      this.rageExtraProjectiles = 1;
    } else if (this.character.rage?.bonus === 'status-immunity') {
      this.rageStatusImmune = true;
    }
    return true;
  }

  public consumeUltimate(): boolean {
    if (this.ultimateMeter < ULTIMATE_ACTIVATION_THRESHOLD || this.ultimateActive > 0) return false;
    this.ultimateMeter = 0;
    this.ultimateActive = 5;
    this.ultimateHealClock = 0;
    this.ultimateHealPulses = 0;
    this.invulnerable = Math.max(this.invulnerable, 0.55);
    return true;
  }

  public activeCooldownDuration(): number {
    const base = this.character.active?.cooldown ?? 10;
    return Math.max(2.2, base * (1 - this.stats.get('cooldownReduction')));
  }

  public effectiveCritDamage(): number {
    // Chí mạng thường luôn bắt đầu đúng ở 180%; chỉ các
    // mảnh/nâng cấp trong trận mới được thay đổi chỉ số này.
    return this.stats.get('critDamage');
  }

  public effectiveAttackSpeed(): number {
    const base = this.stats.get('attackSpeed');
    if (this.character.id !== 'kael-orin') return base;
    return base * (1 + kaelBloodiedRageRatio(this.health, this.stats.get('maxHp')) * 2);
  }

  public effectiveLifeSteal(): number {
    const base = this.stats.get('lifeSteal');
    if (this.character.id !== 'kael-orin') return base;
    return Math.min(0.85, base + kaelBloodiedRageRatio(this.health, this.stats.get('maxHp')) * 0.5);
  }

  public effectiveDamageMultiplier(): number {
    let multiplier = this.stats.get('damage');
    if (this.character.passive.kind === 'healthy-bonus' && this.health / this.stats.get('maxHp') > 0.6) {
      multiplier *= 1 + this.character.passive.value;
    }
    if (this.character.passive.kind === 'armor-conversion') {
      multiplier *= 1 + Math.floor(this.stats.get('armor') / 7) * this.character.passive.value;
    }
    if (this.furyTime > 0) multiplier *= 1.22;
    if (this.rageActive > 0) multiplier *= 0.9;
    if (this.ultimateActive > 0) multiplier *= 1.1;
    if (this.bossAftermathActive()) multiplier *= BOSS_AFTERMATH_DAMAGE_MULTIPLIER;
    return multiplier;
  }

  public skillCritDamage(): number {
    return 2 + Math.max(0, this.skillCritShards - 1) * 0.5;
  }

  private endRage(): void {
    if (this.rageStatsApplied) {
      // PlayerStats dùng hệ số nhân `1 + value`; -2/3 hoàn nguyên chính xác x3.
      this.stats.apply('attackSpeed', -2 / 3, 'multiply');
      this.rageStatsApplied = false;
    }
    if (this.rageExtraProjectiles > 0) {
      this.stats.apply('bonusProjectiles', -this.rageExtraProjectiles, 'add');
      this.rageExtraProjectiles = 0;
    }
    this.rageStatusImmune = false;
    this.rageShield = 0;
  }
}
