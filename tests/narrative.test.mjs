import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateLoreConfig } from '../dist/src/data/DataStore.js';
import { NarrativeSystem } from '../dist/src/game/NarrativeSystem.js';

async function readJson(name) {
  return JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
}

async function storyPack() {
  const [lore, stages, characters] = await Promise.all([
    readJson('lore.json'),
    readJson('stages.json'),
    readJson('characters.json'),
  ]);
  return { lore, stages, characters };
}

test('cốt truyện gồm đúng 3 hồi, 20 màn và khớp toàn bộ dữ liệu gameplay', async () => {
  const { lore, stages, characters } = await storyPack();
  assert.doesNotThrow(() => validateLoreConfig(lore, { stages, characters }));
  assert.deepEqual(lore.acts.map((act) => [act.stageStart, act.stageEnd]), [[1, 7], [8, 14], [15, 20]]);
  assert.deepEqual(lore.stages.map((story) => story.stageId), stages.map((stage) => stage.id));
  assert.ok(lore.stages.every((story) => story.objectives.length === 3));
  assert.equal(lore.characters.length, 8);
  assert.ok(lore.characters.every((character) => character.relationshipIds.length >= 2));
  for (const character of lore.characters) {
    const gameplay = characters.find((item) => item.id === character.characterId);
    if (gameplay.unlockStage === 0) assert.equal(character.recruitedAfterStageId, null);
    else {
      const recruitmentStage = stages.find((stage) => stage.id === character.recruitedAfterStageId);
      assert.equal(recruitmentStage.index, gameplay.unlockStage - 1, `${character.characterId} phải được chiêu mộ trước khi có thể chọn`);
    }
  }
  assert.ok(lore.codex.length >= 40);
  for (const story of lore.stages) {
    const expected = lore.codex
      .filter((entry) => entry.unlock.kind === 'qua-màn' && entry.unlock.targetId === story.stageId)
      .map((entry) => entry.id);
    assert.deepEqual(story.codexUnlockIds, expected, `${story.stageId} phải dùng cùng một nguồn mở khóa Thư Khố`);
  }
});

test('kiểm tra dữ liệu bắt được actId sai và loại giao tranh cuối sai', async () => {
  const { lore, stages, characters } = await storyPack();
  const wrongAct = structuredClone(lore);
  wrongAct.stages[0].actId = 'bao-hu-khong';
  assert.throws(
    () => validateLoreConfig(wrongAct, { stages, characters }),
    /tham chiếu sai hồi/u,
  );

  const wrongFinale = structuredClone(lore);
  wrongFinale.stages[4].finale.kind = 'elite';
  assert.throws(
    () => validateLoreConfig(wrongFinale, { stages, characters }),
    /giao tranh cuối sundered-dunes/u,
  );
});

test('NarrativeSystem phát lời dẫn giữa màn và giao tranh cuối đúng một lần', async () => {
  const { lore } = await storyPack();
  const narrative = new NarrativeSystem(lore);
  const briefing = narrative.startStage('glassward-verge', 'kael-orin');

  assert.equal(briefing.act.id, 'mo-neo-ran-vo');
  assert.equal(briefing.objectives.length, 3);
  assert.equal(briefing.transmission.kind, 'prelude');
  assert.equal(briefing.characterLine.speaker, 'Kael Orin');
  assert.deepEqual(narrative.updateProgress(0.4), []);
  assert.equal(narrative.updateProgress(0.42)[0]?.kind, 'mid-stage');
  assert.deepEqual(narrative.updateProgress(0.9), []);
  assert.equal(narrative.triggerFinalEncounter()?.kind, 'elite');
  assert.equal(narrative.triggerFinalEncounter(), null);

  const completion = narrative.completeStage();
  assert.deepEqual(completion.cues.map((cue) => cue.kind), ['victory']);
  assert.deepEqual(completion.codexUnlockIds, ['ket-gioi-vong-am', 'dai-chi-huy-thuy-tinh']);
  assert.deepEqual(completion.ending, []);
  assert.deepEqual(narrative.completeStage(), { cues: [], codexUnlockIds: [], ending: [] });
});

test('hoàn thành màn cuối trả đoạn kết chính và hậu truyện đúng nhân vật', async () => {
  const { lore } = await storyPack();
  const narrative = new NarrativeSystem(lore);
  narrative.startStage('eternal-siege', 'mira-voss');
  const result = narrative.completeStage();

  assert.deepEqual(result.cues.map((cue) => cue.kind), ['mid-stage', 'boss', 'victory']);
  assert.equal(result.ending.length, 2);
  assert.equal(result.ending[0].title, 'Bình Minh Có Tám Nhịp');
  assert.equal(result.ending[1].speaker, 'Mira Voss');
  assert.match(result.ending[1].text, /bản đồ/u);
});

test('Thư Khố lọc theo tiến trình và cho phép đọc lại mục đã mở', async () => {
  const { lore } = await storyPack();
  const narrative = new NarrativeSystem(lore);
  const start = narrative.unlockedCodex({ highestCompletedStage: 0, unlockedCharacterIds: ['kael-orin'] });
  assert.ok(start.some((entry) => entry.id === 'khe-nut'));
  assert.ok(start.some((entry) => entry.id === 'kael-orin-thu-kho'));
  assert.ok(!start.some((entry) => entry.id === 'ke-nuot-hu-khong'));

  const progressed = narrative.unlockedCodex({
    highestCompletedStage: 5,
    unlockedCharacterIds: ['kael-orin', 'mira-voss', 'toren-vale'],
  });
  assert.ok(progressed.some((entry) => entry.id === 'ke-nuot-hu-khong'));
  assert.ok(progressed.some((entry) => entry.id === 'mira-voss-thu-kho'));
  assert.equal(narrative.codexEntry('ke-nuot-hu-khong')?.title, 'Kẻ Nuốt Hư Không');
  assert.ok(narrative.relationshipsFor('nova').length >= 4);
});

test('nội dung cốt truyện hiển thị dùng tiếng Việt chuẩn hóa', async () => {
  const { lore } = await storyPack();
  const vietnamese = /[À-ỹĐđ]/u;
  const textValues = [
    lore.premise.hook,
    lore.premise.conflict,
    lore.premise.stakes,
    ...lore.acts.flatMap((act) => [act.title, act.subtitle, act.summary]),
    ...lore.stages.flatMap((stage) => [
      stage.synopsis,
      ...stage.objectives,
      stage.prelude.text,
      stage.midStage.text,
      stage.finale.text,
      stage.victory.text,
    ]),
    ...lore.characters.flatMap((character) => [
      character.motivation,
      character.innerConflict,
      character.arc,
      character.battleCry,
    ]),
    ...lore.relationships.map((relationship) => relationship.description),
    ...lore.codex.flatMap((entry) => [entry.summary, entry.body]),
    lore.ending.text,
    lore.ending.finalLine,
    ...Object.values(lore.ending.characterEpilogues),
  ];

  assert.ok(textValues.length >= 200);
  for (const value of textValues) {
    assert.equal(value, value.normalize('NFC'));
    assert.match(value, vietnamese);
  }
});
