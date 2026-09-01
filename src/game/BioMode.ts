import * as THREE from 'three';
import { AIController } from './AIController';
import { AudioManager } from './AudioManager';
import { Character } from './Character';
import { AI_NAMES, GAME_CONFIG } from './config';
import { CollisionWorld } from './CollisionWorld';
import { InfectionSystem } from './InfectionSystem';
import { MapBuilder } from './MapBuilder';
import { SpawnManager } from './SpawnManager';
import { CharacterRole, GamePhase, Team, type DamageResult, type OperatorId } from './types';
import { UIManager } from '../ui/UIManager';

interface BioModeCallbacks {
  onPlayerRoleChanged: () => void;
  onPlayerDamaged: (source: THREE.Vector3, damage: number) => void;
  onPlayerRespawnState: (respawning: boolean) => void;
  onRoundEnded: (humansWon: boolean) => void;
}

interface ParticleBurst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

export class BioMode {
  readonly characters: Character[] = [];
  readonly aiControllers: AIController[] = [];
  phase = GamePhase.Menu;
  countdownRemaining: number = GAME_CONFIG.countdownSeconds;
  roundRemaining: number = GAME_CONFIG.roundSeconds;
  playerSurvivalSeconds = 0;
  private phaseBeforePause = GamePhase.Active;
  private lastCountdownTick = GAME_CONFIG.countdownSeconds + 1;
  private bursts: ParticleBurst[] = [];
  private selectedOperator: OperatorId = 'Rook';
  private queuedPlayerRole: 'human' | 'mother' | null = null;
  private roundPlayerRole: 'human' | 'mother' | null = null;
  private readonly infectionSystem: InfectionSystem;
  private readonly spawnManager: SpawnManager;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly map: MapBuilder,
    private readonly collision: CollisionWorld,
    private readonly audio: AudioManager,
    private readonly ui: UIManager,
    private readonly callbacks: BioModeCallbacks,
  ) {
    this.spawnManager = new SpawnManager(map, collision);
    this.infectionSystem = new InfectionSystem({
      onStarted: (target, attacker) => this.onInfectionStarted(target, attacker),
      onCompleted: (target, attacker) => this.convertToInfected(target, false, attacker),
    });
  }

  get player(): Character {
    const player = this.characters[0];
    if (!player) throw new Error('Bio mode has not been initialized');
    return player;
  }

  get humanCount(): number { return this.characters.filter((character) => character.team === Team.Human).length; }
  get infectedCount(): number { return this.characters.filter((character) => character.team === Team.Infected).length; }
  get pendingInfectionCount(): number { return this.infectionSystem.count; }

  initialize(operator: OperatorId): void {
    this.disposeCharacters();
    this.selectedOperator = operator;
    const operators: OperatorId[] = ['Rook', 'Kite', 'Iris', 'Vela'];
    const player = new Character('player', '玩家', true, operator, this.scene);
    this.characters.push(player);
    for (let i = 0; i < GAME_CONFIG.aiCount; i += 1) {
      const character = new Character(`ai-${i + 1}`, AI_NAMES[i], false, operators[(i + 1) % operators.length], this.scene);
      this.characters.push(character);
      this.aiControllers.push(new AIController(character, this.scene, this.map, this.collision, this.audio, {
        getCharacters: () => this.characters,
        getPlayer: () => this.player,
        applyDamage: (attacker, target, damage, headshot) => this.applyDamage(attacker, target, damage, headshot),
      }));
    }
  }

  startRound(): void {
    if (!this.characters.length) this.initialize(this.selectedOperator);
    this.clearBursts();
    this.infectionSystem.clear();
    this.roundPlayerRole = this.queuedPlayerRole;
    this.queuedPlayerRole = null;
    this.countdownRemaining = GAME_CONFIG.countdownSeconds;
    this.roundRemaining = GAME_CONFIG.roundSeconds;
    this.playerSurvivalSeconds = 0;
    this.lastCountdownTick = GAME_CONFIG.countdownSeconds + 1;
    this.characters.forEach((character) => {
      character.configureHuman();
      character.resetStats();
      character.setAlive(true);
      character.mesh.rotation.set(0, Math.PI, 0);
      character.velocity.set(0, 0, 0);
      character.stunRemaining = 0;
    });
    this.spawnManager.placeRoundCharacters(this.characters);
    this.aiControllers.forEach((controller) => controller.reset());
    this.phase = GamePhase.Countdown;
    this.callbacks.onPlayerRoleChanged();
    this.ui.announce('感染体即将出现 · 10 秒准备', 'infection', 2.4);
  }

  update(delta: number): void {
    this.updateParticles(delta);
    if (this.phase === GamePhase.Paused || this.phase === GamePhase.Menu || this.phase === GamePhase.Ended) return;
    this.infectionSystem.update(delta);
    if (this.phase === GamePhase.Countdown) {
      this.countdownRemaining -= delta;
      const tick = Math.ceil(this.countdownRemaining);
      if (tick !== this.lastCountdownTick && tick >= 0) {
        this.lastCountdownTick = tick;
        if (tick <= GAME_CONFIG.countdownSeconds && tick > 0) {
          this.audio.countdown(tick <= 3);
        }
        if (tick <= 5 && tick > 0) {
          this.ui.announce(String(tick), tick <= 3 ? 'infection' : 'normal', 0.72);
        }
      }
      this.aiControllers.forEach((controller) => controller.update(delta, this.phase));
      if (this.countdownRemaining <= 0) this.releaseInfection();
      return;
    }
    if (this.phase !== GamePhase.Active) return;

    this.roundRemaining = Math.max(0, this.roundRemaining - delta);
    if (this.player.team === Team.Human && this.player.alive && !this.infectionSystem.isPending(this.player)) {
      this.playerSurvivalSeconds += delta;
    }
    this.aiControllers.forEach((controller) => controller.update(delta, this.phase));
    for (const character of this.characters) {
      if (character.team !== Team.Infected || character.alive) continue;
      character.respawnTimer -= delta;
      if (character.respawnTimer <= 0) this.respawnInfected(character);
    }
    if (this.roundRemaining <= 0) this.endRound(true);
  }

  applyDamage(attacker: Character, target: Character, amount: number, _headshot: boolean): DamageResult {
    if (this.phase !== GamePhase.Active || !attacker.alive || !target.alive || attacker.team === target.team || target.invulnerableTimer > 0 || this.infectionSystem.isPending(target)) {
      return { applied: false, defeated: false, infected: false };
    }
    let healthDamage = amount;
    if (target.team === Team.Human && target.armor > 0) {
      const absorbed = Math.min(target.armor, amount * 0.5);
      target.armor -= absorbed;
      healthDamage -= absorbed;
    }
    target.health = Math.max(0, target.health - healthDamage);
    target.lastDamageDirection.copy(attacker.position).sub(target.position).normalize();
    if (target.isPlayer) this.callbacks.onPlayerDamaged(attacker.position.clone(), amount);
    if (target.health > 0) return { applied: true, defeated: false, infected: false };

    if (attacker.team === Team.Infected && target.team === Team.Human) {
      attacker.stats.infections += 1;
      this.infectionSystem.begin(target, attacker);
      return { applied: true, defeated: true, infected: true };
    }
    if (attacker.team === Team.Human && target.team === Team.Infected) {
      attacker.stats.kills += 1;
      target.health = 0;
      target.respawnTimer = GAME_CONFIG.infectedRespawnSeconds;
      target.setAlive(false);
      this.ui.addFeed(`${attacker.name} 击退了 ${target.name}`);
      if (target.isPlayer) {
        this.callbacks.onPlayerRespawnState(true);
        this.ui.announce(`重组中 · ${GAME_CONFIG.infectedRespawnSeconds} 秒后返回`, 'infection', 2.1);
      }
      return { applied: true, defeated: true, infected: false };
    }
    return { applied: true, defeated: false, infected: false };
  }

  pause(): void {
    if (this.phase !== GamePhase.Active && this.phase !== GamePhase.Countdown) return;
    this.phaseBeforePause = this.phase;
    this.phase = GamePhase.Paused;
  }

  resume(): void {
    if (this.phase === GamePhase.Paused) this.phase = this.phaseBeforePause;
  }

  returnToMenu(): void {
    this.phase = GamePhase.Menu;
    this.infectionSystem.clear();
    this.clearBursts();
    this.characters.forEach((character) => character.setAlive(false));
  }

  queuePlayerRole(role: 'human' | 'mother'): void {
    this.queuedPlayerRole = role;
    this.ui.showDebugNotice(`下一局：强制玩家为${role === 'human' ? '人类' : '初始母体'}`);
  }

  forceEndPreparation(): void {
    if (this.phase !== GamePhase.Countdown) return;
    this.countdownRemaining = 0;
    this.ui.showDebugNotice('准备倒计时已跳过');
    this.releaseInfection();
  }

  runQaScenario(scenario: string): void {
    if (scenario === 'biocountdown') return;
    this.phase = GamePhase.Active;
    this.countdownRemaining = 0;
    if (scenario === 'models') {
      this.phase = GamePhase.Paused;
      this.player.position.set(0, 0, 18);
      this.characters.forEach((character, index) => {
        if (index === 0) character.configureHuman();
        else if (index >= 5) character.configureInfected(index === 7);
        else character.configureHuman();
        character.setAlive(true);
        if (index > 0) {
          character.position.set((index - 4) * 1.35, 0, 11.5);
          character.mesh.rotation.set(0, Math.PI, 0);
        }
      });
      return;
    }
    if (scenario === 'infected' || scenario === 'mother') {
      this.convertToInfected(this.player, true);
      return;
    }
    if (scenario === 'biospectatorrespawn') {
      const alpha = this.characters[1];
      this.convertToInfected(alpha, true);
      this.convertToInfected(this.characters[2], false, alpha);
      this.convertToInfected(this.player, false, alpha);
      const attacker = this.characters[3];
      this.player.invulnerableTimer = 0;
      this.applyDamage(attacker, this.player, 1000, false);
      return;
    }
    if (scenario === 'infectedrespawn') {
      this.convertToInfected(this.player, false);
      const attacker = this.characters[1];
      this.player.invulnerableTimer = 0;
      this.applyDamage(attacker, this.player, 1000, false);
      return;
    }
    if (scenario === 'infection') {
      const attacker = this.characters[1];
      const target = this.characters[2];
      this.convertToInfected(attacker, true);
      this.infectionSystem.begin(target, attacker);
      return;
    }
    if (scenario === 'biohumaninfected') {
      const attacker = this.characters[1];
      this.convertToInfected(attacker, true);
      this.infectionSystem.begin(this.player, attacker);
      return;
    }
    if (scenario === 'doubleinfection') {
      const attacker = this.characters[1];
      this.convertToInfected(attacker, true);
      this.characters.slice(2, 7).forEach((character) => this.convertToInfected(character, false, attacker));
      this.infectionSystem.begin(this.player, attacker);
      this.infectionSystem.begin(this.characters[7], attacker);
      return;
    }
    if (scenario === 'lasthuman') {
      this.characters.slice(1).forEach((character, index) => this.convertToInfected(character, index === 0));
      return;
    }
    if (scenario === 'humanwin') {
      this.convertToInfected(this.characters[1], true);
      this.roundRemaining = 0.8;
      return;
    }
    if (scenario === 'combat') {
      this.convertToInfected(this.characters[1], true);
      return;
    }
    if (scenario === 'infectedwin') {
      this.characters.forEach((character, index) => this.convertToInfected(character, index > 0 && index < 3));
    }
  }

  dispose(): void {
    this.disposeCharacters();
    this.clearBursts();
  }

  private releaseInfection(): void {
    this.phase = GamePhase.Active;
    const pool = this.roundPlayerRole === 'human' ? this.characters.slice(1) : [...this.characters];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    if (this.roundPlayerRole === 'mother') {
      const playerIndex = pool.indexOf(this.player);
      if (playerIndex >= 0) pool.splice(playerIndex, 1);
      pool.unshift(this.player);
    }
    const selected = pool.slice(0, Math.min(GAME_CONFIG.initialInfectedCount, pool.length));
    this.roundPlayerRole = null;
    selected.forEach((character, index) => this.convertToInfected(character, index === 0));
    this.audio.infectionAlert();
    this.ui.announce(`${selected.length} 名初始感染体已出现`, 'infection', 3);
  }

  private convertToInfected(target: Character, alpha: boolean, attacker?: Character): void {
    target.configureInfected(alpha);
    target.setAlive(true);
    target.stunRemaining = 0;
    if (target.isPlayer) this.ui.flash('infection');
    this.spawnBurst(target.position.clone().add(new THREE.Vector3(0, 1, 0)), alpha ? 0xa7ff67 : 0x73ff8d, alpha ? 42 : 28);
    if (alpha) this.ui.addFeed(`${target.name} 被确认为初始感染体`, true);
    else this.ui.addFeed(`${attacker?.name ?? '感染源'} 感染了 ${target.name}`, true);
    if (target.isPlayer) this.audio.playerInfected();
    else this.audio.infect();
    if (target.isPlayer) {
      this.callbacks.onPlayerRoleChanged();
      this.ui.announce('你已感染 · 使用利爪感染剩余人类', 'infection', 3.2);
    }
    this.evaluateHumans();
  }

  private evaluateHumans(): void {
    const humans = this.characters.filter((character) => character.team === Team.Human);
    if (humans.length === 0) {
      this.endRound(false);
      return;
    }
    if (humans.length !== 1 || humans[0].role === CharacterRole.Hero) return;
    const hero = humans[0];
    if (this.infectionSystem.isPending(hero)) return;
    hero.configureHero();
    if (hero.isPlayer) this.callbacks.onPlayerRoleChanged();
    this.ui.addFeed(`${hero.name} 成为最后英雄`);
    this.ui.flash('hero');
    this.ui.announce(hero.isPlayer ? '你已成为最后英雄 · 重装武器已部署' : `${hero.name} 已成为最后英雄`, 'hero', 3.2);
  }

  private respawnInfected(character: Character): void {
    character.health = character.maxHealth;
    character.invulnerableTimer = 1.4;
    character.position.copy(this.spawnManager.infectedRespawn(this.characters, character));
    character.setAlive(true);
    this.spawnBurst(character.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0x73ff8d, 18);
    if (character.isPlayer) {
      this.callbacks.onPlayerRespawnState(false);
      this.ui.announce('异变重组完成', 'infection', 1.5);
    }
  }

  private endRound(humansWon: boolean): void {
    if (this.phase === GamePhase.Ended) return;
    this.phase = GamePhase.Ended;
    this.audio.announce(humansWon);
    this.callbacks.onRoundEnded(humansWon);
  }

  private onInfectionStarted(target: Character, attacker: Character): void {
    this.spawnBurst(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x63ff80, 24);
    this.ui.addFeed(`${attacker.name} 正在感染 ${target.name}`, true);
    if (target.isPlayer) {
      this.ui.flash('infection');
      this.ui.announce('病毒侵入 · 转化中', 'infection', GAME_CONFIG.infectionStunSeconds);
    }
  }

  private spawnBurst(position: THREE.Vector3, color: number, count: number): void {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const index = i * 3;
      positions[index] = position.x + (Math.random() - 0.5) * 0.7;
      positions[index + 1] = position.y + (Math.random() - 0.5) * 1.5;
      positions[index + 2] = position.z + (Math.random() - 0.5) * 0.7;
      velocities[index] = (Math.random() - 0.5) * 2.8;
      velocities[index + 1] = 1.1 + Math.random() * 2.8;
      velocities[index + 2] = (Math.random() - 0.5) * 2.8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: 0.034, transparent: true, opacity: 0.92, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: 1.25, maxLife: 1.25 });
  }

  private updateParticles(delta: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      burst.life -= delta;
      const attribute = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let j = 0; j < array.length; j += 3) {
        array[j] += burst.velocities[j] * delta;
        array[j + 1] += burst.velocities[j + 1] * delta;
        array[j + 2] += burst.velocities[j + 2] * delta;
        burst.velocities[j + 1] -= 3.8 * delta;
      }
      attribute.needsUpdate = true;
      (burst.points.material as THREE.PointsMaterial).opacity = Math.max(0, burst.life / burst.maxLife);
      if (burst.life <= 0) {
        this.disposeBurst(burst);
        this.bursts.splice(i, 1);
      }
    }
  }

  private disposeBurst(burst: ParticleBurst): void {
    this.scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
  }

  private clearBursts(): void {
    this.bursts.forEach((burst) => this.disposeBurst(burst));
    this.bursts.length = 0;
  }

  private disposeCharacters(): void {
    this.infectionSystem?.clear();
    this.characters.forEach((character) => character.dispose(this.scene));
    this.characters.length = 0;
    this.aiControllers.length = 0;
  }
}
