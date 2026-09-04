import test from 'node:test';
import assert from 'node:assert/strict';

import { WeaponSystem } from '../dist/src/game/WeaponSystem.js';

function weaponConfig(id, behavior, { cooldown = 1, count = 1 } = {}) {
  const level = {
    level: 1,
    damage: 10,
    cooldown,
    count,
    speed: 500,
    range: 500,
    pierce: 0,
    size: 10,
    duration: 1,
    knockback: 0,
    statusChance: 0,
  };
  return {
    id,
    name: id,
    behavior,
    element: 'physical',
    icon: '',
    description: '',
    maxLevel: 1,
    levels: [level],
  };
}

function enemy(id, angle, radius = 120) {
  return { id, active: true, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, radius: 10 };
}

function harness(configs, enemies, { autoAim = true, aim = { x: 1, y: 0 } } = {}) {
  const spawned = [];
  const lines = [];
  const data = {
    weaponById: new Map(configs.map((config) => [config.id, config])),
    evolutionById: new Map(),
  };
  const weapons = new WeaponSystem(data);
  configs.forEach((config, index) => {
    assert.equal(index === 0 ? weapons.equipPrimaryWeapon(config.id) : weapons.addAuxiliaryWeapon(config.id), true);
  });
  const world = {
    autoAim,
    enemies,
    player: {
      x: 0,
      y: 0,
      aim,
      rageActive: 0,
      radius: 12,
      character: { passive: { kind: 'none', value: 0 }, rage: undefined },
      stats: {
        get(stat) {
          return { cooldownReduction: 0, attackSpeed: 1, bonusProjectiles: 0, range: 1, projectileSpeed: 1, critChance: 0 }[stat] ?? 0;
        },
      },
      effectiveDamageMultiplier: () => 1,
      effectiveCritDamage: () => 1.8,
      triggerPrimaryAttack: () => {},
    },
    rng: { chance: () => false },
    projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
    enemySpatial: { queryCircle: () => enemies },
    nearestEnemy(x, y, range, excluded) {
      return enemies
        .filter((item) => item.active && !excluded?.has(item.id))
        .map((item) => ({ item, distance: (item.x - x) ** 2 + (item.y - y) ** 2 }))
        .filter((entry) => entry.distance < range * range)
        .sort((left, right) => left.distance - right.distance || left.item.id - right.item.id)[0]?.item ?? null;
    },
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    particles: {
      line: (x, y, x2, y2) => lines.push({ x, y, x2, y2 }),
      burst: () => {},
      ring: () => {},
      spawn: () => {},
    },
    screenShake: () => {},
  };
  return { weapons, world, spawned, lines };
}

function shotAngle(shot) {
  return Math.atan2(shot.vy, shot.vx);
}

function closeAngle(actual, expected, epsilon = 0.02) {
  const delta = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
  assert.ok(Math.abs(delta) < epsilon, `expected ${expected}, received ${actual}`);
}

test('three automatic directional weapons occupy stable angular slots and distinct targets', () => {
  const configs = [
    weaponConfig('primary-bow', 'bow', { cooldown: 5 }),
    weaponConfig('aux-gun', 'gun', { cooldown: 1 }),
    weaponConfig('aux-fireball', 'fireball', { cooldown: 5 }),
  ];
  const enemies = [enemy(30, Math.PI * 2 / 3), enemy(10, 0), enemy(20, -Math.PI * 2 / 3)];
  const setup = harness(configs, enemies);

  setup.weapons.update(0.2, setup.world);
  assert.equal(setup.spawned.length, 3);
  closeAngle(shotAngle(setup.spawned.find((shot) => shot.sourceWeaponId === 'primary-bow')), 0);
  closeAngle(shotAngle(setup.spawned.find((shot) => shot.sourceWeaponId === 'aux-gun')), Math.PI * 2 / 3);
  closeAngle(shotAngle(setup.spawned.find((shot) => shot.sourceWeaponId === 'aux-fireball')), -Math.PI * 2 / 3);

  setup.spawned.length = 0;
  setup.weapons.update(1, setup.world);
  assert.equal(setup.spawned.length, 1, 'only the short-cooldown auxiliary should fire');
  assert.equal(setup.spawned[0].sourceWeaponId, 'aux-gun');
  closeAngle(shotAngle(setup.spawned[0]), Math.PI * 2 / 3);
});

test('one weapon, manual aim and no-enemy fallback preserve the existing direction rules', () => {
  const nearest = enemy(1, Math.PI / 2, 60);
  const one = harness([weaponConfig('solo-bow', 'bow')], [nearest], { aim: { x: -1, y: 0 } });
  one.weapons.update(0.2, one.world);
  closeAngle(shotAngle(one.spawned[0]), Math.PI / 2);

  const configs = [weaponConfig('manual-bow', 'bow'), weaponConfig('manual-gun', 'gun')];
  const manual = harness(configs, [enemy(2, 0)], { autoAim: false, aim: { x: 0, y: 1 } });
  manual.weapons.update(0.2, manual.world);
  manual.spawned.forEach((shot) => closeAngle(shotAngle(shot), Math.PI / 2));

  const empty = harness(configs, [], { aim: { x: 0, y: -1 } });
  empty.weapons.update(0.2, empty.world);
  empty.spawned.forEach((shot) => closeAngle(shotAngle(shot), -Math.PI / 2));
});

test('multi-ray volley consumes every distinct target before reusing the nearest', () => {
  const configs = [weaponConfig('fan-bow', 'bow', { count: 3 }), weaponConfig('side-gun', 'gun')];
  const setup = harness(configs, [enemy(1, 0), enemy(2, Math.PI)]);
  setup.weapons.update(0.2, setup.world);
  const volley = setup.spawned.filter((shot) => shot.sourceWeaponId === 'fan-bow').map(shotAngle);
  assert.equal(volley.length, 3);
  closeAngle(volley[0], 0);
  closeAngle(volley[1], Math.PI);
  closeAngle(volley[2], 0);
  closeAngle(shotAngle(setup.spawned.find((shot) => shot.sourceWeaponId === 'side-gun')), Math.PI);
});

test('laser uses its assigned direction while radial ice bypasses target distribution', () => {
  const configs = [
    weaponConfig('east-bow', 'bow'),
    weaponConfig('west-laser', 'laser'),
    weaponConfig('radial-ice', 'ice', { count: 4 }),
  ];
  const setup = harness(configs, [enemy(1, 0), enemy(2, Math.PI)]);
  setup.weapons.update(0.2, setup.world);
  assert.ok(setup.lines.some((line) => line.x2 < -400 && Math.abs(line.y2) < 1), 'laser ray should occupy the opposite slot');
  const iceAngles = setup.spawned
    .filter((shot) => shot.sourceWeaponId === 'radial-ice')
    .map(shotAngle)
    .sort((a, b) => a - b);
  assert.equal(iceAngles.length, 4);
  const circularGaps = iceAngles.map((angle, index) => {
    const next = iceAngles[(index + 1) % iceAngles.length] + (index === iceAngles.length - 1 ? Math.PI * 2 : 0);
    return next - angle;
  });
  circularGaps.forEach((gap) => assert.ok(Math.abs(gap - Math.PI / 2) < 0.02));
});
