import { smoothLerp } from '../core/MathUtils.js';
import type { RNG } from '../core/RNG.js';

export class Camera {
  public x = 0;
  public y = 0;
  public width = 1280;
  public height = 720;
  public shakeX = 0;
  public shakeY = 0;
  private shakeStrength = 0;
  private shakePhase: number;
  private lookAheadX = 0;
  private lookAheadY = 0;
  private kickX = 0;
  private kickY = 0;

  public constructor(rng: RNG) {
    this.shakePhase = rng.float(0, Math.PI * 2);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  public snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.kickX = 0;
    this.kickY = 0;
    this.shakeStrength = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  public addShake(amount: number): void {
    this.shakeStrength = Math.min(18, this.shakeStrength + amount);
  }

  public addKick(x: number, y: number): void {
    this.kickX += x;
    this.kickY += y;
    const magnitude = Math.hypot(this.kickX, this.kickY);
    if (magnitude > 16) {
      this.kickX = this.kickX / magnitude * 16;
      this.kickY = this.kickY / magnitude * 16;
    }
  }

  public update(
    dt: number,
    targetX: number,
    targetY: number,
    shakeScale: number,
    velocityX = 0,
    velocityY = 0,
    aimX = 0,
    aimY = 0,
  ): void {
    const speed = Math.hypot(velocityX, velocityY);
    const viewportScale = Math.max(0.65, Math.min(1.15, Math.min(this.width, this.height) / 720));
    let desiredLookX = velocityX * 0.105 + aimX * 18 * viewportScale;
    let desiredLookY = velocityY * 0.105 + aimY * 18 * viewportScale;
    const desiredMagnitude = Math.hypot(desiredLookX, desiredLookY);
    const maxLookAhead = Math.min(88, Math.min(this.width, this.height) * 0.12);
    if (desiredMagnitude > maxLookAhead) {
      desiredLookX = desiredLookX / desiredMagnitude * maxLookAhead;
      desiredLookY = desiredLookY / desiredMagnitude * maxLookAhead;
    }
    const lookResponse = speed > 25 ? 7.2 : 10.5;
    this.lookAheadX = smoothLerp(this.lookAheadX, desiredLookX, lookResponse, dt);
    this.lookAheadY = smoothLerp(this.lookAheadY, desiredLookY, lookResponse, dt);

    const kickDecay = Math.exp(-13 * dt);
    this.kickX *= kickDecay;
    this.kickY *= kickDecay;
    const feedbackScale = Math.max(0, shakeScale);
    const followTargetX = targetX + this.lookAheadX + this.kickX * feedbackScale;
    const followTargetY = targetY + this.lookAheadY + this.kickY * feedbackScale;
    const followResponse = speed > 560 ? 13.5 : speed > 35 ? 10.2 : 8.2;
    this.x = smoothLerp(this.x, followTargetX, followResponse, dt);
    this.y = smoothLerp(this.y, followTargetY, followResponse, dt);

    this.shakeStrength *= Math.exp(-9 * dt);
    this.shakePhase += dt * 34;
    const strength = this.shakeStrength * feedbackScale * viewportScale;
    if (strength < 0.01) {
      this.shakeX = 0;
      this.shakeY = 0;
    } else {
      // Hai sóng lệch pha tạo rung rõ nhưng liên tục, tránh jitter ngẫu nhiên
      // từng khung hình làm sprite pixel bị nhòe mắt.
      this.shakeX = Math.sin(this.shakePhase * 1.37) * strength;
      this.shakeY = Math.cos(this.shakePhase * 1.11) * strength * 0.72;
    }
  }

  public worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: x - this.x + this.width * 0.5 + this.shakeX,
      y: y - this.y + this.height * 0.5 + this.shakeY,
    };
  }

  public isVisible(x: number, y: number, margin = 80): boolean {
    const screen = this.worldToScreen(x, y);
    return screen.x >= -margin && screen.x <= this.width + margin && screen.y >= -margin && screen.y <= this.height + margin;
  }
}
