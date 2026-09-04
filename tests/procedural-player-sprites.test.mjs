import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PROCEDURAL_PLAYER_STYLES,
  createProceduralPlayerPose,
  drawProceduralPlayerSprite,
} from '../dist/src/render/ProceduralPlayerSprite.js';

const root = new URL('../', import.meta.url);
const characters = JSON.parse(await readFile(new URL('public/data/characters.json', root), 'utf8'));

function makeContext() {
  const fillRects = [];
  const translations = [];
  let depth = 0;
  return {
    fillRects,
    translations,
    get depth() { return depth; },
    fillStyle: '#000000',
    globalAlpha: 1,
    save() { depth += 1; },
    restore() { depth -= 1; },
    translate(x, y) { translations.push({ x, y }); },
    fillRect(x, y, width, height) {
      fillRects.push({ x, y, width, height, color: this.fillStyle });
    },
  };
}

function colorBounds(rects, color) {
  const matches = rects.filter((rect) => rect.color === color);
  assert.ok(matches.length > 0, `phải vẽ màu nhận diện ${color}`);
  const minX = Math.min(...matches.map((rect) => rect.x));
  const maxX = Math.max(...matches.map((rect) => rect.x + rect.width));
  const minY = Math.min(...matches.map((rect) => rect.y));
  const maxY = Math.max(...matches.map((rect) => rect.y + rect.height));
  return { width: maxX - minX, height: maxY - minY };
}

test('bảy nhân vật ngoài Kael có style full-body procedural riêng', () => {
  const proceduralCharacters = characters.filter((character) => character.id !== 'kael-orin');
  assert.equal(proceduralCharacters.length, 7);
  assert.deepEqual(
    new Set(Object.keys(PROCEDURAL_PLAYER_STYLES)),
    new Set(proceduralCharacters.map((character) => character.id)),
  );

  const identities = new Set();
  for (const character of proceduralCharacters) {
    const style = PROCEDURAL_PLAYER_STYLES[character.id];
    assert.ok(style, `${character.name} phải có style procedural`);
    for (const color of [style.outline, style.primary, style.secondary, style.accent, style.highlight, style.skin, style.hair]) {
      assert.match(color, /^#[0-9a-f]{6}$/iu);
    }
    identities.add(`${style.silhouette}|${style.accessory}|${style.primary}|${style.accent}`);
  }
  assert.equal(identities.size, 7, 'mỗi nhân vật cần silhouette/phụ kiện/palette nhận diện riêng');
});

test('pose procedural mã hóa đủ tám hướng nhìn cơ bản', () => {
  const expectedDirections = [
    [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2],
    [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2],
  ];
  const signatures = new Set();
  expectedDirections.forEach(([x, y], facing8) => {
    const pose = createProceduralPlayerPose({
      facing8, animationState: 'run', stridePhase: 0.25, movementBlend: 1, dashProgress: 0, time: 0,
    });
    assert.equal(pose.facing8, facing8);
    assert.ok(Math.abs(pose.directionX - x) < 1e-9);
    assert.ok(Math.abs(pose.directionY - y) < 1e-9);
    signatures.add([
      pose.directionX, pose.directionY, pose.headOffsetX, pose.headOffsetY,
      pose.sideFacing, pose.showFace, pose.forwardStrideX, pose.forwardStrideY,
    ].join('|'));
  });
  assert.equal(signatures.size, 8, 'không hướng nào được rút gọn thành chỉ lật trái/phải');
});

test('chu kỳ đi bộ đảo chân và tay đối xứng giữa hai nửa bước', () => {
  const firstStep = createProceduralPlayerPose({
    facing8: 1, animationState: 'run', stridePhase: 0.25, movementBlend: 1, dashProgress: 0, time: 0,
  });
  const secondStep = createProceduralPlayerPose({
    facing8: 1, animationState: 'run', stridePhase: 0.75, movementBlend: 1, dashProgress: 0, time: 0,
  });
  assert.notEqual(firstStep.legSwing, 0);
  assert.equal(firstStep.legSwing, -secondStep.legSwing);
  assert.equal(firstStep.armSwing, -secondStep.armSwing);
  assert.equal(firstStep.armSwing, -firstStep.legSwing, 'tay phải vung ngược chân để tạo dáng đi tự nhiên');
});

test('renderer procedural vẽ pixel toàn thân cho mọi style và mọi hướng mà không cần ảnh portrait', () => {
  for (const characterId of Object.keys(PROCEDURAL_PLAYER_STYLES)) {
    for (let facing8 = 0; facing8 < 8; facing8 += 1) {
      const context = makeContext();
      drawProceduralPlayerSprite(context, {
        characterId,
        feetY: 13,
        visualScale: 1,
        facing8,
        animationState: 'run',
        stridePhase: 0.25,
        movementBlend: 1,
        dashProgress: 0,
        time: 1,
        aimX: Math.cos(facing8 * Math.PI / 4),
        aimY: Math.sin(facing8 * Math.PI / 4),
        hurtFlash: 0,
      });
      assert.equal(context.depth, 0, `${characterId}/hướng ${facing8} phải cân bằng save/restore`);
      assert.ok(context.fillRects.length >= 24, `${characterId}/hướng ${facing8} phải có đủ bộ phận full-body`);
      assert.ok(context.translations.length >= 1);
      for (const rect of context.fillRects) {
        assert.ok([rect.x, rect.y, rect.width, rect.height].every(Number.isInteger));
        assert.ok(rect.width > 0 && rect.height > 0);
      }
    }
  }
});

test('dấu hiệu portrait được vẽ thành silhouette lớn, không chỉ nằm trong bảng style', () => {
  const expected = {
    'mira-voss': { color: 'hair', minimumWidth: 30, minimumHeight: 54 },
    'toren-vale': { color: 'accent', minimumWidth: 42, minimumHeight: 18 },
    'nyra-sol': { color: 'hair', minimumWidth: 36, minimumHeight: 54 },
    zarek: { color: 'secondary', minimumWidth: 42, minimumHeight: 27 },
    elara: { color: 'hair', minimumWidth: 39, minimumHeight: 36 },
    titan: { color: 'accent', minimumWidth: 54, minimumHeight: 21 },
    nova: { color: 'accent', minimumWidth: 48, minimumHeight: 18 },
  };

  for (const [characterId, rule] of Object.entries(expected)) {
    const context = makeContext();
    drawProceduralPlayerSprite(context, {
      characterId,
      feetY: 13,
      visualScale: 1,
      facing8: 2,
      animationState: 'idle',
      stridePhase: 0,
      movementBlend: 0,
      dashProgress: 0,
      time: 1,
      aimX: 0,
      aimY: 1,
      hurtFlash: 0,
    });
    const style = PROCEDURAL_PLAYER_STYLES[characterId];
    const bounds = colorBounds(context.fillRects, style[rule.color]);
    assert.ok(bounds.width >= rule.minimumWidth, `${characterId} thiếu bề ngang silhouette portrait`);
    assert.ok(bounds.height >= rule.minimumHeight, `${characterId} thiếu chiều cao silhouette portrait`);
    assert.ok(context.fillRects.length >= 45, `${characterId} phải có đủ lớp chi tiết nhận diện`);
  }
});

test('mọi Hộ Vệ dùng atlas 4×8 RGBA riêng và đã bake đúng vũ khí chính', async () => {
  assert.equal(characters.length, 8);
  assert.equal(new Set(characters.map((character) => character.gameplaySprite)).size, 8);
  for (const character of characters) {
    assert.equal(character.gameplaySpriteIncludesWeapon, true, `${character.name} phải bake vũ khí vào atlas`);
    assert.match(character.gameplaySprite, new RegExp(`characters/${character.id}-gameplay-v2\\.png$`, 'u'));
    const png = await readFile(new URL(`public/${character.gameplaySprite}`, root));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', `${character.name} thiếu PNG gameplay`);
    assert.equal(png.readUInt32BE(16), 512, `${character.name} phải có 4 cột × 128 px`);
    assert.equal(png.readUInt32BE(20), 1024, `${character.name} phải có 8 hàng × 128 px`);
    assert.equal(png[24], 8, `${character.name} phải dùng kênh màu 8-bit`);
    assert.equal(png[25], 6, `${character.name} phải là PNG RGBA trong suốt`);
  }
});

test('Renderer cắt atlas theo kích thước ảnh và chỉ dùng procedural khi asset lỗi', async () => {
  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');
  assert.match(renderer, /KAEL_SPRITE_PATH/u);
  assert.match(renderer, /sourceWidth\s*=\s*spriteSheet\.naturalWidth\s*\|\|\s*spriteSheet\.width/u);
  assert.match(renderer, /sourceCellWidth\s*=\s*sourceWidth\s*\/\s*PLAYER_SPRITE_COLUMNS/u);
  assert.match(renderer, /sourceCellHeight\s*=\s*sourceHeight\s*\/\s*PLAYER_SPRITE_ROWS/u);
  assert.match(renderer, /drawProceduralPlayerSprite\(ctx,/u);
  assert.doesNotMatch(renderer, /drawKaelPortraitAccents/u);
  assert.doesNotMatch(renderer, /this\.assets\.get\(player\.character\.portrait\)/u);
  assert.doesNotMatch(renderer, /ctx\.drawImage\(portrait,/u);
});
