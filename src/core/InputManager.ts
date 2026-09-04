import { clamp, normalize } from './MathUtils.js';
import type { Vec2 } from './Types.js';

function clampToUnitCircle(x: number, y: number): Vec2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1) return { x, y };
  return { x: x / magnitude, y: y / magnitude };
}

function applyRadialDeadzone(x: number, y: number, deadzone: number): Vec2 {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const remappedMagnitude = (magnitude - deadzone) / (1 - deadzone);
  const inverseMagnitude = 1 / Math.max(0.00001, Math.hypot(x, y));
  return {
    x: x * inverseMagnitude * remappedMagnitude,
    y: y * inverseMagnitude * remappedMagnitude,
  };
}

export class InputManager {
  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly pointer = { x: 0, y: 0, down: false };
  private pointerAimActive = false;
  private gamepadMove: Vec2 = { x: 0, y: 0 };
  private gamepadAim: Vec2 = { x: 0, y: 0 };
  private gamepadButtons = new Set<number>();
  private previousGamepadButtons = new Set<number>();
  private readonly canvas: HTMLCanvasElement;
  private mobileMove: Vec2 = { x: 0, y: 0 };

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (event) => {
      const key = event.code;
      if (!this.keysDown.has(key)) this.keysPressed.add(key);
      this.keysDown.add(key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(key)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.code));
    canvas.addEventListener('pointermove', (event) => this.updatePointer(event));
    canvas.addEventListener('pointerdown', (event) => {
      this.updatePointer(event);
      this.pointer.down = true;
    });
    window.addEventListener('pointerup', () => { this.pointer.down = false; });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.keysPressed.clear();
      this.pointer.down = false;
    });
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    // Renderer và GameManager làm việc trong hệ tọa độ CSS pixel. Giữ chuột
    // trong cùng hệ tọa độ để điểm ngắm không lệch trên màn hình DPR cao.
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
    this.pointerAimActive = true;
  }

  public pollGamepad(): void {
    const pad = navigator.getGamepads?.()[0];
    this.previousGamepadButtons = this.gamepadButtons;
    this.gamepadButtons = new Set<number>();
    if (!pad) {
      this.gamepadMove = { x: 0, y: 0 };
      this.gamepadAim = { x: 0, y: 0 };
      return;
    }
    // Giữ lại độ lớn analog thay vì biến mọi góc nghiêng thành tốc độ tối đa.
    // Radial deadzone cũng tránh việc hai trục có deadzone khác nhau làm lệch hướng.
    this.gamepadMove = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.18);
    this.gamepadAim = applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.2);
    pad.buttons.forEach((button, index) => {
      if (button.pressed) this.gamepadButtons.add(index);
    });
  }

  public endFrame(): void {
    this.keysPressed.clear();
  }

  public getMoveVector(): Vec2 {
    const keyboardX = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const keyboardY = (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0) - (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0);
    const keyboard = normalize(keyboardX, keyboardY);
    const x = clamp(keyboard.x + this.gamepadMove.x + this.mobileMove.x, -1, 1);
    const y = clamp(keyboard.y + this.gamepadMove.y + this.mobileMove.y, -1, 1);
    return clampToUnitCircle(x, y);
  }

  public getAimVector(playerScreenX: number, playerScreenY: number): Vec2 {
    if (Math.hypot(this.gamepadAim.x, this.gamepadAim.y) > 0.1) return normalize(this.gamepadAim.x, this.gamepadAim.y);
    if (!this.pointerAimActive) return { x: 0, y: 0 };
    return normalize(this.pointer.x - playerScreenX, this.pointer.y - playerScreenY);
  }

  public setMobileMove(x: number, y: number): void {
    this.mobileMove = clampToUnitCircle(x, y);
  }

  public pressVirtual(code: 'Space' | 'KeyQ' | 'KeyE' | 'KeyR'): void {
    this.keysPressed.add(code);
  }

  public isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  public gamepadPressed(index: number): boolean {
    return this.gamepadButtons.has(index) && !this.previousGamepadButtons.has(index);
  }

  public getPointer(): Readonly<{ x: number; y: number; down: boolean }> {
    return this.pointer;
  }
}
