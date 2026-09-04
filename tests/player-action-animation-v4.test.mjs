import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createDefaultSave } from '../dist/src/core/SaveSystem.js';
import { Player, primaryBehaviorFromWeaponId } from '../dist/src/game/Player.js';
import {
  createProceduralPlayerPose,
  drawProceduralPlayerSprite,
} from '../dist/src/render/ProceduralPlayerSprite.js';

const root = new URL('../', import.meta.url);
const characters = JSON.parse(await readFile(new URL('public/data/characters.json', root), 'utf8'));
const kael = characters.find((character) => character.id === 'kael-orin');
assert.ok(kael);

const idleInput = {
  getMoveVector: () => ({ x: 0, y: 0 }),
  getAimVector: () => ({ x: 0, y: 0 }),
};

function playerFor(character = kael) {
  return new Player(character, [], createDefaultSave());
}

function makeContext() {
  const fillRects = [];
  let depth = 0;
  return {
    fillRects,
    fillStyle: '#000000',
    globalAlpha: 1,
    get depth() { return depth; },
    save() { depth += 1; },
    restore() { depth -= 1; },
    translate() {},
    scale() {},
    fillRect(x, y, width, height) {
      fillRects.push({ x, y, width, height, color: this.fillStyle });
    },
  };
}

test('mỗi nhân vật khởi tạo đúng hành vi của vũ khí chính', () => {
  const expected = new Map([
    ['kael-orin', 'slash'],
    ['mira-voss', 'bow'],
    ['toren-vale', 'orbit'],
    ['nyra-sol', 'fireball'],
    ['zarek', 'poison'],
    ['elara', 'summon'],
    ['titan', 'bomb'],
    ['nova', 'nova'],
  ]);
  assert.equal(characters.length, expected.size);
  for (const character of characters) {
    const player = playerFor(character);
    assert.equal(player.primaryWeaponBehavior, expected.get(character.id));
    assert.equal(primaryBehaviorFromWeaponId(character.startWeapon), expected.get(character.id));
  }
});

test('đòn đánh chính phát serial và đi qua anticipation, release, recovery đúng thời gian', () => {
  const player = playerFor();
  player.triggerPrimaryAttack('slash', Math.PI / 4);
  const duration = player.actionDuration;

  assert.equal(player.primaryAttackSerial, 1);
  assert.equal(player.animationState, 'attack');
  assert.equal(player.actionKind, 'primary');
  assert.equal(player.actionPhase, 'anticipation');
  assert.equal(player.actionProgress, 0);

  player.update(duration * 0.45, idleInput, 0, 0);
  assert.equal(player.animationState, 'attack');
  assert.equal(player.actionPhase, 'release');
  assert.ok(Math.abs(player.actionProgress - 0.45) < 1e-9);

  player.update(duration * 0.25, idleInput, 0, 0);
  assert.equal(player.actionPhase, 'recovery');
  assert.ok(Math.abs(player.actionProgress - 0.7) < 1e-9);

  player.update(duration * 0.31, idleInput, 0, 0);
  assert.equal(player.actionKind, 'none');
  assert.equal(player.actionPhase, 'none');
  assert.equal(player.animationState, 'idle');
});

test('tốc đánh vượt thời lượng pose không reset release/recovery giữa chu kỳ', () => {
  const player = playerFor();
  player.triggerPrimaryAttack('gun', 0);
  assert.equal(player.actionDuration, 0.18);

  player.update(0.08, idleInput, 0, 0);
  assert.equal(player.actionPhase, 'release');
  const timerDuringRelease = player.actionTimer;
  player.triggerPrimaryAttack('gun', Math.PI);
  assert.equal(player.primaryAttackSerial, 2, 'serial vẫn phải ghi đủ phát bắn gameplay');
  assert.equal(player.actionTimer, timerDuringRelease, 'phát mới không được giật timer về đầu pose');
  assert.ok(player.actionDirection.x > 0.99, 'hướng pose được khóa đến hết recovery');

  player.update(0.07, idleInput, 0, 0);
  assert.equal(player.actionPhase, 'recovery');
  const timerDuringRecovery = player.actionTimer;
  player.triggerPrimaryAttack('gun', -Math.PI / 2);
  assert.equal(player.primaryAttackSerial, 3);
  assert.equal(player.actionTimer, timerDuringRecovery);

  player.update(0.031, idleInput, 0, 0);
  assert.equal(player.actionKind, 'none');
  assert.equal(player.animationState, 'idle');
});

test('góc ra đòn khóa đủ tám hướng thay vì chỉ lật trái/phải', () => {
  const signatures = new Set();
  for (let facing8 = 0; facing8 < 8; facing8 += 1) {
    const player = playerFor();
    const angle = facing8 * Math.PI / 4;
    player.triggerPrimaryAttack('slash', angle);
    assert.equal(player.facing8, facing8);
    assert.ok(Math.abs(player.actionDirection.x - Math.cos(angle)) < 1e-12);
    assert.ok(Math.abs(player.actionDirection.y - Math.sin(angle)) < 1e-12);
    signatures.add(`${player.facing8}|${player.actionDirection.x.toFixed(3)}|${player.actionDirection.y.toFixed(3)}`);
  }
  assert.equal(signatures.size, 8);
});

test('pose tấn công/cast có ba pha riêng và giữ vector hành động tám hướng', () => {
  const base = {
    facing8: 0,
    stridePhase: 0,
    movementBlend: 0,
    dashProgress: 0,
    time: 0,
    actionKind: 'primary',
    primaryWeaponBehavior: 'slash',
  };
  const anticipation = createProceduralPlayerPose({
    ...base, animationState: 'attack', actionProgress: 0.12, actionX: 1, actionY: 0,
  });
  const release = createProceduralPlayerPose({
    ...base, animationState: 'attack', actionProgress: 0.45, actionX: 1, actionY: 0,
  });
  const recovery = createProceduralPlayerPose({
    ...base, animationState: 'attack', actionProgress: 0.8, actionX: 1, actionY: 0,
  });
  assert.ok(anticipation.actionAnticipation > 0 && anticipation.actionRelease === 0);
  assert.ok(release.actionRelease > 0.9 && release.weaponSwing > anticipation.weaponSwing);
  assert.ok(recovery.actionRecovery > 0 && recovery.actionRelease === 0);

  const directionSignatures = new Set();
  for (let facing8 = 0; facing8 < 8; facing8 += 1) {
    const angle = facing8 * Math.PI / 4;
    const pose = createProceduralPlayerPose({
      ...base,
      facing8,
      animationState: 'attack',
      actionProgress: 0.45,
      actionX: Math.cos(angle),
      actionY: Math.sin(angle),
    });
    directionSignatures.add(`${pose.actionDirectionX.toFixed(3)}|${pose.actionDirectionY.toFixed(3)}|${pose.leanX}|${pose.leanY}`);
  }
  assert.equal(directionSignatures.size, 8);

  const cast = createProceduralPlayerPose({
    ...base,
    animationState: 'cast',
    actionKind: 'ability',
    actionProgress: 0.45,
    actionX: Math.SQRT1_2,
    actionY: -Math.SQRT1_2,
    abilityCastKind: 'active-rift-blooddraw',
  });
  assert.ok(cast.castLift > 0.9);
  assert.ok(cast.actionRelease > 0.9);
  assert.equal(cast.weaponSwing, 0);
});

test('attack/cast vẫn blend nhịp chân khi nhân vật đang di chuyển', () => {
  for (const animationState of ['attack', 'cast']) {
    const pose = createProceduralPlayerPose({
      facing8: 1,
      animationState,
      stridePhase: 0.25,
      movementBlend: 1,
      dashProgress: 0,
      time: 0,
      actionProgress: 0.45,
      actionKind: animationState === 'attack' ? 'primary' : 'ability',
      actionX: Math.SQRT1_2,
      actionY: Math.SQRT1_2,
      primaryWeaponBehavior: 'slash',
    });
    assert.notEqual(pose.legSwing, 0, `${animationState} không được đóng băng chân`);
    assert.ok(pose.leftFootPlant > 0.9, `${animationState} phải giữ foot planting`);
    assert.notEqual(pose.forwardStrideX, 0);
    assert.notEqual(pose.forwardStrideY, 0);
  }
});

test('kiếm và khiên thu mượt về hướng aim trong recovery', () => {
  for (const primaryWeaponBehavior of ['slash', 'orbit']) {
    const poseAt = (actionProgress) => createProceduralPlayerPose({
      facing8: 0,
      animationState: 'attack',
      stridePhase: 0,
      movementBlend: 0,
      dashProgress: 0,
      time: 0,
      actionProgress,
      actionKind: 'primary',
      actionX: 1,
      actionY: 0,
      primaryWeaponBehavior,
    });
    const release = poseAt(0.5);
    const recovery = poseAt(0.8);
    const settled = poseAt(0.995);
    assert.ok(release.weaponSwing > recovery.weaponSwing);
    assert.ok(recovery.weaponSwing > settled.weaponSwing);
    assert.ok(Math.abs(-1.28 + settled.weaponSwing * 2.55) < 0.02, `${primaryWeaponBehavior} phải gần hướng aim trước khi về idle`);
  }
});

test('pose kỹ năng được ưu tiên nhưng không phá dash/hurt', () => {
  const castPlayer = playerFor();
  castPlayer.triggerAbilityCast('rage-overdrive');
  const castTimer = castPlayer.actionTimer;
  castPlayer.triggerPrimaryAttack('bow', Math.PI);
  assert.equal(castPlayer.abilityCastSerial, 1);
  assert.equal(castPlayer.primaryAttackSerial, 1);
  assert.equal(castPlayer.actionKind, 'ability');
  assert.equal(castPlayer.animationState, 'cast');
  assert.equal(castPlayer.actionTimer, castTimer);

  const dashPlayer = playerFor();
  dashPlayer.triggerPrimaryAttack('slash', 0);
  assert.equal(dashPlayer.tryDash({ x: 0, y: 1 }), true);
  dashPlayer.update(0.02, idleInput, 0, 0);
  assert.equal(dashPlayer.animationState, 'dash');

  const hurtPlayer = playerFor();
  assert.ok(hurtPlayer.takeDamage(10, { chance: () => false }) > 0);
  hurtPlayer.triggerAbilityCast('ultimate-riftstorm');
  assert.equal(hurtPlayer.animationState, 'hurt');
  hurtPlayer.update(0.08, idleInput, 0, 0);
  assert.equal(hurtPlayer.animationState, 'hurt');
  hurtPlayer.update(0.09, idleInput, 0, 0);
  assert.equal(hurtPlayer.animationState, 'cast');
});

test('renderer procedural vẽ vũ khí và gesture bằng pixel ở mọi nhóm hành vi', () => {
  const behaviors = [
    'slash', 'bow', 'gun', 'darts', 'bomb', 'poison-bomb', 'lightning',
    'fireball', 'ice', 'laser', 'poison', 'orbit', 'summon', 'nova',
  ];
  for (const behavior of behaviors) {
    const context = makeContext();
    drawProceduralPlayerSprite(context, {
      characterId: 'mira-voss',
      feetY: 12,
      visualScale: 1,
      facing8: 7,
      animationState: 'attack',
      stridePhase: 0,
      movementBlend: 0,
      dashProgress: 0,
      time: 0.2,
      aimX: Math.SQRT1_2,
      aimY: -Math.SQRT1_2,
      actionProgress: 0.45,
      actionKind: 'primary',
      actionX: Math.SQRT1_2,
      actionY: -Math.SQRT1_2,
      primaryWeaponBehavior: behavior,
      hurtFlash: 0,
    });
    assert.equal(context.depth, 0, `${behavior} phải cân bằng save/restore`);
    assert.ok(context.fillRects.length >= 30, `${behavior} phải có silhouette vũ khí đủ rõ`);
  }

  const castContext = makeContext();
  drawProceduralPlayerSprite(castContext, {
    characterId: 'mira-voss',
    feetY: 12,
    visualScale: 1,
    facing8: 7,
    animationState: 'cast',
    stridePhase: 0,
    movementBlend: 0,
    dashProgress: 0,
    time: 0.2,
    aimX: Math.SQRT1_2,
    aimY: -Math.SQRT1_2,
    actionProgress: 0.45,
    actionKind: 'ability',
    actionX: Math.SQRT1_2,
    actionY: -Math.SQRT1_2,
    primaryWeaponBehavior: 'bow',
    abilityCastKind: 'ultimate-arrow-rain',
    hurtFlash: 0,
  });
  assert.ok(castContext.fillRects.length >= 40, 'cast pose cần hai tay, vũ khí và energy gesture');
});

test('procedural không vẽ attack/cast gesture chồng lên dash hoặc hurt', () => {
  const drawState = (animationState, actionKind) => {
    const context = makeContext();
    drawProceduralPlayerSprite(context, {
      characterId: 'mira-voss',
      feetY: 12,
      visualScale: 1,
      facing8: 2,
      animationState,
      stridePhase: 0.3,
      movementBlend: 1,
      dashProgress: 0.35,
      time: 0.2,
      aimX: 0,
      aimY: 1,
      recoilX: -1,
      recoilY: 0,
      actionProgress: 0.45,
      actionKind,
      actionX: -1,
      actionY: 0,
      primaryWeaponBehavior: 'bow',
      abilityCastKind: 'ultimate-arrow-rain',
      hurtFlash: 0,
    });
    return context.fillRects;
  };

  for (const animationState of ['dash', 'hurt']) {
    assert.deepEqual(
      drawState(animationState, 'ability'),
      drawState(animationState, 'none'),
      `${animationState} phải giữ nguyên silhouette, không chồng gesture`,
    );
  }
});

test('Hemotoxic Q dùng semantic độc thay vì bị nhận thành blood', () => {
  const drawCast = (abilityCastKind) => {
    const context = makeContext();
    drawProceduralPlayerSprite(context, {
      characterId: 'zarek',
      feetY: 12,
      visualScale: 1,
      facing8: 0,
      animationState: 'cast',
      stridePhase: 0,
      movementBlend: 0,
      dashProgress: 0,
      time: 0.2,
      aimX: 1,
      aimY: 0,
      actionProgress: 0.45,
      actionKind: 'ability',
      actionX: 1,
      actionY: 0,
      primaryWeaponBehavior: 'poison',
      abilityCastKind,
      hurtFlash: 0,
    });
    return new Set(context.fillRects.map((rect) => rect.color));
  };
  const blood = drawCast('active-rift-blooddraw');
  const hemotoxic = drawCast('active-hemotoxic-draw');
  assert.ok(blood.has('#d7444f'));
  assert.equal(hemotoxic.has('#d7444f'), false);
  assert.ok(hemotoxic.has('#49a856'));
});

test('Renderer atlas tiêu thụ event/behavior và có fallback gesture Q-E-R', async () => {
  const source = await readFile(new URL('src/render/Renderer.ts', root), 'utf8');
  assert.match(source, /player\.actionProgress/u);
  assert.match(source, /player\.actionDirection/u);
  assert.match(source, /player\.primaryWeaponBehavior/u);
  assert.match(source, /player\.abilityCastKind/u);
  assert.match(source, /drawHeldPrimaryWeapon\(player,/u);
  assert.match(source, /drawPlayerCastGesture\(\s*player\.abilityCastKind,/u);
  assert.match(source, /behavior === 'slash'/u);
  assert.match(source, /behavior === 'bow'/u);
  assert.match(source, /behavior === 'bomb' \|\| behavior === 'poison-bomb'/u);
  assert.match(source, /const locomotionAnimation = player\.animationState === 'run'[\s\S]*?'attack'[\s\S]*?'cast'/u);
  assert.match(source, /const recoveryEase = recoveryRatio \* recoveryRatio/u);
});

test('runtime chỉ nối đánh thường của vũ khí chính và nối đủ Q-E-R vào cast pose', async () => {
  const [weapons, skills] = await Promise.all([
    readFile(new URL('src/game/WeaponSystem.ts', root), 'utf8'),
    readFile(new URL('src/game/SkillSystem.ts', root), 'utf8'),
  ]);
  assert.match(weapons, /this\.runtime\.slot === 'primary'[\s\S]*?triggerPrimaryAttack\?\.\(this\.config\.behavior, baseAngle\)/u);
  assert.match(skills, /triggerAbilityCast\(`active-\$\{kind\}`, castDirection\)/u);
  assert.match(skills, /triggerAbilityCast\(`rage-\$\{rage\?\.kind/u);
  assert.match(skills, /triggerAbilityCast\(`ultimate-\$\{ultimate\?\.kind/u);
});
