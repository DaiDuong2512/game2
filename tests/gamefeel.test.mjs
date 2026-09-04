import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { InputManager } from '../dist/src/core/InputManager.js';
import { RNG } from '../dist/src/core/RNG.js';
import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { Player } from '../dist/src/game/Player.js';
import { Camera } from '../dist/src/render/Camera.js';

const characters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));
const kael = characters.find((item) => item.id === 'kael-orin');
assert.ok(kael);

function makeInput(move = { x: 0, y: 0 }, aim = { x: 0, y: 0 }) {
  return {
    getMoveVector: () => move,
    getAimVector: () => aim,
  };
}

test('player movement accelerates responsively, coasts briefly, and drives animation state', () => {
  const player = new Player(kael, [], createDefaultSave());
  const moving = makeInput({ x: 1, y: 0 });
  player.update(1 / 60, moving, 0, 0);

  const topSpeed = player.stats.get('moveSpeed') * (player.character.passive.kind === 'healthy-bonus' ? 1.06 : 1);
  assert.ok(player.vx > 0 && player.vx < topSpeed, 'first frame should accelerate instead of snapping to top speed');
  for (let frame = 0; frame < 24; frame += 1) player.update(1 / 60, moving, 0, 0);
  assert.ok(player.vx > topSpeed * 0.97 && player.vx <= topSpeed);
  assert.equal(player.animationState, 'run');
  assert.equal(player.facing8, 0);
  assert.ok(player.animationClock > 0);
  assert.ok(player.stridePhase >= 0 && player.stridePhase < 1);
  assert.ok(player.footstepSerial > 0, 'running gait should emit deterministic footstep events');

  const speedBeforeRelease = player.vx;
  player.update(1 / 60, makeInput(), 0, 0);
  assert.ok(player.vx > 0 && player.vx < speedBeforeRelease, 'release should brake quickly without an instant stop');
});

test('eight-way movement maps to eight stable facing indices', () => {
  const directions = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  directions.forEach((direction, expected) => {
    const player = new Player(kael, [], createDefaultSave());
    player.update(1 / 60, makeInput(direction), 0, 0);
    assert.equal(player.facing8, expected);
  });
});

test('pointer aim does not rotate an idle character away from movement facing', () => {
  const player = new Player(kael, [], createDefaultSave());
  player.update(1 / 60, makeInput({ x: 0, y: 1 }), 0, 0);
  assert.equal(player.facing8, 2);
  player.update(1 / 60, makeInput({ x: 0, y: 0 }, { x: -1, y: 0 }), 0, 0);
  assert.equal(player.facing8, 2);
  assert.deepEqual(player.aim, { x: -1, y: 0 }, 'hướng ngắm vũ khí vẫn hoạt động độc lập');
});

test('dash has a deterministic speed curve, direction lock, and controlled exit momentum', () => {
  const player = new Player(kael, [], createDefaultSave());
  assert.equal(player.tryDash({ x: 0, y: 1 }), true);
  assert.equal(player.animationState, 'dash');
  assert.equal(player.facing8, 2);
  assert.equal(player.dashSerial, 1);
  assert.ok(player.vy > 900);

  const idle = makeInput();
  while (player.dashTime > 0) player.update(1 / 120, idle, 0, 0);
  assert.ok(player.y > 138 && player.y < 143, `dash distance should stay near 140px, received ${player.y}`);
  assert.ok(player.vy > 0 && player.vy < 300, 'dash should retain only controlled exit momentum');
  assert.equal(player.tryDash({ x: 1, y: 0 }), false, 'cooldown must still gate repeated dashes');
});

test('damage response exposes hurt state and movement impulse decays smoothly', () => {
  const player = new Player(kael, [], createDefaultSave());
  const damage = player.takeDamage(18, { chance: () => false });
  assert.ok(damage > 0);
  assert.equal(player.animationState, 'hurt');
  player.addMovementImpulse(155, 0);
  for (let frame = 0; frame < 30; frame += 1) player.update(1 / 60, makeInput(), 0, 0);
  assert.ok(player.x > 7 && player.x < 10, `impact should create a short controlled displacement, received ${player.x}`);
  assert.ok(Math.abs(player.motionVx) < 1);
});

test('camera adds bounded velocity/aim look-ahead and returns smoothly to its target', () => {
  const camera = new Camera(new RNG(123));
  camera.resize(1280, 720);
  camera.snap(0, 0);
  for (let frame = 0; frame < 90; frame += 1) camera.update(1 / 60, 0, 0, 1, 300, 0, 1, 0);
  assert.ok(camera.x > 40 && camera.x < 60, `look-ahead should be useful but bounded, received ${camera.x}`);

  for (let frame = 0; frame < 120; frame += 1) camera.update(1 / 60, 0, 0, 1);
  assert.ok(Math.abs(camera.x) < 0.01, `camera should settle back on the player, received ${camera.x}`);

  camera.addKick(10, 0);
  camera.update(1 / 60, 0, 0, 1);
  assert.ok(camera.x > 0);
  camera.addShake(6);
  camera.update(1 / 60, 0, 0, 0);
  assert.equal(camera.shakeX, 0, 'screen-shake setting at zero must disable shake output');
  assert.equal(camera.shakeY, 0);
});

test('gamepad and mobile movement preserve analog magnitude after deadzone processing', () => {
  const previousWindow = globalThis.window;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let pad = {
    axes: [0.59, 0, 0, 0],
    buttons: [],
  };
  globalThis.window = { addEventListener() {} };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [pad] },
  });
  const canvas = {
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };

  try {
    const input = new InputManager(canvas);
    assert.deepEqual(input.getAimVector(640, 360), { x: 0, y: 0 }, 'pointer should not steer before first interaction');
    input.pollGamepad();
    const analog = input.getMoveVector();
    assert.ok(analog.x > 0.49 && analog.x < 0.51, `half stick should remain near half speed, received ${analog.x}`);

    pad = null;
    input.pollGamepad();
    input.setMobileMove(0.35, 0);
    const mobile = input.getMoveVector();
    assert.ok(Math.abs(mobile.x - 0.35) < 1e-12);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});
