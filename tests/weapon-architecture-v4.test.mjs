import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RNG } from '../dist/src/core/RNG.js';
import { PlayerStats } from '../dist/src/game/PlayerStats.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { EnemySystem } from '../dist/src/game/EnemySystem.js';
import { ExperienceSystem } from '../dist/src/game/ExperienceSystem.js';
import { GameManager } from '../dist/src/game/GameManager.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';
import { UpgradeSystem } from '../dist/src/game/UpgradeSystem.js';
import { WeaponSystem, weaponBalanceDamageMultiplier } from '../dist/src/game/WeaponSystem.js';

async function json(name) {
  return JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
}

async function gameData() {
  const [weapons, passives, evolutions, upgrades] = await Promise.all([
    json('weapons.json'), json('passives.json'), json('evolutions.json'), json('upgrades.json'),
  ]);
  return {
    weapons,
    passives,
    evolutions,
    upgrades,
    weaponById: new Map(weapons.map((item) => [item.id, item])),
    passiveById: new Map(passives.map((item) => [item.id, item])),
    evolutionById: new Map(evolutions.map((item) => [item.id, item])),
  };
}

function upgradePlayer(level = 2) {
  const stats = new PlayerStats({ maxHp: 100, luck: 0 });
  return {
    level,
    health: 100,
    character: { passive: { kind: 'none', value: 0 } },
    stats,
    syncMaxHp: () => {},
    heal: () => {},
  };
}

test('loadout locks one primary weapon and rejects a fourth auxiliary weapon', async () => {
  const data = await gameData();
  const weapons = new WeaponSystem(data);
  const ids = data.weapons.slice(0, 5).map((item) => item.id);

  assert.equal(weapons.equipPrimaryWeapon(ids[0]), true);
  assert.equal(weapons.equipPrimaryWeapon(ids[1]), false, 'a second primary must never replace the character weapon');
  assert.equal(weapons.addAuxiliaryWeapon(ids[1]), true);
  assert.equal(weapons.addAuxiliaryWeapon(ids[2]), true);
  assert.equal(weapons.addAuxiliaryWeapon(ids[3]), true);
  assert.equal(weapons.addAuxiliaryWeapon(ids[4]), false);
  assert.equal(weapons.auxiliaryCount(), 3);
  assert.equal(weapons.canAddAuxiliary(), false);
  assert.equal(weapons.primaryEntry().config.id, ids[0]);
  assert.deepEqual(weapons.entries().map((entry) => entry.runtime.slot), ['primary', 'auxiliary', 'auxiliary', 'auxiliary']);
});

test('upgrade schedule reserves multiples of five for weapons and hides new weapons at cap', async () => {
  const data = await gameData();
  const weapons = new WeaponSystem(data);
  for (const [index, id] of data.weapons.slice(0, 4).map((item) => item.id).entries()) {
    assert.equal(index === 0 ? weapons.equipPrimaryWeapon(id) : weapons.addAuxiliaryWeapon(id), true);
  }
  const player = upgradePlayer(2);
  const upgrades = new UpgradeSystem(data, new RNG(4481), player, weapons);

  for (const level of [2, 3, 4, 6, 7, 9]) {
    player.level = level;
    const options = upgrades.generateOptions();
    assert.ok(options.length >= 3);
    assert.ok(options.every((option) => ['passive-new', 'passive-level', 'stat'].includes(option.type)),
      `level ${level} must only contain general buffs`);
  }

  for (const level of [5, 10, 15, 20]) {
    player.level = level;
    const options = upgrades.generateOptions();
    assert.equal(options.length, 3);
    assert.ok(options.every((option) => ['weapon-level', 'weapon-mastery', 'evolution'].includes(option.type)),
      `level ${level} must only contain owned-weapon choices at auxiliary cap`);
    assert.ok(!options.some((option) => option.type === 'weapon-new'));
  }
});

test('multi-level EXP queues the original milestone and rerolls preserve its category', async () => {
  const expPlayer = {
    level: 4,
    exp: 0,
    expToNext: 0,
    stats: { get: (stat) => stat === 'expGain' ? 1 : 0 },
  };
  const experience = new ExperienceSystem(expPlayer);
  const amount = experience.threshold(4) + experience.threshold(5) + experience.threshold(6);
  assert.equal(experience.gain(amount), 3);
  assert.equal(expPlayer.level, 7);
  assert.deepEqual([
    experience.consumePending(),
    experience.consumePending(),
    experience.consumePending(),
    experience.consumePending(),
  ], [5, 6, 7, null]);

  const data = await gameData();
  const weapons = new WeaponSystem(data);
  weapons.equipPrimaryWeapon(data.weapons[0].id);
  weapons.addAuxiliaryWeapon(data.weapons[1].id);
  weapons.addAuxiliaryWeapon(data.weapons[2].id);
  weapons.addAuxiliaryWeapon(data.weapons[3].id);
  const player = upgradePlayer(7);
  const upgrades = new UpgradeSystem(data, new RNG(9901), player, weapons);
  const milestone = upgrades.generateOptions(5);
  const milestoneReroll = upgrades.reroll();
  for (const options of [milestone, milestoneReroll]) {
    assert.ok(options.every((option) => ['weapon-level', 'weapon-mastery', 'evolution'].includes(option.type)));
  }
  const general = upgrades.generateOptions(6);
  const generalReroll = upgrades.reroll();
  for (const options of [general, generalReroll]) {
    assert.ok(options.every((option) => ['passive-new', 'passive-level', 'stat'].includes(option.type)));
  }
});

test('a stale new-weapon card cannot exceed the three-auxiliary cap', async () => {
  const data = await gameData();
  let scenario = null;
  for (let seed = 1; seed <= 120 && !scenario; seed += 1) {
    const weapons = new WeaponSystem(data);
    weapons.equipPrimaryWeapon(data.weapons[0].id);
    weapons.addAuxiliaryWeapon(data.weapons[1].id);
    weapons.addAuxiliaryWeapon(data.weapons[2].id);
    const player = upgradePlayer(5);
    const upgrades = new UpgradeSystem(data, new RNG(seed), player, weapons);
    const option = upgrades.generateOptions().find((item) => item.type === 'weapon-new');
    if (option) scenario = { weapons, upgrades, option };
  }
  assert.ok(scenario, 'at least one deterministic milestone should offer the final auxiliary slot');
  const filler = data.weapons.find((weapon) => !scenario.weapons.has(weapon.id) && weapon.id !== scenario.option.targetId);
  assert.ok(filler);
  assert.equal(scenario.weapons.addAuxiliaryWeapon(filler.id), true);
  assert.equal(scenario.upgrades.apply(scenario.option.id), false, 'apply must recheck capacity instead of trusting a stale card');
  assert.equal(scenario.weapons.auxiliaryCount(), 3);
});

test('toxic smoke bomb scales from player damage, never hides a critical roll and aims at the densest cluster', async () => {
  const data = await gameData();
  const weapons = new WeaponSystem(data);
  assert.equal(weapons.equipPrimaryWeapon('toxic-smoke-bomb'), true);
  const enemies = [
    { id: 1, active: true, x: 72, y: 0, radius: 10 },
    { id: 2, active: true, x: 245, y: 180, radius: 10 },
    { id: 3, active: true, x: 270, y: 184, radius: 10 },
    { id: 4, active: true, x: 250, y: 210, radius: 10 },
  ];
  const spawned = [];
  const world = {
    autoAim: true,
    enemies,
    player: {
      x: 0, y: 0, aim: { x: 1, y: 0 }, rageActive: 0,
      character: { passive: { kind: 'none', value: 0 }, rage: undefined },
      stats: { get: (stat) => ({ cooldownReduction: 0, attackSpeed: 1, bonusProjectiles: 0, range: 1, projectileSpeed: 1, critChance: 1 }[stat] ?? 0) },
      effectiveDamageMultiplier: () => 2,
      effectiveCritDamage: () => 1.8,
    },
    rng: { chance: () => true },
    projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
    enemySpatial: { queryCircle: () => enemies },
    nearestEnemy: () => enemies[0],
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
    screenShake: () => {},
  };

  weapons.update(1, world);

  assert.equal(spawned.length, 1);
  const bomb = spawned[0];
  assert.equal(bomb.sourceWeaponId, 'toxic-smoke-bomb');
  assert.equal(bomb.deployAreaDuration, 3);
  assert.equal(bomb.deployAreaTickRate, 1);
  assert.equal(bomb.deployAreaHitEffect.kind, 'poison-cloud');
  assert.equal(bomb.deployAreaDamage, 36 * weaponBalanceDamageMultiplier('poison-bomb'),
    'the cloud must include current player damage but ignore the guaranteed critical roll');
  assert.equal(bomb.critical, false, 'a persistent cloud cannot carry an unannounced critical state');
  assert.ok(bomb.vx > 0 && bomb.vy > 0, 'the bomb should point to the dense upper-right cluster, not the nearer isolated enemy');
});

test('weapon cadence preserves cooldown overshoot and stays stable across frame rates', () => {
  const level = {
    level: 1, damage: 10, cooldown: 0.07, count: 1, speed: 500, range: 500,
    pierce: 0, size: 8, duration: 1, knockback: 0, statusChance: 0,
  };
  const config = {
    id: 'cadence-test', name: 'Kiểm tra nhịp', behavior: 'gun', element: 'physical',
    icon: '', description: '', maxLevel: 8,
    levels: Array.from({ length: 8 }, (_, index) => ({ ...level, level: index + 1 })),
  };
  const simulate = (frameDt) => {
    const weapons = new WeaponSystem({ weaponById: new Map([[config.id, config]]), evolutionById: new Map() });
    weapons.equipPrimaryWeapon(config.id);
    let shots = 0;
    const world = {
      autoAim: true,
      player: {
        x: 0, y: 0, aim: { x: 1, y: 0 }, rageActive: 0,
        character: { passive: { kind: 'none', value: 0 }, rage: undefined },
        stats: { get: (stat) => ({ cooldownReduction: 0, attackSpeed: 1, bonusProjectiles: 0, range: 1, projectileSpeed: 1, critChance: 0 }[stat] ?? 0) },
        effectiveDamageMultiplier: () => 1,
        effectiveCritDamage: () => 1.8,
      },
      rng: { chance: () => false },
      projectiles: { spawn: () => { shots += 1; return {}; } },
      enemySpatial: { queryCircle: () => [] },
      nearestEnemy: () => null,
      damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
      particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
      screenShake: () => {},
    };
    let elapsed = 0;
    while (elapsed < 5 - 1e-12) {
      const step = Math.min(frameDt, 5 - elapsed);
      weapons.update(step, world);
      elapsed += step;
    }
    return shots;
  };

  const at30 = simulate(1 / 30);
  const at60 = simulate(1 / 60);
  const at144 = simulate(1 / 144);
  assert.equal(at30, at60);
  assert.equal(at60, at144);
  assert.equal(at60, 70);
});

function statusHarness(enemy) {
  const damageEvents = [];
  const world = {
    rng: { chance: () => false, float: () => 0 },
    particles: { spawn: () => {} },
    damageStatus(target, damage, element, sourceWeaponId, status) {
      const applied = Math.min(target.health, damage);
      target.health -= applied;
      damageEvents.push({ applied, element, sourceWeaponId, status });
      return false;
    },
    killEnemy: () => {},
  };
  return { damageEvents, world };
}

test('poison cloud is frame-rate independent, non-stacking, current-health based and lingers for three seconds', () => {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.health = 100;
  enemy.maxHealth = 100;
  enemy.radius = 10;
  const manager = Object.create(GameManager.prototype);
  manager.rng = { chance: () => true };
  const signature = {
    kind: 'poison-cloud', duration: 3, chance: 1, magnitude: 0.8,
    healthPercentPerSecond: 0.03, damageScale: 0.9,
  };
  const projectiles = new ProjectileSystem();
  const projectileWorld = {
    enemySpatial: { queryCircle: () => [enemy] },
    rng: { chance: () => false },
    particles: { spawn: () => {}, ring: () => {}, burst: () => {} },
    damageEnemy: (...args) => GameManager.prototype.damageEnemy.call(manager, ...args),
  };
  projectiles.spawn({
    sourceWeaponId: 'toxic-smoke-bomb', element: 'poison', x: 0, y: 0, vx: 0, vy: 0,
    damage: 20, radius: 80, life: 5, maxRange: 1, persistent: true, tickRate: 1,
    hitEffect: signature, trail: false,
  });
  projectiles.spawn({
    sourceWeaponId: 'toxic-smoke-bomb', element: 'poison', x: 0, y: 0, vx: 0, vy: 0,
    damage: 10, radius: 80, life: 5, maxRange: 1, persistent: true, tickRate: 1,
    hitEffect: signature, trail: false,
  });

  for (let frame = 0; frame < 60; frame += 1) projectiles.update(1 / 60, projectileWorld);
  assert.equal(enemy.health, 100, 'per-frame contact refresh must not deal direct damage');
  assert.equal(enemy.status.poisonCloudDps, 18, 'overlapping clouds keep only the strongest 90% flat component');
  assert.equal(enemy.status.poisonCloudPercent, 0.03);
  assert.equal(enemy.status.slowFactor, 0.8);

  const statuses = new EnemySystem();
  const { damageEvents, world } = statusHarness(enemy);
  statuses.updateStatuses(enemy, 1, world);
  assert.ok(Math.abs(enemy.health - 79) < 1e-9, 'first tick is 3% current HP + 90% of 20 damage');
  statuses.updateStatuses(enemy, 1, world);
  statuses.updateStatuses(enemy, 1, world);
  const afterThreeTicks = enemy.health;
  statuses.updateStatuses(enemy, 1, world);
  assert.equal(enemy.health, afterThreeTicks, 'poison must stop after exactly three seconds without contact refresh');
  assert.equal(damageEvents.length, 3);
  assert.equal(enemy.status.slowFactor, 1);
});

test('weapon signatures refresh a non-stacking bleed and apply resisted control durations', () => {
  const manager = Object.create(GameManager.prototype);
  manager.rng = { chance: () => true };
  const enemy = new Enemy();
  enemy.active = true;
  enemy.health = 100;
  enemy.maxHealth = 100;
  GameManager.prototype.applyWeaponSignature.call(manager, enemy, 0, 'rift-blade', {
    kind: 'bleed', duration: 3, healthPercentPerSecond: 0.015,
  });
  GameManager.prototype.applyWeaponSignature.call(manager, enemy, 0, 'rift-blade', {
    kind: 'bleed', duration: 3, healthPercentPerSecond: 0.01,
  });
  assert.equal(enemy.status.bleedDps, 0.015, 'repeated bleed refreshes time but keeps only the strongest rate');

  const statuses = new EnemySystem();
  const { damageEvents, world } = statusHarness(enemy);
  statuses.updateStatuses(enemy, 1, world);
  statuses.updateStatuses(enemy, 1, world);
  statuses.updateStatuses(enemy, 1, world);
  const afterBleed = enemy.health;
  statuses.updateStatuses(enemy, 1, world);
  assert.equal(enemy.health, afterBleed);
  assert.equal(damageEvents.length, 3);
  assert.ok(Math.abs(afterBleed - 100 * 0.985 ** 3) < 1e-9);
  assert.ok(damageEvents.every((event) => event.status === 'bleed' && event.sourceWeaponId === 'rift-blade'));

  const boss = new Enemy();
  boss.active = true;
  boss.isBoss = true;
  GameManager.prototype.applyWeaponSignature.call(manager, boss, 0, 'echo-bow', {
    kind: 'slow', duration: 1, magnitude: 0.8, bossDurationMultiplier: 0.35,
  });
  GameManager.prototype.applyWeaponSignature.call(manager, boss, 0, 'arcane-nova', {
    kind: 'stun', duration: 0.3, bossDurationMultiplier: 0.2,
  });
  assert.equal(boss.status.slowFactor, 0.8);
  assert.ok(Math.abs(boss.status.slowTime - 0.35) < 1e-12);
  assert.ok(Math.abs(boss.status.stunTime - 0.06) < 1e-12);

  GameManager.prototype.applyWeaponSignature.call(manager, boss, 20, 'toxic-smoke-bomb', {
    kind: 'poison-cloud', duration: 3, magnitude: 0.8,
    healthPercentPerSecond: 0.03, damageScale: 0.9,
    bossDurationMultiplier: 0.2,
  });
  assert.equal(boss.status.poisonCloudTime, 3);
  assert.equal(boss.status.slowTime, 3,
    'boss resistance must not end the 20% slow before the poison itself expires');
});

test('legacy rage kinds cannot add hidden weapon multipliers on top of standardized rage', () => {
  const level = {
    level: 1, damage: 10, cooldown: 1, count: 1, speed: 100, range: 400,
    pierce: 0, size: 8, duration: 1, knockback: 0, statusChance: 0.4,
  };
  const config = {
    id: 'legacy-rage-lock', name: 'Khóa Nộ cũ', behavior: 'gun', element: 'fire',
    icon: '', description: '', maxLevel: 8,
    levels: Array.from({ length: 8 }, (_, index) => ({ ...level, level: index + 1 })),
  };
  const weapons = new WeaponSystem({
    weaponById: new Map([[config.id, config]]),
    evolutionById: new Map(),
  });
  weapons.equipPrimaryWeapon(config.id);
  const spawned = [];
  const world = {
    autoAim: true,
    player: {
      x: 0, y: 0, aim: { x: 1, y: 0 }, rageActive: 5,
      character: { passive: { kind: 'none', value: 0 }, rage: { kind: 'overcharge' } },
      // Player đã áp chuẩn x3 tốc đánh và -10% sát thương trước khi WeaponSystem chạy.
      stats: { get: (stat) => ({ cooldownReduction: 0, attackSpeed: 3, bonusProjectiles: 0, range: 1, projectileSpeed: 1, critChance: 0 }[stat] ?? 0) },
      effectiveDamageMultiplier: () => 0.9,
      effectiveCritDamage: () => 1.8,
    },
    rng: { chance: () => false },
    projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
    enemySpatial: { queryCircle: () => [] },
    nearestEnemy: () => null,
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
    screenShake: () => {},
  };

  weapons.update(0.15, world);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].damage, 9 * weaponBalanceDamageMultiplier('gun'));
  assert.equal(spawned[0].statusChance, 0.4);
  assert.ok(Math.abs(weapons.runtimes()[0].cooldown - 1 / 3) < 1e-12,
    'legacy kind must not multiply the standardized x3 attack speed again');
});

test('three-second bleed and poison linger keep their third tick at 60 FPS', () => {
  const manager = Object.create(GameManager.prototype);
  manager.rng = { chance: () => true };
  const enemy = new Enemy();
  enemy.active = true;
  enemy.health = 100;
  enemy.maxHealth = 100;
  GameManager.prototype.applyWeaponSignature.call(manager, enemy, 0, 'rift-blade', {
    kind: 'bleed', duration: 3, healthPercentPerSecond: 0.015,
  });
  GameManager.prototype.applyWeaponSignature.call(manager, enemy, 20, 'toxic-smoke-bomb', {
    kind: 'poison-cloud', duration: 3, magnitude: 0.8,
    healthPercentPerSecond: 0.03, damageScale: 0.9,
  });
  const statuses = new EnemySystem();
  const { damageEvents, world } = statusHarness(enemy);
  for (let frame = 0; frame < 180; frame += 1) statuses.updateStatuses(enemy, 1 / 60, world);

  assert.equal(damageEvents.filter((event) => event.status === 'bleed').length, 3);
  assert.equal(damageEvents.filter((event) => event.element === 'poison').length, 3);
});
