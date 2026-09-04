import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../dist/src/core/RNG.js';

test('seeded RNG reproduces the same run', () => {
  const first = new RNG(1337);
  const second = new RNG(1337);
  const a = Array.from({ length: 50 }, () => first.nextUint());
  const b = Array.from({ length: 50 }, () => second.nextUint());
  assert.deepEqual(a, b);
});

test('weighted selection always returns an available item', () => {
  const rng = new RNG(42);
  for (let index = 0; index < 100; index += 1) {
    const value = rng.weighted([{ item: 'a', weight: 1 }, { item: 'b', weight: 3 }]);
    assert.ok(value === 'a' || value === 'b');
  }
});
