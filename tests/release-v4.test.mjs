import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('gói phát hành và bản dựng cùng mang phiên bản 4.1.0', async () => {
  const [packageJson, buildInfo, readme] = await Promise.all([
    readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('dist/build-info.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('README.md', root), 'utf8'),
  ]);
  assert.equal(packageJson.version, '4.1.0');
  assert.equal(buildInfo.version, packageJson.version);
  assert.match(readme, /Riftwarden: Echo Siege — bản 4\.1/u);
});

test('vòng chơi nối đầy đủ briefing, truyền tin, giao tranh cuối và đoạn kết', async () => {
  const [manager, ui] = await Promise.all([
    readFile(new URL('src/game/GameManager.ts', root), 'utf8'),
    readFile(new URL('src/ui/UIManager.ts', root), 'utf8'),
  ]);
  assert.match(manager, /this\.narrative\.startStage\(stage\.id, character\.id\)/u);
  assert.match(manager, /this\.ui\.showMissionBriefing\(/u);
  assert.match(manager, /this\.narrative\.updateProgress\(storyProgress\)/u);
  assert.match(manager, /this\.narrative\.triggerFinalEncounter\(\)/u);
  assert.match(manager, /this\.narrative\.completeStage\(\)/u);
  assert.match(manager, /this\.ui\.showStoryEnding\(ending, showSummary\)/u);
  assert.match(ui, /id="ending-close">Xem kết quả trận</u);
});

test('atlas VFX Độc/Vật lý bản 3.0 là PNG RGBA đúng lưới và được nạp trước', async () => {
  const [png, main, renderer] = await Promise.all([
    readFile(new URL('public/assets/generated/effects/status-impact-vfx-v3.png', root)),
    readFile(new URL('src/main.ts', root), 'utf8'),
    readFile(new URL('src/render/Renderer.ts', root), 'utf8'),
  ]);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), 2172);
  assert.equal(png.readUInt32BE(20), 724);
  assert.equal(png[25], 6, 'atlas phải dùng màu RGBA');
  assert.match(main, /status-impact-vfx-v3\.png/u);
  assert.match(renderer, /STATUS_VFX_CELL_SIZE\s*=\s*362/u);
  assert.match(renderer, /STATUS_VFX_INSET\s*=\s*5/u);
});

test('atlas Bom Khói Độc v4 là PNG RGBA 4×2 và được nạp trước', async () => {
  const [png, main, renderer] = await Promise.all([
    readFile(new URL('public/assets/generated/effects/toxic-smoke-vfx-v4.png', root)),
    readFile(new URL('src/main.ts', root), 'utf8'),
    readFile(new URL('src/render/Renderer.ts', root), 'utf8'),
  ]);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1776);
  assert.equal(png.readUInt32BE(20), 888);
  assert.equal(png[25], 6, 'atlas phải dùng màu RGBA trong suốt');
  assert.match(main, /toxic-smoke-vfx-v4\.png/u);
  assert.match(renderer, /TOXIC_SMOKE_CELL_SIZE\s*=\s*444/u);
});

test('icon ứng dụng v2 và atlas đạn đạo v2 dùng đúng asset production', async () => {
  const [icon, atlas, html, main, renderer] = await Promise.all([
    readFile(new URL('public/assets/generated/app-icon-v2.png', root)),
    readFile(new URL('public/assets/generated/effects/projectile-atlas-v2.png', root)),
    readFile(new URL('src/index.html', root), 'utf8'),
    readFile(new URL('src/main.ts', root), 'utf8'),
    readFile(new URL('src/render/Renderer.ts', root), 'utf8'),
  ]);
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
  assert.equal(atlas.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(atlas.readUInt32BE(16), 1024);
  assert.equal(atlas.readUInt32BE(20), 1024);
  assert.equal(atlas[25], 6, 'atlas đạn phải dùng màu RGBA trong suốt');
  assert.match(html, /app-icon-v2\.png/u);
  assert.match(main, /projectile-atlas-v2\.png/u);
  assert.match(renderer, /PROJECTILE_ATLAS_INDEX/u);
  assert.match(renderer, /drawProjectileAtlasSprite\(/u);
  for (const weapon of [
    'rift-blade', 'echo-bow', 'pulse-rifle', 'phase-darts', 'gravity-bomb', 'storm-call', 'ember-orb',
    'frost-shards', 'void-laser', 'venom-bloom', 'aegis-orbit', 'echo-summon', 'arcane-nova', 'toxic-smoke-bomb',
  ]) {
    assert.match(renderer, new RegExp(`'${weapon}'\\s*:`), `${weapon} phải có ô atlas riêng`);
  }
});

test('các chốt runtime V4 giữ âm thanh vũ khí, map vô hạn và preload sạch', async () => {
  const [manager, weapons, main] = await Promise.all([
    readFile(new URL('src/game/GameManager.ts', root), 'utf8'),
    readFile(new URL('src/game/WeaponSystem.ts', root), 'utf8'),
    readFile(new URL('src/main.ts', root), 'utf8'),
  ]);
  assert.match(manager, /Math\.trunc\(this\.player\.x \/ 448\) \* 448/u);
  assert.match(manager, /if \(this\.victoryDelay > 0\) return;/u);
  assert.match(manager, /const wasFinal = enemy\.isFinalEncounter;/u);
  assert.match(weapons, /behavior === 'slash'\) world\.audio\?\.play\('slash'/u);
  assert.match(weapons, /else world\.audio\?\.play\('shoot'/u);
  assert.match(main, /paths\.filter\(\(path\) => path\.length > 0\)/u);
});
