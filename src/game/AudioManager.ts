export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.65;
  private readonly scheduled = new Set<number>();
  private readonly activeSources = new Set<AudioScheduledSourceNode>();

  setVolume(value: number): void {
    this.volume = value;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
    }
  }

  async resume(): Promise<void> {
    this.ensureContext();
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  stopAll(): void {
    this.scheduled.forEach((timer) => window.clearTimeout(timer));
    this.scheduled.clear();
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended between frames.
      }
      source.disconnect();
    });
    this.activeSources.clear();
  }

  shoot(type: 'rifle' | 'pistol' | 'hmg'): void {
    const frequency = type === 'pistol' ? 145 : type === 'hmg' ? 72 : 95;
    const duration = type === 'hmg' ? 0.085 : 0.07;
    this.noise(duration, type === 'pistol' ? 0.17 : 0.24, frequency);
    this.tone(frequency * 1.5, duration * 0.7, 'square', 0.045, -55);
  }

  meleeSwing(): void {
    this.noise(0.11, 0.12, 420);
    this.tone(170, 0.09, 'sawtooth', 0.04, -80);
  }

  meleeMiss(): void {
    this.noise(0.09, 0.075, 620);
    this.tone(230, 0.07, 'triangle', 0.025, -110);
  }

  meleeHit(): void {
    this.noise(0.12, 0.15, 240);
    this.tone(105, 0.12, 'square', 0.055, -45);
  }

  hit(headshot = false): void {
    this.tone(headshot ? 1150 : 780, 0.055, 'sine', 0.075, headshot ? 180 : -140);
  }

  reload(): void {
    this.tone(420, 0.06, 'square', 0.035, 120);
    this.schedule(() => this.tone(610, 0.07, 'square', 0.03, -80), 210);
  }

  infect(): void {
    this.tone(125, 0.48, 'sawtooth', 0.12, -70);
    this.tone(420, 0.34, 'sine', 0.05, 520);
  }

  infectionAlert(): void {
    this.tone(240, 0.22, 'sawtooth', 0.1, -80);
    this.schedule(() => this.tone(180, 0.34, 'square', 0.085, 210), 170);
  }

  playerInfected(): void {
    this.tone(95, 0.52, 'sawtooth', 0.14, 260);
    this.schedule(() => this.tone(520, 0.24, 'triangle', 0.075, -240), 110);
  }

  countdown(urgent = false): void {
    this.tone(urgent ? 880 : 540, urgent ? 0.14 : 0.09, 'sine', urgent ? 0.09 : 0.05, 30);
  }

  announce(victory: boolean): void {
    const notes = victory ? [440, 554, 659] : [330, 277, 220];
    notes.forEach((note, index) => this.schedule(() => this.tone(note, 0.28, 'triangle', 0.08, 0), index * 170));
  }

  bombPlant(): void {
    this.tone(420, 0.12, 'square', 0.07, 180);
    this.schedule(() => this.tone(680, 0.16, 'triangle', 0.075, 120), 120);
  }

  bombBeep(urgent = false): void {
    this.tone(urgent ? 1120 : 720, urgent ? 0.1 : 0.075, 'sine', urgent ? 0.085 : 0.055, 35);
  }

  bombDefuse(): void {
    [620, 520, 760].forEach((note, index) => this.schedule(() => this.tone(note, 0.13, 'triangle', 0.065, -60), index * 110));
  }

  bombExplosion(): void {
    this.noise(0.75, 0.32, 120);
    this.tone(74, 0.82, 'sawtooth', 0.16, -35);
  }

  private ensureContext(): void {
    if (this.context) return;
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gainValue: number, sweep: number): void {
    this.ensureContext();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.track(this.context.createOscillator());
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private noise(duration: number, gainValue: number, lowpass: number): void {
    this.ensureContext();
    if (!this.context || !this.master) return;
    const sampleCount = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.track(this.context.createBufferSource());
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(this.context.currentTime + duration);
  }

  private schedule(callback: () => void, delay: number): void {
    const timer = window.setTimeout(() => {
      this.scheduled.delete(timer);
      callback();
    }, delay);
    this.scheduled.add(timer);
  }

  private track<T extends AudioScheduledSourceNode>(source: T): T {
    this.activeSources.add(source);
    source.addEventListener('ended', () => this.activeSources.delete(source), { once: true });
    return source;
  }
}
