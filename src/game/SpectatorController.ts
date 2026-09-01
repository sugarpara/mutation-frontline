import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { Character } from './Character';
import type { CollisionWorld } from './CollisionWorld';
import type { InputManager } from './InputManager';
import { PlayerCameraState, Team, type GameModeId } from './types';

const DEATH_TRANSITION_SECONDS = 0.8;
const RESPAWN_FADE_SECONDS = 0.36;

export class SpectatorController {
  state = PlayerCameraState.Playing;
  private mode: GameModeId | null = null;
  private observedTeam: Team | null = null;
  private currentTarget: Character | null = null;
  private lastRosterIndex = -1;
  private transitionRemaining = 0;
  private respawnRemaining = 0;
  private readonly deathStart = new THREE.Vector3();
  private readonly deathEnd = new THREE.Vector3();
  private deathStartYaw = 0;
  private deathStartPitch = 0;
  private spectatorYaw = 0;
  private safeView = false;
  private readonly hiddenCharacters = new Set<Character>();
  private readonly baseFov: number;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly collision: CollisionWorld,
    private readonly getCharacters: () => Character[],
  ) {
    this.baseFov = camera.fov;
  }

  get target(): Character | null { return this.currentTarget; }
  get team(): Team | null { return this.observedTeam; }
  get gameMode(): GameModeId | null { return this.mode; }
  get isSafeView(): boolean { return this.safeView; }
  get yaw(): number { return this.spectatorYaw; }
  get ownsCamera(): boolean {
    return this.state === PlayerCameraState.DeathTransition
      || this.state === PlayerCameraState.Spectating
      || this.state === PlayerCameraState.RoundEnded;
  }

  beginDeath(mode: GameModeId, team: Team): void {
    if (this.state === PlayerCameraState.DeathTransition || this.state === PlayerCameraState.Spectating) return;
    this.restoreHiddenCharacters();
    this.mode = mode;
    this.observedTeam = mode === 'bio' ? Team.Infected : team;
    this.currentTarget = null;
    this.lastRosterIndex = -1;
    this.safeView = false;
    this.state = PlayerCameraState.DeathTransition;
    this.transitionRemaining = DEATH_TRANSITION_SECONDS;
    this.deathStart.copy(this.camera.position);
    this.deathEnd.copy(this.camera.position).add(new THREE.Vector3(0, -0.34, 0));
    this.deathStartYaw = this.camera.rotation.y;
    this.deathStartPitch = this.camera.rotation.x;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.input.clearState();
  }

  beginRespawn(): void {
    this.restoreHiddenCharacters();
    this.mode = null;
    this.observedTeam = null;
    this.currentTarget = null;
    this.safeView = false;
    this.state = PlayerCameraState.Respawning;
    this.respawnRemaining = RESPAWN_FADE_SECONDS;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.input.clearState();
  }

  endRound(): void {
    this.restoreHiddenCharacters();
    this.mode = null;
    this.observedTeam = null;
    this.currentTarget = null;
    this.safeView = false;
    this.state = PlayerCameraState.RoundEnded;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.placeSafeCamera();
    this.input.clearState();
  }

  reset(): void {
    this.restoreHiddenCharacters();
    this.mode = null;
    this.observedTeam = null;
    this.currentTarget = null;
    this.lastRosterIndex = -1;
    this.transitionRemaining = 0;
    this.respawnRemaining = 0;
    this.safeView = false;
    this.state = PlayerCameraState.Playing;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.input.clearState();
  }

  update(delta: number): void {
    if (this.state !== PlayerCameraState.Playing) this.input.consumeMouseDelta();
    if (this.state === PlayerCameraState.DeathTransition) {
      this.updateDeathTransition(delta);
      return;
    }
    if (this.state === PlayerCameraState.Spectating) {
      this.updateSpectating(delta);
      return;
    }
    if (this.state === PlayerCameraState.Respawning) {
      this.respawnRemaining = Math.max(0, this.respawnRemaining - delta);
      if (this.respawnRemaining === 0) this.state = PlayerCameraState.Playing;
    }
  }

  private updateDeathTransition(delta: number): void {
    this.transitionRemaining = Math.max(0, this.transitionRemaining - delta);
    const progress = 1 - this.transitionRemaining / DEATH_TRANSITION_SECONDS;
    const eased = progress * progress * (3 - 2 * progress);
    this.camera.position.lerpVectors(this.deathStart, this.deathEnd, eased);
    const targetPitch = THREE.MathUtils.clamp(this.deathStartPitch + 0.1, -1.48, 1.48);
    this.camera.rotation.set(
      THREE.MathUtils.lerp(this.deathStartPitch, targetPitch, eased),
      this.deathStartYaw,
      0,
      'YXZ',
    );
    if (this.transitionRemaining > 0) return;
    this.state = PlayerCameraState.Spectating;
    this.selectTarget(1);
  }

  private updateSpectating(delta: number): void {
    const wantsNext = this.input.consumeMousePress(0) || this.input.consumePress('ArrowRight');
    const wantsPrevious = this.input.consumeMousePress(2) || this.input.consumePress('ArrowLeft');
    if (wantsNext) this.selectTarget(1);
    else if (wantsPrevious) this.selectTarget(-1);
    else if (!this.isValidTarget(this.currentTarget)) this.selectTarget(1);
    else if (this.safeView && this.candidates().length > 0) this.selectTarget(1);

    if (!this.currentTarget) {
      if (!this.safeView) this.enterSafeView();
      else this.hideCharactersForSafeView();
      return;
    }

    const targetYaw = this.currentTarget.mesh.rotation.y + Math.PI;
    const yawDelta = Math.atan2(Math.sin(targetYaw - this.spectatorYaw), Math.cos(targetYaw - this.spectatorYaw));
    this.spectatorYaw += yawDelta * (1 - Math.exp(-delta * 15));
    const eyeHeight = this.spectatorEyeHeight(this.currentTarget);
    this.camera.position.copy(this.currentTarget.position).add(new THREE.Vector3(0, eyeHeight, 0));
    this.camera.rotation.set(0, this.spectatorYaw, 0, 'YXZ');
  }

  private selectTarget(direction: 1 | -1): void {
    const characters = this.getCharacters();
    const candidates = this.candidates();
    const previousIndex = this.currentTarget ? characters.indexOf(this.currentTarget) : this.lastRosterIndex;
    this.restoreHiddenCharacters();

    if (!candidates.length) {
      this.currentTarget = null;
      this.lastRosterIndex = previousIndex;
      this.enterSafeView();
      return;
    }

    let next: Character | undefined;
    if (direction > 0) {
      next = candidates.find((candidate) => characters.indexOf(candidate) > previousIndex) ?? candidates[0];
    } else {
      next = [...candidates].reverse().find((candidate) => characters.indexOf(candidate) < previousIndex) ?? candidates[candidates.length - 1];
    }
    this.currentTarget = next;
    this.lastRosterIndex = characters.indexOf(next);
    this.safeView = false;
    this.hideCharacter(next);
    this.spectatorYaw = next.mesh.rotation.y + Math.PI;
    const eyeHeight = this.spectatorEyeHeight(next);
    this.camera.position.copy(next.position).add(new THREE.Vector3(0, eyeHeight, 0));
    this.camera.rotation.set(0, this.spectatorYaw, 0, 'YXZ');
  }

  private candidates(): Character[] {
    if (!this.observedTeam) return [];
    return this.getCharacters().filter((character) => {
      if (character.isPlayer || !character.alive || character.team !== this.observedTeam) return false;
      if (this.mode === 'bio') return character.team === Team.Infected;
      return character.team === Team.Attackers || character.team === Team.Defenders;
    });
  }

  private isValidTarget(target: Character | null): target is Character {
    return target !== null && this.candidates().includes(target);
  }

  private enterSafeView(): void {
    this.restoreHiddenCharacters();
    this.hideCharactersForSafeView();
    this.currentTarget = null;
    this.safeView = true;

    this.placeSafeCamera();
  }

  private placeSafeCamera(): void {
    const lookAt = new THREE.Vector3(0, 2.2, 0);
    const candidates = [
      new THREE.Vector3(0, 24, 27),
      new THREE.Vector3(-30, 22, 0),
      new THREE.Vector3(30, 22, 0),
      new THREE.Vector3(0, 26, -27),
      new THREE.Vector3(0, 30, 0),
    ];
    const position = candidates.find((candidate) => !this.collision.obstacles.some((obstacle) => obstacle.box.containsPoint(candidate))) ?? candidates[4];
    const ground = this.collision.getGroundHeight(position.x, position.z, position.y);
    this.camera.position.copy(position).setY(Math.max(position.y, ground + 4));
    this.camera.lookAt(lookAt);
    this.camera.rotation.order = 'YXZ';
    this.spectatorYaw = this.camera.rotation.y;
  }

  private hideCharactersForSafeView(): void {
    this.getCharacters().forEach((character) => {
      if (!character.isPlayer && character.alive) this.hideCharacter(character);
    });
  }

  private spectatorEyeHeight(target: Character): number {
    return Math.min(GAME_CONFIG.eyeHeight * Math.max(1, target.mesh.scale.y), 1.78);
  }

  private hideCharacter(character: Character): void {
    character.mesh.visible = false;
    this.hiddenCharacters.add(character);
  }

  private restoreHiddenCharacters(): void {
    this.hiddenCharacters.forEach((character) => {
      character.mesh.visible = character.alive && !character.isPlayer;
    });
    this.hiddenCharacters.clear();
  }
}
