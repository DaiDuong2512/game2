import { clamp } from './MathUtils.js';
import type { SettingsData } from './Types.js';

/** Cac id cu van duoc giu de tuong thich runtime. */
export const SOUND_IDS = [
  'shoot', 'slash', 'hit', 'crit', 'pickup', 'level', 'dash',
  'skill', 'rage', 'ultimate', 'lightning', 'fire', 'shield',
  'boss-warning', 'boss', 'victory', 'defeat', 'click',
  // Dấu âm chuyên biệt cho vũ khí, trạng thái và ba ô kỹ năng Q/E/R.
  'bow', 'bleed', 'slow', 'arcane', 'stun', 'burn-tick',
  'poison-throw', 'poison-cloud', 'poison-tick', 'poison-expire',
  'class-skill', 'rage-start', 'rage-loop', 'rage-end',
  'ultimate-cast', 'ultimate-regen',
] as const;

export type SoundId = typeof SOUND_IDS[number];

export type ClassSkillSoundKind =
  | 'rift-blooddraw'
  | 'gale-volley'
  | 'sanctuary-guard'
  | 'frost-ruin'
  | 'hemotoxic-draw'
  | 'echo-pack'
  | 'gravity-breaker'
  | 'astral-fold';

/**
 * Lớp dấu âm đi kèm thân cue `class-skill`. Bảng này giúp hệ thống kỹ năng
 * không phải biết chi tiết tổng hợp âm, đồng thời giữ mỗi Hộ Vệ có một âm sắc.
 */
export const CLASS_SKILL_ACCENTS: Readonly<Record<ClassSkillSoundKind, SoundId>> = {
  'rift-blooddraw': 'bleed',
  'gale-volley': 'bow',
  'sanctuary-guard': 'shield',
  'frost-ruin': 'slow',
  'hemotoxic-draw': 'poison-cloud',
  'echo-pack': 'arcane',
  'gravity-breaker': 'hit',
  'astral-fold': 'arcane',
};

export const RAGE_SOUND_CUES = {
  start: 'rage-start',
  loop: 'rage-loop',
  end: 'rage-end',
} as const satisfies Readonly<Record<'start' | 'loop' | 'end', SoundId>>;

export const ULTIMATE_SOUND_CUES = {
  cast: 'ultimate-cast',
  regen: 'ultimate-regen',
} as const satisfies Readonly<Record<'cast' | 'regen', SoundId>>;

type SoundGroup = 'weapon' | 'impact' | 'element' | 'ability' | 'pickup' | 'boss' | 'ui';

export interface ToneLayer {
  type: OscillatorType;
  frequency: number;
  endFrequency?: number;
  delay?: number;
  duration: number;
  attack?: number;
  release?: number;
  gain: number;
}

export interface NoiseLayer {
  filter: BiquadFilterType;
  frequency: number;
  delay?: number;
  duration: number;
  attack?: number;
  release?: number;
  gain: number;
}

export interface SoundProfile {
  /** Thoi gian ton tai cua mot cue logic, tinh bang giay. */
  duration: number;
  /** Khoang nghi rieng cua cue, chan hit/dan day dac thanh tieng re. */
  cooldownMs: number;
  /** Khoang nghi chung de shoot + hit + nguyen to khong chong len nhau. */
  groupCooldownMs: number;
  /** 1 la am nen; 5 la canh bao/ultimate khong duoc mat. */
  priority: 1 | 2 | 3 | 4 | 5;
  group: SoundGroup;
  gain: number;
  pitchJitter?: number;
  tones: readonly ToneLayer[];
  noise?: NoiseLayer;
}

/** Ngan hang tong hop: toi da ba oscillator va mot lop noise ngan moi cue. */
export const SOUND_PROFILES: Readonly<Record<SoundId, SoundProfile>> = {
  shoot: {
    duration: 0.055, cooldownMs: 32, groupCooldownMs: 14, priority: 1, group: 'weapon', gain: 0.21, pitchJitter: 0.035,
    tones: [{ type: 'square', frequency: 430, endFrequency: 270, duration: 0.05, attack: 0.002, release: 0.038, gain: 0.55 }],
  },
  slash: {
    duration: 0.13, cooldownMs: 72, groupCooldownMs: 18, priority: 2, group: 'weapon', gain: 0.25, pitchJitter: 0.045,
    tones: [{ type: 'sawtooth', frequency: 250, endFrequency: 92, duration: 0.12, attack: 0.004, release: 0.08, gain: 0.42 }],
    noise: { filter: 'bandpass', frequency: 1450, duration: 0.11, attack: 0.002, release: 0.09, gain: 0.24 },
  },
  hit: {
    duration: 0.07, cooldownMs: 30, groupCooldownMs: 12, priority: 1, group: 'impact', gain: 0.2, pitchJitter: 0.07,
    tones: [{ type: 'triangle', frequency: 145, endFrequency: 82, duration: 0.065, attack: 0.002, release: 0.05, gain: 0.6 }],
    noise: { filter: 'lowpass', frequency: 780, duration: 0.045, attack: 0.001, release: 0.035, gain: 0.18 },
  },
  crit: {
    duration: 0.14, cooldownMs: 72, groupCooldownMs: 18, priority: 3, group: 'impact', gain: 0.3, pitchJitter: 0.025,
    tones: [
      { type: 'square', frequency: 710, endFrequency: 920, duration: 0.075, attack: 0.002, release: 0.055, gain: 0.34 },
      { type: 'sine', frequency: 1180, endFrequency: 820, delay: 0.025, duration: 0.11, attack: 0.003, release: 0.08, gain: 0.34 },
    ],
  },
  pickup: {
    duration: 0.09, cooldownMs: 55, groupCooldownMs: 25, priority: 2, group: 'pickup', gain: 0.24, pitchJitter: 0.02,
    tones: [
      { type: 'sine', frequency: 690, endFrequency: 900, duration: 0.07, attack: 0.003, release: 0.045, gain: 0.42 },
      { type: 'triangle', frequency: 1040, endFrequency: 1190, delay: 0.025, duration: 0.06, attack: 0.002, release: 0.04, gain: 0.22 },
    ],
  },
  level: {
    duration: 0.42, cooldownMs: 260, groupCooldownMs: 40, priority: 4, group: 'pickup', gain: 0.32,
    tones: [
      { type: 'triangle', frequency: 390, endFrequency: 520, duration: 0.18, attack: 0.006, release: 0.1, gain: 0.4 },
      { type: 'triangle', frequency: 520, endFrequency: 690, delay: 0.09, duration: 0.2, attack: 0.005, release: 0.12, gain: 0.38 },
      { type: 'sine', frequency: 780, endFrequency: 1040, delay: 0.19, duration: 0.22, attack: 0.005, release: 0.15, gain: 0.34 },
    ],
  },
  dash: {
    duration: 0.18, cooldownMs: 95, groupCooldownMs: 24, priority: 3, group: 'ability', gain: 0.3, pitchJitter: 0.025,
    tones: [
      { type: 'sawtooth', frequency: 330, endFrequency: 105, duration: 0.15, attack: 0.003, release: 0.11, gain: 0.34 },
      { type: 'sine', frequency: 165, endFrequency: 72, delay: 0.015, duration: 0.16, attack: 0.004, release: 0.12, gain: 0.45 },
    ],
    noise: { filter: 'highpass', frequency: 1100, duration: 0.14, attack: 0.002, release: 0.11, gain: 0.28 },
  },
  skill: {
    duration: 0.34, cooldownMs: 145, groupCooldownMs: 28, priority: 4, group: 'ability', gain: 0.34, pitchJitter: 0.018,
    tones: [
      { type: 'triangle', frequency: 220, endFrequency: 510, duration: 0.2, attack: 0.008, release: 0.1, gain: 0.42 },
      { type: 'sine', frequency: 440, endFrequency: 880, delay: 0.055, duration: 0.23, attack: 0.006, release: 0.15, gain: 0.34 },
      { type: 'sine', frequency: 980, endFrequency: 620, delay: 0.16, duration: 0.17, attack: 0.004, release: 0.12, gain: 0.27 },
    ],
  },
  rage: {
    duration: 0.48, cooldownMs: 360, groupCooldownMs: 35, priority: 5, group: 'ability', gain: 0.38, pitchJitter: 0.012,
    tones: [
      { type: 'sawtooth', frequency: 72, endFrequency: 138, duration: 0.43, attack: 0.025, release: 0.2, gain: 0.38 },
      { type: 'triangle', frequency: 145, endFrequency: 330, delay: 0.045, duration: 0.38, attack: 0.018, release: 0.2, gain: 0.36 },
      { type: 'square', frequency: 410, endFrequency: 620, delay: 0.17, duration: 0.22, attack: 0.006, release: 0.16, gain: 0.16 },
    ],
    noise: { filter: 'bandpass', frequency: 520, delay: 0.02, duration: 0.39, attack: 0.018, release: 0.26, gain: 0.18 },
  },
  ultimate: {
    duration: 0.72, cooldownMs: 520, groupCooldownMs: 45, priority: 5, group: 'ability', gain: 0.42,
    tones: [
      { type: 'sine', frequency: 48, endFrequency: 82, duration: 0.68, attack: 0.02, release: 0.35, gain: 0.56 },
      { type: 'sawtooth', frequency: 120, endFrequency: 390, delay: 0.045, duration: 0.51, attack: 0.018, release: 0.27, gain: 0.26 },
      { type: 'triangle', frequency: 510, endFrequency: 1120, delay: 0.18, duration: 0.48, attack: 0.012, release: 0.3, gain: 0.3 },
    ],
    noise: { filter: 'highpass', frequency: 1700, delay: 0.12, duration: 0.42, attack: 0.02, release: 0.3, gain: 0.16 },
  },
  lightning: {
    duration: 0.11, cooldownMs: 58, groupCooldownMs: 26, priority: 2, group: 'element', gain: 0.27, pitchJitter: 0.065,
    tones: [
      { type: 'square', frequency: 1320, endFrequency: 360, duration: 0.07, attack: 0.001, release: 0.052, gain: 0.29 },
      { type: 'sawtooth', frequency: 780, endFrequency: 190, delay: 0.012, duration: 0.085, attack: 0.001, release: 0.065, gain: 0.2 },
    ],
    noise: { filter: 'highpass', frequency: 2600, duration: 0.075, attack: 0.001, release: 0.06, gain: 0.34 },
  },
  fire: {
    duration: 0.2, cooldownMs: 92, groupCooldownMs: 34, priority: 2, group: 'element', gain: 0.27, pitchJitter: 0.04,
    tones: [{ type: 'sine', frequency: 190, endFrequency: 76, duration: 0.18, attack: 0.012, release: 0.12, gain: 0.42 }],
    noise: { filter: 'lowpass', frequency: 1250, duration: 0.19, attack: 0.006, release: 0.14, gain: 0.34 },
  },
  shield: {
    duration: 0.25, cooldownMs: 115, groupCooldownMs: 24, priority: 4, group: 'ability', gain: 0.34, pitchJitter: 0.015,
    tones: [
      { type: 'sine', frequency: 1180, endFrequency: 740, duration: 0.21, attack: 0.002, release: 0.16, gain: 0.42 },
      { type: 'triangle', frequency: 590, endFrequency: 430, delay: 0.012, duration: 0.22, attack: 0.003, release: 0.17, gain: 0.32 },
    ],
  },
  'boss-warning': {
    duration: 0.58, cooldownMs: 390, groupCooldownMs: 45, priority: 5, group: 'boss', gain: 0.4,
    tones: [
      { type: 'square', frequency: 116, endFrequency: 94, duration: 0.16, attack: 0.005, release: 0.1, gain: 0.34 },
      { type: 'square', frequency: 116, endFrequency: 94, delay: 0.17, duration: 0.16, attack: 0.005, release: 0.1, gain: 0.4 },
      { type: 'square', frequency: 145, endFrequency: 82, delay: 0.34, duration: 0.22, attack: 0.004, release: 0.15, gain: 0.5 },
    ],
    noise: { filter: 'bandpass', frequency: 760, delay: 0.33, duration: 0.19, attack: 0.004, release: 0.14, gain: 0.13 },
  },
  boss: {
    duration: 0.62, cooldownMs: 320, groupCooldownMs: 40, priority: 5, group: 'boss', gain: 0.39, pitchJitter: 0.01,
    tones: [
      { type: 'sawtooth', frequency: 76, endFrequency: 48, duration: 0.56, attack: 0.016, release: 0.31, gain: 0.43 },
      { type: 'triangle', frequency: 152, endFrequency: 86, delay: 0.04, duration: 0.51, attack: 0.012, release: 0.3, gain: 0.32 },
    ],
    noise: { filter: 'lowpass', frequency: 420, duration: 0.48, attack: 0.01, release: 0.3, gain: 0.2 },
  },
  victory: {
    duration: 0.76, cooldownMs: 600, groupCooldownMs: 45, priority: 5, group: 'ui', gain: 0.38,
    tones: [
      { type: 'triangle', frequency: 392, endFrequency: 523, duration: 0.28, attack: 0.008, release: 0.15, gain: 0.38 },
      { type: 'triangle', frequency: 523, endFrequency: 659, delay: 0.17, duration: 0.31, attack: 0.008, release: 0.18, gain: 0.4 },
      { type: 'sine', frequency: 659, endFrequency: 1047, delay: 0.35, duration: 0.39, attack: 0.008, release: 0.25, gain: 0.42 },
    ],
  },
  defeat: {
    duration: 0.7, cooldownMs: 600, groupCooldownMs: 45, priority: 5, group: 'ui', gain: 0.34,
    tones: [
      { type: 'sine', frequency: 174, endFrequency: 72, duration: 0.66, attack: 0.018, release: 0.37, gain: 0.48 },
      { type: 'triangle', frequency: 260, endFrequency: 98, delay: 0.06, duration: 0.55, attack: 0.012, release: 0.34, gain: 0.24 },
    ],
  },
  click: {
    duration: 0.045, cooldownMs: 24, groupCooldownMs: 12, priority: 2, group: 'ui', gain: 0.19, pitchJitter: 0.018,
    tones: [{ type: 'sine', frequency: 520, endFrequency: 410, duration: 0.04, attack: 0.001, release: 0.028, gain: 0.5 }],
  },
  bow: {
    duration: 0.16, cooldownMs: 68, groupCooldownMs: 18, priority: 2, group: 'weapon', gain: 0.24, pitchJitter: 0.035,
    tones: [
      { type: 'triangle', frequency: 178, endFrequency: 690, duration: 0.055, attack: 0.002, release: 0.04, gain: 0.38 },
      { type: 'sine', frequency: 940, endFrequency: 410, delay: 0.025, duration: 0.125, attack: 0.002, release: 0.1, gain: 0.29 },
    ],
    noise: { filter: 'highpass', frequency: 1850, delay: 0.015, duration: 0.09, attack: 0.001, release: 0.075, gain: 0.13 },
  },
  bleed: {
    duration: 0.12, cooldownMs: 175, groupCooldownMs: 32, priority: 1, group: 'impact', gain: 0.18, pitchJitter: 0.05,
    tones: [{ type: 'sine', frequency: 126, endFrequency: 61, duration: 0.11, attack: 0.003, release: 0.082, gain: 0.5 }],
    noise: { filter: 'lowpass', frequency: 510, duration: 0.075, attack: 0.002, release: 0.06, gain: 0.14 },
  },
  slow: {
    duration: 0.15, cooldownMs: 145, groupCooldownMs: 35, priority: 1, group: 'element', gain: 0.18, pitchJitter: 0.025,
    tones: [
      { type: 'triangle', frequency: 680, endFrequency: 260, duration: 0.135, attack: 0.004, release: 0.105, gain: 0.35 },
      { type: 'sine', frequency: 1030, endFrequency: 510, delay: 0.015, duration: 0.115, attack: 0.003, release: 0.09, gain: 0.2 },
    ],
  },
  arcane: {
    duration: 0.21, cooldownMs: 78, groupCooldownMs: 24, priority: 2, group: 'element', gain: 0.25, pitchJitter: 0.018,
    tones: [
      { type: 'sine', frequency: 310, endFrequency: 620, duration: 0.18, attack: 0.007, release: 0.12, gain: 0.36 },
      { type: 'triangle', frequency: 930, endFrequency: 1240, delay: 0.045, duration: 0.15, attack: 0.004, release: 0.1, gain: 0.22 },
    ],
  },
  stun: {
    duration: 0.105, cooldownMs: 160, groupCooldownMs: 34, priority: 2, group: 'impact', gain: 0.22, pitchJitter: 0.04,
    tones: [
      { type: 'square', frequency: 470, endFrequency: 230, duration: 0.055, attack: 0.001, release: 0.043, gain: 0.27 },
      { type: 'sine', frequency: 1250, endFrequency: 840, delay: 0.018, duration: 0.08, attack: 0.002, release: 0.062, gain: 0.24 },
    ],
  },
  'burn-tick': {
    duration: 0.13, cooldownMs: 190, groupCooldownMs: 42, priority: 1, group: 'element', gain: 0.17, pitchJitter: 0.07,
    tones: [{ type: 'sine', frequency: 155, endFrequency: 82, duration: 0.12, attack: 0.008, release: 0.085, gain: 0.3 }],
    noise: { filter: 'bandpass', frequency: 1520, duration: 0.105, attack: 0.002, release: 0.085, gain: 0.28 },
  },
  'poison-throw': {
    duration: 0.23, cooldownMs: 180, groupCooldownMs: 28, priority: 2, group: 'weapon', gain: 0.25, pitchJitter: 0.03,
    tones: [
      { type: 'triangle', frequency: 215, endFrequency: 96, duration: 0.09, attack: 0.002, release: 0.065, gain: 0.36 },
      { type: 'sine', frequency: 520, endFrequency: 250, delay: 0.055, duration: 0.165, attack: 0.006, release: 0.125, gain: 0.24 },
    ],
    noise: { filter: 'bandpass', frequency: 980, delay: 0.03, duration: 0.145, attack: 0.003, release: 0.115, gain: 0.19 },
  },
  'poison-cloud': {
    duration: 0.42, cooldownMs: 420, groupCooldownMs: 40, priority: 2, group: 'element', gain: 0.2, pitchJitter: 0.02,
    tones: [{ type: 'sine', frequency: 92, endFrequency: 66, duration: 0.4, attack: 0.035, release: 0.28, gain: 0.34 }],
    noise: { filter: 'lowpass', frequency: 860, duration: 0.41, attack: 0.035, release: 0.3, gain: 0.27 },
  },
  'poison-tick': {
    duration: 0.11, cooldownMs: 225, groupCooldownMs: 48, priority: 1, group: 'element', gain: 0.15, pitchJitter: 0.08,
    tones: [
      { type: 'sine', frequency: 138, endFrequency: 82, duration: 0.095, attack: 0.003, release: 0.072, gain: 0.38 },
      { type: 'triangle', frequency: 390, endFrequency: 230, delay: 0.014, duration: 0.085, attack: 0.002, release: 0.064, gain: 0.16 },
    ],
  },
  'poison-expire': {
    duration: 0.19, cooldownMs: 165, groupCooldownMs: 38, priority: 1, group: 'element', gain: 0.16, pitchJitter: 0.035,
    tones: [{ type: 'sine', frequency: 255, endFrequency: 112, duration: 0.17, attack: 0.004, release: 0.135, gain: 0.25 }],
    noise: { filter: 'highpass', frequency: 1400, duration: 0.18, attack: 0.003, release: 0.145, gain: 0.16 },
  },
  'class-skill': {
    duration: 0.39, cooldownMs: 155, groupCooldownMs: 28, priority: 4, group: 'ability', gain: 0.34, pitchJitter: 0.015,
    tones: [
      { type: 'triangle', frequency: 165, endFrequency: 390, duration: 0.26, attack: 0.012, release: 0.15, gain: 0.4 },
      { type: 'sine', frequency: 495, endFrequency: 990, delay: 0.07, duration: 0.28, attack: 0.007, release: 0.18, gain: 0.3 },
      { type: 'sine', frequency: 740, endFrequency: 555, delay: 0.2, duration: 0.17, attack: 0.004, release: 0.13, gain: 0.2 },
    ],
  },
  'rage-start': {
    duration: 0.52, cooldownMs: 380, groupCooldownMs: 35, priority: 5, group: 'ability', gain: 0.38, pitchJitter: 0.01,
    tones: [
      { type: 'sine', frequency: 58, endFrequency: 112, duration: 0.49, attack: 0.025, release: 0.24, gain: 0.5 },
      { type: 'sawtooth', frequency: 118, endFrequency: 355, delay: 0.035, duration: 0.43, attack: 0.018, release: 0.23, gain: 0.27 },
      { type: 'triangle', frequency: 420, endFrequency: 690, delay: 0.19, duration: 0.29, attack: 0.006, release: 0.2, gain: 0.24 },
    ],
    noise: { filter: 'bandpass', frequency: 620, delay: 0.02, duration: 0.4, attack: 0.015, release: 0.28, gain: 0.15 },
  },
  'rage-loop': {
    duration: 0.24, cooldownMs: 360, groupCooldownMs: 30, priority: 3, group: 'ability', gain: 0.16, pitchJitter: 0.028,
    tones: [
      { type: 'sine', frequency: 74, endFrequency: 92, duration: 0.22, attack: 0.025, release: 0.14, gain: 0.34 },
      { type: 'triangle', frequency: 222, endFrequency: 275, delay: 0.035, duration: 0.17, attack: 0.012, release: 0.11, gain: 0.16 },
    ],
  },
  'rage-end': {
    duration: 0.3, cooldownMs: 260, groupCooldownMs: 32, priority: 4, group: 'ability', gain: 0.24, pitchJitter: 0.012,
    tones: [
      { type: 'triangle', frequency: 520, endFrequency: 185, duration: 0.27, attack: 0.005, release: 0.2, gain: 0.31 },
      { type: 'sine', frequency: 112, endFrequency: 68, delay: 0.04, duration: 0.24, attack: 0.008, release: 0.18, gain: 0.32 },
    ],
  },
  'ultimate-cast': {
    duration: 0.78, cooldownMs: 540, groupCooldownMs: 45, priority: 5, group: 'ability', gain: 0.42, pitchJitter: 0.006,
    tones: [
      { type: 'sine', frequency: 44, endFrequency: 88, duration: 0.74, attack: 0.025, release: 0.37, gain: 0.56 },
      { type: 'triangle', frequency: 132, endFrequency: 528, delay: 0.055, duration: 0.58, attack: 0.02, release: 0.31, gain: 0.31 },
      { type: 'sine', frequency: 660, endFrequency: 1320, delay: 0.22, duration: 0.49, attack: 0.012, release: 0.32, gain: 0.27 },
    ],
    noise: { filter: 'highpass', frequency: 1850, delay: 0.15, duration: 0.48, attack: 0.025, release: 0.34, gain: 0.14 },
  },
  'ultimate-regen': {
    duration: 0.26, cooldownMs: 760, groupCooldownMs: 34, priority: 3, group: 'ability', gain: 0.2, pitchJitter: 0.014,
    tones: [
      { type: 'sine', frequency: 196, endFrequency: 294, duration: 0.22, attack: 0.012, release: 0.15, gain: 0.33 },
      { type: 'sine', frequency: 392, endFrequency: 588, delay: 0.055, duration: 0.19, attack: 0.008, release: 0.13, gain: 0.2 },
    ],
  },
};

interface BudgetVoice {
  token: number;
  priority: SoundProfile['priority'];
  endsAtMs: number;
}

export interface VoiceReservation {
  token: number;
  /** Neu co, AudioManager ha nho cue cu truoc khi phat cue uu tien cao. */
  preemptToken?: number;
}

/** Bo gioi han thuan logic, tach khoi Web Audio de test chinh xac. */
export class SoundVoiceBudget {
  private readonly active = new Map<number, BudgetVoice>();
  private readonly lastBySound = new Map<SoundId, number>();
  private readonly lastByGroup = new Map<SoundGroup, number>();
  private readonly recentStarts: number[] = [];
  private nextToken = 1;

  public constructor(
    private readonly maxVoices = 12,
    private readonly maxStartsPerWindow = 6,
    private readonly burstWindowMs = 48,
  ) {}

  public reserve(id: SoundId, nowMs: number): VoiceReservation | null {
    const profile = SOUND_PROFILES[id];
    this.prune(nowMs);
    const lastSound = this.lastBySound.get(id);
    if (lastSound !== undefined && nowMs - lastSound < profile.cooldownMs) return null;
    const lastGroup = this.lastByGroup.get(profile.group);
    if (profile.priority < 4 && lastGroup !== undefined && nowMs - lastGroup < profile.groupCooldownMs) return null;
    // Canh bao, No va Tuyet ky van phat trong mot frame day dan/hit.
    if (profile.priority < 4 && this.recentStarts.length >= this.maxStartsPerWindow) return null;

    let preemptToken: number | undefined;
    if (this.active.size >= this.maxVoices) {
      let weakest: BudgetVoice | undefined;
      for (const voice of this.active.values()) {
        if (!weakest || voice.priority < weakest.priority || (voice.priority === weakest.priority && voice.endsAtMs > weakest.endsAtMs)) {
          weakest = voice;
        }
      }
      if (!weakest || profile.priority <= weakest.priority) return null;
      preemptToken = weakest.token;
      this.active.delete(weakest.token);
    }

    const token = this.nextToken;
    this.nextToken += 1;
    this.active.set(token, { token, priority: profile.priority, endsAtMs: nowMs + profile.duration * 1000 + 40 });
    this.lastBySound.set(id, nowMs);
    this.lastByGroup.set(profile.group, nowMs);
    this.recentStarts.push(nowMs);
    return preemptToken === undefined ? { token } : { token, preemptToken };
  }

  public release(token: number): void {
    this.active.delete(token);
  }

  public activeCount(nowMs: number): number {
    this.prune(nowMs);
    return this.active.size;
  }

  private prune(nowMs: number): void {
    for (const [token, voice] of this.active) if (voice.endsAtMs <= nowMs) this.active.delete(token);
    while ((this.recentStarts[0] ?? Number.POSITIVE_INFINITY) <= nowMs - this.burstWindowMs) this.recentStarts.shift();
  }
}

interface ActiveVoice {
  output: GainNode;
  sources: AudioScheduledSourceNode[];
  remainingSources: number;
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: SettingsData;
  private ambientTimer = 0;
  private unlocked = false;
  private readonly budget = new SoundVoiceBudget();
  private readonly activeVoices = new Map<number, ActiveVoice>();
  private readonly variationIndex = new Map<SoundId, number>();

  public constructor(settings: SettingsData) {
    this.settings = settings;
    const resume = (): void => {
      this.unlocked = true;
      void this.ensureContext();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  public updateSettings(settings: SettingsData): void {
    this.settings = settings;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.linearRampToValueAtTime(Math.max(0.0001, clamp(settings.masterVolume, 0, 1)), now + 0.025);
    }
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (!this.unlocked && !navigator.userActivation?.hasBeenActive) return null;
    this.unlocked = true;
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return null;
      }
      this.master = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.master.gain.value = clamp(this.settings.masterVolume, 0, 1);
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.16;
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.context);
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return null;
      }
    }
    return this.context;
  }

  /** Phat mot cue; intensity nen nam trong khoang 0..1. */
  public play(id: SoundId, intensity = 1): void {
    void this.playInternal(id, intensity);
  }

  /** Phát thân âm Q cùng một lớp nhận diện ngắn theo đúng lớp nhân vật. */
  public playClassSkill(kind: string, intensity = 1): void {
    this.play('class-skill', intensity * 0.82);
    const accent = CLASS_SKILL_ACCENTS[kind as ClassSkillSoundKind];
    if (accent) this.play(accent, intensity * 0.42);
  }

  public playRagePhase(phase: keyof typeof RAGE_SOUND_CUES, intensity = 1): void {
    this.play(RAGE_SOUND_CUES[phase], intensity);
  }

  public playUltimatePhase(phase: keyof typeof ULTIMATE_SOUND_CUES, intensity = 1): void {
    this.play(ULTIMATE_SOUND_CUES[phase], intensity);
  }

  private async playInternal(id: SoundId, intensity: number): Promise<void> {
    // Không khởi tạo AudioContext khi người chơi đã tắt tiếng; ngoài việc đúng
    // mong đợi cài đặt, điều này còn tránh đánh thức audio thread không cần thiết.
    if (this.settings.masterVolume <= 0 || this.settings.effectsVolume <= 0 || document.hidden) return;
    const context = await this.ensureContext();
    if (!context || !this.master) return;
    const reservation = this.budget.reserve(id, performance.now());
    if (!reservation) return;
    if (reservation.preemptToken !== undefined) this.fadeOutVoice(reservation.preemptToken, context.currentTime);

    const profile = SOUND_PROFILES[id];
    const now = context.currentTime;
    const output = context.createGain();
    const effects = clamp(this.settings.effectsVolume * intensity, 0, 1.35);
    output.gain.setValueAtTime(Math.max(0.0001, profile.gain * effects), now);
    output.connect(this.master);

    const voice: ActiveVoice = { output, sources: [], remainingSources: 0 };
    this.activeVoices.set(reservation.token, voice);
    const pitchScale = this.nextPitchScale(id, profile.pitchJitter ?? 0);
    for (const layer of profile.tones) this.addTone(context, now, output, voice, layer, pitchScale, reservation.token);
    if (profile.noise && this.noiseBuffer) this.addNoise(context, now, output, voice, profile.noise, reservation.token);
    if (voice.remainingSources === 0) this.finishVoice(reservation.token);
  }

  /** Chuỗi biến thiên xen kẽ ngăn hai phát liên tiếp nghe giống hệt nhau. */
  private nextPitchScale(id: SoundId, jitter: number): number {
    if (jitter <= 0) return 1;
    const pattern = [-0.58, 0.34, -0.16, 0.66, -0.38, 0.11, 0.47, -0.05] as const;
    const index = this.variationIndex.get(id) ?? 0;
    this.variationIndex.set(id, index + 1);
    const base = pattern[index % pattern.length] ?? 0;
    const microVariation = (Math.random() * 2 - 1) * 0.09;
    return 1 + (base + microVariation) * jitter;
  }

  private addTone(
    context: AudioContext,
    now: number,
    output: GainNode,
    voice: ActiveVoice,
    layer: ToneLayer,
    pitchScale: number,
    token: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + (layer.delay ?? 0);
    const end = start + layer.duration;
    const attack = Math.min(layer.attack ?? 0.004, layer.duration * 0.35);
    const release = Math.min(layer.release ?? layer.duration * 0.65, layer.duration * 0.85);
    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(Math.max(24, layer.frequency * pitchScale), start);
    if (layer.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, layer.endFrequency * pitchScale), end);
    this.applyEnvelope(gain.gain, start, end, attack, release, layer.gain);
    oscillator.connect(gain);
    gain.connect(output);
    this.registerSource(voice, oscillator, token);
    oscillator.start(start);
    oscillator.stop(end + 0.015);
  }

  private addNoise(
    context: AudioContext,
    now: number,
    output: GainNode,
    voice: ActiveVoice,
    layer: NoiseLayer,
    token: number,
  ): void {
    if (!this.noiseBuffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = now + (layer.delay ?? 0);
    const end = start + layer.duration;
    const attack = Math.min(layer.attack ?? 0.003, layer.duration * 0.35);
    const release = Math.min(layer.release ?? layer.duration * 0.7, layer.duration * 0.85);
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    filter.type = layer.filter;
    filter.frequency.value = layer.frequency;
    filter.Q.value = layer.filter === 'bandpass' ? 0.8 : 0.35;
    this.applyEnvelope(gain.gain, start, end, attack, release, layer.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    this.registerSource(voice, source, token);
    const availableOffset = Math.max(0, this.noiseBuffer.duration - layer.duration - 0.02);
    source.start(start, Math.random() * availableOffset, layer.duration + 0.01);
  }

  private applyEnvelope(gain: AudioParam, start: number, end: number, attack: number, release: number, peak: number): void {
    gain.setValueAtTime(0.0001, start);
    gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + Math.max(0.001, attack));
    gain.setValueAtTime(Math.max(0.0001, peak), Math.max(start + attack, end - release));
    gain.exponentialRampToValueAtTime(0.0001, end);
  }

  private registerSource(voice: ActiveVoice, source: AudioScheduledSourceNode, token: number): void {
    voice.sources.push(source);
    voice.remainingSources += 1;
    source.addEventListener('ended', () => {
      const current = this.activeVoices.get(token);
      if (!current) return;
      current.remainingSources -= 1;
      if (current.remainingSources <= 0) this.finishVoice(token);
    }, { once: true });
  }

  private fadeOutVoice(token: number, now: number): void {
    const voice = this.activeVoices.get(token);
    if (!voice) return;
    voice.output.gain.cancelScheduledValues(now);
    voice.output.gain.setValueAtTime(Math.max(0.0001, voice.output.gain.value), now);
    voice.output.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    for (const source of voice.sources) {
      try {
        source.stop(now + 0.03);
      } catch {
        // Source co the da ket thuc trong cung frame.
      }
    }
  }

  private finishVoice(token: number): void {
    const voice = this.activeVoices.get(token);
    if (!voice) return;
    voice.output.disconnect();
    this.activeVoices.delete(token);
    this.budget.release(token);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.85), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.965 + white * 0.035;
      samples[index] = clamp(white * 0.72 + previous * 2.4, -1, 1);
    }
    return buffer;
  }

  public updateAmbient(dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0 || this.settings.masterVolume <= 0.05 || this.settings.effectsVolume <= 0.05 || document.hidden) return;
    this.ambientTimer = 7 + Math.random() * 8;
    void this.playAmbientTone();
  }

  private async playAmbientTone(): Promise<void> {
    const context = await this.ensureContext();
    if (!context || !this.master) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 42 + Math.random() * 18;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.011 * clamp(this.settings.effectsVolume, 0, 1), now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 4.6);
  }
}
