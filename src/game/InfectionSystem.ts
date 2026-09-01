import { GAME_CONFIG } from './config';
import type { Character } from './Character';

interface PendingInfection {
  target: Character;
  attacker: Character;
  remaining: number;
}

interface InfectionCallbacks {
  onStarted: (target: Character, attacker: Character) => void;
  onCompleted: (target: Character, attacker: Character) => void;
}

export class InfectionSystem {
  private readonly pending = new Map<string, PendingInfection>();

  constructor(private readonly callbacks: InfectionCallbacks) {}

  begin(target: Character, attacker: Character): boolean {
    if (this.pending.has(target.id)) return false;
    target.health = 0;
    target.armor = 0;
    target.stunRemaining = GAME_CONFIG.infectionStunSeconds;
    target.invulnerableTimer = GAME_CONFIG.infectionStunSeconds + 0.2;
    target.velocity.set(0, 0, 0);
    target.stateLabel = '感染转化';
    this.pending.set(target.id, {
      target,
      attacker,
      remaining: GAME_CONFIG.infectionStunSeconds,
    });
    this.callbacks.onStarted(target, attacker);
    return true;
  }

  update(delta: number): void {
    for (const [id, infection] of this.pending) {
      infection.remaining -= delta;
      if (infection.remaining > 0) continue;
      this.pending.delete(id);
      this.callbacks.onCompleted(infection.target, infection.attacker);
    }
  }

  isPending(character: Character): boolean {
    return this.pending.has(character.id);
  }

  get count(): number {
    return this.pending.size;
  }

  clear(): void {
    for (const infection of this.pending.values()) infection.target.stunRemaining = 0;
    this.pending.clear();
  }
}
