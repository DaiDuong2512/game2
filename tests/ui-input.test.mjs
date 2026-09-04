import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputManager } from '../dist/src/core/InputManager.js';
import { formatDecimal, formatNumber } from '../dist/src/core/MathUtils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pointer aim stays in CSS-pixel space on a high-DPR canvas', () => {
  const previousWindow = globalThis.window;
  const windowListeners = new Map();
  const canvasListeners = new Map();
  globalThis.window = {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  const canvas = {
    width: 2000,
    height: 1000,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    getBoundingClientRect() { return { left: 10, top: 20, width: 1000, height: 500 }; },
  };

  try {
    const input = new InputManager(canvas);
    canvasListeners.get('pointermove')({ clientX: 510, clientY: 270 });
    assert.deepEqual(input.getAimVector(500, 250), { x: 0, y: 0 });
    canvasListeners.get('pointermove')({ clientX: 1010, clientY: 270 });
    const right = input.getAimVector(500, 250);
    assert.ok(right.x > 0.999 && Math.abs(right.y) < 0.001);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('empty screen layer cannot intercept gameplay pointer input', async () => {
  const css = await readFile(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.screen-root:empty\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.skill-button\s*\{[^}]*pointer-events:\s*auto;/s);
});

test('compact combat numbers use Vietnamese suffixes and decimal commas', () => {
  assert.equal(formatNumber(1_250), '1,3 N');
  assert.equal(formatNumber(25_400), '25 N');
  assert.equal(formatNumber(1_250_000), '1,3 Tr');
  assert.equal(formatDecimal(4.25, 2), '4,25');
});
