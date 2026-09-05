import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SpatialHash } from '../dist/src/core/SpatialHash.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';
import { TerrainSystem, WATER_MOVEMENT_MULTIPLIER } from '../dist/src/game/TerrainSystem.js';

const root = new URL('../', import.meta.url);
const stages = JSON.parse(await readFile(new URL('public/data/stages.json', root), 'utf8'));

test('all 20 existing maps receive deterministic trees, rocks, water, and dense bitmap ground cover', () => {
  assert.equal(stages.length, 20, 'terrain work must not change the requested 20-map scope');
  const signatures = new Set();
  for (const stage of stages) {
    const terrain = new TerrainSystem(stage);
    terrain.update(1200, 900, { width: 2400, height: 1800 });
    const features = terrain.features();
    assert.ok(features.some((feature) => feature.kind === 'tree'), `${stage.id} needs trees`);
    assert.ok(features.some((feature) => feature.kind === 'rock'), `${stage.id} needs rocks`);
    assert.ok(features.some((feature) => feature.kind === 'water'), `${stage.id} needs water`);
    assert.ok(terrain.decorations().length >= 100, `${stage.id} needs broad small-plant coverage`);
    signatures.add(features.slice(0, 16).map((feature) => `${feature.kind}:${feature.variant}:${Math.round(feature.x)}:${Math.round(feature.y)}`).join('|'));
  }
  assert.equal(signatures.size, 20, 'each map must keep a distinct deterministic terrain layout');
});

test('water slows actors while trees and rocks slide actors out and block swept projectiles', () => {
  const terrain = new TerrainSystem(stages[0]);
  terrain.update(1200, 900, { width: 2400, height: 1800 });
  const water = terrain.features().find((feature) => feature.kind === 'water');
  const obstacle = terrain.features().find((feature) => feature.kind === 'tree' || feature.kind === 'rock');
  assert.ok(water && obstacle);
  assert.equal(terrain.movementMultiplier(water.x, water.y), WATER_MOVEMENT_MULTIPLIER);

  const actor = { x: obstacle.x, y: obstacle.y, vx: 70, vy: 20, radius: 14 };
  assert.equal(terrain.resolveActor(actor, obstacle.x - 80, obstacle.y), true);
  assert.ok(Math.hypot(actor.x - obstacle.x, actor.y - obstacle.y) >= obstacle.radius + actor.radius - 0.001);

  const hit = terrain.firstProjectileBlock(
    obstacle.x - obstacle.radius - 80,
    obstacle.y,
    obstacle.x + obstacle.radius + 80,
    obstacle.y,
    3,
  );
  assert.equal(hit?.feature.id, obstacle.id);
});

test('the same terrain blocker stops both player and enemy bullets', () => {
  const projectiles = new ProjectileSystem();
  const common = {
    sourceWeaponId: 'terrain-test', element: 'physical', x: 0, y: 0,
    vx: 100, vy: 0, damage: 10, radius: 2, life: 2, trail: false,
  };
  projectiles.spawn(common);
  projectiles.spawn({ ...common, faction: 'enemy' });
  const enemySpatial = new SpatialHash(128);
  enemySpatial.rebuild([]);
  let terrainBursts = 0;
  const terrain = {
    firstProjectileBlock: () => ({
      x: 40,
      y: 0,
      feature: { id: 1, kind: 'tree', x: 44, y: 0, radius: 20, radiusY: 20, variant: 0 },
    }),
  };
  projectiles.update(1, {
    player: { x: 1000, y: 1000, radius: 10 },
    enemies: [],
    enemySpatial,
    terrain,
    rng: { chance: () => false },
    particles: {
      spawn: () => null,
      burst: () => { terrainBursts += 1; },
      ring: () => {},
    },
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    damagePlayer: () => assert.fail('blocked enemy bullet must not hit the player'),
    nearestEnemy: () => null,
  });
  assert.equal(projectiles.pool.countActive(), 0);
  assert.equal(terrainBursts, 2);
});

test('renderer uses bitmap terrain atlases and no square-grid shader', async () => {
  const [renderer, presenter, main] = await Promise.all([
    readFile(new URL('src/render/Renderer.ts', root), 'utf8'),
    readFile(new URL('src/render/GpuCanvasPresenter.ts', root), 'utf8'),
    readFile(new URL('src/main.ts', root), 'utf8'),
  ]);
  assert.match(renderer, /terrain-props-atlas-v1\.png/u);
  assert.match(renderer, /terrain-grass-atlas-v1\.png/u);
  assert.match(renderer, /this\.assets\.get\(GROUND_TEXTURE_PATH\)/u);
  assert.match(renderer, /groundPatterns/u);
  assert.match(renderer, /terrain\.decorations\(\)/u);
  assert.doesNotMatch(presenter, /gridCell|minorGrid|majorGrid|landmarkMark/u);
  assert.match(main, /terrain-props-atlas-v1\.png/u);
  assert.match(main, /terrain-grass-atlas-v1\.png/u);
});

test('terrain atlases are transparent PNG assets', async () => {
  for (const name of ['terrain-props-atlas-v1.png', 'terrain-grass-atlas-v1.png']) {
    const png = await readFile(new URL(`public/assets/generated/terrain-v1/${name}`, root));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, `${name} must use RGBA transparency`);
    assert.ok(png.readUInt32BE(16) >= 1024);
    assert.ok(png.readUInt32BE(20) >= 768);
  }
});
