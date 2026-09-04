import { clamp, TAU } from '../core/MathUtils.js';
import type { WeaponBehavior } from '../core/Types.js';
import type { PlayerActionKind, PlayerAnimationState } from '../game/Player.js';

export type ProceduralPlayerSilhouette =
  | 'scout'
  | 'guardian'
  | 'mage'
  | 'rogue'
  | 'shepherd'
  | 'colossus'
  | 'astral';

export type ProceduralPlayerAccessory = 'bow' | 'hammer' | 'flame' | 'daggers' | 'echo-orb' | 'gauntlet' | 'star-orb';

export interface ProceduralPlayerStyle {
  name: string;
  silhouette: ProceduralPlayerSilhouette;
  accessory: ProceduralPlayerAccessory;
  outline: string;
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
  skin: string;
  hair: string;
}

/**
 * Bảy nhân vật chưa có atlas riêng vẫn giữ silhouette, bảng màu và vũ khí
 * nhận diện từ portrait. Kael không nằm trong bảng này vì tiếp tục dùng atlas
 * 8 hướng vẽ tay của mình.
 */
export const PROCEDURAL_PLAYER_STYLES = {
  'mira-voss': {
    name: 'Mira Voss', silhouette: 'scout', accessory: 'bow',
    outline: '#120d25', primary: '#261b42', secondary: '#6847a3', accent: '#72e4df',
    highlight: '#f0e8ff', skin: '#efbea9', hair: '#7b43bd',
  },
  'toren-vale': {
    name: 'Toren Vale', silhouette: 'guardian', accessory: 'hammer',
    outline: '#080b12', primary: '#101622', secondary: '#3e4b63', accent: '#f09a32',
    highlight: '#dce8f5', skin: '#d99f77', hair: '#202a3d',
  },
  'nyra-sol': {
    name: 'Nyra Sol', silhouette: 'mage', accessory: 'flame',
    outline: '#16080d', primary: '#17121f', secondary: '#742038', accent: '#ff9a38',
    highlight: '#ffd58b', skin: '#f0b29d', hair: '#d72d49',
  },
  zarek: {
    name: 'Zarek Venn', silhouette: 'rogue', accessory: 'daggers',
    outline: '#07120b', primary: '#132019', secondary: '#3f9b3e', accent: '#d9f04a',
    highlight: '#ffb34f', skin: '#b88967', hair: '#101b14',
  },
  elara: {
    name: 'Elara Quill', silhouette: 'shepherd', accessory: 'echo-orb',
    outline: '#17111a', primary: '#3a273c', secondary: '#ad795c', accent: '#75e5e1',
    highlight: '#fff0c4', skin: '#efbe9f', hair: '#e8bd78',
  },
  titan: {
    name: 'Titan Rho', silhouette: 'colossus', accessory: 'gauntlet',
    outline: '#090c14', primary: '#1c263b', secondary: '#5f6d88', accent: '#d38a31',
    highlight: '#dce6ef', skin: '#a37b68', hair: '#30364c',
  },
  nova: {
    name: 'Nova Lys', silhouette: 'astral', accessory: 'star-orb',
    outline: '#100c28', primary: '#26194f', secondary: '#6940b2', accent: '#8d7cff',
    highlight: '#f1ddff', skin: '#e5b7c1', hair: '#5f35aa',
  },
} as const satisfies Record<string, ProceduralPlayerStyle>;

const DEFAULT_STYLE: ProceduralPlayerStyle = {
  name: 'Hộ Vệ', silhouette: 'guardian', accessory: 'gauntlet',
  outline: '#071116', primary: '#1f4b50', secondary: '#4d9290', accent: '#f1cf68',
  highlight: '#e8ffff', skin: '#d6a486', hair: '#263f45',
};

const FACING_VECTORS = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
] as const;

export interface ProceduralPlayerPose {
  facing8: number;
  directionX: number;
  directionY: number;
  headOffsetX: number;
  headOffsetY: number;
  leanX: number;
  leanY: number;
  bob: number;
  armSwing: number;
  legSwing: number;
  forwardStrideX: number;
  forwardStrideY: number;
  anticipation: number;
  recovery: number;
  leftFootPlant: number;
  rightFootPlant: number;
  dashSmear: number;
  recoilX: number;
  recoilY: number;
  actionDirectionX: number;
  actionDirectionY: number;
  actionAnticipation: number;
  actionRelease: number;
  actionRecovery: number;
  weaponSwing: number;
  weaponRecoil: number;
  castLift: number;
  showFace: boolean;
  sideFacing: -1 | 0 | 1;
}

export interface ProceduralPlayerPoseInput {
  facing8: number;
  animationState: PlayerAnimationState;
  stridePhase: number;
  movementBlend: number;
  dashProgress: number;
  time: number;
  recoilX?: number;
  recoilY?: number;
  actionProgress?: number;
  actionKind?: PlayerActionKind;
  actionX?: number;
  actionY?: number;
  primaryWeaponBehavior?: WeaponBehavior;
  abilityCastKind?: string;
}

export interface DrawProceduralPlayerInput extends ProceduralPlayerPoseInput {
  characterId: string;
  feetY: number;
  visualScale: number;
  aimX: number;
  aimY: number;
  hurtFlash: number;
  reducedEffects?: boolean;
}

export function getProceduralPlayerStyle(characterId: string): ProceduralPlayerStyle {
  return PROCEDURAL_PLAYER_STYLES[characterId as keyof typeof PROCEDURAL_PLAYER_STYLES] ?? DEFAULT_STYLE;
}

/** Tạo pose thuần để renderer và test dùng chung, không phụ thuộc Canvas. */
export function createProceduralPlayerPose(input: ProceduralPlayerPoseInput): ProceduralPlayerPose {
  const facing8 = ((Math.round(input.facing8) % 8) + 8) % 8;
  const facing = FACING_VECTORS[facing8] ?? FACING_VECTORS[0];
  const movementBlend = clamp(input.movementBlend, 0, 1);
  const locomotionState = input.animationState === 'run'
    || input.animationState === 'attack'
    || input.animationState === 'cast';
  const blend = input.animationState === 'dash' ? 1 : locomotionState ? movementBlend : 0;
  const dashProgress = clamp(input.dashProgress, 0, 1);
  const strideWave = input.animationState === 'dash'
    ? Math.cos(dashProgress * Math.PI)
    : Math.sin(input.stridePhase * TAU) * blend;
  const anticipation = input.animationState === 'run'
    ? clamp((0.38 - movementBlend) / 0.38, 0, 1)
    : 0;
  const recovery = input.animationState === 'idle'
    ? clamp(movementBlend / 0.34, 0, 1)
    : 0;
  const rawRecoilMagnitude = Math.hypot(input.recoilX ?? 0, input.recoilY ?? 0);
  const recoilStrength = input.animationState === 'hurt' ? 1 : 0;
  const recoilX = rawRecoilMagnitude > 0.01 ? (input.recoilX ?? 0) / rawRecoilMagnitude * recoilStrength : -facing.x * recoilStrength;
  const recoilY = rawRecoilMagnitude > 0.01 ? (input.recoilY ?? 0) / rawRecoilMagnitude * recoilStrength : -facing.y * recoilStrength;
  const hurtJolt = input.animationState === 'hurt' ? Math.sin(input.time * 42) * 0.55 : 0;
  const legSwing = Math.round(strideWave * 2);
  const armSwing = -legSwing;
  // Khóa chân ở hai cực chu kỳ thay vì để bàn chân trượt đều. Đây là dấu hiệu
  // hình học nên vẫn đọc rõ khi atlas bị thu nhỏ hoặc bật chế độ mù màu.
  const plantStrength = locomotionState
    ? Math.pow(Math.abs(Math.sin(input.stridePhase * TAU)), 5) * movementBlend
    : recovery * 0.7;
  const leftFootPlant = strideWave >= 0 ? plantStrength : 0;
  const rightFootPlant = strideWave < 0 ? plantStrength : 0;
  const dashSmear = input.animationState === 'dash'
    ? clamp((1 - dashProgress) * 0.72 + Math.sin(dashProgress * Math.PI) * 0.28, 0, 1)
    : 0;
  const actionProgress = clamp(input.actionProgress ?? 0, 0, 1);
  const actionActive = input.animationState === 'attack' || input.animationState === 'cast';
  const actionMagnitude = Math.hypot(input.actionX ?? 0, input.actionY ?? 0);
  const actionDirectionX = actionMagnitude > 0.05 ? (input.actionX ?? 0) / actionMagnitude : facing.x;
  const actionDirectionY = actionMagnitude > 0.05 ? (input.actionY ?? 0) / actionMagnitude : facing.y;
  const actionAnticipation = !actionActive ? 0
    : actionProgress < 0.26 ? Math.sin(actionProgress / 0.26 * Math.PI * 0.5)
      : actionProgress < 0.4 ? 1 - (actionProgress - 0.26) / 0.14 : 0;
  const actionRelease = !actionActive || actionProgress < 0.2 || actionProgress > 0.68 ? 0
    : Math.sin((actionProgress - 0.2) / 0.48 * Math.PI);
  const actionRecovery = !actionActive || actionProgress < 0.56 ? 0
    : Math.sin((actionProgress - 0.56) / 0.44 * Math.PI);
  const behavior = input.primaryWeaponBehavior ?? 'slash';
  const meleeRelease = behavior === 'slash' || behavior === 'orbit';
  const throwRelease = behavior === 'bomb' || behavior === 'poison-bomb';
  const rangedRelease = behavior === 'bow' || behavior === 'gun' || behavior === 'darts' || behavior === 'laser';
  const actionLean = input.animationState === 'cast'
    ? actionRelease * 0.8 - actionAnticipation * 0.5
    : (meleeRelease || throwRelease ? actionRelease * 1.8 : 0) - (rangedRelease ? actionRelease * 1.25 : 0) - actionAnticipation;
  const releaseSwing = clamp(actionProgress / 0.5, 0, 1);
  const recoveryRatio = clamp((actionProgress - 0.58) / 0.42, 0, 1);
  const recoveryEase = recoveryRatio * recoveryRatio * (3 - recoveryRatio * 2);
  // 0.5 tương ứng đúng hướng aim trong công thức góc vung bên dưới. Kiếm và
  // khiên vì thế thu dần về thế thủ thay vì giữ ở cuối cung rồi bật về idle.
  const weaponSwing = input.animationState === 'attack' && meleeRelease
    ? releaseSwing + (0.5 - releaseSwing) * recoveryEase
    : 0;
  const weaponRecoil = input.animationState === 'attack' && rangedRelease ? actionRelease : 0;
  const castLift = input.animationState === 'cast'
    ? Math.max(actionAnticipation * 0.65, actionRelease, actionRecovery * 0.45)
    : throwRelease ? actionRelease * 0.7 : 0;

  return {
    facing8,
    directionX: facing.x,
    directionY: facing.y,
    headOffsetX: Math.round(facing.x * 2),
    headOffsetY: Math.round(facing.y),
    leanX: Math.round(
      facing.x * (input.animationState === 'dash' ? 3 : 1.5 * blend - anticipation * 1.2 + recovery * 0.7)
      + actionDirectionX * actionLean + recoilX * 2.6 + hurtJolt,
    ),
    leanY: Math.round(
      facing.y * (input.animationState === 'dash' ? 2 : blend - anticipation * 0.8 + recovery * 0.45)
      + actionDirectionY * actionLean * 0.72 + recoilY * 1.9,
    ),
    bob: input.animationState === 'dash' ? -2
      : input.animationState === 'run' ? Math.round(anticipation) - Math.round(plantStrength * blend)
        : input.animationState === 'hurt' ? Math.round(hurtJolt + 1)
          : actionActive ? Math.round(actionAnticipation - castLift * 2 - plantStrength * 0.8)
            : Math.round(recovery * 0.6 + Math.sin(input.time * 2.6) * 0.35),
    armSwing,
    legSwing,
    forwardStrideX: Math.round(facing.x * legSwing),
    forwardStrideY: Math.round(facing.y * legSwing),
    anticipation,
    recovery,
    leftFootPlant,
    rightFootPlant,
    dashSmear,
    recoilX,
    recoilY,
    actionDirectionX,
    actionDirectionY,
    actionAnticipation,
    actionRelease,
    actionRecovery,
    weaponSwing,
    weaponRecoil,
    castLift,
    showFace: facing.y > -0.38,
    sideFacing: facing.x > 0.38 ? 1 : facing.x < -0.38 ? -1 : 0,
  };
}

interface PixelPainter {
  ctx: CanvasRenderingContext2D;
  unit: number;
  style: ProceduralPlayerStyle;
  pose: ProceduralPlayerPose;
  aimX: number;
  aimY: number;
  flash: number;
  primaryWeaponBehavior: WeaponBehavior;
  actionKind: PlayerActionKind;
  abilityCastKind: string;
  reducedEffects: boolean;
  animationState: PlayerAnimationState;
}

interface WeaponVisualPalette {
  outline: string;
  body: string;
  core: string;
}

function weaponVisualPalette(behavior: WeaponBehavior): WeaponVisualPalette {
  switch (behavior) {
    case 'slash': return { outline: '#210b0d', body: '#f4e8cf', core: '#d7434d' };
    case 'bow': return { outline: '#102431', body: '#9edcec', core: '#fff2bb' };
    case 'gun': return { outline: '#071419', body: '#668d98', core: '#ffb43d' };
    case 'darts': return { outline: '#171b20', body: '#e8f6f4', core: '#e04e55' };
    case 'bomb': return { outline: '#081116', body: '#778991', core: '#ffae3d' };
    case 'poison-bomb': return { outline: '#07180e', body: '#4c8757', core: '#c9f253' };
    case 'lightning': return { outline: '#07181d', body: '#72e9f5', core: '#f4ffff' };
    case 'fireball': return { outline: '#2a0a08', body: '#ee4b2f', core: '#ffd34f' };
    case 'ice': return { outline: '#0b2834', body: '#88d7ed', core: '#efffff' };
    case 'laser': return { outline: '#07161d', body: '#43bdd8', core: '#ffffff' };
    case 'poison': return { outline: '#07170d', body: '#49a856', core: '#d7f16b' };
    case 'orbit': return { outline: '#10191d', body: '#b9c8cb', core: '#ffb04a' };
    case 'summon': return { outline: '#07191d', body: '#58c7d4', core: '#efffff' };
    case 'nova': return { outline: '#07161f', body: '#6bcce8', core: '#ffffff' };
  }
}

function rotateDirection(x: number, y: number, angle: number): { x: number; y: number } {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

function block(painter: PixelPainter, x: number, y: number, width: number, height: number, color: string): void {
  painter.ctx.fillStyle = painter.flash > 0.55 ? painter.style.highlight : color;
  painter.ctx.fillRect(
    Math.round(x * painter.unit),
    Math.round(y * painter.unit),
    Math.max(painter.unit, Math.round(width * painter.unit)),
    Math.max(painter.unit, Math.round(height * painter.unit)),
  );
}

function pixelLine(
  painter: PixelPainter,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
): void {
  const dx = x2 - x;
  const dy = y2 - y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    block(painter, Math.round(x + dx * ratio) - Math.floor(width / 2), Math.round(y + dy * ratio) - Math.floor(width / 2), width, width, color);
  }
}

function torsoHalfWidth(style: ProceduralPlayerStyle): number {
  if (style.silhouette === 'colossus') return 6;
  if (style.silhouette === 'guardian') return 5;
  if (style.silhouette === 'shepherd') return 4.5;
  return 4;
}

/**
 * Dấu hiệu lớn nằm sau thân người. Ở kích thước gameplay, khối tóc/mũ/sừng
 * đọc nhanh hơn các chi tiết khuôn mặt và giữ nhân vật gần với portrait.
 */
function drawPortraitBackDetails(painter: PixelPainter): void {
  const { style, pose } = painter;
  const headX = pose.headOffsetX;
  const headY = -27 + pose.headOffsetY;
  const facingSide = pose.sideFacing === 0 ? 1 : pose.sideFacing;

  switch (style.accessory) {
    case 'bow':
      // Mái tóc tím dài và ống tên chéo đặc trưng của Mira.
      block(painter, headX - 5, headY + 2, 10, 12, style.hair);
      block(painter, headX - 6, headY + 6, 3, 17, style.hair);
      block(painter, headX + 3, headY + 6, 3, 17, style.hair);
      block(painter, headX - 4, headY + 14, 2, 7, style.secondary);
      pixelLine(painter, -7 * facingSide, -20, -6 * facingSide, -7, style.outline, 3);
      pixelLine(painter, -7 * facingSide, -24, -7 * facingSide, -13, style.highlight);
      pixelLine(painter, -5 * facingSide, -23, -6 * facingSide, -13, style.accent);
      break;
    case 'hammer':
      // Toren là một khối giáp tối, viền lò rèn vàng cam thay vì giáp xanh chung.
      block(painter, headX - 6, headY - 1, 12, 10, style.outline);
      block(painter, -7, -20, 14, 8, style.primary);
      block(painter, -8, -19, 3, 7, style.accent);
      block(painter, 5, -19, 3, 7, style.accent);
      break;
    case 'flame':
      // Nyra có hai dải tóc đỏ dài mở rộng silhouette hai bên vai.
      block(painter, headX - 5, headY + 2, 10, 10, style.hair);
      block(painter, headX - 7, headY + 6, 4, 18, style.hair);
      block(painter, headX + 3, headY + 6, 4, 18, style.hair);
      block(painter, headX - 8, headY + 15, 3, 6, style.secondary);
      block(painter, headX + 5, headY + 14, 3, 7, style.secondary);
      break;
    case 'daggers':
      // Mũ trùm xanh bất đối xứng lớn là dấu hiệu mạnh nhất của Zarek.
      block(painter, headX - 6, headY - 2, 12, 11, style.secondary);
      block(painter, headX - 8, headY, 4, 9, style.secondary);
      block(painter, headX + 4 * facingSide, headY - 4, 5, 5, style.secondary);
      pixelLine(painter, -6, -12, -9, -4, style.highlight, 2);
      pixelLine(painter, 6, -12, 9, -4, style.highlight, 2);
      break;
    case 'echo-orb':
      // Khối tóc vàng dày, hai lọn xoắn và bím tóc của Elara.
      block(painter, headX - 6, headY, 12, 11, style.hair);
      block(painter, headX - 7, headY + 4, 3, 11, style.hair);
      block(painter, headX + 4, headY + 4, 3, 11, style.hair);
      block(painter, headX - 8, headY + 8, 3, 4, style.secondary);
      block(painter, headX + 5, headY + 9, 3, 4, style.secondary);
      break;
    case 'gauntlet':
      // Titan có vai giáp và sừng lớn hơn hẳn mọi Hộ Vệ khác.
      block(painter, -9, -21, 18, 9, style.outline);
      block(painter, -10, -19, 5, 8, style.secondary);
      block(painter, 5, -19, 5, 8, style.secondary);
      pixelLine(painter, headX - 4, headY + 1, headX - 10, headY - 5, style.accent, 3);
      pixelLine(painter, headX + 4, headY + 1, headX + 10, headY - 5, style.accent, 3);
      break;
    case 'star-orb':
      // Tóc/áo choàng tím và hai cánh tinh giới tạo đường bao của Nova.
      block(painter, headX - 6, headY + 1, 12, 12, style.hair);
      block(painter, headX - 7, headY + 6, 3, 14, style.secondary);
      block(painter, headX + 4, headY + 6, 3, 14, style.secondary);
      pixelLine(painter, headX - 4, headY + 1, headX - 8, headY - 4, style.accent, 2);
      pixelLine(painter, headX + 4, headY + 1, headX + 8, headY - 4, style.accent, 2);
      break;
  }
}

function drawCapeAndRearDetails(painter: PixelPainter): void {
  const { style, pose } = painter;
  const capeShift = Math.round(-pose.directionX * 2);
  if (style.silhouette === 'mage' || style.silhouette === 'shepherd' || style.silhouette === 'astral') {
    block(painter, -4 + capeShift, -16, 8, 10, style.primary);
    block(painter, -3 + capeShift, -6, 6, 3, style.secondary);
  } else if (style.silhouette === 'scout' || style.silhouette === 'rogue') {
    block(painter, -3 + capeShift, -15, 6, 8, style.primary);
    block(painter, -2 + capeShift, -7, 4, 2, style.secondary);
  }
  if (pose.directionY < -0.35) block(painter, -3 + pose.headOffsetX, -25 + pose.headOffsetY, 6, 4, style.hair);
}

function drawLegs(painter: PixelPainter): void {
  const { style, pose } = painter;
  const spread = style.silhouette === 'colossus' ? 3 : 2;
  const legWidth = style.silhouette === 'colossus' || style.silhouette === 'guardian' ? 3 : 2;
  const strideX = pose.forwardStrideX;
  const strideY = pose.forwardStrideY;
  const boot = style.silhouette === 'astral' || style.silhouette === 'mage' ? style.primary : style.outline;

  const leftPlant = pose.leftFootPlant > 0.48;
  const rightPlant = pose.rightFootPlant > 0.48;
  const leftBootExtra = leftPlant ? 2 : 0;
  const rightBootExtra = rightPlant ? 2 : 0;
  block(painter, -spread + strideX, -8 + strideY, legWidth, 6, style.secondary);
  block(painter, -spread + strideX - leftBootExtra, -2 + strideY, legWidth + 1 + leftBootExtra, leftPlant ? 3 : 2, boot);
  block(painter, spread - legWidth - strideX, -8 - strideY, legWidth, 6, style.primary);
  block(painter, spread - legWidth - strideX, -2 - strideY, legWidth + 1 + rightBootExtra, rightPlant ? 3 : 2, boot);

  if (leftPlant || rightPlant) {
    // Vạch tiếp đất một pixel làm rõ nhịp chân mà không cần rung camera.
    const footX = leftPlant ? -spread + strideX - leftBootExtra : spread - legWidth - strideX;
    const footY = leftPlant ? strideY : -strideY;
    block(painter, footX - 1, footY, legWidth + 3 + (leftPlant ? leftBootExtra : rightBootExtra), 1, style.accent);
  }
}

function drawArms(painter: PixelPainter): void {
  const { style, pose } = painter;
  const half = torsoHalfWidth(style);
  const behavior = painter.primaryWeaponBehavior;
  // actionKind vẫn được giữ trong lúc dash/hurt để pose có thể tiếp tục sau
  // đó, nhưng tuyệt đối không được vẽ gesture chồng lên smear hoặc hit recoil.
  const casting = painter.animationState === 'cast' && painter.actionKind === 'ability';
  const attacking = painter.animationState === 'attack' && painter.actionKind === 'primary';
  const aimLength = behavior === 'orbit' || behavior === 'bomb' || behavior === 'poison-bomb' ? 6 : 7;
  const aimMagnitude = Math.hypot(painter.aimX, painter.aimY);
  const idleAimX = aimMagnitude > 0.05 ? painter.aimX / aimMagnitude : pose.directionX;
  const idleAimY = aimMagnitude > 0.05 ? painter.aimY / aimMagnitude : pose.directionY;
  let aimX = attacking || casting ? pose.actionDirectionX : idleAimX;
  let aimY = attacking || casting ? pose.actionDirectionY : idleAimY;
  const offhandSide = pose.sideFacing === 0 ? -1 : -pose.sideFacing;
  const gripAimX = aimX;
  const gripAimY = aimY;
  const perpendicularX = -gripAimY;
  const perpendicularY = gripAimX;

  if (casting) {
    const focusDistance = 8 + pose.castLift * 3;
    const focusX = Math.round(aimX * focusDistance);
    const focusY = -18 + Math.round(aimY * 4 - pose.castLift * 4);
    const handSpread = 3 + Math.round(pose.actionAnticipation * 2);
    const mainHandX = Math.round(focusX - aimX * 2 + perpendicularX * handSpread);
    const mainHandY = Math.round(focusY - aimY * 2 + perpendicularY * handSpread);
    const offHandX = Math.round(focusX - aimX * 2 - perpendicularX * handSpread);
    const offHandY = Math.round(focusY - aimY * 2 - perpendicularY * handSpread);
    pixelLine(painter, -offhandSide * (half - 1), -15, mainHandX, mainHandY, style.primary, style.silhouette === 'colossus' ? 3 : 2);
    pixelLine(painter, offhandSide * (half - 1), -15, offHandX, offHandY, style.secondary, style.silhouette === 'colossus' ? 3 : 2);
    block(painter, mainHandX - 1, mainHandY - 1, 2, 2, style.skin);
    block(painter, offHandX - 1, offHandY - 1, 2, 2, style.skin);
    drawPrimaryWeapon(painter, mainHandX, mainHandY, aimX, aimY, offhandSide, offHandX, offHandY);
    drawCastGesture(painter, focusX, focusY);
    return;
  }

  if (attacking && (behavior === 'slash' || behavior === 'orbit')) {
    const sweep = rotateDirection(aimX, aimY, -1.28 + pose.weaponSwing * 2.55);
    aimX = sweep.x;
    aimY = sweep.y;
  }
  const throwWeapon = behavior === 'bomb' || behavior === 'poison-bomb';
  const recoilDistance = pose.weaponRecoil * (behavior === 'gun' || behavior === 'laser' ? 2.4 : 1.4);
  const throwDistance = throwWeapon ? pose.actionRelease * 4 - pose.actionAnticipation * 2.5 : 0;
  // Neo tay thuận lệch khỏi trục giữa cơ thể. Nếu chỉ nhân theo hướng aim,
  // vũ khí sẽ xuyên giữa ngực khi nhìn thẳng lên/xuống và tạo cảm giác như
  // một icon nổi thay vì vật đang được cầm.
  // Mép tay/vũ khí phải thoát hẳn khỏi silhouette, kể cả khi aim dọc. Mốc
  // 4.5px logic lớn hơn bán kính của các orb/bom nhỏ nên tâm vũ khí không
  // còn rơi vào trục ngực; Colossus cần thêm khoảng hở do thân rộng hơn.
  const gripSideOffset = style.silhouette === 'colossus' ? 5.5 : 4.5;
  const handX = Math.round(
    gripAimX * (aimLength + throwDistance - recoilDistance) + perpendicularX * gripSideOffset,
  );
  const handY = -14 + Math.round(
    gripAimY * (3 + Math.max(0, throwDistance))
    + perpendicularY * gripSideOffset
    - (throwWeapon ? pose.actionAnticipation * 6 : 0),
  );
  let offHandX = offhandSide * (half + 2);
  let offHandY = -11 + pose.armSwing;

  if (behavior === 'bow') {
    const drawStrength = Math.max(pose.actionAnticipation, pose.actionRelease * 0.35);
    offHandX = Math.round(handX - aimX * (3 + drawStrength * 4));
    offHandY = Math.round(handY - aimY * (3 + drawStrength * 4));
  } else if (behavior === 'gun' || behavior === 'laser') {
    offHandX = Math.round(handX - aimX * 3 - perpendicularX * 2);
    offHandY = Math.round(handY - aimY * 3 - perpendicularY * 2);
  }

  pixelLine(painter, offhandSide * (half - 1), -15, offHandX, offHandY, style.secondary, 2);
  block(painter, offHandX - 1, offHandY - 1, 2, 2, style.skin);
  pixelLine(painter, -offhandSide * (half - 1), -15, handX, handY, style.primary, style.silhouette === 'colossus' ? 3 : 2);
  block(painter, handX - 1, handY - 1, 2, 2, style.skin);
  drawPrimaryWeapon(painter, handX, handY, aimX, aimY, offhandSide, offHandX, offHandY);
}

function drawPrimaryWeapon(
  painter: PixelPainter,
  handX: number,
  handY: number,
  aimX: number,
  aimY: number,
  offhandSide: number,
  offHandX: number,
  offHandY: number,
): void {
  const { style, pose } = painter;
  const behavior = painter.primaryWeaponBehavior;
  const palette = weaponVisualPalette(behavior);
  const perpendicularX = -aimY;
  const perpendicularY = aimX;
  switch (behavior) {
    case 'slash': {
      pixelLine(painter, handX - aimX * 2, handY - aimY * 2, handX + aimX * 2, handY + aimY * 2, palette.outline, 2);
      pixelLine(painter, handX + aimX * 2, handY + aimY * 2, handX + aimX * 8, handY + aimY * 8, palette.body, 2);
      block(painter, handX + aimX * 6 + perpendicularX - 1, handY + aimY * 6 + perpendicularY - 1, 2, 2, palette.core);
      break;
    }
    case 'bow': {
      pixelLine(painter, handX + perpendicularX * 4, handY + perpendicularY * 4, handX, handY, palette.body, 2);
      pixelLine(painter, handX, handY, handX - perpendicularX * 4, handY - perpendicularY * 4, palette.body, 2);
      pixelLine(painter, handX + perpendicularX * 4, handY + perpendicularY * 4, offHandX, offHandY, palette.core);
      pixelLine(painter, offHandX, offHandY, handX - perpendicularX * 4, handY - perpendicularY * 4, palette.core);
      if (painter.actionKind === 'primary' && pose.actionRelease > 0.36) {
        pixelLine(painter, handX, handY, handX + aimX * 7, handY + aimY * 7, palette.core);
      }
      break;
    }
    case 'gun':
    case 'laser': {
      block(painter, handX - 2, handY - 1, 4, 3, palette.outline);
      pixelLine(painter, handX, handY, handX + aimX * 6, handY + aimY * 6, palette.body, 2);
      block(painter, handX + aimX * 6 - 1, handY + aimY * 6 - 1, 2, 2, palette.core);
      break;
    }
    case 'darts':
      pixelLine(painter, handX - aimX * 2, handY - aimY * 2, handX + aimX * 6, handY + aimY * 6, palette.body);
      block(painter, handX + aimX * 4 + perpendicularX - 1, handY + aimY * 4 + perpendicularY - 1, 2, 2, palette.core);
      break;
    case 'bomb':
    case 'poison-bomb': {
      const bombX = Math.round(handX + aimX * 2);
      const bombY = Math.round(handY + aimY * 2);
      block(painter, bombX - 2.5, bombY - 2.5, 5, 5, palette.outline);
      block(painter, bombX - 1.5, bombY - 1.5, 3, 3, palette.body);
      block(painter, bombX - 1, bombY - 1, 2, 2, palette.core);
      pixelLine(painter, bombX, bombY - 2, bombX + perpendicularX * 2, bombY - 5 + perpendicularY * 2, palette.core);
      break;
    }
    case 'orbit': {
      const shieldX = Math.round(handX + aimX * 2);
      const shieldY = Math.round(handY + aimY * 2);
      block(painter, shieldX - 3, shieldY - 4, 6, 8, palette.outline);
      block(painter, shieldX - 2, shieldY - 3, 4, 6, palette.body);
      block(painter, shieldX - 1, shieldY - 2, 2, 4, palette.core);
      block(painter, offhandSide * 6 - 1, -18, 2, 4, style.accent);
      break;
    }
    case 'lightning': {
      pixelLine(painter, handX - aimX * 2, handY - aimY * 2, handX + aimX * 3 + perpendicularX * 2, handY + aimY * 3 + perpendicularY * 2, palette.body, 2);
      pixelLine(painter, handX + aimX * 3 + perpendicularX * 2, handY + aimY * 3 + perpendicularY * 2, handX + aimX * 6 - perpendicularX, handY + aimY * 6 - perpendicularY, palette.core, 2);
      break;
    }
    case 'fireball': {
      block(painter, handX - 2.5, handY - 2.5, 5, 5, palette.body);
      block(painter, handX - 1, handY - 1, 2, 2, palette.core);
      pixelLine(painter, handX - aimX * 2, handY - aimY * 2, handX - aimX * 4 + perpendicularX, handY - aimY * 4 + perpendicularY, palette.core);
      break;
    }
    case 'ice': {
      pixelLine(painter, handX, handY, handX + aimX * 6, handY + aimY * 6, palette.core, 2);
      pixelLine(painter, handX + perpendicularX * 2, handY + perpendicularY * 2, handX + aimX * 5 + perpendicularX * 2, handY + aimY * 5 + perpendicularY * 2, palette.body, 2);
      pixelLine(painter, handX - perpendicularX * 2, handY - perpendicularY * 2, handX + aimX * 5 - perpendicularX * 2, handY + aimY * 5 - perpendicularY * 2, palette.body, 2);
      break;
    }
    case 'poison': {
      block(painter, handX - 2.5, handY - 2, 5, 4, palette.body);
      block(painter, handX - 1, handY - 1, 2, 2, palette.core);
      block(painter, handX - 3, handY - 3, 2, 2, palette.body);
      block(painter, handX + 1, handY - 4, 2, 2, palette.body);
      break;
    }
    case 'summon': {
      block(painter, handX - 2.5, handY - 2.5, 5, 5, palette.outline);
      block(painter, handX - 1.5, handY - 1.5, 3, 3, palette.body);
      block(painter, handX - 1, handY - 1, 2, 2, palette.core);
      block(painter, offhandSide * 7 - 1, -21, 2, 2, palette.core);
      break;
    }
    case 'nova': {
      block(painter, handX - 1, handY - 4, 2, 8, palette.body);
      block(painter, handX - 4, handY - 1, 8, 2, palette.body);
      block(painter, handX - 3, handY - 3, 2, 2, palette.body);
      block(painter, handX + 2, handY - 3, 2, 2, palette.body);
      block(painter, handX - 3, handY + 2, 2, 2, palette.body);
      block(painter, handX + 2, handY + 2, 2, 2, palette.body);
      block(painter, handX - 1.5, handY - 1.5, 3, 3, palette.core);
      break;
    }
  }
}

function drawCastGesture(painter: PixelPainter, focusX: number, focusY: number): void {
  const { pose } = painter;
  const kind = painter.abilityCastKind.toLowerCase();
  const ultimate = kind === 'ultimate' || kind.startsWith('ultimate-');
  const rage = kind === 'rage' || kind.startsWith('rage-');
  const blood = kind.includes('blood');
  const frost = kind.includes('frost') || kind.includes('gale');
  const toxic = kind.includes('toxic') || kind.includes('venom') || kind.includes('hemo');
  const palette = ultimate
    ? { outline: '#0b2631', body: '#72e5f2', core: '#ffffff' }
    : rage
      ? { outline: '#351408', body: '#f05b31', core: '#ffd456' }
      : blood
        ? { outline: '#27090d', body: '#d7444f', core: '#fff0d2' }
        : toxic
          ? weaponVisualPalette('poison')
          : frost
            ? weaponVisualPalette('ice')
            : weaponVisualPalette(painter.primaryWeaponBehavior);
  const pulse = clamp(Math.max(pose.actionAnticipation * 0.7, pose.actionRelease, pose.actionRecovery * 0.42), 0.2, 1);
  const arm = 3 + Math.round(pulse * (ultimate ? 5 : 3));
  block(painter, focusX - 2, focusY - 2, 4, 4, palette.outline);
  block(painter, focusX - 1, focusY - 1, 2, 2, palette.core);

  if (rage) {
    pixelLine(painter, focusX - arm, focusY - arm, focusX - 1, focusY - 1, palette.body, 2);
    pixelLine(painter, focusX + arm, focusY - arm, focusX + 1, focusY - 1, palette.body, 2);
    pixelLine(painter, focusX - arm, focusY + arm, focusX - 1, focusY + 1, palette.core);
    pixelLine(painter, focusX + arm, focusY + arm, focusX + 1, focusY + 1, palette.core);
  } else if (ultimate) {
    block(painter, focusX - 1, focusY - arm, 2, arm * 2 + 1, palette.core);
    block(painter, focusX - arm, focusY - 1, arm * 2 + 1, 2, palette.body);
    block(painter, focusX - arm - 1, focusY - 1, 2, 2, palette.core);
    block(painter, focusX + arm - 1, focusY - 1, 2, 2, palette.core);
  } else {
    // Góc vỡ thay vì chỉ đổi màu: tín hiệu Q vẫn đọc được với chế độ mù màu.
    block(painter, focusX - arm, focusY - arm, 3, 1, palette.body);
    block(painter, focusX - arm, focusY - arm, 1, 3, palette.body);
    block(painter, focusX + arm - 2, focusY - arm, 3, 1, palette.body);
    block(painter, focusX + arm, focusY - arm, 1, 3, palette.body);
    block(painter, focusX - arm, focusY + arm, 3, 1, palette.core);
    block(painter, focusX + arm - 2, focusY + arm, 3, 1, palette.core);
  }
  if (!painter.reducedEffects && pose.actionRelease > 0.25) {
    block(painter, focusX - arm - 2, focusY, 1, 1, palette.core);
    block(painter, focusX + arm + 2, focusY, 1, 1, palette.core);
  }
}

function drawTorso(painter: PixelPainter): void {
  const { style, pose } = painter;
  const half = torsoHalfWidth(style);
  const width = Math.round(half * 2);
  const shoulderExtra = style.silhouette === 'colossus' ? 2 : style.silhouette === 'guardian' ? 1 : 0;
  block(painter, -half - shoulderExtra, -19, width + shoulderExtra * 2, 4, style.outline);
  block(painter, -half, -18, width, 10, style.primary);
  block(painter, -half + 1, -17, width - 2, 3, style.secondary);
  block(painter, -1 + Math.round(pose.directionX), -17, 2, 8, style.accent);

  if (style.silhouette === 'guardian') {
    block(painter, -half - 2, -18, 3, 5, style.secondary);
    block(painter, half - 1, -18, 3, 5, style.secondary);
  } else if (style.silhouette === 'colossus') {
    block(painter, -half - 3, -19, 4, 7, style.secondary);
    block(painter, half - 1, -19, 4, 7, style.secondary);
    block(painter, -3, -15, 6, 4, style.highlight);
  } else if (style.silhouette === 'rogue') {
    block(painter, -half, -12, width, 2, style.accent);
  } else if (style.silhouette === 'astral') {
    block(painter, -half - 1, -10, 2, 3, style.accent);
    block(painter, half - 1, -11, 2, 4, style.accent);
  }
}

function drawHead(painter: PixelPainter): void {
  const { style, pose } = painter;
  const x = pose.headOffsetX;
  const y = -27 + pose.headOffsetY;
  const helmet = style.silhouette === 'guardian' || style.silhouette === 'colossus';
  const hood = style.silhouette === 'rogue' || style.silhouette === 'astral';

  block(painter, x - 4, y, 8, 8, style.outline);
  if (helmet) {
    block(painter, x - 3, y + 1, 6, 6, style.secondary);
    block(painter, x - 2, y + 3, 4, 2, style.outline);
    block(painter, x + pose.sideFacing, y + 3, 2, 1, style.accent);
    if (style.silhouette === 'colossus') {
      block(painter, x - 5, y + 1, 2, 5, style.accent);
      block(painter, x + 3, y + 1, 2, 5, style.accent);
    }
    return;
  }

  block(painter, x - 3, y + 1, 6, 6, pose.showFace ? style.skin : style.hair);
  block(painter, x - 4, y, 8, hood ? 4 : 3, hood ? style.primary : style.hair);
  if (style.silhouette === 'mage' || style.silhouette === 'scout' || style.silhouette === 'shepherd') {
    const hairSide = pose.sideFacing === 0 ? -1 : -pose.sideFacing;
    block(painter, x + hairSide * 4 - (hairSide < 0 ? 1 : 0), y + 2, 2, 8, style.hair);
  }
  if (hood) {
    block(painter, x - 4, y + 2, 2, 6, style.primary);
    block(painter, x + 2, y + 2, 2, 6, style.primary);
  }
  if (pose.showFace) {
    const eyeX = pose.sideFacing === 0 ? x - 2 : x + pose.sideFacing;
    block(painter, eyeX, y + 4, pose.sideFacing === 0 ? 4 : 2, 1, style.accent);
  } else {
    block(painter, x - 2, y + 4, 4, 2, style.hair);
  }
}

/** Chi tiết tương phản cao nằm trước thân, dùng để nhận ra nhân vật khi đứng yên. */
function drawPortraitFrontDetails(painter: PixelPainter): void {
  const { style, pose } = painter;
  const headX = pose.headOffsetX;
  const headY = -27 + pose.headOffsetY;
  const facingSide = pose.sideFacing === 0 ? 1 : pose.sideFacing;

  switch (style.accessory) {
    case 'bow':
      block(painter, headX - 3, headY + 1, 5, 2, style.hair);
      block(painter, headX - 4 * facingSide, headY + 3, 2, 2, style.accent);
      block(painter, -3, -16, 6, 2, style.highlight);
      break;
    case 'hammer':
      // Cổ áo chữ V vàng trong portrait và lõi lò rèn trên giáp ngực.
      pixelLine(painter, -5, -18, 0, -13, style.accent, 2);
      pixelLine(painter, 5, -18, 0, -13, style.accent, 2);
      block(painter, -2, -14, 4, 3, style.highlight);
      block(painter, headX - 2, headY + 4, 4, 1, style.accent);
      break;
    case 'flame':
      block(painter, headX - 3, headY + 1, 6, 2, style.hair);
      block(painter, -4, -19, 8, 2, style.outline);
      block(painter, -2, -17, 4, 3, style.accent);
      block(painter, -1, -18, 2, 2, style.highlight);
      break;
    case 'daggers':
      // Mép mũ xanh, mặt nạ đen và một mắt vàng của Zarek.
      pixelLine(painter, headX - 6, headY + 1, headX + 5, headY + 4, style.secondary, 3);
      block(painter, headX - 3, headY + 4, 6, 3, style.outline);
      block(painter, headX + facingSide, headY + 4, 2, 1, style.accent);
      block(painter, -7, -11, 3, 4, style.accent);
      block(painter, 4, -11, 3, 4, style.accent);
      break;
    case 'echo-orb': {
      const braidSide = pose.sideFacing === 0 ? 1 : -pose.sideFacing;
      pixelLine(painter, headX + braidSide * 4, headY + 6, headX + braidSide * 6, headY + 16, style.hair, 2);
      block(painter, headX + braidSide * 5 - 1, headY + 11, 2, 2, style.accent);
      const orbX = -braidSide * 9;
      block(painter, orbX - 2, -22, 4, 4, style.outline);
      block(painter, orbX - 1, -21, 2, 2, style.accent);
      break;
    }
    case 'gauntlet':
      block(painter, headX - 3, headY + 3, 6, 2, style.outline);
      block(painter, headX - 2, headY + 4, 4, 1, style.highlight);
      block(painter, -5, -16, 10, 3, style.accent);
      block(painter, -2, -15, 4, 2, style.highlight);
      break;
    case 'star-orb':
      block(painter, headX - 3, headY + 1, 6, 2, style.hair);
      block(painter, headX - 1, headY + 2, 2, 2, style.highlight);
      block(painter, -10, -21, 2, 2, style.accent);
      block(painter, 8, -17, 2, 2, style.highlight);
      block(painter, -8, -12, 2, 2, style.secondary);
      break;
  }
}

function drawBody(painter: PixelPainter): void {
  drawPortraitBackDetails(painter);
  drawCapeAndRearDetails(painter);
  drawLegs(painter);
  drawArms(painter);
  drawTorso(painter);
  drawHead(painter);
  drawPortraitFrontDetails(painter);
}

/** Vẽ hình người pixel toàn thân, có tay/chân đổi nhịp và hướng nhìn 8 chiều. */
export function drawProceduralPlayerSprite(ctx: CanvasRenderingContext2D, input: DrawProceduralPlayerInput): void {
  const style = getProceduralPlayerStyle(input.characterId);
  const pose = createProceduralPlayerPose(input);
  // 3 px ở tỉ lệ mặc định: đủ lớn để tóc/vũ khí không tan thành một khối
  // 40 px trên màn hình desktop, nhưng vẫn hạ về 2 px khi bodyScale nhỏ.
  const unit = Math.max(2, Math.round(2.6 * input.visualScale));
  const painter: PixelPainter = {
    ctx,
    unit,
    style,
    pose,
    aimX: input.aimX,
    aimY: input.aimY,
    flash: clamp(input.hurtFlash, 0, 1),
    primaryWeaponBehavior: input.primaryWeaponBehavior ?? 'slash',
    actionKind: input.actionKind ?? 'none',
    abilityCastKind: input.abilityCastKind ?? '',
    reducedEffects: input.reducedEffects ?? false,
    animationState: input.animationState,
  };

  ctx.save();
  ctx.translate(Math.round(pose.leanX * unit), Math.round(input.feetY + (pose.leanY + pose.bob) * unit));
  if (input.animationState === 'dash') {
    // Hai bóng kéo giãn ngắn tạo cảm giác bứt tốc; alpha thấp và không rung
    // toàn màn nên vẫn an toàn với người nhạy chuyển động.
    for (let layer = 2; layer >= 1; layer -= 1) {
      ctx.save();
      ctx.globalAlpha = pose.dashSmear * (layer === 1 ? 0.18 : 0.08);
      ctx.translate(
        Math.round(-pose.directionX * (5 + layer * 5) * unit),
        Math.round(-pose.directionY * (3 + layer * 3) * unit),
      );
      ctx.scale(1 + pose.dashSmear * 0.08, 1 - pose.dashSmear * 0.06);
      drawBody(painter);
      ctx.restore();
    }
  }
  if (input.animationState === 'hurt') {
    ctx.translate(Math.round(pose.recoilX * unit), Math.round(pose.recoilY * unit));
  }
  drawBody(painter);
  ctx.restore();
}
