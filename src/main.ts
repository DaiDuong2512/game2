import { AssetManager } from './core/AssetManager.js';
import { SaveSystem } from './core/SaveSystem.js';
import { loadGameData } from './data/DataStore.js';
import { GameManager } from './game/GameManager.js';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Không tìm thấy thành phần bắt buộc #${id}.`);
  return element as T;
}

function installMobileControls(game: GameManager): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const controls = document.createElement('div');
  controls.className = 'mobile-controls';
  controls.setAttribute('aria-hidden', 'true');
  controls.innerHTML = '<div class="mobile-stick" id="mobile-stick"><div class="mobile-stick-knob" id="mobile-knob"></div></div>';
  document.getElementById('app')?.append(controls);
  const stick = document.getElementById('mobile-stick');
  const knob = document.getElementById('mobile-knob');
  if (!stick || !knob) return;
  stick.setAttribute('role', 'application');
  stick.setAttribute('aria-label', 'Cần di chuyển ảo');
  let pointerId: number | null = null;
  const update = (event: PointerEvent): void => {
    const rect = stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let x = event.clientX - centerX;
    let y = event.clientY - centerY;
    const max = rect.width * 0.34;
    const length = Math.hypot(x, y);
    if (length > max) { x = x / length * max; y = y / length * max; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    game.input.setMobileMove(x / max, y / max);
  };
  stick.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    stick.setPointerCapture(pointerId);
    update(event);
  });
  stick.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  const release = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    knob.style.transform = 'translate(0, 0)';
    game.input.setMobileMove(0, 0);
  };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);
}

async function bootstrap(): Promise<void> {
  const canvas = requiredElement<HTMLCanvasElement>('game-canvas');
  const screenRoot = requiredElement<HTMLElement>('screen-root');
  const hudRoot = requiredElement<HTMLElement>('hud-root');
  const toastRoot = requiredElement<HTMLElement>('toast-root');
  const loading = requiredElement<HTMLElement>('loading');

  try {
    const data = await loadGameData();
    const assets = new AssetManager();
    const paths = [
      'assets/generated/key-art.png',
      'assets/generated/characters/rift-warden-walk-8dir.png',
      'assets/generated/effects/pixel-vfx-atlas.png',
      'assets/generated/effects/status-impact-vfx-v3.png',
      'assets/generated/effects/toxic-smoke-vfx-v4.png',
      'assets/generated/effects/projectile-atlas-v2.png',
    'assets/generated/effects/guardian-passive-atlas-v1.png',
    'assets/generated/bosses-v2/boss-character-atlas-v2.png',
    'assets/generated/bosses-v2/boss-ability-atlas-v1.png',
    'assets/generated/bosses-v3/void-devourer-v3.png',
    'assets/generated/bosses-v3/void-devourer-ability-v2.png',
    'assets/generated/terrain-v1/terrain-props-atlas-v1.png',
    'assets/generated/terrain-v1/terrain-grass-atlas-v1.png',
      ...data.characters.map((item) => item.portrait),
      ...data.characters.map((item) => item.gameplaySprite ?? ''),
      ...data.weapons.map((item) => item.icon),
      ...data.enemies.map((item) => item.sprite),
      ...data.stages.map((item) => item.thumbnail),
      ...data.passives.map((item) => item.icon),
    ];
    await assets.preload(paths.filter((path) => path.length > 0).map((path) => `./${path}`));
    const save = new SaveSystem();
    const game = new GameManager(data, save, assets, canvas, screenRoot, hudRoot, toastRoot);
    installMobileControls(game);
    (window as Window & { __RIFTWARDEN__?: GameManager }).__RIFTWARDEN__ = game;
    loading.classList.add('done');
    window.setTimeout(() => loading.remove(), 500);
    game.start();
  } catch (error) {
    console.error(error);
    loading.innerHTML = '<div class="panel" style="padding:26px; max-width:680px"><h1>Không thể khởi động trò chơi</h1><p style="color:var(--muted)">Dữ liệu hoặc tài nguyên trò chơi chưa tải được. Chi tiết kỹ thuật đã được ghi trong bảng điều khiển của trình duyệt.</p><p>Hãy chạy dự án bằng lệnh <code>npm run dev</code>; trình duyệt chặn tải dữ liệu khi mở trực tiếp bằng <code>file://</code>.</p></div>';
  }
}

void bootstrap();
