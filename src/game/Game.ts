import * as THREE from 'three';
import { AudioManager } from './AudioManager';
import { BioMode } from './BioMode';
import { BombMode, type BombRoundResult } from './BombMode';
import { CollisionWorld } from './CollisionWorld';
import { InputManager } from './InputManager';
import { MapBuilder } from './MapBuilder';
import { PlayerController } from './PlayerController';
import { WeaponSystem } from './WeaponSystem';
import { GamePhase, Team, WeaponKind, type GameModeId, type GameSettings } from './types';
import { isMapId, normalizeMapForMode } from './mapCatalog';
import { UIManager } from '../ui/UIManager';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 150);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly collision = new CollisionWorld();
  private readonly input: InputManager;
  private readonly audio = new AudioManager();
  private readonly ui = new UIManager();
  private readonly map: MapBuilder;
  private readonly bioMode: BioMode;
  private readonly bombMode: BombMode;
  private mode: BioMode | BombMode;
  private playerController: PlayerController | null = null;
  private weapons: WeaponSystem | null = null;
  private animationFrame = 0;
  private menuTime = 0;
  private settings: GameSettings = { ...this.ui.settings };
  private readonly qaScenario = new URLSearchParams(window.location.search).get('qa');
  private readonly requestedMap = new URLSearchParams(window.location.search).get('map');
  private readonly requestedWeapon = new URLSearchParams(window.location.search).get('weapon');
  private readonly requestedMode = new URLSearchParams(window.location.search).get('mode');
  private readonly qaMode = import.meta.env.DEV && this.qaScenario !== null;
  private qaFrameCount = 0;
  private qaFrameTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene.background = new THREE.Color(0x0a161e);
    this.scene.fog = new THREE.FogExp2(0x0a161e, 0.014);
    this.scene.add(this.camera);
    this.input = new InputManager(canvas);
    this.map = new MapBuilder(this.scene, this.collision);
    this.bioMode = new BioMode(this.scene, this.map, this.collision, this.audio, this.ui, {
      onPlayerRoleChanged: () => this.handlePlayerRoleChanged(),
      onPlayerDamaged: (source, damage) => this.handlePlayerDamage(source, damage),
      onPlayerRespawnState: (respawning) => {
        this.weapons?.setVisible(!respawning);
        if (!respawning) {
          this.playerController?.resetForSpawn(false);
          this.weapons?.syncRole();
        }
      },
      onRoundEnded: (humansWon) => this.handleRoundEnd(humansWon),
    });
    this.bombMode = new BombMode(this.scene, this.map, this.collision, this.input, this.audio, this.ui, {
      onPlayerDamaged: (source, damage) => this.handlePlayerDamage(source, damage),
      onPlayerDeath: () => this.weapons?.setVisible(false),
      onRoundEnded: (result) => this.handleBombRoundEnd(result),
    });
    this.mode = this.bioMode;
    this.bindUI();
    this.bindWindowEvents();
  }

  start(): void {
    const requestedMode: GameModeId | null = this.requestedMode === 'bio' || this.requestedMode === 'bomb' ? this.requestedMode : null;
    const requestedMap = isMapId(this.requestedMap) ? this.requestedMap : undefined;
    if (import.meta.env.DEV && (requestedMode || requestedMap)) {
      this.ui.setSelection(requestedMode ?? this.settings.mode, requestedMap, false);
      this.settings = { ...this.ui.settings };
    }
    if (import.meta.env.DEV && ['rifle', 'pistol', 'knife'].includes(this.requestedWeapon ?? '')) {
      this.settings.startingWeapon = this.requestedWeapon as WeaponKind;
    }
    this.map.build(this.settings.map);
    this.ui.finishLoading();
    this.input.setEnabled(false);
    this.clock.start();
    if (this.qaMode) this.startGame();
    else this.ui.showMenu();
    this.animate();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.audio.stopAll();
    this.weapons?.dispose();
    this.bioMode.dispose();
    this.bombMode.dispose();
    this.renderer.dispose();
  }

  private bindUI(): void {
    this.ui.bindActions({
      start: () => this.startGame(),
      resume: () => this.resumeGame(),
      restart: () => this.restartGame(),
      toMenu: () => this.returnToMenu(),
      settingsChanged: (settings) => this.applySettings(settings),
    });
    this.applySettings(this.ui.settings);
  }

  private bindWindowEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.qaMode) return;
      const locked = document.pointerLockElement === this.canvas;
      this.input.setEnabled(locked);
      if (locked && this.mode.phase === GamePhase.Paused) {
        this.mode.resume();
        this.ui.hidePause();
      } else if (!locked && (this.mode.phase === GamePhase.Active || this.mode.phase === GamePhase.Countdown)) {
        this.mode.pause();
        this.ui.showPause();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.mode.phase !== GamePhase.Menu && this.mode.phase !== GamePhase.Ended) this.ui.showPause();
    });
    window.addEventListener('beforeunload', () => this.dispose(), { once: true });
    if (import.meta.env.DEV) {
      window.addEventListener('keydown', (event) => {
        if (!(this.mode instanceof BioMode)) return;
        if (event.code === 'F2') this.mode.queuePlayerRole('human');
        else if (event.code === 'F3') this.mode.queuePlayerRole('mother');
        else if (event.code === 'F4') this.mode.forceEndPreparation();
        else return;
        event.preventDefault();
      });
    }
  }

  private startGame(): void {
    this.audio.stopAll();
    this.audio.resume();
    this.weapons?.dispose();
    const normalizedMap = normalizeMapForMode(this.settings.mode, this.settings.map);
    if (normalizedMap !== this.settings.map) {
      this.ui.setSelection(this.settings.mode, normalizedMap, false);
      this.settings = { ...this.settings, map: normalizedMap };
    }
    this.mode = this.settings.mode === 'bomb' ? this.bombMode : this.bioMode;
    this.map.build(this.settings.map);
    this.mode.initialize(this.settings.operator);
    this.playerController = new PlayerController(this.mode.player, this.camera, this.input, this.collision);
    this.playerController.sensitivity = this.settings.sensitivity;
    this.playerController.cameraShakeEnabled = this.settings.cameraShake;
    this.weapons = new WeaponSystem(
      this.mode.player,
      this.camera,
      this.scene,
      this.input,
      this.collision,
      this.audio,
      {
        getCharacters: () => this.mode.characters,
        applyDamage: (attacker, target, damage, headshot) => this.mode.applyDamage(attacker, target, damage, headshot),
        onHit: (headshot) => this.ui.showHit(headshot),
        onWeaponChanged: (slot) => this.ui.setWeaponSlot(slot),
        addRecoil: (amount) => this.playerController?.addRecoil(amount),
        muzzleFlashEnabled: () => this.settings.muzzleFlash,
      },
    );
    if (this.mode instanceof BombMode) {
      this.mode.startMatch();
      this.faceBombSpawn();
    } else this.mode.startRound();
    this.weapons.reset();
    this.weapons.equipPreferred(this.settings.startingWeapon);
    this.weapons.setVisible(true);
    this.ui.showHUD();
    if (this.qaMode && this.qaScenario && this.qaScenario !== '1') this.mode.runQaScenario(this.qaScenario);
    if (this.qaMode && this.qaScenario === 'level' && this.map.currentMap === 'refinery') {
      this.mode.player.position.set(-8, 4.2, -19);
      this.playerController.faceDirection(new THREE.Vector3(1, 0, 0));
    }
    if (this.qaMode && this.qaScenario === 'weapon') this.weapons.startQaShowcase();
    if (!this.qaMode) this.canvas.requestPointerLock();
  }

  private restartGame(): void {
    this.audio.stopAll();
    this.audio.resume();
    this.mode.startRound();
    this.playerController?.resetForSpawn();
    if (this.mode instanceof BombMode) this.faceBombSpawn();
    this.weapons?.reset();
    this.weapons?.equipPreferred(this.settings.startingWeapon);
    this.weapons?.setVisible(true);
    this.ui.showHUD();
    if (this.qaMode && (this.qaScenario === 'humanwin' || this.qaScenario === 'infectedwin')) {
      this.mode.runQaScenario(this.qaScenario);
    }
    if (!this.qaMode) this.canvas.requestPointerLock();
  }

  private resumeGame(): void {
    this.audio.resume();
    this.canvas.requestPointerLock();
  }

  private returnToMenu(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.stopAll();
    this.mode.returnToMenu();
    this.weapons?.dispose();
    this.weapons = null;
    this.playerController = null;
    this.input.setEnabled(false);
    this.ui.showMenu();
  }

  private applySettings(settings: GameSettings): void {
    const map = normalizeMapForMode(settings.mode, settings.map);
    if (map !== settings.map) this.ui.setSelection(settings.mode, map, false);
    const nextSettings = { ...settings, map };
    const mapChanged = this.settings.map !== nextSettings.map;
    this.settings = nextSettings;
    this.audio.setVolume(nextSettings.volume);
    if (this.playerController) {
      this.playerController.sensitivity = nextSettings.sensitivity;
      this.playerController.cameraShakeEnabled = nextSettings.cameraShake;
    }
    if (mapChanged && this.mode.phase === GamePhase.Menu) this.map.build(nextSettings.map);
  }

  private handlePlayerRoleChanged(): void {
    this.weapons?.syncRole();
  }

  private faceBombSpawn(): void {
    if (!(this.mode instanceof BombMode) || !this.playerController) return;
    const layout = this.map.bombLayout;
    if (!layout) return;
    const playerSpawns = this.mode.player.team === Team.Attackers ? layout.attackerSpawns : layout.defenderSpawns;
    const opponentSpawns = this.mode.player.team === Team.Attackers ? layout.defenderSpawns : layout.attackerSpawns;
    const center = (points: THREE.Vector3[]) => points
      .reduce((total, point) => total.add(point), new THREE.Vector3())
      .multiplyScalar(1 / Math.max(1, points.length));
    const direction = center(opponentSpawns).sub(center(playerSpawns)).setY(0);
    if (direction.lengthSq() > 0.001) this.playerController.faceDirection(direction.normalize());
  }

  private handlePlayerDamage(source: THREE.Vector3, damage: number): void {
    if (!this.playerController) return;
    const playerPosition = this.mode.player.position;
    const direction = source.clone().sub(playerPosition).setY(0).normalize();
    const forward = new THREE.Vector3(-Math.sin(this.playerController.yaw), 0, -Math.cos(this.playerController.yaw));
    const right = new THREE.Vector3(Math.cos(this.playerController.yaw), 0, -Math.sin(this.playerController.yaw));
    const angle = Math.atan2(direction.dot(right), direction.dot(forward));
    this.ui.showDamage(angle);
    this.playerController.addDamageShake(damage);
  }

  private handleRoundEnd(humansWon: boolean): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.setEnabled(false);
    this.ui.showResult(humansWon, this.mode.player, this.mode.humanCount, this.mode.playerSurvivalSeconds);
  }

  private handleBombRoundEnd(result: BombRoundResult): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.setEnabled(false);
    this.ui.showBombResult(result, this.bombMode.player, this.bombMode.playerSurvivalSeconds);
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.qaMode) {
      this.qaFrameCount += 1;
      this.qaFrameTime += delta;
      if (this.qaFrameTime >= 2) {
        document.body.dataset.qaFps = (this.qaFrameCount / this.qaFrameTime).toFixed(1);
        this.qaFrameCount = 0;
        this.qaFrameTime = 0;
      }
      document.body.dataset.qaPhase = this.mode.phase;
      document.body.dataset.qaRole = this.mode.characters.length ? this.mode.player.role : 'none';
      document.body.dataset.qaHumans = String(this.mode.humanCount);
      document.body.dataset.qaInfected = String(this.mode.infectedCount);
      document.body.dataset.qaPending = String(this.mode.pendingInfectionCount);
      document.body.dataset.qaPlayerHealth = this.mode.characters.length ? this.mode.player.health.toFixed(1) : '0';
      document.body.dataset.qaPlayerAlive = String(this.mode.characters.length > 0 && this.mode.player.alive);
      document.body.dataset.qaPlayerPosition = this.mode.characters.length
        ? this.mode.player.position.toArray().map((value) => value.toFixed(2)).join(',')
        : '0,0,0';
      document.body.dataset.qaPlayerYaw = (this.playerController?.yaw ?? 0).toFixed(3);
      document.body.dataset.qaWeaponVisible = String(this.weapons?.visible ?? false);
      document.body.dataset.qaMap = this.map.currentMap;
      document.body.dataset.qaMode = this.mode instanceof BombMode ? 'bomb' : 'bio';
      document.body.dataset.qaAiStates = this.mode.aiControllers.map((controller) => controller.state).join(',');
      if (this.mode instanceof BombMode) {
        const bomb = this.mode.hudState;
        document.body.dataset.qaBombRound = String(bomb.roundNumber);
        document.body.dataset.qaBombScore = `${bomb.attackerScore}:${bomb.defenderScore}`;
        document.body.dataset.qaBombPlanted = String(bomb.planted);
        document.body.dataset.qaBombInteraction = bomb.interactionProgress.toFixed(2);
        document.body.dataset.qaBombPlayerTeam = this.mode.player.team;
      } else {
        delete document.body.dataset.qaBombRound;
        delete document.body.dataset.qaBombScore;
        delete document.body.dataset.qaBombPlanted;
        delete document.body.dataset.qaBombInteraction;
        delete document.body.dataset.qaBombPlayerTeam;
      }
    }
    this.ui.update(delta);

    if (this.mode.phase === GamePhase.Menu) {
      this.updateMenuCamera(delta);
    } else {
      const locked = document.pointerLockElement === this.canvas;
      const playablePhase = this.mode.phase === GamePhase.Countdown || this.mode.phase === GamePhase.Active;
      const canLook = locked
        && this.mode.player.alive
        && this.mode.player.stunRemaining <= 0
        && playablePhase;
      const bombCanMove = !(this.mode instanceof BombMode) || this.mode.canPlayerMove;
      const canMove = canLook && bombCanMove;
      const simulationDelta = this.mode instanceof BombMode && this.mode.phase === GamePhase.Active
        ? Math.min(delta, this.mode.actionTimeRemaining)
        : delta;
      this.playerController?.update(simulationDelta, canMove, canLook);
      const canPlayerAttack = !(this.mode instanceof BombMode) || this.mode.canPlayerAttack;
      this.weapons?.update(simulationDelta, locked && canPlayerAttack && this.mode.phase === GamePhase.Active && this.mode.player.stunRemaining <= 0);
      this.mode.update(simulationDelta);
      if (this.mode.phase !== GamePhase.Ended) {
        if (this.mode instanceof BombMode) {
          this.ui.updateBombHUD(
            this.mode.player,
            this.weapons?.current ?? null,
            this.mode.roundRemaining,
            this.mode.countdownRemaining,
            this.mode.phase,
            this.mode.humanCount,
            this.mode.infectedCount,
            this.weapons?.spreadVisual ?? 0,
            this.mode.hudState,
          );
        } else {
          this.ui.updateHUD(
            this.mode.player,
            this.weapons?.current ?? null,
            this.mode.roundRemaining,
            this.mode.countdownRemaining,
            this.mode.phase,
            this.mode.humanCount,
            this.mode.infectedCount,
            this.weapons?.spreadVisual ?? 0,
          );
        }
        this.ui.updateRadar(this.mode.player, this.mode.characters, this.playerController?.yaw ?? 0);
      }
    }

    this.scene.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private updateMenuCamera(delta: number): void {
    this.menuTime += delta * 0.12;
    const x = 23 + Math.sin(this.menuTime) * 4;
    const z = 22 + Math.cos(this.menuTime * 0.8) * 5;
    this.camera.position.set(x, 8.5, z);
    this.camera.lookAt(2, 2.2, 0);
  }
}
