import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { Player } from '../dist/src/game/Player.js';
import { SkillSystem } from '../dist/src/game/SkillSystem.js';

const characters = JSON.parse(await readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8'));
const weapons = JSON.parse(await readFile(new URL('../public/data/weapons.json', import.meta.url), 'utf8'));
const evolutions = JSON.parse(await readFile(new URL('../public/data/evolutions.json', import.meta.url), 'utf8'));

const idleInput = {
  getMoveVector: () => ({ x: 0, y: 0 }),
  getAimVector: () => ({ x: 0, y: 0 }),
};

function character(id) {
  const value = characters.find((item) => item.id === id);
  assert.ok(value, `missing character ${id}`);
  return value;
}

function makePlayer(config) {
  return new Player(config, [], createDefaultSave());
}

test('all eight characters expose a weapon-bound class skill and standardized five-second rage/ultimate data', () => {
  const activeKinds = new Set();
  const rageKinds = new Set();
  for (const config of characters) {
    assert.ok(config.active?.name.trim());
    assert.ok(config.active?.description.trim());
    assert.ok(config.active?.cooldown >= 8 && config.active?.cooldown <= 12);
    assert.ok(config.active?.kind.trim());
    activeKinds.add(config.active.kind);

    assert.equal(config.rage?.duration, 5);
    assert.ok(['extra-projectile', 'status-immunity'].includes(config.rage?.bonus));
    assert.match(config.rage?.description, /gấp 3/);
    assert.match(config.rage?.description, /90%/);
    rageKinds.add(config.rage.kind);

    assert.equal(config.ultimate?.duration, 5);
    assert.match(config.ultimate?.description, /10% sát thương/);
    assert.match(config.ultimate?.description, /10% Sinh lực đã mất/);
    assert.ok(weapons.some((weapon) => weapon.id === config.startWeapon));
  }
  assert.equal(activeKinds.size, 8);
  assert.equal(rageKinds.size, 8);
});

test('rage is exactly x3 attack speed and -10% damage, then restores stats without drift', () => {
  for (const config of characters) {
    const player = makePlayer(config);
    const baseAttackSpeed = player.stats.get('attackSpeed');
    const baseDamage = player.effectiveDamageMultiplier();
    const baseProjectiles = player.stats.get('bonusProjectiles');
    player.rageMeter = 100;

    assert.equal(player.consumeRage(), true, config.id);
    assert.equal(player.rageActive, 5, config.id);
    assert.ok(Math.abs(player.stats.get('attackSpeed') / baseAttackSpeed - 3) < 1e-12, config.id);
    assert.ok(Math.abs(player.effectiveDamageMultiplier() / baseDamage - 0.9) < 1e-12, config.id);
    if (config.rage.bonus === 'extra-projectile') {
      assert.equal(player.stats.get('bonusProjectiles'), baseProjectiles + 1, config.id);
      assert.equal(player.rageStatusImmune, false, config.id);
    } else {
      assert.equal(player.stats.get('bonusProjectiles'), baseProjectiles, config.id);
      assert.equal(player.rageStatusImmune, true, config.id);
    }

    player.update(5, idleInput, 0, 0);
    assert.equal(player.rageActive, 0, config.id);
    assert.ok(Math.abs(player.stats.get('attackSpeed') - baseAttackSpeed) < 1e-12, config.id);
    assert.ok(Math.abs(player.effectiveDamageMultiplier() - baseDamage) < 1e-12, config.id);
    assert.equal(player.stats.get('bonusProjectiles'), baseProjectiles, config.id);
    assert.equal(player.rageStatusImmune, false, config.id);
  }
});

test('ultimate grants +10% damage and exactly five recovery ticks at every frame rate', () => {
  // Mira không có passive phụ thuộc ngưỡng Sinh lực nên phép đo chỉ phản ánh E.
  const source = character('mira-voss');
  const config = { ...source, stats: { ...source.stats, hpRegen: 0 } };
  const schedules = [
    ['dt 1 giây', [1, 1, 1, 1, 1]],
    ['dt 0,016 giây', Array.from({ length: 313 }, () => 0.016)],
    ['hai frame vượt mốc', [2.6, 2.6]],
    ['một frame vượt toàn thời lượng', [6]],
  ];

  for (const [label, steps] of schedules) {
    const player = makePlayer(config);
    const maxHp = player.stats.get('maxHp');
    player.health = maxHp * 0.5;
    const baseDamage = player.effectiveDamageMultiplier();
    const originalHeal = player.heal.bind(player);
    let healPulses = 0;
    player.heal = (amount, amplify) => {
      healPulses += 1;
      originalHeal(amount, amplify);
    };
    player.ultimateMeter = 100;

    assert.equal(player.consumeUltimate(), true, label);
    assert.equal(player.ultimateActive, 5, label);
    assert.ok(Math.abs(player.effectiveDamageMultiplier() / baseDamage - 1.1) < 1e-12, label);
    for (const dt of steps) player.update(dt, idleInput, 0, 0);

    const expectedHealth = maxHp - maxHp * 0.5 * 0.9 ** 5;
    assert.equal(healPulses, 5, label);
    assert.ok(Math.abs(player.health - expectedHealth) < 1e-9, label);
    assert.equal(player.ultimateActive, 0, label);
    assert.ok(Math.abs(player.effectiveDamageMultiplier() - baseDamage) < 1e-12, label);

    const healthAfterUltimate = player.health;
    player.update(1, idleInput, 0, 0);
    assert.equal(healPulses, 5, `${label}: không được có nhịp thứ sáu`);
    assert.equal(player.health, healthAfterUltimate, label);
  }
});

function activeHarness(config, runtimeOverrides = {}) {
  const player = makePlayer(config);
  player.health = player.stats.get('maxHp') * 0.5;
  const projectiles = [];
  const hits = [];
  const enemy = {
    id: 1, active: true, x: 110, y: 0, isBoss: false, isElite: false,
    knockbackX: 0, knockbackY: 0,
    status: {
      burnTime: 0, burnDps: 0, poisonTime: 0, poisonDps: 0, slowTime: 0,
      slowFactor: 1, stunTime: 0, shockTime: 0, paralysisTime: 0, blindTime: 0,
      blindCooldown: 0, burnTick: 0, burnPercent: 0, healingReduction: 0,
    },
  };
  const primaryConfig = weapons.find((weapon) => weapon.id === config.startWeapon);
  assert.ok(primaryConfig, `missing primary weapon ${config.startWeapon}`);
  const primaryRuntime = {
    id: primaryConfig.id,
    slot: 'primary',
    level: 1,
    masteryLevel: 0,
    refinementBonus: 0,
    cooldown: 0,
    damageDealt: 0,
    evolutionId: null,
    orbitHitClock: 0,
    summonAngle: 0,
    ...runtimeOverrides,
  };
  const world = {
    player,
    input: { wasPressed: (code) => code === 'KeyQ', gamepadPressed: () => false },
    audio: { play: () => {} }, toast: () => {}, screenShake: () => {},
    rng: { chance: () => false },
    enemySpatial: { queryCircle: () => [enemy] },
    nearestEnemy: () => enemy,
    weapons: { primaryEntry: () => ({ config: primaryConfig, runtime: primaryRuntime }) },
    data: { evolutionById: new Map(evolutions.map((evolution) => [evolution.id, evolution])) },
    projectiles: { spawn: (spec) => { projectiles.push(spec); return spec; } },
    particles: {
      ring: () => {}, burst: () => {}, line: () => {}, slash: () => {}, spawn: () => {},
      spawnAtlas: () => {}, spawnStatusAtlas: () => {},
    },
    damageEnemy(target, damage, element, sourceWeaponId, statusChance, knockback, critical, originX, originY, hitEffect) {
      hits.push({ target, damage, element, sourceWeaponId, statusChance, knockback, critical, originX, originY, hitEffect });
      return { amount: damage, critical: false, killed: false };
    },
  };
  new SkillSystem().update(0.1, world);
  return { player, enemy, projectiles, hits };
}

test('eight class skills use distinct weapon-specific sources and matching damage elements', () => {
  const expected = {
    'kael-orin': ['active-rift-blooddraw', 'physical'],
    'mira-voss': ['active-gale-volley', 'physical'],
    'toren-vale': ['active-sanctuary-guard', 'physical'],
    'nyra-sol': ['active-ember-frost-ruin', 'fire'],
    zarek: ['active-hemotoxic-draw', 'poison'],
    elara: ['active-echo-pack', 'arcane'],
    titan: ['active-gravity-breaker', 'physical'],
    nova: ['active-astral-fold', 'arcane'],
  };
  const signatures = new Set();
  for (const config of characters) {
    const result = activeHarness(config);
    const events = [...result.hits, ...result.projectiles];
    assert.ok(events.length > 0, `${config.id} produced no damaging class-skill event`);
    assert.ok(events.every((event) => event.sourceWeaponId === expected[config.id][0]), config.id);
    assert.ok(events.every((event) => event.element === expected[config.id][1]), config.id);
    assert.ok(result.player.activeCooldown > 0, config.id);
    const signature = `${events[0].sourceWeaponId}:${events.length}:${result.player.invulnerable}:${result.enemy.status.stunTime}:${result.enemy.status.blindTime}`;
    assert.ok(!signatures.has(signature), signature);
    signatures.add(signature);
  }
  assert.equal(signatures.size, 8);
});

function firstClassSkillDamage(result) {
  const event = result.hits[0] ?? result.projectiles[0];
  assert.ok(event, 'class skill produced no damage event');
  return event.damage;
}

test('Q inherits primary level, mastery, rarity refinement and evolution exactly once', () => {
  // Mira không tự hồi máu khi dùng Q nên passive/damage multiplier giữ nguyên
  // trước và sau phép đo.
  const config = character('mira-voss');
  const weapon = weapons.find((item) => item.id === config.startWeapon);
  const evolution = evolutions.find((item) => item.weapon === config.startWeapon);
  assert.ok(weapon && evolution);

  const base = activeHarness(config);
  const levelEight = activeHarness(config, { level: 8 });
  const masteryThree = activeHarness(config, { masteryLevel: 3 });
  const refined = activeHarness(config, { refinementBonus: 0.37 });
  const evolved = activeHarness(config, { evolutionId: evolution.id });
  const combined = activeHarness(config, {
    level: 8,
    masteryLevel: 3,
    refinementBonus: 0.37,
    evolutionId: evolution.id,
  });
  const baseDamage = firstClassSkillDamage(base);

  // 23 là hệ số mỗi mũi Q Mira; effectiveDamageMultiplier chỉ dùng đúng một lần.
  assert.ok(Math.abs(baseDamage - 23 * base.player.effectiveDamageMultiplier()) < 1e-10);
  assert.ok(Math.abs(firstClassSkillDamage(levelEight) / baseDamage - weapon.levels[7].damage / weapon.levels[0].damage) < 1e-10);
  assert.ok(Math.abs(firstClassSkillDamage(masteryThree) / baseDamage - 1.24) < 1e-10);
  assert.ok(Math.abs(firstClassSkillDamage(refined) / baseDamage - 1.37) < 1e-10);
  assert.ok(Math.abs(firstClassSkillDamage(evolved) / baseDamage - evolution.damageMultiplier) < 1e-10);
  const combinedMultiplier = weapon.levels[7].damage / weapon.levels[0].damage
    * 1.24 * 1.37 * evolution.damageMultiplier;
  assert.ok(Math.abs(firstClassSkillDamage(combined) / baseDamage - combinedMultiplier) < 1e-10);
});

test('Q forwards the primary signature while retaining an active-skill source id', () => {
  const cases = [
    ['kael-orin', 'bleed'],
    ['mira-voss', 'slow'],
    ['elara', 'stun'],
    ['nova', 'stun'],
  ];
  for (const [characterId, expectedSignature] of cases) {
    const result = activeHarness(character(characterId));
    const events = [...result.hits, ...result.projectiles];
    assert.ok(events.length > 0, characterId);
    assert.ok(events.every((event) => event.sourceWeaponId.startsWith('active-')), characterId);
    assert.ok(events.every((event) => event.hitEffect?.kind === expectedSignature), characterId);
  }
});
