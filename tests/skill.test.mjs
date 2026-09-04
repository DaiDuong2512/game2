import test from 'node:test';
import assert from 'node:assert/strict';

import { SkillSystem } from '../dist/src/game/SkillSystem.js';

test('void-collapse ultimate pulls enemies toward the player even with arcane damage', () => {
  const enemy = {
    active: true,
    x: 100,
    y: 0,
    isBoss: false,
    isElite: false,
    knockbackX: 0,
    knockbackY: 0,
    status: {
      slowTime: 0,
      slowFactor: 1,
      stunTime: 0,
    },
  };
  const damageCalls = [];
  const world = {
    input: {
      wasPressed: () => false,
      gamepadPressed: () => false,
    },
    player: {
      x: 0,
      y: 0,
      activeCooldown: 0,
      rageMeter: 0,
      ultimateMeter: 0,
      ultimateActive: 1,
      skillCritShards: 0,
      character: {
        ultimate: { kind: 'void-collapse' },
      },
      stats: {
        get(stat) {
          return stat === 'range' ? 1 : stat === 'cooldownReduction' ? 0 : 0;
        },
      },
      effectiveDamageMultiplier: () => 1,
      skillCritDamage: () => 2,
    },
    enemySpatial: {
      queryCircle: () => [enemy],
    },
    rng: { chance: () => false },
    damageEnemy(target, damage, element, sourceWeaponId) {
      damageCalls.push({ target, damage, element, sourceWeaponId });
      return { amount: damage, critical: false, killed: false };
    },
    particles: {
      ring: () => {},
      burst: () => {},
      line: () => {},
    },
    audio: { play: () => {} },
    toast: () => {},
    screenShake: () => {},
  };

  const skills = new SkillSystem();
  skills.update(0.1, world);

  assert.equal(damageCalls.length, 1);
  assert.equal(damageCalls[0].element, 'arcane');
  assert.equal(damageCalls[0].sourceWeaponId, 'ultimate-void-collapse');
  assert.ok(enemy.knockbackX < 0, 'an enemy to the right must be pulled left toward the player');
  assert.ok(Math.abs(enemy.knockbackY) < 1e-12);
  assert.ok(enemy.status.slowTime >= 0.8);
});
