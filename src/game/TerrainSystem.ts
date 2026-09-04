import type { StageConfig } from '../core/Types.js';

export type TerrainFeatureKind = 'tree' | 'rock' | 'water';

export interface TerrainFeature {
  id: number;
  kind: TerrainFeatureKind;
  x: number;
  y: number;
  radius: number;
  radiusY: number;
  variant: number;
}

export interface TerrainActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface TerrainImpact {
  x: number;
  y: number;
  feature: TerrainFeature;
}

export interface TerrainDecoration {
  id: number;
  x: number;
  y: number;
  variant: number;
  scale: number;
  rotation: number;
}

export const TERRAIN_CELL_SIZE = 300;
export const TERRAIN_GRASS_CELL_SIZE = 150;
export const WATER_MOVEMENT_MULTIPLIER = 0.58;

function mixedHash(stageIndex: number, cellX: number, cellY: number): number {
  let value = Math.imul(cellX, 0x45d9f3b) ^ Math.imul(cellY, 0x119de1f3) ^ Math.imul(stageIndex, 0x27d4eb2d);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function unitFromHash(value: number): number {
  return (value >>> 0) / 0x1_0000_0000;
}

function segmentCircleEntry(
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
  const constant = offsetX * offsetX + offsetY * offsetY - radius * radius;
  if (constant <= 0) return 0;
  const quadratic = deltaX * deltaX + deltaY * deltaY;
  if (quadratic <= 0.000001) return null;
  const linear = 2 * (offsetX * deltaX + offsetY * deltaY);
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant < 0) return null;
  const root = (-linear - Math.sqrt(discriminant)) / (2 * quadratic);
  return root >= 0 && root <= 1 ? root : null;
}

/**
 * Địa hình vô hạn theo ô logic, nhưng mọi thứ người chơi nhìn thấy đều dùng
 * sprite bitmap thật. Seed bản đồ làm 20 chiến trường có bố cục riêng và ổn định.
 */
export class TerrainSystem {
  public readonly stage: StageConfig;
  private visible: TerrainFeature[] = [];
  private visibleDecorations: TerrainDecoration[] = [];
  private cacheX = Number.POSITIVE_INFINITY;
  private cacheY = Number.POSITIVE_INFINITY;
  private cacheWidth = 0;
  private cacheHeight = 0;

  public constructor(stage: StageConfig) {
    this.stage = stage;
  }

  public update(centerX: number, centerY: number, viewport: { width: number; height: number }): void {
    const width = Math.max(320, viewport.width);
    const height = Math.max(320, viewport.height);
    if (
      Math.abs(centerX - this.cacheX) < 90
      && Math.abs(centerY - this.cacheY) < 90
      && width === this.cacheWidth
      && height === this.cacheHeight
    ) return;
    this.cacheX = centerX;
    this.cacheY = centerY;
    this.cacheWidth = width;
    this.cacheHeight = height;
    const rangeX = width * 0.95 + TERRAIN_CELL_SIZE;
    const rangeY = height * 0.95 + TERRAIN_CELL_SIZE;
    const minX = Math.floor((centerX - rangeX) / TERRAIN_CELL_SIZE);
    const maxX = Math.ceil((centerX + rangeX) / TERRAIN_CELL_SIZE);
    const minY = Math.floor((centerY - rangeY) / TERRAIN_CELL_SIZE);
    const maxY = Math.ceil((centerY + rangeY) / TERRAIN_CELL_SIZE);
    const features: TerrainFeature[] = [];
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const feature = this.featureForCell(cellX, cellY);
        if (feature) features.push(feature);
      }
    }
    features.sort((left, right) => left.y - right.y || left.x - right.x);
    this.visible = features;
    this.visibleDecorations = this.buildDecorations(centerX, centerY, width, height, features);
  }

  public features(): readonly TerrainFeature[] {
    return this.visible;
  }

  public decorations(): readonly TerrainDecoration[] {
    return this.visibleDecorations;
  }

  public movementMultiplier(x: number, y: number): number {
    for (const feature of this.visible) {
      if (feature.kind !== 'water') continue;
      const dx = (x - feature.x) / feature.radius;
      const dy = (y - feature.y) / feature.radiusY;
      if (dx * dx + dy * dy <= 1) return WATER_MOVEMENT_MULTIPLIER;
    }
    return 1;
  }

  /** Đẩy nhân vật ra mép vật cản và bỏ thành phần vận tốc đâm vào tâm để tạo cảm giác trượt vòng. */
  public resolveActor(actor: TerrainActor, previousX = actor.x, previousY = actor.y): boolean {
    let collided = false;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const feature of this.visible) {
        if (feature.kind === 'water') continue;
        const minimum = actor.radius + feature.radius;
        let dx = actor.x - feature.x;
        let dy = actor.y - feature.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minimum) continue;
        collided = true;
        if (distance < 0.001) {
          dx = previousX - feature.x;
          dy = previousY - feature.y;
          distance = Math.max(0.001, Math.hypot(dx, dy));
        }
        const normalX = dx / distance;
        const normalY = dy / distance;
        actor.x = feature.x + normalX * minimum;
        actor.y = feature.y + normalY * minimum;
        const inwardVelocity = actor.vx * normalX + actor.vy * normalY;
        if (inwardVelocity < 0) {
          actor.vx -= normalX * inwardVelocity;
          actor.vy -= normalY * inwardVelocity;
        }
      }
    }
    return collided;
  }

  /** Trả va chạm sớm nhất để đạn tốc độ cao không xuyên qua cây/đá giữa hai frame. */
  public firstProjectileBlock(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    projectileRadius: number,
  ): TerrainImpact | null {
    let earliest = Number.POSITIVE_INFINITY;
    let hit: TerrainFeature | null = null;
    for (const feature of this.visible) {
      if (feature.kind === 'water') continue;
      const time = segmentCircleEntry(
        startX,
        startY,
        endX,
        endY,
        feature.x,
        feature.y,
        feature.radius + projectileRadius,
      );
      if (time === null || time >= earliest) continue;
      earliest = time;
      hit = feature;
    }
    if (!hit || !Number.isFinite(earliest)) return null;
    return {
      x: startX + (endX - startX) * earliest,
      y: startY + (endY - startY) * earliest,
      feature: hit,
    };
  }

  private featureForCell(cellX: number, cellY: number): TerrainFeature | null {
    const hash = mixedHash(this.stage.index, cellX, cellY);
    if (unitFromHash(hash) < 0.17) return null;
    const jitterX = unitFromHash(mixedHash(this.stage.index + 41, cellX, cellY));
    const jitterY = unitFromHash(mixedHash(this.stage.index + 83, cellX, cellY));
    const x = cellX * TERRAIN_CELL_SIZE + 55 + jitterX * (TERRAIN_CELL_SIZE - 110);
    const y = cellY * TERRAIN_CELL_SIZE + 55 + jitterY * (TERRAIN_CELL_SIZE - 110);
    // Khoảng xuất phát luôn thông thoáng để một run mới không kẹt trong vật cản.
    if (Math.hypot(x, y) < 230) return null;
    const kindRoll = unitFromHash(mixedHash(this.stage.index + 127, cellX, cellY));
    const kind: TerrainFeatureKind = kindRoll < 0.22 ? 'water' : kindRoll < 0.59 ? 'tree' : 'rock';
    const radius = kind === 'water' ? 78 : kind === 'tree' ? 42 : 39;
    return {
      id: mixedHash(this.stage.index + 211, cellX, cellY),
      kind,
      x,
      y,
      radius,
      radiusY: kind === 'water' ? 54 : radius,
      variant: (this.stage.index - 1 + ((hash >>> 20) & 3)) % 4,
    };
  }

  /** Phủ các khoảng trống bằng bụi cỏ bitmap, không tham gia va chạm. */
  private buildDecorations(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    features: readonly TerrainFeature[],
  ): TerrainDecoration[] {
    const rangeX = width * 0.72 + TERRAIN_GRASS_CELL_SIZE;
    const rangeY = height * 0.72 + TERRAIN_GRASS_CELL_SIZE;
    const minX = Math.floor((centerX - rangeX) / TERRAIN_GRASS_CELL_SIZE);
    const maxX = Math.ceil((centerX + rangeX) / TERRAIN_GRASS_CELL_SIZE);
    const minY = Math.floor((centerY - rangeY) / TERRAIN_GRASS_CELL_SIZE);
    const maxY = Math.ceil((centerY + rangeY) / TERRAIN_GRASS_CELL_SIZE);
    const decorations: TerrainDecoration[] = [];
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const hash = mixedHash(this.stage.index + 401, cellX, cellY);
        // Chừa một ít đất trống để mặt đất vẫn đọc được, nhưng phủ gần toàn bộ vùng còn lại.
        if (unitFromHash(hash) < 0.14) continue;
        const jitterX = unitFromHash(mixedHash(this.stage.index + 443, cellX, cellY));
        const jitterY = unitFromHash(mixedHash(this.stage.index + 487, cellX, cellY));
        const x = cellX * TERRAIN_GRASS_CELL_SIZE + 28 + jitterX * (TERRAIN_GRASS_CELL_SIZE - 56);
        const y = cellY * TERRAIN_GRASS_CELL_SIZE + 28 + jitterY * (TERRAIN_GRASS_CELL_SIZE - 56);
        const overlapsFeature = features.some((feature) => {
          const padding = feature.kind === 'water' ? 24 : 18;
          const dx = (x - feature.x) / (feature.radius + padding);
          const dy = (y - feature.y) / (feature.radiusY + padding);
          return dx * dx + dy * dy <= 1;
        });
        if (overlapsFeature) continue;
        decorations.push({
          id: mixedHash(this.stage.index + 523, cellX, cellY),
          x,
          y,
          variant: (this.stage.index - 1 + ((hash >>> 17) & 7)) % 8,
          scale: 0.72 + unitFromHash(mixedHash(this.stage.index + 571, cellX, cellY)) * 0.38,
          rotation: (unitFromHash(mixedHash(this.stage.index + 613, cellX, cellY)) - 0.5) * 0.28,
        });
      }
    }
    decorations.sort((left, right) => left.y - right.y || left.x - right.x);
    return decorations;
  }
}
