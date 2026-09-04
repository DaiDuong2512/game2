import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from '../dist/src/core/SpatialHash.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';

function makeEnemy(x, y, radius = 5) {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.x = x;
  enemy.y = y;
  enemy.radius = radius;
  return enemy;
}

function makeWorld(enemies, player = { x: 1000, y: 1000, radius: 10 }) {
  const enemySpatial = new SpatialHash(128);
  enemySpatial.rebuild(enemies);
  const enemyHits = [];
  const playerHits = [];
  return {
    enemyHits,
    playerHits,
    world: {
      player,
      enemies,
      enemySpatial,
      rng: { chance: () => false },
      particles: {
        spawn: () => null,
        burst: () => {},
        ring: () => {},
      },
      damageEnemy(enemy, damage, element, sourceWeaponId, statusChance, knockback, critical, originX, originY) {
        enemyHits.push({ enemy, damage, originX, originY });
        return { amount: damage, critical, killed: false };
      },
      damagePlayer(damage, sourceX, sourceY) {
        playerHits.push({ damage, sourceX, sourceY });
      },
      nearestEnemy: () => null,
    },
  };
}

function spawnFastProjectile(system, overrides = {}) {
  return system.spawn({
    sourceWeaponId: 'test-shot',
    element: 'physical',
    x: 0,
    y: 0,
    vx: 100,
    vy: 0,
    damage: 10,
    radius: 2,
    life: 2,
    maxRange: 200,
    trail: false,
    ...overrides,
  });
}

test('swept player projectile hits the first crossed enemy, not spatial insertion order', () => {
  const far = makeEnemy(75, 0);
  const near = makeEnemy(25, 0);
  const { world, enemyHits } = makeWorld([far, near]);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { pierce: 0 });

  projectiles.update(1, world);

  assert.deepEqual(enemyHits.map((hit) => hit.enemy.id), [near.id]);
  assert.equal(projectiles.pool.countActive(), 0);
});

test('piercing swept projectile damages crossed enemies in travel order', () => {
  const far = makeEnemy(75, 0);
  const near = makeEnemy(25, 0);
  const { world, enemyHits } = makeWorld([far, near]);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { pierce: 1 });

  projectiles.update(1, world);

  assert.deepEqual(enemyHits.map((hit) => hit.enemy.id), [near.id, far.id]);
});

test('collision is resolved on the final range-limited segment before expiry', () => {
  const enemy = makeEnemy(49, 0, 2);
  const { world, enemyHits } = makeWorld([enemy]);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { maxRange: 50, pierce: 0 });

  projectiles.update(1, world);

  assert.equal(enemyHits.length, 1);
  assert.equal(enemyHits[0].enemy.id, enemy.id);
  assert.equal(projectiles.pool.countActive(), 0);
});

test('collision is resolved on the final lifetime-limited segment before expiry', () => {
  const enemy = makeEnemy(49, 0, 2);
  const { world, enemyHits } = makeWorld([enemy]);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { life: 0.5, maxRange: 200, pierce: 0 });

  projectiles.update(1, world);

  assert.equal(enemyHits.length, 1);
  assert.equal(enemyHits[0].enemy.id, enemy.id);
  assert.equal(projectiles.pool.countActive(), 0);
});

test('enemy projectile uses swept collision against the player', () => {
  const player = { x: 50, y: 0, radius: 8 };
  const { world, playerHits } = makeWorld([], player);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { faction: 'enemy' });

  projectiles.update(1, world);

  assert.equal(playerHits.length, 1);
  assert.equal(playerHits[0].damage, 10);
  assert.ok(Math.abs(playerHits[0].sourceX - 40) < 0.000001);
  assert.equal(projectiles.pool.countActive(), 0);
});

test('enemy projectile marked unable to hit the player remains harmless while crossing them', () => {
  const player = { x: 50, y: 0, radius: 8 };
  const { world, playerHits } = makeWorld([], player);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, { faction: 'enemy', canHitPlayer: false });

  projectiles.update(1, world);

  assert.equal(playerHits.length, 0);
  assert.equal(projectiles.pool.countActive(), 1, 'a harmless blinded shot should continue travelling for visual feedback');
});

test('enemy projectile remains damaging by default when canHitPlayer is omitted', () => {
  const player = { x: 50, y: 0, radius: 8 };
  const { world, playerHits } = makeWorld([], player);
  const projectiles = new ProjectileSystem();
  const projectile = spawnFastProjectile(projectiles, { faction: 'enemy' });

  assert.ok(projectile);
  assert.equal(projectile.canHitPlayer, true);
  projectiles.update(1, world);
  assert.equal(playerHits.length, 1);
});

test('persistent area projectiles retain point-in-area tick behavior', () => {
  const enemy = makeEnemy(10, 0, 5);
  const { world, enemyHits } = makeWorld([enemy]);
  const projectiles = new ProjectileSystem();
  spawnFastProjectile(projectiles, {
    vx: 0,
    life: 1,
    maxRange: 1,
    radius: 15,
    persistent: true,
    tickRate: 0.5,
  });

  projectiles.update(0.1, world);
  projectiles.update(0.1, world);

  assert.equal(enemyHits.length, 1);
  assert.equal(projectiles.pool.countActive(), 1);
});
