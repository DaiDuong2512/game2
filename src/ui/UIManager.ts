import { formatDecimal, formatNumber, formatTime } from '../core/MathUtils.js';
import type {
  CharacterConfig,
  ColorBlindMode,
  PermanentRewardChoice,
  PermanentStatId,
  PlayerStatBlock,
  RunStats,
  StarterOption,
  UpgradeOption,
  WeaponConfig,
  WeaponRuntime,
} from '../core/Types.js';
import type { GameManager } from '../game/GameManager.js';
import { Player, RAGE_ACTIVATION_THRESHOLD, ULTIMATE_ACTIVATION_THRESHOLD } from '../game/Player.js';
import { permanentPointEffect } from '../game/PlayerStats.js';
import { regularStageDuration } from '../game/StageManager.js';
import { weaponBalanceDamageMultiplier } from '../game/WeaponSystem.js';
import type { CodexView, MissionBriefing, NarrativeCue } from '../narrative/NarrativeTypes.js';
import {
  formatPlayerStatTransition,
  formatPlayerStatValue,
  PLAYER_STAT_GROUPS,
  PLAYER_STAT_LABELS,
} from './StatPresentation.js';

export function chargedSkillStatus(meter: number, threshold: number, activeSeconds = 0): string {
  if (activeSeconds > 0) return `Đang bật ${formatDecimal(activeSeconds, 1)} giây`;
  const value = Math.max(0, Math.floor(Number.isFinite(meter) ? meter : 0));
  return value >= threshold ? `Sẵn sàng · ${value}%` : `${value}/${threshold}%`;
}

export function chargedSkillFill(meter: number, threshold: number, activeSeconds = 0): number {
  if (activeSeconds > 0) return 1;
  return Math.max(0, Math.min(1, meter / Math.max(1, threshold)));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function asset(path: string): string {
  return path.startsWith('./') ? path : `./${path}`;
}

const statLabels: Partial<Record<keyof PlayerStatBlock, string>> = PLAYER_STAT_LABELS;

const upgradeTypeLabels: Record<UpgradeOption['type'], string> = {
  'weapon-new': 'Vũ khí mới',
  'weapon-level': 'Nâng cấp vũ khí',
  'weapon-mastery': 'Tinh thông vũ khí',
  'passive-new': 'Nội tại mới',
  'passive-level': 'Nâng cấp nội tại',
  evolution: 'Tiến hóa vũ khí',
  stat: 'Chỉ số',
};

const colorBlindLabels: Record<ColorBlindMode, string> = {
  off: 'Tắt',
  deuteranopia: 'Hỗ trợ mù xanh lục',
  protanopia: 'Hỗ trợ mù đỏ',
  tritanopia: 'Hỗ trợ mù xanh lam',
};

export class UIManager {
  private readonly game: GameManager;
  private readonly screenRoot: HTMLElement;
  private readonly hudRoot: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private lastHudUpdate = 0;
  private weaponSignature = '';
  private transmissionTimer: number | undefined;
  private hudObjectiveOverride = '';
  private upgradeKeyHandler: ((event: KeyboardEvent) => void) | null = null;

  public constructor(game: GameManager, screenRoot: HTMLElement, hudRoot: HTMLElement, toastRoot: HTMLElement) {
    this.game = game;
    this.screenRoot = screenRoot;
    this.hudRoot = hudRoot;
    this.toastRoot = toastRoot;
    this.applyAccessibilitySettings();
  }

  public showMainMenu(): void {
    this.applyAccessibilitySettings();
    this.hideHUD();
    const save = this.game.saveSystem.data;
    const frontier = this.game.data.stages.find((stage) => stage.index === save.highestStage)
      ?? this.game.data.stages[0];
    this.screenRoot.innerHTML = `
      <section class="screen main-menu" aria-labelledby="main-menu-title">
        <div class="screen-content">
          <div class="brand" aria-label="Hộ Vệ Khe Nứt: Cuộc Vây Hãm Vọng Âm">
            <span class="brand-mark" aria-hidden="true"></span>
            <span>Hộ Vệ Khe Nứt<small>Cuộc Vây Hãm Vọng Âm</small></span>
          </div>
          <img class="main-menu-art" src="${asset('assets/generated/key-art.png')}" alt="Các Hộ Vệ Khe Nứt giữa luồng năng lượng" />
          <div class="hero-copy">
            <h1 id="main-menu-title">Giữ vững phòng tuyến.</h1>
            <p>Chọn Hộ Vệ, phối hợp Di Vật và sống sót qua từng đợt quái.</p>
            ${frontier ? `<div class="campaign-brief">
              <span>Chiến tuyến hiện tại · Bản đồ ${frontier.index}</span>
              <strong>${escapeHtml(frontier.name)}</strong>
              <p>${escapeHtml(frontier.description)}</p>
            </div>` : ''}
            <div class="hero-actions">
              <button type="button" class="btn primary" id="start-run">Bắt đầu trận</button>
              <button type="button" class="btn" id="open-shop">Nâng cấp vĩnh viễn</button>
              <button type="button" class="btn gold ghost" id="open-codex">Nhật ký</button>
              <button type="button" class="btn ghost" id="open-settings">Cài đặt</button>
            </div>
          </div>
          <aside class="main-stats" aria-label="Tiến trình hiện tại">
            <div class="stat-row"><span>Tiền tuyến</span><strong>Bản đồ ${save.highestStage} / 20</strong></div>
            <div class="stat-row"><span>Mảnh Khe Nứt</span><strong>${formatNumber(save.riftShards)}</strong></div>
            <div class="stat-row"><span>Vàng dự trữ</span><strong>${formatNumber(save.goldReserve)}</strong></div>
            <div class="stat-row"><span>Số trận đã ghi</span><strong>${formatNumber(save.recordedRuns)}</strong></div>
          </aside>
          <footer class="main-footer">
            <span>WASD / phím mũi tên · Chuột · Tay cầm</span>
            <span>Q: Kỹ năng · E: Nộ · R: Tuyệt kỹ · Phím cách: Lướt · TAB: Chỉ số${this.game.qaMode ? ' · CHẾ ĐỘ KIỂM THỬ' : ''}</span>
          </footer>
        </div>
      </section>`;
    this.byId('start-run')?.addEventListener('click', () => this.game.showCharacterSelect());
    this.byId('open-shop')?.addEventListener('click', () => this.game.showShop());
    this.byId('open-codex')?.addEventListener('click', () => this.game.showCodex(() => this.game.showMainMenu()));
    this.byId('open-settings')?.addEventListener('click', () => this.game.showSettings());
  }

  public showCharacterSelect(): void {
    this.hideHUD();
    const selected = this.game.data.characterById.get(this.game.selectedCharacterId) ?? this.game.data.characters[0];
    if (!selected) return;
    const effectiveStats = new Map(this.game.data.characters.map((character) => {
      const preview = new Player(character, this.game.data.metaUpgrades, this.game.saveSystem.data);
      return [character.id, preview.stats] as const;
    }));
    const selectedStats = effectiveStats.get(selected.id);
    const selectionBackdrop = this.game.data.stageById.get(this.game.selectedStageId)?.thumbnail
      ?? this.game.data.stages[0]?.thumbnail
      ?? 'assets/generated/key-art.png';
    const selectedClassSkill = this.classSkillFor(selected);
    const narrativeProfile = this.game.narrative.character(selected.id);
    const relationshipItems = this.game.narrative.relationshipsFor(selected.id).map((relationship) => {
      const otherId = relationship.characters.find((id) => id !== selected.id);
      const otherName = this.game.data.characterById.get(otherId ?? '')?.name ?? 'Hộ Vệ khác';
      return `<li><strong>${escapeHtml(relationship.title)} · ${escapeHtml(otherName)}</strong><span>${escapeHtml(relationship.description)}</span></li>`;
    }).join('');
    const narrativeDetails = narrativeProfile ? `
      <details class="character-story-profile">
        <summary>Hồ sơ cốt truyện</summary>
        <dl>
          <div><dt>Động cơ</dt><dd>${escapeHtml(narrativeProfile.motivation)}</dd></div>
          <div><dt>Xung đột nội tâm</dt><dd>${escapeHtml(narrativeProfile.innerConflict)}</dd></div>
          <div><dt>Hành trình</dt><dd>${escapeHtml(narrativeProfile.arc)}</dd></div>
        </dl>
        ${relationshipItems ? `<h3>Quan hệ</h3><ul>${relationshipItems}</ul>` : ''}
      </details>` : '';
    const cards = this.game.data.characters.map((character) => {
      const unlocked = this.game.isCharacterUnlocked(character.id);
      const selectedClass = character.id === selected.id ? ' selected' : '';
      const classSkill = this.classSkillFor(character);
      const stats = effectiveStats.get(character.id);
      return `
        <article class="character-card${selectedClass}${unlocked ? '' : ' locked'}" data-character="${character.id}" role="button" tabindex="${unlocked ? 0 : -1}" aria-pressed="${character.id === selected.id}" aria-disabled="${!unlocked}">
          <div class="character-art">
            <div class="character-sprite-preview" role="img" aria-label="${escapeHtml(character.name)}" style="--character-sprite:url('${asset(character.gameplaySprite ?? character.portrait)}')"></div>
          </div>
          <div class="character-copy">
            <div class="title">${escapeHtml(character.title)}</div>
            <h2>${escapeHtml(character.name)}</h2>
            <p class="character-pitch">${escapeHtml(character.description)}</p>
            <div class="card-stats">
              <span><small>HP</small><strong>${Math.round(stats?.get('maxHp') ?? character.stats.maxHp)}</strong></span>
              <span><small>Sát thương</small><strong>${Math.round((stats?.get('damage') ?? character.stats.damage) * 100)}%</strong></span>
              <span><small>Tốc đánh</small><strong>x${formatDecimal(stats?.get('attackSpeed') ?? character.stats.attackSpeed, 2)}</strong></span>
            </div>
            <div class="class-trait"><small>Đặc tính lớp</small><strong>${escapeHtml(character.passive.name)}</strong></div>
            <div class="ability-list" aria-label="Ba kỹ năng nhân vật">
              <span><small>Kỹ năng · Q</small>${escapeHtml(classSkill.name)}</span>
              <span><small>Nộ · E</small>${escapeHtml(character.rage?.name ?? 'Nộ chiến')}</span>
              <span><small>Tuyệt kỹ · R</small>${escapeHtml(character.ultimate?.name ?? 'Tuyệt kỹ')}</span>
            </div>
          </div>
          ${character.id === selected.id ? '<span class="selected-marker">Đang chọn</span>' : ''}
          ${unlocked ? '' : `<div class="lock-badge">Hoàn thành bản đồ ${character.unlockStage}</div>`}
        </article>`;
    }).join('');

    this.screenRoot.innerHTML = `
      <section class="screen character-select-screen" style="--selection-backdrop:url('${asset(selectionBackdrop)}')">
        <div class="screen-content">
          ${this.header('Triển khai · Bước 1/2', 'Chọn Hộ Vệ', 'continue-stage', 'Chọn bản đồ', true)}
          <div class="shared-progression-note" role="note"><strong>Nâng cấp dùng chung</strong><span>Mọi Hộ Vệ đều nhận toàn bộ nâng cấp vĩnh viễn. Chỉ số trên thẻ đã bao gồm tiến trình hiện tại.</span></div>
          ${this.permanentProgressionSummary()}
          <div class="selection-layout">
            <div class="character-grid" aria-label="Danh sách Hộ Vệ">${cards}</div>
            <aside class="selection-summary panel" aria-label="Thông tin Hộ Vệ đang chọn">
              <div class="selection-summary-hero">
                <div class="summary-portrait">
                  <div class="character-sprite-preview" role="img" aria-label="${escapeHtml(selected.name)}" style="--character-sprite:url('${asset(selected.gameplaySprite ?? selected.portrait)}')"></div>
                </div>
                <div class="selection-summary-identity">
                  <div class="screen-kicker align-left">Hộ Vệ đã chọn</div>
                  <h2>${escapeHtml(selected.name)}</h2>
                  <p>${escapeHtml(selected.description)}</p>
                </div>
              </div>
              <div class="selected-stat-grid" aria-label="Thông số Hộ Vệ">
                <div class="wide"><span>Vũ khí</span><strong>${escapeHtml(this.game.data.weaponById.get(selected.startWeapon)?.name ?? 'Vũ khí không xác định')}</strong></div>
                <div><span>Sinh lực</span><strong>${Math.round(selectedStats?.get('maxHp') ?? selected.stats.maxHp)}</strong></div>
                <div><span>Giáp</span><strong>${formatDecimal(selectedStats?.get('armor') ?? selected.stats.armor, 1)}</strong></div>
                <div><span>Tốc độ</span><strong>${Math.round(selectedStats?.get('moveSpeed') ?? selected.stats.moveSpeed)}</strong></div>
                <div><span>Sát thương</span><strong>${Math.round((selectedStats?.get('damage') ?? selected.stats.damage) * 100)}%</strong></div>
                <div><span>Tốc đánh</span><strong>x${formatDecimal(selectedStats?.get('attackSpeed') ?? selected.stats.attackSpeed, 2)}</strong></div>
                <div><span>Giảm hồi chiêu</span><strong>${Math.round((selectedStats?.get('cooldownReduction') ?? selected.stats.cooldownReduction) * 100)}%</strong></div>
              </div>
              <div class="selected-class-trait"><span>Đặc tính lớp</span><strong>${escapeHtml(selected.passive.name)}</strong><p>${escapeHtml(selected.passive.description)}</p></div>
              <div class="ability-details">
                ${this.characterAbility('Kỹ năng lớp · Q', selectedClassSkill.name, selectedClassSkill.description)}
                ${this.characterAbility('Nộ · E', selected.rage?.name ?? 'Nộ chiến', selected.rage?.description ?? 'Kích hoạt sức mạnh riêng của Hộ Vệ.')}
                ${this.characterAbility('Tuyệt kỹ · R', selected.ultimate?.name ?? 'Tuyệt kỹ', selected.ultimate?.description ?? 'Giải phóng tuyệt kỹ riêng của Hộ Vệ.')}
              </div>
              ${narrativeDetails}
              <button type="button" class="btn primary full-width selection-continue" id="continue-stage-side">Chọn bản đồ</button>
            </aside>
          </div>
          <div class="mobile-primary-action"><button type="button" class="btn primary" id="continue-stage-mobile">Chọn bản đồ</button></div>
        </div>
      </section>`;
    this.bindBack(() => this.game.showMainMenu());
    this.byId('continue-stage')?.addEventListener('click', () => this.game.showStageSelect());
    this.byId('continue-stage-side')?.addEventListener('click', () => this.game.showStageSelect());
    this.byId('continue-stage-mobile')?.addEventListener('click', () => this.game.showStageSelect());
    this.screenRoot.querySelectorAll<HTMLElement>('[data-character]').forEach((card) => {
      const choose = (): void => this.game.selectCharacter(card.dataset.character ?? '');
      card.addEventListener('click', choose);
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        choose();
      });
    });
  }

  public showStageSelect(): void {
    this.hideHUD();
    const selected = this.game.data.stageById.get(this.game.selectedStageId) ?? this.game.data.stages[0];
    if (!selected) return;
    const cards = this.game.data.stages.map((stage) => {
      const unlocked = this.game.isStageUnlocked(stage.index);
      return `
        <article class="stage-card${stage.id === selected.id ? ' selected' : ''}${unlocked ? '' : ' locked'}" data-stage="${stage.id}" role="button" tabindex="${unlocked ? 0 : -1}" aria-pressed="${stage.id === selected.id}" aria-disabled="${!unlocked}">
          <img src="${asset(stage.thumbnail)}" alt="${escapeHtml(stage.name)}" />
          <div class="stage-card-copy">
            <div class="stage-number">Bản đồ ${stage.index}</div>
            <h3>${escapeHtml(stage.name)}</h3>
            <p>${escapeHtml(stage.description)}</p>
            <div class="stage-meta"><span>${stage.waveCount} đợt · ${Math.ceil(regularStageDuration(stage.duration) / 60)} phút</span><span class="${stage.bossId ? 'boss-tag' : ''}">${stage.bossId ? 'Trùm' : 'Tinh Anh'}</span></div>
          </div>
          ${stage.id === selected.id ? '<span class="selected-marker">Đang chọn</span>' : ''}
          ${unlocked ? '' : '<div class="lock-badge">Chưa mở khóa</div>'}
        </article>`;
    }).join('');
    this.screenRoot.innerHTML = `
      <section class="screen stage-select-screen">
        <div class="screen-content">
          ${this.header('Triển khai · Bước 2/2', 'Chọn bản đồ', '', '', false)}
          <div class="selected-stage-brief panel" aria-label="Bản đồ đang chọn">
            <img src="${asset(selected.thumbnail)}" alt="" />
            <div><span>Bản đồ ${selected.index} · ${selected.waveCount} đợt</span><strong>${escapeHtml(selected.name)}</strong><p>${escapeHtml(selected.description)}</p></div>
            <button type="button" class="btn primary" id="deploy-run-side">Vào trận</button>
          </div>
          <div class="stage-layout"><div class="stage-grid" aria-label="Danh sách bản đồ">${cards}</div></div>
          <div class="mobile-primary-action"><button type="button" class="btn primary" id="deploy-run-mobile">Vào trận · ${escapeHtml(selected.name)}</button></div>
        </div>
      </section>`;
    this.bindBack(() => this.game.showCharacterSelect());
    this.byId('deploy-run-side')?.addEventListener('click', () => this.game.startSelectedRun());
    this.byId('deploy-run-mobile')?.addEventListener('click', () => this.game.startSelectedRun());
    this.screenRoot.querySelectorAll<HTMLElement>('[data-stage]').forEach((card) => {
      const choose = (): void => this.game.selectStage(card.dataset.stage ?? '');
      card.addEventListener('click', choose);
      card.addEventListener('dblclick', () => {
        choose();
        this.game.startSelectedRun();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        choose();
      });
    });
  }

  public showShop(): void {
    this.hideHUD();
    const rows = this.game.data.metaUpgrades.map((config) => {
      const level = this.game.meta.level(config.id);
      const cost = this.game.meta.cost(config);
      const rawAmount = config.stat === 'maxHp' || config.stat === 'armor'
        ? config.perLevel
        : config.perLevel * 100;
      const amount = formatDecimal(rawAmount, rawAmount < 1 ? 1 : 0);
      return `
        <div class="shop-row">
          <div><h3>${escapeHtml(config.name)}</h3><p>Mỗi cấp tăng vĩnh viễn ${escapeHtml((statLabels[config.stat] ?? 'chỉ số').toLocaleLowerCase('vi'))} thêm ${amount}${config.stat === 'maxHp' || config.stat === 'armor' ? '' : '%'}.</p></div>
          <div class="shop-level" aria-label="${escapeHtml(config.name)}, cấp ${level}, không giới hạn"><span>Cấp ${level}</span><span class="shop-endless">∞ Không giới hạn</span></div>
          <button type="button" class="btn gold" data-meta="${config.id}">${formatNumber(cost)} vàng</button>
        </div>`;
    }).join('');
    this.screenRoot.innerHTML = `
      <section class="screen shop-screen">
        <div class="screen-content">
          ${this.header('Tiến trình lâu dài', 'Nâng cấp vĩnh viễn', '', '', false)}
          <div class="shop-layout">
            <div class="shop-list">${rows}</div>
            <aside class="resource-card panel">
              <div class="screen-kicker align-left">Vàng dự trữ</div>
              <div class="currency">${formatNumber(this.game.saveSystem.data.goldReserve)}</div>
              <p>Vàng kiếm được trong trận sẽ cất tại đây. Mọi Hộ Vệ đều nhận các nâng cấp này.</p>
              <div class="stat-row"><span>Mảnh Khe Nứt</span><strong>${formatNumber(this.game.saveSystem.data.riftShards)}</strong></div>
              <div class="stat-row"><span>Bản đồ cao nhất</span><strong>${this.game.saveSystem.data.highestStage} / 20</strong></div>
              <button type="button" class="btn primary full-width resource-action" id="shop-start">Bắt đầu trận</button>
            </aside>
          </div>
        </div>
      </section>`;
    this.bindBack(() => this.game.showMainMenu());
    this.byId('shop-start')?.addEventListener('click', () => this.game.showCharacterSelect());
    this.screenRoot.querySelectorAll<HTMLButtonElement>('[data-meta]').forEach((button) => {
      button.addEventListener('click', () => this.game.purchaseMeta(button.dataset.meta ?? ''));
    });
  }

  public showSettings(): void {
    this.hideHUD();
    const settings = this.game.saveSystem.data.settings;
    this.screenRoot.innerHTML = `
      <section class="screen settings-screen">
        <div class="screen-content">
          ${this.header('Hệ thống', 'Cài đặt', '', '', false)}
          <div class="settings-layout panel">
            <section class="settings-group" aria-labelledby="settings-audio"><h2 id="settings-audio">Âm thanh và phản hồi</h2>
              ${this.rangeSetting('Âm lượng tổng', 'Điều chỉnh toàn bộ âm thanh trong trò chơi.', 'masterVolume', settings.masterVolume, 0, 1, .05)}
              ${this.rangeSetting('Âm lượng hiệu ứng', 'Âm thanh vũ khí, vật phẩm và giao chiến.', 'effectsVolume', settings.effectsVolume, 0, 1, .05)}
              ${this.rangeSetting('Phản hồi va chạm', 'Điều chỉnh rung màn hình và nhịp dừng cực ngắn khi đòn nặng trúng mục tiêu; đặt 0 để tắt.', 'screenShake', settings.screenShake, 0, 1, .05)}
            </section>
            <section class="settings-group" aria-labelledby="settings-gameplay"><h2 id="settings-gameplay">Trận đấu và hiệu năng</h2>
              ${this.toggleSetting('Hiện số sát thương', 'Hiện sát thương, chí mạng và né tránh trong trận.', 'damageNumbers', settings.damageNumbers)}
              ${this.toggleSetting('Giảm hiệu ứng hạt', 'Giảm mật độ hiệu ứng để máy cấu hình thấp chạy mượt hơn.', 'reducedParticles', settings.reducedParticles)}
              ${this.toggleSetting('Tự động ngắm', 'Vũ khí tự ưu tiên kẻ địch gần nhất.', 'autoAim', settings.autoAim)}
            </section>
            <section class="settings-group" aria-labelledby="settings-accessibility"><h2 id="settings-accessibility">Khả năng tiếp cận</h2>
              ${this.toggleSetting('Tương phản cao', 'Tăng độ tách biệt giữa người chơi, kẻ địch và nền.', 'highContrast', settings.highContrast)}
              ${this.colorBlindSetting(settings.colorBlindMode)}
            </section>
            <section class="settings-group settings-danger" aria-labelledby="settings-save"><h2 id="settings-save">Dữ liệu lưu</h2>
              <div class="setting-row"><div><label>Đặt lại toàn bộ tiến trình</label><p>Xóa nhân vật, bản đồ, vàng, nâng cấp và cài đặt đã lưu trên thiết bị này.</p></div><div class="setting-control align-end"><button type="button" class="btn danger ghost" id="reset-save">Xóa dữ liệu lưu</button></div></div>
            </section>
          </div>
        </div>
      </section>`;
    this.bindBack(() => this.game.showMainMenu());
    this.screenRoot.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        this.game.updateSettings({ [input.dataset.setting ?? '']: Number(input.value) });
        const output = this.byId(`${input.id}-value`);
        if (output) output.textContent = `${Math.round(Number(input.value) * 100)}%`;
      });
    });
    this.screenRoot.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.toggle as 'damageNumbers' | 'reducedParticles' | 'autoAim' | 'highContrast';
        const value = !this.game.saveSystem.data.settings[key];
        this.game.updateSettings({ [key]: value });
        this.applyAccessibilitySettings();
        button.classList.toggle('on', value);
        button.setAttribute('aria-checked', String(value));
        const state = button.querySelector('span');
        if (state) state.textContent = value ? 'Bật' : 'Tắt';
      });
    });
    this.screenRoot.querySelectorAll<HTMLSelectElement>('[data-color-blind]').forEach((select) => {
      select.addEventListener('change', () => {
        this.game.updateSettings({ colorBlindMode: select.value as ColorBlindMode });
        this.applyAccessibilitySettings();
      });
    });
    this.byId('reset-save')?.addEventListener('click', () => {
      if (window.confirm('Xóa toàn bộ tiến trình, cài đặt và nội dung đã mở khóa? Thao tác này không thể hoàn tác.')) this.game.resetSave();
    });
  }

  public showGameplayHUD(): void {
    this.screenRoot.innerHTML = '';
    this.hudRoot.classList.remove('hidden');
    this.setMobileControlsActive(true);
    this.weaponSignature = '';
    this.hudObjectiveOverride = '';
    const active = this.classSkill();
    const rageName = this.game.player.character.rage?.name ?? 'Nộ chiến';
    const ultimateName = this.game.player.character.ultimate?.name ?? 'Tuyệt kỹ';
    this.hudRoot.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-panel player-status" aria-label="Trạng thái nhân vật">
          <img class="hud-portrait" src="${asset(this.game.player.character.portrait)}" alt="${escapeHtml(this.game.player.character.name)}" />
          <div class="player-bars"><div class="player-bar-head"><strong id="hud-level">Cấp 1</strong><span id="hud-hp-text">0 / 0</span></div>
            <div class="bar-row"><small>Sinh lực</small><div class="bar hp" id="hud-hp-bar" role="progressbar" aria-label="Sinh lực" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="hud-hp-fill"></span></div></div>
            <div class="bar-row"><small>Kinh nghiệm</small><div class="bar exp" id="hud-exp-bar" role="progressbar" aria-label="Kinh nghiệm" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="hud-exp-fill"></span></div></div>
          </div>
        </div>
        <button type="button" class="dash-resource" id="dash-skill" aria-label="Lướt bằng Phím cách, đang sẵn sàng">
          <span class="dash-key" aria-hidden="true">SPACE</span>
          <span class="dash-label">Lướt</span>
          <span class="dash-state" id="dash-cd">Sẵn sàng</span>
          <span class="dash-meter" aria-hidden="true"><i id="dash-meter-fill"></i></span>
        </button>
        <div class="hud-panel stage-chip" aria-label="Tiến trình bản đồ"><small id="hud-stage-index">Bản đồ 1</small><strong id="hud-stage-name">Biên Kính Hộ</strong><small id="hud-wave">Đợt 1 / 4</small></div>
      </div>
      <div class="hud-top-center"><div class="timer-card" aria-label="Thời gian và thống kê trận"><div class="timer-head"><span id="hud-wave-center">Đợt 1 / 4</span><div class="timer" id="hud-timer">0:00</div></div><div class="hud-objective" id="hud-objective">Giữ vững phòng tuyến</div><div class="timer-meta"><span id="hud-kills">Tiêu diệt 0</span><span id="hud-gold">Vàng 0</span><span id="hud-hostiles">Kẻ địch 0</span></div></div></div>
      <div class="hud-top-right hud-quick-actions">
        <button type="button" class="hud-stats-toggle" id="hud-stats-toggle" aria-controls="character-stats-panel" aria-expanded="false" aria-label="Mở bảng chỉ số nhân vật bằng phím Tab"><kbd aria-hidden="true">TAB</kbd><span>Chỉ số</span></button>
        <button type="button" class="btn icon pause-button" id="hud-pause" aria-label="Tạm dừng" title="Tạm dừng"><span aria-hidden="true">Ⅱ</span></button>
      </div>
      <aside class="character-stats-panel hidden" id="character-stats-panel" aria-hidden="true" aria-label="Chỉ số chi tiết của nhân vật hiện tại">
        <header>
          <div><small>Hộ Vệ hiện tại · TAB</small><strong id="hud-stats-character">${escapeHtml(this.game.player.character.name)}</strong><span id="hud-stats-level">Cấp 1</span></div>
          <button type="button" id="close-character-stats" aria-label="Đóng bảng chỉ số">×</button>
        </header>
        <div class="character-stats-scroll">${this.characterStatsMarkup()}</div>
        <footer><strong id="hud-stats-passive">Nội tại</strong><span id="hud-stats-shards">Mảnh chỉ số 0 · Mảnh chí mạng kỹ năng 0</span></footer>
      </aside>
      <div class="boss-bar hidden" id="boss-bar" aria-label="Sinh lực trùm"><div class="boss-bar-head"><span id="boss-name">Trùm</span><span id="boss-phase">Giai đoạn 1</span></div><div class="bar" id="boss-hp-bar" role="progressbar" aria-label="Sinh lực trùm" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="boss-hp-fill"></span></div></div>
      <div class="boss-blessing hidden" id="boss-blessing" role="status"><strong>Ban Phước Hộ Vệ</strong><span id="boss-blessing-detail">Hút máu 15% · Tốc đánh +30% · Khiên Ấn 100% HP</span></div>
      <div class="boss-aftermath hidden" id="boss-aftermath" role="status" aria-live="polite"><strong id="boss-aftermath-time">Đại thanh trừng · 10,0 giây</strong><span id="boss-aftermath-detail">Bất tử · +1000% sát thương/tốc đạn/kích cỡ · +10 tia · 0/1.000 quân</span></div>
      <div class="warning-banner hidden" id="hud-warning" role="alert"></div>
      <div class="hud-bottom-left"><div class="weapon-strip" id="weapon-strip"></div></div>
      <div class="hud-bottom-right" aria-label="Ba kỹ năng nhân vật">
        ${this.skillButton('active-skill', active.name, 'Q', 'Kỹ năng lớp', 'active-cd', 'active-meter-fill', 'class-skill', active.icon)}
        ${this.skillButton('rage-skill', rageName, 'E', 'Nộ', 'rage-meter', 'rage-meter-fill', 'rage', this.abilityIcon('rage'))}
        ${this.skillButton('ultimate-skill', ultimateName, 'R', 'Tuyệt kỹ', 'ultimate-meter', 'ultimate-meter-fill', 'ultimate', this.abilityIcon('ultimate'))}
      </div>`;
    this.byId('hud-pause')?.addEventListener('click', () => this.game.pause());
    this.byId('hud-stats-toggle')?.addEventListener('click', () => this.toggleCharacterStats());
    this.byId('close-character-stats')?.addEventListener('click', () => this.toggleCharacterStats(false));
    this.byId('dash-skill')?.addEventListener('click', () => this.game.input.pressVirtual('Space'));
    this.byId('active-skill')?.addEventListener('click', () => this.game.input.pressVirtual('KeyQ'));
    this.byId('rage-skill')?.addEventListener('click', () => this.game.input.pressVirtual('KeyE'));
    this.byId('ultimate-skill')?.addEventListener('click', () => this.game.input.pressVirtual('KeyR'));
    this.updateHUD(true);
  }

  public updateHUD(force = false): void {
    if (this.hudRoot.classList.contains('hidden') || !this.game.runStats || !this.game.player) return;
    const now = performance.now();
    if (!force && now - this.lastHudUpdate < 70) return;
    this.lastHudUpdate = now;
    const player = this.game.player;
    const stage = this.game.stageManager.stage;
    if (!stage) return;
    this.setText('hud-level', `Cấp ${player.level}`);
    this.setText('hud-hp-text', `${formatNumber(Math.ceil(player.health))} / ${formatNumber(Math.ceil(player.stats.get('maxHp')))}`);
    this.setProgress('hud-hp-bar', 'hud-hp-fill', player.health / Math.max(1, player.stats.get('maxHp')));
    this.setProgress('hud-exp-bar', 'hud-exp-fill', player.exp / Math.max(1, player.expToNext));
    this.setText('hud-stage-index', `Bản đồ ${stage.index}`);
    this.setText('hud-stage-name', stage.name);
    this.setText('hud-wave', `Đợt ${this.game.stageManager.wave} / ${stage.waveCount}`);
    this.setText('hud-wave-center', `Đợt ${this.game.stageManager.wave} / ${stage.waveCount}`);
    this.setText('hud-objective', this.hudObjectiveOverride || (stage.bossId ? 'Sống sót và đánh bại Trùm' : 'Sống sót và đánh bại Tinh Anh'));
    this.setText('hud-timer', formatTime(this.game.stageManager.remaining()));
    this.setText('hud-kills', `Tiêu diệt ${formatNumber(this.game.runStats.kills)}`);
    this.setText('hud-gold', `Vàng ${formatNumber(this.game.runStats.gold)}`);
    this.setText('hud-hostiles', `Kẻ địch ${formatNumber(this.game.spawner.pool.countActive())}`);
    const dashStatus = player.dashCooldown > 0 ? `${formatDecimal(player.dashCooldown, 1)} giây` : 'Sẵn sàng';
    const activeStatus = player.activeCooldown > 0 ? `${formatDecimal(player.activeCooldown, 1)} giây` : 'Sẵn sàng';
    const rageStatus = chargedSkillStatus(player.rageMeter, RAGE_ACTIVATION_THRESHOLD, player.rageActive);
    const ultimateStatus = chargedSkillStatus(player.ultimateMeter, ULTIMATE_ACTIVATION_THRESHOLD, player.ultimateActive);
    this.setText('dash-cd', dashStatus);
    this.setText('active-cd', activeStatus);
    this.setText('rage-meter', rageStatus);
    this.setText('ultimate-meter', ultimateStatus);
    const playerWithClassCooldown = player as typeof player & { activeCooldownDuration?: () => number };
    const activeFactor = player.rageActive > 0 && player.character.rage?.kind === 'astral' ? 0.55 : 1;
    const activeMax = playerWithClassCooldown.activeCooldownDuration?.()
      ?? Math.max(2.8, 10 * (1 - player.stats.get('cooldownReduction')) * activeFactor);
    this.setWidth('dash-meter-fill', player.dashCooldown <= 0 ? 1 : 1 - player.dashCooldown / 2.8);
    this.setWidth('active-meter-fill', player.activeCooldown <= 0 ? 1 : 1 - player.activeCooldown / activeMax);
    this.setWidth('rage-meter-fill', chargedSkillFill(player.rageMeter, RAGE_ACTIVATION_THRESHOLD, player.rageActive));
    this.setWidth('ultimate-meter-fill', chargedSkillFill(player.ultimateMeter, ULTIMATE_ACTIVATION_THRESHOLD, player.ultimateActive));
    this.byId('dash-skill')?.classList.toggle('ready', player.dashCooldown <= 0);
    this.byId('active-skill')?.classList.toggle('ready', player.activeCooldown <= 0);
    this.byId('rage-skill')?.classList.toggle('ready', player.rageMeter >= RAGE_ACTIVATION_THRESHOLD);
    this.byId('rage-skill')?.classList.toggle('active', player.rageActive > 0);
    this.byId('ultimate-skill')?.classList.toggle('ready', player.ultimateMeter >= ULTIMATE_ACTIVATION_THRESHOLD);
    this.byId('ultimate-skill')?.classList.toggle('active', player.ultimateActive > 0);
    this.setSkillAccessibility('dash-skill', 'Lướt', dashStatus, player.dashCooldown <= 0);
    this.setSkillAccessibility('active-skill', this.classSkill().name, activeStatus, player.activeCooldown <= 0);
    this.setSkillAccessibility('rage-skill', player.character.rage?.name ?? 'Nộ chiến', rageStatus, player.rageMeter >= RAGE_ACTIVATION_THRESHOLD || player.rageActive > 0);
    this.setSkillAccessibility('ultimate-skill', player.character.ultimate?.name ?? 'Tuyệt kỹ', ultimateStatus, player.ultimateMeter >= ULTIMATE_ACTIVATION_THRESHOLD || player.ultimateActive > 0);

    const warning = this.byId('hud-warning');
    if (warning) {
      warning.textContent = this.game.stageManager.warning;
      warning.classList.toggle('hidden', !this.game.stageManager.warning);
    }
    const boss = this.game.boss.getBoss();
    const bossBar = this.byId('boss-bar');
    if (bossBar) {
      bossBar.classList.toggle('hidden', !boss);
      if (boss) {
        this.setText('boss-name', boss.config.name);
        this.setText('boss-phase', `Giai đoạn ${boss.phase}`);
        this.setProgress('boss-hp-bar', 'boss-hp-fill', boss.health / Math.max(1, boss.maxHealth));
      }
    }
    const blessing = this.byId('boss-blessing');
    if (blessing) {
      blessing.classList.toggle('hidden', !player.bossBlessingActive || player.bossAftermathActive());
      if (player.bossBlessingActive && !player.bossAftermathActive()) {
        this.setText('boss-blessing-detail', `Hút máu 15% · Tốc đánh +30% · Khiên ${formatNumber(Math.ceil(player.sealShield))}`);
      }
    }
    const aftermath = this.byId('boss-aftermath');
    if (aftermath) {
      const active = player.bossAftermathActive();
      aftermath.classList.toggle('hidden', !active);
      if (active) {
        this.setText('boss-aftermath-time', `Đại thanh trừng · ${formatDecimal(player.bossAftermathTime, 1)} giây`);
        this.setText('boss-aftermath-detail', `Bất tử · +1000% sát thương/tốc đạn/kích cỡ · +10 tia · ${formatNumber(this.game.bossAftermathSpawned)}/1.000 quân`);
      }
    }
    this.updateWeaponStrip();
    const statsPanel = this.byId('character-stats-panel');
    if (statsPanel && !statsPanel.classList.contains('hidden')) this.updateCharacterStats();
  }

  public toggleCharacterStats(force?: boolean): void {
    const panel = this.byId('character-stats-panel');
    const toggle = this.byId('hud-stats-toggle');
    if (!panel || !toggle) return;
    const open = force ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? 'Đóng' : 'Mở'} bảng chỉ số nhân vật bằng phím Tab`);
    if (open) this.updateCharacterStats();
  }

  private characterStatsMarkup(): string {
    return PLAYER_STAT_GROUPS.map((group) => `
      <section class="character-stat-group">
        <h2>${escapeHtml(group.title)}</h2>
        <dl>${group.stats.map((stat) => `<div><dt>${escapeHtml(PLAYER_STAT_LABELS[stat])}</dt><dd id="hud-stat-${stat}">—</dd></div>`).join('')}</dl>
      </section>`).join('');
  }

  private updateCharacterStats(): void {
    const player = this.game.player;
    if (!player) return;
    const snapshot = player.stats.snapshot();
    this.setText('hud-stats-character', player.character.name);
    this.setText('hud-stats-level', `Cấp ${player.level} · HP ${formatPlayerStatValue('maxHp', player.health)} / ${formatPlayerStatValue('maxHp', snapshot.maxHp)}`);
    this.setText('hud-stats-passive', this.game.passives?.statusText(this.game) ?? player.character.passive.name);
    this.setText('hud-stats-shards', `Mảnh chỉ số ${player.statShards} · Mảnh chí mạng kỹ năng ${player.skillCritShards}`);
    for (const group of PLAYER_STAT_GROUPS) {
      for (const stat of group.stats) {
        const value = stat === 'attackSpeed' ? player.effectiveAttackSpeed()
          : stat === 'lifeSteal' ? player.effectiveLifeSteal() : snapshot[stat];
        this.setText(`hud-stat-${stat}`, formatPlayerStatValue(stat, value));
      }
    }
  }

  private updateWeaponStrip(): void {
    const strip = this.byId('weapon-strip');
    if (!strip) return;
    const entries = this.game.weapons.entries();
    const withSlot = entries.map((entry) => ({
      ...entry,
      slot: (entry.runtime as typeof entry.runtime & { slot?: 'primary' | 'auxiliary' }).slot,
    }));
    const primary = withSlot.find((entry) => entry.slot === 'primary')
      ?? withSlot.find((entry) => entry.config.id === this.game.player.character.startWeapon)
      ?? withSlot[0];
    const auxiliaries = withSlot.filter((entry) => entry !== primary && entry.slot !== 'primary').slice(0, 3);
    const signature = withSlot.map((entry) => `${entry.config.id}:${entry.slot ?? ''}:${entry.runtime.level}:${entry.runtime.evolutionId ?? ''}`).join('|');
    if (signature !== this.weaponSignature) {
      this.weaponSignature = signature;
      const primaryMarkup = primary ? this.weaponSlot(primary, true) : '<div class="weapon-slot weapon-slot-main empty" aria-label="Chưa có vũ khí chính"><span>—</span></div>';
      const auxiliaryMarkup = [0, 1, 2].map((index) => {
        const entry = auxiliaries[index];
        return entry ? this.weaponSlot(entry, false) : `<div class="weapon-slot empty" aria-label="Ô vũ khí phụ ${index + 1} còn trống"><span>${index + 1}</span></div>`;
      }).join('');
      strip.innerHTML = `
        <section class="weapon-group weapon-primary" aria-label="Vũ khí chính">
          <div class="weapon-group-label"><span>Vũ khí chính</span><b>Mặc định</b></div>
          ${primaryMarkup}
        </section>
        <span class="weapon-separator" aria-hidden="true"></span>
        <section class="weapon-group weapon-auxiliary" aria-label="Vũ khí phụ tự động, ${auxiliaries.length} trên 3 ô đã dùng">
          <div class="weapon-group-label"><span>Vũ khí phụ · Tự động</span><b>${auxiliaries.length}/3</b></div>
          <div class="auxiliary-slots">${auxiliaryMarkup}</div>
        </section>`;
    }
    for (const entry of withSlot) {
      const level = entry.config.levels[entry.runtime.level - 1];
      const mask = strip.querySelector<HTMLElement>(`[data-cooldown="${entry.config.id}"]`);
      if (!level || !mask) continue;
      const maxCooldown = level.cooldown * (1 - this.game.player.stats.get('cooldownReduction')) / this.game.player.effectiveAttackSpeed();
      mask.style.height = `${Math.max(0, Math.min(1, entry.runtime.cooldown / Math.max(0.05, maxCooldown))) * 100}%`;
    }
  }

  public showPause(): void {
    this.setMobileControlsActive(false);
    this.screenRoot.innerHTML = `
      <div class="overlay">
        <section class="overlay-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div class="screen-kicker">Trận đấu đã tạm dừng</div>
          <h1 id="pause-title">Tạm dừng</h1>
          <p>Thế giới đang đứng yên. Bạn có thể tiếp tục mà không làm thay đổi trạng thái hiện tại.</p>
          <div class="pause-actions">
            <button type="button" class="btn primary" id="resume-run">Tiếp tục</button>
            <button type="button" class="btn" id="restart-run">Chơi lại bản đồ</button>
            <button type="button" class="btn danger" id="abandon-run">Kết thúc trận</button>
          </div>
        </section>
      </div>`;
    this.byId('resume-run')?.focus();
    this.byId('resume-run')?.addEventListener('click', () => this.game.resume());
    this.byId('restart-run')?.addEventListener('click', () => {
      if (window.confirm('Chơi lại bản đồ và hủy toàn bộ tiến trình của trận hiện tại?')) this.game.startSelectedRun();
    });
    this.byId('abandon-run')?.addEventListener('click', () => {
      if (window.confirm('Kết thúc trận và cất số vàng đã thu thập?')) this.game.abandonRun();
    });
  }

  public showLevelUp(options: UpgradeOption[]): void {
    this.setMobileControlsActive(false);
    const scheduledLevel = this.game.upgrades.scheduledChoiceLevel();
    const weaponMilestone = scheduledLevel !== null && scheduledLevel > 1 && scheduledLevel % 5 === 0;
    const progressionTitle = weaponMilestone ? 'Cường hóa vũ khí' : 'Cường hóa Hộ Vệ';
    const progressionKicker = scheduledLevel === 0
      ? 'Di Vật Khe Nứt · Rương chiến lợi phẩm'
      : `Di Vật Khe Nứt · Cấp ${scheduledLevel ?? this.game.player.level}`;
    const cards = options.map((option, index) => {
      const weapon = this.weaponForUpgrade(option);
      const elementClass = weapon ? ` element-${weapon.element}` : '';
      return `
      <article class="upgrade-card relic-choice rarity-${escapeHtml(option.rarity.id)}${elementClass}">
        <button type="button" class="upgrade-select" data-upgrade="${option.id}" aria-label="Lựa chọn ${index + 1}: ${escapeHtml(option.title)}">
          <span class="choice-number" aria-hidden="true">${index + 1} / ${options.length}</span>
          <div class="upgrade-icon"><img src="${asset(option.icon)}" alt="${escapeHtml(option.title)}" /></div>
          <div class="upgrade-copy">
            <div class="upgrade-rarity">${escapeHtml(option.rarity.name)} · ${escapeHtml(upgradeTypeLabels[option.type])}</div>
            <h3>${escapeHtml(option.title)}</h3>
            <p>${escapeHtml(option.description)}</p>
            ${weapon ? this.weaponCardFacts(weapon.id, option.nextLevel) : this.generalUpgradeFacts(option)}
            <div class="upgrade-level">${option.nextLevel ? `Cấp tiếp theo ${option.nextLevel}` : option.type === 'evolution' ? 'Tiến hóa vũ khí' : `Sức mạnh ×${formatDecimal(option.rarity.multiplier, 2)}`}</div>
          </div>
        </button>
      </article>`;
    }).join('');
    this.screenRoot.innerHTML = `
      <div class="overlay upgrade-overlay">
        <section class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="level-up-title">
          <div class="screen-kicker">${progressionKicker}</div>
          <h1 id="level-up-title">${progressionTitle}</h1>
          <p>Bắt buộc chọn 1 trong ${options.length}. Ưu tiên hiệu ứng chữ ký và cộng hưởng với bộ vũ khí hiện tại.</p>
          <div class="upgrade-grid">${cards}</div>
          <div class="upgrade-actions">
            <button type="button" class="btn" id="reroll-upgrades" ${this.game.upgrades.rerolls <= 0 ? 'disabled' : ''}>Đổi lựa chọn · ${this.game.upgrades.rerolls}</button>
            <span class="upgrade-key-hint">1–3 chọn nhanh · ← → đổi thẻ · Enter xác nhận</span>
          </div>
        </section>
      </div>`;
    this.screenRoot.querySelectorAll<HTMLElement>('[data-upgrade]').forEach((button) => {
      button.addEventListener('click', () => this.game.chooseUpgrade(button.dataset.upgrade ?? ''));
    });
    this.byId('reroll-upgrades')?.addEventListener('click', () => this.game.rerollUpgrades());
    this.bindChoiceKeyboard('[data-upgrade]', 'level-up');
  }

  public showStartingLoadout(options: StarterOption[]): void {
    this.setMobileControlsActive(false);
    const cards = options.map((option, index) => {
      const weapon = this.game.data.weaponById.get(option.weaponId);
      return `
      <article class="upgrade-card starter-card relic-choice${weapon ? ` element-${weapon.element}` : ''}">
        <button type="button" class="upgrade-select" data-starter="${option.id}" aria-label="Lựa chọn ${index + 1}: ${escapeHtml(option.title)}">
          <span class="choice-number" aria-hidden="true">${index + 1} / ${options.length}</span>
          <div class="upgrade-icon"><img src="${asset(option.icon)}" alt="${escapeHtml(option.title)}" /></div>
          <div class="upgrade-copy">
            <div class="upgrade-rarity">Vũ khí phụ · Tự động</div>
            <h3>${escapeHtml(option.title)}</h3>
            <p>${escapeHtml(option.description)}</p>
            ${this.weaponCardFacts(option.weaponId, 1)}
            <div class="starter-buff"><strong>Tăng cường đi kèm · ${escapeHtml(option.buff.name)}</strong><span>${escapeHtml(this.starterBuffEffect(option))}</span></div>
            <span class="relic-pick-label" aria-hidden="true">Chọn Di Vật</span>
          </div>
        </button>
      </article>`;
    }).join('');
    this.screenRoot.innerHTML = `
      <div class="overlay upgrade-overlay starter-overlay">
        <section class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="starter-title">
          <div class="screen-kicker">Di Vật Khe Nứt · Trang bị khởi đầu</div>
          <h1 id="starter-title">Chọn Di Vật</h1>
          <p>Chọn 1 trong 3 vũ khí phụ tự động. Mỗi Di Vật có hiệu ứng chữ ký và một tăng cường ngẫu nhiên.</p>
          <div class="upgrade-key-hint">1–3 chọn nhanh · ← → đổi thẻ · Enter xác nhận</div>
          ${this.permanentProgressionSummary()}
          <div class="upgrade-grid starter-grid">${cards}</div>
        </section>
      </div>`;
    this.screenRoot.querySelectorAll<HTMLElement>('[data-starter]').forEach((button) => {
      button.addEventListener('click', () => this.game.chooseStarterOption(button.dataset.starter ?? ''));
    });
    this.bindChoiceKeyboard('[data-starter]', 'starting-loadout');
  }

  public showPermanentRewards(choices: readonly PermanentRewardChoice[]): void {
    const cards = this.permanentRewardCards(choices);
    this.screenRoot.innerHTML = `
      <div class="overlay upgrade-overlay permanent-overlay">
        <section class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="permanent-title">
          <div class="screen-kicker">Phần thưởng bản đồ</div>
          <h1 id="permanent-title">Chọn nâng cấp vĩnh viễn</h1>
          <p>10 điểm chỉ số đã được phân bổ ngẫu nhiên. Chọn thêm một trong ba nâng cấp dưới đây.</p>
          <div class="upgrade-grid permanent-grid">${cards}</div>
        </section>
      </div>`;
    this.bindPermanentRewards();
  }

  public showSummary(stats: RunStats, unlocks: string[], permanentRewards: readonly PermanentRewardChoice[] = []): void {
    this.hideHUD();
    this.toastRoot.innerHTML = '';
    const stage = this.game.data.stages.find((item) => item.index === stats.stageIndex);
    const damageRows = Object.entries(stats.damageByWeapon)
      .filter(([, damage]) => damage > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, damage]) => {
        const weapon = this.game.data.weaponById.get(id);
        const title = weapon?.name ?? this.damageSourceTitle(id);
        const icon = weapon?.icon ?? 'assets/generated/weapons/arcane-nova-v2.png';
        const share = stats.totalDamage > 0 ? damage / stats.totalDamage * 100 : 0;
        return `<div class="damage-row"><img src="${asset(icon)}" alt="" /><div><strong>${escapeHtml(title)}</strong><small>${share.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% tổng sát thương</small></div><strong>${formatNumber(damage)}</strong></div>`;
      }).join('') || '<p style="color:var(--muted)">Chưa ghi nhận sát thương từ vũ khí.</p>';
    const victory = stats.result === 'victory';
    const needsPermanentChoice = permanentRewards.length > 0;
    const resultTitle = victory ? 'Chiến thắng' : stats.result === 'defeat' ? 'Phòng tuyến thất thủ' : 'Trận đấu kết thúc';
    this.screenRoot.innerHTML = `
      <section class="screen summary-screen" aria-labelledby="summary-result-title">
        <div class="screen-content summary-content">
          <div class="result-banner ${victory ? 'victory' : 'defeat'}">
            <span class="result-mark" aria-hidden="true">${victory ? '✓' : '×'}</span>
            <div class="result-copy">
              <div class="screen-kicker">${escapeHtml(stage?.name ?? `Bản đồ ${stats.stageIndex}`)}</div>
              <h1 id="summary-result-title">${resultTitle}</h1>
              <p>${victory ? 'Bản đồ kế tiếp đã mở.' : 'Nhận vàng, nâng cấp rồi trở lại.'}</p>
            </div>
          </div>
          <div class="summary-grid">
            <section class="panel summary-panel run-summary-panel" aria-labelledby="run-summary-title">
              <div class="summary-panel-header">
                <h2 id="run-summary-title">Tổng kết trận</h2>
                <div class="summary-damage-total"><span>Tổng sát thương</span><strong>${formatNumber(stats.totalDamage)}</strong></div>
              </div>
              <dl class="run-stat-grid" aria-label="Chỉ số trận đấu">
                <div class="run-stat"><dt>Sống sót</dt><dd>${formatTime(stats.elapsed)}</dd></div>
                <div class="run-stat summary-secondary"><dt>Đợt</dt><dd>${stats.wave}</dd></div>
                <div class="run-stat"><dt>Cấp</dt><dd>${stats.level}</dd></div>
                <div class="run-stat"><dt>Tiêu diệt</dt><dd>${formatNumber(stats.kills)}</dd></div>
                <div class="run-stat"><dt>Vàng</dt><dd>${formatNumber(stats.gold)}</dd></div>
              </dl>
              ${stats.shards > 0 ? `<div class="stat-row"><span>Mảnh Khe Nứt</span><strong>${formatNumber(stats.shards)}</strong></div>` : ''}
              ${stats.statShards > 0 ? `<div class="stat-row"><span>Mảnh chỉ số trong trận</span><strong>${formatNumber(stats.statShards)}</strong></div>` : ''}
              ${stats.skillCritShards > 0 ? `<div class="stat-row"><span>Mảnh chí mạng kỹ năng</span><strong>${formatNumber(stats.skillCritShards)}</strong></div>` : ''}
              ${unlocks.length ? `<div class="passive-box summary-unlocks"><strong>Nội dung mới mở</strong>${unlocks.map(escapeHtml).join(', ')}</div>` : ''}
              <div class="summary-seed"><span>Mã trận</span><strong>${stats.seed}</strong></div>
            </section>
            <details class="panel summary-panel damage-breakdown">
              <summary>Xem sát thương theo nguồn</summary>
              <div class="damage-list">${damageRows}</div>
            </details>
          </div>
          ${this.permanentProgressionSummary()}
          ${needsPermanentChoice ? `
            <section class="permanent-reward-block panel" aria-labelledby="permanent-reward-title">
              <div class="permanent-reward-heading">
                <div>
                  <div class="screen-kicker">Phần thưởng chiến thắng</div>
                  <h2 id="permanent-reward-title">Chọn nâng cấp vĩnh viễn</h2>
                </div>
                <p>Chọn 1 trong 3 · cộng thêm 5 điểm và lưu vĩnh viễn.</p>
              </div>
              <div class="upgrade-grid permanent-grid">${this.permanentRewardCards(permanentRewards)}</div>
            </section>` : `
            <div class="summary-actions">
              ${victory ? '<button type="button" class="btn primary" id="next-stage">Bản đồ kế tiếp</button>' : '<button type="button" class="btn primary" id="retry-stage">Chơi lại</button>'}
              <button type="button" class="btn gold" id="summary-shop">Nâng cấp</button>
              <button type="button" class="btn" id="summary-menu">Màn hình chính</button>
            </div>`}
        </div>
      </section>`;
    this.bindPermanentRewards();
    this.byId('next-stage')?.addEventListener('click', () => this.game.startNextStage());
    this.byId('retry-stage')?.addEventListener('click', () => this.game.startSelectedRun());
    this.byId('summary-shop')?.addEventListener('click', () => this.game.showShop());
    this.byId('summary-menu')?.addEventListener('click', () => this.game.showMainMenu());
  }

  /** Điểm nối cho NarrativeSystem: hiển thị phần dẫn truyện trước khi vào bản đồ. */
  public showMissionBriefing(briefing: MissionBriefing, onStart: () => void, onCodex?: () => void): void {
    this.hideHUD();
    const stage = this.game.data.stageById.get(briefing.stage.stageId);
    if (!stage) {
      onStart();
      return;
    }
    this.screenRoot.innerHTML = `
      <section class="screen story-briefing" aria-labelledby="story-title">
        <div class="story-shell">
          <div class="story-visual">
            <img src="${asset(stage.thumbnail)}" alt="${escapeHtml(stage.name)}" />
            <div class="story-act-track"><span>Hồi ${briefing.act.index}</span><strong>Bản đồ ${stage.index} / ${this.game.data.stages.length}</strong></div>
          </div>
          <div class="story-copy">
            <button type="button" class="btn ghost story-back" id="story-back">Quay lại</button>
            <div class="screen-kicker align-left">${escapeHtml(briefing.act.title)} · ${escapeHtml(briefing.act.subtitle)}</div>
            <h1 id="story-title">${escapeHtml(briefing.transmission.title)}</h1>
            <p class="story-synopsis">${escapeHtml(briefing.stage.synopsis)}</p>
            <div class="story-transmission"><strong>${escapeHtml(briefing.transmission.speaker)}</strong><span>${escapeHtml(briefing.transmission.text)}</span></div>
            <blockquote><strong>${escapeHtml(briefing.characterLine.speaker)}</strong><span>${escapeHtml(briefing.characterLine.text)}</span></blockquote>
            <section class="mission-objectives" aria-labelledby="mission-objectives-title">
              <h2 id="mission-objectives-title">Mục tiêu</h2>
              <ul>${briefing.objectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join('')}</ul>
            </section>
            <div class="story-actions"><button type="button" class="btn primary" id="story-deploy">Bắt đầu nhiệm vụ</button>${onCodex ? '<button type="button" class="btn gold ghost" id="story-codex">Mở Nhật ký</button>' : ''}</div>
          </div>
        </div>
      </section>`;
    this.byId('story-back')?.addEventListener('click', () => this.game.showStageSelect());
    this.byId('story-deploy')?.addEventListener('click', onStart);
    this.byId('story-codex')?.addEventListener('click', () => onCodex?.());
  }

  public setHUDObjective(objective: string): void {
    this.hudObjectiveOverride = objective.trim();
    if (this.hudObjectiveOverride) this.setText('hud-objective', this.hudObjectiveOverride);
  }

  /** Điểm nối cho lời thoại ngắn trong trận; không dừng hoặc che chiến trường. */
  public showTransmission(cue: NarrativeCue, portrait?: string, duration = 4200): void {
    if (this.transmissionTimer !== undefined) window.clearTimeout(this.transmissionTimer);
    this.byId('narrative-transmission')?.remove();
    const element = document.createElement('aside');
    element.id = 'narrative-transmission';
    element.className = 'narrative-transmission';
    element.setAttribute('role', 'status');
    element.innerHTML = `${portrait ? `<img src="${asset(portrait)}" alt="" />` : ''}<div><strong>${escapeHtml(cue.speaker)}</strong><span>${escapeHtml(cue.text)}</span></div>`;
    this.hudRoot.append(element);
    this.transmissionTimer = window.setTimeout(() => {
      element.classList.add('leaving');
      window.setTimeout(() => element.remove(), 220);
      this.transmissionTimer = undefined;
    }, Math.max(1800, duration));
  }

  /** Điểm nối cho Nhật ký/Codex; trạng thái khóa/mở do NarrativeSystem cung cấp. */
  public showCodex(entries: readonly CodexView[], onClose: () => void): void {
    this.hideHUD();
    const cards = entries.map(({ entry, unlocked }) => `
      <article class="codex-entry${unlocked ? '' : ' locked'}">
        <span>${unlocked ? escapeHtml(entry.category.replace('-', ' ')) : 'Chưa mở khóa'}</span>
        <h2>${unlocked ? escapeHtml(entry.title) : '???'}</h2>
        <p>${unlocked ? escapeHtml(entry.summary) : 'Hoàn thành thêm bản đồ hoặc mở Hộ Vệ để khám phá mục này.'}</p>
        ${unlocked ? `<details><summary>Đọc nội dung</summary><div>${escapeHtml(entry.body)}</div></details>` : ''}
      </article>`).join('');
    this.screenRoot.innerHTML = `
      <section class="screen codex-screen" aria-labelledby="codex-title"><div class="screen-content">
        <header class="screen-header centered"><button type="button" class="btn ghost" id="codex-close">Đóng Nhật ký</button><div><div class="screen-kicker">Kho lưu trữ Khe Nứt</div><h1 id="codex-title">Nhật ký thế giới</h1></div><div></div></header>
        <div class="codex-grid">${cards}</div>
      </div></section>`;
    this.byId('codex-close')?.addEventListener('click', onClose);
  }

  /** Điểm nối cho hồi kết sau chiến thắng bản đồ cuối. */
  public showStoryEnding(cues: readonly NarrativeCue[], onClose: () => void): void {
    this.hideHUD();
    const lead = cues[0];
    const lines = cues.map((cue) => `<li><span>${escapeHtml(cue.speaker)}</span><strong>${escapeHtml(cue.title)}</strong><p>${escapeHtml(cue.text)}</p></li>`).join('');
    this.screenRoot.innerHTML = `
      <section class="screen story-ending" aria-labelledby="ending-title">
        <img src="${asset('assets/generated/key-art.png')}" alt="" />
        <div class="ending-shell">
          <div class="screen-kicker">Hồi kết</div>
          <h1 id="ending-title">${escapeHtml(lead?.title ?? 'Tiền tuyến được tái lập')}</h1>
          <ol class="ending-lines">${lines || '<li><strong>Phòng tuyến đã yên bình</strong><p>Các Hộ Vệ tiếp tục canh giữ những Khe Nứt còn sót lại.</p></li>'}</ol>
          <button type="button" class="btn primary" id="ending-close">Xem kết quả trận</button>
        </div>
      </section>`;
    this.byId('ending-close')?.addEventListener('click', onClose);
  }

  public hideOverlay(): void {
    this.unbindUpgradeKeyboard();
    this.screenRoot.innerHTML = '';
    this.setMobileControlsActive(!this.hudRoot.classList.contains('hidden'));
  }

  public toast(message: string): void {
    const element = document.createElement('div');
    element.className = 'toast';
    element.textContent = message;
    this.toastRoot.append(element);
    window.setTimeout(() => element.remove(), 3100);
  }

  private header(kicker: string, title: string, actionId: string, actionLabel: string, action = false): string {
    return `<header class="screen-header centered">
      <button type="button" class="btn ghost back-button" id="screen-back">Quay lại</button>
      <div><div class="screen-kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1></div>
      <div class="header-actions">${action ? `<button type="button" class="btn primary" id="${actionId}">${escapeHtml(actionLabel)}</button>` : ''}</div>
    </header>`;
  }

  private bindBack(callback: () => void): void {
    this.byId('screen-back')?.addEventListener('click', callback);
  }

  private rangeSetting(label: string, description: string, key: string, value: number, min: number, max: number, step: number): string {
    const id = `setting-${key}`;
    return `<div class="setting-row"><div><label for="${id}">${escapeHtml(label)}</label><p id="${id}-description">${escapeHtml(description)}</p></div><div class="setting-control range-control"><input id="${id}" type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-describedby="${id}-description" /><output id="${id}-value" for="${id}">${Math.round(value * 100)}%</output></div></div>`;
  }

  private toggleSetting(label: string, description: string, key: string, value: boolean): string {
    return `<div class="setting-row"><div><label id="setting-${key}-label">${escapeHtml(label)}</label><p>${escapeHtml(description)}</p></div><div class="setting-control align-end"><button type="button" class="toggle ${value ? 'on' : ''}" data-toggle="${key}" role="switch" aria-checked="${value}" aria-labelledby="setting-${key}-label"><span>${value ? 'Bật' : 'Tắt'}</span></button></div></div>`;
  }

  private colorBlindSetting(value: ColorBlindMode): string {
    const options = (Object.entries(colorBlindLabels) as [ColorBlindMode, string][])
      .map(([mode, label]) => `<option value="${mode}" ${mode === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
      .join('');
    return `<div class="setting-row"><div><label for="color-blind-mode">Hỗ trợ phân biệt màu</label><p>Điều chỉnh bảng màu tín hiệu để các phe và hiệu ứng dễ nhận biết hơn.</p></div><div class="setting-control"><select id="color-blind-mode" data-color-blind aria-label="Chế độ hỗ trợ phân biệt màu">${options}</select></div></div>`;
  }

  private characterAbility(kind: string, name: string, description: string): string {
    return `<section class="ability-detail"><span>${escapeHtml(kind)}</span><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(description)}</p></div></section>`;
  }

  private skillButton(
    id: string,
    name: string,
    key: string,
    kindLabel: string,
    stateId: string,
    meterId: string,
    variant = '',
    icon = 'assets/generated/weapons/arcane-nova-v2.png',
  ): string {
    const initialState = variant === 'class-skill' ? 'Sẵn sàng'
      : variant === 'rage' ? `0/${RAGE_ACTIVATION_THRESHOLD}%`
        : variant === 'ultimate' ? `0/${ULTIMATE_ACTIVATION_THRESHOLD}%` : '0%';
    return `<button type="button" class="skill-button ${variant}" id="${id}" aria-label="${escapeHtml(kindLabel)} ${escapeHtml(name)}" aria-keyshortcuts="${escapeHtml(key)}">
      <span class="skill-key" aria-hidden="true">${escapeHtml(key)}</span>
      <span class="skill-kind">${escapeHtml(kindLabel)}</span>
      <img class="skill-icon" src="${asset(icon)}" alt="" aria-hidden="true" />
      <strong>${escapeHtml(name)}</strong>
      <span class="skill-state"><b id="${stateId}">${initialState}</b></span>
      <span class="skill-meter" aria-hidden="true"><i id="${meterId}"></i></span>
    </button>`;
  }

  private classSkill(): { name: string; description: string; icon: string } {
    const character = this.game.player.character;
    const resolved = this.classSkillFor(character);
    return { ...resolved, icon: this.game.data.weaponById.get(character.startWeapon)?.icon ?? 'assets/generated/weapons/arcane-nova-v2.png' };
  }

  private classSkillFor(character: CharacterConfig): { name: string; description: string } {
    const fallback: Record<string, { name: string; description: string }> = {
      'kael-orin': { name: 'Ấn Kiếm Hồi Sinh', description: 'Chém ấn và hút lại sinh lực từ kẻ địch.' },
      'mira-voss': { name: 'Loạn Tiễn Cuồng Phong', description: 'Bắn loạt tên bao phủ một cung rộng.' },
      'toren-vale': { name: 'Thánh Thuẫn Bất Hoại', description: 'Miễn sát thương trong khoảnh khắc quyết định.' },
      'nyra-sol': { name: 'Băng Hoại Tứ Nguyên', description: 'Làm chậm và phá vỡ đội hình trong vùng.' },
      zarek: { name: 'Trích Huyết Độc', description: 'Hút sinh lực qua độc tố đang bám mục tiêu.' },
      elara: { name: 'Bầy Vọng Âm', description: 'Gọi thêm vọng âm tự động truy đuổi mục tiêu.' },
      titan: { name: 'Trọng Chấn Phá Thành', description: 'Nện trọng lực gây choáng các mục tiêu gần.' },
      nova: { name: 'Nếp Gấp Hư Không', description: 'Bẻ cong không gian và gom kẻ địch vào tâm.' },
    };
    return character.active ?? fallback[character.id] ?? { name: 'Kỹ Năng Khe Nứt', description: 'Giải phóng năng lực riêng của Hộ Vệ.' };
  }

  private abilityIcon(kind: 'rage' | 'ultimate'): string {
    const characterId = this.game.player.character.id;
    const ultimateIcons: Record<string, string> = {
      'kael-orin': 'assets/generated/weapons/storm-call-v2.png',
      'mira-voss': 'assets/generated/weapons/echo-bow-v2.png',
      'toren-vale': 'assets/generated/weapons/gravity-bomb-v2.png',
      'nyra-sol': 'assets/generated/weapons/arcane-nova-v2.png',
      zarek: 'assets/generated/weapons/venom-bloom-v2.png',
      elara: 'assets/generated/weapons/echo-summon-v2.png',
      titan: 'assets/generated/weapons/gravity-bomb-v2.png',
      nova: 'assets/generated/weapons/void-laser-v2.png',
    };
    if (kind === 'ultimate') return ultimateIcons[characterId] ?? 'assets/generated/weapons/arcane-nova-v2.png';
    return this.game.data.weaponById.get(this.game.player.character.startWeapon)?.icon ?? 'assets/generated/weapons/rift-blade-v2.png';
  }

  private weaponSlot(entry: { config: WeaponConfig; runtime: WeaponRuntime }, primary: boolean): string {
    const evolvedName = entry.runtime.evolutionId
      ? this.game.data.evolutionById.get(entry.runtime.evolutionId)?.name ?? entry.config.name
      : entry.config.name;
    return `<div class="weapon-slot-entry${primary ? ' main-entry' : ''} element-${entry.config.element}">
      <div class="weapon-slot${primary ? ' weapon-slot-main' : ''}" role="img" aria-label="${escapeHtml(evolvedName)}, cấp ${entry.runtime.level}" title="${escapeHtml(evolvedName)}">
        <img src="${asset(entry.config.icon)}" alt="${escapeHtml(entry.config.name)}" />
        <div class="cooldown-mask" data-cooldown="${entry.config.id}"></div>
        <span class="weapon-level">${entry.runtime.evolutionId ? 'TH' : `C${entry.runtime.level}`}</span>
      </div>
      <div class="weapon-slot-copy"><strong>${escapeHtml(evolvedName)}</strong><span>${escapeHtml(this.weaponSignatureText(entry.config))}</span></div>
    </div>`;
  }

  private weaponForUpgrade(option: UpgradeOption): WeaponConfig | undefined {
    if (option.type === 'evolution') {
      const evolution = this.game.data.evolutionById.get(option.targetId);
      return evolution ? this.game.data.weaponById.get(evolution.weapon) : undefined;
    }
    if (option.type === 'weapon-new' || option.type === 'weapon-level' || option.type === 'weapon-mastery') {
      return this.game.data.weaponById.get(option.targetId);
    }
    return undefined;
  }

  private weaponCardFacts(weaponId: string, requestedLevel = 1): string {
    const weapon = this.game.data.weaponById.get(weaponId);
    if (!weapon) return '';
    const index = Math.max(0, Math.min(weapon.levels.length - 1, requestedLevel - 1));
    const level = weapon.levels[index] ?? weapon.levels[0];
    if (!level) return '';
    const tags = this.weaponSynergyTags(weapon);
    return `<div class="relic-stat-grid" aria-label="Chỉ số vũ khí">
      <span><small>Sát thương</small><strong>${formatNumber(level.damage * weaponBalanceDamageMultiplier(weapon.behavior))}</strong></span>
      <span><small>Hồi đòn</small><strong>${formatDecimal(level.cooldown, 1)} giây</strong></span>
      <span><small>Phạm vi</small><strong>${formatNumber(level.range)}</strong></span>
    </div>
    <div class="relic-signature"><small>Hiệu ứng chữ ký</small><strong>${escapeHtml(this.weaponSignatureText(weapon))}</strong></div>
    <div class="relic-synergy" aria-label="Cộng hưởng"><small>Cộng hưởng</small>${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
  }

  private generalUpgradeFacts(option: UpgradeOption): string {
    const statName = option.statBoost?.stat ? statLabels[option.statBoost.stat] ?? 'Chỉ số Hộ Vệ' : upgradeTypeLabels[option.type];
    const exactEffect = this.statBoostEffect(option);
    return `<div class="relic-signature general"><small>${exactEffect ? 'Hiệu ứng chính xác' : 'Hướng xây dựng'}</small><strong>${escapeHtml(exactEffect || `${statName} · Cộng dồn trong trận`)}</strong></div>
      <div class="relic-synergy" aria-label="Phạm vi cộng hưởng"><small>Cộng hưởng</small><span>Hộ Vệ</span><span>Đa dụng</span><span>Cộng dồn</span></div>`;
  }

  private starterBuffEffect(option: StarterOption): string {
    const buff = option.buff;
    const before = this.game.player.stats.get(buff.stat);
    const after = this.game.player.stats.preview(buff.stat, buff.value, buff.mode);
    const changes = [formatPlayerStatTransition(buff.stat, before, after)];
    if (buff.secondaryStat && buff.secondaryValue !== undefined) {
      const secondaryBefore = this.game.player.stats.get(buff.secondaryStat);
      const secondaryAfter = this.game.player.stats.preview(buff.secondaryStat, buff.secondaryValue, 'add');
      changes.push(formatPlayerStatTransition(buff.secondaryStat, secondaryBefore, secondaryAfter));
    }
    return changes.join(' · ');
  }

  private statBoostEffect(option: UpgradeOption): string {
    const boost = option.statBoost;
    if (!boost) return '';
    const rarity = option.rarity.multiplier;
    if (boost.kind === 'heal') {
      const maximum = this.game.player.stats.get('maxHp');
      const before = this.game.player.health;
      const after = Math.min(maximum, before + maximum * boost.value * rarity);
      return `Sinh lực: ${formatPlayerStatValue('maxHp', before)} → ${formatPlayerStatValue('maxHp', after)}`;
    }
    if (!boost.stat) return '';
    const mode = boost.mode ?? 'add';
    const before = this.game.player.stats.get(boost.stat);
    const after = this.game.player.stats.preview(boost.stat, boost.value * rarity, mode);
    const changes = [formatPlayerStatTransition(boost.stat, before, after)];
    if (boost.secondaryStat && boost.secondaryValue !== undefined) {
      const secondaryBefore = this.game.player.stats.get(boost.secondaryStat);
      const secondaryAfter = this.game.player.stats.preview(boost.secondaryStat, boost.secondaryValue * rarity, 'add');
      changes.push(formatPlayerStatTransition(boost.secondaryStat, secondaryBefore, secondaryAfter));
    }
    if (boost.id === 'giant-form') {
      const hpBefore = this.game.player.stats.get('maxHp');
      const hpAfter = this.game.player.stats.preview('maxHp', 0.04 * rarity, 'multiply');
      const rangeBefore = this.game.player.stats.get('range');
      const rangeAfter = this.game.player.stats.preview('range', 0.02 * rarity, 'multiply');
      changes.push(formatPlayerStatTransition('maxHp', hpBefore, hpAfter));
      changes.push(formatPlayerStatTransition('range', rangeBefore, rangeAfter));
    }
    return changes.join(' · ');
  }

  private weaponSignatureText(weapon: WeaponConfig): string {
    const byId: Record<string, string> = {
      'rift-blade': 'Chảy máu · 1,5% HP hiện tại/giây trong 3 giây',
      'echo-bow': 'Kìm chân · làm chậm 20% trong 1 giây',
      'pulse-rifle': 'Áp chế · nhịp bắn liên tục',
      'phase-darts': 'Choáng pha · 0,3 giây khi trúng',
      'gravity-bomb': 'Kéo tụ · gom mục tiêu trước khi nổ',
      'storm-call': 'Tê liệt · sét lan qua nhiều mục tiêu',
      'ember-orb': 'Thiêu đốt · sát thương chuẩn theo thời gian',
      'frost-shards': 'Băng hoại · làm chậm và có thể đóng băng',
      'void-laser': 'Choáng pha · 0,3 giây khi trúng',
      'venom-bloom': 'Độc cộng dồn · sát thương theo thời gian',
      'aegis-orbit': 'Đánh chặn · bảo vệ cự ly gần',
      'echo-summon': 'Choáng pha · vọng âm tự tìm mục tiêu',
      'arcane-nova': 'Choáng pha · 0,3 giây khi trúng',
      'toxic-smoke-bomb': 'Độc vùng · 3% HP + 90% sát thương/giây',
    };
    return byId[weapon.id] ?? weapon.description;
  }

  private weaponSynergyTags(weapon: WeaponConfig): string[] {
    const elementLabels: Record<WeaponConfig['element'], string> = {
      physical: 'Vật lý', fire: 'Lửa', ice: 'Băng', lightning: 'Sét', poison: 'Độc', arcane: 'Huyền thuật',
    };
    const roleByBehavior: Record<string, [string, string]> = {
      slash: ['Cận chiến', 'Chảy máu'], bow: ['Tầm xa', 'Kìm chân'], gun: ['Tốc đánh', 'Áp chế'],
      darts: ['Xuyên thấu', 'Choáng'], bomb: ['Diện rộng', 'Gom địch'], lightning: ['Lan chuỗi', 'Tê liệt'],
      fireball: ['Diện rộng', 'Thiêu đốt'], ice: ['Kiểm soát', 'Đóng băng'], laser: ['Xuyên tuyến', 'Choáng'],
      poison: ['Theo thời gian', 'Cộng dồn'], 'poison-bomb': ['Theo thời gian', 'Kiểm soát vùng'],
      orbit: ['Phòng thủ', 'Cận chiến'], summon: ['Triệu hồi', 'Tự động'], nova: ['Tự tìm địch', 'Choáng'],
    };
    const roles = roleByBehavior[String(weapon.behavior)] ?? ['Đa dụng', 'Tự động'];
    return [elementLabels[weapon.element], ...roles];
  }

  private applyAccessibilitySettings(): void {
    const settings = this.game.saveSystem.data.settings;
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.dataset.colorBlind = settings.colorBlindMode;
  }

  private permanentRewardCards(choices: readonly PermanentRewardChoice[]): string {
    return choices.map((choice, index) => {
      const currentPoints = this.game.saveSystem.data.permanentPoints[choice.stat] ?? 0;
      const nextPoints = currentPoints + choice.points;
      return `
      <article class="upgrade-card permanent-card" style="--rarity-color:var(--gold)">
        <button type="button" class="upgrade-select" data-permanent="${escapeHtml(choice.id)}" aria-label="Lựa chọn ${index + 1}: ${escapeHtml(choice.title)}">
          <span class="choice-number" aria-hidden="true">${index + 1}</span>
          <div class="permanent-points">+${choice.points}</div>
          <div class="upgrade-copy">
            <div class="upgrade-rarity">Nâng cấp vĩnh viễn · ${escapeHtml(this.permanentStatLabel(choice.stat))}</div>
            <h3>${escapeHtml(choice.title)}</h3>
            <p>${escapeHtml(choice.description)}</p>
            <div class="permanent-delta"><strong>${currentPoints} → ${nextPoints} điểm</strong><span>${this.permanentEffectLabel(choice.stat, currentPoints)} → ${this.permanentEffectLabel(choice.stat, nextPoints)}</span></div>
            <div class="upgrade-level">Áp dụng cho mọi Hộ Vệ từ trận kế tiếp</div>
          </div>
        </button>
      </article>`;
    }).join('');
  }

  private bindPermanentRewards(): void {
    this.screenRoot.querySelectorAll<HTMLElement>('[data-permanent]').forEach((button) => {
      button.addEventListener('click', () => this.game.claimPermanentReward(button.dataset.permanent ?? ''));
    });
  }

  private permanentStatLabel(stat: PermanentRewardChoice['stat']): string {
    const labels: Record<PermanentRewardChoice['stat'], string> = {
      attackSpeed: 'Tốc đánh',
      moveSpeed: 'Tốc độ di chuyển',
      armor: 'Giáp',
      damage: 'Sát thương',
      lifeSteal: 'Hút máu',
      luck: 'May mắn',
    };
    return labels[stat];
  }

  private permanentEffectLabel(stat: PermanentStatId, points: number): string {
    const effect = permanentPointEffect(stat, points);
    if (stat === 'armor') return `+${formatDecimal(effect.value, 1)} Giáp`;
    return `+${formatDecimal(effect.value * 100, 2)}%`;
  }

  private permanentProgressionSummary(): string {
    const points = this.game.saveSystem.data.permanentPoints;
    const stats = (Object.keys(points) as PermanentStatId[]).filter((stat) => points[stat] > 0);
    const total = stats.reduce((sum, stat) => sum + points[stat], 0);
    const chips = stats.length > 0
      ? stats.map((stat) => `<span><strong>${escapeHtml(this.permanentStatLabel(stat))}</strong><b>${points[stat]} điểm · ${this.permanentEffectLabel(stat, points[stat])}</b></span>`).join('')
      : '<span class="empty"><b>Chưa có điểm vĩnh viễn</b></span>';
    return `<div class="permanent-progress" role="status"><div><small>Đang áp dụng cho trận kế tiếp</small><strong>${total} điểm vĩnh viễn</strong></div><div class="permanent-progress-chips">${chips}</div></div>`;
  }

  private damageSourceTitle(id: string): string {
    if (id.startsWith('active-')) return 'Kỹ năng chủ động';
    if (id.startsWith('rage-')) return 'Nộ nhân vật';
    if (id.startsWith('ultimate-')) return 'Tuyệt kỹ nhân vật';
    if (id.includes('burn') || id.includes('poison') || id.includes('status')) return 'Hiệu ứng theo thời gian';
    if (id.includes('self-destruct')) return 'Tự hủy của kẻ địch';
    return 'Nguồn sát thương khác';
  }

  private hideHUD(): void {
    this.unbindUpgradeKeyboard();
    this.setMobileControlsActive(false);
    this.hudRoot.classList.add('hidden');
    this.hudRoot.innerHTML = '';
  }

  private setMobileControlsActive(active: boolean): void {
    const controls = document.querySelector<HTMLElement>('.mobile-controls');
    if (!controls) return;
    controls.classList.toggle('active', active);
    controls.setAttribute('aria-hidden', String(!active));
  }

  private bindChoiceKeyboard(selector: '[data-upgrade]' | '[data-starter]', expectedState: 'level-up' | 'starting-loadout'): void {
    this.unbindUpgradeKeyboard();
    const cards = [...this.screenRoot.querySelectorAll<HTMLButtonElement>(selector)];
    if (cards.length === 0) return;
    let selectedIndex = 0;
    const focusCard = (index: number): void => {
      selectedIndex = (index + cards.length) % cards.length;
      cards.forEach((card, cardIndex) => card.classList.toggle('keyboard-selected', cardIndex === selectedIndex));
      cards[selectedIndex]?.focus({ preventScroll: true });
    };
    this.upgradeKeyHandler = (event: KeyboardEvent): void => {
      if (this.game.state !== expectedState) return;
      const directIndex = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(event.code);
      if (directIndex >= 0) {
        const optionIndex = directIndex % 3;
        if (cards[optionIndex]) {
          event.preventDefault();
          event.stopPropagation();
          cards[optionIndex].click();
        }
        return;
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault();
        event.stopPropagation();
        focusCard(selectedIndex + 1);
        return;
      }
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        event.stopPropagation();
        focusCard(selectedIndex - 1);
        return;
      }
      if (event.code === 'Escape') {
        // Lượt nâng cấp là bắt buộc; Escape không được làm mất lựa chọn đang chờ.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.code === 'Enter') {
        if ((event.target as HTMLElement | null)?.closest('#reroll-upgrades')) return;
        event.preventDefault();
        event.stopPropagation();
        cards[selectedIndex]?.click();
      }
    };
    document.addEventListener('keydown', this.upgradeKeyHandler, true);
    queueMicrotask(() => {
      if (this.game.state === expectedState && cards[0]?.isConnected) focusCard(0);
    });
  }

  private unbindUpgradeKeyboard(): void {
    if (!this.upgradeKeyHandler) return;
    document.removeEventListener('keydown', this.upgradeKeyHandler, true);
    this.upgradeKeyHandler = null;
  }

  private byId(id: string): HTMLElement | null {
    return document.getElementById(id);
  }

  private setText(id: string, value: string): void {
    const element = this.byId(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private setWidth(id: string, ratio: number): void {
    const element = this.byId(id);
    if (element) element.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  private setProgress(barId: string, fillId: string, ratio: number): void {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    this.setWidth(fillId, safeRatio);
    this.byId(barId)?.setAttribute('aria-valuenow', String(Math.round(safeRatio * 100)));
  }

  private setSkillAccessibility(id: string, name: string, status: string, ready: boolean): void {
    const button = this.byId(id);
    if (!button) return;
    button.setAttribute('aria-label', `${name} — ${status}`);
    button.setAttribute('aria-disabled', String(!ready));
  }
}
