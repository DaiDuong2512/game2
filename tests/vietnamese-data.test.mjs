import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { Player } from '../dist/src/game/Player.js';

const dataFiles = [
  'characters.json',
  'weapons.json',
  'passives.json',
  'evolutions.json',
  'enemies.json',
  'stages.json',
  'upgrades.json',
  'meta-upgrades.json',
];

const visibleKeys = new Set(['name', 'title', 'description']);
const vietnameseLetter = /[À-ỹĐđ]/u;
const untranslatedTerms = /\b(?:damage|speed|health|armor|critical|cooldown|range|level|stage|wave|common|rare|epic|legendary|weapon|enemy|boss|locked|upgrade)\b/iu;

function collectVisibleStrings(value, path = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectVisibleStrings(item, [...path, String(index)], output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (visibleKeys.has(key)) output.push({ path: childPath.join('.'), key, value: child });
    else collectVisibleStrings(child, childPath, output);
  }
  return output;
}

test('all player-visible data strings are non-empty, valid NFC text and Vietnamese-friendly', async () => {
  let checked = 0;
  for (const file of dataFiles) {
    const parsed = JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), 'utf8'));
    const entries = collectVisibleStrings(parsed);
    assert.ok(entries.length > 0, `${file} should expose localized labels`);

    for (const entry of entries) {
      const label = `${file}:${entry.path}`;
      assert.equal(typeof entry.value, 'string', `${label} must be a string`);
      assert.ok(entry.value.trim().length > 0, `${label} must not be empty`);
      assert.equal(entry.value, entry.value.normalize('NFC'), `${label} must use normalized Unicode`);
      assert.doesNotMatch(entry.value, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u, `${label} contains invalid display characters`);

      const isCharacterProperName = file === 'characters.json' && /^\d+\.name$/.test(entry.path);
      if (!isCharacterProperName) {
        assert.match(entry.value, vietnameseLetter, `${label} should contain Vietnamese text`);
        assert.doesNotMatch(entry.value, untranslatedTerms, `${label} contains an untranslated English UI term`);
      }
      checked += 1;
    }
  }
  assert.ok(checked >= 100, `expected broad localization coverage, checked only ${checked} strings`);
});

test('entry shell and major UI states do not regress to English copy', async () => {
  const [html, uiSource, mainSource] = await Promise.all([
    readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/UIManager.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<html\s+lang=["']vi["']/u, 'the document language must be Vietnamese');
  assert.match(html, vietnameseLetter, 'the loading shell must contain Vietnamese text');
  assert.ok(!html.includes('Riftwarden: Echo Siege'), 'the browser shell must use the Vietnamese game title');
  for (const englishShellCopy of [
    'Stabilizing the frontier',
    'This game requires JavaScript',
    'Riftwarden game battlefield',
    'original action survival game',
  ]) {
    assert.ok(!html.includes(englishShellCopy), `index.html still exposes English copy: ${englishShellCopy}`);
  }

  assert.match(uiSource, vietnameseLetter, 'the UI source must contain Vietnamese copy');
  assert.ok(!uiSource.includes('Riftwarden<small>Echo Siege'), 'the visible brand must be localized');
  assert.ok(!mainSource.includes('error.message'), 'native browser errors must not leak untranslated copy into the UI');
  for (const englishUiCopy of [
    'Hold the line between collapsing worlds.',
    '>Start Run<',
    '>Permanent Upgrades<',
    '>Settings<',
    'Selected Warden',
    'Select a Stage',
    'Run Suspended',
    'Choose an Upgrade',
    '>Victory<',
    '>Run Summary<',
    'aria-label="Back"',
  ]) {
    assert.ok(!uiSource.includes(englishUiCopy), `UIManager still exposes English copy: ${englishUiCopy}`);
  }
});

test('base critical stats are standardized and permanent progression cannot raise critical stats', async () => {
  const [characters, passives, upgrades, metaUpgrades] = await Promise.all([
    readFile(new URL('../public/data/characters.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/data/passives.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/data/upgrades.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/data/meta-upgrades.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  for (const character of characters) {
    assert.equal(character.stats.critChance, 0.1, `${character.id} must start with exactly 10% critical chance`);
    assert.equal(character.stats.critDamage, 1.8, `${character.id} must start with exactly 180% critical damage`);
    const runtime = new Player(character, [], createDefaultSave());
    assert.equal(runtime.stats.get('critChance'), 0.1, `${character.id} runtime critical chance must remain exactly 10%`);
    assert.equal(runtime.effectiveCritDamage(), 1.8, `${character.id} runtime critical damage must remain exactly 180%`);
  }

  assert.ok(passives.some((item) => item.stat === 'critChance'), 'critical chance must remain obtainable during a run');
  assert.ok(upgrades.statBoosts.some((item) => item.stat === 'critChance'), 'critical upgrades must remain obtainable during a run');
  assert.ok(metaUpgrades.every((item) => item.stat !== 'critChance' && item.stat !== 'critDamage'), 'critical stats must not be permanent shop upgrades');

  const permanentPoints = createDefaultSave().permanentPoints;
  assert.ok(!('critChance' in permanentPoints) && !('critDamage' in permanentPoints), 'critical stats must not be permanent reward point categories');
});
