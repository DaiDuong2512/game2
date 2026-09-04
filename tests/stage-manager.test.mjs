import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCELERATED_STAGE_DURATION,
  FINAL_ENCOUNTER_PROGRESS,
  REGULAR_ENEMY_PHASE_DURATION,
  StageManager,
  regularStageDuration,
} from '../dist/src/game/StageManager.js';

const stage = {
  id: 'glassward-verge',
  index: 1,
  name: 'Rìa Cõi Thủy Tinh',
  duration: 150,
  waveCount: 4,
  bossId: null,
  eliteId: 'storm-herald',
};

function finishOpeningIntermission(manager) {
  manager.update(1.5);
  assert.equal(manager.intermission, 0);
}

test('giai đoạn đánh quái thường kéo dài khoảng ba phút rưỡi', () => {
  const manager = new StageManager();
  manager.start(stage);

  assert.equal(REGULAR_ENEMY_PHASE_DURATION, 210);
  assert.equal(manager.duration, regularStageDuration(stage.duration));
  assert.equal(manager.duration, 234);
  assert.equal(manager.accelerated, false);
  assert.equal(manager.remaining(), 234);
});

test('mục tiêu cuối chỉ xuất hiện ở 90% thời lượng, không phải ngay đầu đợt cuối', () => {
  const manager = new StageManager();
  manager.start(stage);
  finishOpeningIntermission(manager);

  const beforeFinale = manager.update(manager.duration * FINAL_ENCOUNTER_PROGRESS - 0.01);
  assert.equal(manager.wave, stage.waveCount);
  assert.equal(beforeFinale.shouldSpawnFinal, false);

  const finale = manager.update(0.02);
  assert.equal(finale.shouldSpawnFinal, true);
  assert.equal(manager.elapsed >= REGULAR_ENEMY_PHASE_DURATION, true);
});

test('chế độ tăng tốc vẫn giữ đúng tỉ lệ các đợt và mốc giao tranh cuối', () => {
  const manager = new StageManager();
  manager.start(stage, true);
  finishOpeningIntermission(manager);

  assert.equal(manager.duration, ACCELERATED_STAGE_DURATION);
  assert.equal(manager.accelerated, true);

  const beforeFinale = manager.update(ACCELERATED_STAGE_DURATION * FINAL_ENCOUNTER_PROGRESS - 0.01);
  assert.equal(beforeFinale.shouldSpawnFinal, false);
  assert.equal(manager.wave, stage.waveCount);
  assert.equal(manager.update(0.02).shouldSpawnFinal, true);
});

test('mục tiêu cuối không thể được yêu cầu sinh lần hai', () => {
  const manager = new StageManager();
  manager.start(stage);
  finishOpeningIntermission(manager);
  assert.equal(manager.update(manager.duration).shouldSpawnFinal, true);

  manager.eliteSpawned = true;
  assert.equal(manager.update(1).shouldSpawnFinal, false);
});
