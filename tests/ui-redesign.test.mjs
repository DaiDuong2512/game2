import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [ui, css, html] = await Promise.all([
  readFile(new URL('../src/ui/UIManager.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
]);

test('HUD exposes readable progress, objective and exactly three combat abilities', () => {
  assert.match(ui, /role="progressbar"[^>]+aria-label="Sinh lực"/u);
  assert.match(ui, /id="hud-objective"/u);
  assert.match(ui, /skillButton\('active-skill',[\s\S]*?'Q', 'Kỹ năng lớp'/u);
  assert.match(ui, /skillButton\('rage-skill',[\s\S]*?'E', 'Nộ'/u);
  assert.match(ui, /skillButton\('ultimate-skill',[\s\S]*?'R', 'Tuyệt kỹ'/u);
  assert.equal((ui.match(/\$\{this\.skillButton\('/gu) ?? []).length, 3, 'combat HUD must expose exactly Q/E/R as large abilities');
  assert.match(ui, /aria-keyshortcuts="\$\{escapeHtml\(key\)\}"/u);
  assert.match(ui, /class="dash-resource" id="dash-skill"/u);
  assert.doesNotMatch(ui, /skillButton\('dash-skill'/u, 'Dash is a small movement resource, not a fourth ability');
  assert.match(ui, /setHUDObjective\(objective: string\)/u);
});

test('gameplay hides the pointer and exposes the boss blessing clearly', () => {
  assert.match(css, /body\.gameplay-active, body\.gameplay-active \*\s*\{\s*cursor:\s*none !important;/u);
  assert.match(ui, /id="boss-blessing" role="status"/u);
  assert.match(ui, /Hút máu 15% · Tốc đánh \+30% · Khiên Ấn 100% HP/u);
});

test('character selection separates passive traits from the Q/E/R ability kit', () => {
  assert.match(ui, /class="class-trait"><small>Đặc tính lớp/u);
  assert.match(ui, /aria-label="Ba kỹ năng nhân vật"/u);
  assert.match(ui, /<small>Kỹ năng · Q<\/small>/u);
  assert.match(ui, /characterAbility\('Kỹ năng lớp · Q'/u);
  assert.match(ui, /characterAbility\('Nộ · E'/u);
  assert.match(ui, /characterAbility\('Tuyệt kỹ · R'/u);
  assert.doesNotMatch(ui, /characterAbility\('Nội tại'/u);
});

test('character selection keeps an environmental backdrop and shows shared permanent stats', () => {
  assert.match(ui, /class="screen character-select-screen" style="--selection-backdrop:/u);
  assert.match(css, /\.character-art::before\s*\{[^}]*background-image:\s*var\(--selection-backdrop\)/su);
  assert.match(css, /\.summary-portrait::before\s*\{[^}]*background-image:\s*var\(--selection-backdrop\)/su);
  assert.match(ui, /character\.gameplaySprite \?\? character\.portrait/u);
  assert.match(ui, /selected\.gameplaySprite \?\? selected\.portrait/u);
  assert.match(css, /\.character-sprite-preview\s*\{[^}]*background-size:\s*400% 800%[^}]*image-rendering:\s*pixelated/su);
  assert.match(ui, /Mọi Hộ Vệ đều nhận toàn bộ nâng cấp vĩnh viễn/u);
  assert.match(ui, /new Player\(character, this\.game\.data\.metaUpgrades, this\.game\.saveSystem\.data\)/u);
  assert.match(ui, /stats\?\.get\('maxHp'\)/u);
  assert.match(ui, /selectedStats\?\.get\('damage'\)/u);
  assert.match(ui, /<small>Tốc đánh<\/small>/u);
  assert.match(ui, /<span>Giảm hồi chiêu<\/span>/u);
});

test('selection screens stay compact and stage deployment has one desktop action', () => {
  assert.match(css, /@media \(min-width: 1181px\) and \(min-height: 760px\)[\s\S]*?\.character-select-screen\s*\{[^}]*overflow:\s*hidden;/u);
  assert.match(css, /\.character-select-screen \.character-grid\s*\{[^}]*grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(ui, /class="screen stage-select-screen"/u);
  assert.doesNotMatch(ui, /id="deploy-run"/u);
  assert.match(ui, /id="deploy-run-side"/u);
  assert.match(ui, /id="deploy-run-mobile"/u);
});

test('mission briefing uses a bounded readable split layout', () => {
  assert.match(css, /\.story-shell\s*\{[^}]*height:\s*calc\(100vh - 28px\)[^}]*grid-template-columns:\s*minmax\(0, \.86fr\) minmax\(520px, 1\.14fr\)/su);
  assert.match(css, /\.story-copy\s*\{[^}]*overflow:\s*auto;[^}]*background:\s*linear-gradient/su);
  assert.match(css, /\.story-copy \.story-back\s*\{[^}]*position:\s*absolute;[^}]*width:\s*124px;/su);
});

test('weapon deck clearly separates one primary and at most three automatic auxiliary slots', () => {
  assert.match(ui, /slot === 'primary'/u);
  assert.match(ui, /auxiliaries = [^;]+\.slice\(0, 3\)/u);
  assert.match(ui, /\[0, 1, 2\]\.map/u);
  assert.match(ui, />Vũ khí chính</u);
  assert.match(ui, />Vũ khí phụ · Tự động</u);
  assert.match(ui, /weaponSignatureText/u);
});

test('Rift Relic choice cards expose stat, signature and synergy anatomy', () => {
  assert.match(ui, />Chọn Di Vật</u);
  assert.match(ui, /class="relic-stat-grid"/u);
  assert.match(ui, />Hiệu ứng chữ ký</u);
  assert.match(ui, /class="relic-synergy"/u);
  assert.match(ui, /toxic-smoke-bomb/u);
  assert.match(ui, /3% HP \+ 90% sát thương\/giây/u);
  assert.match(ui, /scheduledLevel = this\.game\.upgrades\.scheduledChoiceLevel\(\)/u);
  assert.match(ui, /scheduledLevel > 1 && scheduledLevel % 5 === 0/u);
  assert.match(ui, /Rương chiến lợi phẩm/u);
  assert.match(ui, /Cường hóa vũ khí/u);
  assert.match(ui, /Cường hóa Hộ Vệ/u);
});

test('narrative UI contract supports briefing, transmissions, codex and ending', () => {
  assert.match(ui, /showMissionBriefing\(briefing: MissionBriefing/u);
  assert.match(ui, /briefing\.transmission\.text/u);
  assert.match(ui, /showTransmission\(cue: NarrativeCue/u);
  assert.match(ui, /showCodex\(entries: readonly CodexView\[\]/u);
  assert.match(ui, /showStoryEnding\(cues: readonly NarrativeCue\[\]/u);
  assert.match(ui, />Nhật ký</u);
});

test('settings and selection surfaces retain keyboard and assistive technology support', () => {
  assert.match(ui, /role="switch" aria-checked=/u);
  assert.match(ui, /event\.key !== 'Enter' && event\.key !== ' '/u);
  assert.match(ui, /aria-pressed="\$\{character\.id === selected\.id\}"/u);
  assert.match(html, /<main id="screen-root"/u);
  assert.doesNotMatch(html, /id="hud-root"[^>]+aria-live=/u, 'rapidly changing HUD must not spam live regions');
});

test('responsive UI keeps mobile launch actions and touch abilities visible', () => {
  assert.match(css, /\.mobile-primary-action\s*\{[^}]*display:\s*none;/su);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.mobile-primary-action\s*\{[^}]*display:\s*block;/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.hud-bottom-right\s*\{[^}]*grid-template-columns:\s*repeat\(3, 64px\)/u);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.hud-bottom-left\s*\{[^}]*display:\s*block;/u);
  assert.match(css, /\.mobile-controls\.active\s*\{[^}]*display:\s*block;/su);
  assert.match(ui, /setMobileControlsActive\(false\)/u);
  assert.match(ui, /setMobileControlsActive\(!this\.hudRoot\.classList\.contains\('hidden'\)\)/u);
});

test('Rift Relic visual system uses obsidian, steel, cyan and amber; toxic green is scoped to poison', () => {
  assert.match(html, /data-ui-theme="rift-relic"/u);
  assert.match(css, /--bg:\s*#050b12;/u);
  assert.match(css, /--panel-solid:\s*#0a1822;/u);
  assert.match(css, /--steel-dark:\s*#263642;/u);
  assert.match(css, /--steel:\s*#5f7180;/u);
  assert.match(css, /--accent:\s*#2fe6f3;/u);
  assert.match(css, /--gold:\s*#f5b842;/u);
  assert.match(css, /--toxic:\s*#7de52a;/u);
  assert.match(css, /\.element-poison\s*\{[^}]*--card-signal:\s*var\(--toxic\)/su);
  assert.match(css, /clip-path:\s*polygon/u);
  assert.match(css, /@keyframes relic-energy-sweep/u);
  assert.doesNotMatch(css, /data-color-blind[^\n]+#game-canvas/u);
  assert.doesNotMatch(css, /#c594ff|#d98cff|#c084fc|#7ee787/iu);
});
