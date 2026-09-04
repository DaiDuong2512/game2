import type { LoreConfig } from '../narrative/NarrativeTypes.js';

export type GameState =
  | 'loading'
  | 'main-menu'
  | 'character-select'
  | 'stage-select'
  | 'shop'
  | 'settings'
  | 'starting-loadout'
  | 'playing'
  | 'paused'
  | 'level-up'
  | 'summary';

export type ElementType = 'physical' | 'fire' | 'ice' | 'lightning' | 'poison' | 'arcane';
export type WeaponBehavior =
  | 'slash'
  | 'bow'
  | 'gun'
  | 'darts'
  | 'bomb'
  | 'lightning'
  | 'fireball'
  | 'ice'
  | 'laser'
  | 'poison'
  | 'poison-bomb'
  | 'orbit'
  | 'summon'
  | 'nova';

export type WeaponSlot = 'primary' | 'auxiliary';
export type WeaponSignatureKind = 'bleed' | 'slow' | 'stun' | 'poison-cloud';

export interface WeaponSignatureConfig {
  kind: WeaponSignatureKind;
  duration: number;
  chance?: number;
  magnitude?: number;
  healthPercentPerSecond?: number;
  damageScale?: number;
  bossDurationMultiplier?: number;
  eliteDurationMultiplier?: number;
}

export type EnemyAI =
  | 'melee'
  | 'fast'
  | 'tank'
  | 'ranged'
  | 'charger'
  | 'flying'
  | 'healer'
  | 'summoner'
  | 'exploder'
  | 'shield'
  | 'assassin'
  | 'splitter'
  | 'burrow'
  | 'leech'
  | 'sniper'
  | 'mage'
  | 'elite'
  | 'boss';

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';
export type PickupType = 'exp' | 'gold' | 'heal' | 'magnet' | 'fury' | 'chest' | 'shard' | 'stat-shard' | 'skill-crit-shard';
export type ProjectileFaction = 'player' | 'enemy';
export type EnemySizeClass = 'small' | 'medium' | 'large';
export type PermanentStatId = 'attackSpeed' | 'moveSpeed' | 'armor' | 'damage' | 'lifeSteal' | 'luck';
export type ColorBlindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerStatBlock {
  maxHp: number;
  armor: number;
  moveSpeed: number;
  attackSpeed: number;
  critChance: number;
  critDamage: number;
  damage: number;
  cooldownReduction: number;
  range: number;
  projectileSpeed: number;
  lifeSteal: number;
  hpRegen: number;
  dodge: number;
  luck: number;
  expGain: number;
  goldGain: number;
  bonusProjectiles: number;
  healingPower: number;
  armorPenetration: number;
  statusResistance: number;
  bodyScale: number;
  flatBlock: number;
}

export interface CharacterPassiveConfig {
  name: string;
  description: string;
  kind: string;
  value: number;
}

export interface CharacterConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  portrait: string;
  gameplaySprite?: string;
  /** Atlas đã vẽ sẵn vũ khí trong từng frame; renderer không được chồng thêm bản sao. */
  gameplaySpriteIncludesWeapon?: boolean;
  startWeapon: string;
  unlockStage: number;
  passive: CharacterPassiveConfig;
  active?: CharacterAbilityConfig;
  rage?: CharacterAbilityConfig;
  ultimate?: CharacterAbilityConfig;
  stats: PlayerStatBlock;
}

export interface CharacterAbilityConfig {
  name: string;
  description: string;
  kind: string;
  duration: number;
  cooldown?: number;
  bonus?: 'extra-projectile' | 'status-immunity';
}

export interface WeaponLevelConfig {
  level: number;
  damage: number;
  cooldown: number;
  count: number;
  speed: number;
  range: number;
  pierce: number;
  size: number;
  duration: number;
  knockback: number;
  statusChance: number;
}

export interface WeaponConfig {
  id: string;
  name: string;
  behavior: WeaponBehavior;
  element: ElementType;
  icon: string;
  description: string;
  signature?: WeaponSignatureConfig;
  maxLevel: number;
  levels: WeaponLevelConfig[];
}

export interface PassiveConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  stat: keyof PlayerStatBlock;
  secondaryStat?: keyof PlayerStatBlock;
  mode: 'add' | 'multiply';
  perLevel: number;
  secondaryPerLevel?: number;
}

export interface EvolutionConfig {
  id: string;
  name: string;
  weapon: string;
  passive: string;
  description: string;
  damageMultiplier: number;
  cooldownMultiplier: number;
  countBonus: number;
  effect: string;
}

export interface EnemyConfig {
  id: string;
  name: string;
  ai: EnemyAI;
  tier: 'normal' | 'elite' | 'boss';
  sprite: string;
  element?: ElementType;
  cost: number;
  baseHealth: number;
  baseDamage: number;
  speed: number;
  radius: number;
  exp: number;
  gold: number;
  spawnMinStage: number;
  attackRange: number;
  attackCooldown: number;
  projectileSpeed: number;
  baseArmor?: number;
  sizeClass?: EnemySizeClass;
}

export interface StageTheme {
  background: string;
  accent: string;
  grid: string;
}

export interface StageConfig {
  id: string;
  index: number;
  name: string;
  description: string;
  thumbnail: string;
  duration: number;
  waveCount: number;
  bossId: string | null;
  eliteId: string;
  allowedEnemies: string[];
  theme: StageTheme;
  spawnBase: number;
  rewardGold: number;
  rewardShards: number;
}

export interface RarityConfig {
  id: RarityId;
  name: string;
  weight: number;
  multiplier: number;
  color: string;
}

export interface StatBoostConfig {
  id: string;
  name: string;
  description: string;
  kind: 'heal' | 'stat' | 'dual-stat';
  stat?: keyof PlayerStatBlock;
  mode?: 'add' | 'multiply';
  value: number;
  secondaryStat?: keyof PlayerStatBlock;
  secondaryValue?: number;
  icon: string;
}

export interface UpgradesConfig {
  rarities: RarityConfig[];
  statBoosts: StatBoostConfig[];
}

export interface MetaUpgradeConfig {
  id: string;
  name: string;
  stat: keyof PlayerStatBlock;
  baseCost: number;
  costGrowth: number;
  perLevel: number;
}

export interface GameData {
  characters: CharacterConfig[];
  weapons: WeaponConfig[];
  passives: PassiveConfig[];
  evolutions: EvolutionConfig[];
  enemies: EnemyConfig[];
  stages: StageConfig[];
  upgrades: UpgradesConfig;
  metaUpgrades: MetaUpgradeConfig[];
  lore: LoreConfig;
  characterById: Map<string, CharacterConfig>;
  weaponById: Map<string, WeaponConfig>;
  passiveById: Map<string, PassiveConfig>;
  evolutionById: Map<string, EvolutionConfig>;
  enemyById: Map<string, EnemyConfig>;
  stageById: Map<string, StageConfig>;
}

export interface WeaponRuntime {
  id: string;
  slot: WeaponSlot;
  level: number;
  masteryLevel: number;
  refinementBonus: number;
  cooldown: number;
  damageDealt: number;
  evolutionId: string | null;
  orbitHitClock: number;
  summonAngle: number;
}

export interface PassiveRuntime {
  id: string;
  level: number;
}

export interface UpgradeOption {
  id: string;
  type: 'weapon-new' | 'weapon-level' | 'weapon-mastery' | 'passive-new' | 'passive-level' | 'evolution' | 'stat';
  title: string;
  description: string;
  icon: string;
  rarity: RarityConfig;
  targetId: string;
  nextLevel?: number;
  statBoost?: StatBoostConfig;
}

export interface StarterBuff {
  id: string;
  name: string;
  description: string;
  stat: keyof PlayerStatBlock;
  mode: 'add' | 'multiply';
  value: number;
  secondaryStat?: keyof PlayerStatBlock;
  secondaryValue?: number;
}

export interface StarterOption {
  id: string;
  weaponId: string;
  title: string;
  description: string;
  icon: string;
  buff: StarterBuff;
}

export interface StatusState {
  bleedTime: number;
  bleedDps: number;
  bleedTick: number;
  bleedSourceWeapon: string;
  burnTime: number;
  burnDps: number;
  poisonTime: number;
  poisonDps: number;
  poisonCloudTime: number;
  poisonCloudDps: number;
  poisonCloudPercent: number;
  poisonCloudTick: number;
  poisonCloudSourceWeapon: string;
  slowTime: number;
  slowFactor: number;
  stunTime: number;
  shockTime: number;
  paralysisTime: number;
  blindTime: number;
  blindCooldown: number;
  burnTick: number;
  burnPercent: number;
  healingReduction: number;
}

export interface ScaleSnapshot {
  health: number;
  damage: number;
  speed: number;
  spawnRate: number;
  eliteRate: number;
}

export interface RunStats {
  startedAt: number;
  elapsed: number;
  stageIndex: number;
  wave: number;
  level: number;
  kills: number;
  gold: number;
  shards: number;
  totalDamage: number;
  damageByWeapon: Record<string, number>;
  result: 'victory' | 'defeat' | 'abandoned';
  seed: number;
  statShards: number;
  skillCritShards: number;
}

export interface SettingsData {
  masterVolume: number;
  effectsVolume: number;
  screenShake: number;
  damageNumbers: boolean;
  reducedParticles: boolean;
  autoAim: boolean;
  highContrast: boolean;
  colorBlindMode: ColorBlindMode;
}

export interface PermanentRewardChoice {
  id: string;
  stat: PermanentStatId;
  title: string;
  description: string;
  points: number;
}

export interface SaveData {
  version: number;
  goldReserve: number;
  riftShards: number;
  highestStage: number;
  highestCompletedStage: number;
  recordedRuns: number;
  unlockedCharacters: string[];
  unlockedWeapons: string[];
  metaLevels: Record<string, number>;
  settings: SettingsData;
  lastCharacterId: string;
  lastStageId: string;
  permanentPoints: Record<PermanentStatId, number>;
  pendingPermanentChoices: PermanentRewardChoice[];
  pendingPermanentStage: number;
}

export interface DamageResult {
  amount: number;
  critical: boolean;
  killed: boolean;
}

export interface BossTelegraph {
  id: number;
  x: number;
  y: number;
  radius: number;
  time: number;
  maxTime: number;
  damage: number;
  kind: 'circle' | 'ring';
  bossId: string;
}
