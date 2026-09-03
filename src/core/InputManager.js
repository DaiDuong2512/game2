import { clamp, normalize } from './MathUtils.js';
function clampToUnitCircle(x, y) {
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 1)
        return { x, y };
    return { x: x / magnitude, y: y / magnitude };
}
function applyRadialDeadzone(x, y, deadzone) {
    const magnitude = Math.min(1, Math.hypot(x, y));
    if (magnitude <= deadzone)
        return { x: 0, y: 0 };
    const remappedMagnitude = (magnitude - deadzone) / (1 - deadzone);
    const inverseMagnitude = 1 / Math.max(0.00001, Math.hypot(x, y));
    return {
        x: x * inverseMagnitude * remappedMagnitude,
        y: y * inverseMagnitude * remappedMagnitude,
    };
}
export class InputManager {
    keysDown = new Set();
    keysPressed = new Set();
    pointer = { x: 0, y: 0, down: false };
    pointerAimActive = false;
    gamepadMove = { x: 0, y: 0 };
    gamepadAim = { x: 0, y: 0 };
    gamepadButtons = new Set();
    previousGamepadButtons = new Set();
    canvas;
    mobileMove = { x: 0, y: 0 };
    constructor(canvas) {
        this.canvas = canvas;
        window.addEventListener('keydown', (event) => {
            const key = event.code;
            if (!this.keysDown.has(key))
                this.keysPressed.add(key);
            this.keysDown.add(key);
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(key))
                event.preventDefault();
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
    updatePointer(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Renderer và GameManager làm việc trong hệ tọa độ CSS pixel. Giữ chuột
        // trong cùng hệ tọa độ để điểm ngắm không lệch trên màn hình DPR cao.
        this.pointer.x = event.clientX - rect.left;
        this.pointer.y = event.clientY - rect.top;
        this.pointerAimActive = true;
    }
    pollGamepad() {
        const pad = navigator.getGamepads?.()[0];
        this.previousGamepadButtons = this.gamepadButtons;
        this.gamepadButtons = new Set();
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
            if (button.pressed)
                this.gamepadButtons.add(index);
        });
    }
    endFrame() {
        this.keysPressed.clear();
    }
    getMoveVector() {
        const keyboardX = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
        const keyboardY = (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0) - (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0);
        const keyboard = normalize(keyboardX, keyboardY);
        const x = clamp(keyboard.x + this.gamepadMove.x + this.mobileMove.x, -1, 1);
        const y = clamp(keyboard.y + this.gamepadMove.y + this.mobileMove.y, -1, 1);
        return clampToUnitCircle(x, y);
    }
    getAimVector(playerScreenX, playerScreenY) {
        if (Math.hypot(this.gamepadAim.x, this.gamepadAim.y) > 0.1)
            return normalize(this.gamepadAim.x, this.gamepadAim.y);
        if (!this.pointerAimActive)
            return { x: 0, y: 0 };
        return normalize(this.pointer.x - playerScreenX, this.pointer.y - playerScreenY);
    }
    setMobileMove(x, y) {
        this.mobileMove = clampToUnitCircle(x, y);
    }
    pressVirtual(code) {
        this.keysPressed.add(code);
    }
    isDown(code) {
        return this.keysDown.has(code);
    }
    wasPressed(code) {
        return this.keysPressed.has(code);
    }
    gamepadPressed(index) {
        return this.gamepadButtons.has(index) && !this.previousGamepadButtons.has(index);
    }
    getPointer() {
        return this.pointer;
    }
}
//# sourceMappingURL=InputManager.js.map