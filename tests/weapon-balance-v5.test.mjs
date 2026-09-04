import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ORBIT_GUARDIAN_RAY_DAMAGE_SHARE,
  ORBIT_GUARDIAN_RAY_RANGE,
  ORBIT_GUARDIAN_SPEED,
  SUMMON_AUXILIARY_RAY_COUNT,
  SUMMON_AUXILIARY_RAY_DAMAGE_SHARE,
  SUMMONS_PER_ORBIT_LAYER,
  SWORD_LAYER_SPACING,
  SWORD_PULSE_COUNT,
  SWORD_PULSE_DAMAGE_SHARE,
  SWORD_PULSE_KNOCKBACK_SHARE,
  WeaponSystem,
  characterWeaponCountBonus,
  volleyAngleOffset,
  weaponBalanceDamageMultiplier,
} from '../dist/src/game/WeaponSystem.js';

const productionWeapons = JSON.parse(await readFile(new URL('../public/data/weapons.json', import.meta.url), 'utf8'));
const productionCharacters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));

test('Nova có tốc đánh gấp đôi, Zarek có hồi chiêu nhanh và hai Mầm Độc riêng từ đầu', () => {
  const nova = productionCharacters.find((character) => character.id === 'nova');
  const zarek = productionCharacters.find((character) => character.id === 'zarek');

  assert.equal(nova.stats.attackSpeed, 2);
  assert.equal(zarek.stats.cooldownReduction, 0.23);
  assert.equal(characterWeaponCountBonus(zarek.id, zarek.startWeapon), 1);
  assert.equal(characterWeaponCountBonus('nova', zarek.startWeapon), 0, 'bonus không lan sang nhân vật khác');
  assert.equal(characterWeaponCountBonus('zarek', 'toxic-smoke-bomb'), 0, 'bonus không lan sang vũ khí nhặt thêm');
});

function config(id, behavior, { damage = 30, cooldown = 1, count = 1, range = 500, speed = 400, signature } = {}) {
  const level = { level: 1, damage, cooldown, count, speed, range, pierce: 0, size: 12, duration: 1, knockback: 40, statusChance: 0.5 };
  return { id, name: id, behavior, element: 'physical', icon: '', description: '', signature, maxLevel: 1, levels: [level] };
}

function harness(weapon, enemies = [], statOverrides = {}) {
  const hits = [];
  const projectiles = [];
  const actionAngles = [];
  const data = { weaponById: new Map([[weapon.id, weapon]]), evolutionById: new Map() };
  const system = new WeaponSystem(data);
  system.equipPrimaryWeapon(weapon.id);
  const world = {
    autoAim: true,
    enemies,
    player: {
      x: 0, y: 0, radius: 12, aim: { x: 1, y: 0 }, lastMove: { x: 0, y: 1 },
      character: { passive: { kind: 'none', value: 0 } },
      stats: { get: (stat) => ({ cooldownReduction: 0, attackSpeed: 1, bonusProjectiles: 0, range: 1, projectileSpeed: 1, critChance: 0, ...statOverrides }[stat] ?? 0) },
      effectiveDamageMultiplier: () => 1,
      effectiveCritDamage: () => 1.8,
      triggerPrimaryAttack: (_behavior, angle) => actionAngles.push(angle),
    },
    rng: { chance: () => false },
    projectiles: { spawn: (spec) => { projectiles.push(spec); return spec; } },
    enemySpatial: { queryCircle: () => enemies },
    nearestEnemy: () => enemies.find((enemy) => enemy.active) ?? null,
    damageEnemy: (_enemy, damage, _element, _source, _chance, knockback) => { hits.push({ damage, knockback }); return { amount: damage, critical: false, killed: false }; },
    particles: { line: () => {}, burst: () => {}, ring: () => {}, spawn: () => {} },
    audio: { play: () => {} },
    screenShake: () => {},
  };
  return { system, world, hits, projectiles, actionAngles };
}

test('kiếm xoay đủ bốn nhịp trong chu kỳ một giây và mỗi nhịp chỉ hất nhẹ', () => {
  assert.equal(productionWeapons.find((weapon) => weapon.id === 'rift-blade').levels[0].cooldown, 1);
  const enemy = { id: 1, active: true, x: 60, y: 0, radius: 10 };
  const setup = harness(config('sword', 'slash', { damage: 40, cooldown: 1, range: 100 }), [enemy]);
  setup.system.update(0.2, setup.world);
  for (let index = 1; index < SWORD_PULSE_COUNT; index += 1) setup.system.update(0.25, setup.world);

  assert.equal(setup.hits.length, SWORD_PULSE_COUNT);
  const expectedPulseDamage = 40 * weaponBalanceDamageMultiplier('slash') * SWORD_PULSE_DAMAGE_SHARE;
  setup.hits.forEach((hit) => {
    assert.ok(Math.abs(hit.damage - expectedPulseDamage) < 1e-9);
    assert.equal(hit.knockback, 40 * SWORD_PULSE_KNOCKBACK_SHARE);
  });
  assert.ok(Math.abs(setup.hits.reduce((sum, hit) => sum + hit.damage, 0) - 40 * weaponBalanceDamageMultiplier('slash')) < 1e-9);
  assert.ok(Math.abs(setup.actionAngles[0] - Math.PI / 2) < 1e-9, 'kiếm dùng hướng di chuyển, không quay theo chuột');
});

test('mỗi ba tinh linh tạo một vòng mới và từng Vọng Âm bắn hai tia phụ một phần ba sát thương', () => {
  const signature = { kind: 'stun', duration: 0.3, chance: 1 };
  const enemy = { id: 1, active: true, x: 240, y: 0, radius: 10 };
  const count = SUMMONS_PER_ORBIT_LAYER + 1;
  const setup = harness(config('spirits', 'summon', { damage: 30, cooldown: 1, count, signature }), [enemy]);
  setup.system.update(0.2, setup.world);

  const projectilesPerSummon = 1 + SUMMON_AUXILIARY_RAY_COUNT;
  assert.equal(setup.projectiles.length, count * projectilesPerSummon);
  for (let index = 0; index < count; index += 1) {
    const main = setup.projectiles[index * projectilesPerSummon];
    const rays = setup.projectiles.slice(index * projectilesPerSummon + 1, (index + 1) * projectilesPerSummon);
    assert.equal(rays.length, SUMMON_AUXILIARY_RAY_COUNT);
    for (const ray of rays) {
      assert.ok(Math.abs(ray.damage - main.damage * SUMMON_AUXILIARY_RAY_DAMAGE_SHARE) < 1e-9);
      assert.deepEqual(ray.hitEffect, signature);
    }
  }
  const innerRadius = Math.hypot(setup.projectiles[0].x, setup.projectiles[0].y);
  const outerRadius = Math.hypot(setup.projectiles[SUMMONS_PER_ORBIT_LAYER * projectilesPerSummon].x, setup.projectiles[SUMMONS_PER_ORBIT_LAYER * projectilesPerSummon].y);
  assert.ok(Math.abs(innerRadius - 68) < 1e-9);
  assert.ok(Math.abs(outerRadius - 98) < 1e-9);
});

test('Triệu Hồi Vọng Âm production bắt đầu với hai linh thể và sát thương nền đã tăng', () => {
  const echo = productionWeapons.find((weapon) => weapon.id === 'echo-summon');
  assert.equal(echo.levels[0].count, 2);
  assert.equal(echo.levels[0].damage, 14.4);
  assert.equal(echo.levels[7].count, 4);
  assert.equal(echo.levels[7].damage, 41.21);
});

test('Thánh Thuẫn của Toren xoay nhanh theo tốc đánh và mỗi linh vật tự bắn tia tỉa', () => {
  const enemy = { id: 1, active: true, x: 420, y: 0, radius: 10 };
  const count = 2;
  const setup = harness(config('aegis-orbit', 'orbit', { damage: 30, cooldown: 1, count, range: 92, speed: 0 }), [enemy], { attackSpeed: 1.4 });
  setup.system.update(0.2, setup.world);

  assert.equal(setup.projectiles.length, count);
  assert.ok(Math.abs(setup.system.entries()[0].runtime.summonAngle - 0.2 * ORBIT_GUARDIAN_SPEED * 1.4) < 1e-12);
  for (const ray of setup.projectiles) {
    assert.equal(ray.sourceWeaponId, 'aegis-orbit');
    assert.equal(ray.maxRange, ORBIT_GUARDIAN_RAY_RANGE);
    assert.ok(ray.vx > 0);
    assert.ok(Math.abs(ray.damage - 30 * weaponBalanceDamageMultiplier('orbit') * ORBIT_GUARDIAN_RAY_DAMAGE_SHARE) < 1e-9);
  }
});

test('cung giữ nguyên hệ số trong khi mọi hệ còn lại được bù sát thương', () => {
  assert.equal(weaponBalanceDamageMultiplier('bow'), 1);
  for (const behavior of ['slash', 'gun', 'darts', 'bomb', 'lightning', 'fireball', 'ice', 'laser', 'poison', 'poison-bomb', 'orbit', 'summon', 'nova']) {
    assert.ok(weaponBalanceDamageMultiplier(behavior) > 1, `${behavior} phải mạnh hơn trước`);
  }
});

test('tốc đánh cao rút ngắn cả chu kỳ kiếm và hồi chiêu vũ khí thường', () => {
  const enemy = { id: 1, active: true, x: 60, y: 0, radius: 10 };
  const fastSword = harness(config('fast-sword', 'slash', { cooldown: 1, range: 100 }), [enemy], { attackSpeed: 2 });
  fastSword.system.update(0.2, fastSword.world);
  for (let index = 0; index < 3; index += 1) fastSword.system.update(0.125, fastSword.world);
  assert.equal(fastSword.hits.length, 4, '200% tốc đánh phải hoàn thành bốn nhịp kiếm trong 0,5 giây');

  const normalGun = harness(config('normal-gun', 'gun', { cooldown: 1 }), [enemy], { attackSpeed: 1 });
  const fastGun = harness(config('fast-gun', 'gun', { cooldown: 1 }), [enemy], { attackSpeed: 2 });
  normalGun.system.update(1.01, normalGun.world);
  fastGun.system.update(1.01, fastGun.world);
  assert.equal(normalGun.projectiles.length, 1);
  assert.equal(fastGun.projectiles.length, 2);
});

test('mỗi tia cộng thêm tạo một lớp kiếm mới có tầm và sát thương thật', () => {
  const innerEnemy = { id: 1, active: true, x: 70, y: 0, radius: 8 };
  const outerEnemy = { id: 2, active: true, x: 120, y: 0, radius: 8 };
  const setup = harness(
    config('layered-sword', 'slash', { damage: 40, cooldown: 1, count: 1, range: 80 }),
    [innerEnemy, outerEnemy],
    { bonusProjectiles: 2 },
  );
  setup.system.update(0.2, setup.world);

  assert.equal(SWORD_LAYER_SPACING, 28);
  assert.equal(setup.hits.length, 2);
  const basePulse = 40 * weaponBalanceDamageMultiplier('slash') * SWORD_PULSE_DAMAGE_SHARE;
  assert.ok(Math.abs(setup.hits[0].damage - basePulse * 3) < 1e-9, 'mục tiêu gần nhận cả ba lớp');
  assert.ok(Math.abs(setup.hits[1].damage - basePulse) < 1e-9, 'mục tiêu xa chỉ nhận lớp ngoài cùng');
});

test('loạt tia chẵn chia đều cho mục tiêu gần nhất, không bắn cặp 180 độ vô ích', () => {
  const offsets = Array.from({ length: 4 }, (_, index) => volleyAngleOffset(index, 4, 0.13));
  assert.deepEqual(offsets, [-0.195, -0.065, 0.065, 0.195]);

  const east = { id: 1, active: true, x: 200, y: 0, radius: 10 };
  const north = { id: 2, active: true, x: 0, y: -220, radius: 10 };
  const setup = harness(config('even-bow', 'bow', { count: 2 }), [east, north]);
  setup.system.update(0.2, setup.world);
  assert.equal(setup.projectiles.length, 2);
  assert.ok(setup.projectiles[0].vx > 0 && Math.abs(setup.projectiles[0].vy) < 1e-9);
  assert.ok(Math.abs(setup.projectiles[1].vx) < 1e-9 && setup.projectiles[1].vy < 0);
});
