import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { InputManager } from '../dist/src/core/InputManager.js';

const root = new URL('../', import.meta.url);

function createInputHarness() {
  const previousWindow = globalThis.window;
  const windowListeners = new Map();
  const canvas = {
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
  };
  globalThis.window = {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  const input = new InputManager(canvas);
  const restore = () => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  };
  return { input, windowListeners, restore };
}

test('W chỉ di chuyển lên; Q/E/R giữ cạnh nhấn riêng và không tự lặp khi giữ phím', () => {
  const { input, windowListeners, restore } = createInputHarness();
  const keydown = windowListeners.get('keydown');
  const keyup = windowListeners.get('keyup');
  assert.ok(keydown && keyup);

  try {
    keydown({ code: 'KeyW', preventDefault() {} });
    assert.deepEqual(input.getMoveVector(), { x: 0, y: -1 });
    assert.equal(input.wasPressed('KeyQ'), false);
    assert.equal(input.wasPressed('KeyE'), false);
    assert.equal(input.wasPressed('KeyR'), false);

    keydown({ code: 'KeyE', preventDefault() {} });
    assert.equal(input.wasPressed('KeyE'), true);
    input.endFrame();
    keydown({ code: 'KeyE', preventDefault() {} });
    assert.equal(input.wasPressed('KeyE'), false, 'keydown lặp khi đang giữ E không được tạo cạnh nhấn mới');
    keyup({ code: 'KeyE' });
    keydown({ code: 'KeyE', preventDefault() {} });
    assert.equal(input.wasPressed('KeyE'), true, 'nhả rồi nhấn E phải tạo cạnh nhấn mới');
  } finally {
    restore();
  }
});

test('runtime khóa Q=kỹ năng lớp, E=Nộ, R=Tuyệt kỹ và giữ nguyên gamepad', async () => {
  const source = await readFile(new URL('src/game/SkillSystem.ts', root), 'utf8');
  assert.match(source, /activePressed = world\.input\.wasPressed\('KeyQ'\) \|\| world\.input\.gamepadPressed\(2\)/u);
  assert.match(source, /ragePressed = world\.input\.wasPressed\('KeyE'\) \|\| world\.input\.gamepadPressed\(1\)/u);
  assert.match(source, /ultimatePressed = world\.input\.wasPressed\('KeyR'\) \|\| world\.input\.gamepadPressed\(3\)/u);
  assert.doesNotMatch(source, /wasPressed\('KeyW'\)/u);
  assert.doesNotMatch(source, /ragePressed = [^\n]*KeyR/u);
  assert.doesNotMatch(source, /ultimatePressed = [^\n]*KeyE/u);
});

test('HUD, nút cảm ứng và trợ năng cùng dùng đúng Q/E/R', async () => {
  const source = await readFile(new URL('src/ui/UIManager.ts', root), 'utf8');
  assert.match(source, /skillButton\('active-skill',[\s\S]*?'Q', 'Kỹ năng lớp'/u);
  assert.match(source, /skillButton\('rage-skill',[\s\S]*?'E', 'Nộ'/u);
  assert.match(source, /skillButton\('ultimate-skill',[\s\S]*?'R', 'Tuyệt kỹ'/u);
  assert.match(source, /'active-skill'\)\?\.addEventListener\('click',[\s\S]*?pressVirtual\('KeyQ'\)/u);
  assert.match(source, /'rage-skill'\)\?\.addEventListener\('click',[\s\S]*?pressVirtual\('KeyE'\)/u);
  assert.match(source, /'ultimate-skill'\)\?\.addEventListener\('click',[\s\S]*?pressVirtual\('KeyR'\)/u);
  assert.match(source, /aria-keyshortcuts="\$\{escapeHtml\(key\)\}"/u);
});
