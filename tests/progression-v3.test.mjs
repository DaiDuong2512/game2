import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { RNG } from '../dist/src/core/RNG.js';
import { createDefaultSave, SaveSystem } from '../dist/src/core/SaveSystem.js';
import { MetaProgression } from '../dist/src/game/MetaProgression.js';
import { Player } from '../dist/src/game/Player.js';
import { PlayerStats } from '../dist/src/game/PlayerStats.js';
import { UpgradeSystem } from '../dist/src/game/UpgradeSystem.js';

const SAVE_KEY = 'riftwarden-echo-siege-save';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    snapshot(key) {
      const value = values.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    },
  };
}

async function withMemoryStorage(initial, callback) {
  const hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previousStorage = globalThis.localStorage;
  const storage = createMemoryStorage(initial);
  globalThis.localStorage = storage;
  try {
    return await callback(storage);
  } finally {
    if (hadStorage) globalThis.localStorage = previousStorage;
    else delete globalThis.localStorage;
  }
}

function totalPermanentPoints(points) {
  return Object.values(points).reduce((total, value) => total + value, 0);
}

test('mọi Hộ Vệ đều nhận cùng tiến trình nâng cấp vĩnh viễn', async () => {
  const [characters, metaUpgrades] = await Promise.all([
    readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/data/meta-upgrades.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const baseSave = createDefaultSave();
  const upgradedSave = createDefaultSave();
  upgradedSave.metaLevels = { 'base-hp': 3, 'base-damage': 4, 'base-speed': 2 };
  upgradedSave.permanentPoints = { ...upgradedSave.permanentPoints, damage: 12, moveSpeed: 9, armor: 7 };

  for (const character of characters) {
    const baseline = new Player(character, metaUpgrades, baseSave).stats;
    const upgraded = new Player(character, metaUpgrades, upgradedSave).stats;
    assert.ok(upgraded.get('maxHp') > baseline.get('maxHp'), `${character.id} phải nhận Sinh Lực Cơ Bản`);
    assert.ok(upgraded.get('damage') > baseline.get('damage'), `${character.id} phải nhận Sát Thương`);
    assert.ok(upgraded.get('moveSpeed') > baseline.get('moveSpeed'), `${character.id} phải nhận Tốc Độ Di Chuyển`);
    assert.ok(upgraded.get('armor') > baseline.get('armor'), `${character.id} phải nhận điểm Giáp vĩnh viễn`);
  }
});

function victoryStats(overrides = {}) {
  return {
    startedAt: 1,
    elapsed: 120,
    stageIndex: 4,
    wave: 5,
    level: 12,
    kills: 150,
    gold: 80,
    shards: 2,
    totalDamage: 12_000,
    damageByWeapon: {},
    result: 'victory',
    seed: 1337,
    statShards: 0,
    skillCritShards: 0,
    ...overrides,
  };
}

function neutralStats() {
  return {
    maxHp: 100,
    armor: 0,
    moveSpeed: 120,
    attackSpeed: 1,
    critChance: 0.1,
    critDamage: 1.8,
    damage: 1,
    cooldownReduction: 0,
    range: 1,
    projectileSpeed: 1,
    lifeSteal: 0,
    hpRegen: 0,
    dodge: 0,
    luck: 0,
    expGain: 1,
    goldGain: 1,
    bonusProjectiles: 0,
    healingPower: 1,
    armorPenetration: 0,
    statusResistance: 0,
    bodyScale: 1,
    flatBlock: 0,
  };
}

test('save v4 defaults are complete and independently allocated', () => {
  const first = createDefaultSave();
  const second = createDefaultSave();

  assert.equal(first.version, 4);
  assert.equal(first.highestCompletedStage, 0);
  assert.deepEqual(first.permanentPoints, {
    attackSpeed: 0,
    moveSpeed: 0,
    armor: 0,
    damage: 0,
    lifeSteal: 0,
    luck: 0,
  });
  assert.deepEqual(first.pendingPermanentChoices, []);
  assert.equal(first.pendingPermanentStage, 0);
  assert.equal(first.settings.highContrast, true);
  assert.equal(first.settings.colorBlindMode, 'off');
  assert.notStrictEqual(first.settings, second.settings);
  assert.notStrictEqual(first.permanentPoints, second.permanentPoints);
  assert.notStrictEqual(first.pendingPermanentChoices, second.pendingPermanentChoices);
});

test('save v2 migrates to v4 while preserving progression and filling new defaults', async () => {
  const legacy = {
    version: 2,
    goldReserve: 321,
    riftShards: 9,
    highestStage: 7,
    unlockedCharacters: ['kael-orin', 'mira-voss'],
    unlockedWeapons: ['rift-blade'],
    metaLevels: { 'base-damage': 3 },
    settings: { masterVolume: 0.25, damageNumbers: false },
    permanentPoints: { damage: 4 },
    pendingPermanentChoices: [{ id: 'legacy', stat: 'damage', points: 999 }],
    pendingPermanentStage: 99,
  };

  await withMemoryStorage({ [SAVE_KEY]: JSON.stringify(legacy) }, () => {
    const save = new SaveSystem();
    assert.equal(save.data.version, 4);
    assert.equal(save.data.goldReserve, 321);
    assert.equal(save.data.riftShards, 9);
    assert.equal(save.data.highestStage, 7);
    assert.equal(save.data.highestCompletedStage, 6);
    assert.deepEqual(save.data.metaLevels, { 'base-damage': 3 });
    assert.equal(save.data.settings.masterVolume, 0.25);
    assert.equal(save.data.settings.damageNumbers, false);
    assert.equal(save.data.settings.highContrast, true);
    assert.equal(save.data.settings.colorBlindMode, 'off');
    assert.deepEqual(save.data.permanentPoints, {
      attackSpeed: 0,
      moveSpeed: 0,
      armor: 0,
      damage: 4,
      lifeSteal: 0,
      luck: 0,
    });
    assert.deepEqual(save.data.pendingPermanentChoices, []);
    assert.equal(save.data.pendingPermanentStage, 0);
  });
});

test('victory grants exactly 10 random permanent points, three choices, and one persistent claim', async () => {
  await withMemoryStorage({}, (storage) => {
    const data = { characters: [] };
    const save = new SaveSystem();
    const meta = new MetaProgression(data, save);
    const stats = victoryStats();

    const before = totalPermanentPoints(save.data.permanentPoints);
    const choices = meta.prepareVictoryRewards(stats);
    const afterPreparation = totalPermanentPoints(save.data.permanentPoints);

    assert.equal(afterPreparation - before, 10);
    assert.equal(choices.length, 3);
    assert.equal(new Set(choices.map((choice) => choice.id)).size, 3);
    assert.equal(new Set(choices.map((choice) => choice.stat)).size, 3);
    for (const choice of choices) {
      assert.equal(choice.points, 5);
      assert.ok(choice.title.trim());
      assert.ok(choice.description.trim());
    }
    assert.equal(save.data.pendingPermanentStage, stats.stageIndex);

    const repeated = meta.prepareVictoryRewards(stats);
    assert.deepEqual(repeated, choices);
    assert.equal(totalPermanentPoints(save.data.permanentPoints), afterPreparation, 'pending rewards must not grant the base 10 points twice');

    const serializedPreparation = storage.snapshot(SAVE_KEY);
    assert.equal(serializedPreparation.version, 4);
    assert.deepEqual(serializedPreparation.pendingPermanentChoices, choices);

    const reloaded = new SaveSystem();
    const reloadedMeta = new MetaProgression(data, reloaded);
    assert.deepEqual(reloadedMeta.pendingPermanentRewards(), choices);

    const selected = choices[0];
    const selectedBefore = reloaded.data.permanentPoints[selected.stat];
    assert.equal(reloadedMeta.claimPermanentReward(selected.id), true);
    assert.equal(reloaded.data.permanentPoints[selected.stat], selectedBefore + 5);
    assert.equal(totalPermanentPoints(reloaded.data.permanentPoints), afterPreparation + 5);
    assert.deepEqual(reloaded.data.pendingPermanentChoices, []);
    assert.equal(reloaded.data.pendingPermanentStage, 0);
    assert.equal(reloadedMeta.claimPermanentReward(selected.id), false, 'a reward cannot be claimed twice');

    const claimedReload = new SaveSystem();
    assert.equal(totalPermanentPoints(claimedReload.data.permanentPoints), afterPreparation + 5);
    assert.deepEqual(claimedReload.data.pendingPermanentChoices, []);

    const character = { id: 'test-warden', stats: neutralStats(), startWeapon: 'rift-blade' };
    const baselinePlayer = new Player(character, [], createDefaultSave());
    const nextRunPlayer = new Player(character, [], claimedReload.data);
    for (const [stat, points] of Object.entries(claimedReload.data.permanentPoints)) {
      if (points > 0) {
        assert.ok(
          nextRunPlayer.stats.get(stat) > baselinePlayer.stats.get(stat),
          `trận kế tiếp phải áp dụng ${points} điểm ${stat} đã lưu`,
        );
      }
    }
  });
});

test('non-victory runs and forged reward IDs cannot change permanent points', async () => {
  await withMemoryStorage({}, () => {
    const save = new SaveSystem();
    const meta = new MetaProgression({ characters: [] }, save);
    const before = structuredClone(save.data.permanentPoints);

    assert.deepEqual(meta.prepareVictoryRewards(victoryStats({ result: 'defeat' })), []);
    assert.deepEqual(meta.prepareVictoryRewards(victoryStats({ result: 'abandoned' })), []);
    assert.deepEqual(save.data.permanentPoints, before);
    assert.equal(meta.claimPermanentReward('forged-choice-id'), false);
    assert.deepEqual(save.data.permanentPoints, before);
  });
});

test('nâng cấp vĩnh viễn không có giới hạn cấp và giá không tràn số', async () => {
  await withMemoryStorage({}, () => {
    const config = {
      id: 'base-hp',
      name: 'Sinh Lực Cơ Bản',
      stat: 'maxHp',
      baseCost: 80,
      costGrowth: 1.18,
      perLevel: 4,
    };
    const save = new SaveSystem();
    save.data.metaLevels[config.id] = 25;
    save.data.goldReserve = 1_000_000;
    const meta = new MetaProgression({ characters: [], metaUpgrades: [config] }, save);

    assert.equal(meta.purchase(config.id), true, 'cấp cũ từng là tối đa vẫn phải mua tiếp được');
    assert.equal(meta.level(config.id), 26);

    save.data.metaLevels[config.id] = 10_000;
    save.data.goldReserve = Number.MAX_SAFE_INTEGER;
    assert.equal(meta.cost(config), Number.MAX_SAFE_INTEGER, 'giá cấp cực cao phải hữu hạn và an toàn');
    assert.equal(meta.purchase(config.id), true);
    assert.equal(meta.level(config.id), 10_001);
  });
});

test('chiến thắng tách màn đã hoàn thành khỏi màn vừa được mở', async () => {
  await withMemoryStorage({}, () => {
    const save = new SaveSystem();
    const meta = new MetaProgression({ characters: [] }, save);

    meta.commitRun(victoryStats({ stageIndex: 1 }), 0, 0);
    assert.equal(save.data.highestCompletedStage, 1);
    assert.equal(save.data.highestStage, 2);

    meta.commitRun(victoryStats({ stageIndex: 20 }), 0, 0);
    assert.equal(save.data.highestCompletedStage, 20);
    assert.equal(save.data.highestStage, 20);
  });
});

test('uncapped combat stats continue stacking while percentage defenses use diminishing returns', () => {
  const stats = new PlayerStats(neutralStats());

  for (let index = 0; index < 200; index += 1) {
    stats.apply('damage', 0.02, 'multiply');
    stats.apply('attackSpeed', 0.01, 'multiply');
    stats.apply('moveSpeed', 0.005, 'multiply');
    stats.apply('maxHp', 2, 'add');
    stats.apply('armor', 0.5, 'add');
    stats.apply('hpRegen', 0.1, 'add');
    stats.apply('healingPower', 0.01, 'multiply');
    stats.apply('bonusProjectiles', 1, 'add');
  }

  const first = stats.snapshot();
  assert.ok(first.damage > 40);
  assert.ok(first.attackSpeed > 7);
  assert.ok(first.moveSpeed > 300);
  assert.equal(first.maxHp, 500);
  assert.equal(first.armor, 100);
  assert.ok(Math.abs(first.hpRegen - 20) < 1e-10);
  assert.ok(first.healingPower > 7);
  assert.equal(first.bonusProjectiles, 200);

  stats.apply('damage', 0.02, 'multiply');
  stats.apply('attackSpeed', 0.01, 'multiply');
  stats.apply('moveSpeed', 0.005, 'multiply');
  stats.apply('maxHp', 2, 'add');
  stats.apply('armor', 0.5, 'add');
  stats.apply('hpRegen', 0.1, 'add');
  stats.apply('healingPower', 0.01, 'multiply');
  stats.apply('bonusProjectiles', 1, 'add');
  const next = stats.snapshot();

  for (const key of ['damage', 'attackSpeed', 'moveSpeed', 'maxHp', 'armor', 'hpRegen', 'healingPower', 'bonusProjectiles']) {
    assert.ok(next[key] > first[key], `${key} should continue increasing after a large stack count`);
  }

  for (const stat of ['lifeSteal', 'armorPenetration', 'statusResistance']) {
    const diminishing = new PlayerStats(neutralStats());
    diminishing.apply(stat, 1, 'add');
    const oneStack = diminishing.get(stat);
    diminishing.apply(stat, 1, 'add');
    const twoStacks = diminishing.get(stat);
    assert.ok(oneStack > 0 && oneStack < 1, `${stat} should become effective without reaching immunity`);
    assert.ok(twoStacks > oneStack && twoStacks < 1, `${stat} should still improve on later stacks`);
    assert.ok(twoStacks - oneStack < oneStack, `${stat} should have diminishing effective gain`);
  }
});

test('all requested stackable buff families remain available at effectively uncapped levels', async () => {
  const passives = JSON.parse(await readFile(new URL('../public/data/passives.json', import.meta.url), 'utf8'));
  const requiredStats = new Set([
    'damage',
    'bonusProjectiles',
    'attackSpeed',
    'hpRegen',
    'healingPower',
    'maxHp',
    'armor',
    'armorPenetration',
    'moveSpeed',
    'statusResistance',
  ]);

  for (const passive of passives) {
    if (requiredStats.has(passive.stat)) {
      assert.ok(passive.maxLevel >= 999, `${passive.id} must not impose a normal run-level cap`);
      requiredStats.delete(passive.stat);
    }
    if (passive.secondaryStat && requiredStats.has(passive.secondaryStat)) {
      assert.ok(passive.maxLevel >= 999, `${passive.id} must not impose a normal run-level cap`);
      requiredStats.delete(passive.secondaryStat);
    }
  }
  assert.deepEqual([...requiredStats], [], `missing stackable buff stats: ${[...requiredStats].join(', ')}`);
});

test('starter loadout always offers three unique additional weapons with a random buff', async () => {
  const weapons = JSON.parse(await readFile(new URL('../public/data/weapons.json', import.meta.url), 'utf8'));
  const startingWeaponId = weapons[0].id;
  const weaponRuntime = {
    has: (id) => id === startingWeaponId,
    canAddAuxiliary: () => true,
  };
  const player = {};
  const data = { weapons };

  for (let seed = 1; seed <= 32; seed += 1) {
    const upgrades = new UpgradeSystem(data, new RNG(seed), player, weaponRuntime);
    const options = upgrades.generateStarterOptions();
    assert.equal(options.length, 3, `seed ${seed} should offer exactly three starter choices`);
    assert.equal(new Set(options.map((option) => option.weaponId)).size, 3, `seed ${seed} duplicated a weapon`);
    assert.equal(new Set(options.map((option) => option.buff.id)).size, 3, `seed ${seed} duplicated a starter buff`);
    assert.ok(options.every((option) => option.weaponId !== startingWeaponId), 'the current weapon cannot be offered again');
    for (const option of options) {
      assert.ok(option.title.trim());
      assert.ok(option.description.trim());
      assert.ok(option.buff.name.trim());
      assert.ok(option.buff.description.trim());
      assert.ok(Number.isFinite(option.buff.value) && option.buff.value > 0);
    }
  }
});
