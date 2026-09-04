export type NarrativeCueKind = 'prelude' | 'mid-stage' | 'elite' | 'boss' | 'victory' | 'ending';
export type CodexCategory = 'thế-giới' | 'phe-phái' | 'nhân-vật' | 'địa-danh' | 'kẻ-thù' | 'di-vật';
export type CodexUnlockKind = 'khởi-đầu' | 'qua-màn' | 'mở-nhân-vật';

export interface NarrativeCueConfig {
  id: string;
  title: string;
  speaker: string;
  text: string;
}

export interface NarrativeMidStageCueConfig extends NarrativeCueConfig {
  triggerProgress: number;
}

export interface NarrativeFinaleCueConfig extends NarrativeCueConfig {
  kind: 'elite' | 'boss';
}

export interface StoryPremiseConfig {
  title: string;
  hook: string;
  conflict: string;
  stakes: string;
}

export interface StoryActConfig {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  stageStart: number;
  stageEnd: number;
  summary: string;
}

export interface StageNarrativeConfig {
  stageId: string;
  actId: string;
  synopsis: string;
  objectives: string[];
  prelude: NarrativeCueConfig;
  midStage: NarrativeMidStageCueConfig;
  finale: NarrativeFinaleCueConfig;
  victory: NarrativeCueConfig;
  codexUnlockIds: string[];
}

export interface CharacterNarrativeConfig {
  characterId: string;
  name: string;
  recruitedAfterStageId: string | null;
  motivation: string;
  innerConflict: string;
  arc: string;
  battleCry: string;
  relationshipIds: string[];
}

export interface CharacterRelationshipConfig {
  id: string;
  characters: [string, string];
  title: string;
  description: string;
}

export interface CodexUnlockConfig {
  kind: CodexUnlockKind;
  targetId?: string;
}

export interface CodexEntryConfig {
  id: string;
  category: CodexCategory;
  title: string;
  summary: string;
  body: string;
  unlock: CodexUnlockConfig;
}

export interface StoryEndingConfig {
  title: string;
  text: string;
  finalLine: string;
  characterEpilogues: Record<string, string>;
}

export interface LoreConfig {
  version: number;
  premise: StoryPremiseConfig;
  acts: StoryActConfig[];
  stages: StageNarrativeConfig[];
  characters: CharacterNarrativeConfig[];
  relationships: CharacterRelationshipConfig[];
  codex: CodexEntryConfig[];
  ending: StoryEndingConfig;
}

export interface NarrativeCue extends NarrativeCueConfig {
  kind: NarrativeCueKind;
  stageId?: string;
}

export interface NarrativeCompletion {
  cues: NarrativeCue[];
  codexUnlockIds: string[];
  ending: NarrativeCue[];
}

export interface MissionBriefing {
  act: StoryActConfig;
  stage: StageNarrativeConfig;
  objectives: readonly string[];
  transmission: NarrativeCue;
  characterLine: NarrativeCue;
}

export interface NarrativeProgress {
  highestCompletedStage: number;
  unlockedCharacterIds: readonly string[];
}

export interface CodexView {
  entry: CodexEntryConfig;
  unlocked: boolean;
}
