import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RNG } from '../dist/src/core/RNG.js';
import { ParticleSystem } from '../dist/src/game/ParticleSystem.js';
import { inferFloatingTextKind } from '../dist/src/game/FloatingTextSystem.js';
import { createProceduralPlayerPose } from '../dist/src/render/ProceduralPlayerSprite.js';
import { combatCueProfile, combatCueTier, impactWeightForSize } from '../dist/src/render/CombatVfxLanguage.js';

const root = new URL('../', import.meta.url);

test('pose v4 có lấy đà, khóa chân, thu hồi, dash smear và recoil riêng', () => {
  const anticipation = createProceduralPlayerPose({
    facing8: 0, animationState: 'run', stridePhase: 0.25, movementBlend: 0.1,
    dashProgress: 0, time: 0,
  });
  assert.ok(anticipation.anticipation > 0.7);
  assert.ok(anticipation.leanX < 0, 'lấy đà phải nghiêng nhẹ ngược hướng trước khi tăng tốc');
  assert.ok(anticipation.leftFootPlant > 0.09);
  assert.equal(anticipation.rightFootPlant, 0);

  const oppositeStep = createProceduralPlayerPose({
    facing8: 0, animationState: 'run', stridePhase: 0.75, movementBlend: 1,
    dashProgress: 0, time: 0,
  });
  assert.equal(oppositeStep.leftFootPlant, 0);
  assert.ok(oppositeStep.rightFootPlant > 0.95);

  const recovery = createProceduralPlayerPose({
    facing8: 2, animationState: 'idle', stridePhase: 0, movementBlend: 0.2,
    dashProgress: 0, time: 0,
  });
  assert.ok(recovery.recovery > 0.5 && recovery.recovery < 0.7);

  const dash = createProceduralPlayerPose({
    facing8: 7, animationState: 'dash', stridePhase: 0, movementBlend: 1,
    dashProgress: 0.1, time: 0,
  });
  assert.ok(dash.dashSmear > 0.65 && dash.dashSmear <= 1);

  const hurt = createProceduralPlayerPose({
    facing8: 4, animationState: 'hurt', stridePhase: 0, movementBlend: 0,
    dashProgress: 0, time: 0, recoilX: 1, recoilY: 0,
  });
  assert.equal(hurt.recoilX, 1);
  assert.equal(hurt.recoilY, 0);
  assert.ok(hurt.leanX > 0);
});

test('impact v4 mang semantic hình học riêng cho sáu hệ sát thương', () => {
  const particles = new ParticleSystem(new RNG(404));
  const semantics = ['physical', 'fire', 'ice', 'lightning', 'poison', 'arcane'].map((element, index) => {
    const effect = particles.impact(element, index * 10, 0, 48, 0.3, 0.9);
    assert.ok(effect);
    return effect.semantic;
  });
  assert.deepEqual(semantics, ['physical', 'fire', 'ice', 'lightning', 'poison', 'arcane']);
  assert.equal(new Set(semantics).size, 6);
});

test('ngôn ngữ combat phân biệt đòn thường, Q, E, R bằng cấp và silhouette', () => {
  assert.deepEqual(
    ['rift-blade', 'active-gale-volley', 'rage-overdrive', 'ultimate-void-collapse'].map(combatCueTier),
    ['primary', 'active', 'rage', 'ultimate'],
  );
  const profiles = [
    combatCueProfile('active-frost-ruin'),
    combatCueProfile('rage-overdrive'),
    combatCueProfile('ultimate-plague-night'),
  ];
  assert.deepEqual(profiles.map((profile) => profile.radius), [44, 52, 76]);
  assert.equal(new Set(profiles.map((profile) => `${profile.accent}:${profile.segments}`)).size, 3);
});

test('impact nhỏ, kỹ năng và finisher có phân cấp ổn định', () => {
  assert.equal(impactWeightForSize(48), 'hit');
  assert.equal(impactWeightForSize(76), 'skill');
  assert.equal(impactWeightForSize(179), 'skill');
  assert.equal(impactWeightForSize(180), 'finisher');
});

test('damage text suy ra glyph bằng nguyên tố hoặc trạng thái, không chỉ bằng màu', () => {
  assert.equal(inferFloatingTextKind('42', '#e7f0ef', false), 'physical');
  assert.equal(inferFloatingTextKind('42', '#ff8a55', false), 'fire');
  assert.equal(inferFloatingTextKind('42', '#79ddff', false), 'ice');
  assert.equal(inferFloatingTextKind('42', '#79b3ff', false), 'lightning');
  assert.equal(inferFloatingTextKind('42', '#79e47c', false), 'poison');
  assert.equal(inferFloatingTextKind('42', '#d892ff', false), 'arcane');
  assert.equal(inferFloatingTextKind('42', '#c8443f', false), 'bleed');
  assert.equal(inferFloatingTextKind('-12', '#ff7c73', true), 'incoming');
  assert.equal(inferFloatingTextKind('NÉ', '#71d8ff', false), 'dodge');
});

test('Renderer dùng atlas khói độc 4×2, pulse tick và cue độc dư', async () => {
  const atlas = await readFile(new URL('public/assets/generated/effects/toxic-smoke-vfx-v4.png', root));
  assert.equal(atlas.toString('ascii', 1, 4), 'PNG');
  assert.equal(atlas.readUInt32BE(16), 1776);
  assert.equal(atlas.readUInt32BE(20), 888);

  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');
  assert.match(renderer, /TOXIC_SMOKE_WEAPON_ID = 'toxic-smoke-bomb'/u);
  assert.match(renderer, /drawToxicSmokeFrame\(1, loopFrame/u);
  assert.match(renderer, /const pulseWindow = tickProgress < 0\.14/u);
  assert.match(renderer, /drawPoisonResidualCue/u);
  assert.match(renderer, /enemy\.status\.bleedTime/u);
  assert.match(renderer, /drawDamageTextGlyph/u);
  assert.match(renderer, /drawAbilityCastCue/u);
  assert.match(renderer, /drawImpactWeightEnvelope/u);
});
