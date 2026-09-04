import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool } from '../dist/src/core/ObjectPool.js';
import { SpatialHash } from '../dist/src/core/SpatialHash.js';

test('spatial hash query results remain stable across subsequent queries', () => {
  const hash = new SpatialHash(16);
  const left = { id: 1, active: true, x: 0, y: 0, radius: 2 };
  const right = { id: 2, active: true, x: 96, y: 0, radius: 2 };
  hash.rebuild([left, right]);

  const first = hash.queryCircle(0, 0, 4);
  const second = hash.queryCircle(96, 0, 4);

  assert.deepEqual(first.map((item) => item.id), [1]);
  assert.deepEqual(second.map((item) => item.id), [2]);
  assert.notStrictEqual(first, second);
});

test('spatial hash supports a query triggered while another query is evaluating', () => {
  const hash = new SpatialHash(16);
  let nestedResult = [];
  let queried = false;
  let allowNested = false;
  const nested = { id: 2, active: true, x: 96, y: 0, radius: 2 };
  const outer = {
    id: 1,
    x: 0,
    y: 0,
    radius: 2,
    get active() {
      if (allowNested && !queried) {
        queried = true;
        nestedResult = hash.queryCircle(96, 0, 4);
      }
      return true;
    },
  };
  hash.rebuild([outer, nested]);
  allowNested = true;

  const outerResult = hash.queryCircle(0, 0, 4);

  assert.deepEqual(outerResult.map((item) => item.id), [1]);
  assert.deepEqual(nestedResult.map((item) => item.id), [2]);
});

test('spatial hash de-duplicates items spanning multiple cells', () => {
  const hash = new SpatialHash(16);
  const large = { id: 7, active: true, x: 0, y: 0, radius: 24 };
  hash.rebuild([large]);

  const result = hash.queryCircle(0, 0, 32);

  assert.deepEqual(result.map((item) => item.id), [7]);
});

test('spatial hash handles signed world coordinates without collisions', () => {
  const hash = new SpatialHash(16);
  const northWest = { id: 1, active: true, x: -40, y: -24, radius: 2 };
  const southEast = { id: 2, active: true, x: 40, y: 24, radius: 2 };
  hash.rebuild([northWest, southEast]);

  assert.deepEqual(hash.queryCircle(-40, -24, 3).map((item) => item.id), [1]);
  assert.deepEqual(hash.queryCircle(40, 24, 3).map((item) => item.id), [2]);
});

test('spatial hash filters items deactivated after rebuild', () => {
  const hash = new SpatialHash(16);
  const item = { id: 1, active: true, x: 0, y: 0, radius: 2 };
  hash.rebuild([item]);
  item.active = false;

  assert.deepEqual(hash.queryCircle(0, 0, 4), []);
});

test('object pool reuses released items and preserves reset semantics', () => {
  let nextId = 0;
  const pool = new ObjectPool(
    () => ({
      id: nextId++,
      active: false,
      resetCount: 0,
      activeDuringReset: false,
      reset() {
        this.resetCount += 1;
        this.activeDuringReset = this.active;
      },
    }),
    2,
    3,
  );

  const first = pool.acquire();
  const second = pool.acquire();
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.id, 0);
  assert.equal(second.id, 1);

  pool.release(first);
  assert.equal(first.resetCount, 1);
  assert.equal(first.activeDuringReset, true);
  assert.equal(first.active, false);
  assert.strictEqual(pool.acquire(), first);

  const third = pool.acquire();
  assert.ok(third);
  assert.equal(third.id, 2);
  assert.equal(pool.acquire(), null);

  pool.releaseAll();
  assert.equal(pool.countActive(), 0);
  assert.equal(pool.capacity(), 3);
});

test('object pool acquisition does not perform a growing full-array scan', () => {
  let activeReads = 0;
  let nextId = 0;
  const pool = new ObjectPool(
    () => {
      let active = false;
      return {
        id: nextId++,
        get active() {
          activeReads += 1;
          return active;
        },
        set active(value) {
          active = value;
        },
        reset() {},
      };
    },
    256,
    256,
  );

  activeReads = 0;
  for (let index = 0; index < 256; index += 1) assert.ok(pool.acquire());

  assert.ok(
    activeReads <= 256,
    `acquire should inspect only the selected free slot; observed ${activeReads} active reads`,
  );
  assert.equal(pool.acquire(), null);
});
