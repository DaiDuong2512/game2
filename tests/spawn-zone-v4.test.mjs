import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RNG } from '../dist/src/core/RNG.js';
import { Director } from '../dist/src/game/Director.js';
import {
  EnemySpawner,
  VIEWPORT_SPAWN_INNER_RADIUS,
  VIEWPORT_SPAWN_OUTER_RADIUS,
  viewportSpawnOffset,
} from '../dist/src/game/EnemySpawner.js';

const scaling = { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 };
const enemyConfig = {
  id: 'test-riftling',
  name: 'Quái thử nghiệm',
  ai: 'melee',
  tier: 'normal',
  sprite: '',
  cost: 1,
  baseHealth: 10,
  baseDamage: 2,
  speed: 80,
  radius: 10,
  exp: 1,
  gold: 0,
  spawnMinStage: 1,
  attackRange: 24,
  attackCooldown: 1,
  projectileSpeed: 0,
};

function normalizedEllipseRadius(enemy, centerX, centerY, viewport) {
  return Math.hypot(
    (enemy.x - centerX) / (viewport.width * 0.5),
    (enemy.y - centerY) / (viewport.height * 0.5),
  );
}

test('helper ánh xạ đúng vành 1/3–1,5 lần bán kính màn hình', () => {
  const viewport = { width: 1600, height: 900 };
  const inner = viewportSpawnOffset(viewport, 0, 0);
  const outer = viewportSpawnOffset(viewport, 0.25, 1);

  assert.ok(Math.abs(inner.x - viewport.width / 3) < 1e-9);
  assert.ok(Math.abs(inner.y) < 1e-9);
  assert.equal(inner.normalizedRadius, VIEWPORT_SPAWN_INNER_RADIUS);
  assert.ok(Math.abs(outer.x) < 1e-9);
  assert.ok(Math.abs(outer.y - viewport.height * 0.75) < 1e-9);
  assert.equal(outer.normalizedRadius, VIEWPORT_SPAWN_OUTER_RADIUS);
});

test('desktop và mobile đều sinh quái trong vành ellipse tới 1,5 màn hình', () => {
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const data = { enemyById: new Map([[enemyConfig.id, enemyConfig]]) };
    const spawner = new EnemySpawner(data, new RNG(0x51a7));
    const centerX = 12_000;
    const centerY = -8_000;

    for (let index = 0; index < 96; index += 1) {
      const enemy = spawner.spawnAround(enemyConfig.id, centerX, centerY, scaling, 1, viewport);
      assert.ok(enemy);
      const radius = normalizedEllipseRadius(enemy, centerX, centerY, viewport);
      assert.ok(
        radius >= VIEWPORT_SPAWN_INNER_RADIUS - 1e-12,
        `Điểm sinh quá gần trên ${viewport.width}x${viewport.height}: ${radius}`,
      );
      assert.ok(
        radius <= VIEWPORT_SPAWN_OUTER_RADIUS + 1e-12,
        `Điểm sinh quá xa trên ${viewport.width}x${viewport.height}: ${radius}`,
      );
    }
  }
});

test('cùng seed và viewport luôn cho cùng chuỗi vị trí', () => {
  const viewport = { width: 1280, height: 720 };
  const data = { enemyById: new Map([[enemyConfig.id, enemyConfig]]) };
  const first = new EnemySpawner(data, new RNG(20260901));
  const second = new EnemySpawner(data, new RNG(20260901));

  for (let index = 0; index < 24; index += 1) {
    const a = first.spawnAround(enemyConfig.id, 300, -150, scaling, 1, viewport);
    const b = second.spawnAround(enemyConfig.id, 300, -150, scaling, 1, viewport);
    assert.ok(a && b);
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
  }
});

test('Director chuyển viewport cho mọi lần sinh quái thường hoặc elite', () => {
  const viewport = { width: 412, height: 915 };
  const calls = [];
  const spawner = {
    spawnAround: (...args) => {
      calls.push(args);
      return {
        isElite: false,
        radius: 10,
        exp: 1,
        gold: 0,
      };
    },
  };
  const rng = {
    weighted: (choices) => choices[0]?.item,
    chance: () => false,
  };
  const stage = {
    index: 1,
    waveCount: 5,
    allowedEnemies: [enemyConfig.id],
    spawnBase: 0,
  };
  const data = {
    enemyById: new Map([[enemyConfig.id, enemyConfig]]),
  };
  const director = new Director(data, rng, spawner);

  director.start(stage, false);
  director.update(0, 25, 40, scaling, 1, 0, 0, viewport);

  assert.equal(calls.length, 10);
  assert.ok(calls.every((args) => args[5] === viewport));
});

test('GameManager truyền viewport thật cho quái thường, Elite và Boss', async () => {
  const manager = await readFile(new URL('../src/game/GameManager.ts', import.meta.url), 'utf8');
  assert.match(manager, /this\.director\.update\([\s\S]*?this\.renderer\.size\(\),\s*Boolean\(this\.boss\.getBoss\(\)\),\s*\);/u);
  assert.match(manager, /spawnAround\(stage\.bossId,[\s\S]*?, viewport\)/u);
  assert.match(manager, /spawnAround\(stage\.eliteId,[\s\S]*?, viewport\)/u);
  assert.match(manager, /spawnAround\(id, this\.player\.x, this\.player\.y, scaling, 1, viewport\)/u);
});
