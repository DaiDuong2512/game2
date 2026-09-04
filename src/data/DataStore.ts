import type {
  CharacterConfig,
  EnemyConfig,
  EvolutionConfig,
  GameData,
  MetaUpgradeConfig,
  PassiveConfig,
  StageConfig,
  UpgradesConfig,
  WeaponConfig,
} from '../core/Types.js';
import type { LoreConfig, NarrativeCueConfig } from '../narrative/NarrativeTypes.js';

interface LoreReferences {
  stages: readonly StageConfig[];
  characters: readonly CharacterConfig[];
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.normalize('NFC')) {
    throw new Error(`Kiểm tra cốt truyện thất bại: ${label} phải là văn bản tiếng Việt hợp lệ.`);
  }
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Kiểm tra cốt truyện thất bại: ${label} chứa mã trùng lặp.`);
  }
}

function validateCue(cue: NarrativeCueConfig, label: string): void {
  requireText(cue?.id, `${label}.id`);
  requireText(cue?.title, `${label}.title`);
  requireText(cue?.speaker, `${label}.speaker`);
  requireText(cue?.text, `${label}.text`);
}

export function validateLoreConfig(lore: LoreConfig, references: LoreReferences): void {
  if (!lore || typeof lore !== 'object' || lore.version !== 1) {
    throw new Error('Kiểm tra cốt truyện thất bại: phiên bản lore.json không được hỗ trợ.');
  }
  requireText(lore.premise?.title, 'premise.title');
  requireText(lore.premise?.hook, 'premise.hook');
  requireText(lore.premise?.conflict, 'premise.conflict');
  requireText(lore.premise?.stakes, 'premise.stakes');

  if (!Array.isArray(lore.acts) || lore.acts.length !== 3) {
    throw new Error('Kiểm tra cốt truyện thất bại: phải có đúng 3 hồi.');
  }
  const actIds = lore.acts.map((item) => item.id);
  requireUnique(actIds, 'danh sách hồi');
  let expectedStageStart = 1;
  for (const [offset, act] of lore.acts.entries()) {
    requireText(act.id, `acts.${offset}.id`);
    requireText(act.title, `acts.${offset}.title`);
    requireText(act.subtitle, `acts.${offset}.subtitle`);
    requireText(act.summary, `acts.${offset}.summary`);
    if (act.index !== offset + 1 || act.stageStart !== expectedStageStart || act.stageEnd < act.stageStart) {
      throw new Error(`Kiểm tra cốt truyện thất bại: phạm vi của hồi ${act.id} không liên tục.`);
    }
    expectedStageStart = act.stageEnd + 1;
  }
  if (expectedStageStart !== references.stages.length + 1) {
    throw new Error('Kiểm tra cốt truyện thất bại: 3 hồi không phủ đủ toàn bộ bản đồ.');
  }

  if (!Array.isArray(lore.stages) || lore.stages.length !== references.stages.length) {
    throw new Error('Kiểm tra cốt truyện thất bại: mỗi bản đồ phải có đúng một chương truyện.');
  }
  const narrativeStageIds = lore.stages.map((item) => item.stageId);
  requireUnique(narrativeStageIds, 'danh sách chương bản đồ');
  for (const [offset, story] of lore.stages.entries()) {
    const stage = references.stages[offset];
    if (!stage || story.stageId !== stage.id) {
      throw new Error(`Kiểm tra cốt truyện thất bại: chương ${offset + 1} không khớp thứ tự bản đồ.`);
    }
    const act = lore.acts.find((item) => item.id === story.actId);
    if (!act || stage.index < act.stageStart || stage.index > act.stageEnd) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${stage.id} tham chiếu sai hồi ${story.actId}.`);
    }
    requireText(story.synopsis, `${stage.id}.synopsis`);
    if (!Array.isArray(story.objectives) || story.objectives.length !== 3) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${stage.id} phải có đúng 3 mục tiêu.`);
    }
    story.objectives.forEach((objective, index) => requireText(objective, `${stage.id}.objectives.${index}`));
    validateCue(story.prelude, `${stage.id}.prelude`);
    validateCue(story.midStage, `${stage.id}.midStage`);
    validateCue(story.finale, `${stage.id}.finale`);
    validateCue(story.victory, `${stage.id}.victory`);
    if (!(story.midStage.triggerProgress > 0 && story.midStage.triggerProgress < 1)) {
      throw new Error(`Kiểm tra cốt truyện thất bại: mốc giữa màn ${stage.id} phải nằm trong khoảng 0–1.`);
    }
    const expectedFinaleKind = stage.bossId ? 'boss' : 'elite';
    if (story.finale.kind !== expectedFinaleKind) {
      throw new Error(`Kiểm tra cốt truyện thất bại: giao tranh cuối ${stage.id} phải là ${expectedFinaleKind}.`);
    }
    if (!Array.isArray(story.codexUnlockIds) || story.codexUnlockIds.length === 0) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${stage.id} chưa có mục Thư Khố mở khóa.`);
    }
  }

  if (!Array.isArray(lore.characters) || lore.characters.length !== references.characters.length) {
    throw new Error('Kiểm tra cốt truyện thất bại: thiếu hồ sơ cốt truyện của nhân vật.');
  }
  const characterIds = references.characters.map((item) => item.id);
  const narrativeCharacterIds = lore.characters.map((item) => item.characterId);
  requireUnique(narrativeCharacterIds, 'hồ sơ nhân vật');
  for (const character of lore.characters) {
    const source = references.characters.find((item) => item.id === character.characterId);
    if (!source || character.name !== source.name) {
      throw new Error(`Kiểm tra cốt truyện thất bại: nhân vật ${character.characterId} không khớp dữ liệu gốc.`);
    }
    if (source.unlockStage === 0) {
      if (character.recruitedAfterStageId !== null) {
        throw new Error(`Kiểm tra cốt truyện thất bại: nhân vật khởi đầu ${character.characterId} không cần màn chiêu mộ.`);
      }
    } else {
      const recruitmentStage = references.stages.find((item) => item.id === character.recruitedAfterStageId);
      if (!recruitmentStage || recruitmentStage.index !== source.unlockStage - 1) {
        throw new Error(`Kiểm tra cốt truyện thất bại: thời điểm chiêu mộ ${character.characterId} không khớp lúc mở khóa.`);
      }
    }
    requireText(character.motivation, `${character.characterId}.motivation`);
    requireText(character.innerConflict, `${character.characterId}.innerConflict`);
    requireText(character.arc, `${character.characterId}.arc`);
    requireText(character.battleCry, `${character.characterId}.battleCry`);
    if (!Array.isArray(character.relationshipIds) || character.relationshipIds.length < 2) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${character.characterId} cần ít nhất 2 mối liên hệ.`);
    }
    requireUnique(character.relationshipIds, `mối liên hệ của ${character.characterId}`);
  }
  if (new Set(characterIds).size !== new Set(narrativeCharacterIds).size || characterIds.some((id) => !narrativeCharacterIds.includes(id))) {
    throw new Error('Kiểm tra cốt truyện thất bại: danh sách nhân vật không đồng bộ.');
  }

  if (!Array.isArray(lore.relationships) || lore.relationships.length < references.characters.length) {
    throw new Error('Kiểm tra cốt truyện thất bại: mạng quan hệ nhân vật chưa đầy đủ.');
  }
  const relationshipIds = lore.relationships.map((item) => item.id);
  requireUnique(relationshipIds, 'danh sách quan hệ');
  for (const relationship of lore.relationships) {
    requireText(relationship.id, 'relationships.id');
    requireText(relationship.title, `${relationship.id}.title`);
    requireText(relationship.description, `${relationship.id}.description`);
    if (relationship.characters.length !== 2 || relationship.characters[0] === relationship.characters[1]
      || relationship.characters.some((id) => !characterIds.includes(id))) {
      throw new Error(`Kiểm tra cốt truyện thất bại: quan hệ ${relationship.id} có nhân vật không hợp lệ.`);
    }
  }
  for (const character of lore.characters) {
    for (const relationshipId of character.relationshipIds) {
      const relationship = lore.relationships.find((item) => item.id === relationshipId);
      if (!relationship || !relationship.characters.includes(character.characterId)) {
        throw new Error(`Kiểm tra cốt truyện thất bại: ${relationshipId} không thuộc về ${character.characterId}.`);
      }
    }
  }
  for (const relationship of lore.relationships) {
    for (const characterId of relationship.characters) {
      const character = lore.characters.find((item) => item.characterId === characterId);
      if (!character?.relationshipIds.includes(relationship.id)) {
        throw new Error(`Kiểm tra cốt truyện thất bại: quan hệ ${relationship.id} chưa được khai báo hai chiều.`);
      }
    }
  }

  if (!Array.isArray(lore.codex) || lore.codex.length < 20) {
    throw new Error('Kiểm tra cốt truyện thất bại: Thư Khố chưa đủ nội dung.');
  }
  const codexIds = lore.codex.map((item) => item.id);
  requireUnique(codexIds, 'Thư Khố');
  const codexCategories = new Set(['thế-giới', 'phe-phái', 'nhân-vật', 'địa-danh', 'kẻ-thù', 'di-vật']);
  const codexUnlockKinds = new Set(['khởi-đầu', 'qua-màn', 'mở-nhân-vật']);
  for (const entry of lore.codex) {
    requireText(entry.id, 'codex.id');
    requireText(entry.title, `${entry.id}.title`);
    requireText(entry.summary, `${entry.id}.summary`);
    requireText(entry.body, `${entry.id}.body`);
    if (!codexCategories.has(entry.category) || !entry.unlock || !codexUnlockKinds.has(entry.unlock.kind)) {
      throw new Error(`Kiểm tra cốt truyện thất bại: phân loại hoặc cách mở ${entry.id} không hợp lệ.`);
    }
    const targetId = entry.unlock.targetId;
    if (entry.unlock.kind === 'khởi-đầu' && targetId !== undefined) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${entry.id} là mục khởi đầu nhưng có mục tiêu thừa.`);
    }
    if (entry.unlock.kind === 'qua-màn' && (!targetId || !narrativeStageIds.includes(targetId))) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${entry.id} mở bằng bản đồ không hợp lệ.`);
    }
    if (entry.unlock.kind === 'mở-nhân-vật' && (!targetId || !characterIds.includes(targetId))) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${entry.id} mở bằng nhân vật không hợp lệ.`);
    }
  }
  for (const story of lore.stages) {
    if (story.codexUnlockIds.some((id) => !codexIds.includes(id))) {
      throw new Error(`Kiểm tra cốt truyện thất bại: ${story.stageId} tham chiếu mục Thư Khố không tồn tại.`);
    }
    const expectedIds = lore.codex
      .filter((entry) => entry.unlock.kind === 'qua-màn' && entry.unlock.targetId === story.stageId)
      .map((entry) => entry.id);
    if (story.codexUnlockIds.length !== expectedIds.length
      || story.codexUnlockIds.some((id) => !expectedIds.includes(id))) {
      throw new Error(`Kiểm tra cốt truyện thất bại: mục Thư Khố của ${story.stageId} không khớp điều kiện qua màn.`);
    }
  }

  requireText(lore.ending?.title, 'ending.title');
  requireText(lore.ending?.text, 'ending.text');
  requireText(lore.ending?.finalLine, 'ending.finalLine');
  for (const characterId of characterIds) {
    requireText(lore.ending.characterEpilogues?.[characterId], `ending.characterEpilogues.${characterId}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không thể tải ${path}: ${response.status}`);
  return await response.json() as T;
}

export async function loadGameData(): Promise<GameData> {
  const [characters, weapons, passives, evolutions, enemies, stages, upgrades, metaUpgrades, lore] = await Promise.all([
    readJson<CharacterConfig[]>('./data/characters.json'),
    readJson<WeaponConfig[]>('./data/weapons.json'),
    readJson<PassiveConfig[]>('./data/passives.json'),
    readJson<EvolutionConfig[]>('./data/evolutions.json'),
    readJson<EnemyConfig[]>('./data/enemies.json'),
    readJson<StageConfig[]>('./data/stages.json'),
    readJson<UpgradesConfig>('./data/upgrades.json'),
    readJson<MetaUpgradeConfig[]>('./data/meta-upgrades.json'),
    readJson<LoreConfig>('./data/lore.json'),
  ]);

  if (characters.length < 4 || weapons.length < 12 || enemies.length < 15 || stages.length < 20) {
    throw new Error('Kiểm tra dữ liệu thất bại: nội dung dự án chưa đầy đủ.');
  }
  requireUnique(weapons.map((weapon) => weapon.id), 'danh sách vũ khí');
  for (const weapon of weapons) {
    if (weapon.levels.length !== 8) throw new Error(`Vũ khí ${weapon.id} phải có đúng 8 cấp.`);
    if (weapon.levels.some((level, index) => level.level !== index + 1
      || !Number.isFinite(level.damage) || !Number.isFinite(level.cooldown)
      || level.damage <= 0 || level.cooldown <= 0)) {
      throw new Error(`Vũ khí ${weapon.id} có dữ liệu cấp độ không hợp lệ.`);
    }
    const signature = weapon.signature;
    if (signature) {
      const kinds = new Set(['bleed', 'slow', 'stun', 'poison-cloud']);
      if (!kinds.has(signature.kind) || !Number.isFinite(signature.duration) || signature.duration <= 0
        || (signature.chance !== undefined && (!Number.isFinite(signature.chance) || signature.chance < 0 || signature.chance > 1))
        || (signature.magnitude !== undefined && (!Number.isFinite(signature.magnitude) || signature.magnitude <= 0 || signature.magnitude > 1))
        || (signature.healthPercentPerSecond !== undefined
          && (!Number.isFinite(signature.healthPercentPerSecond) || signature.healthPercentPerSecond < 0 || signature.healthPercentPerSecond > 0.1))) {
        throw new Error(`Vũ khí ${weapon.id} có hiệu ứng chữ ký không hợp lệ.`);
      }
    }
    if (weapon.behavior === 'poison-bomb') {
      if (signature?.kind !== 'poison-cloud' || weapon.levels[0]?.cooldown !== 5
        || weapon.levels[0]?.duration !== 3 || weapon.levels.at(-1)?.duration !== 5) {
        throw new Error(`Vũ khí ${weapon.id} phải dùng vùng độc 3–5 giây với hồi chiêu cơ bản 5 giây.`);
      }
    }
  }
  const weaponIds = new Set(weapons.map((weapon) => weapon.id));
  if (characters.some((character) => !weaponIds.has(character.startWeapon))) {
    throw new Error('Kiểm tra dữ liệu thất bại: nhân vật tham chiếu vũ khí chính không tồn tại.');
  }
  if (evolutions.some((evolution) => !weaponIds.has(evolution.weapon))) {
    throw new Error('Kiểm tra dữ liệu thất bại: Tiến Hóa tham chiếu vũ khí không tồn tại.');
  }
  validateLoreConfig(lore, { stages, characters });

  return {
    characters,
    weapons,
    passives,
    evolutions,
    enemies,
    stages,
    upgrades,
    metaUpgrades,
    lore,
    characterById: new Map(characters.map((item) => [item.id, item])),
    weaponById: new Map(weapons.map((item) => [item.id, item])),
    passiveById: new Map(passives.map((item) => [item.id, item])),
    evolutionById: new Map(evolutions.map((item) => [item.id, item])),
    enemyById: new Map(enemies.map((item) => [item.id, item])),
    stageById: new Map(stages.map((item) => [item.id, item])),
  };
}
