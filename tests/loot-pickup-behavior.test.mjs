import test from 'node:test';
import assert from 'node:assert/strict';

import { LootSystem, pickupHomesAutomatically } from '../dist/src/game/LootSystem.js';

const PICKUP_TYPES = [
  'exp', 'gold', 'heal', 'magnet', 'fury', 'chest', 'shard',
  'stat-shard', 'skill-crit-shard',
];

class FixedRng {
  float() { return 0; }
}

function createWorld() {
  const collected = {
    exp: 0,
    gold: 0,
    shards: 0,
    chests: 0,
    statShards: 0,
    skillCritShards: 0,
    heals: 0,
  };
  const player = {
    x: 0,
    y: 0,
    radius: 18,
    furyTime: 0,
    stats: {
      get(stat) {
        if (stat === 'maxHp') return 100;
        return 1;
      },
    },
    heal(amount) { collected.heals += amount; },
  };
  return {
    collected,
    world: {
      player,
      rng: new FixedRng(),
      particles: { burst() {} },
      gainExperience(amount) { collected.exp += amount; },
      gainGold(amount) { collected.gold += amount; },
      gainShards(amount) { collected.shards += amount; },
      openChest() { collected.chests += 1; },
      applyStatShard() { collected.statShards += 1; },
      gainSkillCritShard() { collected.skillCritShards += 1; },
      toast() {},
    },
  };
}

test('only the random-stat shard requires manual collection', () => {
  for (const type of PICKUP_TYPES) {
    assert.equal(
      pickupHomesAutomatically(type),
      type !== 'stat-shard',
      `${type} has the wrong pickup policy`,
    );
  }
});

test('experience and every non-stat pickup fly in and collect while the player stands still', () => {
  const loot = new LootSystem(new FixedRng());
  const { world, collected } = createWorld();
  const automaticTypes = PICKUP_TYPES.filter((type) => type !== 'stat-shard');

  for (const [index, type] of automaticTypes.entries()) {
    const pickup = loot.spawn(type, 900, (index - 3.5) * 18, type === 'heal' ? 0.24 : type === 'exp' ? 7 : type === 'shard' ? 5 : 1);
    assert.ok(pickup);
    assert.equal(pickup.magnetized, true, `${type} should start homing immediately`);
  }
  const manualShard = loot.spawn('stat-shard', 900, 110, 1);
  assert.ok(manualShard);
  manualShard.statId = 'luck';
  const manualStart = { x: manualShard.x, y: manualShard.y };

  for (let frame = 0; frame < 600; frame += 1) loot.update(1 / 60, world);

  assert.equal(collected.exp, 7, 'experience should collect without player movement');
  assert.equal(collected.gold, 1, 'gold should auto-collect');
  assert.equal(collected.shards, 5, 'Rift Shards should auto-collect');
  assert.equal(collected.chests, 1, 'chests should auto-collect');
  assert.equal(collected.skillCritShards, 1, 'skill-critical shards should auto-collect');
  assert.equal(collected.heals, 24, 'healing pickups should auto-collect');
  assert.equal(world.player.furyTime, 10, 'fury pickups should auto-collect');
  assert.equal(manualShard.active, true, 'random-stat shard should remain on the ground');
  assert.equal(manualShard.magnetized, false);
  assert.deepEqual({ x: manualShard.x, y: manualShard.y }, manualStart);
  assert.equal(collected.statShards, 0);
});

test('magnet effects cannot pull a random-stat shard and stale cleanup cannot discard it', () => {
  const loot = new LootSystem(new FixedRng());
  const { world, collected } = createWorld();
  const statShard = loot.spawn('stat-shard', 2001, 0, 1);
  assert.ok(statShard);
  statShard.statId = 'damage';
  statShard.age = 71;
  statShard.magnetized = true;

  loot.spawn('magnet', 0, 0, 1);
  loot.update(1 / 60, world);

  assert.equal(statShard.active, true, 'manual reward must persist until touched');
  assert.equal(statShard.magnetized, false, 'magnet pickup must not override manual collection');
  assert.equal(statShard.x, 2001);
  assert.equal(collected.statShards, 0);
});

test('a random-stat shard still collects on direct player contact', () => {
  const loot = new LootSystem(new FixedRng());
  const { world, collected } = createWorld();
  const statShard = loot.spawn('stat-shard', 0, 0, 1);
  assert.ok(statShard);
  statShard.statId = 'armor';

  loot.update(1 / 60, world);

  assert.equal(statShard.active, false);
  assert.equal(collected.statShards, 1);
});

test('boss aftermath vacuums even manual stat shards and flushes every remaining reward', () => {
  const loot = new LootSystem(new FixedRng());
  const { world, collected } = createWorld();
  const statShard = loot.spawn('stat-shard', 800, 0, 1);
  const exp = loot.spawn('exp', 900, 0, 9);
  assert.ok(statShard && exp);
  statShard.statId = 'damage';

  loot.activateBossVacuum(10.75);
  assert.equal(statShard.magnetized, true);
  loot.collectAll(world);

  assert.equal(statShard.active, false);
  assert.equal(exp.active, false);
  assert.equal(collected.statShards, 1);
  assert.equal(collected.exp, 9);
});
