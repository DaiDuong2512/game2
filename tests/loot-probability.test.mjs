import test from 'node:test';
import assert from 'node:assert/strict';

import { LootSystem } from '../dist/src/game/LootSystem.js';

class RareOnlyRng {
  constructor(rareProbability) {
    this.rareProbability = rareProbability;
    this.probabilities = [];
  }

  chance(probability) {
    this.probabilities.push(probability);
    return Math.abs(probability - this.rareProbability) < 1e-15;
  }

  float(min) {
    return min;
  }

  pick(items) {
    return items[0];
  }
}

function enemy(sizeClass) {
  return {
    x: 0,
    y: 0,
    exp: 1,
    gold: 0,
    isElite: false,
    isBoss: false,
    radius: sizeClass === 'large' ? 24 : sizeClass === 'medium' ? 17 : 10,
    config: { sizeClass },
  };
}

function activePickupTypes(loot) {
  return loot.pool.allItems().filter((pickup) => pickup.active).map((pickup) => pickup.type);
}

test('medium and large enemies use the specified 0.012% skill-critical shard base chance', () => {
  const baseChance = 0.00012;
  for (const sizeClass of ['medium', 'large']) {
    const rng = new RareOnlyRng(baseChance);
    const loot = new LootSystem(rng);
    loot.spawnOnDeath(enemy(sizeClass), 0);

    assert.ok(rng.probabilities.some((probability) => Math.abs(probability - baseChance) < 1e-15));
    assert.ok(activePickupTypes(loot).includes('skill-crit-shard'), `${sizeClass} enemies should be eligible for the super-rare shard`);
  }
});

test('small enemies are not eligible for the super-rare skill-critical shard', () => {
  const baseChance = 0.00012;
  const rng = new RareOnlyRng(baseChance);
  const loot = new LootSystem(rng);
  loot.spawnOnDeath(enemy('small'), 0);

  assert.ok(!rng.probabilities.some((probability) => Math.abs(probability - baseChance) < 1e-15));
  assert.ok(!activePickupTypes(loot).includes('skill-crit-shard'));
});

test('luck scales the rare shard chance from its exact base probability', () => {
  const luck = 0.5;
  const expected = 0.00012 * (1 + luck * 2);
  const rng = new RareOnlyRng(expected);
  const loot = new LootSystem(rng);
  loot.spawnOnDeath(enemy('medium'), luck);

  assert.ok(rng.probabilities.some((probability) => Math.abs(probability - expected) < 1e-15));
  assert.ok(activePickupTypes(loot).includes('skill-crit-shard'));
});

test('extreme luck remains bounded so drops stay rare and do not flood the pools', () => {
  const rng = new RareOnlyRng(-1);
  const loot = new LootSystem(rng);
  loot.spawnOnDeath(enemy('large'), 100);

  assert.ok(rng.probabilities.length >= 5);
  assert.ok(rng.probabilities.every((probability) => Number.isFinite(probability) && probability <= 0.22));
  assert.ok(rng.probabilities.some((probability) => Math.abs(probability - 0.01) < 1e-15),
    'the super-rare shard should retain a 1% hard ceiling even at extreme luck');
});
