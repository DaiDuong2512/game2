import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import {
  BASE_ATTACK_SPEED_BOOST,
  BASE_DAMAGE_BOOST,
  BOSS_BLESSING_ATTACK_SPEED,
  BOSS_BLESSING_LIFE_STEAL,
  Player,
} from '../dist/src/game/Player.js';

const characters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));
const kael = characters.find((character) => character.id === 'kael-orin');

test('base combat boosts add 20% current damage and attack speed', () => {
  assert.equal(BASE_DAMAGE_BOOST, 0.2);
  assert.equal(BASE_ATTACK_SPEED_BOOST, 0.2);
  const player = new Player(kael, [], createDefaultSave());
  assert.ok(Math.abs(player.stats.get('damage') - kael.stats.damage * 1.12 * 1.2) < 1e-12);
  assert.ok(Math.abs(player.stats.get('attackSpeed') - kael.stats.attackSpeed * 1.08 * 1.2) < 1e-12);
});

test('boss blessing grants 15% all-source healing, 30% attack speed and a full-HP seal once', () => {
  assert.equal(BOSS_BLESSING_LIFE_STEAL, 0.15);
  assert.equal(BOSS_BLESSING_ATTACK_SPEED, 0.3);
  const player = new Player(kael, [], createDefaultSave());
  const attackSpeedBefore = player.stats.get('attackSpeed');
  const maxHp = player.stats.get('maxHp');
  player.health = maxHp * 0.4;

  assert.equal(player.grantBossBlessing(), true);
  assert.equal(player.bossBlessingActive, true);
  assert.ok(Math.abs(player.stats.get('attackSpeed') - attackSpeedBefore * 1.3) < 1e-12);
  assert.equal(player.sealShield, maxHp);
  player.healFromBossBlessing(100);
  assert.equal(player.health, maxHp * 0.4 + 15);

  const speedAfter = player.stats.get('attackSpeed');
  assert.equal(player.grantBossBlessing(), false);
  assert.equal(player.stats.get('attackSpeed'), speedAfter);
  player.takeDamage(maxHp * 0.5, { chance: () => false });
  assert.equal(player.health, maxHp * 0.4 + 15, 'Khiên Ấn phải hấp thụ sát thương trước Sinh lực');
  assert.equal(player.sealShield, maxHp * 0.5);
});
