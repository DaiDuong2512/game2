import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { Player } from '../dist/src/game/Player.js';
import { SkillSystem } from '../dist/src/game/SkillSystem.js';
import { BossSystem } from '../dist/src/game/BossSystem.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { TerrainSystem } from '../dist/src/game/TerrainSystem.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';
import { WeaponSystem } from '../dist/src/game/WeaponSystem.js';
import { inDamageCircle, titanActionFrame, TITAN_BREAKER_IMPACT, TITAN_FALL_IMPACT } from '../dist/src/game/CombatTiming.js';
import { miraKillDamageBonus } from '../dist/src/game/CharacterPassiveSystem.js';
import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { SpatialHash } from '../dist/src/core/SpatialHash.js';
import { RNG } from '../dist/src/core/RNG.js';

const characters = JSON.parse(await readFile('public/data/characters.json', 'utf8'));
const stages = JSON.parse(await readFile('public/data/stages.json', 'utf8'));
const weapons = JSON.parse(await readFile('public/data/weapons.json', 'utf8'));
const data = { weaponById: new Map(weapons.map(w => [w.id, w])), evolutionById: new Map() };
const noop = () => {};
const input = { wasPressed: () => false, gamepadPressed: () => false,
  getMoveVector: () => ({ x: 0, y: 0 }), getAimVector: () => ({ x: 1, y: 0 }) };
function world(id = 'titan') {
  const player = new Player(characters.find(c => c.id === id), [], createDefaultSave());
  const hits = [];
  const enemy = Object.assign(new Enemy(), { active: true, x: 60, y: 0, radius: 10 });
  const far = Object.assign(new Enemy(), { active: true, x: 230, y: 210, radius: 10 });
  const enemies = [enemy, far];
  const skills = new SkillSystem();
  const w = { player, enemies, input: { ...input }, rng: new RNG(1337),
    particles: new Proxy({}, { get: () => noop }), audio: { play: noop }, toast: noop,
    screenShake: noop, enemySpatial: { queryCircle: () => enemies }, autoAim: true,
    projectiles: new ProjectileSystem(), damagePlayer: noop,
    nearestEnemy: () => enemy,
    damageEnemy(e, amount, element, source) { hits.push({ e, amount, element, source }); return { amount, critical: false, killed: false }; },
  };
  return { w, player, hits, enemy, far, skills };
}

test('Titan Q damage and frame 4 occur together after windup, once, inside the circle', () => {
  const { w, player, hits, enemy, skills } = world();
  w.input.wasPressed = key => key === 'KeyQ';
  skills.update(0.01, w);
  assert.equal(hits.length, 0);
  assert.ok(player.activeCooldown > 0);
  assert.equal(player.abilityCastKind, 'active-gravity-breaker');
  assert.equal(player.actionDuration, 0.64);
  w.input.wasPressed = () => false;
  skills.update(TITAN_BREAKER_IMPACT - 0.01, w);
  assert.equal(hits.length, 0);
  skills.update(0.011, w);
  assert.deepEqual(hits.map(h => h.e), [enemy]);
  assert.equal(titanActionFrame(TITAN_BREAKER_IMPACT, false), 4);
  assert.ok(player.titanSlamTime > 0);
  skills.update(0.5, w);
  assert.equal(hits.length, 1);
});

test('Titan Q keeps its full pose through dash, ultimate and rage input during windup', () => {
  const { w, player, skills } = world();
  w.input.wasPressed = key => key === 'KeyQ';
  skills.update(0.01, w);
  player.rageMeter = player.ultimateMeter = 100;
  w.input.wasPressed = key => ['Space', 'KeyR', 'KeyE'].includes(key);
  player.update(0.1, w.input, 0, 0);
  skills.update(0.1, w);
  assert.equal(player.abilityCastKind, 'active-gravity-breaker');
  assert.equal(player.dashTime, 0);
  assert.equal(player.ultimateMeter, 100);
  assert.ok(player.rageActive > 0);
  assert.ok(player.actionTimer > 0.5);
});

test('Titan R has no early damage and hits on the landing frame', () => {
  const { w, player, hits, skills } = world();
  player.ultimateMeter = 100;
  w.input.wasPressed = key => key === 'KeyR';
  skills.update(0.01, w);
  assert.equal(hits.length, 0);
  assert.ok(player.invulnerable >= TITAN_FALL_IMPACT);
  w.input.wasPressed = () => false;
  skills.update(TITAN_FALL_IMPACT - 0.01, w);
  assert.equal(hits.length, 0);
  skills.update(0.011, w);
  assert.ok(hits.length > 0);
  assert.ok(hits.every(h => h.source === 'ultimate-titanfall'));
  assert.equal(titanActionFrame(TITAN_FALL_IMPACT, true), 4);
});

test('all area skill candidates use real circular distance including target radius', () => {
  assert.equal(inDamageCircle(0, 0, 100, { x: 109, y: 0, radius: 10 }), true);
  assert.equal(inDamageCircle(0, 0, 100, { x: 100, y: 100, radius: 10 }), false);
  const { w, skills, enemy, far, hits } = world('nyra-sol');
  w.input.wasPressed = key => key === 'KeyQ';
  skills.update(0.01, w);
  assert.deepEqual(hits.map(h => h.e), [enemy]);
  assert.equal(far.status.stunTime, 0);
});

test('Mira keeps early rewards but cannot gain unbounded damage from a long run', () => {
  assert.equal(miraKillDamageBonus(2), 0.01);
  assert.equal(miraKillDamageBonus(100), 0.5);
  assert.ok(miraKillDamageBonus(400) > 0.8);
  assert.ok(miraKillDamageBonus(5000) <= 1);
  assert.ok(miraKillDamageBonus(401) - miraKillDamageBonus(400) < 0.005);
});

test('terrain remains the same after a floating-origin rebase', () => {
  const terrain = new TerrainSystem(stages[0]);
  const viewport = { width: 1440, height: 900 };
  terrain.update(33000, 400, viewport);
  const before = terrain.features().map(f => ({ ...f }));
  terrain.rebase(32704, 0);
  terrain.update(296, 400, viewport);
  assert.deepEqual(terrain.features().map(f => ({ ...f, x: f.x + 32704 })), before);
});

test('an actor at the exact obstacle center resolves to a finite outside position', () => {
  const terrain = new TerrainSystem(stages[0]);
  terrain.update(800, 800, { width: 1000, height: 700 });
  const feature = terrain.features().find(f => f.kind !== 'water');
  const actor = { x: feature.x, y: feature.y, vx: 0, vy: 0, radius: 18 };
  assert.equal(terrain.resolveActor(actor), true);
  assert.ok(Number.isFinite(actor.x));
  assert.ok(Math.hypot(actor.x - feature.x, actor.y - feature.y) >= feature.radius + actor.radius - 0.001);
});

test('homing can turn toward a target directly behind the projectile', () => {
  const { w, enemy } = world();
  enemy.x = -100;
  const p = w.projectiles.spawn({ x: 0, y: 0, vx: 100, vy: 0, damage: 1, radius: 2, life: 4, homing: 3 });
  for (let i = 0; i < 80; i++) w.projectiles.update(0.01, w);
  assert.ok(p.vx < 0, 'a 180-degree initial offset must not trap the steering direction');
});

test('level-one poison bloom is placed over the target it selects', () => {
  const { w, enemy } = world('zarek');
  const system = new WeaponSystem(data);
  system.equipPrimaryWeapon('venom-bloom');
  system.update(0.2, w);
  const bloom = w.projectiles.pool.allItems().find(p => p.active);
  assert.ok(bloom && inDamageCircle(bloom.x, bloom.y, bloom.radius, enemy));
});

test('boss death clears queued hazards without dealing postmortem damage', () => {
  const { w } = world();
  let hits = 0;
  w.damagePlayer = () => hits++;
  const boss = new BossSystem();
  const enemy = Object.assign(new Enemy(), { active: true, config: { id: 'lord-infernus' } });
  boss.setBoss(enemy);
  boss.createTelegraph(0, 0, 100, 0.01, 100, 'circle');
  enemy.active = false;
  boss.update(0.1, w);
  assert.equal(hits, 0);
  assert.equal(boss.telegraphs.allItems().filter(t => t.active).length, 0);
});

test('production animation atlases contain real transparent pixels and distinct frames', async () => {
  for (const name of ['boss-motion', 'boss-impact', 'titan-actions']) {
    const path = `public/assets/generated/combat-v8/${name}.png`;
    const metadata = await sharp(path).metadata();
    const stats = await sharp(path).stats();
    assert.equal(metadata.hasAlpha, true, name);
    assert.equal(stats.channels[3].min, 0, name);
    assert.ok(stats.channels[3].max > 240, name);
    const width = Math.floor(metadata.width / 6);
    const a = await sharp(path).extract({ left: 0, top: 0, width, height: 200 }).raw().toBuffer();
    const b = await sharp(path).extract({ left: width, top: 0, width, height: 200 }).raw().toBuffer();
    assert.notDeepEqual(a, b, `${name} must change poses rather than repeat one image`);
  }
});
