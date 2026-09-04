import test from 'node:test';
import assert from 'node:assert/strict';

import { RNG } from '../dist/src/core/RNG.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { BossSystem } from '../dist/src/game/BossSystem.js';
import { ParticleSystem } from '../dist/src/game/ParticleSystem.js';
import { SkillSystem } from '../dist/src/game/SkillSystem.js';

test('atlas impact events are pooled, animated and released', () => {
  const particles = new ParticleSystem(new RNG(11));
  const fire = particles.impact('fire', 10, 20, 72, 0.3, 0.9);
  assert.ok(fire);
  assert.equal(fire.row, 1);
  assert.equal(particles.atlasPool.countActive(), 1);

  particles.update(0.31);
  assert.equal(particles.atlasPool.countActive(), 0);

  particles.burst(0, 0, '#ff7144', 5, 80, 2);
  assert.equal(particles.atlasPool.countActive(), 1, 'a projectile-like burst should create a readable atlas impact');
  particles.clear();
  assert.equal(particles.atlasPool.countActive(), 0);
});

test('poison bursts use the dedicated production status atlas', () => {
  const particles = new ParticleSystem(new RNG(12));
  particles.burst(0, 0, '#77e56f', 5, 80, 2);
  assert.equal(particles.atlasPool.countActive(), 1);
  const effect = particles.atlasPool.activeItems()[0];
  assert.equal(effect.sheet, 'status');
  assert.equal(effect.row, 0);
  assert.ok(particles.pool.countActive() > 0);
});

function bossHarness() {
  const boss = new Enemy();
  boss.active = true;
  boss.isBoss = true;
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
  const audio = [];
  const projectiles = [];
  return {
    boss,
    audio,
    projectiles,
    world: {
      player: { x: 0, y: 0, vx: 0, vy: 0, radius: 12 },
      rng: new RNG(13),
      audio: { play: (id) => audio.push(id) },
      projectiles: { spawn: (spec) => { projectiles.push(spec); return spec; } },
      particles: { ring: () => {}, burst: () => {}, impact: () => null },
      spawner: { spawnChild: () => null },
      scaling: { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 },
      damagePlayer: () => {}, screenShake: () => {}, toast: () => {},
    },
  };
}

test('every boss cast exposes a visible wind-up window before projectiles spawn', () => {
  const harness = bossHarness();
  const bosses = new BossSystem();
  bosses.setBoss(harness.boss);
  bosses.update(0.8, harness.world);

  const cue = bosses.getCastCue();
  assert.ok(cue);
  assert.ok(cue.progress >= 0 && cue.progress < 1);
  assert.equal(harness.projectiles.length, 0);
  assert.ok(harness.audio.includes('boss-warning'), 'the visual cue should also have a restrained warning sound');

  bosses.update(0.7, harness.world);
  assert.ok(harness.projectiles.length > 0);
  assert.equal(bosses.getCastCue(), null);
});

function ultimateSignature(kind) {
  const events = [];
  const projectiles = [];
  const world = {
    input: { wasPressed: () => false, gamepadPressed: () => false },
    player: {
      x: 0, y: 0, activeCooldown: 0, rageMeter: 0, rageActive: 0,
      ultimateMeter: 0, ultimateActive: 1, skillCritShards: 0,
      character: { ultimate: { kind } },
      stats: { get: (id) => id === 'cooldownReduction' ? 0 : 1 },
      effectiveDamageMultiplier: () => 1,
      skillCritDamage: () => 2,
    },
    enemySpatial: { queryCircle: () => [] },
    rng: { chance: () => false },
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    projectiles: { spawn: (spec) => { projectiles.push(spec); return spec; } },
    particles: {
      ring: () => events.push('ring'),
      burst: () => events.push('burst'),
      line: () => events.push('line'),
      slash: () => events.push('slash'),
      spawn: (particleKind) => events.push(`particle:${particleKind}`),
      spawnAtlas: (row) => events.push(`atlas:${row}`),
      spawnStatusAtlas: (row) => events.push(`status-atlas:${row}`),
    },
    audio: { play: () => {} }, toast: () => {}, screenShake: () => {},
  };
  new SkillSystem().update(0.1, world);
  return `${events.sort().join(',')}|projectiles:${projectiles.length}`;
}

test('all eight ultimates have distinct VFX choreography signatures', () => {
  const kinds = ['rift-storm', 'arrow-rain', 'forgequake', 'elemental-tempest', 'plague-night', 'echo-legion', 'titanfall', 'void-collapse'];
  const signatures = kinds.map(ultimateSignature);
  assert.equal(new Set(signatures).size, kinds.length, signatures.join('\n'));
});
