import { clamp, hexToRgba, TAU } from '../core/MathUtils.js';
import type { AssetManager } from '../core/AssetManager.js';
import type { ElementType, SettingsData, StageConfig, WeaponBehavior } from '../core/Types.js';
import type { BossSystem } from '../game/BossSystem.js';
import type { Enemy, FloatingTextKind, Projectile } from '../game/Entities.js';
import type { EnemySpawner } from '../game/EnemySpawner.js';
import type { FloatingTextSystem } from '../game/FloatingTextSystem.js';
import type { LootSystem } from '../game/LootSystem.js';
import type { ImpactSemantic, ParticleSystem } from '../game/ParticleSystem.js';
import type { Player } from '../game/Player.js';
import type { ProjectileSystem } from '../game/ProjectileSystem.js';
import type { TerrainFeature, TerrainSystem } from '../game/TerrainSystem.js';
import { SWORD_MAX_VISIBLE_LAYERS, swordLayerRadius, type WeaponSystem } from '../game/WeaponSystem.js';
import type { Camera } from './Camera.js';
import { combatCueProfile, combatCueTier, impactWeightForSize, type ImpactWeight } from './CombatVfxLanguage.js';
import { GpuCanvasPresenter, type GpuRenderStats, type RenderBackend } from './GpuCanvasPresenter.js';
import { drawProceduralPlayerSprite } from './ProceduralPlayerSprite.js';
import { terrainBiome } from '../game/TerrainSystem.js';
import { titanActionFrame, TITAN_FALL_IMPACT, TITAN_IMPACT_VFX_DURATION } from '../game/CombatTiming.js';

export interface RenderScene {
  stage: StageConfig;
  time: number;
  player: Player;
  enemies: EnemySpawner;
  projectiles: ProjectileSystem;
  loot: LootSystem;
  particles: ParticleSystem;
  floatingText: FloatingTextSystem;
  boss: BossSystem;
  weapons: WeaponSystem;
  settings: SettingsData;
  terrain: TerrainSystem;
}

const KAEL_SPRITE_PATH = 'assets/generated/characters/kael-orin-gameplay-v2.png';
const VFX_ATLAS_PATH = 'assets/generated/effects/pixel-vfx-atlas.png';
const STATUS_VFX_ATLAS_PATH = 'assets/generated/effects/status-impact-vfx-v3.png';
const TOXIC_SMOKE_VFX_PATH = 'assets/generated/effects/toxic-smoke-vfx-v4.png';
const PROJECTILE_ATLAS_PATH = 'assets/generated/effects/projectile-atlas-v2.png';
const GUARDIAN_PASSIVE_ATLAS_PATH = 'assets/generated/effects/guardian-passive-atlas-v1.png';
const BOSS_CHARACTER_ATLAS_PATH = 'assets/generated/bosses-v2/boss-character-atlas-v2.png';
const BOSS_ABILITY_ATLAS_PATH = 'assets/generated/bosses-v2/boss-ability-atlas-v1.png';
const VOID_DEVOURER_SPRITE_PATH = 'assets/generated/bosses-v3/void-devourer-v3.png';
const VOID_DEVOURER_ABILITY_PATH = 'assets/generated/bosses-v3/void-devourer-ability-v2.png';
const TERRAIN_PROPS_ATLAS_PATH = 'assets/generated/terrain-v1/terrain-props-atlas-v1.png';
const TERRAIN_GRASS_ATLAS_PATH = 'assets/generated/terrain-v1/terrain-grass-atlas-v1.png';
const BOSS_MOTION_PATH = 'assets/generated/combat-v8/boss-motion.png';
const BOSS_IMPACT_PATH = 'assets/generated/combat-v8/boss-impact.png';
const TITAN_ACTION_PATH = 'assets/generated/combat-v8/titan-actions.png';
const GROUND_TEXTURE_PATH = 'assets/generated/combat-v8/ground-tiles.png';
const TERRAIN_ATLAS_COLUMNS = 4;
const TERRAIN_ATLAS_ROWS = 3;
const GRASS_ATLAS_COLUMNS = 4;
const GRASS_ATLAS_ROWS = 2;
const BOSS_ATLAS_COLUMNS = 4;
const BOSS_ABILITY_ROWS = 2;
const BOSS_ATLAS_INDEX: Readonly<Record<string, number>> = {
  'void-devourer': 0,
  'iron-behemoth': 1,
  'frost-queen': 2,
  'lord-infernus': 3,
};
const TOXIC_SMOKE_WEAPON_ID = 'toxic-smoke-bomb';
const PLAYER_SPRITE_COLUMNS = 4;
const PLAYER_SPRITE_ROWS = 8;
const PLAYER_SPRITE_FOOT_RATIO = 0.92;
const VFX_CELL_WIDTH = 229;
const VFX_CELL_HEIGHT = 229;
const STATUS_VFX_CELL_SIZE = 362;
const STATUS_VFX_INSET = 5;
const TOXIC_SMOKE_CELL_SIZE = 444;
const PROJECTILE_ATLAS_COLUMNS = 4;
const PROJECTILE_ATLAS_ROWS = 4;
const PROJECTILE_ATLAS_INDEX: Readonly<Record<string, number>> = {
  'rift-blade': 0,
  'echo-bow': 1,
  'pulse-rifle': 2,
  'phase-darts': 3,
  'gravity-bomb': 4,
  'storm-call': 5,
  'ember-orb': 6,
  'frost-shards': 7,
  'void-laser': 8,
  'venom-bloom': 9,
  'aegis-orbit': 10,
  'echo-summon': 11,
  'arcane-nova': 12,
  'toxic-smoke-bomb': 13,
};
const FACING_TO_SPRITE_ROW = [6, 7, 0, 1, 2, 3, 4, 5] as const;
const ELEMENT_VFX_ROW: Partial<Record<ElementType, number>> = {
  lightning: 0,
  fire: 1,
  ice: 2,
  arcane: 3,
};
const RANGED_RECOIL_AI = new Set(['ranged', 'sniper', 'mage', 'elite']);

export interface BossIndicatorPoint {
  x: number;
  y: number;
  angle: number;
}

export function bossIndicatorPoint(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  inset = 58,
): BossIndicatorPoint | null {
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return null;
  const scaleX = Math.abs(deltaX) < 0.001 ? Number.POSITIVE_INFINITY
    : deltaX > 0 ? (width - inset - originX) / deltaX : (inset - originX) / deltaX;
  const scaleY = Math.abs(deltaY) < 0.001 ? Number.POSITIVE_INFINITY
    : deltaY > 0 ? (height - inset - originY) / deltaY : (inset - originY) / deltaY;
  const scale = Math.max(0, Math.min(scaleX, scaleY));
  return {
    x: clamp(originX + deltaX * scale, inset, width - inset),
    y: clamp(originY + deltaY * scale, inset, height - inset),
    angle: Math.atan2(deltaY, deltaX),
  };
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly presenter: GpuCanvasPresenter;
  private readonly assets: AssetManager;
  private readonly camera: Camera;
  private width = 1280;
  private height = 720;
  private pixelRatio = 1;
  private sceneTime = 0;
  private reducedMotion = false;
  private groundOriginX = 0;
  private groundOriginY = 0;
  private readonly groundPatterns = new Map<number, CanvasPattern>();
  private readonly depthQueue: (Enemy | TerrainFeature | Player)[] = [];

  public constructor(canvas: HTMLCanvasElement, assets: AssetManager, camera: Camera) {
    this.canvas = canvas;
    this.presenter = new GpuCanvasPresenter(canvas);
    this.context = this.presenter.context;
    this.assets = assets;
    this.camera = camera;
    // Fallback an toàn nếu bootstrap cũ chưa thêm atlas production mới vào preload.
    void this.assets.load(STATUS_VFX_ATLAS_PATH);
    void this.assets.load(TOXIC_SMOKE_VFX_PATH);
    void this.assets.load(PROJECTILE_ATLAS_PATH);
    void this.assets.load(GUARDIAN_PASSIVE_ATLAS_PATH);
    if (!this.assets.get(BOSS_MOTION_PATH)) {
      void this.assets.load(BOSS_CHARACTER_ATLAS_PATH);
      void this.assets.load(VOID_DEVOURER_SPRITE_PATH);
    }
    if (!this.assets.get(BOSS_IMPACT_PATH)) {
      void this.assets.load(BOSS_ABILITY_ATLAS_PATH);
      void this.assets.load(VOID_DEVOURER_ABILITY_PATH);
    }
    void this.assets.load(TERRAIN_PROPS_ATLAS_PATH);
    void this.assets.load(TERRAIN_GRASS_ATLAS_PATH);
    for (const path of [BOSS_MOTION_PATH, BOSS_IMPACT_PATH, TITAN_ACTION_PATH, GROUND_TEXTURE_PATH]) void this.assets.load(path);
    this.canvas.style.imageRendering = 'pixelated';
    this.context.imageSmoothingEnabled = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  public resize(): void {
    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(240, window.innerHeight);
    this.pixelRatio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    this.presenter.resize(this.width, this.height, this.pixelRatio);
    this.camera.resize(this.width, this.height);
  }

  public size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public renderBackend(): RenderBackend {
    return this.presenter.backend;
  }

  public gpuStats(): GpuRenderStats {
    return this.presenter.stats();
  }

  public clearMenuBackground(): void {
    const ctx = this.context;
    ctx.fillStyle = '#031017';
    ctx.fillRect(0, 0, this.width, this.height);
    const gradient = ctx.createRadialGradient(this.width * 0.72, this.height * 0.4, 0, this.width * 0.72, this.height * 0.4, this.width * 0.7);
    gradient.addColorStop(0, 'rgba(48, 176, 166, .14)');
    gradient.addColorStop(1, 'rgba(3, 16, 23, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    this.presenter.present();
  }

  public render(scene: RenderScene): void {
    this.sceneTime = scene.time;
    this.groundOriginX = scene.terrain.originX;
    this.groundOriginY = scene.terrain.originY;
    this.reducedMotion = scene.settings.reducedParticles;
    const leftWorld = this.camera.x - this.width * 0.5 - this.camera.shakeX;
    const topWorld = this.camera.y - this.height * 0.5 - this.camera.shakeY;
    const gpuBackground = this.presenter.beginGpuFrame(
      scene.stage.theme.background,
      scene.stage.theme.accent,
      leftWorld,
      topWorld,
    );
    if (!gpuBackground) this.drawBackground(scene.stage);
    this.drawTerrainGround(scene.stage);
    this.drawTerrain(scene.terrain);
    this.drawEnvironmentMotion(scene);
    this.drawTelegraphs(scene);
    this.drawBossAbilityVisuals(scene);
    this.drawTitanGroundVfx(scene.player);
    this.drawUltimateField(scene);
    this.drawPersistentZones(scene);
    this.drawSpawnPortals(scene);
    this.drawLoot(scene);
    this.drawWeaponCompanions(scene);
    this.drawEnemies(scene);
    this.drawProjectiles(scene);
    this.drawAbilityCastCue(scene);
    this.drawParticles(scene);
    this.drawAtlasVfx(scene);
    if (scene.settings.damageNumbers) this.drawFloatingText(scene);
    this.drawBossDirectionIndicator(scene);
    this.drawScreenEdge(scene.player);
    this.presenter.present();
  }

  private addGroundRing(...args: Parameters<GpuCanvasPresenter['addGroundRing']>): boolean {
    // Textured ground is on the Canvas layer. Critical warnings must be above it.
    if (this.assets.get(GROUND_TEXTURE_PATH)) return false;
    return this.presenter.addGroundRing(...args);
  }

  private drawBackground(stage: StageConfig): void {
    const ctx = this.context;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#10181c';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = hexToRgba(stage.theme.background, 0.28);
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawTerrainGround(stage: StageConfig): void {
    const image = this.assets.get(GROUND_TEXTURE_PATH);
    if (!image) return;
    const ctx = this.context;
    const biome = terrainBiome(stage);
    let pattern = this.groundPatterns.get(biome);
    if (!pattern) {
      // Cache each material once; textures stay fixed to world coordinates.
      const tile = document.createElement('canvas');
      tile.width = tile.height = 640;
      const tileContext = tile.getContext('2d');
      if (!tileContext) return;
      const sw = image.naturalWidth / 2;
      const sh = image.naturalHeight / 2;
      tileContext.drawImage(image, biome % 2 * sw, Math.floor(biome / 2) * sh, sw, sh, 0, 0, 640, 640);
      pattern = ctx.createPattern(tile, 'repeat') ?? undefined;
      if (!pattern) return;
      this.groundPatterns.set(biome, pattern);
    }
    const offsetX = ((-this.camera.x - this.groundOriginX + this.width / 2 + this.camera.shakeX) % 640 + 640) % 640;
    const offsetY = ((-this.camera.y - this.groundOriginY + this.height / 2 + this.camera.shakeY) % 640 + 640) % 640;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = pattern;
    ctx.fillRect(-offsetX, -offsetY, this.width, this.height);
    ctx.restore();
    ctx.fillStyle = hexToRgba(stage.theme.background, 0.2);
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawTerrain(terrain: TerrainSystem): void {
    const propsAtlas = this.assets.get(TERRAIN_PROPS_ATLAS_PATH);
    const grassAtlas = this.assets.get(TERRAIN_GRASS_ATLAS_PATH);
    const ctx = this.context;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (propsAtlas) {
      for (const feature of terrain.features()) {
        if (feature.kind === 'water') this.drawTerrainFeature(propsAtlas, feature);
      }
    }

    if (grassAtlas) {
      const cellWidth = (grassAtlas.naturalWidth || grassAtlas.width) / GRASS_ATLAS_COLUMNS;
      const cellHeight = (grassAtlas.naturalHeight || grassAtlas.height) / GRASS_ATLAS_ROWS;
      for (const patch of terrain.decorations()) {
        if (!this.camera.isVisible(patch.x, patch.y, 52)) continue;
        const screen = this.camera.worldToScreen(patch.x, patch.y);
        const column = patch.variant % GRASS_ATLAS_COLUMNS;
        const row = Math.floor(patch.variant / GRASS_ATLAS_COLUMNS) % GRASS_ATLAS_ROWS;
        const size = Math.round(58 * patch.scale);
        ctx.save();
        ctx.translate(Math.round(screen.x), Math.round(screen.y));
        ctx.rotate(patch.rotation + (this.reducedMotion ? 0 : Math.sin(this.sceneTime * 1.5 + patch.x * 0.008) * 0.065));
        ctx.globalAlpha = 0.82;
        ctx.drawImage(
          grassAtlas,
          column * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          -size * 0.5,
          -size * 0.5,
          size,
          size,
        );
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private drawEnvironmentMotion(scene: RenderScene): void {
    const ctx = this.context;
    ctx.save();
    for (const feature of scene.terrain.features()) {
      if (feature.kind !== 'water' || !this.camera.isVisible(feature.x, feature.y, 120)) continue;
      const p = this.camera.worldToScreen(feature.x, feature.y);
      ctx.strokeStyle = '#bedfdf';
      ctx.lineWidth = 1;
      const phase = this.reducedMotion ? 0.4 : (scene.time * 0.35 + feature.id % 17 / 17) % 1;
      ctx.globalAlpha = (1 - phase) * 0.24;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, 12 + phase * 43, 5 + phase * 25, 0, 0, TAU);
      ctx.stroke();
    }
    // World anchored drifting motes; no allocation or particle-pool pressure.
    if (!this.reducedMotion) {
      ctx.fillStyle = scene.stage.theme.accent;
      const spacing = 230;
      const left = Math.floor((this.camera.x - this.width / 2) / spacing);
      const top = Math.floor((this.camera.y - this.height / 2) / spacing);
      for (let cy = top; cy <= top + Math.ceil(this.height / spacing); cy += 1) {
        for (let cx = left; cx <= left + Math.ceil(this.width / spacing); cx += 1) {
          const seed = Math.sin(cx * 127.1 + cy * 311.7);
          const p = this.camera.worldToScreen(cx * spacing + 115 + Math.sin(scene.time * 0.4 + seed * 10) * 32,
            cy * spacing + 90 + Math.cos(scene.time * 0.3 + seed * 8) * 24);
          ctx.globalAlpha = 0.12 + (1 + Math.sin(scene.time + seed * 30)) * 0.12;
          ctx.fillRect(p.x, p.y, 2, 2);
        }
      }
    }
    ctx.restore();
  }

  private drawTerrainFeature(atlas: HTMLImageElement, feature: TerrainFeature): void {
    const margin = feature.kind === 'water' ? 110 : 90;
    if (!this.camera.isVisible(feature.x, feature.y, margin)) return;
    const cellWidth = (atlas.naturalWidth || atlas.width) / TERRAIN_ATLAS_COLUMNS;
    const cellHeight = (atlas.naturalHeight || atlas.height) / TERRAIN_ATLAS_ROWS;
    const row = feature.kind === 'tree' ? 0 : feature.kind === 'rock' ? 1 : 2;
    const column = feature.kind === 'rock' ? [1, 2, 0, 3][feature.variant % 4]! : feature.variant % TERRAIN_ATLAS_COLUMNS;
    const screen = this.camera.worldToScreen(feature.x, feature.y);
    const width = feature.kind === 'water' ? 176 : feature.kind === 'tree' ? 118 : 104;
    const height = feature.kind === 'water' ? 122 : feature.kind === 'tree' ? 148 : 116;
    this.context.save();
    this.context.globalAlpha *= feature.kind === 'water' ? 0.9 : 1;
    if (feature.kind !== 'water') {
      this.context.fillStyle = '#02080d66';
      this.context.beginPath();
      this.context.ellipse(screen.x + 10, screen.y + 20, width * 0.43, 15, -0.15, 0, TAU);
      this.context.fill();
    }
    if (feature.kind === 'tree' && !this.reducedMotion) {
      this.context.translate(screen.x, screen.y + height * 0.2);
      this.context.rotate(Math.sin(this.sceneTime * 1.2 + feature.x * 0.004) * 0.016);
      this.context.translate(-screen.x, -screen.y - height * 0.2);
    }
    this.context.drawImage(
      atlas,
      column * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
      Math.round(screen.x - width * 0.5),
      Math.round(screen.y - height * (feature.kind === 'water' ? 0.5 : 0.68)),
      width,
      height,
    );
    this.context.restore();
  }

  private drawTelegraphs(scene: RenderScene): void {
    const ctx = this.context;
    const compact = this.width <= 560 || scene.settings.reducedParticles;
    scene.boss.telegraphs.forEachActive((telegraph) => {
      const screen = this.camera.worldToScreen(telegraph.x, telegraph.y);
      if (!this.camera.isVisible(telegraph.x, telegraph.y, telegraph.radius + 20)) return;
      const progress = 1 - telegraph.time / Math.max(0.001, telegraph.maxTime);
      ctx.save();
      if (telegraph.kind === 'circle') this.drawBossAbilityFrame(telegraph.bossId, 0, screen.x, screen.y, telegraph.radius * 2.05, 0.2 + progress * 0.2);
      else {
        for (let index = 0; index < 6; index += 1) {
          const angle = index / 6 * TAU;
          this.drawBossAbilityFrame(telegraph.bossId, 0, screen.x + Math.cos(angle) * telegraph.radius * 0.72,
            screen.y + Math.sin(angle) * telegraph.radius * 0.72, 64, 0.3 + progress * 0.2);
        }
      }
      if (telegraph.bossId === 'lord-infernus' && telegraph.time < 0.5) {
        const atlas = this.assets.get(BOSS_IMPACT_PATH);
        if (atlas) {
          const fall = 1 - telegraph.time / 0.5;
          ctx.save();
          ctx.globalAlpha = 0.9;
          this.drawMotionCell(atlas, 3, fall < 0.65 ? 0 : 1, 4, screen.x, screen.y - (1 - fall * fall) * 240, 92);
          ctx.restore();
        }
      }
      const warningColor = scene.settings.colorBlindMode === 'off' ? '#ff6746' : '#ffe36c';
      const imminentColor = '#fff1c1';
      ctx.globalAlpha = (compact ? 0.08 : 0.12) + progress * (compact ? 0.14 : 0.18);
      ctx.fillStyle = warningColor;
      if (telegraph.kind === 'circle') this.drawHatchedCircle(screen.x, screen.y, telegraph.radius, compact ? 22 : 13, compact ? 1 : 2);
      else this.drawHatchedAnnulus(screen.x, screen.y, telegraph.radius * 0.72, 84, compact ? 31 : 24);

      ctx.globalAlpha = 0.58 + progress * 0.4;
      const ringColor = progress > 0.72 ? imminentColor : warningColor;
      const ringAlpha = 0.58 + progress * 0.4;
      ctx.fillStyle = ringColor;
      if (!this.addGroundRing(
        telegraph.x,
        telegraph.y,
        telegraph.radius,
        3 + Math.round(progress * 3),
        compact ? 30 : 48,
        ringColor,
        ringAlpha,
      )) {
        this.drawPixelRing(screen.x, screen.y, telegraph.radius, 3 + Math.round(progress * 3), compact ? 30 : 48);
      }
      const closingRadius = Math.max(8, telegraph.radius * (1 - progress * 0.82));
      if (!this.addGroundRing(
        telegraph.x,
        telegraph.y,
        closingRadius,
        progress > 0.72 ? 4 : 2,
        compact ? 18 : 28,
        ringColor,
        ringAlpha,
      )) {
        this.drawPixelRing(screen.x, screen.y, closingRadius, progress > 0.72 ? 4 : 2, compact ? 18 : 28);
      }
      if (telegraph.kind === 'ring') {
        const innerColor = progress > 0.72 ? imminentColor : '#ffad58';
        ctx.fillStyle = innerColor;
        if (!this.addGroundRing(telegraph.x, telegraph.y, telegraph.radius * 0.72, 3, 40, innerColor, ringAlpha)) {
          this.drawPixelRing(screen.x, screen.y, telegraph.radius * 0.72, 3, 40);
        }
      }
      ctx.fillStyle = warningColor;
      const orbitMarks = compact ? 4 : 8;
      for (let index = 0; index < orbitMarks; index += 1) {
        const angle = index / orbitMarks * TAU + progress * 0.45;
        const radius = telegraph.radius * 0.45;
        ctx.fillRect(
          Math.round(screen.x + Math.cos(angle) * radius) - 2,
          Math.round(screen.y + Math.sin(angle) * radius) - 2,
          4,
          4,
        );
      }
      if (progress > 0.72) {
        const dangerSize = Math.max(7, Math.min(15, telegraph.radius * 0.12));
        this.drawHazardDiamond(screen.x, screen.y, dangerSize, imminentColor);
      }
      // Bốn nấc đếm ngược luôn đọc được bằng hình dạng, kể cả khi mù màu.
      const remainingPips = Math.max(1, 4 - Math.floor(progress * 4));
      for (let index = 0; index < 4; index += 1) {
        const angle = index / 4 * TAU - Math.PI / 2;
        const pipX = Math.round(screen.x + Math.cos(angle) * (telegraph.radius + 13));
        const pipY = Math.round(screen.y + Math.sin(angle) * (telegraph.radius + 13));
        ctx.fillStyle = index < remainingPips ? imminentColor : '#592b29';
        const size = index < remainingPips ? 6 : 3;
        ctx.fillRect(pipX - Math.round(size / 2), pipY - Math.round(size / 2), size, size);
      }
      ctx.restore();
    });

    const castCue = scene.boss.getCastCue();
    if (!castCue || !this.camera.isVisible(castCue.x, castCue.y, castCue.radius + 30)) return;
    const screen = this.camera.worldToScreen(castCue.x, castCue.y);
    const color = scene.settings.colorBlindMode === 'off' ? '#ffce6b' : '#fff3a3';
    const pulse = 1 + Math.sin(scene.time * 18) * 0.04;
    ctx.save();
    this.drawBossAbilityFrame(castCue.bossId, 0, screen.x, screen.y, castCue.radius * 2.2, 0.34 + castCue.progress * 0.36);
    const castAlpha = 0.58 + castCue.progress * 0.4;
    ctx.globalAlpha = castAlpha;
    ctx.fillStyle = '#140b08';
    if (!this.addGroundRing(castCue.x, castCue.y, castCue.radius * pulse + 3, 6, 28, '#140b08', castAlpha)) {
      this.drawPixelRing(screen.x, screen.y, castCue.radius * pulse + 3, 6, 28);
    }
    ctx.fillStyle = color;
    if (!this.addGroundRing(
      castCue.x,
      castCue.y,
      castCue.radius * pulse,
      3 + Math.round(castCue.progress * 3),
      28,
      color,
      castAlpha,
    )) {
      this.drawPixelRing(screen.x, screen.y, castCue.radius * pulse, 3 + Math.round(castCue.progress * 3), 28);
    }
    const castRays = compact ? 4 : 6;
    for (let index = 0; index < castRays; index += 1) {
      const angle = index / castRays * TAU - scene.time * 1.8;
      const outer = castCue.radius + 18;
      const inner = castCue.radius * (0.72 - castCue.progress * 0.2);
      this.drawSteppedLine(
        screen.x + Math.cos(angle) * outer,
        screen.y + Math.sin(angle) * outer,
        screen.x + Math.cos(angle) * inner,
        screen.y + Math.sin(angle) * inner,
        3 + castCue.phase,
        6,
      );
    }
    ctx.fillStyle = '#fff7d6';
    const warningSize = 5 + castCue.phase;
    ctx.fillRect(Math.round(screen.x - warningSize / 2), Math.round(screen.y - warningSize * 1.3), warningSize, warningSize * 2);
    ctx.fillRect(Math.round(screen.x - warningSize / 2), Math.round(screen.y + warningSize * 1.25), warningSize, warningSize);
    ctx.restore();
  }

  private drawBossAbilityVisuals(scene: RenderScene): void {
    for (const visual of scene.boss.getAbilityVisuals()) {
      if (!this.camera.isVisible(visual.x, visual.y, visual.radius + 40)) continue;
      const screen = this.camera.worldToScreen(visual.x, visual.y);
      const progress = 1 - visual.time / Math.max(0.001, visual.maxTime);
      const pulse = 0.82 + Math.sin(progress * Math.PI) * 0.28;
      if (visual.kind === 'ring') {
        // The center is a safe pocket: the ice erupts on the damaging annulus.
        for (let index = 0; index < 8; index += 1) {
          const angle = index / 8 * TAU;
          this.drawBossAbilityFrame(visual.bossId, 1,
            screen.x + Math.cos(angle) * visual.radius * 0.72,
            screen.y + Math.sin(angle) * visual.radius * 0.72,
            106, (1 - progress) * 0.88, progress);
        }
        continue;
      }
      this.drawBossAbilityFrame(
        visual.bossId,
        1,
        screen.x,
        screen.y,
        visual.radius * 2.35 * pulse,
        Math.sin(Math.min(1, progress) * Math.PI) * 0.92,
        progress,
      );
    }
  }

  private drawUltimateField(scene: RenderScene): void {
    if (scene.player.character.id === 'titan' && 5 - scene.player.ultimateActive < TITAN_FALL_IMPACT) return;
    const player = scene.player;
    if (player.ultimateActive <= 0) return;
    const screen = this.camera.worldToScreen(player.x, player.y);
    const x = Math.round(screen.x);
    const y = Math.round(screen.y);
    const kind = player.character.ultimate?.kind ?? 'rift-storm';
    const pulse = 1 + Math.sin(scene.time * 7) * 0.035;
    const sparse = scene.settings.reducedParticles;
    const ctx = this.context;
    ctx.save();

    switch (kind) {
      case 'arrow-rain': {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#fff0a0';
        const count = sparse ? 5 : 9;
        for (let index = 0; index < count; index += 1) {
          const lane = index - (count - 1) * 0.5;
          const fall = (scene.time * 210 + index * 53) % 230;
          const arrowX = x + lane * 34 + Math.round(Math.sin(index * 2.1) * 13);
          const arrowY = y - 150 + fall;
          this.drawSteppedLine(arrowX - 12, arrowY - 34, arrowX + 2, arrowY, 3, 5);
          ctx.fillRect(arrowX - 5, arrowY - 5, 5, 3);
          ctx.fillRect(arrowX, arrowY - 5, 5, 3);
        }
        ctx.globalAlpha = 0.24;
        this.drawPixelRing(x, y, 210 * pulse, 2, 48);
        break;
      }
      case 'forgequake':
        this.drawVfxFrame(1, Math.floor(scene.time * 10) % 6, x, y, Math.round(188 * pulse), 0.23);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff9a52';
        this.drawRadialCracks(x, y, 205 * pulse, sparse ? 7 : 11, scene.time * 0.18, 4);
        break;
      case 'elemental-tempest': {
        const count = sparse ? 3 : 4;
        for (let row = 0; row < count; row += 1) {
          const angle = row / 4 * TAU + scene.time * 0.72;
          this.drawVfxFrame(row, Math.floor(scene.time * 9 + row) % 6, x + Math.cos(angle) * 112, y + Math.sin(angle) * 112, 72, 0.38);
        }
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#eefcff';
        this.drawPixelRing(x, y, 185 * pulse, 3, 40);
        break;
      }
      case 'plague-night': {
        this.drawVfxFrame(3, 5 - Math.floor(scene.time * 8) % 6, x, y, 176, 0.25);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#73e77d';
        const count = sparse ? 8 : 14;
        for (let index = 0; index < count; index += 1) {
          const angle = index / count * TAU + scene.time * 0.24;
          const radius = 80 + index % 3 * 42;
          const size = 3 + index % 3;
          ctx.fillRect(
            Math.round(x + Math.cos(angle) * radius - size / 2),
            Math.round(y + Math.sin(angle) * radius - size / 2 - Math.sin(scene.time * 3 + index) * 7),
            size,
            size,
          );
        }
        ctx.globalAlpha = 0.2;
        this.drawPixelRing(x, y, 212 * pulse, 3, 44);
        break;
      }
      case 'echo-legion': {
        this.drawVfxFrame(3, Math.floor(scene.time * 8) % 6, x, y, 166, 0.22);
        const count = sparse ? 4 : 7;
        for (let index = 0; index < count; index += 1) {
          const angle = index / count * TAU - scene.time * 0.55;
          ctx.save();
          ctx.translate(Math.round(x + Math.cos(angle) * 142), Math.round(y + Math.sin(angle) * 142));
          ctx.globalAlpha = 0.34;
          this.drawPixelDiamond(7, '#b978e8', '#f0c9ff');
          ctx.restore();
        }
        break;
      }
      case 'titanfall':
        this.drawVfxFrame(4, Math.floor(scene.time * 8) % 6, x, y, Math.round(216 * pulse), 0.28);
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#ffd67d';
        this.drawPixelRing(x, y, 218 * pulse, 5, 36);
        this.drawRadialCracks(x, y, 190 * pulse, sparse ? 8 : 14, 0.05, 5);
        break;
      case 'void-collapse': {
        this.drawVfxFrame(3, 5 - Math.floor(scene.time * 10) % 6, x, y, Math.round(224 * pulse), 0.38);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#d58aff';
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = 190 - ((scene.time * 82 + ring * 62) % 170);
          this.drawPixelRing(x, y, Math.max(18, radius), 2 + ring, 28);
        }
        break;
      }
      default:
        this.drawVfxFrame(0, Math.floor(scene.time * 11) % 6, x, y, Math.round(192 * pulse), 0.3);
        this.drawVfxFrame(3, Math.floor(scene.time * 8 + 2) % 6, x, y, Math.round(145 * pulse), 0.19);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#8eeeff';
        this.drawPixelRing(x, y, 205 * pulse, 3, 44);
        this.drawRadialCracks(x, y, 185 * pulse, sparse ? 7 : 12, scene.time * 0.7, 3);
        break;
    }
    ctx.restore();
  }

  private drawPersistentZones(scene: RenderScene): void {
    const ctx = this.context;
    scene.projectiles.pool.forEachActive((projectile) => {
      if (!projectile.persistent || !this.camera.isVisible(projectile.x, projectile.y, projectile.radius + 30)) return;
      const screen = this.camera.worldToScreen(projectile.x, projectile.y);
      if (projectile.sourceWeaponId === TOXIC_SMOKE_WEAPON_ID && projectile.element === 'poison') {
        const toxicPulse = 0.985 + Math.sin(scene.time * 4 + projectile.id) * 0.015;
        const radius = Math.round(projectile.radius * toxicPulse);
        this.drawToxicSmokeZone(scene, projectile, screen.x, screen.y, radius);
        return;
      }
      const pulse = 0.82 + Math.sin(scene.time * 4 + projectile.id) * 0.08;
      const radius = Math.round(projectile.radius * pulse);
      const row = ELEMENT_VFX_ROW[projectile.element];
      if (row !== undefined) {
        const frame = Math.floor(scene.time * 11 + projectile.id) % 6;
        this.drawVfxFrame(
          row,
          frame,
          screen.x,
          screen.y,
          Math.min(210, Math.max(42, radius * 1.5)),
          projectile.element === 'arcane' ? 0.11 : 0.24,
        );
      } else if (projectile.element === 'poison') {
        const frame = Math.floor(scene.time * 9 + projectile.id) % 6;
        this.drawStatusVfxFrame(0, frame, screen.x, screen.y, Math.min(220, Math.max(52, radius * 1.65)), 0.28);
      }
      ctx.save();
      const ringColor = projectile.element === 'arcane' ? '#6ac7e8' : projectile.color;
      const ringSegments = Math.min(64, Math.max(24, Math.round(radius / 3)));
      ctx.fillStyle = ringColor;
      ctx.globalAlpha = 0.68;
      if (!this.addGroundRing(projectile.x, projectile.y, radius, 3, ringSegments, ringColor, 0.68)) {
        this.drawPixelRing(screen.x, screen.y, radius, 3, ringSegments);
      }
      if (projectile.element === 'poison') {
        ctx.globalAlpha = 0.38;
        for (let index = 0; index < 10; index += 1) {
          const angle = index / 10 * TAU + scene.time * 0.2;
          const distance = radius * (0.28 + (index % 3) * 0.18);
          ctx.fillRect(
            Math.round(screen.x + Math.cos(angle) * distance) - 2,
            Math.round(screen.y + Math.sin(angle) * distance) - 2,
            4,
            4,
          );
        }
      }
      ctx.restore();
    });
  }

  private drawToxicSmokeZone(
    scene: RenderScene,
    projectile: Projectile,
    centerX: number,
    centerY: number,
    radius: number,
  ): void {
    const ctx = this.context;
    const tickRate = Math.max(0.25, projectile.tickRate || 1);
    const tickProgress = 1 - clamp(projectile.tickTimer / tickRate, 0, 1);
    const pulseWindow = tickProgress < 0.14;
    const loopFrame = pulseWindow ? 2 : tickProgress < 0.42 ? 0 : tickProgress < 0.72 ? 1 : 3;
    const drawSize = Math.min(360, Math.max(72, radius * 2.05));
    // Atlas có lõi rỗng; alpha được giữ thấp để đạn và telegraph nguy hiểm vẽ
    // sau vùng khói luôn nổi phía trên.
    const usedAtlas = this.drawToxicSmokeFrame(1, loopFrame, centerX, centerY, drawSize, pulseWindow ? 0.31 : 0.23);
    const age = Math.max(0, projectile.maxLife - projectile.life);
    if (age < 0.18) {
      const burstFrame = age < 0.06 ? 2 : 3;
      this.drawToxicSmokeFrame(0, burstFrame, centerX, centerY, Math.min(260, drawSize * 0.72), 0.46 * (1 - age / 0.18));
    }

    ctx.save();
    const rimSegments = scene.settings.reducedParticles ? 24 : 40;
    ctx.globalAlpha = 0.74;
    ctx.fillStyle = '#0b2618';
    this.drawPixelRing(centerX, centerY, radius + 3, 5, rimSegments);
    ctx.globalAlpha = 0.84;
    ctx.fillStyle = '#8bd43f';
    this.drawPixelRing(centerX, centerY, radius, 3, rimSegments);

    // Bốn nấc vuông là mã hình học cố định của vùng độc, không phụ thuộc màu.
    for (let index = 0; index < 4; index += 1) {
      const angle = index / 4 * TAU;
      const notchX = Math.round(centerX + Math.cos(angle) * radius);
      const notchY = Math.round(centerY + Math.sin(angle) * radius);
      ctx.fillStyle = '#eaffb5';
      ctx.fillRect(notchX - 4, notchY - 4, 8, 8);
      ctx.fillStyle = '#17351d';
      ctx.fillRect(notchX - 2, notchY - 2, 4, 4);
    }

    // Lõi thưa để người chơi vẫn theo dõi được quái, vật phẩm và đạn.
    const motes = scene.settings.reducedParticles ? 5 : 9;
    ctx.globalAlpha = usedAtlas ? 0.25 : 0.38;
    for (let index = 0; index < motes; index += 1) {
      const angle = index / motes * TAU + projectile.id * 0.31 + scene.time * 0.12;
      const distance = radius * (0.22 + (index % 3) * 0.17);
      const size = index % 3 === 0 ? 5 : 3;
      const x = Math.round(centerX + Math.cos(angle) * distance);
      const y = Math.round(centerY + Math.sin(angle) * distance);
      ctx.fillStyle = index % 2 === 0 ? '#d6ff73' : '#4a9c40';
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
    }
    if (pulseWindow) {
      const pulseRatio = tickProgress / 0.14;
      ctx.globalAlpha = (1 - pulseRatio) * 0.78;
      ctx.fillStyle = '#f0ff9e';
      this.drawPixelRing(centerX, centerY, radius * (0.58 + pulseRatio * 0.38), 4, 32);
    }
    ctx.restore();
  }

  private drawLoot(scene: RenderScene): void {
    const ctx = this.context;
    scene.loot.pool.forEachActive((pickup) => {
      if (!this.camera.isVisible(pickup.x, pickup.y, 30)) return;
      const screen = this.camera.worldToScreen(pickup.x, pickup.y);
      const bob = Math.round(Math.sin(scene.time * 5 + pickup.id) * 3);
      ctx.save();
      ctx.translate(Math.round(screen.x), Math.round(screen.y) + bob);
      ctx.fillStyle = 'rgba(3, 9, 12, .82)';
      ctx.fillRect(-pickup.radius - 4, -pickup.radius - 4, pickup.radius * 2 + 8, pickup.radius * 2 + 8);
      ctx.fillStyle = pickup.color;
      if (pickup.type === 'chest') {
        ctx.fillStyle = '#23152f';
        ctx.fillRect(-14, -10, 28, 22);
        ctx.fillStyle = pickup.color;
        ctx.fillRect(-12, -8, 24, 18);
        ctx.fillStyle = '#e7bb63';
        ctx.fillRect(-12, -2, 24, 4);
        ctx.fillRect(-2, -8, 4, 18);
        ctx.fillStyle = '#fff2b2';
        ctx.fillRect(-2, -1, 4, 5);
      } else if (pickup.type === 'heal') {
        ctx.fillStyle = '#ecfff3';
        ctx.fillRect(-3, -10, 6, 20);
        ctx.fillRect(-10, -3, 20, 6);
        ctx.fillStyle = '#50d57a';
        ctx.fillRect(-2, -8, 4, 16);
        ctx.fillRect(-8, -2, 16, 4);
      } else if (pickup.type === 'gold') {
        this.drawPixelDiamond(9, '#f2c45f', '#fff0a0');
      } else if (pickup.type === 'magnet') {
        ctx.fillStyle = '#9fe5ff';
        ctx.fillRect(-9, -9, 5, 15);
        ctx.fillRect(4, -9, 5, 15);
        ctx.fillRect(-5, 2, 10, 5);
        ctx.fillStyle = '#f4fbff';
        ctx.fillRect(-9, -9, 5, 4);
        ctx.fillRect(4, -9, 5, 4);
      } else if (pickup.type === 'fury') {
        this.drawVfxFrame(1, Math.floor(scene.time * 12 + pickup.id) % 6, 0, 0, 30, 0.9);
      } else if (pickup.type === 'skill-crit-shard') {
        this.drawPixelDiamond(12, '#ff4fd8', '#ffffff');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, -10, 4, 20);
        ctx.fillRect(-10, -2, 20, 4);
      } else if (pickup.type === 'stat-shard') {
        this.drawPixelDiamond(10, '#f5f2de', '#86f4ef');
      } else {
        this.drawPixelDiamond(Math.max(7, pickup.radius), pickup.color, '#efffff');
      }
      ctx.restore();
    });
  }

  private drawEnemies(scene: RenderScene): void {
    const ctx = this.context;
    const aftermathLimit = scene.player.bossAftermathActive() ? 320 : Number.POSITIVE_INFINITY;
    let renderedEnemies = 0;
    const crowded = scene.enemies.pool.countActive() > 240;
    const detailRadius = scene.settings.reducedParticles ? 280 : crowded ? 320 : 520;
    const detailRadiusSquared = detailRadius * detailRadius;
    const toxicZones: Projectile[] = [];
    for (const projectile of scene.projectiles.pool.allItems()) {
      if (projectile.active && projectile.persistent && projectile.sourceWeaponId === TOXIC_SMOKE_WEAPON_ID) {
        toxicZones.push(projectile);
      }
    }
    const props = this.assets.get(TERRAIN_PROPS_ATLAS_PATH);
    this.depthQueue.length = 0;
    for (const enemy of scene.enemies.pool.allItems()) {
      if (enemy.active && this.camera.isVisible(enemy.x, enemy.y, enemy.radius * 4)) this.depthQueue.push(enemy);
    }
    for (const feature of scene.terrain.features()) {
      if (feature.kind !== 'water' && this.camera.isVisible(feature.x, feature.y, 150)) this.depthQueue.push(feature);
    }
    this.depthQueue.push(scene.player);
    this.depthQueue.sort((left, right) => left.y - right.y);
    for (const actor of this.depthQueue) {
      if ('character' in actor) {
        this.drawPlayer(actor, scene.time, scene.settings.reducedParticles);
        continue;
      }
      if (!('config' in actor)) {
        if (props) {
          ctx.save();
          if (scene.player.y < actor.y && Math.abs(scene.player.x - actor.x) < 80
            && actor.y - scene.player.y < 130) ctx.globalAlpha = 0.42;
          this.drawTerrainFeature(props, actor);
          ctx.restore();
        }
        continue;
      }
      const enemy = actor;
      if (!enemy.active) continue;
      const screen = this.camera.worldToScreen(enemy.x, enemy.y);
      const margin = enemy.radius * 4;
      if (screen.x < -margin || screen.x > this.width + margin || screen.y < -margin || screen.y > this.height + margin) continue;
      if (renderedEnemies >= aftermathLimit) continue;
      renderedEnemies += 1;
      const image = this.assets.get(enemy.config.sprite);
      const bossMotion = enemy.isBoss ? this.assets.get(BOSS_MOTION_PATH) : null;
      const dedicatedBoss = enemy.isBoss && enemy.config.id === 'void-devourer'
        ? this.assets.get(VOID_DEVOURER_SPRITE_PATH)
        : null;
      const bossAtlas = enemy.isBoss && !dedicatedBoss ? this.assets.get(BOSS_CHARACTER_ATLAS_PATH) : null;
      const size = Math.round(enemy.radius * (enemy.isBoss ? 3.5 : enemy.isElite ? 3.1 : 2.65));
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      const distanceX = enemy.x - scene.player.x;
      const distanceY = enemy.y - scene.player.y;
      const distance = Math.max(0.001, Math.hypot(distanceX, distanceY));
      const towardPlayerX = -distanceX / distance;
      const towardPlayerY = -distanceY / distance;
      const detailed = enemy.isBoss || enemy.isElite || distanceX * distanceX + distanceY * distanceY <= detailRadiusSquared;
      const motion = Math.hypot(enemy.vx, enemy.vy);
      const walkPhase = scene.time * Math.min(12, 5.2 + motion * 0.018) + enemy.id * 0.71;
      const walkAmount = detailed ? clamp(motion / Math.max(1, enemy.speed), 0, 1) : 0;
      const walkBob = enemy.flashTimer > 0 ? 0 : Math.sin(walkPhase) * walkAmount * (enemy.isBoss ? 1.2 : 2);
      const contactRecovery = clamp((enemy.contactTimer - (enemy.isBoss ? 0.37 : 0.54)) / (enemy.isBoss ? 0.23 : 0.28), 0, 1);
      const contactWindup = enemy.contactTimer <= 0
        ? clamp(1 - (distance - enemy.radius - scene.player.radius) / 48, 0, 1) * 0.4
        : 0;
      const attackRatio = enemy.attackTimer / Math.max(0.1, enemy.config.attackCooldown);
      const rangedRecoil = RANGED_RECOIL_AI.has(enemy.config.ai)
        ? clamp((attackRatio - 0.78) / 0.22, 0, 1)
        : 0;
      const chargeStretch = enemy.config.ai === 'charger' ? clamp(enemy.stateTimer / 0.48, 0, 1) : 0;
      const hitHold = clamp(enemy.flashTimer / (enemy.flashTimer > 0.1 ? 0.16 : 0.08), 0, 1);
      const attackMotion = Math.max(contactRecovery, contactWindup, rangedRecoil * 0.65, chargeStretch);
      const lunge = (contactRecovery * 0.9 + contactWindup * 0.3 + chargeStretch * 0.38) * enemy.radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = enemy.alpha;
      ctx.fillStyle = '#01050988';
      ctx.beginPath();
      ctx.ellipse(4, enemy.radius * 0.6, enemy.radius * 1.25, enemy.radius * 0.38, 0, 0, TAU);
      ctx.fill();
      if (enemy.isBoss || enemy.isElite) {
        ctx.fillStyle = enemy.isBoss ? '#ffd76d' : '#e192ff';
        this.drawPixelRing(0, Math.round(enemy.radius * 0.42), enemy.radius + (enemy.isBoss ? 10 : 7), enemy.isBoss ? 4 : 3, enemy.isBoss ? 24 : 16);
      } else {
        ctx.fillStyle = '#031014';
        ctx.fillRect(-enemy.radius - 5, Math.round(enemy.radius * 0.55), enemy.radius * 2 + 10, 6);
        ctx.fillStyle = '#ff7869';
        ctx.fillRect(-enemy.radius - 2, Math.round(enemy.radius * 0.55) + 2, enemy.radius * 2 + 4, 2);
      }
      if (detailed) this.drawEnemyStatusAura(enemy, scene.time, size);
      if (detailed && enemy.status.poisonCloudTime > 0 && enemy.status.slowTime > 0) {
        const insideToxicZone = toxicZones.some((zone) => {
          const offsetX = enemy.x - zone.x;
          const offsetY = enemy.y - zone.y;
          return offsetX * offsetX + offsetY * offsetY <= zone.radius * zone.radius;
        });
        if (!insideToxicZone) this.drawPoisonResidualCue(enemy, scene.time);
      }
      ctx.save();
      const squashWave = enemy.flashTimer > 0 ? 0 : Math.sin(walkPhase * 2) * walkAmount * 0.025;
      ctx.translate(Math.round(towardPlayerX * lunge), Math.round(towardPlayerY * lunge + walkBob));
      ctx.scale(
        1 + attackMotion * 0.14 + chargeStretch * 0.08 + hitHold * 0.05 - squashWave,
        1 - attackMotion * 0.09 - hitHold * 0.04 + squashWave,
      );
      ctx.globalAlpha = enemy.alpha;
      if (bossMotion) {
        const frame = scene.boss.animationFrame(scene.time, motion > 4);
        ctx.save();
        if (towardPlayerX < -0.05) ctx.scale(-1, 1);
        this.drawMotionCell(bossMotion, BOSS_ATLAS_INDEX[enemy.config.id] ?? 0, frame, 4, 0, 0, size * 1.18, 0.58);
        if (enemy.flashTimer > 0) {
          ctx.globalAlpha *= 0.55;
          ctx.filter = 'brightness(2)';
          this.drawMotionCell(bossMotion, BOSS_ATLAS_INDEX[enemy.config.id] ?? 0, frame, 4, 0, 0, size * 1.18, 0.58);
        }
        ctx.restore();
      } else if (dedicatedBoss) {
        this.drawContainedSprite(dedicatedBoss, size * 1.28);
        if (enemy.flashTimer > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.82, enemy.flashTimer * 6.4);
          ctx.filter = 'brightness(4) saturate(0)';
          this.drawContainedSprite(dedicatedBoss, size * 1.28);
          ctx.restore();
        }
      } else if (bossAtlas && BOSS_ATLAS_INDEX[enemy.config.id] !== undefined) {
        this.drawBossCharacterFrame(bossAtlas, enemy.config.id, size);
        if (enemy.flashTimer > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.82, enemy.flashTimer * 6.4);
          ctx.filter = 'brightness(4) saturate(0)';
          this.drawBossCharacterFrame(bossAtlas, enemy.config.id, size);
          ctx.restore();
        }
      } else if (image) {
        ctx.drawImage(image, Math.round(-size / 2), Math.round(-size / 2), size, size);
        if (enemy.flashTimer > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.82, enemy.flashTimer * 6.4);
          ctx.filter = 'brightness(4) saturate(0)';
          ctx.drawImage(image, Math.round(-size / 2), Math.round(-size / 2), size, size);
          ctx.restore();
        }
      } else {
        const fallbackColor = enemy.isBoss ? '#e7bb63' : enemy.isElite ? '#c879ff' : '#82a9aa';
        this.drawPixelDiamond(enemy.radius, fallbackColor, '#f8ffff');
      }
      if (detailed && rangedRecoil > 0.05) {
        const muzzleRow = ELEMENT_VFX_ROW[enemy.config.element ?? 'physical'] ?? 4;
        this.drawVfxFrame(
          muzzleRow,
          Math.min(5, Math.floor((1 - rangedRecoil) * 6)),
          towardPlayerX * enemy.radius * 1.2,
          towardPlayerY * enemy.radius * 1.2,
          enemy.radius * 2.2,
          rangedRecoil * 0.82,
        );
      }
      if (detailed && (contactRecovery > 0.04 || chargeStretch > 0.12)) {
        const strike = Math.max(contactRecovery, chargeStretch * 0.68);
        ctx.fillStyle = enemy.isBoss || enemy.isElite ? '#ffdb7f' : '#ff846f';
        const startX = towardPlayerX * enemy.radius * 0.5 - towardPlayerY * enemy.radius * 0.45;
        const startY = towardPlayerY * enemy.radius * 0.5 + towardPlayerX * enemy.radius * 0.45;
        const endX = towardPlayerX * enemy.radius * (1.7 + strike * 0.5) + towardPlayerY * enemy.radius * 0.42;
        const endY = towardPlayerY * enemy.radius * (1.7 + strike * 0.5) - towardPlayerX * enemy.radius * 0.42;
        this.drawSteppedLine(startX, startY, endX, endY, Math.max(2, enemy.radius * 0.2 * strike), 4);
      }
      ctx.restore();
      if (enemy.flashTimer > 0) {
        ctx.globalAlpha = Math.min(0.9, enemy.flashTimer * 7);
        ctx.fillStyle = '#ffffff';
        const hitSize = Math.max(3, Math.round(enemy.radius * 0.22));
        ctx.fillRect(-hitSize, -enemy.radius, hitSize * 2, hitSize);
        ctx.fillRect(-hitSize, enemy.radius - hitSize, hitSize * 2, hitSize);
        ctx.fillRect(-enemy.radius, -hitSize, hitSize, hitSize * 2);
        ctx.fillRect(enemy.radius - hitSize, -hitSize, hitSize, hitSize * 2);
      }
      ctx.restore();

      const healthRatio = clamp(enemy.health / Math.max(1, enemy.maxHealth), 0, 1);
      const barY = Math.round(y - size * 0.55 - 10);
      if (enemy.isBoss || enemy.isElite || (detailed && healthRatio < 0.96)) {
        const width = enemy.isBoss ? 100 : enemy.isElite ? 58 : 34;
        const left = Math.round(x - width / 2);
        ctx.fillStyle = '#04080a';
        ctx.fillRect(left - 2, barY - 2, width + 4, 9);
        ctx.fillStyle = '#2e181a';
        ctx.fillRect(left, barY, width, 5);
        ctx.fillStyle = enemy.isBoss ? '#e7bb63' : enemy.isElite ? '#c879ff' : '#ef716a';
        ctx.fillRect(left, barY, Math.round(width * healthRatio), 5);
        if (enemy.shield > 0) {
          ctx.fillStyle = '#72d8ff';
          ctx.fillRect(left, barY + 7, Math.round(width * clamp(enemy.shield / (enemy.maxHealth * 0.35), 0, 1)), 3);
        }
      }
      // Quái thường đã có gạch chân phe địch dưới chân. Chỉ giữ marker lớn cho
      // elite/boss để tránh biến cả màn hình thành một lớp "confetti" đỏ.
      if (enemy.isBoss || enemy.isElite) {
        this.drawEnemyMarker(enemy, x, barY - (enemy.isBoss ? 17 : 12));
      }
      if (detailed) this.drawEnemyStatusIcons(enemy, x, Math.round(y + size * 0.52 + 7), scene.time);
    }
  }

  private drawBossCharacterFrame(image: HTMLImageElement, bossId: string, size: number): void {
    const column = BOSS_ATLAS_INDEX[bossId];
    if (column === undefined) return;
    const sourceWidth = (image.naturalWidth || image.width) / BOSS_ATLAS_COLUMNS;
    const sourceHeight = image.naturalHeight || image.height;
    const height = size * 1.22;
    const width = height * sourceWidth / sourceHeight;
    this.context.drawImage(
      image,
      column * sourceWidth,
      0,
      sourceWidth,
      sourceHeight,
      Math.round(-width / 2),
      Math.round(-height / 2),
      Math.round(width),
      Math.round(height),
    );
  }

  private drawContainedSprite(image: HTMLImageElement, size: number): void {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = size / Math.max(1, Math.max(sourceWidth, sourceHeight));
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    this.context.drawImage(image, Math.round(-width / 2), Math.round(-height / 2), Math.round(width), Math.round(height));
  }

  private drawMotionCell(image: HTMLImageElement, row: number, frame: number, rows: number,
    x: number, y: number, size: number, anchor = 0.5): void {
    const sw = image.naturalWidth / 6;
    const sh = image.naturalHeight / rows;
    // Titan's landing poses extend into the padding above its effect row.
    // Omit that padding while retaining the original ground anchor and scale.
    const topInset = rows === 3 && row === 2 ? 0.09 : 0;
    this.context.drawImage(image, clamp(frame, 0, 5) * sw, (row + topInset) * sh, sw, sh * (1 - topInset),
      Math.round(x - size / 2), Math.round(y - size * (anchor - topInset)), Math.round(size), Math.round(size * (1 - topInset)));
  }

  private drawBossAbilityFrame(
    bossId: string,
    row: number,
    x: number,
    y: number,
    size: number,
    alpha: number,
    progress = 0,
  ): void {
    const motion = this.assets.get(BOSS_IMPACT_PATH);
    const bossRow = BOSS_ATLAS_INDEX[bossId];
    if (motion && bossRow !== undefined) {
      this.context.save();
      this.context.globalAlpha = clamp(alpha, 0, 1);
      this.drawMotionCell(motion, bossRow, row === 0 ? 0 : Math.min(5, 2 + Math.floor(progress * 4)), 4, x, y, size);
      this.context.restore();
      return;
    }
    const dedicated = bossId === 'void-devourer' ? this.assets.get(VOID_DEVOURER_ABILITY_PATH) : null;
    if (dedicated) {
      const ctx = this.context;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(dedicated, Math.round(x - size / 2), Math.round(y - size / 2), Math.round(size), Math.round(size));
      ctx.restore();
      return;
    }
    const image = this.assets.get(BOSS_ABILITY_ATLAS_PATH);
    const column = BOSS_ATLAS_INDEX[bossId];
    if (!image || column === undefined) return;
    const sourceWidth = (image.naturalWidth || image.width) / BOSS_ATLAS_COLUMNS;
    const sourceHeight = (image.naturalHeight || image.height) / BOSS_ABILITY_ROWS;
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(
      image,
      column * sourceWidth,
      Math.max(0, Math.min(BOSS_ABILITY_ROWS - 1, row)) * sourceHeight,
      sourceWidth,
      sourceHeight,
      Math.round(x - size / 2),
      Math.round(y - size / 2),
      Math.round(size),
      Math.round(size),
    );
    ctx.restore();
  }

  private drawSpawnPortals(scene: RenderScene): void {
    const motion = this.assets.get(BOSS_IMPACT_PATH);
    const image = motion ? null : this.assets.get(VOID_DEVOURER_ABILITY_PATH);
    const ctx = this.context;
    for (const enemy of scene.enemies.pool.allItems()) {
      if (!enemy.active || enemy.spawnPortalTime <= 0 || !this.camera.isVisible(enemy.x, enemy.y, enemy.radius * 4)) continue;
      const screen = this.camera.worldToScreen(enemy.x, enemy.y);
      const progress = 1 - enemy.spawnPortalTime / Math.max(0.001, enemy.spawnPortalDuration);
      const size = Math.max(46, enemy.radius * (enemy.isBoss ? 5.8 : 4.1)) * (0.72 + progress * 0.28);
      ctx.save();
      ctx.globalAlpha = 0.46 + (1 - progress) * 0.3;
      if (motion) this.drawMotionCell(motion, 0, Math.min(5, Math.floor(progress * 6)), 4, screen.x, screen.y, size);
      else if (image) ctx.drawImage(image, Math.round(screen.x - size / 2), Math.round(screen.y - size / 2), Math.round(size), Math.round(size));
      else {
        ctx.fillStyle = '#b45cff';
        this.drawPixelRing(screen.x, screen.y, size * 0.42, 4, 28);
      }
      ctx.restore();
    }
  }

  private drawProjectiles(scene: RenderScene): void {
    const ctx = this.context;
    const aftermathLimit = scene.player.bossAftermathActive() ? 140 : Number.POSITIVE_INFINITY;
    let renderedProjectiles = 0;
    scene.projectiles.pool.forEachActive((projectile) => {
      if (projectile.persistent || !this.camera.isVisible(projectile.x, projectile.y, 40)) return;
      if (renderedProjectiles >= aftermathLimit) return;
      renderedProjectiles += 1;
      const screen = this.camera.worldToScreen(projectile.x, projectile.y);
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      const speed = Math.max(0.001, Math.hypot(projectile.vx, projectile.vy));
      const directionX = projectile.vx / speed;
      const directionY = projectile.vy / speed;
      const hostile = projectile.faction === 'enemy';
      const dangerous = !hostile || projectile.canHitPlayer;
      const combatTier = combatCueTier(projectile.sourceWeaponId);
      const toxicBomb = !hostile && projectile.sourceWeaponId === TOXIC_SMOKE_WEAPON_ID;
      const aegisSniperRay = !hostile && projectile.sourceWeaponId === 'aegis-orbit';
      const echoSpiritRay = !hostile && projectile.sourceWeaponId === 'echo-summon';
      const projectileAtlasIndex = !hostile && !aegisSniperRay && !echoSpiritRay ? PROJECTILE_ATLAS_INDEX[projectile.sourceWeaponId] : undefined;
      const hasProjectileAtlasSprite = projectileAtlasIndex !== undefined && this.assets.get(PROJECTILE_ATLAS_PATH) !== null;
      if (toxicBomb && !hasProjectileAtlasSprite) {
        const travelProgress = clamp(projectile.travelled / Math.max(1, projectile.maxRange), 0, 1);
        const frame = travelProgress < 0.76 ? 0 : travelProgress < 0.93 ? 1 : 2;
        const size = Math.max(44, Math.min(96, projectile.radius * 7));
        this.drawToxicSmokeFrame(0, frame, x, y, size, 0.88);
      }
      const row = ELEMENT_VFX_ROW[projectile.element];
      if (row !== undefined) {
        const frame = Math.floor(scene.time * 16 + projectile.id + projectile.travelled * 0.025) % 6;
        const atlasSize = Math.max(20, Math.min(70, projectile.radius * (projectile.critical ? 6 : 4.5)));
        const playerAlpha = projectile.element === 'arcane' ? 0.2 : 0.82;
        this.drawVfxFrame(row, frame, x, y, hostile ? atlasSize * 0.78 : atlasSize, hostile ? (dangerous ? 0.24 : 0.1) : playerAlpha);
      }
      ctx.save();
      if (hostile) {
        const hostileColor = dangerous
          ? scene.settings.colorBlindMode === 'off' ? '#ff674e' : '#ffe36c'
          : '#87979a';
        const coreRadius = Math.max(5, Math.round(projectile.radius * 0.92));
        const pulse = dangerous ? 1 + Math.sin(scene.time * 16 + projectile.id) * 0.1 : 0.82;
        ctx.globalAlpha = dangerous ? 1 : 0.5;
        ctx.fillStyle = '#020608';
        this.drawSteppedLine(
          x - directionX * projectile.radius * 2.8,
          y - directionY * projectile.radius * 2.8,
          x,
          y,
          Math.max(5, projectile.radius * 0.88),
          3,
        );
        ctx.fillStyle = hostileColor;
        this.drawSteppedLine(
          x - directionX * projectile.radius * 2.7,
          y - directionY * projectile.radius * 2.7,
          x - directionX * projectile.radius * 0.35,
          y - directionY * projectile.radius * 0.35,
          Math.max(2, projectile.radius * 0.4),
          3,
        );
        this.drawHazardDiamond(x, y, Math.round(coreRadius * pulse) + 3, '#020608');
        this.drawHazardDiamond(x, y, Math.round(coreRadius * pulse), hostileColor);
        ctx.fillStyle = dangerous ? '#fff1cd' : '#cad4d5';
        ctx.fillRect(x - 1, y - coreRadius + 2, 3, coreRadius * 2 - 3);
        ctx.fillRect(x - coreRadius + 2, y - 1, coreRadius * 2 - 3, 3);

        // Chevron đỏ/cam + khung bốn góc là mã hình học cố định cho đạn địch.
        const arm = Math.max(9, Math.round(projectile.radius + 5 + Math.sin(scene.time * 12 + projectile.id) * 1.5));
        const corner = Math.max(4, Math.round(projectile.radius * 0.62));
        ctx.fillStyle = '#020608';
        this.drawCornerBrackets(x, y, arm + 2, corner + 3, 3);
        ctx.fillStyle = hostileColor;
        this.drawCornerBrackets(x, y, arm, corner, 2);
        ctx.fillStyle = hostileColor;
        const sideX = -directionY;
        const sideY = directionX;
        this.drawSteppedLine(
          x - directionX * (arm + 8) + sideX * 6,
          y - directionY * (arm + 8) + sideY * 6,
          x - directionX * arm,
          y - directionY * arm,
          2,
          3,
        );
        this.drawSteppedLine(
          x - directionX * (arm + 8) - sideX * 6,
          y - directionY * (arm + 8) - sideY * 6,
          x - directionX * arm,
          y - directionY * arm,
          2,
          3,
        );
        if (!dangerous) {
          ctx.fillStyle = '#dbe3e4';
          this.drawSteppedLine(x - arm, y + arm, x + arm, y - arm, 3, 4);
        }
      } else {
        // Atlas production là silhouette chính. Những nét hình học cũ vẫn chạy
        // như fallback nhưng được ẩn khi atlas đã sẵn sàng.
        if (hasProjectileAtlasSprite) ctx.globalAlpha = 0;
        const color = projectile.element === 'arcane' ? '#6ac7e8' : projectile.color;
        ctx.fillStyle = '#031014';
        this.drawSteppedLine(
          x - directionX * projectile.radius * 1.9,
          y - directionY * projectile.radius * 1.9,
          x + directionX * projectile.radius * 2.1,
          y + directionY * projectile.radius * 2.1,
          Math.max(5, projectile.radius * 0.86),
          3,
        );
        ctx.fillStyle = '#c9fbff';
        this.drawSteppedLine(
          x - directionX * projectile.radius * 1.45,
          y - directionY * projectile.radius * 1.45,
          x + directionX * projectile.radius * 1.75,
          y + directionY * projectile.radius * 1.75,
          Math.max(3, projectile.radius * 0.56),
          3,
        );
        ctx.fillStyle = color;
        if (aegisSniperRay) {
          const sideX = -directionY;
          const sideY = directionX;
          ctx.fillStyle = '#10252b';
          this.drawSteppedLine(
            x - directionX * 24,
            y - directionY * 24,
            x + directionX * 10,
            y + directionY * 10,
            Math.max(5, projectile.radius * 0.92),
            3,
          );
          ctx.fillStyle = '#9ef6ff';
          this.drawSteppedLine(
            x - directionX * 20,
            y - directionY * 20,
            x + directionX * 13,
            y + directionY * 13,
            Math.max(2, projectile.radius * 0.42),
            3,
          );
          ctx.fillStyle = '#ffbf4e';
          ctx.fillRect(Math.round(x + directionX * 9 + sideX * 2) - 1, Math.round(y + directionY * 9 + sideY * 2) - 1, 3, 3);
          ctx.fillRect(Math.round(x + directionX * 9 - sideX * 2) - 1, Math.round(y + directionY * 9 - sideY * 2) - 1, 3, 3);
        } else if (echoSpiritRay) {
          const sideX = -directionY;
          const sideY = directionX;
          ctx.fillStyle = '#160b29';
          this.drawSteppedLine(x - directionX * 22, y - directionY * 22, x + directionX * 11, y + directionY * 11, Math.max(5, projectile.radius), 3);
          ctx.fillStyle = '#d77cff';
          this.drawSteppedLine(x - directionX * 19, y - directionY * 19, x + directionX * 14, y + directionY * 14, Math.max(2, projectile.radius * 0.46), 3);
          ctx.fillStyle = '#efffff';
          ctx.fillRect(Math.round(x + directionX * 8 + sideX * 2) - 1, Math.round(y + directionY * 8 + sideY * 2) - 1, 3, 3);
          ctx.fillRect(Math.round(x + directionX * 8 - sideX * 2) - 1, Math.round(y + directionY * 8 - sideY * 2) - 1, 3, 3);
        } else if (projectile.element === 'lightning') {
          const sideX = -directionY;
          const sideY = directionX;
          const startX = x - directionX * projectile.radius * 1.8;
          const startY = y - directionY * projectile.radius * 1.8;
          const midX = x + sideX * projectile.radius * 0.65;
          const midY = y + sideY * projectile.radius * 0.65;
          const endX = x + directionX * projectile.radius * 2;
          const endY = y + directionY * projectile.radius * 2;
          this.drawSteppedLine(startX, startY, midX, midY, Math.max(3, projectile.radius * 0.48), 2);
          this.drawSteppedLine(midX, midY, endX, endY, Math.max(3, projectile.radius * 0.48), 2);
        } else if (projectile.sourceWeaponId.includes('rift-blade')) {
          this.drawSteppedLine(
            x - directionX * projectile.radius * 1.8,
            y - directionY * projectile.radius * 1.8,
            x + directionX * projectile.radius * 2.5,
            y + directionY * projectile.radius * 2.5,
            Math.max(3, projectile.radius * 0.55),
            3,
          );
          ctx.fillStyle = '#c8443f';
          const notchX = Math.round(x + directionX * projectile.radius * 0.7 - directionY * 3);
          const notchY = Math.round(y + directionY * projectile.radius * 0.7 + directionX * 3);
          ctx.fillRect(notchX - 2, notchY - 1, 5, 3);
          ctx.fillRect(notchX, notchY + 2, 3, 4);
        } else if (projectile.sourceWeaponId.includes('echo-bow')) {
          const sideX = -directionY;
          const sideY = directionX;
          ctx.fillStyle = '#dff8ff';
          this.drawSteppedLine(
            x - directionX * projectile.radius * 1.4 + sideX * 5,
            y - directionY * projectile.radius * 1.4 + sideY * 5,
            x - directionX * projectile.radius * 0.55,
            y - directionY * projectile.radius * 0.55,
            2,
            3,
          );
          this.drawSteppedLine(
            x - directionX * projectile.radius * 1.4 - sideX * 5,
            y - directionY * projectile.radius * 1.4 - sideY * 5,
            x - directionX * projectile.radius * 0.55,
            y - directionY * projectile.radius * 0.55,
            2,
            3,
          );
        } else if (projectile.element === 'arcane') {
          ctx.fillStyle = '#6ac7e8';
          this.drawCornerBrackets(x, y, Math.max(6, projectile.radius + 2), Math.max(3, projectile.radius * 0.6), 2);
          ctx.fillStyle = '#e9fbff';
          ctx.fillRect(x - 2, y - 2, 5, 5);
        } else if (toxicBomb) {
          // Atlas là hình chính; ba pixel phía sau chỉ giữ hướng bay khi sprite
          // bị thu nhỏ ở thiết bị mật độ điểm ảnh cao.
          const sideX = -directionY;
          const sideY = directionX;
          for (let index = 1; index <= 3; index += 1) {
            const distance = projectile.radius * (1.25 + index * 0.62);
            const size = Math.max(2, 5 - index);
            ctx.fillStyle = index === 1 ? '#dfff75' : '#4d9c43';
            ctx.fillRect(
              Math.round(x - directionX * distance + sideX * (index % 2 === 0 ? 2 : -2)) - 1,
              Math.round(y - directionY * distance + sideY * (index % 2 === 0 ? 2 : -2)) - 1,
              size,
              size,
            );
          }
        } else if (projectile.element === 'poison') {
          const unit = Math.max(2, Math.round(projectile.radius * 0.42));
          ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
          ctx.fillStyle = '#d4ff9a';
          ctx.fillRect(x, y - unit * 2, unit, unit);
          ctx.fillRect(x - unit * 2, y, unit, unit);
          ctx.fillStyle = '#17351d';
          ctx.fillRect(x + unit, y + unit, unit, unit);
        } else {
          this.drawSteppedLine(
            x - directionX * projectile.radius,
            y - directionY * projectile.radius,
            x + directionX * projectile.radius * 1.7,
            y + directionY * projectile.radius * 1.7,
            Math.max(2, projectile.radius * 0.42),
            2,
          );
        }

        if (hasProjectileAtlasSprite && projectileAtlasIndex !== undefined) {
          ctx.globalAlpha = 1;
          this.drawProjectileAtlasSprite(projectile, projectileAtlasIndex, x, y, directionX, directionY);
        }

        if (projectile.element === 'fire') {
          for (let index = 1; index <= 3; index += 1) {
            const flicker = Math.sin(scene.time * 19 + projectile.id + index) * 2;
            ctx.fillStyle = index === 1 ? '#fff1a0' : color;
            ctx.fillRect(
              Math.round(x - directionX * (projectile.radius * (1.4 + index * 0.65)) - 1 + -directionY * flicker),
              Math.round(y - directionY * (projectile.radius * (1.4 + index * 0.65)) - 1 + directionX * flicker),
              index === 1 ? 3 : 2,
              index === 1 ? 3 : 2,
            );
          }
        }
        const tipX = Math.round(x + directionX * projectile.radius * 1.55);
        const tipY = Math.round(y + directionY * projectile.radius * 1.55);
        const abilityScale = combatTier === 'ultimate' ? 2 : combatTier === 'active' ? 1 : 0;
        if (!hasProjectileAtlasSprite) {
          this.drawPlayerProjectileStar(tipX, tipY, projectile.critical ? 6 : 4 + abilityScale);
        }
        if (combatTier === 'active') {
          const sideX = -directionY;
          const sideY = directionX;
          ctx.fillStyle = '#efffff';
          const tail = projectile.radius * 2.2;
          this.drawSteppedLine(
            x - directionX * tail + sideX * 7,
            y - directionY * tail + sideY * 7,
            x - directionX * projectile.radius * 0.5,
            y - directionY * projectile.radius * 0.5,
            2,
            3,
          );
          this.drawSteppedLine(
            x - directionX * tail - sideX * 7,
            y - directionY * tail - sideY * 7,
            x - directionX * projectile.radius * 0.5,
            y - directionY * projectile.radius * 0.5,
            2,
            3,
          );
        } else if (combatTier === 'ultimate') {
          const pulse = 1 + Math.sin(scene.time * 18 + projectile.id) * 0.08;
          ctx.fillStyle = '#ffe69a';
          this.drawCornerBrackets(
            x,
            y,
            Math.max(9, projectile.radius * 1.7 * pulse),
            Math.max(4, projectile.radius * 0.72),
            2,
          );
        }
        if (projectile.critical) {
          ctx.fillStyle = '#fff5ae';
          const arm = Math.max(6, Math.round(projectile.radius * 1.2));
          ctx.fillRect(x - 1, y - arm, 3, arm * 2 + 1);
          ctx.fillRect(x - arm, y - 1, arm * 2 + 1, 3);
        }
      }
      ctx.restore();
    });
  }

  /**
   * Silhouette cố định theo phím: Q là mũi định hướng, E là bốn nấc hội tụ,
   * R là hai quỹ đạo lớn. Cue nằm dưới chân và chỉ tồn tại trong pose cast.
   */
  private drawAbilityCastCue(scene: RenderScene): void {
    const player = scene.player;
    if (player.animationState !== 'cast' || player.actionKind !== 'ability') return;
    const profile = combatCueProfile(player.abilityCastKind);
    if (profile.tier === 'primary') return;
    const screen = this.camera.worldToScreen(player.x, player.y);
    const progress = player.actionProgress;
    const release = progress < 0.26 ? progress / 0.26
      : progress < 0.62 ? 1 : Math.max(0, 1 - (progress - 0.62) / 0.38);
    const compact = this.width <= 560 || scene.settings.reducedParticles;
    const radius = profile.radius * (0.72 + release * 0.28) * (compact ? 0.86 : 1);
    const direction = player.actionDirection;
    const sideX = -direction.y;
    const sideY = direction.x;
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = (0.3 + release * 0.5) * (compact ? 0.82 : 1);
    ctx.fillStyle = '#02090c';
    this.drawPixelRing(screen.x, screen.y, radius + 3, 5, compact ? Math.max(14, profile.segments - 10) : profile.segments);
    ctx.fillStyle = profile.accent;
    this.drawPixelRing(screen.x, screen.y, radius, profile.tier === 'ultimate' ? 4 : 3, compact ? Math.max(14, profile.segments - 10) : profile.segments);

    if (profile.tier === 'active') {
      const reach = radius + 24 * release;
      const tipX = screen.x + direction.x * reach;
      const tipY = screen.y + direction.y * reach;
      ctx.fillStyle = profile.core;
      this.drawSteppedLine(screen.x + direction.x * 8, screen.y + direction.y * 8, tipX, tipY, 3, 4);
      this.drawSteppedLine(tipX, tipY, tipX - direction.x * 13 + sideX * 9, tipY - direction.y * 13 + sideY * 9, 3, 3);
      this.drawSteppedLine(tipX, tipY, tipX - direction.x * 13 - sideX * 9, tipY - direction.y * 13 - sideY * 9, 3, 3);
    } else if (profile.tier === 'rage') {
      const arm = radius * (0.58 + release * 0.18);
      ctx.fillStyle = profile.core;
      for (let index = 0; index < 4; index += 1) {
        const angle = index / 4 * TAU + scene.time * 0.45;
        this.drawSteppedLine(
          screen.x + Math.cos(angle) * radius,
          screen.y + Math.sin(angle) * radius,
          screen.x + Math.cos(angle) * arm,
          screen.y + Math.sin(angle) * arm,
          3,
          3,
        );
      }
      this.drawHazardDiamond(screen.x, screen.y, 6 + release * 3, profile.core);
    } else {
      ctx.globalAlpha *= 0.82;
      ctx.fillStyle = profile.core;
      this.drawPixelRing(screen.x, screen.y, radius * 0.64, 3, compact ? 18 : 28);
      const pips = compact ? 6 : 8;
      for (let index = 0; index < pips; index += 1) {
        const angle = index / pips * TAU - scene.time * 0.7;
        const pipX = Math.round(screen.x + Math.cos(angle) * (radius + 9));
        const pipY = Math.round(screen.y + Math.sin(angle) * (radius + 9));
        ctx.fillRect(pipX - 2, pipY - 2, 5, 5);
      }
      this.drawCornerBrackets(screen.x, screen.y, radius * 0.42, 7, 3);
    }
    ctx.restore();
  }

  private drawWeaponCompanions(scene: RenderScene): void {
    const ctx = this.context;
    const playerScreen = this.camera.worldToScreen(scene.player.x, scene.player.y);
    for (const entry of scene.weapons.entries()) {
      const level = entry.config.levels[entry.runtime.level - 1];
      if (!level) continue;
      if (entry.config.behavior !== 'orbit' && entry.config.behavior !== 'summon' && entry.config.behavior !== 'slash') continue;
      const evolution = scene.weapons.evolutionConfigOf(entry.config.id);
      const requestedCount = Math.max(1, level.count + (evolution?.countBonus ?? 0) + scene.player.stats.get('bonusProjectiles'));
      const count = entry.config.behavior === 'slash' ? Math.min(SWORD_MAX_VISIBLE_LAYERS, requestedCount) : requestedCount;
      const image = this.assets.get(entry.config.icon);
      for (let index = 0; index < count; index += 1) {
        const summonLayer = Math.floor(index / 3);
        const summonIndex = index % 3;
        const summonLayerCount = Math.min(3, count - summonLayer * 3);
        const radius = entry.config.behavior === 'orbit'
          ? Math.min(190, level.range * scene.player.stats.get('range'))
          : entry.config.behavior === 'summon'
            ? 68 + summonLayer * 30
            : swordLayerRadius(level.range * scene.player.stats.get('range') * (evolution?.effect === 'phantom' ? 1.85 : 1), index);
        const bladesPerLayer = entry.config.behavior === 'slash' ? 3 : 1;
        for (let blade = 0; blade < bladesPerLayer; blade += 1) {
          const direction = entry.config.behavior === 'slash' && index % 2 === 1 ? -1 : 1;
          const angle = entry.config.behavior === 'summon'
            ? entry.runtime.summonAngle * (summonLayer % 2 === 0 ? 1 : -0.82) + summonIndex / summonLayerCount * TAU + summonLayer * 0.45
            : entry.runtime.summonAngle * direction + (entry.config.behavior === 'slash' ? blade / bladesPerLayer * TAU + index * 0.73 : index / count * TAU);
          const x = Math.round(playerScreen.x + Math.cos(angle) * radius);
          const y = Math.round(playerScreen.y + Math.sin(angle) * radius);
          const size = entry.config.behavior === 'orbit' ? 30 : entry.config.behavior === 'slash' ? 32 : 24;
          ctx.save();
          ctx.translate(x, y);
          if (entry.config.behavior === 'slash') ctx.rotate(angle + direction * Math.PI / 2);
          const companionColor = entry.config.behavior === 'orbit' || entry.config.behavior === 'slash' ? '#dbe7e7'
            : entry.config.element === 'arcane' ? '#6ac7e8' : '#c879ff';
          this.drawPixelDiamond(Math.round(size * 0.62), '#071216', companionColor);
          if (image) ctx.drawImage(image, -size / 2, -size / 2, size, size);
          else {
            ctx.fillStyle = companionColor;
            ctx.fillRect(-Math.round(size / 3), -Math.round(size / 3), Math.round(size * 0.66), Math.round(size * 0.66));
          }
          ctx.restore();
        }
      }
    }
  }

  private drawBossDirectionIndicator(scene: RenderScene): void {
    const boss = scene.boss.getBoss();
    if (!boss || this.camera.isVisible(boss.x, boss.y, boss.radius + 24)) return;
    const playerScreen = this.camera.worldToScreen(scene.player.x, scene.player.y);
    const bossScreen = this.camera.worldToScreen(boss.x, boss.y);
    const indicator = bossIndicatorPoint(playerScreen.x, playerScreen.y, bossScreen.x, bossScreen.y, this.width, this.height);
    if (!indicator) return;

    const ctx = this.context;
    ctx.save();
    ctx.translate(Math.round(indicator.x), Math.round(indicator.y));
    ctx.rotate(indicator.angle);
    ctx.fillStyle = 'rgba(2, 8, 12, .9)';
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(-15, -17);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-15, 17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#020608';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#ffcf70';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffcf70';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#020608';
    ctx.strokeText('BOSS', indicator.x, indicator.y + 29);
    ctx.fillStyle = '#fff1c1';
    ctx.fillText('BOSS', indicator.x, indicator.y + 29);
    ctx.restore();
  }

  private drawTitanGroundVfx(player: Player): void {
    const ctx = this.context;
    if (player.titanRiftImpactTime > 0) {
      const impact = this.camera.worldToScreen(player.titanRiftImpactX, player.titanRiftImpactY);
      const impactProgress = 1 - player.titanRiftImpactTime / 0.5;
      const titanAtlas = this.assets.get(TITAN_ACTION_PATH);
      if (titanAtlas) {
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - impactProgress * 0.6);
        this.drawMotionCell(titanAtlas, 2, Math.min(5, Math.floor(impactProgress * 6)), 3, impact.x, impact.y, 370);
        ctx.restore();
      } else this.drawGuardianPassiveFrame(7, impact.x, impact.y, 330 + impactProgress * 80, 0.9 - impactProgress * 0.35);
    }
    if (player.titanSlamTime > 0) {
      const atlas = this.assets.get(TITAN_ACTION_PATH);
      const impact = this.camera.worldToScreen(player.titanSlamX, player.titanSlamY);
      const progress = 1 - player.titanSlamTime / TITAN_IMPACT_VFX_DURATION;
      if (atlas) {
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - progress * 0.55);
        this.drawMotionCell(atlas, 2, Math.min(5, 2 + Math.floor(progress * 4)), 3, impact.x, impact.y, player.titanSlamRadius * 2);
        ctx.restore();
      }
    }
  }

  private drawPlayer(player: Player, time: number, reducedEffects: boolean): void {
    const ctx = this.context;
    const screen = this.camera.worldToScreen(player.x, player.y);
    const x = Math.round(screen.x);
    const y = Math.round(screen.y);
    const bodyScale = Math.max(0.5, player.stats.get('bodyScale'));
    const visualScale = clamp(1 + Math.log2(bodyScale) * 0.55, 0.75, 2.75);
    const spritePath = player.character.gameplaySprite
      ?? (player.character.id === 'kael-orin' ? KAEL_SPRITE_PATH : null);
    const spriteSheet = spritePath ? this.assets.get(spritePath) : null;
    const motionSpeed = Math.hypot(player.motionVx, player.motionVy);
    const directionX = motionSpeed > 0.001 ? player.motionVx / motionSpeed : player.lastMove.x;
    const directionY = motionSpeed > 0.001 ? player.motionVy / motionSpeed : player.lastMove.y;
    const anticipation = player.animationState === 'run'
      ? clamp((0.38 - player.movementBlend) / 0.38, 0, 1)
      : 0;
    const recovery = player.animationState === 'idle'
      ? clamp(player.movementBlend / 0.34, 0, 1)
      : 0;
    const actionActive = player.animationState === 'attack' || player.animationState === 'cast';
    const actionProgress = actionActive ? player.actionProgress : 0;
    const actionAnticipation = !actionActive ? 0
      : actionProgress < 0.26 ? Math.sin(actionProgress / 0.26 * Math.PI * 0.5)
        : actionProgress < 0.4 ? 1 - (actionProgress - 0.26) / 0.14 : 0;
    const actionRelease = !actionActive || actionProgress < 0.2 || actionProgress > 0.68 ? 0
      : Math.sin((actionProgress - 0.2) / 0.48 * Math.PI);
    const actionRecovery = !actionActive || actionProgress < 0.56 ? 0
      : Math.sin((actionProgress - 0.56) / 0.44 * Math.PI);
    const actionDirectionX = actionActive ? player.actionDirection.x : player.aim.x;
    const actionDirectionY = actionActive ? player.actionDirection.y : player.aim.y;

    ctx.save();
    const aimGuideStart = player.radius + 5;
    const aimGuideEnd = aimGuideStart + 18;
    ctx.fillStyle = '#061014';
    this.drawSteppedLine(
      x + player.aim.x * aimGuideStart,
      y + player.aim.y * aimGuideStart,
      x + player.aim.x * aimGuideEnd,
      y + player.aim.y * aimGuideEnd,
      4,
      3,
    );
    ctx.fillStyle = '#ffe58a';
    this.drawSteppedLine(
      x + player.aim.x * (aimGuideStart + 2),
      y + player.aim.y * (aimGuideStart + 2),
      x + player.aim.x * (aimGuideEnd - 3),
      y + player.aim.y * (aimGuideEnd - 3),
      2,
      2,
    );
    ctx.restore();

    if (player.ultimateActive > 0) {
      const kind = player.character.ultimate?.kind ?? '';
      const row = kind === 'forgequake' ? 1
        : kind === 'arrow-rain' || kind === 'titanfall' ? 4
          : kind === 'void-collapse' || kind === 'plague-night' || kind === 'echo-legion' ? 3
            : kind === 'elemental-tempest' ? Math.floor(time * 3) % 4 : 0;
      this.drawVfxFrame(row, Math.floor(time * 13) % 6, x, y, Math.round(94 * visualScale), 0.42);
    } else if (player.rageActive > 0) {
      this.drawVfxFrame(4, Math.floor(time * 11) % 6, x, y, Math.round(84 * visualScale), 0.46);
    }
    if (player.lightSoldierTime > 0) this.drawLightSoldier(player, x, y, time);
    if (player.rageShield > 0 || player.sealShield > 0 || player.holyShieldLayers > 0 || player.titanRiftShield > 0) {
      const holyShield = player.holyShieldLayers > 0;
      const titanShield = player.titanRiftShield > 0;
      const activeShield = holyShield ? 1 : titanShield ? player.titanRiftShield
        : player.sealShield > 0 ? player.sealShield : player.rageShield;
      const shieldCapacity = holyShield ? 1 : titanShield ? player.stats.get('maxHp') * 0.1
        : player.sealShield > 0 ? player.stats.get('maxHp') : player.stats.get('maxHp') * 0.22;
      const shieldRatio = clamp(activeShield / Math.max(1, shieldCapacity), 0, 1);
      const frame = holyShield ? 4 + Math.floor(time * 5) % 2
        : titanShield ? 6 : player.sealShield > 0 ? 5 : 4;
      this.drawGuardianPassiveFrame(frame, x, y, Math.round((holyShield || player.sealShield > 0 ? 94 : 86) * visualScale), 0.48 + shieldRatio * 0.42);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#02090c';
    this.drawPixelRing(0, Math.round(player.radius * 0.48), player.radius + 12, 5, 28);
    ctx.fillStyle = player.ultimateActive > 0 ? '#ffe58a' : '#71f0e3';
    this.drawPixelRing(0, Math.round(player.radius * 0.48), player.radius + 8, 3, 28);

    const feetY = Math.round(player.radius * 0.72);
    const titanAtlas = player.character.id === 'titan' ? this.assets.get(TITAN_ACTION_PATH) : null;
    const titanCast = titanAtlas && player.actionKind === 'ability' && player.actionTimer > 0
      && ['active-gravity-breaker', 'ultimate-titanfall'].includes(player.abilityCastKind);
    if (titanCast && titanAtlas) {
      const ultimate = player.abilityCastKind === 'ultimate-titanfall';
      const elapsed = player.actionDuration - player.actionTimer;
      const frame = titanActionFrame(elapsed, ultimate);
      const airborne = ultimate && elapsed >= 0.22 && elapsed < TITAN_FALL_IMPACT;
      const lift = airborne ? Math.sin((elapsed - 0.22) / (TITAN_FALL_IMPACT - 0.22) * Math.PI) * 26 : 0;
      ctx.save();
      if (player.actionDirection.x < 0) ctx.scale(-1, 1);
      this.drawMotionCell(titanAtlas, ultimate ? 1 : 0, frame, 3, 0, feetY - lift, 96 * visualScale, 0.84);
      ctx.restore();
    } else if (spriteSheet) {
      const sourceWidth = spriteSheet.naturalWidth || spriteSheet.width;
      const sourceHeight = spriteSheet.naturalHeight || spriteSheet.height;
      const sourceCellWidth = sourceWidth / PLAYER_SPRITE_COLUMNS;
      const sourceCellHeight = sourceHeight / PLAYER_SPRITE_ROWS;
      const locomotionAnimation = player.animationState === 'run'
        || player.animationState === 'attack'
        || player.animationState === 'cast';
      const moving = player.animationState === 'dash'
        || (locomotionAnimation && player.movementBlend > 0.035);
      const frame = player.animationState === 'dash'
        ? Math.min(3, Math.floor(player.dashProgress * 4))
        : player.animationState === 'hurt' ? 1
          : moving ? Math.floor(player.stridePhase * 4) % 4 : 0;
      const row = FACING_TO_SPRITE_ROW[player.facing8] ?? 6;
      const footY = sourceCellHeight * PLAYER_SPRITE_FOOT_RATIO;
      const size = Math.round(88 * visualScale);
      const strideWave = Math.sin(player.stridePhase * TAU);
      const plantStrength = Math.pow(Math.abs(strideWave), 5) * player.movementBlend;
      const bob = player.animationState === 'run' ? Math.round(anticipation - plantStrength * 2)
        : player.animationState === 'dash' ? -2
          : player.animationState === 'hurt' ? Math.round(1 + Math.sin(time * 42))
            : actionActive ? Math.round(
              actionAnticipation
              - actionRelease * (player.animationState === 'cast' ? 2 : 0.8)
              - plantStrength * 1.25,
            )
            : Math.round(recovery + Math.sin(time * 2.6) * 0.6);
      const stretch = player.animationState === 'dash' ? 0.14
        : player.animationState === 'hurt' ? -0.07
          : actionActive
            ? actionRelease * 0.035 - actionAnticipation * 0.022 + actionRecovery * 0.012
              + strideWave * 0.012 * player.movementBlend
          : strideWave * 0.025 * player.movementBlend - anticipation * 0.035 + recovery * 0.022;
      const hurtRecoil = player.animationState === 'hurt' ? clamp(player.hurtTime / 0.16, 0, 1) : 0;
      const rangedRecoil = player.primaryWeaponBehavior === 'bow' || player.primaryWeaponBehavior === 'gun'
        || player.primaryWeaponBehavior === 'darts' || player.primaryWeaponBehavior === 'laser';
      const actionLean = player.animationState === 'cast'
        ? actionRelease * 0.7 - actionAnticipation * 0.45
        : rangedRecoil ? -actionRelease * 1.2 - actionAnticipation * 0.65
          : actionRelease * 1.55 - actionAnticipation * 0.8;
      const leanX = Math.round(
        directionX * (player.animationState === 'dash' ? 4 : 2.2 * player.movementBlend - anticipation * 1.6 + recovery)
        + actionDirectionX * actionLean
        + directionX * hurtRecoil * 3,
      );
      const leanY = Math.round(
        directionY * (player.animationState === 'dash' ? 2 : player.movementBlend - anticipation + recovery * 0.55)
        + actionDirectionY * actionLean * 0.7
        + directionY * hurtRecoil * 2,
      );

      if (player.animationState === 'dash') {
        const smearStrength = clamp((1 - player.dashProgress) * 0.72 + Math.sin(player.dashProgress * Math.PI) * 0.28, 0, 1);
        for (let layer = 2; layer >= 1; layer -= 1) {
          ctx.save();
          ctx.globalAlpha = smearStrength * (layer === 1 ? 0.17 : 0.075);
          ctx.translate(
            Math.round(-directionX * (12 + layer * 11)),
            Math.round(feetY - directionY * (7 + layer * 7)),
          );
          ctx.scale(1.08 + smearStrength * 0.06, 0.92 - smearStrength * 0.05);
          ctx.drawImage(
            spriteSheet,
            frame * sourceCellWidth,
            row * sourceCellHeight,
            sourceCellWidth,
            sourceCellHeight,
            Math.round(-size / 2),
            Math.round(-size * footY / sourceCellHeight),
            size,
            size,
          );
          ctx.restore();
        }
      }

      ctx.save();
      ctx.translate(leanX, feetY + leanY + bob);
      ctx.scale(1 + stretch, 1 - stretch * 0.58);
      ctx.drawImage(
        spriteSheet,
        frame * sourceCellWidth,
        row * sourceCellHeight,
        sourceCellWidth,
        sourceCellHeight,
        Math.round(-size / 2),
        Math.round(-size * footY / sourceCellHeight),
        size,
        size,
      );
      ctx.restore();
      if (!player.character.gameplaySpriteIncludesWeapon) {
        this.drawHeldPrimaryWeapon(player, feetY + leanY + bob, visualScale, time, reducedEffects, leanX);
      }
    } else {
      drawProceduralPlayerSprite(ctx, {
        characterId: player.character.id,
        feetY,
        visualScale,
        facing8: player.facing8,
        animationState: player.animationState,
        stridePhase: player.stridePhase,
        movementBlend: player.movementBlend,
        dashProgress: player.dashProgress,
        time,
        aimX: player.aim.x,
        aimY: player.aim.y,
        recoilX: player.animationState === 'hurt' ? directionX : 0,
        recoilY: player.animationState === 'hurt' ? directionY : 0,
        actionProgress: player.actionProgress,
        actionKind: player.actionKind,
        actionX: player.actionDirection.x,
        actionY: player.actionDirection.y,
        primaryWeaponBehavior: player.primaryWeaponBehavior,
        abilityCastKind: player.abilityCastKind,
        hurtFlash: player.animationState === 'hurt' ? Math.max(player.hurtTime * 5, player.flash * 3) : player.flash * 3,
        reducedEffects,
      });
    }
    if (player.flash > 0) {
      ctx.globalAlpha = clamp(player.flash * 6, 0, 0.9);
      ctx.fillStyle = '#ffffff';
      const arm = Math.max(6, Math.round(player.radius * 0.6));
      ctx.fillRect(-2, -arm, 4, arm * 2);
      ctx.fillRect(-arm, -2, arm * 2, 4);
    }
    ctx.restore();
  }

  private drawLightSoldier(player: Player, playerX: number, playerY: number, time: number): void {
    const angle = player.lightSoldierAngle;
    const x = Math.round(playerX + Math.cos(angle) * 78);
    const y = Math.round(playerY + Math.sin(angle) * 78);
    const frame = Math.floor(time * 7.5) % 4;
    this.drawGuardianPassiveFrame(frame, x, y, 78, 0.68 + Math.min(1, player.lightSoldierTime) * 0.28);
  }

  private drawGuardianPassiveFrame(index: number, x: number, y: number, size: number, alpha = 1): boolean {
    const image = this.assets.get(GUARDIAN_PASSIVE_ATLAS_PATH);
    if (!image) return false;
    const columns = 4;
    const rows = 2;
    const sourceWidth = (image.naturalWidth || image.width) / columns;
    const sourceHeight = (image.naturalHeight || image.height) / rows;
    const safeIndex = clamp(Math.floor(index), 0, columns * rows - 1);
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    ctx.drawImage(
      image,
      safeIndex % columns * sourceWidth,
      Math.floor(safeIndex / columns) * sourceHeight,
      sourceWidth,
      sourceHeight,
      Math.round(x - size / 2),
      Math.round(y - size / 2),
      Math.round(size),
      Math.round(size),
    );
    ctx.restore();
    return true;
  }

  private drawHeldPrimaryWeapon(
    player: Player,
    feetY: number,
    visualScale: number,
    time: number,
    reducedEffects: boolean,
    leanX = 0,
  ): void {
    const ctx = this.context;
    const behavior = player.primaryWeaponBehavior;
    const active = player.animationState === 'attack' || player.animationState === 'cast';
    const attacking = player.animationState === 'attack' && player.actionKind === 'primary';
    const casting = player.animationState === 'cast' && player.actionKind === 'ability';
    // Atlas của Kael đã chứa sẵn vũ khí trong cả 32 frame. Hàm này chỉ còn
    // phục vụ gesture cast của atlas đã bake hoặc overlay cho atlas thân trơn.
    if (!attacking && !casting) return;
    const progress = active ? player.actionProgress : 0;
    const anticipation = active && progress < 0.4
      ? progress < 0.26 ? Math.sin(progress / 0.26 * Math.PI * 0.5) : 1 - (progress - 0.26) / 0.14
      : 0;
    const release = active && progress >= 0.2 && progress <= 0.68
      ? Math.sin((progress - 0.2) / 0.48 * Math.PI) : 0;
    const recovery = active && progress >= 0.56
      ? Math.sin((progress - 0.56) / 0.44 * Math.PI) : 0;
    const sourceX = active ? player.actionDirection.x : player.aim.x;
    const sourceY = active ? player.actionDirection.y : player.aim.y;
    const sourceMagnitude = Math.hypot(sourceX, sourceY);
    let aimX = sourceMagnitude > 0.05 ? sourceX / sourceMagnitude : 1;
    let aimY = sourceMagnitude > 0.05 ? sourceY / sourceMagnitude : 0;
    const gripAimX = aimX;
    const gripAimY = aimY;
    if (attacking && (behavior === 'slash' || behavior === 'orbit')) {
      const releaseSwing = clamp(progress / 0.5, 0, 1);
      const recoveryRatio = clamp((progress - 0.58) / 0.42, 0, 1);
      const recoveryEase = recoveryRatio * recoveryRatio * (3 - recoveryRatio * 2);
      const weaponSwing = releaseSwing + (0.5 - releaseSwing) * recoveryEase;
      const sweep = -1.28 + weaponSwing * 2.55;
      const cosine = Math.cos(sweep);
      const sine = Math.sin(sweep);
      const nextX = aimX * cosine - aimY * sine;
      aimY = aimX * sine + aimY * cosine;
      aimX = nextX;
    }
    const perpendicularX = -gripAimY;
    const perpendicularY = gripAimX;
    const bodyScale = Math.max(0.82, visualScale);
    // Nếu atlas thân trơn cần overlay hành động, vũ khí phải nhỏ hơn thân người
    // và không được dùng cùng tỉ lệ 1:1.
    const scale = Math.max(0.58, bodyScale * 0.68);
    const pixel = Math.max(1, Math.round(2 * scale));
    const shoulderY = Math.round(feetY - 35 * bodyScale);
    const throwWeapon = behavior === 'bomb' || behavior === 'poison-bomb';
    const ranged = behavior === 'bow' || behavior === 'gun' || behavior === 'darts' || behavior === 'laser';
    const handDistance = (10 + (throwWeapon ? release * 7 - anticipation * 3 : 0) - (ranged ? release * 2 : 0)) * bodyScale;
    const gripSideOffset = 4.5 * bodyScale;
    const handX = Math.round(gripAimX * handDistance + perpendicularX * gripSideOffset);
    const handY = Math.round(
      shoulderY
      + gripAimY * (5 + release * 3) * bodyScale
      + perpendicularY * gripSideOffset
      - (throwWeapon ? anticipation * 8 * bodyScale : 0),
    );
    const palette = this.playerWeaponPalette(behavior);

    ctx.save();
    ctx.translate(leanX, 0);
    ctx.globalAlpha = 0.98;
    if (casting) {
      // Kỹ năng dùng ký hiệu thi triển lệch về phía tay/vùng ngắm; không vẽ
      // thêm một bản sao vũ khí nằm trên giữa nhân vật.
      this.drawPlayerCastGesture(
        player.abilityCastKind,
        handX + aimX * 7 * scale,
        handY + aimY * 5 * scale,
        release,
        recovery,
        scale,
        reducedEffects,
      );
      ctx.restore();
      return;
    }
    if (attacking && behavior === 'slash' && release > 0.18 && !reducedEffects) {
      ctx.globalAlpha = 0.14 + release * 0.22;
      ctx.fillStyle = palette.core;
      this.drawSteppedLine(
        handX - perpendicularX * 8 * scale,
        handY - perpendicularY * 8 * scale,
        handX + aimX * 18 * scale,
        handY + aimY * 18 * scale,
        pixel + 1,
        3,
      );
      ctx.globalAlpha = 0.98;
    }

    switch (behavior) {
      case 'slash':
        ctx.fillStyle = palette.outline;
        this.drawSteppedLine(handX - aimX * 3 * scale, handY - aimY * 3 * scale, handX + aimX * 3 * scale, handY + aimY * 3 * scale, pixel + 1, 3);
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX + aimX * 2 * scale, handY + aimY * 2 * scale, handX + aimX * 18 * scale, handY + aimY * 18 * scale, pixel + 1, 3);
        ctx.fillStyle = palette.core;
        ctx.fillRect(Math.round(handX + aimX * 13 * scale + perpendicularX * 2), Math.round(handY + aimY * 13 * scale + perpendicularY * 2), pixel, pixel);
        break;
      case 'bow': {
        const pullX = handX - aimX * (5 + anticipation * 6) * scale;
        const pullY = handY - aimY * (5 + anticipation * 6) * scale;
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX + perpendicularX * 9 * scale, handY + perpendicularY * 9 * scale, handX, handY, pixel, 3);
        this.drawSteppedLine(handX, handY, handX - perpendicularX * 9 * scale, handY - perpendicularY * 9 * scale, pixel, 3);
        ctx.fillStyle = palette.core;
        this.drawSteppedLine(handX + perpendicularX * 9 * scale, handY + perpendicularY * 9 * scale, pullX, pullY, Math.max(1, pixel - 1), 3);
        this.drawSteppedLine(pullX, pullY, handX - perpendicularX * 9 * scale, handY - perpendicularY * 9 * scale, Math.max(1, pixel - 1), 3);
        break;
      }
      case 'gun':
      case 'laser':
        ctx.fillStyle = palette.outline;
        ctx.fillRect(handX - pixel, handY - pixel, pixel * 3, pixel * 2);
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX, handY, handX + aimX * 14 * scale, handY + aimY * 14 * scale, pixel + 1, 3);
        ctx.fillStyle = palette.core;
        ctx.fillRect(Math.round(handX + aimX * 14 * scale - pixel * 0.5), Math.round(handY + aimY * 14 * scale - pixel * 0.5), pixel, pixel);
        break;
      case 'darts':
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX - aimX * 3 * scale, handY - aimY * 3 * scale, handX + aimX * 13 * scale, handY + aimY * 13 * scale, Math.max(1, pixel - 1), 3);
        ctx.fillStyle = palette.core;
        ctx.fillRect(Math.round(handX + aimX * 8 * scale + perpendicularX * 2), Math.round(handY + aimY * 8 * scale + perpendicularY * 2), pixel, pixel);
        break;
      case 'bomb':
      case 'poison-bomb': {
        const radius = Math.max(4, Math.round(5 * scale));
        ctx.fillStyle = palette.outline;
        this.drawHazardDiamond(handX, handY, radius + 2, palette.outline);
        this.drawHazardDiamond(handX, handY, radius, palette.body);
        ctx.fillStyle = palette.core;
        ctx.fillRect(handX - pixel / 2, handY - pixel / 2, pixel, pixel);
        this.drawSteppedLine(handX, handY - radius, handX + perpendicularX * 4, handY - radius - 5 + perpendicularY * 4, Math.max(1, pixel - 1), 3);
        break;
      }
      case 'orbit': {
        const radius = Math.max(6, Math.round(8 * scale));
        this.drawHazardDiamond(handX, handY, radius + 2, palette.outline);
        this.drawHazardDiamond(handX, handY, radius, palette.body);
        ctx.fillStyle = palette.core;
        ctx.fillRect(handX - pixel / 2, handY - radius + 2, pixel, radius * 2 - 4);
        break;
      }
      case 'lightning':
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX - aimX * 2 * scale, handY - aimY * 2 * scale, handX + aimX * 5 * scale + perpendicularX * 4, handY + aimY * 5 * scale + perpendicularY * 4, pixel + 1, 3);
        ctx.fillStyle = palette.core;
        this.drawSteppedLine(handX + aimX * 5 * scale + perpendicularX * 4, handY + aimY * 5 * scale + perpendicularY * 4, handX + aimX * 14 * scale - perpendicularX * 2, handY + aimY * 14 * scale - perpendicularY * 2, pixel, 3);
        break;
      case 'fireball':
      case 'poison':
      case 'summon': {
        const radius = Math.max(4, Math.round((behavior === 'summon' ? 6 : 5) * scale));
        this.drawHazardDiamond(handX, handY, radius + 2, palette.outline);
        this.drawHazardDiamond(handX, handY, radius, palette.body);
        ctx.fillStyle = palette.core;
        ctx.fillRect(handX - pixel / 2, handY - pixel / 2, pixel, pixel);
        if (!reducedEffects) {
          const mote = Math.round(Math.sin(time * 6) * 3 * scale);
          ctx.fillRect(handX - radius - 3, handY + mote, pixel, pixel);
        }
        break;
      }
      case 'ice':
        ctx.fillStyle = palette.body;
        this.drawSteppedLine(handX, handY, handX + aimX * 14 * scale, handY + aimY * 14 * scale, pixel + 1, 3);
        this.drawSteppedLine(handX + perpendicularX * 3, handY + perpendicularY * 3, handX + aimX * 10 * scale + perpendicularX * 5, handY + aimY * 10 * scale + perpendicularY * 5, pixel, 3);
        this.drawSteppedLine(handX - perpendicularX * 3, handY - perpendicularY * 3, handX + aimX * 10 * scale - perpendicularX * 5, handY + aimY * 10 * scale - perpendicularY * 5, pixel, 3);
        break;
      case 'nova': {
        const arm = Math.max(6, Math.round(8 * scale));
        ctx.fillStyle = palette.body;
        ctx.fillRect(handX - pixel / 2, handY - arm, pixel, arm * 2);
        ctx.fillRect(handX - arm, handY - pixel / 2, arm * 2, pixel);
        ctx.fillStyle = palette.core;
        ctx.fillRect(handX - pixel, handY - pixel, pixel * 2, pixel * 2);
        break;
      }
    }

    ctx.restore();
  }

  private playerWeaponPalette(behavior: WeaponBehavior): { outline: string; body: string; core: string } {
    switch (behavior) {
      case 'slash': return { outline: '#210b0d', body: '#f4e8cf', core: '#d7434d' };
      case 'bow': return { outline: '#102431', body: '#9edcec', core: '#fff2bb' };
      case 'gun': return { outline: '#071419', body: '#668d98', core: '#ffb43d' };
      case 'darts': return { outline: '#171b20', body: '#e8f6f4', core: '#e04e55' };
      case 'bomb': return { outline: '#081116', body: '#778991', core: '#ffae3d' };
      case 'poison-bomb': return { outline: '#07180e', body: '#4c8757', core: '#c9f253' };
      case 'lightning': return { outline: '#07181d', body: '#72e9f5', core: '#f4ffff' };
      case 'fireball': return { outline: '#2a0a08', body: '#ee4b2f', core: '#ffd34f' };
      case 'ice': return { outline: '#0b2834', body: '#88d7ed', core: '#efffff' };
      case 'laser': return { outline: '#07161d', body: '#43bdd8', core: '#ffffff' };
      case 'poison': return { outline: '#07170d', body: '#49a856', core: '#d7f16b' };
      case 'orbit': return { outline: '#10191d', body: '#b9c8cb', core: '#ffb04a' };
      case 'summon': return { outline: '#07191d', body: '#58c7d4', core: '#efffff' };
      case 'nova': return { outline: '#07161f', body: '#6bcce8', core: '#ffffff' };
    }
  }

  private drawPlayerCastGesture(
    kind: string,
    centerX: number,
    centerY: number,
    release: number,
    recovery: number,
    scale: number,
    reducedEffects: boolean,
  ): void {
    const ctx = this.context;
    const normalized = kind.toLowerCase();
    const ultimate = normalized === 'ultimate' || normalized.startsWith('ultimate-');
    const rage = normalized === 'rage' || normalized.startsWith('rage-');
    const toxic = normalized.includes('toxic') || normalized.includes('venom') || normalized.includes('hemo');
    const blood = normalized.includes('blood');
    const frost = normalized.includes('frost') || normalized.includes('gale');
    const body = rage ? '#f05b31' : toxic ? '#49a856' : blood ? '#d7444f' : frost ? '#88d7ed' : '#72e5f2';
    const core = rage ? '#ffd456' : toxic ? '#d7f16b' : blood ? '#fff0d2' : '#ffffff';
    const pulse = Math.max(0.25, release, recovery * 0.42);
    const arm = Math.max(6, Math.round((6 + pulse * (ultimate ? 7 : 4)) * scale));
    ctx.fillStyle = body;
    if (rage) {
      this.drawSteppedLine(centerX - arm, centerY - arm, centerX - 2, centerY - 2, Math.max(2, Math.round(2 * scale)), 3);
      this.drawSteppedLine(centerX + arm, centerY - arm, centerX + 2, centerY - 2, Math.max(2, Math.round(2 * scale)), 3);
      this.drawSteppedLine(centerX - arm, centerY + arm, centerX - 2, centerY + 2, Math.max(2, Math.round(2 * scale)), 3);
      this.drawSteppedLine(centerX + arm, centerY + arm, centerX + 2, centerY + 2, Math.max(2, Math.round(2 * scale)), 3);
    } else if (ultimate) {
      ctx.fillRect(Math.round(centerX - 2 * scale), centerY - arm, Math.max(3, Math.round(3 * scale)), arm * 2);
      ctx.fillRect(centerX - arm, Math.round(centerY - 2 * scale), arm * 2, Math.max(3, Math.round(3 * scale)));
    } else {
      this.drawCornerBrackets(centerX, centerY, arm, Math.max(3, Math.round(4 * scale)), Math.max(2, Math.round(2 * scale)));
    }
    this.drawHazardDiamond(centerX, centerY, Math.max(3, Math.round(4 * scale)), core);
    if (!reducedEffects && release > 0.28) {
      ctx.fillStyle = core;
      const mote = Math.max(2, Math.round(2 * scale));
      ctx.fillRect(centerX - arm - mote * 2, centerY - mote, mote, mote);
      ctx.fillRect(centerX + arm + mote, centerY - mote, mote, mote);
    }
  }

  private drawParticles(scene: RenderScene): void {
    const ctx = this.context;
    scene.particles.pool.forEachActive((particle) => {
      if (!this.camera.isVisible(particle.x, particle.y, particle.size + 60)) return;
      const screen = this.camera.worldToScreen(particle.x, particle.y);
      const ratio = clamp(particle.life / Math.max(0.001, particle.maxLife), 0, 1);
      ctx.save();
      ctx.globalAlpha = ratio;
      ctx.fillStyle = particle.color;
      if (particle.kind === 'ring') {
        const progress = 1 - ratio;
        const radius = particle.size * (0.35 + progress * 0.75);
        this.drawPixelRing(screen.x, screen.y, radius, Math.max(2, Math.round(4 * ratio)), Math.min(56, Math.max(18, Math.round(radius / 3))));
      } else if (particle.kind === 'line' || particle.kind === 'slash') {
        const end = this.camera.worldToScreen(particle.x2, particle.y2);
        const width = Math.max(2, particle.size * ratio);
        this.drawSteppedLine(screen.x, screen.y, end.x, end.y, width, particle.kind === 'slash' ? 3 : 5);
        if (particle.kind === 'slash') {
          ctx.globalAlpha = ratio * 0.65;
          ctx.fillStyle = '#ffffff';
          this.drawSteppedLine(screen.x, screen.y, end.x, end.y, Math.max(1, width * 0.35), 4);
        }
      } else if (particle.kind === 'smoke') {
        ctx.globalAlpha = ratio * 0.45;
        const size = Math.max(2, Math.round(particle.size * (0.72 + (1 - ratio) * 0.7)));
        const x = Math.round(screen.x);
        const y = Math.round(screen.y);
        ctx.fillRect(x - size, y - size, size, size);
        ctx.fillRect(x, y - Math.round(size * 0.5), size, size);
        ctx.globalAlpha *= 0.55;
        ctx.fillRect(x - Math.round(size * 0.4), y, size, size);
      } else {
        const size = Math.max(2, Math.round(particle.size));
        const x = Math.round(screen.x) - Math.round(size / 2);
        const y = Math.round(screen.y) - Math.round(size / 2);
        ctx.fillRect(x, y, size, size);
        if (particle.kind === 'spark' && size >= 3) {
          ctx.globalAlpha = ratio * 0.65;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + Math.floor(size / 3), y + Math.floor(size / 3), Math.max(1, Math.floor(size / 3)), Math.max(1, Math.floor(size / 3)));
        }
      }
      ctx.restore();
    });
  }

  private drawAtlasVfx(scene: RenderScene): void {
    scene.particles.atlasPool.forEachActive((effect) => {
      if (!this.camera.isVisible(effect.x, effect.y, effect.size * 0.6 + 20)) return;
      const screen = this.camera.worldToScreen(effect.x, effect.y);
      const ratio = clamp(effect.life / Math.max(0.001, effect.maxLife), 0, 1);
      const progress = 1 - ratio;
      const sequenceFrame = Math.min(5, Math.floor(progress * 6));
      const frame = effect.reverse ? 5 - sequenceFrame : sequenceFrame;
      const weight = impactWeightForSize(effect.size);
      const mobileCap = weight === 'finisher' ? 210 : weight === 'skill' ? 148 : 80;
      const renderSize = this.width <= 560 ? Math.min(effect.size, mobileCap) : effect.size;
      const scale = effect.reverse ? 0.78 + progress * 0.3 : 0.94 + progress * 0.12;
      const alpha = effect.alpha * Math.min(1, ratio * 1.7);
      if (effect.sheet === 'status') this.drawStatusVfxFrame(effect.row, frame, screen.x, screen.y, renderSize * scale, alpha);
      else this.drawVfxFrame(effect.row, frame, screen.x, screen.y, renderSize * scale, alpha);
      if (!scene.settings.reducedParticles || renderSize >= 72) {
        this.drawImpactSemantic(effect.semantic, screen.x, screen.y, renderSize * scale, progress, alpha);
        this.drawImpactWeightEnvelope(weight, screen.x, screen.y, renderSize * scale, progress, alpha, scene.settings.reducedParticles);
      }
    });
  }

  private drawImpactWeightEnvelope(
    weight: ImpactWeight,
    centerX: number,
    centerY: number,
    size: number,
    progress: number,
    alpha: number,
    reduced: boolean,
  ): void {
    if (weight === 'hit') return;
    const ctx = this.context;
    const radius = size * (0.3 + progress * (weight === 'finisher' ? 0.18 : 0.1));
    ctx.save();
    ctx.globalAlpha = clamp(alpha * (1 - progress) * 0.78, 0, 0.8);
    ctx.fillStyle = weight === 'finisher' ? '#ffe69a' : '#e9fbff';
    if (weight === 'skill') {
      this.drawCornerBrackets(centerX, centerY, radius, Math.max(5, size * 0.075), Math.max(2, size * 0.022));
    } else {
      this.drawPixelRing(centerX, centerY, radius, Math.max(3, size * 0.022), reduced ? 20 : 32);
      const marks = reduced ? 4 : 8;
      for (let index = 0; index < marks; index += 1) {
        const angle = index / marks * TAU + progress * 0.45;
        const inner = radius * 0.72;
        this.drawSteppedLine(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
          centerX + Math.cos(angle) * inner,
          centerY + Math.sin(angle) * inner,
          2,
          3,
        );
      }
    }
    ctx.restore();
  }

  private drawImpactSemantic(
    semantic: ImpactSemantic,
    centerX: number,
    centerY: number,
    size: number,
    progress: number,
    alpha: number,
  ): void {
    const ctx = this.context;
    const radius = Math.max(7, size * (0.2 + progress * 0.16));
    const fade = clamp(alpha * (1 - progress * 0.56), 0, 0.92);
    ctx.save();
    ctx.globalAlpha = fade;
    if (semantic === 'physical' || semantic === 'bleed') {
      ctx.fillStyle = '#fff0c7';
      this.drawSteppedLine(centerX - radius, centerY + radius * 0.48, centerX + radius, centerY - radius * 0.52, Math.max(2, size * 0.045), 4);
      ctx.fillStyle = '#c8443f';
      this.drawSteppedLine(centerX + radius * 0.2, centerY - radius * 0.52, centerX + radius * 0.68, centerY - radius * 0.1, Math.max(2, size * 0.032), 4);
      if (semantic === 'bleed') {
        for (let index = 0; index < 3; index += 1) {
          const dropSize = Math.max(2, Math.round(size * (0.045 - index * 0.008)));
          const x = Math.round(centerX - radius * 0.35 + index * radius * 0.38);
          const y = Math.round(centerY + radius * (0.32 + index * 0.13));
          ctx.fillRect(x - 1, y - dropSize, 3, dropSize);
          ctx.fillRect(x - 2, y - 1, 5, 3);
        }
      }
    } else if (semantic === 'fire' || semantic === 'burn') {
      ctx.fillStyle = '#ff7b35';
      for (let index = -1; index <= 1; index += 1) {
        const x = centerX + index * radius * 0.52;
        const lift = radius * (0.42 + (index + 1) * 0.12 + progress * 0.35);
        this.drawSteppedLine(x, centerY + radius * 0.45, x + index * 2, centerY - lift, Math.max(2, size * 0.035), 4);
      }
      ctx.fillStyle = '#fff0a3';
      ctx.fillRect(Math.round(centerX) - 2, Math.round(centerY - radius * 0.52) - 3, 4, 6);
    } else if (semantic === 'ice' || semantic === 'slow') {
      const spike = radius * (semantic === 'slow' ? 0.72 : 1);
      ctx.fillStyle = '#dff8ff';
      this.drawHazardDiamond(centerX, centerY - spike, Math.max(3, Math.round(size * 0.055)), '#dff8ff');
      this.drawHazardDiamond(centerX, centerY + spike, Math.max(3, Math.round(size * 0.055)), '#dff8ff');
      this.drawHazardDiamond(centerX - spike, centerY, Math.max(3, Math.round(size * 0.055)), '#80cfee');
      this.drawHazardDiamond(centerX + spike, centerY, Math.max(3, Math.round(size * 0.055)), '#80cfee');
      if (semantic === 'slow') {
        ctx.fillStyle = '#133447';
        this.drawPixelRing(centerX, centerY, radius * 0.58, Math.max(2, size * 0.025), 16);
      }
    } else if (semantic === 'lightning' || semantic === 'paralysis') {
      const jitter = (progress * 17 % 2) * size * 0.025;
      ctx.fillStyle = '#bdfaff';
      this.drawSteppedLine(centerX - radius, centerY - radius * 0.55, centerX - jitter, centerY, Math.max(2, size * 0.04), 3);
      this.drawSteppedLine(centerX - jitter, centerY, centerX + radius, centerY + radius * 0.42, Math.max(2, size * 0.04), 3);
      ctx.fillStyle = '#2daac1';
      this.drawCornerBrackets(centerX, centerY, radius * 0.72, Math.max(3, radius * 0.28), Math.max(1, size * 0.022));
    } else if (semantic === 'poison' || semantic === 'poison-cloud' || semantic === 'poison-residual') {
      const bubbleCount = semantic === 'poison-cloud' ? 7 : 4;
      ctx.fillStyle = '#9bdd48';
      for (let index = 0; index < bubbleCount; index += 1) {
        const angle = index / bubbleCount * TAU + progress * 0.9;
        const distance = radius * (0.42 + (index % 2) * 0.34);
        const bubbleSize = Math.max(2, Math.round(size * (index % 3 === 0 ? 0.055 : 0.034)));
        const x = Math.round(centerX + Math.cos(angle) * distance);
        const y = Math.round(centerY + Math.sin(angle) * distance);
        ctx.fillRect(x - bubbleSize, y - bubbleSize, bubbleSize * 2, bubbleSize * 2);
        ctx.fillStyle = '#eaff91';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.fillStyle = '#9bdd48';
      }
    } else {
      // Arcane/stun: lõi trắng-xanh và bốn góc vỡ, không dựa vào tím.
      ctx.fillStyle = '#e9fbff';
      this.drawHazardDiamond(centerX, centerY, Math.max(4, Math.round(size * 0.075)), '#e9fbff');
      ctx.fillStyle = '#6ac7e8';
      this.drawCornerBrackets(centerX, centerY, radius, Math.max(4, radius * 0.34), Math.max(2, size * 0.028));
      if (semantic === 'stun') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(centerX) - 2, Math.round(centerY - radius * 1.2), 4, Math.max(5, Math.round(size * 0.09)));
        ctx.fillRect(Math.round(centerX) - 2, Math.round(centerY - radius * 0.55), 4, 3);
      }
    }
    ctx.restore();
  }

  private drawFloatingText(scene: RenderScene): void {
    const ctx = this.context;
    const aftermathLimit = scene.player.bossAftermathActive() ? 48 : Number.POSITIVE_INFINITY;
    let renderedText = 0;
    scene.floatingText.pool.forEachActive((text) => {
      if (!this.camera.isVisible(text.x, text.y, 50)) return;
      if (renderedText >= aftermathLimit) return;
      renderedText += 1;
      const screen = this.camera.worldToScreen(text.x, text.y);
      const ratio = clamp(text.life / Math.max(0.001, text.maxLife), 0, 1);
      const progress = 1 - ratio;
      const x = Math.round(screen.x + text.horizontalOffset);
      const y = Math.round(screen.y - (text.critical ? Math.sin(progress * Math.PI) * 3 : 0));
      const displayColor = text.kind === 'arcane' ? '#85d9f2' : text.color;
      ctx.save();
      ctx.globalAlpha = Math.min(1, ratio * 1.8);
      ctx.fillStyle = displayColor;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.lineWidth = 4;
      ctx.font = `${text.critical ? 900 : 750} ${text.size}px ui-monospace, "Cascadia Mono", monospace`;
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(text.value).width;
      this.drawDamageTextGlyph(text.kind, x - textWidth * 0.5 - (text.critical ? 13 : 10), y - text.size * 0.32, text.critical ? 7 : 5, displayColor);
      ctx.fillStyle = displayColor;
      ctx.strokeText(text.value, x, y);
      ctx.fillText(text.value, x, y);
      if (text.critical) {
        ctx.globalAlpha *= 0.86;
        ctx.fillStyle = '#fff2a1';
        const arm = Math.max(6, Math.round(text.size * 0.48));
        ctx.fillRect(x - arm, y + 5, arm * 2, 2);
        ctx.fillRect(x - 1, y - text.size - 3, 3, 6);
      }
      ctx.restore();
    });
  }

  private drawDamageTextGlyph(
    kind: FloatingTextKind,
    centerX: number,
    centerY: number,
    radius: number,
    color: string,
  ): void {
    const ctx = this.context;
    const x = Math.round(centerX);
    const y = Math.round(centerY);
    const r = Math.max(4, Math.round(radius));
    ctx.fillStyle = 'rgba(1, 7, 9, .82)';
    ctx.fillRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
    ctx.fillStyle = color;
    switch (kind) {
      case 'physical':
        this.drawSteppedLine(x - r + 1, y + r - 1, x + r - 1, y - r + 1, 2, 3);
        ctx.fillStyle = '#c8443f';
        ctx.fillRect(x + 2, y + 1, 3, 3);
        break;
      case 'bleed':
        ctx.fillRect(x - 2, y - r + 1, 4, r + 1);
        ctx.fillRect(x - 4, y, 8, 5);
        ctx.fillStyle = '#fff0c7';
        ctx.fillRect(x - 1, y, 2, 2);
        break;
      case 'fire':
        ctx.fillRect(x - 2, y - r + 1, 4, r * 2 - 2);
        ctx.fillRect(x - r + 2, y + 1, 4, r - 1);
        ctx.fillRect(x + r - 5, y - 1, 4, r);
        ctx.fillStyle = '#fff0a3';
        ctx.fillRect(x - 1, y - 2, 3, 5);
        break;
      case 'ice':
        ctx.fillRect(x - 1, y - r + 1, 3, r * 2 - 2);
        ctx.fillRect(x - r + 1, y - 1, r * 2 - 2, 3);
        ctx.fillRect(x - 3, y - 3, 7, 7);
        break;
      case 'lightning':
        this.drawSteppedLine(x - r + 1, y - r + 1, x + 1, y, 2, 2);
        this.drawSteppedLine(x + 1, y, x + r - 1, y + r - 1, 2, 2);
        break;
      case 'poison':
        ctx.fillRect(x - r + 1, y - 1, 4, 4);
        ctx.fillRect(x, y - r + 1, 5, 5);
        ctx.fillRect(x + 1, y + 1, 4, 4);
        ctx.fillStyle = '#eaff91';
        ctx.fillRect(x + 1, y - r + 2, 2, 2);
        break;
      case 'arcane':
        ctx.fillStyle = '#6ac7e8';
        this.drawCornerBrackets(x, y, r - 1, Math.max(2, r * 0.48), 2);
        ctx.fillStyle = '#e9fbff';
        ctx.fillRect(x - 2, y - 2, 5, 5);
        break;
      case 'incoming':
        this.drawSteppedLine(x - r + 1, y - 2, x, y + r - 1, 2, 2);
        this.drawSteppedLine(x, y + r - 1, x + r - 1, y - 2, 2, 2);
        break;
      case 'dodge':
        this.drawSteppedLine(x - r + 1, y + r - 1, x - 1, y - r + 1, 2, 2);
        this.drawSteppedLine(x + 1, y + r - 1, x + r - 1, y - r + 1, 2, 2);
        break;
      case 'healing':
        ctx.fillRect(x - 2, y - r + 1, 4, r * 2 - 2);
        ctx.fillRect(x - r + 1, y - 2, r * 2 - 2, 4);
        break;
      default:
        ctx.fillRect(x - 1, y - r + 1, 3, r * 2 - 2);
        ctx.fillRect(x - r + 1, y - 1, r * 2 - 2, 3);
        break;
    }
  }

  private drawProjectileAtlasSprite(
    projectile: Projectile,
    atlasIndex: number,
    x: number,
    y: number,
    directionX: number,
    directionY: number,
  ): boolean {
    const image = this.assets.get(PROJECTILE_ATLAS_PATH);
    if (!image) return false;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const cellWidth = sourceWidth / PROJECTILE_ATLAS_COLUMNS;
    const cellHeight = sourceHeight / PROJECTILE_ATLAS_ROWS;
    const safeIndex = clamp(Math.floor(atlasIndex), 0, PROJECTILE_ATLAS_COLUMNS * PROJECTILE_ATLAS_ROWS - 1);
    const sourceX = safeIndex % PROJECTILE_ATLAS_COLUMNS * cellWidth;
    const sourceY = Math.floor(safeIndex / PROJECTILE_ATLAS_COLUMNS) * cellHeight;
    const drawSize = Math.round(clamp(projectile.radius * (projectile.critical ? 7.2 : 6.4), 34, 86));
    const angle = Math.atan2(directionY, directionX);
    const lead = projectile.radius * 0.22;
    const ctx = this.context;
    ctx.save();
    ctx.translate(Math.round(x + directionX * lead), Math.round(y + directionY * lead));
    ctx.rotate(angle);
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      cellWidth,
      cellHeight,
      Math.round(-drawSize / 2),
      Math.round(-drawSize / 2),
      drawSize,
      drawSize,
    );
    ctx.restore();
    return true;
  }

  private drawVfxFrame(row: number, frame: number, x: number, y: number, size: number, alpha = 1): boolean {
    const image = this.assets.get(VFX_ATLAS_PATH);
    if (!image) return false;
    const ctx = this.context;
    const safeRow = clamp(Math.floor(row), 0, 4);
    const safeFrame = clamp(Math.floor(frame), 0, 5);
    const drawSize = Math.max(4, Math.round(size));
    ctx.save();
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    ctx.translate(Math.round(x), Math.round(y));
    ctx.drawImage(
      image,
      safeFrame * VFX_CELL_WIDTH,
      safeRow * VFX_CELL_HEIGHT,
      VFX_CELL_WIDTH,
      VFX_CELL_HEIGHT,
      Math.round(-drawSize / 2),
      Math.round(-drawSize / 2),
      drawSize,
      drawSize,
    );
    ctx.restore();
    return true;
  }

  private drawStatusVfxFrame(row: number, frame: number, x: number, y: number, size: number, alpha = 1): boolean {
    const image = this.assets.get(STATUS_VFX_ATLAS_PATH);
    if (!image) return false;
    const ctx = this.context;
    const safeRow = clamp(Math.floor(row), 0, 1);
    const safeFrame = clamp(Math.floor(frame), 0, 5);
    const sourceSize = STATUS_VFX_CELL_SIZE - STATUS_VFX_INSET * 2;
    const drawSize = Math.max(4, Math.round(size));
    ctx.save();
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    ctx.translate(Math.round(x), Math.round(y));
    ctx.drawImage(
      image,
      safeFrame * STATUS_VFX_CELL_SIZE + STATUS_VFX_INSET,
      safeRow * STATUS_VFX_CELL_SIZE + STATUS_VFX_INSET,
      sourceSize,
      sourceSize,
      Math.round(-drawSize / 2),
      Math.round(-drawSize / 2),
      drawSize,
      drawSize,
    );
    ctx.restore();
    return true;
  }

  private drawToxicSmokeFrame(row: number, frame: number, x: number, y: number, size: number, alpha = 1): boolean {
    const image = this.assets.get(TOXIC_SMOKE_VFX_PATH);
    if (!image) return false;
    const safeRow = clamp(Math.floor(row), 0, 1);
    const safeFrame = clamp(Math.floor(frame), 0, 3);
    const drawSize = Math.max(4, Math.round(size));
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    ctx.translate(Math.round(x), Math.round(y));
    ctx.drawImage(
      image,
      safeFrame * TOXIC_SMOKE_CELL_SIZE,
      safeRow * TOXIC_SMOKE_CELL_SIZE,
      TOXIC_SMOKE_CELL_SIZE,
      TOXIC_SMOKE_CELL_SIZE,
      Math.round(-drawSize / 2),
      Math.round(-drawSize / 2),
      drawSize,
      drawSize,
    );
    ctx.restore();
    return true;
  }

  private drawPixelRing(centerX: number, centerY: number, radius: number, blockSize: number, segments = 32): void {
    const ctx = this.context;
    const safeRadius = Math.max(1, radius);
    const size = Math.max(1, Math.round(blockSize));
    const count = Math.max(12, Math.min(72, Math.round(segments)));
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * TAU;
      ctx.fillRect(
        Math.round(centerX + Math.cos(angle) * safeRadius - size * 0.5),
        Math.round(centerY + Math.sin(angle) * safeRadius - size * 0.5),
        size,
        size,
      );
    }
  }

  private drawHatchedCircle(centerX: number, centerY: number, radius: number, spacing: number, thickness: number): void {
    const ctx = this.context;
    const safeRadius = Math.max(4, radius);
    const step = Math.max(8, Math.round(spacing));
    const line = Math.max(1, Math.round(thickness));
    for (let offsetY = -safeRadius; offsetY <= safeRadius; offsetY += step) {
      const halfWidth = Math.sqrt(Math.max(0, safeRadius * safeRadius - offsetY * offsetY));
      const stagger = Math.abs(Math.round(offsetY / step)) % 2 === 0 ? 0 : step * 0.45;
      const width = Math.max(0, halfWidth * 2 - stagger * 2);
      ctx.fillRect(
        Math.round(centerX - width * 0.5),
        Math.round(centerY + offsetY),
        Math.round(width),
        line,
      );
    }
  }

  private drawHatchedAnnulus(centerX: number, centerY: number, radius: number, thickness: number, segments: number): void {
    const count = Math.max(12, Math.min(48, Math.round(segments)));
    const halfThickness = Math.max(5, thickness * 0.5);
    for (let index = 0; index < count; index += 1) {
      if (index % 2 !== 0) continue;
      const angle = index / count * TAU;
      this.drawSteppedLine(
        centerX + Math.cos(angle) * (radius - halfThickness),
        centerY + Math.sin(angle) * (radius - halfThickness),
        centerX + Math.cos(angle) * (radius + halfThickness),
        centerY + Math.sin(angle) * (radius + halfThickness),
        3,
        5,
      );
    }
  }

  private drawRadialCracks(centerX: number, centerY: number, radius: number, count: number, offset: number, width: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * TAU + offset;
      const side = index % 2 === 0 ? 0.075 : -0.075;
      const midRadius = radius * (0.44 + index % 3 * 0.04);
      const midX = centerX + Math.cos(angle + side) * midRadius;
      const midY = centerY + Math.sin(angle + side) * midRadius;
      this.drawSteppedLine(centerX, centerY, midX, midY, width, 5);
      this.drawSteppedLine(
        midX,
        midY,
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        Math.max(2, width - 2),
        5,
      );
    }
  }

  private drawHazardDiamond(centerX: number, centerY: number, radius: number, color: string): void {
    const ctx = this.context;
    const safeRadius = Math.max(3, Math.round(radius));
    const step = Math.max(2, Math.round(safeRadius / 3));
    ctx.fillStyle = color;
    for (let offsetY = -safeRadius; offsetY <= safeRadius; offsetY += step) {
      const normalized = Math.abs(offsetY) / safeRadius;
      const halfWidth = Math.max(1, Math.round(safeRadius * (1 - normalized)));
      ctx.fillRect(centerX - halfWidth, centerY + offsetY, halfWidth * 2 + 1, step);
    }
  }

  private drawCornerBrackets(centerX: number, centerY: number, arm: number, corner: number, thickness: number): void {
    const ctx = this.context;
    const a = Math.max(3, Math.round(arm));
    const c = Math.max(2, Math.round(corner));
    const t = Math.max(1, Math.round(thickness));
    ctx.fillRect(centerX - a, centerY - a, c, t);
    ctx.fillRect(centerX - a, centerY - a, t, c);
    ctx.fillRect(centerX + a - c, centerY - a, c, t);
    ctx.fillRect(centerX + a - t, centerY - a, t, c);
    ctx.fillRect(centerX - a, centerY + a - t, c, t);
    ctx.fillRect(centerX - a, centerY + a - c, t, c);
    ctx.fillRect(centerX + a - c, centerY + a - t, c, t);
    ctx.fillRect(centerX + a - t, centerY + a - c, t, c);
  }

  private drawPlayerProjectileStar(centerX: number, centerY: number, radius: number): void {
    const ctx = this.context;
    const arm = Math.max(3, Math.round(radius));
    ctx.fillStyle = '#e8ffff';
    ctx.fillRect(centerX - 1, centerY - arm, 3, arm * 2 + 1);
    ctx.fillRect(centerX - arm, centerY - 1, arm * 2 + 1, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerX - 1, centerY - 1, 3, 3);
  }

  private drawSteppedLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    pixelSize: number,
    stepSize: number,
  ): void {
    const ctx = this.context;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.hypot(deltaX, deltaY);
    const count = Math.min(160, Math.max(1, Math.ceil(distance / Math.max(2, stepSize))));
    const size = Math.max(1, Math.round(pixelSize));
    for (let index = 0; index <= count; index += 1) {
      const progress = index / count;
      ctx.fillRect(
        Math.round(startX + deltaX * progress - size * 0.5),
        Math.round(startY + deltaY * progress - size * 0.5),
        size,
        size,
      );
    }
  }

  private drawPixelDiamond(radius: number, color: string, centerColor: string): void {
    const ctx = this.context;
    const unit = Math.max(2, Math.round(radius / 4));
    const widths = [1, 3, 5, 7, 5, 3, 1] as const;
    ctx.fillStyle = '#031014';
    for (let row = 0; row < widths.length; row += 1) {
      const width = (widths[row] ?? 1) * unit + 4;
      ctx.fillRect(Math.round(-width / 2), (row - 3) * unit - 2, width, unit + 4);
    }
    ctx.fillStyle = color;
    for (let row = 0; row < widths.length; row += 1) {
      const width = (widths[row] ?? 1) * unit;
      ctx.fillRect(Math.round(-width / 2), (row - 3) * unit, width, unit);
    }
    ctx.fillStyle = centerColor;
    ctx.fillRect(-unit, -unit, unit * 2, unit * 2);
  }

  private drawEnemyMarker(enemy: Enemy, x: number, y: number): void {
    const ctx = this.context;
    const centerX = Math.round(x);
    const centerY = Math.round(y);
    if (enemy.isBoss) {
      ctx.fillStyle = '#020708';
      ctx.fillRect(centerX - 13, centerY - 9, 26, 16);
      ctx.fillStyle = '#ffe06f';
      ctx.fillRect(centerX - 10, centerY + 1, 20, 4);
      ctx.fillRect(centerX - 10, centerY - 5, 4, 8);
      ctx.fillRect(centerX - 2, centerY - 8, 4, 11);
      ctx.fillRect(centerX + 6, centerY - 5, 4, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(centerX - 1, centerY - 5, 2, 3);
    } else if (enemy.isElite) {
      ctx.fillStyle = '#020708';
      ctx.fillRect(centerX - 3, centerY - 10, 6, 20);
      ctx.fillRect(centerX - 10, centerY - 3, 20, 6);
      ctx.fillStyle = '#e79bff';
      ctx.fillRect(centerX - 2, centerY - 7, 4, 14);
      ctx.fillRect(centerX - 7, centerY - 2, 14, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(centerX - 1, centerY - 1, 2, 2);
    }
  }

  private drawEnemyStatusAura(enemy: Enemy, time: number, size: number): void {
    let row: number | null = null;
    if (enemy.status.blindTime > 0) row = 3;
    else if (enemy.status.paralysisTime > 0 || enemy.status.shockTime > 0) row = 0;
    else if (enemy.status.burnTime > 0) row = 1;
    else if (enemy.status.slowTime > 0) row = 2;
    else if (enemy.status.stunTime > 0) row = 3;
    else if (enemy.shield > 0) row = 4;
    const frame = Math.floor(time * 10 + enemy.id) % 6;
    if (row !== null) this.drawVfxFrame(row, frame, 0, 0, Math.round(size * 1.18), row === 3 ? 0.2 : 0.34);
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = enemy.alpha * 0.78;
    if (enemy.status.bleedTime > 0) {
      // Ivory slash + crimson notches: physical/bleed không dùng cùng hình
      // lửa, kể cả khi hai màu đỏ nằm gần nhau.
      ctx.fillStyle = '#fff0c7';
      this.drawSteppedLine(-enemy.radius * 0.78, enemy.radius * 0.28, enemy.radius * 0.72, -enemy.radius * 0.34, 3, 4);
      ctx.fillStyle = '#c8443f';
      const drip = 2 + Math.floor((time * 5 + enemy.id) % 3);
      ctx.fillRect(-enemy.radius - 6, -2, 4, 7 + drip);
      ctx.fillRect(enemy.radius + 2, 3, 4, 5 + (2 - drip));
      const tickPulse = clamp((enemy.status.bleedTick - 0.84) / 0.16, 0, 1);
      if (tickPulse > 0) {
        ctx.globalAlpha *= tickPulse;
        this.drawPixelRing(0, 0, enemy.radius + 4 + (1 - tickPulse) * 8, 2, 14);
        ctx.globalAlpha = enemy.alpha * 0.78;
      }
    }
    if (enemy.status.poisonTime > 0 || enemy.status.poisonCloudTime > 0) {
      ctx.fillStyle = '#8bd34a';
      this.drawPixelRing(0, 0, enemy.radius + 10, 3, 18);
      for (let index = 0; index < 3; index += 1) {
        const angle = index / 3 * TAU + time * 0.55 + enemy.id;
        const distance = enemy.radius + 5 + index * 3;
        const x = Math.round(Math.cos(angle) * distance);
        const y = Math.round(Math.sin(angle) * distance);
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = '#eaff91';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.fillStyle = '#8bd34a';
      }
      if (enemy.status.poisonCloudTime > 0) {
        const tickPulse = clamp((enemy.status.poisonCloudTick - 0.84) / 0.16, 0, 1);
        if (tickPulse > 0) {
          ctx.globalAlpha *= tickPulse;
          ctx.fillStyle = '#eaff91';
          this.drawPixelRing(0, 0, enemy.radius + 5 + (1 - tickPulse) * 7, 2, 16);
          ctx.globalAlpha = enemy.alpha * 0.78;
        }
      }
    }
    if (enemy.status.slowTime > 0) {
      ctx.fillStyle = '#dff8ff';
      for (let index = 0; index < 4; index += 1) {
        const angle = index / 4 * TAU;
        const x = Math.round(Math.cos(angle) * (enemy.radius + 7));
        const y = Math.round(Math.sin(angle) * (enemy.radius + 7));
        this.drawHazardDiamond(x, y, 3, index % 2 === 0 ? '#dff8ff' : '#70c9e9');
      }
    }
    if (enemy.status.shockTime > 0 || enemy.status.paralysisTime > 0) {
      ctx.fillStyle = '#bdfaff';
      const phase = ((time * 15 + enemy.id) % 2) * 3;
      this.drawSteppedLine(-enemy.radius - 7, -5, -phase, 0, 2, 3);
      this.drawSteppedLine(-phase, 0, enemy.radius + 7, 5, 2, 3);
    }
    if (enemy.status.burnTime > 0) {
      const tickPulse = clamp((enemy.status.burnTick - 0.18) / 0.07, 0, 1);
      ctx.fillStyle = tickPulse > 0 ? '#fff0a3' : '#ff7b35';
      const flameHeight = enemy.radius + 7 + tickPulse * 5;
      this.drawSteppedLine(-5, enemy.radius * 0.2, -3, -flameHeight, 3, 4);
      this.drawSteppedLine(5, enemy.radius * 0.25, 7, -flameHeight * 0.72, 2, 4);
    }
    if (enemy.status.stunTime > 0) {
      ctx.fillStyle = '#e9fbff';
      this.drawCornerBrackets(0, 0, enemy.radius + 8, 6, 2);
      ctx.fillStyle = '#65bddf';
      ctx.fillRect(-2, -enemy.radius - 16, 4, 8);
      ctx.fillRect(-2, -enemy.radius - 5, 4, 3);
    }
    if (enemy.status.blindTime > 0) {
      ctx.fillStyle = '#9dd9ea';
      for (let index = 0; index < 6; index += 1) {
        const angle = index / 6 * TAU + time * 0.9 + enemy.id * 0.13;
        const distance = enemy.radius + 9 + (index % 2) * 5;
        const shardX = Math.round(Math.cos(angle) * distance);
        const shardY = Math.round(Math.sin(angle) * distance);
        ctx.fillRect(shardX - 2, shardY - 1, 5, 3);
        ctx.fillRect(shardX, shardY - 3, 2, 7);
      }
    }
    ctx.restore();
  }

  private drawPoisonResidualCue(enemy: Enemy, time: number): void {
    const ctx = this.context;
    const remaining = clamp(Math.min(enemy.status.poisonCloudTime, enemy.status.slowTime) / 3, 0, 1);
    const segments = Math.max(1, Math.ceil(6 * remaining));
    ctx.save();
    ctx.globalAlpha = enemy.alpha * (0.38 + remaining * 0.42);
    ctx.fillStyle = '#b8e85d';
    for (let index = 0; index < segments; index += 1) {
      const angle = index / 6 * TAU - Math.PI / 2;
      const radius = enemy.radius + 14;
      const x = Math.round(Math.cos(angle) * radius);
      const y = Math.round(Math.sin(angle) * radius);
      ctx.fillRect(x - 2, y - 2, 5, 5);
    }
    const dripY = Math.round(((time * 18 + enemy.id * 3) % 7));
    ctx.fillStyle = '#eefca9';
    ctx.fillRect(-2, enemy.radius + 7 + dripY, 4, 5);
    ctx.fillRect(-4, enemy.radius + 10 + dripY, 8, 3);
    ctx.restore();
  }

  private drawEnemyStatusIcons(enemy: Enemy, centerX: number, y: number, time: number): void {
    if (
      enemy.status.burnTime <= 0
      && enemy.status.bleedTime <= 0
      && enemy.status.slowTime <= 0
      && enemy.status.shockTime <= 0
      && enemy.status.paralysisTime <= 0
      && enemy.status.blindTime <= 0
      && enemy.status.poisonTime <= 0
      && enemy.status.poisonCloudTime <= 0
      && enemy.status.stunTime <= 0
      && enemy.status.healingReduction <= 0
      && enemy.shield <= 0
    ) return;
    const statuses: Array<{ row: number; color: string }> = [];
    if (enemy.status.bleedTime > 0) statuses.push({ row: -4, color: '#c8443f' });
    if (enemy.status.burnTime > 0) statuses.push({ row: 1, color: '#ff7546' });
    if (enemy.status.slowTime > 0) statuses.push({ row: 2, color: '#72d8ff' });
    if (enemy.status.shockTime > 0 || enemy.status.paralysisTime > 0) statuses.push({ row: 0, color: '#62a7ff' });
    if (enemy.status.blindTime > 0) statuses.push({ row: 3, color: '#c879ff' });
    if (enemy.status.poisonTime > 0 || enemy.status.poisonCloudTime > 0) statuses.push({ row: -1, color: '#68dc72' });
    if (enemy.status.stunTime > 0) statuses.push({ row: -2, color: '#ffe76a' });
    if (enemy.status.healingReduction > 0) statuses.push({ row: -3, color: '#ff7869' });
    if (enemy.shield > 0) statuses.push({ row: 4, color: '#72d8ff' });
    const visible = statuses.slice(0, 6);
    if (visible.length === 0) return;
    const spacing = 17;
    const startX = Math.round(centerX - (visible.length - 1) * spacing * 0.5);
    const frame = Math.floor(time * 8 + enemy.id) % 4;
    const ctx = this.context;
    for (let index = 0; index < visible.length; index += 1) {
      const status = visible[index];
      if (!status) continue;
      const x = startX + index * spacing;
      ctx.fillStyle = '#02080b';
      ctx.fillRect(x - 8, y - 8, 16, 16);
      if (status.row >= 0) {
        this.drawVfxFrame(status.row, frame, x, y, 15, 1);
      } else if (status.row === -1) {
        ctx.fillStyle = status.color;
        ctx.fillRect(x - 4, y - 4, 4, 4);
        ctx.fillRect(x + 1, y - 1, 4, 4);
        ctx.fillRect(x - 3, y + 3, 3, 3);
      } else if (status.row === -2) {
        ctx.fillStyle = status.color;
        ctx.fillRect(x - 2, y - 5, 4, 7);
        ctx.fillRect(x - 2, y + 4, 4, 3);
      } else if (status.row === -3) {
        ctx.fillStyle = status.color;
        ctx.fillRect(x - 5, y - 2, 10, 4);
        ctx.fillRect(x + 2, y - 5, 3, 3);
      } else {
        ctx.fillStyle = '#fff0c7';
        this.drawSteppedLine(x - 5, y + 3, x + 5, y - 3, 2, 3);
        ctx.fillStyle = status.color;
        ctx.fillRect(x + 2, y + 2, 3, 5);
        ctx.fillRect(x + 1, y + 5, 5, 3);
      }
    }
  }

  private drawScreenEdge(player: Player): void {
    const ratio = player.health / Math.max(1, player.stats.get('maxHp'));
    if (ratio > 0.32) return;
    const ctx = this.context;
    const alpha = clamp((0.32 - ratio) * 1.8, 0.08, 0.42);
    const border = Math.max(7, Math.round(Math.min(this.width, this.height) * 0.014));
    ctx.save();
    ctx.fillStyle = `rgba(225, 55, 58, ${alpha})`;
    ctx.fillRect(0, 0, this.width, border);
    ctx.fillRect(0, this.height - border, this.width, border);
    ctx.fillRect(0, border, border, this.height - border * 2);
    ctx.fillRect(this.width - border, border, border, this.height - border * 2);
    ctx.restore();
  }
}
