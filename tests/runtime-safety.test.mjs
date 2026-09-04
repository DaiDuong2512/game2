import test from 'node:test';
import assert from 'node:assert/strict';

import { Enemy } from '../dist/src/game/Entities.js';
import { EnemySystem } from '../dist/src/game/EnemySystem.js';

function farEnemy({ elite = false, final = false } = {}) {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.x = 3000;
  enemy.y = 0;
  enemy.speed = 0;
  enemy.health = 100;
  enemy.maxHealth = 100;
  enemy.isElite = elite;
  enemy.isFinalEncounter = final;
  enemy.config = {
    id: final ? 'finale-test' : 'roaming-test',
    name: 'Kẻ địch kiểm thử',
    ai: 'melee',
    tier: elite ? 'elite' : 'small',
    sprite: '',
    cost: 1,
    baseHealth: 100,
    baseDamage: 1,
    speed: 0,
    radius: 12,
    exp: 1,
    gold: 0,
    spawnMinStage: 1,
    attackRange: 20,
    attackCooldown: 1,
    projectileSpeed: 0,
    element: 'physical',
  };
  return enemy;
}

test('mục tiêu cuối không bị thu hồi khi đi xa nhưng Tinh Anh ngẫu nhiên vẫn được dọn', () => {
  const finalEnemy = farEnemy({ elite: true, final: true });
  const roamingElite = farEnemy({ elite: true });
  const regularEnemy = farEnemy();
  const released = [];
  const world = {
    player: {
      x: 0, y: 0, vx: 0, vy: 0, radius: 18, ultimateActive: 0,
      character: { ultimate: undefined },
    },
    rng: { chance: () => false, float: (minimum) => minimum },
    audio: { play: () => {} },
    enemySpatial: { queryCircle: () => [] },
    spawner: {
      pool: {
        allItems: () => [finalEnemy, roamingElite, regularEnemy],
        release: (enemy) => { enemy.active = false; released.push(enemy); },
      },
      spawnChild: () => null,
    },
    projectiles: { spawn: () => null },
    particles: { spawn: () => {}, line: () => {}, ring: () => {}, burst: () => {} },
    scaling: { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 },
    killEnemy: () => {},
    damagePlayer: () => {},
    screenShake: () => {},
  };

  new EnemySystem().update(0.016, world);

  assert.equal(finalEnemy.active, true, 'mục tiêu cuối phải tiếp tục đuổi người chơi');
  assert.equal(roamingElite.active, false, 'Tinh Anh ngẫu nhiên ở quá xa phải được dọn để bảo vệ active cap');
  assert.equal(regularEnemy.active, false);
  assert.deepEqual(released, [roamingElite, regularEnemy]);
});
