import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  RANGED_ENEMY_SPAWN_MULTIPLIER,
  directorChoiceWeight,
} from '../dist/src/game/Director.js';

const root = new URL('../', import.meta.url);

test('ranged projectile enemies receive exactly half their previous selection weight', () => {
  assert.equal(RANGED_ENEMY_SPAWN_MULTIPLIER, 0.5);
  const common = { cost: 4, radius: 16, sizeClass: 'medium' };
  for (const ai of ['ranged', 'sniper', 'mage']) {
    const expectedWithoutReduction = Math.pow(common.cost, -0.72) * 0.52 * 1.25;
    assert.ok(Math.abs(
      directorChoiceWeight({ ...common, ai }, 1, 4) - expectedWithoutReduction * 0.5,
    ) < 1e-12, `${ai} must be reduced by 50%`);
  }
});

test('boss and boss ability atlases are real transparent PNG assets wired into rendering', async () => {
  const characterAtlas = await readFile(new URL('public/assets/generated/bosses-v2/boss-character-atlas-v2.png', root));
  const abilityAtlas = await readFile(new URL('public/assets/generated/bosses-v2/boss-ability-atlas-v1.png', root));
  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');
  const main = await readFile(new URL('src/main.ts', root), 'utf8');

  for (const png of [characterAtlas, abilityAtlas]) {
    assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71], 'asset must use a PNG container');
    assert.equal(png[25], 6, 'PNG must be RGBA instead of a baked checkerboard RGB image');
  }
  for (const id of ['void-devourer', 'iron-behemoth', 'frost-queen', 'lord-infernus']) {
    assert.match(renderer, new RegExp(`'${id}':\\s*\\d`, 'u'));
  }
  assert.match(renderer, /drawBossCharacterFrame\(bossAtlas/u);
  assert.match(renderer, /drawBossAbilityFrame\(telegraph\.bossId, 0/u);
  assert.match(renderer, /getAbilityVisuals\(\)/u);
  assert.match(main, /boss-character-atlas-v2\.png/u);
  assert.match(main, /boss-ability-atlas-v1\.png/u);
});

test('boss telegraphs retain boss identity so each cast uses its own atlas column', async () => {
  const bossSystem = await readFile(new URL('src/game/BossSystem.ts', root), 'utf8');
  const entities = await readFile(new URL('src/game/Entities.ts', root), 'utf8');
  assert.match(bossSystem, /telegraph\.bossId = this\.boss\?\.config\.id/u);
  assert.match(bossSystem, /pushAbilityVisual\(telegraph\.bossId/u);
  assert.match(entities, /public bossId = ''/u);
});

test('first campaign boss and its portal ability use dedicated transparent production assets', async () => {
  const boss = await readFile(new URL('public/assets/generated/bosses-v3/void-devourer-v3.png', root));
  const ability = await readFile(new URL('public/assets/generated/bosses-v3/void-devourer-ability-v2.png', root));
  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');
  const main = await readFile(new URL('src/main.ts', root), 'utf8');

  for (const png of [boss, ability]) {
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, 'dedicated boss art must retain RGBA transparency');
  }
  assert.match(renderer, /VOID_DEVOURER_SPRITE_PATH[\s\S]*?void-devourer-v3\.png/u);
  assert.match(renderer, /VOID_DEVOURER_ABILITY_PATH[\s\S]*?void-devourer-ability-v2\.png/u);
  assert.match(renderer, /drawSpawnPortals\(scene\)/u);
  assert.match(main, /void-devourer-v3\.png/u);
  assert.match(main, /void-devourer-ability-v2\.png/u);
});
