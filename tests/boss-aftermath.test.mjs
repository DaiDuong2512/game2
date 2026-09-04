import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import {
  BOSS_AFTERMATH_BONUS_PROJECTILES,
  BOSS_AFTERMATH_DAMAGE_MULTIPLIER,
  BOSS_AFTERMATH_DURATION,
  BOSS_AFTERMATH_PROJECTILE_SIZE_MULTIPLIER,
  BOSS_AFTERMATH_PROJECTILE_SPEED_MULTIPLIER,
  Player,
} from '../dist/src/game/Player.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';

const root = new URL('../', import.meta.url);
const characters = JSON.parse(await readFile(new URL('public/data/characters.json', root), 'utf8'));
const kael = characters.find((character) => character.id === 'kael-orin');

test('boss aftermath grants exact ten-second invulnerability and stacked combat multipliers', () => {
  assert.equal(BOSS_AFTERMATH_DURATION, 10);
  assert.equal(BOSS_AFTERMATH_DAMAGE_MULTIPLIER, 11);
  assert.equal(BOSS_AFTERMATH_PROJECTILE_SPEED_MULTIPLIER, 11);
  assert.equal(BOSS_AFTERMATH_PROJECTILE_SIZE_MULTIPLIER, 11);
  assert.equal(BOSS_AFTERMATH_BONUS_PROJECTILES, 10);

  const player = new Player(kael, [], createDefaultSave());
  player.stats.apply('bonusProjectiles', 2, 'add');
  const baseDamage = player.effectiveDamageMultiplier();
  player.activateBossAftermath();

  assert.equal(player.bossAftermathTime, 10);
  assert.equal(player.effectiveBonusProjectiles(), 12, 'ten bonus rays stack on top of the two already owned');
  assert.ok(Math.abs(player.effectiveDamageMultiplier() - baseDamage * 11) < 1e-12);
  assert.equal(player.bossAftermathProjectileSpeedMultiplier(), 11);
  assert.equal(player.bossAftermathProjectileSizeMultiplier(), 11);
  assert.equal(player.takeDamage(9999, { chance: () => false }), 0);
});

test('projectile empowerment affects only player shots', () => {
  const projectiles = new ProjectileSystem();
  projectiles.setPlayerEmpowerment(11, 11);
  const common = {
    sourceWeaponId: 'test', element: 'physical', x: 0, y: 0,
    vx: 100, vy: 0, damage: 1, radius: 4, life: 1,
    explosiveRadius: 10, deployAreaRadius: 20,
  };
  const playerShot = projectiles.spawn(common);
  const enemyShot = projectiles.spawn({ ...common, faction: 'enemy' });
  assert.ok(playerShot && enemyShot);
  assert.equal(playerShot.vx, 1100);
  assert.equal(playerShot.radius, 44);
  assert.equal(playerShot.explosiveRadius, 110);
  assert.equal(playerShot.deployAreaRadius, 220);
  assert.equal(enemyShot.vx, 100);
  assert.equal(enemyShot.radius, 4);
});

test('boss victory is delayed for the 1000-unit purge and level-up overlays wait until it ends', async () => {
  const manager = await readFile(new URL('src/game/GameManager.ts', root), 'utf8');
  const ui = await readFile(new URL('src/ui/UIManager.ts', root), 'utf8');
  assert.match(manager, /if \(wasBoss\) this\.startBossAftermath\(\)/u);
  assert.match(manager, /this\.player\.activateBossAftermath\(10\)/u);
  assert.match(manager, /const spawnDuration = 5/u);
  assert.match(manager, /const spawnTotal = 1000/u);
  assert.match(manager, /this\.loot\.activateBossVacuum\(10\.75\)/u);
  assert.match(manager, /aftermathWasActive && !this\.player\.bossAftermathActive\(\)[\s\S]*?this\.loot\.collectAll\(this\)/u);
  assert.match(manager, /pendingLevelChoice[\s\S]*?!this\.player\.bossAftermathActive\(\)/u);
  assert.match(ui, /\+1000% sát thương\/tốc đạn\/kích cỡ · \+10 tia/u);
});
