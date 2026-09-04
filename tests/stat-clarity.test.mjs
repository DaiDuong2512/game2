import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { InputManager } from '../dist/src/core/InputManager.js';
import { GameManager } from '../dist/src/game/GameManager.js';
import {
  BONUS_PROJECTILE_STAT_SHARD_CHANCE,
  rollStatShardStat,
} from '../dist/src/game/LootSystem.js';
import { PlayerStats } from '../dist/src/game/PlayerStats.js';
import {
  formatPlayerStatTransition,
  formatPlayerStatValue,
} from '../dist/src/ui/StatPresentation.js';

const root = new URL('../', import.meta.url);

test('chỉ số dùng đơn vị chính xác và cùng một định dạng Việt hóa', () => {
  assert.equal(formatPlayerStatValue('damage', 1.1234), '112,34%');
  assert.equal(formatPlayerStatValue('armor', 3.5), '3,5 điểm');
  assert.equal(formatPlayerStatValue('bonusProjectiles', 2.9), '2 tia');
  assert.equal(formatPlayerStatValue('hpRegen', 0.125), '0,13 HP/giây');
  assert.equal(
    formatPlayerStatTransition('critChance', 0.1, 0.104),
    'Tỉ lệ chí mạng: 10% → 10,4%',
  );
});

test('xem trước buff khớp giá trị hiệu lực và không thay đổi build', () => {
  const stats = new PlayerStats({ maxHp: 100, armorPenetration: 0, bonusProjectiles: 0 });
  const penetration = stats.preview('armorPenetration', 0.08, 'add');
  assert.ok(Math.abs(penetration - (1 - Math.exp(-0.08))) < 1e-12);
  assert.equal(stats.get('armorPenetration'), 0, 'preview không được áp buff thật');

  const predictedProjectiles = stats.preview('bonusProjectiles', 1.35, 'add');
  stats.apply('bonusProjectiles', 1.35, 'add');
  assert.equal(stats.get('bonusProjectiles'), predictedProjectiles);
  assert.equal(predictedProjectiles, 1, 'UI phải phản ánh số tia nguyên thực sự có hiệu lực');
});

test('TAB tạo cạnh nhấn, chặn đổi focus trình duyệt và không tự lặp khi giữ', () => {
  const previousWindow = globalThis.window;
  const listeners = new Map();
  const canvas = {
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
  };
  globalThis.window = { addEventListener(type, listener) { listeners.set(type, listener); } };
  try {
    const input = new InputManager(canvas);
    let prevented = 0;
    const event = { code: 'Tab', preventDefault() { prevented += 1; } };
    listeners.get('keydown')(event);
    assert.equal(input.wasPressed('Tab'), true);
    assert.equal(prevented, 1);
    input.endFrame();
    listeners.get('keydown')(event);
    assert.equal(input.wasPressed('Tab'), false);
    listeners.get('keyup')({ code: 'Tab' });
    listeners.get('keydown')(event);
    assert.equal(input.wasPressed('Tab'), true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('buff +1 tia chiếm đúng nhánh 15% của mảnh chỉ số', () => {
  const probabilities = [];
  const hit = {
    chance(probability) { probabilities.push(probability); return true; },
    pick() { throw new Error('nhánh 15% không được chọn stat thường'); },
  };
  assert.equal(rollStatShardStat(hit), 'bonusProjectiles');
  assert.deepEqual(probabilities, [BONUS_PROJECTILE_STAT_SHARD_CHANCE]);
  assert.equal(BONUS_PROJECTILE_STAT_SHARD_CHANCE, 0.15);

  let ordinaryPool = [];
  const miss = {
    chance() { return false; },
    pick(items) { ordinaryPool = [...items]; return items[0]; },
  };
  assert.equal(rollStatShardStat(miss), 'damage');
  assert.ok(!ordinaryPool.includes('bonusProjectiles'), 'tia không được nhận thêm xác suất từ pool 85%');
});

test('toast mảnh chỉ số báo giá trị cũ sang mới và ghi rõ tỉ lệ tia', () => {
  const messages = [];
  const player = {
    stats: new PlayerStats({ maxHp: 100, critChance: 0.1, bonusProjectiles: 0 }),
    health: 100,
    statShards: 0,
    syncMaxHp() {},
    heal(amount) { this.health = Math.min(this.stats.get('maxHp'), this.health + amount); },
  };
  const harness = {
    player,
    runStats: { statShards: 0 },
    toast(message) { messages.push(message); },
  };

  GameManager.prototype.applyStatShard.call(harness, 'critChance');
  assert.match(messages.at(-1), /Tỉ lệ chí mạng: 10% → 10,4%/u);
  GameManager.prototype.applyStatShard.call(harness, 'bonusProjectiles');
  assert.match(messages.at(-1), /Tia đạn cộng thêm: 0 tia → 1 tia · tỉ lệ xuất hiện 15%/u);
  assert.equal(player.statShards, 2);
  assert.equal(harness.runStats.statShards, 2);
});

test('HUD có bảng chi tiết, điều khiển TAB và layout cảm ứng', async () => {
  const [ui, game, css] = await Promise.all([
    readFile(new URL('src/ui/UIManager.ts', root), 'utf8'),
    readFile(new URL('src/game/GameManager.ts', root), 'utf8'),
    readFile(new URL('src/styles.css', root), 'utf8'),
  ]);
  assert.match(ui, /id="character-stats-panel"/u);
  assert.match(ui, /aria-controls="character-stats-panel"/u);
  assert.match(ui, /PLAYER_STAT_GROUPS/u);
  assert.match(ui, /statBoostEffect\(option\)/u);
  assert.match(ui, /starterBuffEffect\(option\)/u);
  assert.match(game, /wasPressed\('Tab'\).*toggleCharacterStats/u);
  assert.match(css, /\.character-stats-panel\s*\{/u);
  assert.match(css, /\.hud-stats-toggle\s*\{/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.character-stats-panel/u);
});
