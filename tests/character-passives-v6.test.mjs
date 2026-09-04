import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import {
  CharacterPassiveSystem,
  ELARA_SHIELD_INTERVAL,
  MIRA_DAMAGE_PER_KILL,
  NOVA_VOID_DURATION,
  NOVA_VOID_INTERVAL,
  NYRA_INFERNO_COST,
  TITAN_RIFT_RADIUS,
  TOREN_FORGE_KILLS,
  ZAREK_TRAIL_DAMAGE_SHARE,
  ZAREK_TRAIL_DURATION,
} from '../dist/src/game/CharacterPassiveSystem.js';
import { Player } from '../dist/src/game/Player.js';

const characters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));
const weapons = JSON.parse(await readFile(new URL('../public/data/weapons.json', import.meta.url), 'utf8'));

function character(id) {
  const value = characters.find((item) => item.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

function world(characterId, enemies = []) {
  const spawned = [];
  const damageCalls = [];
  const added = [];
  const stats = new Map([
    ['maxHp', 100], ['damage', 1], ['attackSpeed', 1], ['lifeSteal', 0],
  ]);
  const player = {
    character: character(characterId), x: 0, y: 0, radius: 18, health: 100,
    holyShieldLayers: 0, titanRiftShield: 0, titanRiftShieldTime: 0,
    titanRiftImpactTime: 0, titanRiftImpactX: 0, titanRiftImpactY: 0,
    lightSoldierTime: 0, lightSoldierAngle: 0,
    stats: {
      get: (stat) => stats.get(stat) ?? 0,
      apply: (stat, value, mode) => stats.set(stat, mode === 'add' ? (stats.get(stat) ?? 0) + value : (stats.get(stat) ?? 0) * (1 + value)),
    },
    effectiveDamageMultiplier: () => stats.get('damage') ?? 1,
    heal: () => {},
  };
  const owned = new Set([player.character.startWeapon]);
  const fake = {
    player,
    enemies,
    enemySpatial: { queryCircle: () => enemies.filter((enemy) => enemy.active) },
    rng: { chance: () => false, pick: (items) => items[0] },
    particles: { ring: () => {}, burst: () => {}, line: () => {}, slash: () => {} },
    projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
    data: { weapons, weaponById: new Map(weapons.map((weapon) => [weapon.id, weapon])) },
    weapons: {
      canAddAuxiliary: () => true,
      has: (id) => owned.has(id),
      addAuxiliaryWeapon: (id) => { owned.add(id); added.push(id); return true; },
      entries: () => [],
      levelOf: (id) => owned.has(id) ? 1 : 0,
      levelWeapon: () => false,
      masterWeapon: () => false,
    },
    nearestEnemy: () => enemies.find((enemy) => enemy.active) ?? null,
    damageEnemy: (...args) => { damageCalls.push(args); return { amount: args[1], critical: false, killed: false }; },
    damagePlayer: () => {},
    toast: () => {},
  };
  return { fake, player, spawned, damageCalls, added, stats };
}

test('all eight passives expose their exact combat numbers in character data', () => {
  assert.equal(TITAN_RIFT_RADIUS, 250);
  assert.equal(NOVA_VOID_INTERVAL, 8);
  assert.equal(NOVA_VOID_DURATION, 2);
  assert.equal(ELARA_SHIELD_INTERVAL, 2);
  assert.equal(ZAREK_TRAIL_DURATION, 1.5);
  assert.equal(ZAREK_TRAIL_DAMAGE_SHARE, 0.8);
  assert.equal(NYRA_INFERNO_COST, 100);
  assert.equal(TOREN_FORGE_KILLS, 50);
  assert.equal(MIRA_DAMAGE_PER_KILL, 0.005);
  for (const id of ['kael-orin', 'mira-voss', 'toren-vale', 'nyra-sol', 'zarek', 'elara', 'titan', 'nova']) {
    assert.match(character(id).passive.description, /\d/u, `${id} passive must state exact numbers`);
  }
});

test('Kael reaches +200% attack speed and +50% lifesteal at 30% HP', () => {
  const player = new Player(character('kael-orin'), [], createDefaultSave());
  const baseSpeed = player.stats.get('attackSpeed');
  const baseSteal = player.stats.get('lifeSteal');
  player.health = player.stats.get('maxHp') * 0.3;
  assert.ok(Math.abs(player.effectiveAttackSpeed() - baseSpeed * 3) < 1e-12);
  assert.ok(Math.abs(player.effectiveLifeSteal() - (baseSteal + 0.5)) < 1e-12);
});

test('Titan heavy hit creates a radius-250 rift and a 10%-HP shield for 0.5 seconds', () => {
  const setup = world('titan');
  const passive = new CharacterPassiveSystem();
  passive.onDamageDealt(setup.fake, { x: 12, y: 18, radius: 12, active: true }, 'gravity-bomb', 40);
  assert.equal(setup.player.titanRiftShield, 10);
  assert.equal(setup.player.titanRiftShieldTime, 0.5);
  assert.equal(setup.player.titanRiftImpactTime, 0.5);
});

test('Nova, Elara and Zarek produce their timed runtime entities', () => {
  const nova = world('nova');
  new CharacterPassiveSystem().update(8, nova.fake);
  assert.equal(nova.spawned[0].sourceWeaponId, 'passive-nova-void-maw');
  assert.equal(nova.spawned[0].life, 2);
  assert.ok(nova.spawned[0].pullStrength > 0);

  const elara = world('elara');
  const guardian = new CharacterPassiveSystem();
  guardian.update(2, elara.fake);
  assert.equal(elara.player.holyShieldLayers, 1);
  guardian.update(2, elara.fake);
  assert.equal(elara.player.lightSoldierTime, 5);

  const zarek = world('zarek');
  new CharacterPassiveSystem().update(0.1, zarek.fake, 12);
  assert.equal(zarek.spawned[0].sourceWeaponId, 'passive-zarek-toxic-trail');
  assert.equal(zarek.spawned[0].life, 1.5);
});

test('Nyra reaches inferno at 100 burning enemies while Mira and Toren scale on kills', () => {
  const burning = Array.from({ length: 100 }, (_, id) => ({
    id, active: true, x: id * 500, y: 0, radius: 10,
    status: { burnTime: 2, burnDps: 10, burnPercent: 0.001, healingReduction: 0 },
  }));
  const nyra = world('nyra-sol', burning);
  const fire = new CharacterPassiveSystem();
  fire.update(1, nyra.fake);
  assert.equal(nyra.spawned.at(-1).sourceWeaponId, 'passive-nyra-inferno');
  assert.equal(fire.nyraBurnPoints, 0);

  const mira = world('mira-voss');
  const precision = new CharacterPassiveSystem();
  precision.onEnemyKilled(mira.fake);
  precision.onEnemyKilled(mira.fake);
  assert.equal(precision.miraKillStacks, 2);
  assert.ok(Math.abs(mira.stats.get('damage') - 1.01) < 1e-12);

  const toren = world('toren-vale');
  const forge = new CharacterPassiveSystem();
  for (let index = 0; index < 50; index += 1) forge.onEnemyKilled(toren.fake);
  assert.equal(forge.torenForgeKills, 50);
  assert.equal(toren.added.length, 1);
});

test('new guardian passive atlas is RGBA and the renderer consumes all eight cells', async () => {
  const image = await readFile(new URL('../public/assets/generated/effects/guardian-passive-atlas-v1.png', import.meta.url));
  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image[25], 6, 'atlas must preserve real alpha transparency');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  assert.ok(Math.abs(width / height - 2) < 0.01, 'atlas must retain its 4x2 sheet aspect ratio');
  const renderer = await readFile(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
  assert.match(renderer, /guardian-passive-atlas-v1\.png/u);
  assert.match(renderer, /drawGuardianPassiveFrame\(7,/u);
  const soldierRenderer = renderer.slice(renderer.indexOf('private drawLightSoldier'), renderer.indexOf('private drawGuardianPassiveFrame'));
  assert.doesNotMatch(soldierRenderer, /fillRect/u);
});
