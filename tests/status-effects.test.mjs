import test from 'node:test';
import assert from 'node:assert/strict';

import { Enemy } from '../dist/src/game/Entities.js';
import { EnemySystem } from '../dist/src/game/EnemySystem.js';
import { BossSystem } from '../dist/src/game/BossSystem.js';
import { GameManager } from '../dist/src/game/GameManager.js';

function configuredEnemy(ai = 'melee') {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.config = {
    id: `test-${ai}`,
    name: 'Quái kiểm thử',
    ai,
    tier: ai === 'boss' ? 'boss' : 'normal',
    sprite: '',
    cost: 1,
    baseHealth: 100,
    baseDamage: 10,
    speed: 0,
    radius: 12,
    exp: 1,
    gold: 0,
    spawnMinStage: 1,
    attackRange: 20,
    attackCooldown: 1,
    projectileSpeed: 200,
  };
  enemy.x = 0;
  enemy.y = 0;
  enemy.radius = 12;
  enemy.health = 100;
  enemy.maxHealth = 100;
  enemy.damage = 10;
  enemy.speed = 0;
  enemy.attackTimer = 1;
  enemy.abilityTimer = 1;
  return enemy;
}

function enemyWorld(enemy) {
  const playerHits = [];
  return {
    playerHits,
    world: {
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 12,
        lastMove: { x: 1, y: 0 },
        ultimateActive: 0,
        character: { ultimate: undefined },
      },
      rng: { chance: () => false, float: (min) => min },
      audio: { play: () => {} },
      enemySpatial: { queryCircle: () => [enemy] },
      spawner: {
        pool: {
          allItems: () => [enemy],
          release: () => { enemy.active = false; },
        },
        spawnChild: () => null,
      },
      projectiles: { spawn: () => null },
      particles: {
        spawn: () => null,
        line: () => {},
        ring: () => {},
        burst: () => {},
      },
      scaling: { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 },
      killEnemy: () => {},
      damagePlayer(damage) {
        playerHits.push(damage);
      },
      screenShake: () => {},
    },
  };
}

test('enemy contact damage is blocked by blind, stun and paralysis', () => {
  const system = new EnemySystem();

  const control = configuredEnemy();
  const controlHarness = enemyWorld(control);
  system.update(0.1, controlHarness.world);
  assert.deepEqual(controlHarness.playerHits, [10], 'an uncontrolled enemy in contact must still deal damage');

  for (const status of ['blindTime', 'stunTime', 'paralysisTime']) {
    const enemy = configuredEnemy();
    enemy.status[status] = 0.5;
    const harness = enemyWorld(enemy);
    system.update(0.1, harness.world);
    assert.deepEqual(harness.playerHits, [], `${status} must suppress contact damage`);
  }
});

test('anti-healing persists for poison duration and resets only after all linked damage-over-time ends', () => {
  const enemy = configuredEnemy();
  enemy.x = 500;
  enemy.status.burnTime = 0;
  enemy.status.poisonTime = 1;
  enemy.status.poisonDps = 5;
  enemy.status.healingReduction = 0.3;
  const harness = enemyWorld(enemy);
  const system = new EnemySystem();

  system.update(0.1, harness.world);
  assert.equal(enemy.status.healingReduction, 0.3, 'active poison must preserve anti-healing without burn');
  assert.ok(enemy.status.poisonTime > 0);

  enemy.status.poisonTime = 0;
  system.update(0.1, harness.world);
  assert.equal(enemy.status.healingReduction, 0);
  assert.equal(enemy.status.poisonDps, 0);
});

function bossHarness(id = 'test-boss') {
  const boss = configuredEnemy('boss');
  boss.config.id = id;
  boss.config.name = 'Trùm kiểm thử';
  boss.config.element = 'arcane';
  boss.isBoss = true;
  boss.health = 100;
  boss.maxHealth = 100;
  boss.phase = 1;
  const projectileSpecs = [];
  const playerHits = [];
  return {
    boss,
    projectileSpecs,
    playerHits,
    world: {
      player: { x: 0, y: 0, vx: 0, vy: 0, radius: 12 },
      rng: { float: (min) => min },
      audio: { play: () => {} },
      projectiles: { spawn: (spec) => { projectileSpecs.push(spec); return spec; } },
      particles: { ring: () => {}, burst: () => {} },
      spawner: { spawnChild: () => null },
      scaling: { health: 1, damage: 1, speed: 1, spawnRate: 1, eliteRate: 0 },
      damagePlayer(damage) {
        playerHits.push(damage);
      },
      screenShake: () => {},
      toast: () => {},
    },
  };
}

test('stunned or paralyzed bosses cannot start a new cast', () => {
  for (const status of ['stunTime', 'paralysisTime']) {
    const harness = bossHarness();
    harness.boss.status[status] = 0.5;
    const bosses = new BossSystem();
    bosses.setBoss(harness.boss);
    bosses.update(2, harness.world);
    assert.equal(harness.projectileSpecs.length, 0, `${status} must stop boss projectile casts`);
    assert.equal(bosses.telegraphs.countActive(), 0, `${status} must stop boss telegraph casts`);
  }

  const control = bossHarness();
  const bosses = new BossSystem();
  bosses.setBoss(control.boss);
  bosses.update(2, control.world);
  assert.ok(control.projectileSpecs.length > 0, 'an uncontrolled boss should cast after its timer expires');
});

test('blinded boss projectiles and telegraphs remain visible but harmless', () => {
  const projectileHarness = bossHarness();
  projectileHarness.boss.status.blindTime = 1;
  const projectileBoss = new BossSystem();
  projectileBoss.setBoss(projectileHarness.boss);
  projectileBoss.update(2, projectileHarness.world);
  assert.ok(projectileHarness.projectileSpecs.length > 0);
  assert.ok(projectileHarness.projectileSpecs.every((spec) => spec.canHitPlayer === false));

  const telegraphHarness = bossHarness('iron-behemoth');
  telegraphHarness.boss.status.blindTime = 1;
  const telegraphBoss = new BossSystem();
  telegraphBoss.setBoss(telegraphHarness.boss);
  telegraphBoss.update(2, telegraphHarness.world);
  const warning = telegraphBoss.telegraphs.activeItems()[0];
  assert.ok(warning, 'the blinded telegraph should still render');
  assert.equal(warning.damage, 0, 'the blinded telegraph must carry zero damage');
  telegraphBoss.update(2, telegraphHarness.world);
  assert.deepEqual(telegraphHarness.playerHits, []);
});

function echoDamageContext(echo) {
  return {
    player: {
      character: { passive: { kind: 'status-echo', value: 0.45 } },
      stats: { get: () => 0 },
      heal: () => {},
      addUltimate: () => {},
      addRage: () => {},
    },
    rng: { chance: () => true, float: (min) => min },
    nearestEnemy: () => echo,
    particles: { line: () => {} },
    runStats: null,
    weapons: { recordDamage: () => {} },
    saveSystem: { data: { settings: { damageNumbers: false } } },
    floatingText: { spawn: () => {} },
    audio: { play: () => {} },
    killEnemy: () => {},
  };
}

function applyEchoStatus(element) {
  const primary = configuredEnemy();
  const echo = configuredEnemy();
  primary.x = 20;
  echo.x = 80;
  primary.health = 10_000;
  primary.maxHealth = 10_000;
  echo.health = 10_000;
  echo.maxHealth = 10_000;
  const context = echoDamageContext(echo);

  GameManager.prototype.damageEnemy.call(context, primary, 100, element, `test-${element}`, 1, 0, false, 0, 0);
  return { primary, echo };
}

test('fire status echo preserves percentage burn and anti-healing', () => {
  const { primary, echo } = applyEchoStatus('fire');
  assert.equal(primary.status.burnPercent, 0.0015);
  assert.equal(primary.status.healingReduction, 0.3);
  assert.ok(Math.abs(echo.status.burnPercent - 0.0015 * 0.45) < 1e-15);
  assert.ok(Math.abs(echo.status.healingReduction - 0.3 * 0.45) < 1e-15);
  assert.equal(echo.status.burnTick, 0.25);
});

test('lightning status echo preserves slow and temporary paralysis', () => {
  const { primary, echo } = applyEchoStatus('lightning');
  assert.equal(primary.status.slowFactor, 0.72);
  assert.equal(primary.status.paralysisTime, 0.24);
  assert.equal(echo.status.slowFactor, 0.87);
  assert.equal(echo.status.paralysisTime, 0.1);
  assert.equal(echo.status.stunTime, 0.1);
});
