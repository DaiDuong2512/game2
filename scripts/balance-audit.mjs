import { readFile, writeFile } from 'node:fs/promises';
import { Player } from '../dist/src/game/Player.js';
import { Enemy } from '../dist/src/game/Entities.js';
import { WeaponSystem } from '../dist/src/game/WeaponSystem.js';
import { ProjectileSystem } from '../dist/src/game/ProjectileSystem.js';
import { SpatialHash } from '../dist/src/core/SpatialHash.js';
import { RNG } from '../dist/src/core/RNG.js';
import { createDefaultSave } from '../dist/src/core/SaveSystem.js';

const weapons = JSON.parse(await readFile('public/data/weapons.json', 'utf8'));
const characters = JSON.parse(await readFile('public/data/characters.json', 'utf8'));
const data = { weaponById: new Map(weapons.map(w => [w.id, w])), evolutionById: new Map() };
const noop = () => {};
const particles = new Proxy({}, { get: () => noop });

// Fixed 60 s, 120 Hz, no crit/armor/passives/DoT, identical player stats.
// This measures direct delivery, not total build strength or real player win rate.
function measure(weapon, level, count) {
  const player = new Player({ ...characters[0], id: 'audit', startWeapon: weapon.id,
    passive: { kind: 'none', value: 0 } }, [], createDefaultSave());
  player.effectiveDamageMultiplier = () => 1;
  player.effectiveAttackSpeed = () => 1;
  const enemies = Array.from({ length: count }, (_, i) => Object.assign(new Enemy(), {
    active: true, x: count === 1 ? 100 : Math.cos(i / count * Math.PI * 2) * 100,
    y: count === 1 ? 0 : Math.sin(i / count * Math.PI * 2) * 100, radius: 18,
    health: 10000, maxHealth: 10000,
  }));
  const spatial = new SpatialHash();
  spatial.rebuild(enemies);
  const system = new WeaponSystem(data);
  system.equipPrimaryWeapon(weapon.id);
  for (let i = 1; i < level; i++) system.levelWeapon(weapon.id);
  let damage = 0;
  const world = { player, enemies, enemySpatial: spatial, rng: new RNG(1337), particles,
    audio: { play: noop }, autoAim: true, screenShake: noop, damagePlayer: noop,
    projectiles: new ProjectileSystem(),
    nearestEnemy(x, y, range, excluded) {
      let target = null, best = range ** 2;
      for (const e of enemies) {
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (!excluded?.has(e.id) && d <= best) { target = e; best = d; }
      }
      return target;
    },
    damageEnemy(_enemy, value, _element, _source, _status, _knockback, _crit, _x, _y, effect) {
      // Cloud contact refreshes a DoT instead of applying damage each frame.
      const applied = effect?.kind === 'poison-cloud' ? 0 : value;
      damage += applied;
      return { amount: applied, critical: false, killed: false };
    },
  };
  world.rng.chance = () => false;
  for (let frame = 0; frame < 7200; frame++) {
    system.update(1 / 120, world);
    world.projectiles.update(1 / 120, world);
  }
  return Number((damage / 60).toFixed(2));
}
const rows = weapons.map(w => ({ weapon: w.id, level1Single: measure(w, 1, 1),
  level1Crowd: measure(w, 1, 12), level8Single: measure(w, 8, 1), level8Crowd: measure(w, 8, 12) }));
console.table(rows);
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify({
  conditions: '60s, 120Hz, stationary targets 100 units away, 18 radius; normalized damage/attack speed, no crit, armor, DoT, passive or terrain. Smoke uses DoT only: zero direct DPS is expected.', rows,
}, null, 2));
