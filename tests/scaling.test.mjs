import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALING_CAPS,
  WAVE_SCALING_DELTAS,
  computeScaling,
} from '../dist/src/game/Scaling.js';

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, received ${actual}`);
}

test('difficulty scaling is monotonic without exponential runaway', () => {
  let previous = computeScaling(1, 1);
  for (let stage = 2; stage <= 20; stage += 1) {
    const current = computeScaling(stage, 1);
    assert.ok(current.health > previous.health);
    assert.ok(current.damage > previous.damage);
    assert.ok(current.spawnRate >= previous.spawnRate);
    assert.ok(current.speed <= 1.38);
    assert.ok(current.spawnRate <= 2.9);
    assert.ok(current.eliteRate <= 0.18);
    previous = current;
  }
  const final = computeScaling(20, 6);
  assert.ok(final.health < 8, `HP multiplier should remain controlled, received ${final.health}`);
  assert.ok(final.damage < 4, `Damage multiplier should remain reactive, received ${final.damage}`);
});

test('per-wave pressure rises slightly above the previous tuning and remains capped', () => {
  assert.ok(WAVE_SCALING_DELTAS.health > 0.11 && WAVE_SCALING_DELTAS.health <= 0.13);
  assert.ok(WAVE_SCALING_DELTAS.damage > 0.055 && WAVE_SCALING_DELTAS.damage <= 0.065);
  assert.ok(WAVE_SCALING_DELTAS.spawnRate > 0.08 && WAVE_SCALING_DELTAS.spawnRate <= 0.1);
  assert.ok(WAVE_SCALING_DELTAS.eliteRate > 0.008 && WAVE_SCALING_DELTAS.eliteRate <= 0.009);

  const first = computeScaling(1, 1);
  const second = computeScaling(1, 2);
  assertClose(second.health - first.health, WAVE_SCALING_DELTAS.health, 'health wave delta');
  assertClose(second.damage - first.damage, WAVE_SCALING_DELTAS.damage, 'damage wave delta');
  assertClose(second.speed - first.speed, WAVE_SCALING_DELTAS.speed, 'speed wave delta');
  assertClose(second.spawnRate - first.spawnRate, WAVE_SCALING_DELTAS.spawnRate, 'spawn wave delta');
  assertClose(second.eliteRate - first.eliteRate, WAVE_SCALING_DELTAS.eliteRate, 'elite wave delta');

  for (const stage of [1, 10, 20]) {
    let previous = computeScaling(stage, 1);
    for (let wave = 2; wave <= 20; wave += 1) {
      const current = computeScaling(stage, wave);
      assert.ok(current.health > previous.health);
      assert.ok(current.damage > previous.damage);
      assert.ok(current.speed >= previous.speed && current.speed <= SCALING_CAPS.speed);
      assert.ok(current.spawnRate >= previous.spawnRate && current.spawnRate <= SCALING_CAPS.spawnRate);
      assert.ok(current.eliteRate >= previous.eliteRate && current.eliteRate <= SCALING_CAPS.eliteRate);
      previous = current;
    }
  }
});
