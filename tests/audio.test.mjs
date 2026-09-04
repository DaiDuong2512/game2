import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_SKILL_ACCENTS,
  RAGE_SOUND_CUES,
  SOUND_IDS,
  SOUND_PROFILES,
  SoundVoiceBudget,
  ULTIMATE_SOUND_CUES,
} from '../dist/src/core/AudioManager.js';
import { SpatialHash } from '../dist/src/core/SpatialHash.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { EnemySystem } from '../dist/src/game/EnemySystem.js';
import { ProjectileSystem, signatureHitSound } from '../dist/src/game/ProjectileSystem.js';
import { weaponFireSound } from '../dist/src/game/WeaponSystem.js';

test('sound bank exposes distinct feedback cues for the key combat actions', () => {
  const required = ['dash', 'skill', 'rage', 'ultimate', 'lightning', 'fire', 'shield', 'boss-warning'];
  for (const id of required) {
    assert.ok(SOUND_IDS.includes(id), `missing sound id ${id}`);
    assert.ok(SOUND_PROFILES[id], `missing sound profile ${id}`);
  }

  const signatures = required.map((id) => {
    const profile = SOUND_PROFILES[id];
    return JSON.stringify({
      duration: profile.duration,
      tones: profile.tones.map((tone) => [tone.type, tone.frequency, tone.endFrequency ?? tone.frequency]),
      noise: profile.noise ? [profile.noise.filter, profile.noise.frequency] : null,
    });
  });
  assert.equal(new Set(signatures).size, required.length, 'key cues must not share the same synthesis recipe');
  assert.equal(SOUND_PROFILES.rage.priority, 5);
  assert.equal(SOUND_PROFILES.ultimate.priority, 5);
  assert.equal(SOUND_PROFILES['boss-warning'].priority, 5);
});

test('every procedural layer ends inside its declared logical voice duration', () => {
  for (const id of SOUND_IDS) {
    const profile = SOUND_PROFILES[id];
    assert.ok(profile.duration > 0);
    assert.ok(profile.cooldownMs >= 0);
    assert.ok(profile.gain > 0 && profile.gain <= 0.5, `${id} output gain should leave headroom`);
    for (const tone of profile.tones) {
      assert.ok((tone.delay ?? 0) + tone.duration <= profile.duration, `${id} tone exceeds voice duration`);
      assert.ok(tone.frequency > 0);
      assert.ok((tone.endFrequency ?? tone.frequency) > 0);
    }
    if (profile.noise) {
      assert.ok((profile.noise.delay ?? 0) + profile.noise.duration <= profile.duration, `${id} noise exceeds voice duration`);
    }
  }
});

test('v4 sound identity covers every weapon and status signature without external audio assets', () => {
  const required = [
    'slash', 'bleed', 'bow', 'slow', 'arcane', 'stun', 'fire', 'burn-tick', 'lightning',
    'poison-throw', 'poison-cloud', 'poison-tick', 'poison-expire', 'class-skill',
    'rage-start', 'rage-loop', 'rage-end', 'ultimate-cast', 'ultimate-regen',
  ];
  for (const id of required) {
    assert.ok(SOUND_IDS.includes(id), `missing v4 cue ${id}`);
    assert.ok(SOUND_PROFILES[id].tones.length > 0 || SOUND_PROFILES[id].noise, `${id} must be synthesized locally`);
  }

  const poisonSignatures = ['poison-throw', 'poison-cloud', 'poison-tick', 'poison-expire'].map((id) => {
    const profile = SOUND_PROFILES[id];
    return JSON.stringify([profile.duration, profile.tones.map((tone) => [tone.type, tone.frequency, tone.endFrequency]), profile.noise?.filter]);
  });
  assert.equal(new Set(poisonSignatures).size, poisonSignatures.length, 'poison lifecycle needs distinct throw/cloud/tick/expire sounds');
  assert.ok(SOUND_PROFILES['burn-tick'].gain <= 0.18, 'repeating burn ticks should remain subtle');
  assert.ok(SOUND_PROFILES['poison-tick'].gain <= 0.18, 'repeating poison ticks should remain subtle');
});

test('semantic Q/E/R routing is complete and critical phases keep priority', () => {
  assert.deepEqual(Object.keys(CLASS_SKILL_ACCENTS).sort(), [
    'astral-fold', 'echo-pack', 'frost-ruin', 'gale-volley', 'gravity-breaker',
    'hemotoxic-draw', 'rift-blooddraw', 'sanctuary-guard',
  ]);
  for (const cue of Object.values(CLASS_SKILL_ACCENTS)) assert.ok(SOUND_IDS.includes(cue));
  assert.deepEqual(RAGE_SOUND_CUES, { start: 'rage-start', loop: 'rage-loop', end: 'rage-end' });
  assert.deepEqual(ULTIMATE_SOUND_CUES, { cast: 'ultimate-cast', regen: 'ultimate-regen' });
  assert.equal(SOUND_PROFILES[RAGE_SOUND_CUES.start].priority, 5);
  assert.equal(SOUND_PROFILES[ULTIMATE_SOUND_CUES.cast].priority, 5);
  assert.ok(SOUND_PROFILES[RAGE_SOUND_CUES.loop].gain < SOUND_PROFILES[RAGE_SOUND_CUES.start].gain);
  assert.ok(SOUND_PROFILES[ULTIMATE_SOUND_CUES.regen].gain < SOUND_PROFILES[ULTIMATE_SOUND_CUES.cast].gain);
});

test('weapon fire and signature-hit routers select one specialized cue', () => {
  assert.equal(weaponFireSound({ behavior: 'slash', element: 'physical' }), 'slash');
  assert.equal(weaponFireSound({ behavior: 'bow', element: 'physical' }), 'bow');
  assert.equal(weaponFireSound({ behavior: 'lightning', element: 'lightning' }), 'lightning');
  assert.equal(weaponFireSound({ behavior: 'fireball', element: 'fire' }), 'fire');
  assert.equal(weaponFireSound({ behavior: 'poison-bomb', element: 'poison' }), 'poison-throw');
  assert.equal(weaponFireSound({ behavior: 'poison', element: 'poison' }), 'poison-cloud');
  assert.equal(weaponFireSound({ behavior: 'laser', element: 'arcane' }), 'arcane');
  assert.equal(weaponFireSound({ behavior: 'gun', element: 'physical' }), 'shoot');

  assert.equal(signatureHitSound({ kind: 'bleed', duration: 3, chance: 1 }), 'bleed');
  assert.equal(signatureHitSound({ kind: 'slow', duration: 1, chance: 1 }), 'slow');
  assert.equal(signatureHitSound({ kind: 'stun', duration: 0.3, chance: 1 }), 'stun');
  assert.equal(signatureHitSound({ kind: 'poison-cloud', duration: 3, chance: 1 }), null);
  assert.equal(signatureHitSound(undefined), null);
});

test('poison bomb deployment and projectile signature hit reach gameplay audio', () => {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.x = 28;
  enemy.y = 0;
  enemy.radius = 5;
  const enemySpatial = new SpatialHash(64);
  enemySpatial.rebuild([enemy]);
  const cues = [];
  const world = {
    player: { x: 1000, y: 1000, radius: 10 },
    enemies: [enemy],
    enemySpatial,
    rng: { chance: () => false },
    audio: { play: (id) => cues.push(id) },
    particles: { spawn: () => null, burst: () => {}, ring: () => {} },
    damageEnemy: (_enemy, damage, _element, _source, _chance, _knockback, critical) => ({ amount: damage, critical, killed: false }),
    damagePlayer: () => {},
    nearestEnemy: () => null,
  };
  const projectiles = new ProjectileSystem();
  projectiles.spawn({
    sourceWeaponId: 'test-arrow', element: 'physical', x: 0, y: 0, vx: 200, vy: 0,
    damage: 10, radius: 3, life: 1, maxRange: 100, trail: false,
    hitEffect: { kind: 'slow', duration: 1, chance: 1 },
  });
  projectiles.update(0.2, world);
  assert.ok(cues.includes('slow'), 'a slow arrow hit must play its status signature');

  projectiles.spawn({
    sourceWeaponId: 'toxic-smoke-bomb', element: 'poison', x: 0, y: 0, vx: 0, vy: 0,
    damage: 0, radius: 4, life: 0, maxRange: 1, trail: false,
    deployAreaDuration: 3, deployAreaRadius: 80, deployAreaDamage: 18,
    deployAreaHitEffect: { kind: 'poison-cloud', duration: 3, chance: 1 },
  });
  projectiles.update(0.01, world);
  assert.equal(cues.filter((cue) => cue === 'poison-cloud').length, 1, 'cloud expansion plays once when the canister deploys');
});

test('enemy damage-over-time ticks and poison expiry emit throttled semantic cues', () => {
  const enemy = new Enemy();
  enemy.active = true;
  enemy.health = 1000;
  enemy.maxHealth = 1000;
  enemy.status.bleedTime = 1;
  enemy.status.bleedDps = 0.01;
  enemy.status.bleedTick = 0;
  enemy.status.burnTime = 1;
  enemy.status.burnDps = 2;
  enemy.status.burnPercent = 0.001;
  enemy.status.burnTick = 0;
  enemy.status.poisonTime = 0.1;
  enemy.status.poisonDps = 3;
  enemy.status.poisonCloudTime = 0.1;
  enemy.status.poisonCloudDps = 4;
  enemy.status.poisonCloudPercent = 0.03;
  enemy.status.poisonCloudTick = 0;
  const cues = [];
  const system = new EnemySystem();
  const world = {
    audio: { play: (id) => cues.push(id) },
    rng: { chance: () => false, float: (minimum) => minimum },
    particles: { spawn: () => null },
    damageStatus: () => false,
    killEnemy: () => {},
  };

  system.updateStatuses(enemy, 0.2, world);

  assert.ok(cues.includes('bleed'));
  assert.ok(cues.includes('burn-tick'));
  assert.equal(cues.filter((cue) => cue === 'poison-tick').length, 1, 'legacy and cloud poison share a source throttle');
  assert.ok(cues.includes('poison-expire'), 'expiry plays on the transition out of all poison states');
});

test('voice budget throttles repeated elemental spam and lets it recover', () => {
  const budget = new SoundVoiceBudget();
  const first = budget.reserve('lightning', 1000);
  assert.ok(first);
  assert.equal(budget.reserve('lightning', 1020), null, 'same cue inside cooldown must be dropped');
  assert.ok(budget.reserve('lightning', 1058), 'cue should recover at the documented cooldown');
});

test('voice budget caps burst starts but never hides a critical ability cue', () => {
  const budget = new SoundVoiceBudget(12, 2, 48);
  assert.ok(budget.reserve('shoot', 0));
  assert.ok(budget.reserve('hit', 0));
  assert.equal(budget.reserve('fire', 1), null, 'low-priority third sound in the same frame should be dropped');
  assert.ok(budget.reserve('ultimate', 1), 'ultimate must bypass the low-priority burst cap');
});

test('ultimate remains audible when pressed in the same frame as dash', () => {
  const budget = new SoundVoiceBudget();
  assert.ok(budget.reserve('dash', 0));
  assert.ok(budget.reserve('ultimate', 0), 'critical cue must bypass a lower-priority group cooldown');
});

test('new rage and ultimate cues survive a crowded weapon frame', () => {
  const budget = new SoundVoiceBudget(12, 2, 48);
  assert.ok(budget.reserve('shoot', 0));
  assert.ok(budget.reserve('hit', 0));
  assert.equal(budget.reserve('poison-tick', 1), null);
  assert.ok(budget.reserve('rage-start', 1), 'rage activation must bypass the burst cap');
  assert.ok(budget.reserve('ultimate-cast', 1), 'ultimate cast must bypass the burst cap');
});

test('high priority cue preempts the weakest voice when the budget is full', () => {
  const budget = new SoundVoiceBudget(2, 10, 48);
  const shot = budget.reserve('shoot', 0);
  const fire = budget.reserve('fire', 0);
  assert.ok(shot);
  assert.ok(fire);
  const warning = budget.reserve('boss-warning', 1);
  assert.ok(warning);
  assert.equal(warning.preemptToken, shot.token);
  assert.equal(budget.activeCount(1), 2);
});
