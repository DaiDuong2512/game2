import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RNG } from '../dist/src/core/RNG.js';
import { directorChoiceWeight } from '../dist/src/game/Director.js';
import { PlayerStats } from '../dist/src/game/PlayerStats.js';
import { UpgradeSystem } from '../dist/src/game/UpgradeSystem.js';
import { WeaponSystem, weaponBalanceDamageMultiplier } from '../dist/src/game/WeaponSystem.js';

async function json(name) {
  return JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
}

function level(overrides = {}) {
  return {
    level: 1,
    damage: 20,
    cooldown: 1,
    count: 1,
    speed: 500,
    range: 600,
    pierce: 0,
    size: 10,
    duration: 1,
    knockback: 0,
    statusChance: 0,
    ...overrides,
  };
}

function weaponConfig(id, behavior, overrides = {}) {
  const base = level(overrides);
  return {
    id,
    name: id,
    behavior,
    element: 'physical',
    icon: '',
    description: '',
    maxLevel: 8,
    levels: Array.from({ length: 8 }, (_, index) => ({ ...base, level: index + 1 })),
  };
}

function weaponWorld({ bonusProjectiles = 0, enemies = [], critical = false } = {}) {
  const spawned = [];
  const hits = [];
  return {
    spawned,
    hits,
    world: {
      autoAim: true,
      enemies,
      player: {
        x: 0,
        y: 0,
        aim: { x: 1, y: 0 },
        rageActive: 0,
        character: { passive: { kind: 'none', value: 0 }, rage: undefined },
        stats: {
          get(stat) {
            return {
              cooldownReduction: 0,
              attackSpeed: 1,
              bonusProjectiles,
              range: 1,
              projectileSpeed: 1,
              critChance: critical ? 1 : 0,
            }[stat] ?? 0;
          },
        },
        effectiveDamageMultiplier: () => 1,
        effectiveCritDamage: () => 1.8,
      },
      rng: { chance: () => critical },
      projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
      enemySpatial: { queryCircle: () => enemies },
      nearestEnemy: () => enemies[0] ?? null,
      damageEnemy(enemy, damage) {
        hits.push({ enemy, damage });
        return { amount: damage, critical: false, killed: false };
      },
      particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
      screenShake: () => {},
    },
  };
}

test('every weapon has one bounded, functional evolution path', async () => {
  const [weapons, evolutions] = await Promise.all([json('weapons.json'), json('evolutions.json')]);
  const counts = new Map(weapons.map((weapon) => [weapon.id, 0]));
  for (const evolution of evolutions) {
    counts.set(evolution.weapon, (counts.get(evolution.weapon) ?? 0) + 1);
    assert.ok(evolution.damageMultiplier >= 1.25 && evolution.damageMultiplier <= 2.5);
    assert.ok(evolution.cooldownMultiplier >= 0.45 && evolution.cooldownMultiplier <= 0.8);
    assert.ok(evolution.countBonus >= 0 && evolution.countBonus <= 6);
  }
  for (const [weaponId, count] of counts) assert.equal(count, 1, `${weaponId} needs exactly one evolution`);

  for (const weapon of weapons) {
    for (let index = 1; index < weapon.levels.length; index += 1) {
      const previous = weapon.levels[index - 1];
      const current = weapon.levels[index];
      assert.ok(current.damage > previous.damage, `${weapon.id} damage must rise every level`);
      assert.ok(current.cooldown < previous.cooldown, `${weapon.id} cooldown must improve every level`);
      assert.ok(current.count >= previous.count, `${weapon.id} count cannot regress`);
      assert.ok(current.pierce >= previous.pierce, `${weapon.id} pierce cannot regress`);
    }
    const evolution = evolutions.find((item) => item.weapon === weapon.id);
    const finalLevel = weapon.levels.at(-1);
    const powerStep = evolution.damageMultiplier / evolution.cooldownMultiplier
      * ((finalLevel.count + evolution.countBonus) / Math.max(1, finalLevel.count));
    assert.ok(powerStep >= 2 && powerStep <= 9, `${weapon.id} evolution power step is outside the safe band: ${powerStep}`);
  }
});

test('projectile evolution applies its configured damage and behavior, not only its name', () => {
  const config = weaponConfig('test-bow', 'bow');
  const evolution = {
    id: 'test-split', name: '', weapon: config.id, passive: '', description: '',
    damageMultiplier: 2, cooldownMultiplier: 1, countBonus: 0, effect: 'split',
  };
  const data = {
    weaponById: new Map([[config.id, config]]),
    evolutionById: new Map([[evolution.id, evolution]]),
  };
  const weapons = new WeaponSystem(data);
  weapons.addWeapon(config.id);
  weapons.evolve(config.id, evolution.id);
  const setup = weaponWorld({ enemies: [{ id: 1, active: true, x: 100, y: 0, radius: 10 }] });

  weapons.update(1, setup.world);

  assert.equal(setup.spawned.length, 1);
  assert.equal(setup.spawned[0].damage, 40);
  assert.equal(setup.spawned[0].pierce, 24);
});

test('unlimited projectile bonuses fold into laser damage after the visual cap', () => {
  const config = weaponConfig('test-laser', 'laser', { damage: 10, speed: 0 });
  const data = { weaponById: new Map([[config.id, config]]), evolutionById: new Map() };
  const weapons = new WeaponSystem(data);
  weapons.addWeapon(config.id);
  const target = { id: 1, active: true, x: 100, y: 0, radius: 10 };
  const setup = weaponWorld({ bonusProjectiles: 99, enemies: [target] });

  weapons.update(1, setup.world);

  assert.equal(setup.hits.length, 1, 'only the central rendered beam should cross the target');
  assert.ok(Math.abs(setup.hits[0].damage - (10 * weaponBalanceDamageMultiplier('laser') * 100 / 3)) < 1e-9,
    '100 requested beams should be represented by three damage-folded beams');
});

test('director composition shifts from readable fodder to tactical pressure', () => {
  const fodder = { ai: 'melee', cost: 1 };
  const tank = { ai: 'tank', cost: 3 };
  const healer = { ai: 'healer', cost: 4 };
  const waves = 4;
  const earlyTankRatio = directorChoiceWeight(tank, 1, waves) / directorChoiceWeight(fodder, 1, waves);
  const lateTankRatio = directorChoiceWeight(tank, waves, waves) / directorChoiceWeight(fodder, waves, waves);
  const earlyHealerRatio = directorChoiceWeight(healer, 1, waves) / directorChoiceWeight(fodder, 1, waves);
  const lateHealerRatio = directorChoiceWeight(healer, waves, waves) / directorChoiceWeight(fodder, waves, waves);

  assert.ok(earlyTankRatio < 0.3);
  assert.ok(lateTankRatio > earlyTankRatio * 4);
  assert.ok(earlyHealerRatio < 0.12);
  assert.ok(lateHealerRatio > earlyHealerRatio * 6);
});

test('upgrade offers always expose a build focus and hide wasted full-health healing', async () => {
  const [weaponsData, passives, evolutions, upgradesData] = await Promise.all([
    json('weapons.json'), json('passives.json'), json('evolutions.json'), json('upgrades.json'),
  ]);
  const data = {
    weapons: weaponsData,
    passives,
    evolutions,
    upgrades: upgradesData,
    weaponById: new Map(weaponsData.map((item) => [item.id, item])),
    passiveById: new Map(passives.map((item) => [item.id, item])),
    evolutionById: new Map(evolutions.map((item) => [item.id, item])),
  };
  const runtimeWeapons = new WeaponSystem(data);
  runtimeWeapons.addWeapon('rift-blade');
  const stats = new PlayerStats({ maxHp: 100 });
  const player = {
    level: 2,
    health: 100,
    character: { passive: { kind: 'none', value: 0 } },
    stats,
    syncMaxHp: () => {},
    heal: () => {},
  };
  const system = new UpgradeSystem(data, new RNG(771), player, runtimeWeapons);
  const first = system.generateOptions();
  const matchingPassive = first.find((option) => option.targetId === 'keen-lens');

  assert.ok(matchingPassive, 'the starting weapon must expose its evolution passive');
  assert.ok(!first.some((option) => option.targetId === 'field-repair'), 'full-health healing is a wasted offer');
  assert.equal(new Set(first.map((option) => option.targetId)).size, first.length);
  system.apply(matchingPassive.id);

  player.level = 5;
  const second = system.generateOptions();
  assert.ok(second.some((option) => option.type === 'weapon-level' && option.targetId === 'rift-blade'),
    'after taking the passive, the weapon progression must remain available');
});

test('cooldown reduction and dodge remain useful without reaching immunity', () => {
  const stats = new PlayerStats({ cooldownReduction: 0, dodge: 0 });
  let previousCooldown = 0;
  let previousDodge = 0;
  for (let index = 0; index < 40; index += 1) {
    stats.apply('cooldownReduction', 0.055, 'add');
    stats.apply('dodge', 0.035, 'add');
    const cooldown = stats.get('cooldownReduction');
    const dodge = stats.get('dodge');
    assert.ok(cooldown > previousCooldown && cooldown < 0.78);
    assert.ok(dodge > previousDodge && dodge < 0.65);
    previousCooldown = cooldown;
    previousDodge = dodge;
  }
});
