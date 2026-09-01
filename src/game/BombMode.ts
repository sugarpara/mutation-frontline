import * as THREE from 'three';
import { AIController } from './AIController';
import { AudioManager } from './AudioManager';
import { Character } from './Character';
import { AI_NAMES, GAME_CONFIG } from './config';
import { CollisionWorld } from './CollisionWorld';
import { InputManager } from './InputManager';
import { MapBuilder, type BombMapLayout } from './MapBuilder';
import { GamePhase, Team, type DamageResult, type OperatorId } from './types';
import { UIManager } from '../ui/UIManager';

interface BombModeCallbacks {
  onPlayerDamaged: (source: THREE.Vector3, damage: number) => void;
  onPlayerDeath: () => void;
  onRoundEnded: (result: BombRoundResult) => void;
}

export interface BombRoundResult {
  attackersWon: boolean;
  playerWon: boolean;
  matchEnded: boolean;
  reason: string;
  roundNumber: number;
  playerScore: number;
  opponentScore: number;
}

export interface BombHUDState {
  planted: boolean;
  carried: boolean;
  site: 'A' | 'B' | null;
  fuseRemaining: number;
  interactionProgress: number;
  objective: string;
  roundNumber: number;
  attackerScore: number;
  defenderScore: number;
  roundsToWin: number;
}

type BombInteractionKind = 'plant' | 'defuse';

export class BombMode {
  readonly characters: Character[] = [];
  readonly aiControllers: AIController[] = [];
  phase = GamePhase.Menu;
  countdownRemaining: number = GAME_CONFIG.bomb.countdownSeconds;
  roundRemaining: number = GAME_CONFIG.bomb.roundSeconds;
  playerSurvivalSeconds = 0;
  private phaseBeforePause = GamePhase.Active;
  private selectedOperator: OperatorId = 'Rook';
  private readonly sites: THREE.Vector3[] = [];
  private readonly siteRoot = new THREE.Group();
  private readonly bombRoot = new THREE.Group();
  private bombCarrier: Character | null = null;
  private bombPosition = new THREE.Vector3();
  private plantedSite: number | null = null;
  private fuseRemaining: number = GAME_CONFIG.bomb.fuseSeconds;
  private interactionKind: BombInteractionKind | null = null;
  private interactionActor: Character | null = null;
  private interactionSite: number | null = null;
  private interactionProgress = 0;
  private readonly interactionInterrupts = new Map<string, number>();
  private lastBeepSecond = -1;
  private preferredSite = 0;
  private explosion: THREE.Mesh | null = null;
  private explosionLife = 0;
  private playerScore = 0;
  private opponentScore = 0;
  private roundNumber = 0;
  private playerAttacking = true;
  private matchEnded = false;
  private qaAutoInteract = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly map: MapBuilder,
    private readonly collision: CollisionWorld,
    private readonly input: InputManager,
    private readonly audio: AudioManager,
    private readonly ui: UIManager,
    private readonly callbacks: BombModeCallbacks,
  ) {
    this.siteRoot.name = 'Bomb Sites';
    this.bombRoot.name = 'Kestrel Breach Core';
    this.scene.add(this.siteRoot, this.bombRoot);
    this.buildBombModel();
    this.bombRoot.visible = false;
  }

  get player(): Character {
    const player = this.characters[0];
    if (!player) throw new Error('Bomb mode has not been initialized');
    return player;
  }

  get humanCount(): number { return this.characters.filter((character) => character.team === Team.Attackers && character.alive).length; }
  get infectedCount(): number { return this.characters.filter((character) => character.team === Team.Defenders && character.alive).length; }
  get pendingInfectionCount(): number { return 0; }
  get canPlayerMove(): boolean { return this.phase === GamePhase.Active && !this.isPlayerInteracting(); }
  get canPlayerAttack(): boolean { return !this.isPlayerInteracting(); }

  get hudState(): BombHUDState {
    const site = this.plantedSite === null ? null : this.plantedSite === 0 ? 'A' : 'B';
    const duration = this.interactionKind === 'plant' ? GAME_CONFIG.bomb.plantSeconds : GAME_CONFIG.bomb.defuseSeconds;
    const interactionProgress = this.interactionKind ? this.interactionProgress / duration : 0;
    const playerIsDefender = this.player.team === Team.Defenders;
    let objective: string;
    if (playerIsDefender) {
      objective = '守卫 A/B 区 · 阻止爆破核心安装';
      if (!this.player.alive) objective = this.plantedSite === null ? '等待队友守住目标区' : '核心已启动 · 等待队友拆除';
      else if (this.plantedSite !== null && this.interactionActor === this.player) {
        objective = `正在拆除 ${site} 区核心 · ${Math.max(0, Math.ceil(GAME_CONFIG.bomb.defuseSeconds - this.interactionProgress))} 秒`;
      } else if (this.plantedSite !== null && this.interactionActor) {
        objective = `${this.interactionActor.name} 正在拆除 ${site} 区核心`;
      } else if (this.plantedSite !== null) {
        objective = `核心已安装于 ${site} 区 · 靠近并按住 E 拆除`;
      }
    } else {
      objective = '携带爆破核心 · 前往 A/B 区按住 E 安装';
      if (!this.player.alive) objective = this.plantedSite === null ? '等待队友完成安装' : '爆破核心已启动';
      else if (this.plantedSite !== null && this.interactionKind === 'defuse') objective = `防守方正在拆除 ${site} 区核心 · 立即阻止`;
      else if (this.plantedSite !== null) objective = `核心已安装于 ${site} 区 · 阻止拆除`;
      else if (this.bombCarrier !== this.player) objective = this.bombCarrier ? '护送爆破核心携带者' : '爆破核心已掉落 · 前往回收';
      else if (this.interactionActor === this.player) objective = `正在安装 · ${Math.max(0, Math.ceil(GAME_CONFIG.bomb.plantSeconds - this.interactionProgress))} 秒`;
    }
    const attackerScore = this.playerAttacking ? this.playerScore : this.opponentScore;
    const defenderScore = this.playerAttacking ? this.opponentScore : this.playerScore;
    return {
      planted: this.plantedSite !== null,
      carried: this.bombCarrier === this.player,
      site,
      fuseRemaining: this.fuseRemaining,
      interactionProgress: THREE.MathUtils.clamp(interactionProgress, 0, 1),
      objective,
      roundNumber: this.roundNumber,
      attackerScore,
      defenderScore,
      roundsToWin: GAME_CONFIG.bomb.roundsToWin,
    };
  }

  initialize(operator: OperatorId): void {
    this.disposeCharacters();
    this.selectedOperator = operator;
    const operators: OperatorId[] = ['Rook', 'Kite', 'Iris', 'Vela'];
    this.characters.push(new Character('player', '玩家', true, operator, this.scene));
    for (let index = 0; index < GAME_CONFIG.aiCount; index += 1) {
      this.characters.push(new Character(`ai-${index + 1}`, AI_NAMES[index], false, operators[(index + 1) % operators.length], this.scene));
    }
    this.aiControllers.push(...this.characters.slice(1).map((character) => new AIController(
      character,
      this.scene,
      this.map,
      this.collision,
      this.audio,
      {
        getCharacters: () => this.characters,
        getPlayer: () => this.player,
        applyDamage: (attacker, target, damage, headshot) => this.applyDamage(attacker, target, damage, headshot),
        getTacticalPoint: (actor) => this.getTacticalPoint(actor),
        isObjectiveInteracting: (actor) => this.isAIObjectiveInteracting(actor),
      },
    )));
    this.buildSites();
  }

  startMatch(): void {
    if (!this.characters.length) this.initialize(this.selectedOperator);
    this.playerScore = 0;
    this.opponentScore = 0;
    this.roundNumber = 0;
    this.matchEnded = false;
    this.startRound();
  }

  startRound(): void {
    if (!this.characters.length) this.initialize(this.selectedOperator);
    if (this.matchEnded) {
      this.playerScore = 0;
      this.opponentScore = 0;
      this.roundNumber = 0;
      this.matchEnded = false;
    }
    this.roundNumber += 1;
    this.playerAttacking = this.roundNumber <= GAME_CONFIG.bomb.sideSwapAfterRounds;
    this.countdownRemaining = GAME_CONFIG.bomb.countdownSeconds;
    this.roundRemaining = GAME_CONFIG.bomb.roundSeconds;
    this.playerSurvivalSeconds = 0;
    this.plantedSite = null;
    this.fuseRemaining = GAME_CONFIG.bomb.fuseSeconds;
    this.clearInteraction();
    this.interactionInterrupts.clear();
    this.qaAutoInteract = false;
    this.lastBeepSecond = -1;
    this.preferredSite = Math.random() < 0.5 ? 0 : 1;
    this.characters.forEach((character, index) => {
      const playerSquad = index < 4;
      const attacking = playerSquad === this.playerAttacking;
      character.configureCombatant(attacking ? Team.Attackers : Team.Defenders);
      character.resetStats();
      character.velocity.set(0, 0, 0);
      character.mesh.rotation.set(0, Math.PI, 0);
      character.setAlive(true);
      const teammate = character !== this.player && character.team === this.player.team;
      character.setTacticalMarker(teammate, this.playerAttacking ? 0xffb14d : 0x65c7ff);
    });
    this.placeTeams();
    this.aiControllers.forEach((controller) => controller.reset());
    this.bombCarrier = this.characters.find((character) => character.team === Team.Attackers) ?? null;
    if (this.bombCarrier) this.bombPosition.copy(this.bombCarrier.position);
    this.bombRoot.visible = false;
    this.siteRoot.visible = true;
    this.phase = GamePhase.Countdown;
    const role = this.playerAttacking ? '进攻方' : '防守方';
    this.ui.announce(`第 ${this.roundNumber} 回合 · 你是${role}`, 'normal', 2.4);
  }

  update(delta: number): void {
    this.updateVisuals(delta);
    this.updateInteractionInterrupts(delta);
    if (this.phase === GamePhase.Paused || this.phase === GamePhase.Menu || this.phase === GamePhase.Ended) return;
    if (this.phase === GamePhase.Countdown) {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - delta);
      if (this.countdownRemaining <= 0) {
        this.phase = GamePhase.Active;
        this.ui.announce(this.playerAttacking ? '行动开始 · 安装爆破核心' : '行动开始 · 守住 A/B 区', 'normal', 2.2);
      }
      return;
    }
    if (this.player.alive) this.playerSurvivalSeconds += delta;
    this.aiControllers.forEach((controller) => controller.update(delta, this.phase));
    this.updateBombCarrier();

    if (this.plantedSite !== null) {
      this.updatePlantedBomb(delta);
    } else {
      this.roundRemaining = Math.max(0, this.roundRemaining - delta);
      this.updatePlanting(delta);
      if (this.plantedSite === null && this.roundRemaining <= 0) this.endRound(false, '行动时间耗尽，防守方守住目标区。');
    }
    this.evaluateElimination();
  }

  applyDamage(attacker: Character, target: Character, amount: number, _headshot: boolean): DamageResult {
    if (this.phase !== GamePhase.Active || !attacker.alive || !target.alive || attacker.team === target.team || target.invulnerableTimer > 0) {
      return { applied: false, defeated: false, infected: false };
    }
    const absorbed = Math.min(target.armor, amount * 0.5);
    target.armor -= absorbed;
    target.health = Math.max(0, target.health - (amount - absorbed));
    target.lastDamageDirection.copy(attacker.position).sub(target.position).normalize();
    this.interruptInteraction(target);
    if (target.isPlayer) this.callbacks.onPlayerDamaged(attacker.position.clone(), amount);
    if (target.health > 0) return { applied: true, defeated: false, infected: false };

    attacker.stats.kills += 1;
    target.setAlive(false);
    target.velocity.set(0, 0, 0);
    this.ui.addFeed(`${attacker.name} 击败了 ${target.name}`);
    if (target === this.bombCarrier) this.dropBomb(target.position);
    if (target.isPlayer) {
      this.callbacks.onPlayerDeath();
      this.ui.announce('你已阵亡 · 等待回合结束', 'infection', 2.5);
    }
    return { applied: true, defeated: true, infected: false };
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
    this.characters.forEach((character) => character.setAlive(false));
    this.siteRoot.visible = false;
    this.bombRoot.visible = false;
  }

  runQaScenario(scenario: string): void {
    if (scenario === 'bomblastsecondplant') {
      this.phase = GamePhase.Active;
      this.countdownRemaining = 0;
      this.roundRemaining = 0.001;
      this.player.position.copy(this.sites[0]);
      this.bombCarrier = this.player;
      this.interactionKind = 'plant';
      this.interactionActor = this.player;
      this.interactionSite = 0;
      this.interactionProgress = GAME_CONFIG.bomb.plantSeconds - 0.001;
      this.qaAutoInteract = true;
      return;
    }
    if (scenario === 'bombplayerdefuse') {
      this.roundNumber = GAME_CONFIG.bomb.sideSwapAfterRounds;
      this.startRound();
      this.phase = GamePhase.Active;
      this.countdownRemaining = 0;
      const planter = this.characters.find((character) => character.team === Team.Attackers)!;
      this.plantBomb(0, planter);
      this.fuseRemaining = 18;
      this.characters.filter((character) => character.team === Team.Attackers).forEach((character) => character.setAlive(false));
      this.characters
        .filter((character) => character.team === Team.Defenders && character !== this.player)
        .forEach((character, index) => character.position.copy(this.sites[1]).add(new THREE.Vector3(index * 1.5, 0, 8)));
      this.player.position.copy(this.sites[0]).add(new THREE.Vector3(0.6, 0, 0));
      this.qaAutoInteract = true;
      return;
    }
    this.phase = GamePhase.Active;
    this.countdownRemaining = 0;
    if (scenario === 'bombplant') {
      this.plantBomb(0, this.player);
      this.fuseRemaining = 6;
    } else if (scenario === 'bombdefuse') {
      this.plantBomb(1, this.player);
      this.fuseRemaining = 18;
      const defender = this.characters.find((character) => character.team === Team.Defenders)!;
      defender.position.copy(this.sites[1]).add(new THREE.Vector3(1, 0, 0));
    } else if (scenario === 'bombattackerswin') {
      this.characters.filter((character) => character.team === Team.Defenders).forEach((character) => character.setAlive(false));
      this.evaluateElimination();
    } else if (scenario === 'bombdefenderswin') {
      this.characters.filter((character) => character.team === Team.Attackers).forEach((character) => character.setAlive(false));
      this.evaluateElimination();
    }
  }

  dispose(): void {
    this.disposeCharacters();
    this.disposeGroup(this.siteRoot);
    this.disposeGroup(this.bombRoot);
    this.scene.remove(this.siteRoot, this.bombRoot);
    if (this.explosion) {
      this.scene.remove(this.explosion);
      this.explosion.geometry.dispose();
      (this.explosion.material as THREE.Material).dispose();
      this.explosion = null;
    }
  }

  private getTacticalPoint(character: Character): THREE.Vector3 | null {
    if (!this.sites.length) return null;
    if (character.team === Team.Defenders) {
      if (this.plantedSite !== null) return this.bombPosition;
      const index = Math.abs(Number.parseInt(character.id.replace(/\D/g, ''), 10) || 0) % this.sites.length;
      return this.sites[index];
    }
    if (this.plantedSite !== null) return this.bombPosition;
    if (this.bombCarrier === character) return this.sites[this.preferredSite];
    if (this.bombCarrier?.alive) return this.bombCarrier.position;
    return this.bombPosition;
  }

  private updatePlanting(delta: number): void {
    const planter = this.getPlantCandidate();
    const siteIndex = planter ? this.nearbySite(planter.position) : null;
    if (!planter || siteIndex === null) {
      if (this.interactionKind === 'plant') this.clearInteraction();
      return;
    }
    this.advanceInteraction('plant', planter, siteIndex, delta, GAME_CONFIG.bomb.plantSeconds, () => {
      this.plantBomb(siteIndex, planter);
    });
  }

  private updatePlantedBomb(delta: number): void {
    this.fuseRemaining = Math.max(0, this.fuseRemaining - delta);
    const second = Math.ceil(this.fuseRemaining);
    if (second !== this.lastBeepSecond && (second <= 10 || second % 2 === 0)) {
      this.lastBeepSecond = second;
      this.audio.bombBeep(second <= 7);
    }
    const defuser = this.getDefuserCandidate();
    if (defuser) {
      const completed = this.advanceInteraction('defuse', defuser, this.plantedSite!, delta, GAME_CONFIG.bomb.defuseSeconds, () => {
        defuser.stats.defuses += 1;
        this.audio.bombDefuse();
        this.endRound(false, `${defuser.name} 已拆除爆破核心。`);
      });
      if (completed) return;
    } else if (this.interactionKind === 'defuse') {
      this.clearInteraction();
    }
    if (this.fuseRemaining <= 0) {
      this.audio.bombExplosion();
      this.spawnExplosion();
      this.endRound(true, `爆破核心在 ${this.plantedSite === 0 ? 'A' : 'B'} 区引爆。`);
    }
  }

  private updateBombCarrier(): void {
    if (this.plantedSite !== null) return;
    if (this.bombCarrier && !this.bombCarrier.alive) this.dropBomb(this.bombCarrier.position);
    if (this.bombCarrier) return;
    const candidate = this.characters
      .filter((character) => character.team === Team.Attackers && character.alive)
      .sort((a, b) => a.position.distanceToSquared(this.bombPosition) - b.position.distanceToSquared(this.bombPosition))[0];
    if (candidate && candidate.position.distanceTo(this.bombPosition) <= 1.5) {
      this.bombCarrier = candidate;
      this.bombRoot.visible = false;
      this.ui.addFeed(`${candidate.name} 拾取了爆破核心`);
    }
  }

  private plantBomb(siteIndex: number, planter: Character): void {
    this.plantedSite = siteIndex;
    this.bombCarrier = null;
    this.bombPosition.copy(this.sites[siteIndex]);
    this.bombRoot.position.copy(this.bombPosition).add(new THREE.Vector3(0, 0.2, 0));
    this.bombRoot.visible = true;
    this.fuseRemaining = GAME_CONFIG.bomb.fuseSeconds;
    this.clearInteraction();
    this.lastBeepSecond = -1;
    planter.stats.plants += 1;
    this.audio.bombPlant();
    this.ui.addFeed(`${planter.name} 在 ${siteIndex === 0 ? 'A' : 'B'} 区安装了爆破核心`);
    this.ui.announce(`爆破核心已安装 · ${GAME_CONFIG.bomb.fuseSeconds} 秒`, 'infection', 2.6);
  }

  private dropBomb(position: THREE.Vector3): void {
    this.clearInteraction();
    this.bombCarrier = null;
    this.bombPosition.copy(position);
    this.bombRoot.position.copy(position).add(new THREE.Vector3(0, 0.2, 0));
    this.bombRoot.visible = true;
    this.ui.addFeed('爆破核心已掉落');
  }

  private evaluateElimination(): void {
    if (this.phase !== GamePhase.Active) return;
    if (this.infectedCount === 0) this.endRound(true, '防守小队已被全部击败。');
    else if (this.humanCount === 0 && this.plantedSite === null) this.endRound(false, '进攻小队已被全部击败。');
  }

  private endRound(attackersWon: boolean, reason: string): void {
    if (this.phase === GamePhase.Ended) return;
    this.phase = GamePhase.Ended;
    this.clearInteraction();
    const playerWon = attackersWon === this.playerAttacking;
    if (playerWon) this.playerScore += 1;
    else this.opponentScore += 1;
    this.matchEnded = this.playerScore >= GAME_CONFIG.bomb.roundsToWin || this.opponentScore >= GAME_CONFIG.bomb.roundsToWin;
    this.audio.announce(playerWon);
    this.callbacks.onRoundEnded({
      attackersWon,
      playerWon,
      matchEnded: this.matchEnded,
      reason,
      roundNumber: this.roundNumber,
      playerScore: this.playerScore,
      opponentScore: this.opponentScore,
    });
  }

  private getPlantCandidate(): Character | null {
    const planter = this.bombCarrier;
    if (!planter?.alive || planter.stunRemaining > 0 || this.isInteractionInterrupted(planter)) return null;
    if (this.nearbySite(planter.position) === null) return null;
    if (planter.isPlayer && !this.isPlayerUseHeld()) return null;
    return planter;
  }

  private getDefuserCandidate(): Character | null {
    const eligible = this.characters
      .filter((character) => character.team === Team.Defenders
        && character.alive
        && character.stunRemaining <= 0
        && !this.isInteractionInterrupted(character)
        && character.position.distanceTo(this.bombPosition) <= GAME_CONFIG.bomb.defuseRadius)
      .sort((a, b) => a.position.distanceToSquared(this.bombPosition) - b.position.distanceToSquared(this.bombPosition));
    if (this.interactionKind === 'defuse' && this.interactionActor && eligible.includes(this.interactionActor)) {
      if (!this.interactionActor.isPlayer || this.isPlayerUseHeld()) return this.interactionActor;
    }
    const player = eligible.find((character) => character.isPlayer);
    if (player && this.isPlayerUseHeld()) return player;
    return eligible.find((character) => !character.isPlayer) ?? null;
  }

  private isPlayerUseHeld(): boolean {
    return this.input.isDown('KeyE') || (import.meta.env.DEV && this.qaAutoInteract);
  }

  private isPlayerInteracting(): boolean {
    if (this.phase !== GamePhase.Active || !this.characters.length || !this.player.alive) return false;
    if (this.player.team === Team.Attackers) return this.getPlantCandidate() === this.player;
    return this.plantedSite !== null && this.getDefuserCandidate() === this.player;
  }

  private isAIObjectiveInteracting(character: Character): boolean {
    if (this.phase !== GamePhase.Active || character.isPlayer) return false;
    if (character.team === Team.Attackers) return this.plantedSite === null && this.getPlantCandidate() === character;
    return this.plantedSite !== null && this.getDefuserCandidate() === character;
  }

  private advanceInteraction(
    kind: BombInteractionKind,
    actor: Character,
    site: number,
    delta: number,
    duration: number,
    onCompleted: () => void,
  ): boolean {
    if (this.interactionKind !== kind || this.interactionActor !== actor || this.interactionSite !== site) {
      this.interactionKind = kind;
      this.interactionActor = actor;
      this.interactionSite = site;
      this.interactionProgress = 0;
    }
    actor.velocity.set(0, 0, 0);
    this.interactionProgress = Math.min(duration, this.interactionProgress + delta);
    if (this.interactionProgress < duration) return false;
    onCompleted();
    return true;
  }

  private interruptInteraction(character: Character): void {
    this.interactionInterrupts.set(character.id, 0.6);
    if (this.interactionActor === character) this.clearInteraction();
  }

  private updateInteractionInterrupts(delta: number): void {
    for (const [id, remaining] of this.interactionInterrupts) {
      const next = remaining - delta;
      if (next <= 0) this.interactionInterrupts.delete(id);
      else this.interactionInterrupts.set(id, next);
    }
  }

  private isInteractionInterrupted(character: Character): boolean {
    return (this.interactionInterrupts.get(character.id) ?? 0) > 0;
  }

  private clearInteraction(): void {
    this.interactionKind = null;
    this.interactionActor = null;
    this.interactionSite = null;
    this.interactionProgress = 0;
  }

  private nearbySite(position: THREE.Vector3): number | null {
    const index = this.sites.findIndex((site) => site.distanceTo(position) <= GAME_CONFIG.bomb.siteRadius);
    return index >= 0 ? index : null;
  }

  private placeTeams(): void {
    const layout = this.requireBombLayout();
    if (layout.attackerSpawns.length < 4 || layout.defenderSpawns.length < 4) {
      throw new Error(`Bomb map ${this.map.currentMap} requires four attacker and four defender spawns.`);
    }
    const attackers = this.characters.filter((character) => character.team === Team.Attackers);
    const defenders = this.characters.filter((character) => character.team === Team.Defenders);
    const place = (character: Character, source: THREE.Vector3) => {
      const position = source.clone();
      position.y = this.collision.getGroundHeight(position.x, position.z, position.y);
      character.position.copy(position);
    };
    attackers.forEach((character, index) => {
      place(character, layout.attackerSpawns[index]);
    });
    defenders.forEach((character, index) => {
      place(character, layout.defenderSpawns[index]);
    });
  }

  private buildSites(): void {
    this.disposeGroup(this.siteRoot);
    this.sites.length = 0;
    const layout = this.requireBombLayout();
    if (layout.sites.length !== 2) throw new Error(`Bomb map ${this.map.currentMap} requires exactly two objective sites.`);
    layout.sites.forEach((point, index) => {
      const site = point.clone();
      site.y = this.collision.getGroundHeight(site.x, site.z, site.y);
      this.sites.push(site);
      const group = new THREE.Group();
      group.position.copy(site);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.45, 0.075, 8, 32),
        new THREE.MeshBasicMaterial({ color: index === 0 ? 0xffa447 : 0x58c9ff, transparent: true, opacity: 0.72, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.35, 32),
        new THREE.MeshBasicMaterial({ color: index === 0 ? 0xff7a32 : 0x3ca9df, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.035;
      const label = this.makeSiteLabel(index === 0 ? 'A' : 'B', index === 0 ? '#ffb05a' : '#6dd4ff');
      group.userData.ring = ring;
      group.add(ring, disc, label);
      this.siteRoot.add(group);
    });
  }

  private requireBombLayout(): BombMapLayout {
    const layout = this.map.bombLayout;
    if (!layout) throw new Error(`Map ${this.map.currentMap} is not available in bomb mode.`);
    return layout;
  }

  private makeSiteLabel(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(4, 9, 12, 0.76)';
    context.beginPath();
    context.arc(64, 64, 48, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 6;
    context.stroke();
    context.fillStyle = color;
    context.font = 'bold 68px Segoe UI';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 64, 65);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.y = 2.25;
    sprite.scale.set(1.35, 1.35, 1);
    sprite.renderOrder = 6;
    return sprite;
  }

  private buildBombModel(): void {
    const shell = new THREE.MeshStandardMaterial({ color: 0x202a2d, roughness: 0.34, metalness: 0.76 });
    const energy = new THREE.MeshStandardMaterial({ color: 0xff6d2f, emissive: 0xff4c1e, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.46), shell);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), energy);
    core.rotation.z = Math.PI / 2;
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.035), energy);
    antenna.position.set(0.22, 0.3, 0);
    const light = new THREE.PointLight(0xff6234, 1.2, 5, 2);
    light.position.y = 0.35;
    this.bombRoot.add(body, core, antenna, light);
  }

  private updateVisuals(delta: number): void {
    const time = performance.now() * 0.003;
    this.siteRoot.children.forEach((site, index) => {
      const ring = site.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        ring.rotation.z += delta * (index === 0 ? 0.28 : -0.28);
        ring.scale.setScalar(1 + Math.sin(time + index) * 0.035);
      }
    });
    if (this.bombRoot.visible) this.bombRoot.rotation.y += delta * 0.8;
    if (this.explosion) {
      this.explosionLife = Math.max(0, this.explosionLife - delta);
      const progress = 1 - this.explosionLife / 0.8;
      this.explosion.scale.setScalar(1 + progress * 10);
      (this.explosion.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.explosionLife / 0.8);
      if (this.explosionLife <= 0) {
        this.scene.remove(this.explosion);
        this.explosion.geometry.dispose();
        (this.explosion.material as THREE.Material).dispose();
        this.explosion = null;
      }
    }
  }

  private spawnExplosion(): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xff7b32, transparent: true, opacity: 0.82, depthWrite: false });
    this.explosion = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), material);
    this.explosion.position.copy(this.bombPosition).add(new THREE.Vector3(0, 0.7, 0));
    this.explosionLife = 0.8;
    this.scene.add(this.explosion);
  }

  private disposeCharacters(): void {
    this.characters.forEach((character) => character.dispose(this.scene));
    this.characters.length = 0;
    this.aiControllers.length = 0;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      } else if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    group.clear();
  }
}
