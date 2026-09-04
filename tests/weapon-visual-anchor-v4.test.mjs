import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { Player } from '../dist/src/game/Player.js';
import { Renderer } from '../dist/src/render/Renderer.js';
import {
  drawProceduralPlayerSprite,
  getProceduralPlayerStyle,
} from '../dist/src/render/ProceduralPlayerSprite.js';

const root = new URL('../', import.meta.url);
const characters = JSON.parse(await readFile(new URL('public/data/characters.json', root), 'utf8'));
const kael = characters.find((character) => character.id === 'kael-orin');
assert.ok(kael);

const idleInput = {
  getMoveVector: () => ({ x: 0, y: 0 }),
  getAimVector: () => ({ x: 0, y: 0 }),
};

const WEAPON_PALETTES = {
  slash: ['#210b0d', '#f4e8cf', '#d7434d'],
  bow: ['#102431', '#9edcec', '#fff2bb'],
  gun: ['#071419', '#668d98', '#ffb43d'],
  darts: ['#171b20', '#e8f6f4', '#e04e55'],
  bomb: ['#081116', '#778991', '#ffae3d'],
  'poison-bomb': ['#07180e', '#4c8757', '#c9f253'],
  lightning: ['#07181d', '#72e9f5', '#f4ffff'],
  fireball: ['#2a0a08', '#ee4b2f', '#ffd34f'],
  ice: ['#0b2834', '#88d7ed', '#efffff'],
  laser: ['#07161d', '#43bdd8', '#ffffff'],
  poison: ['#07170d', '#49a856', '#d7f16b'],
  orbit: ['#10191d', '#b9c8cb', '#ffb04a'],
  summon: ['#07191d', '#58c7d4', '#efffff'],
  nova: ['#07161f', '#6bcce8', '#ffffff'],
};

const COMPACT_WEAPONS = new Set([
  'bomb', 'poison-bomb', 'fireball', 'poison', 'orbit', 'summon', 'nova',
]);

function makeContext() {
  const fillRects = [];
  const drawImages = [];
  let depth = 0;
  return {
    fillRects,
    drawImages,
    fillStyle: '#000000',
    globalAlpha: 1,
    get depth() { return depth; },
    save() { depth += 1; },
    restore() { depth -= 1; },
    translate() {},
    scale() {},
    fillRect(x, y, width, height) {
      fillRects.push({ x, y, width, height, color: this.fillStyle });
    },
    drawImage(...args) { drawImages.push(args); },
  };
}

function rasterize(rects) {
  const pixels = new Set();
  for (const rect of rects) {
    for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.width); x += 1) {
      for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.height); y += 1) {
        pixels.add(`${x},${y}`);
      }
    }
  }
  return pixels;
}

function connectedComponents(rects) {
  const remaining = rasterize(rects);
  const components = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const stack = [first];
    const component = [];
    while (stack.length > 0) {
      const key = stack.pop();
      component.push(key);
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbor = `${x + dx},${y + dy}`;
        if (remaining.delete(neighbor)) stack.push(neighbor);
      }
    }
    components.push(component);
  }
  return components.sort((left, right) => right.length - left.length);
}

function pixelBounds(pixels) {
  const points = pixels.map((key) => key.split(',').map(Number));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: xs.reduce((sum, value) => sum + value, 0) / xs.length,
    centerY: ys.reduce((sum, value) => sum + value, 0) / ys.length,
  };
}

function drawWeapon(behavior, facing8, visualScale = 1) {
  const context = makeContext();
  const angle = facing8 * Math.PI / 4;
  drawProceduralPlayerSprite(context, {
    characterId: 'mira-voss',
    feetY: 12,
    visualScale,
    facing8,
    animationState: 'attack',
    stridePhase: 0,
    movementBlend: 0,
    dashProgress: 0,
    time: 0.2,
    aimX: Math.cos(angle),
    aimY: Math.sin(angle),
    actionProgress: 0.45,
    actionKind: 'primary',
    actionX: Math.cos(angle),
    actionY: Math.sin(angle),
    primaryWeaponBehavior: behavior,
    hurtFlash: 0,
  });
  return context;
}

function weaponMetrics(behavior, facing8) {
  const context = drawWeapon(behavior, facing8);
  const palette = new Set(WEAPON_PALETTES[behavior]);
  const weaponRects = context.fillRects.filter((rect) => palette.has(rect.color));
  const components = connectedComponents(weaponRects);
  assert.ok(components.length > 0, `${behavior}/hướng ${facing8} phải có cụm vũ khí`);

  const style = getProceduralPlayerStyle('mira-voss');
  const bodyPalette = new Set([
    style.outline, style.primary, style.secondary, style.accent,
    style.highlight, style.skin, style.hair,
  ]);
  const bodyPixels = [...rasterize(context.fillRects.filter((rect) => bodyPalette.has(rect.color)))];
  return {
    weapon: pixelBounds(components[0]),
    body: pixelBounds(bodyPixels),
  };
}

test('atlas đã bake vũ khí không bị Renderer chồng thêm bản sao khi tấn công', () => {
  assert.equal(kael.gameplaySpriteIncludesWeapon, true);

  const renderAtlas = (character) => {
    const context = makeContext();
    const renderer = Object.create(Renderer.prototype);
    renderer.context = context;
    renderer.assets = { get: () => ({ width: 888, height: 1776 }) };
    renderer.camera = { worldToScreen: () => ({ x: 0, y: 0 }) };

    const player = new Player(character, [], createDefaultSave());
    player.triggerPrimaryAttack('slash', 0);
    player.update(player.actionDuration * 0.45, idleInput, 0, 0);
    renderer.drawPlayer(player, 0.2, false);
    return context;
  };

  const baked = renderAtlas(kael);
  const swordPalette = new Set(WEAPON_PALETTES.slash);
  assert.equal(baked.drawImages.length, 1, 'atlas chỉ được vẽ đúng một thân nhân vật ở trạng thái attack');
  assert.equal(
    baked.fillRects.filter((rect) => swordPalette.has(rect.color)).length,
    0,
    'atlas đã bake vũ khí không được nhận thêm overlay cùng palette',
  );

  const weaponless = renderAtlas({ ...kael, gameplaySpriteIncludesWeapon: false });
  assert.ok(
    weaponless.fillRects.some((rect) => swordPalette.has(rect.color)),
    'atlas không bake vũ khí vẫn phải nhận overlay hành động',
  );
});

test('vũ khí procedural có tỷ lệ bị chặn và cụm vũ khí khối không lấn thân', () => {
  for (const behavior of Object.keys(WEAPON_PALETTES)) {
    for (let facing8 = 0; facing8 < 8; facing8 += 1) {
      const { weapon, body } = weaponMetrics(behavior, facing8);
      const ratio = Math.max(weapon.width, weapon.height) / body.height;
      const limit = COMPACT_WEAPONS.has(behavior) ? 0.37 : 0.48;
      assert.ok(
        ratio <= limit,
        `${behavior}/hướng ${facing8} quá lớn: ${(ratio * 100).toFixed(1)}% chiều cao thân`,
      );
    }
  }

  // Bốn nhóm trước đây dễ rơi đúng giữa ngực khi aim dọc vì handX = 0.
  for (const behavior of ['fireball', 'poison', 'summon', 'nova']) {
    for (const facing8 of [2, 6]) {
      const { weapon } = weaponMetrics(behavior, facing8);
      const unit = 2;
      const expectedSide = facing8 === 2 ? -1 : 1;
      assert.ok(
        weapon.centerX * expectedSide >= unit * 3.5,
        `${behavior}/hướng ${facing8} phải neo ngoài tay, không nằm giữa thân`,
      );
    }
  }
});

test('bbox vũ khí phản chiếu đủ tám hướng quanh tâm thân', () => {
  const samples = Array.from({ length: 8 }, (_, facing8) => weaponMetrics('gun', facing8).weapon);
  const signatures = new Set(samples.map((item) => `${item.centerX.toFixed(2)}|${item.centerY.toFixed(2)}`));
  assert.equal(signatures.size, 8, 'vị trí vũ khí phải có tám chữ ký hướng riêng');

  // Điểm đặt tay nằm ở -14 đơn vị logic; sprite mặc định hiện dùng pixel 3
  // để chi tiết tóc/vũ khí còn đọc được ở gameplay desktop.
  const torsoCenterY = -14 * Math.max(2, Math.round(2.6));
  for (let facing8 = 0; facing8 < 4; facing8 += 1) {
    const forward = samples[facing8];
    const opposite = samples[facing8 + 4];
    assert.ok(Math.abs(forward.centerX + opposite.centerX) <= 3);
    // Pixel lẻ 3 px làm tâm bbox có thể lệch tối đa một khối khi phản chiếu.
    assert.ok(Math.abs(
      (forward.centerY - torsoCenterY) + (opposite.centerY - torsoCenterY),
    ) <= 5);
  }
});

test('dash/hurt chỉ tạm che pose; attack và cast tiếp tục đúng hướng sau đó', () => {
  const attack = new Player(kael, [], createDefaultSave());
  attack.triggerPrimaryAttack('slash', Math.PI);
  assert.equal(attack.tryDash({ x: 0, y: 1 }), true);
  attack.update(0.17, idleInput, 0, 0);
  assert.equal(attack.animationState, 'dash');
  attack.update(0.02, idleInput, 0, 0);
  assert.equal(attack.animationState, 'attack');
  assert.equal(attack.actionKind, 'primary');
  assert.ok(attack.actionDirection.x < -0.99);

  const cast = new Player(kael, [], createDefaultSave());
  cast.triggerAbilityCast('ultimate-riftstorm', { x: -1, y: -1 });
  assert.equal(cast.tryDash({ x: 1, y: 0 }), true);
  cast.update(0.17, idleInput, 0, 0);
  assert.equal(cast.animationState, 'dash');
  cast.update(0.02, idleInput, 0, 0);
  assert.equal(cast.animationState, 'cast');
  assert.equal(cast.actionKind, 'ability');
  assert.ok(cast.actionDirection.x < -0.7 && cast.actionDirection.y < -0.7);

  cast.invulnerable = 0;
  cast.hitCooldown = 0;
  assert.ok(cast.takeDamage(10, { chance: () => false }) > 0);
  cast.update(0.08, idleInput, 0, 0);
  assert.equal(cast.animationState, 'hurt');
  cast.update(0.09, idleInput, 0, 0);
  assert.equal(cast.animationState, 'cast');
  assert.equal(cast.actionKind, 'ability');
});

test('VFX Q khóa cùng hướng pose, nằm trước đầu vũ khí và Gale Volley ngắm đúng mục tiêu tự động', async () => {
  const [source, renderer] = await Promise.all([
    readFile(new URL('src/game/SkillSystem.ts', root), 'utf8'),
    readFile(new URL('src/render/Renderer.ts', root), 'utf8'),
  ]);
  assert.match(source, /const direction = world\.player\.actionDirection;/u);
  assert.match(source, /const baseAngle = Math\.atan2\(direction\.y, direction\.x\);/u);
  assert.match(source, /x \+ direction\.x \* 44/u);
  assert.match(source, /y \+ direction\.y \* 44/u);
  assert.match(source, /spawnStatusAtlas\?\.\(1, slashCenterX, slashCenterY, 112,/u);
  assert.match(source, /kind === 'gale-volley'[\s\S]*?nearestEnemy[\s\S]*?triggerAbilityCast\(`active-\$\{kind\}`, castDirection\)/u);
  assert.match(renderer, /const aimGuideStart = player\.radius \+ 5;\s*const aimGuideEnd = aimGuideStart \+ 18;/u);
});
