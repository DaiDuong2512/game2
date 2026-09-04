import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BOSS_ABILITY_TELEPORT_COOLDOWN,
  BOSS_LEASH_REPOSITION_COOLDOWN,
  BossSystem,
  bossRepositionDistance,
} from '../dist/src/game/BossSystem.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { bossIndicatorPoint } from '../dist/src/render/Renderer.js';

function createBoss(x = 2_000) {
  const boss = new Enemy();
  boss.active = true;
  boss.isBoss = true;
  boss.x = x;
  boss.y = 0;
  boss.health = 100;
  boss.maxHealth = 100;
  boss.damage = 10;
  boss.radius = 24;
  boss.phase = 1;
  boss.config = {
    id: 'test-boss', name: 'Trùm kiểm thử', ai: 'boss', tier: 'boss', sprite: '', cost: 1,
    baseHealth: 100, baseDamage: 10, speed: 0, radius: 24, exp: 1, gold: 0,
    spawnMinStage: 1, attackRange: 20, attackCooldown: 1, projectileSpeed: 200, element: 'arcane',
  };
  return boss;
}

function createWorld() {
  return {
    player: { x: 0, y: 0, vx: 0, vy: 0, radius: 12 },
    rng: { float: () => 0 },
    audio: { play: () => {} },
    projectiles: { spawn: () => null },
    particles: { ring: () => {}, burst: () => {}, impact: () => null },
    spawner: { spawnChild: () => null },
    scaling: { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 },
    bossLeashRadius: () => 600,
    damagePlayer: () => {}, screenShake: () => {}, toast: () => {},
  };
}

test('boss ở quá xa dịch chuyển về cự ly chiến đấu rồi bị khóa dịch chuyển sáu giây', () => {
  const boss = createBoss();
  const world = createWorld();
  const system = new BossSystem();
  system.setBoss(boss);
  system.update(1.6, world);
  assert.ok(Math.abs(Math.hypot(boss.x, boss.y) - bossRepositionDistance(600)) < 1e-9);
  assert.equal(BOSS_LEASH_REPOSITION_COOLDOWN, 6);

  boss.x = 2_000;
  system.update(1, world);
  assert.equal(boss.x, 2_000, 'không được dịch chuyển liên tiếp để né đạn');
});

test('dịch chuyển kỹ năng của boss có thời gian nghỉ dài', () => {
  assert.equal(BOSS_ABILITY_TELEPORT_COOLDOWN, 7);
});

test('mũi tên boss được ghim vào mép an toàn và chỉ đúng hướng', () => {
  const right = bossIndicatorPoint(195, 422, 2_000, 422, 390, 844);
  assert.ok(right);
  assert.equal(right.x, 332);
  assert.equal(right.y, 422);
  assert.equal(right.angle, 0);

  const upperLeft = bossIndicatorPoint(195, 422, -1_000, -1_000, 390, 844);
  assert.ok(upperLeft);
  assert.ok(upperLeft.x >= 58 && upperLeft.y >= 58);
  assert.ok(upperLeft.angle < -Math.PI / 2);
});

test('lượt cấp từ kinh nghiệm quái có nhóm buff đặc biệt với số liệu rõ ràng', async () => {
  const upgrades = JSON.parse(await readFile(new URL('../public/data/upgrades.json', import.meta.url), 'utf8'));
  const expected = ['myriad-blade-prism', 'hunter-tempo', 'blood-combat-core', 'shock-ward'];
  for (const id of expected) {
    const buff = upgrades.statBoosts.find((item) => item.id === id);
    assert.ok(buff, `thiếu buff đặc biệt ${id}`);
    assert.equal(buff.kind, 'dual-stat');
    assert.match(buff.description, /\d/u, 'mô tả buff phải ghi rõ số liệu');
  }
});
