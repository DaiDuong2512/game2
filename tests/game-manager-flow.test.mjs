import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager, resolveQaModes } from '../dist/src/game/GameManager.js';

test('QA audit giữ nhịp thật; chỉ cờ fast tường minh mới tăng tốc', () => {
  assert.deepEqual(resolveQaModes('?qa=1'), { qaMode: true, fastQaPacing: false });
  assert.deepEqual(resolveQaModes('?qa=1&fast=1'), { qaMode: true, fastQaPacing: true });
  assert.deepEqual(resolveQaModes('?fast=1'), { qaMode: false, fastQaPacing: false });
});

test('HUD dùng mục tiêu sinh tồn thật và đồng bộ đợt hiện tại', () => {
  const objectives = [];
  const context = {
    activeBriefing: {
      objectives: [
        'Sống sót qua 5 đợt',
        'Mục tiêu cốt truyện không được runtime theo dõi',
        'Hạ mục tiêu cuối',
      ],
    },
    stageManager: {
      stage: { waveCount: 5 },
      wave: 1,
    },
    ui: {
      setHUDObjective: (objective) => objectives.push(objective),
    },
  };

  GameManager.prototype.syncSurvivalObjective.call(context);
  context.stageManager.wave = 3;
  GameManager.prototype.syncSurvivalObjective.call(context);

  assert.deepEqual(objectives, [
    'Sống sót qua 5 đợt — Đợt hiện tại 1/5',
    'Sống sót qua 5 đợt — Đợt hiện tại 3/5',
  ]);
  assert.ok(objectives.every((objective) => !objective.includes('không được runtime theo dõi')));
});

test('giao tranh cuối cùng khung hình với đổi đợt chỉ phát một cue boss đầy đủ', () => {
  const audio = [];
  let blessingGranted = 0;
  const enemy = {
    config: { id: 'void-devourer', name: 'Kẻ Nuốt Hư Không' },
    isElite: false,
    isFinalEncounter: false,
  };
  const context = {
    stageManager: {
      stage: { bossId: 'void-devourer', eliteId: 'riftling', index: 5 },
      bossSpawned: false,
      eliteSpawned: false,
      scaling: () => ({ health: 1, damage: 1, speed: 1, spawnRate: 1 }),
      wave: 5,
    },
    player: { x: 0, y: 0, grantBossBlessing: () => { blessingGranted += 1; } },
    spawner: { spawnAround: () => enemy },
    renderer: { size: () => ({ width: 1600, height: 900 }) },
    boss: { setBoss: () => {} },
    narrative: { triggerFinalEncounter: () => null },
    ui: { setHUDObjective: () => {} },
    audio: { play: (...args) => audio.push(args) },
    toast: () => {},
    camera: { addShake: () => {} },
    spawnFinalEncounter: GameManager.prototype.spawnFinalEncounter,
    syncSurvivalObjective: () => {
      throw new Error('Không được cập nhật mục tiêu đợt khi giao tranh cuối bắt đầu.');
    },
  };

  GameManager.prototype.handleStageAnnouncements.call(context, {
    waveChanged: true,
    shouldSpawnFinal: true,
  });

  assert.deepEqual(audio, [['boss', 1]]);
  assert.equal(enemy.isFinalEncounter, true);
  assert.equal(context.stageManager.bossSpawned, true);
  assert.equal(blessingGranted, 1);
});

test('đổi đợt thông thường vẫn phát cue nền nhẹ và cập nhật HUD', () => {
  const events = [];
  const context = {
    stageManager: { wave: 3 },
    audio: { play: (...args) => events.push(['audio', ...args]) },
    syncSurvivalObjective: () => events.push(['objective']),
    toast: (message) => events.push(['toast', message]),
    spawnFinalEncounter: () => {
      throw new Error('Không được sinh giao tranh cuối ở đổi đợt thông thường.');
    },
  };

  GameManager.prototype.handleStageAnnouncements.call(context, {
    waveChanged: true,
    shouldSpawnFinal: false,
  });

  assert.deepEqual(events, [
    ['audio', 'boss', 0.25],
    ['objective'],
    ['toast', 'Đợt 3 — mật độ kẻ địch tăng'],
  ]);
});
