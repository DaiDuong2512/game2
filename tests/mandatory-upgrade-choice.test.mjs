import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/ui/UIManager.ts', import.meta.url), 'utf8');
const manager = await readFile(new URL('../src/game/GameManager.ts', import.meta.url), 'utf8');

test('level-up is mandatory and cannot discard its pending choice', () => {
  assert.doesNotMatch(ui, /id="skip-upgrade"|Bỏ qua ·/u);
  assert.doesNotMatch(manager, /skipUpgrade\s*\(/u);
  assert.match(ui, /event\.code === 'Escape'[\s\S]*?preventDefault\(\)[\s\S]*?stopPropagation\(\)/u);
});

test('level-up supports direct number selection and arrow plus Enter navigation', () => {
  assert.match(ui, /'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'/u);
  assert.match(ui, /event\.code === 'ArrowRight' \|\| event\.code === 'KeyD'/u);
  assert.match(ui, /event\.code === 'ArrowLeft' \|\| event\.code === 'KeyA'/u);
  assert.match(ui, /event\.code === 'Enter'/u);
  assert.match(ui, /cards\[selectedIndex\]\?\.click\(\)/u);
  assert.match(ui, /bindChoiceKeyboard\('\[data-starter\]', 'starting-loadout'\)/u);
});
