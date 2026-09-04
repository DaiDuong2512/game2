import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Director,
  BOSS_SMALL_SPAWN_RATE_MULTIPLIER,
  ENEMY_SIZE_SELECTION_MULTIPLIERS,
  ENEMY_SPAWN_RATE_MULTIPLIER,
  directorChoiceWeight,
  directorSpawnDensity,
  enemySizeSelectionMultiplier,
  resolveEnemySizeClass,
} from '../dist/src/game/Director.js';
import {
  EXP_REQUIREMENT_MULTIPLIER,
  EXPERIENCE_GAIN_MULTIPLIER,
  ExperienceSystem,
} from '../dist/src/game/ExperienceSystem.js';

test('enemy spawn budget is doubled again from the current 2.5 pacing without changing stage timing', () => {
  assert.equal(ENEMY_SPAWN_RATE_MULTIPLIER, 5);
  assert.equal(directorSpawnDensity(20, 1), 20 * 0.065 * 5);

  const calls = [];
  const enemy = { id: 'test-enemy', tier: 'normal', ai: 'melee', cost: 1 };
  const director = new Director(
    { enemyById: new Map([[enemy.id, enemy]]) },
    { weighted: (choices) => choices[0]?.item, chance: () => false },
    {
      spawnAround: () => {
        calls.push(1);
        return { isElite: false, radius: 10, exp: 1, gold: 0 };
      },
    },
  );
  director.start({ index: 1, waveCount: 4, allowedEnemies: [enemy.id], spawnBase: 20 }, false);

  director.update(0, 0, 0, { spawnRate: 1, eliteRate: 0 }, 1, 0, 0);
  const openingCount = calls.length;
  for (let frame = 0; frame < 2_000; frame += 1) {
    director.update(0.04, 0, 0, { spawnRate: 1, eliteRate: 0 }, 1, 0, 0);
  }

  assert.equal(openingCount, 10);
  assert.equal(
    calls.length - openingCount,
    525,
    '80 seconds adds 520 new budget plus the five units left after the capped opening frame',
  );
});

test('director applies the requested selection multiplier for every enemy size class', () => {
  assert.deepEqual(ENEMY_SIZE_SELECTION_MULTIPLIERS, {
    small: 2,
    medium: 1.25,
    large: 1.15,
  });
  for (const [sizeClass, multiplier] of Object.entries(ENEMY_SIZE_SELECTION_MULTIPLIERS)) {
    assert.equal(enemySizeSelectionMultiplier({ sizeClass }), multiplier);
  }

  const common = { ai: 'melee', cost: 1, radius: 15 };
  const mediumWeight = directorChoiceWeight({ ...common, sizeClass: 'medium' }, 1, 4);
  assert.ok(Math.abs(
    directorChoiceWeight({ ...common, sizeClass: 'small' }, 1, 4) / mediumWeight - 2 / 1.25,
  ) < 1e-12);
  assert.ok(Math.abs(
    directorChoiceWeight({ ...common, sizeClass: 'large' }, 1, 4) / mediumWeight - 1.15 / 1.25,
  ) < 1e-12);
});

test('legacy enemy data resolves sizeClass from radius before applying composition weights', () => {
  assert.equal(resolveEnemySizeClass({ radius: 14 }), 'small');
  assert.equal(resolveEnemySizeClass({ radius: 15 }), 'medium');
  assert.equal(resolveEnemySizeClass({ radius: 20 }), 'large');
  assert.equal(resolveEnemySizeClass({ sizeClass: 'small', radius: 30 }), 'small');
});

test('level thresholds require 80% more experience and current XP gain is increased by 25%', () => {
  assert.equal(EXP_REQUIREMENT_MULTIPLIER, 1.8);
  assert.equal(EXPERIENCE_GAIN_MULTIPLIER, 1.25);
  const player = {
    level: 1,
    exp: 0,
    expToNext: 0,
    stats: { get: (stat) => stat === 'expGain' ? 1 : 0 },
  };
  const experience = new ExperienceSystem(player);
  const expectedThresholds = new Map([
    [1, 67], [3, 98], [5, 174], [10, 400], [20, 945],
  ]);
  for (const [level, threshold] of expectedThresholds) {
    assert.equal(experience.threshold(level), threshold, `wrong threshold at level ${level}`);
  }

  assert.equal(player.expToNext, 67);
  assert.equal(experience.gain(40), 0);
  assert.equal(player.level, 1);
  assert.equal(experience.gain(14), 1);
  assert.equal(player.level, 2);
});

test('boss doubles the small-enemy spawn stream without boosting other sizes', () => {
  assert.equal(BOSS_SMALL_SPAWN_RATE_MULTIPLIER, 2);
  const calls = [];
  const small = { id: 'small', tier: 'normal', ai: 'melee', sizeClass: 'small', cost: 1 };
  const medium = { id: 'medium', tier: 'normal', ai: 'tank', sizeClass: 'medium', cost: 2 };
  const director = new Director(
    { enemyById: new Map([[small.id, small], [medium.id, medium]]) },
    { weighted: (choices) => choices[0]?.item, chance: () => false },
    { spawnAround: (id) => { calls.push(id); return { isElite: false, radius: 10, exp: 1, gold: 0 }; } },
  );
  director.start({ index: 5, waveCount: 5, allowedEnemies: [small.id, medium.id], spawnBase: 20 }, false);
  director.update(0, 0, 0, { spawnRate: 1, eliteRate: 0 }, 5, 0, 0, undefined, true);
  const openingSmall = calls.filter((id) => id === small.id).length;
  for (let frame = 0; frame < 2_000; frame += 1) {
    director.update(0.04, 0, 0, { spawnRate: 1, eliteRate: 0 }, 5, 0, 0, undefined, true);
  }
  assert.equal(openingSmall, 10);
  assert.equal(
    calls.filter((id) => id === small.id).length - openingSmall,
    1045,
    'boss stream adds 520 small enemies on top of the normal stream and its opening carry',
  );
  assert.equal(calls.filter((id) => id === medium.id).length, 0, 'luồng bổ sung của boss chỉ được sinh quái nhỏ');
});
