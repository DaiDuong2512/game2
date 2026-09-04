import test from 'node:test';
import assert from 'node:assert/strict';

import { WeaponSystem, weaponBalanceDamageMultiplier } from '../dist/src/game/WeaponSystem.js';

function lightningConfig() {
  const level = {
    level: 1,
    damage: 20,
    cooldown: 1,
    count: 1,
    speed: 0,
    range: 300,
    pierce: 0,
    size: 8,
    duration: 0.2,
    knockback: 0,
    statusChance: 0.5,
  };
  return {
    id: 'storm-call',
    name: 'Tiếng Gọi Bão Tố',
    behavior: 'lightning',
    element: 'lightning',
    icon: '',
    description: '',
    maxLevel: 8,
    levels: Array.from({ length: 8 }, (_, index) => ({ ...level, level: index + 1 })),
  };
}

test('chain lightning still acquires and damages a target when automatic aim is disabled', () => {
  const config = lightningConfig();
  const data = {
    weaponById: new Map([[config.id, config]]),
    evolutionById: new Map(),
  };
  const weapons = new WeaponSystem(data);
  assert.equal(weapons.addWeapon(config.id), true);

  const target = { id: 1, active: true, x: 100, y: 0, radius: 10 };
  const hits = [];
  const critRolls = [];
  const playerStats = {
    get(stat) {
      return {
        cooldownReduction: 0,
        attackSpeed: 1,
        bonusProjectiles: 0,
        range: 1,
        projectileSpeed: 1,
        critChance: 0.1,
      }[stat] ?? 0;
    },
  };
  const world = {
    autoAim: false,
    player: {
      x: 0,
      y: 0,
      aim: { x: 0, y: 1 },
      rageActive: 0,
      character: {
        passive: { kind: 'none', value: 0 },
        rage: undefined,
      },
      stats: playerStats,
      effectiveDamageMultiplier: () => 1,
      effectiveCritDamage: () => 1.8,
    },
    rng: {
      chance(probability) {
        critRolls.push(probability);
        return false;
      },
    },
    nearestEnemy(_x, _y, _range, excluded) {
      return excluded?.has(target.id) ? null : target;
    },
    damageEnemy(enemy, damage, element, sourceWeaponId) {
      hits.push({ enemy, damage, element, sourceWeaponId });
      return { amount: damage, critical: false, killed: false };
    },
    particles: {
      line: () => {},
      burst: () => {},
      ring: () => {},
    },
    screenShake: () => {},
  };

  weapons.update(1, world);

  assert.equal(hits.length, 1);
  assert.strictEqual(hits[0].enemy, target);
  assert.equal(hits[0].sourceWeaponId, config.id);
  assert.equal(hits[0].element, 'lightning');
  assert.equal(hits[0].damage, 20 * weaponBalanceDamageMultiplier('lightning'));
  assert.deepEqual(critRolls, [0.1], 'weapon critical rolls must use the player 10% stat without a hidden bonus');
});
