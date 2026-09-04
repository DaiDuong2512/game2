import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import {
  Player,
  RAGE_ACTIVATION_THRESHOLD,
  ULTIMATE_ACTIVATION_THRESHOLD,
} from '../dist/src/game/Player.js';
import { chargedSkillFill, chargedSkillStatus } from '../dist/src/ui/UIManager.js';

const characters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));
const mira = characters.find((character) => character.id === 'mira-voss');
assert.ok(mira);

function player() {
  return new Player(mira, [], createDefaultSave());
}

test('E activates at 35 percent and rejects every value below the threshold', () => {
  assert.equal(RAGE_ACTIVATION_THRESHOLD, 35);
  const subject = player();
  subject.rageMeter = RAGE_ACTIVATION_THRESHOLD - 0.01;
  assert.equal(subject.consumeRage(), false);
  assert.equal(subject.rageMeter, RAGE_ACTIVATION_THRESHOLD - 0.01);

  subject.rageMeter = RAGE_ACTIVATION_THRESHOLD;
  assert.equal(subject.consumeRage(), true);
  assert.equal(subject.rageMeter, 0);
  assert.equal(subject.rageActive, 5);
});

test('R activates at 75 percent and rejects every value below the threshold', () => {
  assert.equal(ULTIMATE_ACTIVATION_THRESHOLD, 75);
  const subject = player();
  subject.ultimateMeter = ULTIMATE_ACTIVATION_THRESHOLD - 0.01;
  assert.equal(subject.consumeUltimate(), false);
  assert.equal(subject.ultimateMeter, ULTIMATE_ACTIVATION_THRESHOLD - 0.01);

  subject.ultimateMeter = ULTIMATE_ACTIVATION_THRESHOLD;
  assert.equal(subject.consumeUltimate(), true);
  assert.equal(subject.ultimateMeter, 0);
  assert.equal(subject.ultimateActive, 5);
});

test('HUD meter text and fill communicate the new readiness thresholds', () => {
  assert.equal(chargedSkillStatus(24.9, RAGE_ACTIVATION_THRESHOLD), '24/35%');
  assert.equal(chargedSkillStatus(35, RAGE_ACTIVATION_THRESHOLD), 'Sẵn sàng · 35%');
  assert.equal(chargedSkillStatus(75, ULTIMATE_ACTIVATION_THRESHOLD), 'Sẵn sàng · 75%');
  assert.equal(chargedSkillStatus(0, RAGE_ACTIVATION_THRESHOLD, 3.25), 'Đang bật 3,3 giây');
  assert.equal(chargedSkillFill(17.5, RAGE_ACTIVATION_THRESHOLD), 0.5);
  assert.equal(chargedSkillFill(75, ULTIMATE_ACTIVATION_THRESHOLD), 1);
  assert.equal(chargedSkillFill(0, ULTIMATE_ACTIVATION_THRESHOLD, 1), 1);
});

test('Q remains cooldown-driven and has no resource threshold gate', async () => {
  const skillSource = await readFile(new URL('../src/game/SkillSystem.ts', import.meta.url), 'utf8');
  assert.match(skillSource, /activePressed && world\.player\.activeCooldown <= 0/u);
  assert.doesNotMatch(skillSource, /activePressed[^\n]*(RAGE|ULTIMATE)_ACTIVATION_THRESHOLD/u);
});
