import { AudioManager } from '../core/AudioManager.js';
import { InputManager } from '../core/InputManager.js';
import { distanceSquared, formatDecimal, formatNumber, hashString, normalize } from '../core/MathUtils.js';
import { RNG } from '../core/RNG.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { Camera } from '../render/Camera.js';
import { Renderer } from '../render/Renderer.js';
import { UIManager } from '../ui/UIManager.js';
import { formatPlayerStatTransition, formatPlayerStatValue } from '../ui/StatPresentation.js';
import { BossSystem } from './BossSystem.js';
import { CharacterPassiveSystem } from './CharacterPassiveSystem.js';
import { Director, resolveEnemySizeClass } from './Director.js';
import { EnemySpawner } from './EnemySpawner.js';
import { EnemySystem } from './EnemySystem.js';
import { ExperienceSystem } from './ExperienceSystem.js';
import { FloatingTextSystem } from './FloatingTextSystem.js';
import { LootSystem } from './LootSystem.js';
import { MetaProgression } from './MetaProgression.js';
import { NarrativeSystem } from './NarrativeSystem.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Player } from './Player.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { SkillSystem } from './SkillSystem.js';
import { StageManager } from './StageManager.js';
import { TerrainSystem } from './TerrainSystem.js';
import { UpgradeSystem } from './UpgradeSystem.js';
import { WeaponSystem } from './WeaponSystem.js';
export function resolveQaModes(searchText) {
    const search = new URLSearchParams(searchText);
    const qaMode = search.get('qa') === '1';
    return {
        qaMode,
        fastQaPacing: qaMode && search.get('fast') === '1',
    };
}
export class GameManager {
    data;
    saveSystem;
    assets;
    input;
    audio;
    meta;
    narrative;
    camera;
    renderer;
    ui;
    qaMode;
    fastQaPacing;
    state = 'loading';
    selectedCharacterId;
    selectedStageId;
    rng;
    player;
    spawner;
    director;
    enemySystem;
    projectiles;
    particles;
    floatingText;
    loot;
    weapons;
    skills;
    experience;
    upgrades;
    boss;
    passives;
    stageManager;
    terrain;
    enemySpatial = new SpatialHash(128);
    runStats = null;
    bossAftermathSpawned = 0;
    canvas;
    lastFrame = 0;
    totalTime = 0;
    running = false;
    victoryDelay = 0;
    bossAftermathElapsed = 0;
    pendingLevelChoice = false;
    bonusChoices = 0;
    runCommitted = false;
    summaryUnlocks = [];
    worldOriginX = 0;
    worldOriginY = 0;
    lastPassiveRender = 0;
    lastRenderedState = null;
    activeBriefing = null;
    pendingStoryEnding = [];
    pendingCodexUnlocks = [];
    hitStopRemaining = 0;
    hitStopCooldown = 0;
    dashTrailTimer = 0;
    observedDashSerial = 0;
    observedFootstepSerial = 0;
    constructor(data, saveSystem, assets, canvas, screenRoot, hudRoot, toastRoot) {
        this.data = data;
        this.saveSystem = saveSystem;
        this.assets = assets;
        this.canvas = canvas;
        this.input = new InputManager(canvas);
        this.audio = new AudioManager(saveSystem.data.settings);
        this.meta = new MetaProgression(data, saveSystem);
        this.narrative = new NarrativeSystem(data.lore);
        this.camera = new Camera(new RNG(0x52a9d9));
        this.renderer = new Renderer(canvas, assets, this.camera);
        const modes = resolveQaModes(location.search);
        this.qaMode = modes.qaMode;
        // `?qa=1` được dùng để audit và mở khóa nội dung, nên phải giữ nguyên nhịp
        // người chơi. Smoke test tăng tốc phải chủ động dùng `?qa=1&fast=1`.
        this.fastQaPacing = modes.fastQaPacing;
        this.selectedCharacterId = data.characterById.has(saveSystem.data.lastCharacterId) ? saveSystem.data.lastCharacterId : data.characters[0]?.id ?? 'kael-orin';
        this.selectedStageId = data.stageById.has(saveSystem.data.lastStageId) ? saveSystem.data.lastStageId : data.stages[0]?.id ?? 'glassward-verge';
        this.ui = new UIManager(this, screenRoot, hudRoot, toastRoot);
    }
    start() {
        this.showMainMenu();
        this.running = true;
        requestAnimationFrame((time) => this.loop(time));
    }
    loop(timestamp) {
        if (!this.running)
            return;
        const rawDt = this.lastFrame > 0 ? (timestamp - this.lastFrame) / 1000 : 0;
        this.lastFrame = timestamp;
        const dt = Math.min(0.033, Math.max(0, rawDt));
        this.totalTime += dt;
        document.body.classList.toggle('gameplay-active', this.state === 'playing');
        if (this.state === 'playing')
            this.input.pollGamepad();
        if (this.state === 'playing')
            this.updateGame(dt);
        const stateChanged = this.lastRenderedState !== this.state;
        const concealedSummary = this.state === 'summary';
        const activeRunScene = this.hasActiveRun() && ['starting-loadout', 'playing', 'paused', 'level-up'].includes(this.state);
        const passiveInterval = activeRunScene ? 250 : 1000;
        const shouldRender = this.state === 'playing' || stateChanged || timestamp - this.lastPassiveRender >= passiveInterval;
        if (activeRunScene && shouldRender) {
            this.renderer.render({
                stage: this.stageManager.stage,
                time: this.totalTime,
                player: this.player,
                enemies: this.spawner,
                projectiles: this.projectiles,
                loot: this.loot,
                particles: this.particles,
                floatingText: this.floatingText,
                boss: this.boss,
                weapons: this.weapons,
                settings: this.saveSystem.data.settings,
                terrain: this.terrain,
            });
            this.ui.updateHUD();
            this.lastPassiveRender = timestamp;
        }
        else if (!activeRunScene && !concealedSummary && shouldRender) {
            this.renderer.clearMenuBackground();
            this.lastPassiveRender = timestamp;
        }
        this.lastRenderedState = this.state;
        this.input.endFrame();
        requestAnimationFrame((time) => this.loop(time));
    }
    updateGame(dt) {
        if (this.input.wasPressed('Tab'))
            this.ui.toggleCharacterStats();
        if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP') || this.input.gamepadPressed(9)) {
            this.pause();
            return;
        }
        if (this.victoryDelay > 0) {
            this.victoryDelay -= dt;
            this.particles.update(dt);
            this.floatingText.update(dt);
            this.camera.update(dt, this.player.x, this.player.y, this.saveSystem.data.settings.screenShake);
            if (this.victoryDelay <= 0)
                this.finishRun('victory');
            return;
        }
        const hitStopActive = this.hitStopRemaining > 0;
        this.hitStopRemaining = Math.max(0, this.hitStopRemaining - dt);
        this.hitStopCooldown = Math.max(0, this.hitStopCooldown - dt);
        if (hitStopActive)
            dt *= 0.08;
        const playerScreen = this.camera.worldToScreen(this.player.x, this.player.y);
        this.terrain.update(this.player.x, this.player.y, this.renderer.size());
        this.player.terrainSpeedMultiplier = this.terrain.movementMultiplier(this.player.x, this.player.y);
        const aftermathWasActive = this.player.bossAftermathActive();
        const previousPlayerX = this.player.x;
        const previousPlayerY = this.player.y;
        const dashWasActive = this.player.dashTime > 0;
        this.player.update(dt, this.input, playerScreen.x, playerScreen.y);
        this.terrain.update(this.player.x, this.player.y, this.renderer.size());
        this.terrain.resolveActor(this.player, previousPlayerX, previousPlayerY);
        this.projectiles.setPlayerEmpowerment(this.player.bossAftermathProjectileSpeedMultiplier(), this.player.bossAftermathProjectileSizeMultiplier());
        const playerTravel = Math.hypot(this.player.x - previousPlayerX, this.player.y - previousPlayerY);
        this.updateDashTrail(dt, previousPlayerX, previousPlayerY, dashWasActive || this.player.dashTime > 0);
        this.updateFootstepFeedback();
        this.rebaseWorldIfNeeded();
        this.terrain.update(this.player.x, this.player.y, this.renderer.size());
        const stageEvent = aftermathWasActive
            ? { waveChanged: false, shouldSpawnFinal: false }
            : this.stageManager.update(dt);
        const storyProgress = this.stageManager.progress();
        for (const cue of this.narrative.updateProgress(storyProgress))
            this.showNarrativeCue(cue);
        this.handleStageAnnouncements(stageEvent);
        const scaling = this.stageManager.scaling();
        if (aftermathWasActive)
            this.updateBossAftermathSpawns(dt);
        else {
            this.director.update(dt, this.player.x, this.player.y, scaling, this.stageManager.wave, this.stageManager.intermission, this.spawner.pool.countActive(), this.renderer.size(), Boolean(this.boss.getBoss()));
        }
        this.enemySpatial.rebuild(this.spawner.pool.allItems());
        this.enemySystem.update(dt, this);
        this.enemySpatial.rebuild(this.spawner.pool.allItems());
        this.passives.update(dt, this, playerTravel);
        this.weapons.update(dt, this);
        this.skills.update(dt, this);
        if (this.player.dashSerial !== this.observedDashSerial) {
            this.observedDashSerial = this.player.dashSerial;
            this.camera.addKick(-this.player.dashX * 8, -this.player.dashY * 8);
        }
        this.projectiles.update(dt, this);
        this.boss.update(dt, this);
        this.loot.update(dt, this);
        this.particles.update(dt);
        this.floatingText.update(dt);
        this.audio.updateAmbient(dt);
        this.camera.update(dt, this.player.x, this.player.y, this.saveSystem.data.settings.screenShake, this.player.motionVx, this.player.motionVy, this.player.aim.x, this.player.aim.y);
        if (this.runStats) {
            this.runStats.elapsed = this.stageManager.elapsed;
            this.runStats.wave = this.stageManager.wave;
            this.runStats.level = this.player.level;
        }
        // Nếu mục tiêu cuối chết trong chính khung hình này, chiến thắng được chốt
        // trước đường thua để tránh kết quả trái ngược và âm thanh/cốt truyện lệch nhau.
        if (aftermathWasActive && !this.player.bossAftermathActive()) {
            this.loot.collectAll(this);
            this.particles.setReduced(this.saveSystem.data.settings.reducedParticles);
            this.victoryDelay = 0.65;
            this.player.invulnerable = Math.max(this.player.invulnerable, 1);
            this.ui.setHUDObjective('Đã quét sạch chiến trường');
            return;
        }
        if (this.victoryDelay > 0)
            return;
        if (this.player.health <= 0) {
            this.finishRun('defeat');
            return;
        }
        if (this.pendingLevelChoice && this.state === 'playing' && !this.player.bossAftermathActive()) {
            this.openNextUpgradeChoice();
        }
    }
    spawnFinalEncounter() {
        const stage = this.stageManager.stage;
        if (!stage)
            return;
        const scaling = this.stageManager.scaling();
        const viewport = this.renderer.size();
        let enemy = null;
        if (stage.bossId) {
            this.stageManager.bossSpawned = true;
            enemy = this.spawner.spawnAround(stage.bossId, this.player.x, this.player.y, scaling, 1 + stage.index * 0.025, viewport);
            if (enemy) {
                this.boss.setBoss(enemy);
                this.player.grantBossBlessing();
            }
        }
        else {
            this.stageManager.eliteSpawned = true;
            enemy = this.spawner.spawnAround(stage.eliteId, this.player.x, this.player.y, scaling, 1.65, viewport);
            if (enemy)
                enemy.isElite = true;
        }
        if (!enemy) {
            this.stageManager.bossDefeated = true;
            this.victoryDelay = this.qaMode ? 1.8 : 4.8;
            this.player.health = Math.max(1, this.player.health);
            this.player.invulnerable = Math.max(this.player.invulnerable, this.victoryDelay + 0.5);
            this.completeNarrativeStage();
            this.audio.play('victory');
            return;
        }
        enemy.isFinalEncounter = true;
        const finaleCue = this.narrative.triggerFinalEncounter();
        if (finaleCue)
            this.showNarrativeCue(finaleCue, 5200);
        this.ui.setHUDObjective(`Đánh bại ${enemy.config.name}`);
        // Giao tranh cuối được ưu tiên hơn thông báo đổi đợt trong cùng khung hình.
        // Ghi rõ cường độ để tránh một cue 0,25 lấy mất cooldown của cue chính.
        this.audio.play('boss', 1);
        // Trùm đã có thanh máu, banner cảnh báo và bảng Ban Phước riêng. Không
        // chồng thêm toast thứ tư lên cùng vùng HUD; Tinh Anh vẫn cần toast vì
        // không có cụm thông tin chuyên biệt này.
        if (!stage.bossId)
            this.toast(`${enemy.config.name} — Tinh Anh xuất hiện`);
        this.camera.addShake(7);
    }
    handleStageAnnouncements(stageEvent) {
        if (stageEvent.shouldSpawnFinal) {
            this.spawnFinalEncounter();
            return;
        }
        if (!stageEvent.waveChanged)
            return;
        this.audio.play('boss', 0.25);
        this.syncSurvivalObjective();
        this.toast(`Đợt ${this.stageManager.wave} — mật độ kẻ địch tăng`);
    }
    syncSurvivalObjective() {
        const stage = this.stageManager.stage;
        if (!stage)
            return;
        const survivalObjective = this.activeBriefing?.objectives[0] ?? `Sống sót qua ${stage.waveCount} đợt`;
        this.ui.setHUDObjective(`${survivalObjective} — Đợt hiện tại ${this.stageManager.wave}/${stage.waveCount}`);
    }
    startSelectedRun() {
        if (this.meta.pendingPermanentRewards().length > 0) {
            this.ui.showPermanentRewards(this.meta.pendingPermanentRewards());
            this.toast('Hãy chọn phần thưởng vĩnh viễn trước khi bắt đầu trận mới.');
            return;
        }
        const character = this.data.characterById.get(this.selectedCharacterId) ?? this.data.characters[0];
        const stage = this.data.stageById.get(this.selectedStageId) ?? this.data.stages[0];
        if (!character || !stage)
            throw new Error('Không tìm thấy nhân vật hoặc bản đồ có thể chơi.');
        if (!this.isCharacterUnlocked(character.id) || !this.isStageUnlocked(stage.index))
            return;
        const briefing = this.narrative.startStage(stage.id, character.id);
        this.activeBriefing = briefing;
        const showBriefing = () => {
            this.ui.showMissionBriefing(briefing, () => this.initializeSelectedRun(), () => this.showCodex(showBriefing));
        };
        showBriefing();
    }
    initializeSelectedRun() {
        const character = this.data.characterById.get(this.selectedCharacterId) ?? this.data.characters[0];
        const stage = this.data.stageById.get(this.selectedStageId) ?? this.data.stages[0];
        if (!character || !stage)
            throw new Error('Không tìm thấy nhân vật hoặc bản đồ có thể chơi.');
        if (!this.isCharacterUnlocked(character.id) || !this.isStageUnlocked(stage.index))
            return;
        const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
        const seed = Number.isFinite(urlSeed) && urlSeed > 0
            ? urlSeed >>> 0
            : this.qaMode ? 1337 : (Date.now() ^ hashString(`${character.id}:${stage.id}`)) >>> 0;
        this.rng = new RNG(seed);
        this.player = new Player(character, this.data.metaUpgrades, this.saveSystem.data);
        this.spawner = new EnemySpawner(this.data, this.rng);
        this.director = new Director(this.data, this.rng, this.spawner);
        this.enemySystem = new EnemySystem();
        this.projectiles = new ProjectileSystem();
        this.particles = new ParticleSystem(this.rng);
        this.particles.setReduced(this.saveSystem.data.settings.reducedParticles);
        this.floatingText = new FloatingTextSystem();
        this.loot = new LootSystem(this.rng);
        this.weapons = new WeaponSystem(this.data);
        this.weapons.addWeapon(character.startWeapon);
        this.passives = new CharacterPassiveSystem();
        this.skills = new SkillSystem();
        this.experience = new ExperienceSystem(this.player);
        this.upgrades = new UpgradeSystem(this.data, this.rng, this.player, this.weapons);
        this.boss = new BossSystem();
        this.stageManager = new StageManager();
        this.terrain = new TerrainSystem(stage);
        this.terrain.update(0, 0, this.renderer.size());
        this.stageManager.start(stage, this.fastQaPacing);
        this.director.start(stage, this.qaMode);
        this.enemySpatial = new SpatialHash(128);
        this.victoryDelay = 0;
        this.bossAftermathElapsed = 0;
        this.bossAftermathSpawned = 0;
        this.pendingLevelChoice = false;
        this.bonusChoices = 0;
        this.runCommitted = false;
        this.pendingStoryEnding = [];
        this.pendingCodexUnlocks = [];
        this.hitStopRemaining = 0;
        this.hitStopCooldown = 0;
        this.worldOriginX = 0;
        this.worldOriginY = 0;
        this.dashTrailTimer = 0;
        this.observedDashSerial = 0;
        this.observedFootstepSerial = 0;
        this.runStats = {
            startedAt: Date.now(), elapsed: 0, stageIndex: stage.index, wave: 1, level: 1,
            kills: 0, gold: 0, shards: 0, totalDamage: 0, damageByWeapon: {}, result: 'abandoned', seed,
            statShards: 0, skillCritShards: 0,
        };
        this.camera.snap(0, 0);
        this.saveSystem.data.lastCharacterId = character.id;
        this.saveSystem.data.lastStageId = stage.id;
        this.saveSystem.save();
        this.state = 'starting-loadout';
        this.ui.showGameplayHUD();
        this.syncSurvivalObjective();
        this.ui.showStartingLoadout(this.upgrades.generateStarterOptions());
        this.audio.play('level', 0.45);
    }
    chooseStarterOption(optionId) {
        if (this.state !== 'starting-loadout' || !this.upgrades.applyStarter(optionId))
            return;
        this.ui.hideOverlay();
        this.beginCombat();
    }
    beginCombat() {
        const stage = this.stageManager.stage;
        const initialCount = 1;
        const scaling = this.stageManager.scaling();
        const viewport = this.renderer.size();
        for (let index = 0; index < initialCount; index += 1) {
            const id = this.rng.weighted(stage.allowedEnemies.map((enemyId) => ({
                item: enemyId,
                weight: 1 / Math.max(1, this.data.enemyById.get(enemyId)?.cost ?? 1),
            }))) ?? 'riftling';
            this.spawner.spawnAround(id, this.player.x, this.player.y, scaling, 1, viewport);
        }
        this.state = 'playing';
        // Mã trận vẫn nằm trong màn tổng kết; không cần chồng thêm toast lên
        // banner truyền tin ở giây đầu giao tranh.
        if (this.activeBriefing?.characterLine)
            this.showNarrativeCue(this.activeBriefing.characterLine, 3600);
    }
    damageEnemy(enemy, rawDamage, element, sourceWeaponId, statusChance, knockback, critical, originX, originY, hitEffect) {
        if (!enemy.active || rawDamage <= 0)
            return { amount: 0, critical, killed: false };
        if (hitEffect?.kind === 'poison-cloud') {
            this.applyWeaponSignature(enemy, rawDamage, sourceWeaponId, hitEffect);
            enemy.lastHitWeapon = sourceWeaponId;
            return { amount: 0, critical: false, killed: false };
        }
        let adjustedDamage = rawDamage;
        if (this.player.character.passive.kind === 'distance-damage') {
            const travel = Math.sqrt(distanceSquared(originX, originY, enemy.x, enemy.y));
            adjustedDamage *= 1 + this.player.character.passive.value * Math.min(1, travel / 520);
        }
        if (this.player.character.passive.kind === 'heavy-bonus' && ['gravity-bomb', 'rift-blade', 'active-gravity-breaker'].includes(sourceWeaponId)) {
            adjustedDamage *= 1 + this.player.character.passive.value;
            knockback *= 1 + this.player.stats.get('maxHp') / 500;
        }
        const skillCritical = critical && (sourceWeaponId.startsWith('active-') || sourceWeaponId.startsWith('ultimate-') || sourceWeaponId.startsWith('rage-'));
        const criticalArmorBypass = critical ? (skillCritical ? 0.5 : 0.4) : 0;
        const armorPenetration = this.player.stats.get('armorPenetration');
        const effectiveArmor = Math.max(0, enemy.armor * (1 - armorPenetration) * (1 - criticalArmorBypass));
        adjustedDamage *= 40 / (40 + effectiveArmor);
        let remaining = adjustedDamage;
        let absorbed = 0;
        if (enemy.shield > 0) {
            absorbed = Math.min(enemy.shield, remaining);
            enemy.shield -= absorbed;
            remaining -= absorbed;
        }
        const actualHealthDamage = Math.min(enemy.health, Math.max(0, remaining));
        enemy.health -= actualHealthDamage;
        const totalApplied = absorbed + actualHealthDamage;
        enemy.flashTimer = critical ? 0.16 : 0.08;
        enemy.lastHitWeapon = sourceWeaponId;
        if (totalApplied > 0 && hitEffect)
            this.applyWeaponSignature(enemy, adjustedDamage, sourceWeaponId, hitEffect);
        if (this.rng.chance(statusChance)) {
            switch (element) {
                case 'fire':
                    const wasBurning = enemy.status.burnTime > 0;
                    enemy.status.burnTime = Math.max(enemy.status.burnTime, 4);
                    enemy.status.burnTick = wasBurning ? Math.min(enemy.status.burnTick, 0.25) : 0.25;
                    enemy.status.burnPercent = Math.max(enemy.status.burnPercent, enemy.isBoss ? 0.0005 : enemy.isElite ? 0.001 : 0.0015);
                    enemy.status.burnDps = Math.max(enemy.status.burnDps, adjustedDamage * 0.08);
                    enemy.status.healingReduction = Math.max(enemy.status.healingReduction, 0.3);
                    break;
                case 'poison':
                    enemy.status.poisonTime = Math.max(enemy.status.poisonTime, 5);
                    enemy.status.poisonDps = Math.max(enemy.status.poisonDps, adjustedDamage * 0.14);
                    break;
                case 'ice':
                    enemy.status.slowTime = Math.max(enemy.status.slowTime, 2.4);
                    enemy.status.slowFactor = Math.min(enemy.status.slowFactor, this.rng.chance(0.16) ? 0.12 : 0.55);
                    if (enemy.status.slowFactor < 0.2)
                        enemy.status.stunTime = Math.max(enemy.status.stunTime, 0.35);
                    break;
                case 'lightning':
                    enemy.status.shockTime = Math.max(enemy.status.shockTime, 2.2);
                    enemy.status.slowTime = Math.max(enemy.status.slowTime, 1.7);
                    enemy.status.slowFactor = Math.min(enemy.status.slowFactor, 0.72);
                    enemy.status.paralysisTime = Math.max(enemy.status.paralysisTime, enemy.isBoss ? 0.08 : enemy.isElite ? 0.14 : 0.24);
                    enemy.status.stunTime = Math.max(enemy.status.stunTime, enemy.status.paralysisTime);
                    break;
                case 'physical': {
                    const direction = normalize(enemy.x - originX, enemy.y - originY);
                    const bossFactor = enemy.isBoss ? 0.12 : enemy.isElite ? 0.45 : 1;
                    enemy.knockbackX += direction.x * knockback * bossFactor;
                    enemy.knockbackY += direction.y * knockback * bossFactor;
                    break;
                }
                case 'arcane':
                    if (enemy.status.blindCooldown <= 0 && this.rng.chance(Math.min(0.55, 0.12 + statusChance * 0.35))) {
                        enemy.status.blindTime = Math.max(enemy.status.blindTime, Math.min(3, 0.8 + statusChance * 2.2));
                        enemy.status.blindCooldown = 8;
                    }
                    else if (this.rng.chance(0.18))
                        enemy.status.stunTime = Math.max(enemy.status.stunTime, 0.1);
                    break;
            }
            if (this.player.character.passive.kind === 'status-echo' && this.rng.chance(this.player.character.passive.value)) {
                const excluded = new Set([enemy.id]);
                const echo = this.nearestEnemy(enemy.x, enemy.y, 190, excluded);
                if (echo) {
                    switch (element) {
                        case 'fire': {
                            const wasEchoBurning = echo.status.burnTime > 0;
                            echo.status.burnTime = Math.max(echo.status.burnTime, 1.8);
                            echo.status.burnTick = wasEchoBurning ? Math.min(echo.status.burnTick, 0.25) : 0.25;
                            echo.status.burnDps = Math.max(echo.status.burnDps, adjustedDamage * 0.08 * this.player.character.passive.value);
                            echo.status.burnPercent = Math.max(echo.status.burnPercent, enemy.status.burnPercent * this.player.character.passive.value);
                            echo.status.healingReduction = Math.max(echo.status.healingReduction, 0.3 * this.player.character.passive.value);
                            break;
                        }
                        case 'poison':
                            echo.status.poisonTime = Math.max(echo.status.poisonTime, 2.6);
                            echo.status.poisonDps = Math.max(echo.status.poisonDps, adjustedDamage * 0.065);
                            break;
                        case 'ice':
                            echo.status.slowTime = Math.max(echo.status.slowTime, 1.4);
                            echo.status.slowFactor = Math.min(echo.status.slowFactor, 0.68);
                            break;
                        case 'lightning': {
                            echo.status.shockTime = Math.max(echo.status.shockTime, 1.2);
                            echo.status.slowTime = Math.max(echo.status.slowTime, 0.9);
                            echo.status.slowFactor = Math.min(echo.status.slowFactor, 0.87);
                            echo.status.paralysisTime = Math.max(echo.status.paralysisTime, echo.isBoss ? 0.04 : 0.1);
                            echo.status.stunTime = Math.max(echo.status.stunTime, echo.status.paralysisTime);
                            break;
                        }
                        case 'physical':
                            echo.knockbackX += (echo.x - enemy.x) * 0.08;
                            echo.knockbackY += (echo.y - enemy.y) * 0.08;
                            break;
                        case 'arcane':
                            echo.status.stunTime = Math.max(echo.status.stunTime, 0.08);
                            break;
                    }
                    this.particles.line(enemy.x, enemy.y, echo.x, echo.y, '#d892ff', 2, 0.14);
                }
            }
        }
        if (this.player && totalApplied > 0) {
            const lifeStealCoefficient = sourceWeaponId.includes('poison') || sourceWeaponId.includes('burn') ? 0.2
                : sourceWeaponId.includes('active') || sourceWeaponId.includes('ultimate') || sourceWeaponId.includes('bomb') ? 0.35
                    : sourceWeaponId.includes('summon') ? 0.6 : 1;
            const effectiveLifeSteal = this.player.effectiveLifeSteal?.() ?? this.player.stats.get('lifeSteal');
            this.player.heal(actualHealthDamage * effectiveLifeSteal * lifeStealCoefficient);
            this.player.healFromBossBlessing?.(totalApplied);
            this.player.addUltimate(Math.min(1.8, totalApplied * 0.012));
            this.player.addRage(Math.min(1.2, totalApplied * 0.006));
        }
        if (this.runStats) {
            this.runStats.totalDamage += totalApplied;
            this.runStats.damageByWeapon[sourceWeaponId] = (this.runStats.damageByWeapon[sourceWeaponId] ?? 0) + totalApplied;
        }
        if (this.weapons)
            this.weapons.recordDamage(sourceWeaponId, totalApplied);
        if (this.passives)
            this.passives.onDamageDealt(this, enemy, sourceWeaponId, totalApplied);
        if (this.saveSystem.data.settings.damageNumbers && totalApplied > 0) {
            const color = critical ? '#ffe07b' : element === 'fire' ? '#ff8a55' : element === 'ice' ? '#79ddff' : element === 'poison' ? '#79e47c' : element === 'lightning' ? '#79b3ff' : element === 'arcane' ? '#d892ff' : '#e7f0ef';
            this.floatingText.spawnDamage(enemy.x + this.rng.float(-8, 8), enemy.y - enemy.radius, formatNumber(totalApplied), color, element, critical);
        }
        if (critical)
            this.audio.play('crit', 0.22);
        const heavySkillHit = (sourceWeaponId.startsWith('active-') || sourceWeaponId.startsWith('ultimate-'))
            && totalApplied >= Math.max(18, enemy.maxHealth * 0.025);
        if ((critical || heavySkillHit) && totalApplied > 0 && this.hitStopCooldown <= 0) {
            const feedback = Math.max(0, Math.min(1, this.saveSystem.data.settings.screenShake));
            this.hitStopRemaining = Math.max(this.hitStopRemaining, (critical ? 0.034 : 0.026) * feedback);
            this.hitStopCooldown = 0.085;
        }
        const killed = enemy.health <= 0;
        if (killed)
            this.killEnemy(enemy, sourceWeaponId);
        return { amount: totalApplied, critical, killed };
    }
    damageStatus(enemy, rawDamage, element, sourceWeaponId, status) {
        if (!enemy.active || rawDamage <= 0)
            return false;
        const applied = Math.min(enemy.health, rawDamage);
        enemy.health -= applied;
        enemy.lastHitWeapon = sourceWeaponId;
        enemy.flashTimer = Math.max(enemy.flashTimer, 0.055);
        if (this.runStats) {
            this.runStats.totalDamage += applied;
            this.runStats.damageByWeapon[sourceWeaponId] = (this.runStats.damageByWeapon[sourceWeaponId] ?? 0) + applied;
        }
        if (this.weapons)
            this.weapons.recordDamage(sourceWeaponId, applied);
        this.player.healFromBossBlessing?.(applied);
        if (this.saveSystem.data.settings.damageNumbers && applied > 0) {
            const color = status === 'bleed' ? '#c8443f' : '#79e47c';
            this.floatingText.spawnDamage(enemy.x + this.rng.float(-7, 7), enemy.y - enemy.radius, formatNumber(applied), color, element, false, status);
        }
        if (enemy.health > 0)
            return false;
        this.killEnemy(enemy, sourceWeaponId);
        return true;
    }
    applyWeaponSignature(enemy, scaledDamage, sourceWeaponId, effect) {
        if (!this.rng.chance(effect.chance ?? 1))
            return;
        const durationMultiplier = enemy.isBoss
            ? effect.bossDurationMultiplier ?? 0.35
            : enemy.isElite ? effect.eliteDurationMultiplier ?? 0.65 : 1;
        switch (effect.kind) {
            case 'bleed':
                if (enemy.status.bleedTime <= 0) {
                    enemy.status.bleedTick = 1;
                    enemy.status.bleedDps = 0;
                    enemy.status.bleedSourceWeapon = '';
                }
                enemy.status.bleedTime = Math.max(enemy.status.bleedTime, effect.duration);
                enemy.status.bleedDps = Math.max(enemy.status.bleedDps, effect.healthPercentPerSecond ?? 0);
                enemy.status.bleedSourceWeapon = sourceWeaponId;
                break;
            case 'slow':
                enemy.status.slowTime = Math.max(enemy.status.slowTime, effect.duration * durationMultiplier);
                enemy.status.slowFactor = Math.min(enemy.status.slowFactor, effect.magnitude ?? 0.8);
                break;
            case 'stun':
                enemy.status.stunTime = Math.max(enemy.status.stunTime, effect.duration * durationMultiplier);
                break;
            case 'poison-cloud': {
                // Mỗi vùng chỉ làm mới/giữ nguồn mạnh nhất. Phần theo % lấy Máu hiện
                // tại ở EnemySystem, tránh nhiều vùng chồng nhau nhân sát thương vô hạn.
                if (enemy.status.poisonCloudTime <= 0) {
                    enemy.status.poisonCloudTick = 1;
                    enemy.status.poisonCloudDps = 0;
                    enemy.status.poisonCloudPercent = 0;
                    enemy.status.poisonCloudSourceWeapon = '';
                }
                enemy.status.poisonCloudTime = Math.max(enemy.status.poisonCloudTime, effect.duration);
                enemy.status.poisonCloudDps = Math.max(enemy.status.poisonCloudDps, scaledDamage * (effect.damageScale ?? 1));
                enemy.status.poisonCloudPercent = Math.max(enemy.status.poisonCloudPercent, effect.healthPercentPerSecond ?? 0);
                enemy.status.poisonCloudSourceWeapon = sourceWeaponId;
                // Khói độc yêu cầu mục tiêu luôn bị chậm trong toàn bộ thời gian còn
                // nhiễm độc, kể cả Tinh Anh/Trùm. Kháng hiệu ứng vẫn áp dụng cho slow
                // từ cung và stun ở các nhánh riêng phía trên.
                enemy.status.slowTime = Math.max(enemy.status.slowTime, effect.duration);
                enemy.status.slowFactor = Math.min(enemy.status.slowFactor, effect.magnitude ?? 0.8);
                break;
            }
        }
    }
    killEnemy(enemy, sourceWeaponId) {
        if (!enemy.active)
            return;
        const x = enemy.x;
        const y = enemy.y;
        const configId = enemy.config.id;
        const wasFinal = enemy.isFinalEncounter;
        const wasBoss = enemy.isBoss;
        const wasElite = enemy.isElite;
        if (this.runStats)
            this.runStats.kills += 1;
        this.player.addUltimate(wasBoss ? 35 : wasElite ? 12 : 1.15);
        this.loot.spawnOnDeath(enemy, this.player.stats.get('luck'));
        this.particles.burst(x, y, wasBoss ? '#e7bb63' : wasElite ? '#c879ff' : '#8fd7d0', wasBoss ? 34 : wasElite ? 20 : 8, wasBoss ? 310 : 155, wasBoss ? 6 : 3);
        if (configId === 'rift-splitter') {
            const scaling = this.stageManager.scaling();
            for (let index = 0; index < 2; index += 1)
                this.spawner.spawnChild('riftling', x, y, scaling, 0.55);
        }
        if (this.player.character.passive.kind === 'poison-haste' && sourceWeaponId === 'venom-bloom') {
            this.player.killHasteStacks = Math.min(6, this.player.killHasteStacks + 1);
            this.player.killHasteTimer = 3;
        }
        if (this.passives)
            this.passives.onEnemyKilled(this);
        this.spawner.pool.release(enemy);
        if (wasBoss)
            this.boss.clearBoss();
        if (wasFinal) {
            this.stageManager.bossDefeated = true;
            if (wasBoss)
                this.startBossAftermath();
            else {
                this.victoryDelay = this.qaMode ? 1.8 : 4.8;
                this.player.health = Math.max(1, this.player.health);
                this.player.invulnerable = Math.max(this.player.invulnerable, this.victoryDelay + 0.5);
                this.stageManager.warning = 'Tiền tuyến đã ổn định';
            }
            this.completeNarrativeStage();
            this.audio.play('victory');
            this.camera.addShake(9);
        }
    }
    startBossAftermath() {
        this.bossAftermathElapsed = 0;
        this.bossAftermathSpawned = 0;
        this.player.activateBossAftermath(10);
        this.projectiles.setPlayerEmpowerment(11, 11);
        this.loot.activateBossVacuum(10.75);
        this.particles.setReduced(true);
        this.stageManager.warning = '';
        this.ui.setHUDObjective('ĐẠI THANH TRỪ — tiêu diệt 1.000 quân tiếp viện trong 10 giây');
        this.toast('HẬU CHIẾN BOSS — BẤT TỬ · +1000% SÁT THƯƠNG/ĐẠN/KÍCH CỠ · +10 TIA');
    }
    updateBossAftermathSpawns(dt) {
        const spawnDuration = 5;
        const spawnTotal = 1000;
        this.bossAftermathElapsed = Math.min(spawnDuration, this.bossAftermathElapsed + Math.max(0, dt));
        const target = Math.min(spawnTotal, Math.floor(spawnTotal * this.bossAftermathElapsed / spawnDuration));
        const stage = this.stageManager.stage;
        if (!stage)
            return;
        const candidates = stage.allowedEnemies
            .map((id) => this.data.enemyById.get(id))
            .filter((config) => Boolean(config && config.tier === 'normal' && resolveEnemySizeClass(config) === 'small'));
        const fallback = this.data.enemyById.get('riftling');
        if (candidates.length === 0 && fallback)
            candidates.push(fallback);
        const scaling = this.stageManager.scaling();
        const viewport = this.renderer.size();
        while (this.bossAftermathSpawned < target) {
            const config = this.rng.pick(candidates);
            if (!config)
                break;
            const enemy = this.spawner.spawnAround(config.id, this.player.x, this.player.y, scaling, 0.72, viewport);
            if (!enemy)
                break;
            this.bossAftermathSpawned += 1;
        }
    }
    damagePlayer(rawDamage, sourceX, sourceY) {
        const holyShieldBefore = this.player.holyShieldLayers;
        const titanShieldBefore = this.player.titanRiftShield;
        const applied = this.player.takeDamage(rawDamage, this.rng);
        if (applied === -1) {
            this.floatingText.spawn(this.player.x, this.player.y - 30, 'NÉ', '#71d8ff', false);
            return;
        }
        if (applied <= 0 && holyShieldBefore > this.player.holyShieldLayers) {
            this.floatingText.spawn(this.player.x, this.player.y - 32, 'THÁNH KHIÊN', '#fff2a8', false);
            this.particles.ring(this.player.x, this.player.y, '#fff2a8', this.player.radius + 24, 0.32);
            return;
        }
        if (applied <= 0 && titanShieldBefore > this.player.titanRiftShield) {
            this.floatingText.spawn(this.player.x, this.player.y - 32, 'ĐỊA GIÁP', '#ffd16d', false);
            this.particles.ring(this.player.x, this.player.y, '#ffd16d', this.player.radius + 22, 0.24);
            return;
        }
        if (applied <= 0)
            return;
        this.floatingText.spawn(this.player.x, this.player.y - 32, `-${formatNumber(Math.round(applied))}`, '#ff7c73', true);
        const direction = normalize(this.player.x - sourceX, this.player.y - sourceY);
        const controlFactor = this.player.rageStatusImmune ? 0 : 1 - this.player.stats.get('statusResistance');
        this.player.addMovementImpulse(direction.x * 155 * controlFactor, direction.y * 155 * controlFactor);
        this.camera.addKick(-direction.x * 6, -direction.y * 6);
        this.particles.burst(this.player.x, this.player.y, '#ff756c', 7, 115, 3);
        this.camera.addShake(Math.min(6, 1.5 + applied * 0.08));
        this.audio.play('hit', 0.55);
    }
    bossLeashRadius() {
        const viewport = this.renderer.size();
        return Math.max(560, Math.hypot(viewport.width, viewport.height) * 0.62);
    }
    nearestEnemy(x, y, range, exclude) {
        const candidates = this.enemySpatial.queryCircle(x, y, range);
        let nearest = null;
        let nearestDistance = range * range;
        for (const enemy of candidates) {
            if (!enemy.active || exclude?.has(enemy.id))
                continue;
            const dist = distanceSquared(x, y, enemy.x, enemy.y);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }
    gainExperience(amount) {
        const levels = this.experience.gain(amount);
        if (levels > 0) {
            this.audio.play('level');
            this.pendingLevelChoice = true;
        }
        else {
            this.audio.play('pickup', 0.08);
        }
    }
    gainGold(amount) {
        if (!this.runStats)
            return;
        this.runStats.gold += amount;
        this.audio.play('pickup', 0.14);
    }
    gainShards(amount) {
        if (!this.runStats)
            return;
        this.runStats.shards += amount;
        this.toast(`+${amount} Mảnh Khe Nứt`);
    }
    applyStatShard(statId) {
        const previousMaxHp = this.player.stats.get('maxHp');
        const displayStat = (statId === 'heal' ? null : statId);
        const knownStat = displayStat && Object.hasOwn(this.player.stats.snapshot(), displayStat) ? displayStat : 'damage';
        const before = statId === 'heal' ? this.player.health : this.player.stats.get(knownStat);
        switch (statId) {
            case 'damage':
                this.player.stats.apply('damage', 0.012, 'multiply');
                break;
            case 'attackSpeed':
                this.player.stats.apply('attackSpeed', 0.01, 'multiply');
                break;
            case 'moveSpeed':
                this.player.stats.apply('moveSpeed', 0.008, 'multiply');
                break;
            case 'armor':
                this.player.stats.apply('armor', 0.35, 'add');
                break;
            case 'maxHp':
                this.player.stats.apply('maxHp', 3, 'add');
                break;
            case 'lifeSteal':
                this.player.stats.apply('lifeSteal', 0.001, 'add');
                break;
            case 'hpRegen':
                this.player.stats.apply('hpRegen', 0.08, 'add');
                break;
            case 'luck':
                this.player.stats.apply('luck', 0.006, 'add');
                break;
            case 'bonusProjectiles':
                this.player.stats.apply('bonusProjectiles', 1, 'add');
                break;
            case 'armorPenetration':
                this.player.stats.apply('armorPenetration', 0.006, 'add');
                break;
            case 'statusResistance':
                this.player.stats.apply('statusResistance', 0.008, 'add');
                break;
            case 'bodyScale':
                this.player.stats.apply('bodyScale', 0.025, 'multiply');
                this.player.stats.apply('maxHp', 0.025, 'multiply');
                this.player.stats.apply('range', 0.012, 'multiply');
                this.player.stats.apply('flatBlock', 0.35, 'add');
                break;
            case 'critChance':
                this.player.stats.apply('critChance', 0.004, 'add');
                break;
            case 'critDamage':
                this.player.stats.apply('critDamage', 0.025, 'add');
                break;
            case 'heal':
                this.player.heal(this.player.stats.get('maxHp') * 0.08);
                break;
            default:
                this.player.stats.apply('damage', 0.01, 'multiply');
                break;
        }
        this.player.syncMaxHp(previousMaxHp);
        this.player.statShards += 1;
        if (this.runStats)
            this.runStats.statShards += 1;
        const after = statId === 'heal' ? this.player.health : this.player.stats.get(knownStat);
        const transition = statId === 'heal'
            ? `Hồi phục: ${formatPlayerStatValue('maxHp', before)} → ${formatPlayerStatValue('maxHp', after)}`
            : formatPlayerStatTransition(knownStat, before, after);
        const rarityNote = knownStat === 'bonusProjectiles' ? ' · tỉ lệ xuất hiện 15%' : '';
        this.toast(`Mảnh chỉ số · ${transition}${rarityNote}`);
    }
    gainSkillCritShard() {
        this.player.skillCritShards += 1;
        if (this.runStats)
            this.runStats.skillCritShards += 1;
        const multiplier = this.player.skillCritDamage();
        this.toast(`MẢNH CHÍ MẠNG KỸ NĂNG — sát thương chí mạng kỹ năng ×${formatDecimal(multiplier, 1)}`);
        this.audio.play('crit', 0.9);
    }
    openChest() {
        this.bonusChoices += 1;
        this.pendingLevelChoice = true;
        this.upgrades.rerolls += 1;
        this.toast('Đã mở rương hiếm — tăng cơ hội Tiến Hóa');
        this.audio.play('level', 0.65);
    }
    openNextUpgradeChoice() {
        const choiceLevel = this.experience.consumePending();
        const fromLevel = choiceLevel !== null;
        if (!fromLevel && this.bonusChoices <= 0) {
            this.pendingLevelChoice = false;
            return;
        }
        if (!fromLevel)
            this.bonusChoices -= 1;
        this.pendingLevelChoice = this.experience.hasPending() || this.bonusChoices > 0;
        this.state = 'level-up';
        // Rương thưởng dùng nhóm buff chung; lựa chọn lên cấp giữ đúng level gốc
        // ngay cả khi một viên EXP khiến người chơi tăng nhiều cấp cùng lúc.
        this.ui.showLevelUp(this.upgrades.generateOptions(choiceLevel ?? 0));
    }
    chooseUpgrade(optionId) {
        if (this.state !== 'level-up')
            return;
        if (!this.upgrades.apply(optionId))
            return;
        this.audio.play('level', 0.7);
        this.resumeAfterUpgrade();
    }
    rerollUpgrades() {
        const options = this.upgrades.reroll();
        if (!options) {
            this.toast('Đã hết lượt đổi lựa chọn');
            return;
        }
        this.ui.showLevelUp(options);
    }
    banishUpgrade(optionId) {
        const options = this.upgrades.banish(optionId);
        if (!options) {
            this.toast('Đã hết lượt loại bỏ');
            return;
        }
        this.ui.showLevelUp(options);
    }
    resumeAfterUpgrade() {
        this.ui.hideOverlay();
        this.state = 'playing';
        if (this.pendingLevelChoice)
            queueMicrotask(() => {
                if (this.state === 'playing')
                    this.openNextUpgradeChoice();
            });
    }
    pause() {
        if (this.state !== 'playing')
            return;
        this.state = 'paused';
        this.ui.showPause();
    }
    resume() {
        if (this.state !== 'paused')
            return;
        this.state = 'playing';
        this.ui.hideOverlay();
    }
    abandonRun() {
        if (!this.hasActiveRun())
            return;
        this.finishRun('abandoned');
    }
    finishRun(result) {
        if (!this.runStats || this.runCommitted)
            return;
        this.runCommitted = true;
        this.runStats.result = result;
        this.runStats.elapsed = this.stageManager.elapsed;
        this.runStats.wave = this.stageManager.wave;
        this.runStats.level = this.player.level;
        for (const entry of this.weapons.entries())
            this.runStats.damageByWeapon[entry.config.id] = entry.runtime.damageDealt;
        const stage = this.stageManager.stage;
        const characterUnlocks = this.meta.commitRun(this.runStats, stage.rewardGold, stage.rewardShards);
        const unlocks = [...new Set([...characterUnlocks, ...this.pendingCodexUnlocks.map((title) => `Thư Khố: ${title}`)])];
        this.summaryUnlocks = unlocks;
        const permanentRewards = this.meta.prepareVictoryRewards(this.runStats);
        this.state = 'summary';
        const showSummary = () => this.ui.showSummary(this.runStats, unlocks, permanentRewards);
        const ending = result === 'victory' ? this.pendingStoryEnding.splice(0) : [];
        if (ending.length > 0)
            this.ui.showStoryEnding(ending, showSummary);
        else
            showSummary();
        if (result !== 'victory')
            this.audio.play('defeat');
    }
    claimPermanentReward(choiceId) {
        const choice = this.meta.pendingPermanentRewards().find((item) => item.id === choiceId);
        const before = choice ? this.saveSystem.data.permanentPoints[choice.stat] ?? 0 : 0;
        if (!this.meta.claimPermanentReward(choiceId))
            return;
        const after = choice ? this.saveSystem.data.permanentPoints[choice.stat] ?? before : before;
        this.toast(choice
            ? `Đã lưu ${choice.title}: ${before} → ${after} điểm. Áp dụng cho mọi Hộ Vệ từ trận kế tiếp.`
            : 'Đã lưu nâng cấp vĩnh viễn.');
        if (this.runStats)
            this.ui.showSummary(this.runStats, this.summaryUnlocks, []);
        else
            this.showMainMenu();
    }
    showMainMenu() {
        this.state = 'main-menu';
        this.ui.showMainMenu();
    }
    showCharacterSelect() {
        this.state = 'character-select';
        this.ui.showCharacterSelect();
    }
    showStageSelect() {
        this.state = 'stage-select';
        this.ui.showStageSelect();
    }
    showCodex(onClose = () => this.showMainMenu()) {
        const unlockedCharacterIds = this.data.characters
            .filter((character) => this.isCharacterUnlocked(character.id))
            .map((character) => character.id);
        const entries = this.narrative.listCodex({
            highestCompletedStage: this.saveSystem.data.highestCompletedStage,
            unlockedCharacterIds,
        });
        this.ui.showCodex(entries, onClose);
    }
    showShop() {
        this.state = 'shop';
        this.ui.showShop();
    }
    showSettings() {
        this.state = 'settings';
        this.ui.showSettings();
    }
    selectCharacter(id) {
        if (!this.isCharacterUnlocked(id))
            return;
        this.selectedCharacterId = id;
        this.saveSystem.data.lastCharacterId = id;
        this.saveSystem.save();
        this.ui.showCharacterSelect();
    }
    selectStage(id) {
        const stage = this.data.stageById.get(id);
        if (!stage || !this.isStageUnlocked(stage.index))
            return;
        this.selectedStageId = id;
        this.saveSystem.data.lastStageId = id;
        this.saveSystem.save();
        this.ui.showStageSelect();
    }
    isCharacterUnlocked(id) {
        return this.qaMode || this.saveSystem.data.unlockedCharacters.includes(id);
    }
    isStageUnlocked(index) {
        return this.qaMode || index <= this.saveSystem.data.highestStage;
    }
    purchaseMeta(id) {
        const success = this.meta.purchase(id);
        this.toast(success ? 'Đã mua nâng cấp vĩnh viễn' : 'Không đủ vàng');
        this.ui.showShop();
    }
    updateSettings(settings) {
        this.saveSystem.updateSettings(settings);
        this.audio.updateSettings(this.saveSystem.data.settings);
        if (this.particles)
            this.particles.setReduced(this.saveSystem.data.settings.reducedParticles);
    }
    resetSave() {
        this.saveSystem.reset();
        this.selectedCharacterId = this.data.characters[0]?.id ?? 'kael-orin';
        this.selectedStageId = this.data.stages[0]?.id ?? 'glassward-verge';
        this.audio.updateSettings(this.saveSystem.data.settings);
        this.showMainMenu();
    }
    startNextStage() {
        const current = this.data.stageById.get(this.selectedStageId);
        const next = current ? this.data.stages.find((stage) => stage.index === current.index + 1) : undefined;
        if (next && this.isStageUnlocked(next.index))
            this.selectedStageId = next.id;
        this.showStageSelect();
    }
    screenShake(amount) {
        this.camera.addShake(amount);
    }
    toast(message) {
        this.ui.toast(message);
    }
    showNarrativeCue(cue, duration = 4200) {
        const speakerKey = cue.speaker.trim().toLocaleLowerCase('vi');
        const character = this.data.characters.find((item) => {
            const fullName = item.name.toLocaleLowerCase('vi');
            const firstName = item.name.split(/\s+/u)[0]?.toLocaleLowerCase('vi') ?? fullName;
            return speakerKey === fullName || speakerKey === firstName;
        });
        this.ui.showTransmission(cue, character?.portrait, duration);
    }
    completeNarrativeStage() {
        const completion = this.narrative.completeStage();
        const victoryCue = completion.cues.find((cue) => cue.kind === 'victory');
        if (victoryCue)
            this.showNarrativeCue(victoryCue, this.qaMode ? 1800 : 4600);
        const codexTitles = completion.codexUnlockIds
            .map((id) => this.narrative.codexEntry(id)?.title)
            .filter((title) => Boolean(title));
        if (codexTitles.length > 0) {
            this.pendingCodexUnlocks = codexTitles;
            this.toast(`Thư Khố đã mở: ${codexTitles.join(', ')}`);
        }
        if (completion.ending.length > 0)
            this.pendingStoryEnding = [...completion.ending];
    }
    get autoAim() {
        return this.saveSystem.data.settings.autoAim;
    }
    get scaling() {
        return this.stageManager.scaling();
    }
    get enemies() {
        return this.spawner.pool.allItems();
    }
    updateDashTrail(dt, previousX, previousY, dashing) {
        if (!dashing) {
            this.dashTrailTimer = 0;
            return;
        }
        this.dashTrailTimer -= dt;
        if (this.dashTrailTimer > 0)
            return;
        this.dashTrailTimer += this.saveSystem.data.settings.reducedParticles ? 0.055 : 0.032;
        this.particles.line(previousX, previousY, this.player.x, this.player.y, '#65d7cb', 7, 0.12);
        this.particles.spawn('smoke', previousX, previousY, '#4bb6b4', 7, 0.18, -this.player.dashX * 42, -this.player.dashY * 42);
    }
    updateFootstepFeedback() {
        if (this.player.footstepSerial === this.observedFootstepSerial)
            return;
        this.observedFootstepSerial = this.player.footstepSerial;
        if (this.saveSystem.data.settings.reducedParticles && this.player.footstepSerial % 2 === 0)
            return;
        const sideX = -this.player.lastMove.y * this.player.footstepSide * 5;
        const sideY = this.player.lastMove.x * this.player.footstepSide * 5;
        this.particles.spawn('smoke', this.player.x - this.player.lastMove.x * 5 + sideX, this.player.y - this.player.lastMove.y * 5 + sideY + this.player.radius * 0.55, '#7ea7a3', 4.5, 0.16, -this.player.motionVx * 0.045, -this.player.motionVy * 0.045);
    }
    rebaseWorldIfNeeded() {
        if (Math.abs(this.player.x) < 32768 && Math.abs(this.player.y) < 32768)
            return;
        // 448 là nhịp landmark của nền (56 × 8), vì vậy rebase không làm lưới bật vị trí.
        const offsetX = Math.trunc(this.player.x / 448) * 448;
        const offsetY = Math.trunc(this.player.y / 448) * 448;
        this.worldOriginX += offsetX;
        this.worldOriginY += offsetY;
        this.player.x -= offsetX;
        this.player.y -= offsetY;
        for (const enemy of this.spawner.pool.allItems())
            if (enemy.active) {
                enemy.x -= offsetX;
                enemy.y -= offsetY;
            }
        this.projectiles.pool.forEachActive((item) => { item.x -= offsetX; item.y -= offsetY; });
        this.loot.pool.forEachActive((item) => { item.x -= offsetX; item.y -= offsetY; });
        this.particles.pool.forEachActive((item) => {
            item.x -= offsetX;
            item.y -= offsetY;
            item.x2 -= offsetX;
            item.y2 -= offsetY;
        });
        this.floatingText.pool.forEachActive((item) => { item.x -= offsetX; item.y -= offsetY; });
        this.boss.telegraphs.forEachActive((item) => { item.x -= offsetX; item.y -= offsetY; });
        this.camera.x -= offsetX;
        this.camera.y -= offsetY;
    }
    hasActiveRun() {
        return Boolean(this.runStats && this.player && this.stageManager?.stage);
    }
}
//# sourceMappingURL=GameManager.js.map