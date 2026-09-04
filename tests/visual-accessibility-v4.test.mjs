import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('marker địch chỉ dành cho elite/boss để giảm nhiễu thị giác', async () => {
  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');

  assert.match(
    renderer,
    /if \(enemy\.isBoss \|\| enemy\.isElite\) \{\s*this\.drawEnemyMarker\(enemy,/u,
    'marker lớn phải được giới hạn cho elite và boss',
  );
  assert.doesNotMatch(
    renderer,
    /#ff8f80/u,
    'không được khôi phục tam giác đỏ trên mọi quái thường',
  );
  assert.match(
    renderer,
    /ctx\.fillStyle = '#ff7869';\s*ctx\.fillRect\(-enemy\.radius - 2,/u,
    'quái thường vẫn cần gạch chân hình học để phân biệt phe, không chỉ dựa vào màu sprite',
  );
});

test('elite, boss và đạn địch giữ mã hình học không phụ thuộc riêng vào màu', async () => {
  const renderer = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');

  assert.match(renderer, /if \(enemy\.isBoss\) \{[\s\S]*?centerX - 10[\s\S]*?centerX \+ 6/u);
  assert.match(renderer, /else if \(enemy\.isElite\) \{[\s\S]*?centerX - 10[\s\S]*?centerY - 3/u);
  assert.match(renderer, /scene\.settings\.colorBlindMode === 'off' \? '#ff674e' : '#ffe36c'/u);
  assert.match(renderer, /this\.drawCornerBrackets\(x, y, arm/u);
});
