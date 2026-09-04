import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const presenterSource = await readFile(new URL('../src/render/GpuCanvasPresenter.ts', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('renderer requests an accelerated WebGL2 compositor and keeps Canvas2D fallback', () => {
  assert.match(presenterSource, /getContext\('webgl2'/u);
  assert.match(presenterSource, /powerPreference:\s*'high-performance'/u);
  assert.match(presenterSource, /failIfMajorPerformanceCaveat:\s*true/u);
  assert.match(presenterSource, /getContext\('2d'/u);
  assert.match(presenterSource, /backend = 'canvas2d'/u);
  assert.match(presenterSource, /webglcontextlost/u);
  assert.match(presenterSource, /webglcontextrestored/u);
  assert.match(presenterSource, /renderStatus = 'context-lost'/u);
});

test('GPU path uses a CSS-resolution gameplay overlay without full-frame texture upload', () => {
  assert.match(presenterSource, /this\.drawCanvas\.width = this\.cssWidth/u);
  assert.match(presenterSource, /this\.drawCanvas\.height = this\.cssHeight/u);
  assert.match(presenterSource, /className = 'gameplay-canvas-layer'/u);
  assert.match(presenterSource, /insertAdjacentElement\('afterend', this\.drawCanvas\)/u);
  assert.doesNotMatch(presenterSource, /tex(?:Sub)?Image2D/u);
  assert.match(presenterSource, /gl\.drawArrays\(gl\.TRIANGLES, 0, 3\)/u);
  assert.match(cssSource, /\.gameplay-canvas-layer[^}]*z-index:\s*1[^}]*pointer-events:\s*none/u);
});

test('all renderer entry points present their completed frame', () => {
  assert.match(rendererSource, /clearMenuBackground\(\): void \{[\s\S]*?this\.presenter\.present\(\);/u);
  assert.match(rendererSource, /public render\(scene: RenderScene\): void \{[\s\S]*?this\.presenter\.present\(\);/u);
  assert.match(rendererSource, /public renderBackend\(\): RenderBackend/u);
});

test('high-volume ground rings are packed into the existing WebGL draw batch', () => {
  assert.match(presenterSource, /const MAX_GROUND_RINGS = 48/u);
  assert.match(presenterSource, /public addGroundRing\(/u);
  assert.match(presenterSource, /uniform vec4 uRingGeometry\[/u);
  assert.match(presenterSource, /gl\.uniform4fv\(gpu\.ringGeometryUniform/u);
  assert.match(presenterSource, /gl\.uniform1fv\(gpu\.ringSegmentsUniform/u);
  assert.match(presenterSource, /estimatedCanvasCommandsAvoided/u);
  assert.match(presenterSource, /public stats\(\): GpuRenderStats/u);
  assert.equal((presenterSource.match(/gl\.drawArrays\(/gu) ?? []).length, 1);
  assert.match(rendererSource, /this\.presenter\.addGroundRing\(\s*telegraph\.x/u);
  assert.match(rendererSource, /this\.presenter\.addGroundRing\(projectile\.x, projectile\.y/u);
  assert.match(rendererSource, /public gpuStats\(\): GpuRenderStats/u);
});
