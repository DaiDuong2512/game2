import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RNG } from '../dist/src/core/RNG.js';
import { PlayerStats } from '../dist/src/game/PlayerStats.js';
import { UpgradeSystem } from '../dist/src/game/UpgradeSystem.js';
import { WeaponSystem, weaponBalanceDamageMultiplier } from '../dist/src/game/WeaponSystem.js';

async function json(name) {
  return JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
}

async function gameData() {
  const [weapons, passives, evolutions, upgrades] = await Promise.all([
    json('weapons.json'), json('passives.json'), json('evolutions.json'), json('upgrades.json'),
  ]);
  return {
    weapons,
    passives,
    evolutions,
    upgrades,
    weaponById: new Map(weapons.map((item) => [item.id, item])),
    passiveById: new Map(passives.map((item) => [item.id, item])),
    evolutionById: new Map(evolutions.map((item) => [item.id, item])),
  };
}

function upgradePlayer(level = 5) {
  const stats = new PlayerStats({ maxHp: 100, critChance: 0, luck: 0 });
  return {
    level,
    health: 100,
    character: { passive: { kind: 'none', value: 0 } },
    stats,
    syncMaxHp: () => {},
    heal: () => {},
  };
}

function firingWorld(player, spawned) {
  return {
    autoAim: true,
    player: {
      ...player,
      x: 0,
      y: 0,
      aim: { x: 1, y: 0 },
      effectiveDamageMultiplier: () => player.stats.get('damage'),
      effectiveCritDamage: () => player.stats.get('critDamage'),
    },
    rng: { chance: () => false },
    projectiles: { spawn: (spec) => { spawned.push(spec); return spec; } },
    enemySpatial: { queryCircle: () => [] },
    nearestEnemy: () => null,
    damageEnemy: () => ({ amount: 0, critical: false, killed: false }),
    particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
    screenShake: () => {},
  };
}

test('weapon-card rarity refines only its target and rollDamage consumes that refinement', async () => {
  const data = await gameData();
  const weapons = new WeaponSystem(data);
  assert.equal(weapons.equipPrimaryWeapon('echo-bow'), true);
  assert.equal(weapons.addAuxiliaryWeapon('pulse-rifle'), true);

  const player = upgradePlayer();
  const upgrades = new UpgradeSystem(data, new RNG(8128), player, weapons);
  const option = upgrades.generateOptions(5).find((item) => item.type === 'weapon-level');
  assert.ok(option);
  const legendary = data.upgrades.rarities.find((rarity) => rarity.id === 'legendary');
  assert.ok(legendary);
  // generateOptions returns the current card objects in a copied array, so this
  // pins rarity deterministically without depending on weighted RNG rolls.
  option.rarity = legendary;

  const target = weapons.entries().find((entry) => entry.config.id === option.targetId);
  const sibling = weapons.entries().find((entry) => entry.config.id !== option.targetId);
  assert.ok(target);
  assert.ok(sibling);
  const globalDamageBefore = player.stats.get('damage');
  const expectedRefinement = Math.max(0, legendary.multiplier - 1) * 0.025;

  assert.equal(upgrades.apply(option.id), true);
  assert.equal(player.stats.get('damage'), globalDamageBefore, 'weapon rarity must not buff every damage source');
  assert.equal(target.runtime.refinementBonus, expectedRefinement);
  assert.equal(sibling.runtime.refinementBonus, 0);

  for (const entry of weapons.entries()) entry.runtime.cooldown = 0;
  const spawned = [];
  weapons.update(0, firingWorld(player, spawned));
  const targetShot = spawned.find((shot) => shot.sourceWeaponId === target.config.id);
  const siblingShot = spawned.find((shot) => shot.sourceWeaponId === sibling.config.id);
  assert.ok(targetShot);
  assert.ok(siblingShot);
  const targetBaseDamage = target.config.levels[target.runtime.level - 1].damage;
  const siblingBaseDamage = sibling.config.levels[sibling.runtime.level - 1].damage;
  assert.ok(Math.abs(targetShot.damage - targetBaseDamage * weaponBalanceDamageMultiplier(target.config.behavior) * (1 + expectedRefinement)) < 1e-10);
  assert.ok(Math.abs(siblingShot.damage - siblingBaseDamage * weaponBalanceDamageMultiplier(sibling.config.behavior)) < 1e-10);
});

test('weapon milestone still returns three valid cards after both owned weapons are banished', async () => {
  const data = await gameData();
  const weapons = new WeaponSystem(data);
  assert.equal(weapons.equipPrimaryWeapon('echo-bow'), true);
  assert.equal(weapons.addAuxiliaryWeapon('pulse-rifle'), true);

  const upgrades = new UpgradeSystem(data, new RNG(1337), upgradePlayer(), weapons);
  let options = upgrades.generateOptions(5);
  assert.equal(options.length, 3);
  const firstOwned = options.find((option) => weapons.has(option.targetId));
  assert.ok(firstOwned);

  options = upgrades.banish(firstOwned.id);
  assert.ok(options);
  assert.equal(options.length, 3, 'the first Banish must regenerate a full milestone hand');
  assert.ok(options.every((option) => option.targetId !== firstOwned.targetId));
  const secondOwned = options.find((option) => weapons.has(option.targetId));
  assert.ok(secondOwned);

  options = upgrades.banish(secondOwned.id);
  assert.ok(options);
  assert.equal(options.length, 3, 'fallback may offer multiple new weapons when they are the valid content left');
  assert.equal(new Set(options.map((option) => option.targetId)).size, 3);
  assert.ok(options.every((option) => option.type === 'weapon-new'));
  assert.ok(options.every((option) => option.targetId !== firstOwned.targetId && option.targetId !== secondOwned.targetId));
});
