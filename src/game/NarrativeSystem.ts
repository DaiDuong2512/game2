import type {
  CharacterNarrativeConfig,
  CharacterRelationshipConfig,
  CodexEntryConfig,
  CodexView,
  LoreConfig,
  MissionBriefing,
  NarrativeCompletion,
  NarrativeCue,
  NarrativeProgress,
  StageNarrativeConfig,
  StoryActConfig,
  StoryPremiseConfig,
} from '../narrative/NarrativeTypes.js';

/**
 * Lớp cốt truyện độc lập với vòng lặp chiến đấu và giao diện.
 * GameManager chỉ cần chuyển các mốc đã xảy ra; lớp này bảo đảm mỗi lời dẫn
 * giữa màn và lời báo giao tranh cuối chỉ phát một lần trong một lượt chơi.
 */
export class NarrativeSystem {
  private readonly lore: LoreConfig;
  private readonly actById: Map<string, StoryActConfig>;
  private readonly stageById: Map<string, StageNarrativeConfig>;
  private readonly stageNumberById: Map<string, number>;
  private readonly characterById: Map<string, CharacterNarrativeConfig>;
  private readonly relationshipById: Map<string, CharacterRelationshipConfig>;
  private readonly codexById: Map<string, CodexEntryConfig>;

  private activeStage: StageNarrativeConfig | null = null;
  private activeCharacter: CharacterNarrativeConfig | null = null;
  private midStageEmitted = false;
  private finaleEmitted = false;
  private completionEmitted = false;

  public constructor(lore: LoreConfig) {
    this.lore = lore;
    this.actById = new Map(lore.acts.map((item) => [item.id, item]));
    this.stageById = new Map(lore.stages.map((item) => [item.stageId, item]));
    this.stageNumberById = new Map(lore.stages.map((item, index) => [item.stageId, index + 1]));
    this.characterById = new Map(lore.characters.map((item) => [item.characterId, item]));
    this.relationshipById = new Map(lore.relationships.map((item) => [item.id, item]));
    this.codexById = new Map(lore.codex.map((item) => [item.id, item]));
  }

  public premise(): StoryPremiseConfig {
    return this.lore.premise;
  }

  public acts(): readonly StoryActConfig[] {
    return this.lore.acts;
  }

  public stage(stageId: string): StageNarrativeConfig | undefined {
    return this.stageById.get(stageId);
  }

  public character(characterId: string): CharacterNarrativeConfig | undefined {
    return this.characterById.get(characterId);
  }

  public relationshipsFor(characterId: string): CharacterRelationshipConfig[] {
    const character = this.characterById.get(characterId);
    if (!character) return [];
    return character.relationshipIds
      .map((id) => this.relationshipById.get(id))
      .filter((item): item is CharacterRelationshipConfig => Boolean(item));
  }

  public codexEntry(id: string): CodexEntryConfig | undefined {
    return this.codexById.get(id);
  }

  public listCodex(progress: NarrativeProgress): CodexView[] {
    const unlockedCharacters = new Set(progress.unlockedCharacterIds);
    const highestCompletedStage = Math.max(0, Math.floor(progress.highestCompletedStage));
    return this.lore.codex.map((entry) => ({
      entry,
      unlocked: this.isCodexUnlocked(entry, highestCompletedStage, unlockedCharacters),
    }));
  }

  public unlockedCodex(progress: NarrativeProgress): CodexEntryConfig[] {
    return this.listCodex(progress)
      .filter((item) => item.unlocked)
      .map((item) => item.entry);
  }

  /**
   * Khởi tạo một lượt cốt truyện và trả toàn bộ dữ liệu cần cho bảng nhiệm vụ:
   * hồi truyện, ba mục tiêu, lời truyền tin và câu nhập trận của nhân vật.
   */
  public startStage(stageId: string, characterId: string): MissionBriefing {
    const stage = this.requireStage(stageId);
    const character = this.requireCharacter(characterId);
    const act = this.actById.get(stage.actId);
    if (!act) throw new Error(`Không tìm thấy hồi truyện ${stage.actId}.`);

    this.activeStage = stage;
    this.activeCharacter = character;
    this.midStageEmitted = false;
    this.finaleEmitted = false;
    this.completionEmitted = false;

    return {
      act,
      stage,
      objectives: stage.objectives,
      transmission: this.toCue(stage.prelude, 'prelude', stage.stageId),
      characterLine: {
        id: `${stage.stageId}-${character.characterId}-nhap-tran`,
        kind: 'prelude',
        title: 'Lời nhập trận',
        speaker: character.name,
        text: character.battleCry,
        stageId: stage.stageId,
      },
    };
  }

  public updateProgress(progress: number): NarrativeCue[] {
    const stage = this.activeStage;
    if (!stage || this.completionEmitted || this.midStageEmitted) return [];
    const safeProgress = Math.min(1, Math.max(0, progress));
    if (safeProgress < stage.midStage.triggerProgress) return [];
    this.midStageEmitted = true;
    return [this.toCue(stage.midStage, 'mid-stage', stage.stageId)];
  }

  public triggerFinalEncounter(): NarrativeCue | null {
    const stage = this.activeStage;
    if (!stage || this.completionEmitted || this.finaleEmitted) return null;
    this.finaleEmitted = true;
    return this.toCue(stage.finale, stage.finale.kind, stage.stageId);
  }

  public completeStage(): NarrativeCompletion {
    const stage = this.activeStage;
    const character = this.activeCharacter;
    if (!stage || !character || this.completionEmitted) {
      return { cues: [], codexUnlockIds: [], ending: [] };
    }

    const cues = this.updateProgress(1);
    const finale = this.triggerFinalEncounter();
    if (finale) cues.push(finale);
    cues.push(this.toCue(stage.victory, 'victory', stage.stageId));
    this.completionEmitted = true;

    const lastStageId = this.lore.stages.at(-1)?.stageId;
    const ending = stage.stageId === lastStageId ? this.endingFor(character) : [];
    return {
      cues,
      codexUnlockIds: [...stage.codexUnlockIds],
      ending,
    };
  }

  private endingFor(character: CharacterNarrativeConfig): NarrativeCue[] {
    const epilogue = this.lore.ending.characterEpilogues[character.characterId];
    const result: NarrativeCue[] = [
      {
        id: 'ket-truyen-chinh',
        kind: 'ending',
        title: this.lore.ending.title,
        speaker: 'Lời Kết',
        text: `${this.lore.ending.text} ${this.lore.ending.finalLine}`,
      },
    ];
    if (epilogue) {
      result.push({
        id: `hau-truyen-${character.characterId}`,
        kind: 'ending',
        title: 'Hậu truyện nhân vật',
        speaker: character.name,
        text: epilogue,
      });
    }
    return result;
  }

  private isCodexUnlocked(
    entry: CodexEntryConfig,
    highestCompletedStage: number,
    unlockedCharacters: ReadonlySet<string>,
  ): boolean {
    if (entry.unlock.kind === 'khởi-đầu') return true;
    if (!entry.unlock.targetId) return false;
    if (entry.unlock.kind === 'mở-nhân-vật') return unlockedCharacters.has(entry.unlock.targetId);
    const stageNumber = this.stageNumberById.get(entry.unlock.targetId);
    return stageNumber !== undefined && stageNumber <= highestCompletedStage;
  }

  private requireStage(stageId: string): StageNarrativeConfig {
    const stage = this.stageById.get(stageId);
    if (!stage) throw new Error(`Không tìm thấy cốt truyện cho bản đồ ${stageId}.`);
    return stage;
  }

  private requireCharacter(characterId: string): CharacterNarrativeConfig {
    const character = this.characterById.get(characterId);
    if (!character) throw new Error(`Không tìm thấy cốt truyện cho nhân vật ${characterId}.`);
    return character;
  }

  private toCue(
    cue: { id: string; title: string; speaker: string; text: string },
    kind: NarrativeCue['kind'],
    stageId: string,
  ): NarrativeCue {
    return { ...cue, kind, stageId };
  }
}
