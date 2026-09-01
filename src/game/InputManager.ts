export class InputManager {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseButtons = new Set<number>();
  private mousePressed = new Set<number>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private enabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
      if (['Space', 'Digit1', 'Digit2', 'Digit3', 'KeyR', 'KeyE', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas || !this.enabled) return;
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    });
    window.addEventListener('mousedown', (event) => {
      if (document.pointerLockElement !== this.canvas || !this.enabled) return;
      if (!this.mouseButtons.has(event.button)) this.mousePressed.add(event.button);
      this.mouseButtons.add(event.button);
    });
    window.addEventListener('mouseup', (event) => this.mouseButtons.delete(event.button));
    window.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.clearState();
  }

  clearState(): void {
    this.keys.clear();
    this.pressed.clear();
    this.mouseButtons.clear();
    this.mousePressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  isDown(code: string): boolean { return this.enabled && this.keys.has(code); }

  consumePress(code: string): boolean {
    if (!this.enabled || !this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  isMouseDown(button = 0): boolean { return this.enabled && this.mouseButtons.has(button); }

  consumeMousePress(button = 0): boolean {
    if (!this.enabled || !this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
    return true;
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  private reset(): void { this.clearState(); }
}
