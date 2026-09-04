import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function json(name) {
  return JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
}

test('content pack satisfies minimum game scope', async () => {
  const [characters, weapons, enemies, stages, passives, evolutions] = await Promise.all([
    json('characters.json'), json('weapons.json'), json('enemies.json'), json('stages.json'), json('passives.json'), json('evolutions.json'),
  ]);
  assert.equal(characters.length, 8);
  assert.equal(weapons.length, 14);
  assert.ok(enemies.length >= 20);
  assert.equal(stages.length, 20);
  assert.ok(passives.length >= 14);
  assert.ok(evolutions.length >= 8);
  const requiredPlayerStats = [
    'maxHp', 'armor', 'moveSpeed', 'attackSpeed', 'critChance', 'critDamage', 'damage',
    'cooldownReduction', 'range', 'projectileSpeed', 'lifeSteal', 'hpRegen', 'dodge',
    'luck', 'expGain', 'goldGain', 'bonusProjectiles', 'healingPower', 'armorPenetration',
    'statusResistance', 'bodyScale', 'flatBlock',
  ];
  for (const character of characters) {
    for (const stat of requiredPlayerStats) {
      assert.equal(typeof character.stats[stat], 'number', `${character.id} thiếu chỉ số ${stat}`);
      assert.ok(Number.isFinite(character.stats[stat]), `${character.id}.${stat} phải hữu hạn`);
    }
  }
  for (const weapon of weapons) assert.equal(weapon.levels.length, 8, `${weapon.id} should have levels 1-8`);
  const weaponIds = new Set(weapons.map((weapon) => weapon.id));
  const passiveIds = new Set(passives.map((passive) => passive.id));
  for (const evolution of evolutions) {
    assert.ok(weaponIds.has(evolution.weapon), `Evolution weapon missing: ${evolution.weapon}`);
    assert.ok(passiveIds.has(evolution.passive), `Evolution passive missing: ${evolution.passive}`);
  }
});

test('mọi trận thường kéo dài tối thiểu hai phút rưỡi', async () => {
  const stages = await json('stages.json');
  for (const stage of stages) {
    assert.ok(
      stage.duration >= 150,
      `${stage.id} chỉ dài ${stage.duration} giây; yêu cầu tối thiểu 150 giây`,
    );
  }
});
