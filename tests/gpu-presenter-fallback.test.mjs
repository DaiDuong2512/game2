import assert from 'node:assert/strict';
import test from 'node:test';

import { GpuCanvasPresenter } from '../dist/src/render/GpuCanvasPresenter.js';

test('Canvas2D fallback preserves high-DPR backing size when WebGL2 is unavailable', () => {
  const transforms = [];
  const context = {
    imageSmoothingEnabled: true,
    setTransform(...values) { transforms.push(values); },
  };
  const canvas = {
    dataset: {},
    style: {},
    width: 0,
    height: 0,
    getContext(kind) {
      if (kind === 'webgl2') return null;
      if (kind === '2d') return context;
      return null;
    },
  };

  const presenter = new GpuCanvasPresenter(canvas);
  presenter.resize(320, 240, 1.5);

  assert.equal(presenter.backend, 'canvas2d');
  assert.equal(canvas.dataset.renderBackend, 'canvas2d');
  assert.equal(canvas.dataset.renderScale, '1.5');
  assert.equal(canvas.width, 480);
  assert.equal(canvas.height, 360);
  assert.deepEqual(transforms.at(-1), [1.5, 0, 0, 1.5, 0, 0]);
  assert.deepEqual(presenter.stats(), {
    backend: 'canvas2d',
    groundRings: 0,
    estimatedCanvasCommandsAvoided: 0,
    displayPixelRatio: 1.5,
    dynamicRenderScale: 1.5,
  });
});
