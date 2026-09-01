import * as THREE from 'three';
import { AudioManager } from './AudioManager';
import { Character } from './Character';
import { WEAPONS } from './config';
import { CollisionWorld } from './CollisionWorld';
import { InputManager } from './InputManager';
import { CharacterRole, Team, WeaponKind, type DamageResult, type WeaponRuntime } from './types';
import { WeaponViewModel } from './weapons/WeaponViewModel';

interface WeaponCallbacks {
  getCharacters: () => Character[];
  applyDamage: (attacker: Character, target: Character, damage: number, headshot: boolean) => DamageResult;
  onHit: (headshot: boolean) => void;
  onWeaponChanged: (slot: number) => void;
  addRecoil: (amount: number) => void;
  muzzleFlashEnabled: () => boolean;
}

export class WeaponSystem {
  private readonly runtimes = new Map<WeaponKind, WeaponRuntime>();
  private currentKind = WeaponKind.Rifle;
  private readonly raycaster = new THREE.Raycaster();
  private readonly viewModel: WeaponViewModel;
  private pendingMelee: { remaining: number; runtime: WeaponRuntime } | null = null;
  private qaShowcase = false;
  private qaTime = 0;
  private qaCycle = -1;
  private qaShotIndex = -1;
  private qaReloadStarted = false;
  spreadVisual = 0;

  constructor(
    private readonly owner: Character,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    private readonly input: InputManager,
    private readonly collision: CollisionWorld,
    private readonly audio: AudioManager,
    private readonly callbacks: WeaponCallbacks,
  ) {
    Object.values(WEAPONS).forEach((definition) => {
      this.runtimes.set(definition.kind, {
        definition,
        ammo: definition.magazine,
        reserve: definition.reserve,
        cooldown: 0,
        reloadRemaining: 0,
      });
    });
    this.viewModel = new WeaponViewModel(this.camera, this.scene, this.collision);
    this.syncRole();
  }

  get current(): WeaponRuntime { return this.runtimes.get(this.currentKind)!; }

  startQaShowcase(): void {
    this.qaShowcase = true;
    this.qaTime = 0;
    this.qaCycle = -1;
    this.qaShotIndex = -1;
    this.qaReloadStarted = false;
  }

  update(delta: number, canAttack: boolean): void {
    for (const runtime of this.runtimes.values()) {
      runtime.cooldown = Math.max(0, runtime.cooldown - delta);
      if (runtime.reloadRemaining > 0) {
        runtime.reloadRemaining = Math.max(0, runtime.reloadRemaining - delta);
        if (runtime.reloadRemaining === 0) this.finishReload(runtime);
      }
    }
    this.spreadVisual = THREE.MathUtils.lerp(this.spreadVisual, 0, 1 - Math.exp(-delta * 6));
    const horizontalSpeed = Math.hypot(this.owner.velocity.x, this.owner.velocity.z);
    const ground = this.collision.getGroundHeight(this.owner.position.x, this.owner.position.z, this.owner.position.y);
    const cameraOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const cameraDirection = this.camera.getWorldDirection(new THREE.Vector3());
    const qaState = this.updateQaShowcase(delta);
    const reloadProgress = this.current.reloadRemaining > 0
      ? 1 - this.current.reloadRemaining / this.current.definition.reloadTime
      : null;
    this.viewModel.update(delta, {
      moving: qaState?.moving ?? horizontalSpeed > 0.2,
      sprinting: qaState?.sprinting ?? (horizontalSpeed > this.owner.speed * 1.12 && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'))),
      airborne: qaState?.airborne ?? (this.owner.position.y > ground + 0.055 || Math.abs(this.owner.velocity.y) > 0.38),
      verticalVelocity: qaState?.verticalVelocity ?? this.owner.velocity.y,
      wallDistance: qaState?.wallDistance ?? this.collision.firstHitDistance(cameraOrigin, cameraDirection, 2.1),
      reloadProgress,
    });

    if (this.pendingMelee && canAttack && this.owner.alive && this.owner.stunRemaining <= 0) {
      this.pendingMelee.remaining = Math.max(0, this.pendingMelee.remaining - delta);
      if (this.pendingMelee.remaining === 0) {
        const hit = this.meleeAttack(this.pendingMelee.runtime);
        this.pendingMelee = null;
        if (hit) this.audio.meleeHit();
        else this.audio.meleeMiss();
      }
    }

    if (!canAttack || !this.owner.alive || this.owner.stunRemaining > 0) return;
    this.handleWeaponSwitch();
    if (this.input.consumePress('KeyR')) this.reload();
    const runtime = this.current;
    const wantsFire = runtime.definition.automatic ? this.input.isMouseDown(0) : this.input.consumeMousePress(0);
    if (wantsFire) this.fire();
  }

  private updateQaShowcase(delta: number): { moving: boolean; sprinting: boolean; airborne: boolean; verticalVelocity: number; wallDistance: number } | null {
    if (!this.qaShowcase) return null;
    this.qaTime += delta;
    const duration = 7.6;
    const cycle = Math.floor(this.qaTime / duration);
    const phase = this.qaTime % duration;
    if (cycle !== this.qaCycle) {
      this.qaCycle = cycle;
      this.qaShotIndex = -1;
      this.qaReloadStarted = false;
      this.current.reloadRemaining = 0;
      this.current.ammo = this.current.definition.magazine;
      this.current.reserve = this.current.definition.reserve;
      this.viewModel.equip(WeaponKind.Rifle);
    }
    const shotIndex = phase >= 3 && phase < 3.58 ? Math.floor((phase - 3) / 0.145) : -1;
    if (shotIndex >= 0 && shotIndex !== this.qaShotIndex) {
      this.qaShotIndex = shotIndex;
      this.fire();
    }
    if (phase >= 3.82 && !this.qaReloadStarted) {
      this.qaReloadStarted = true;
      this.current.ammo = 5;
      this.reload();
    }
    let label = 'idle';
    if (phase >= 1.1 && phase < 2.05) label = 'walk';
    else if (phase >= 2.05 && phase < 2.9) label = 'sprint';
    else if (phase >= 3 && phase < 3.7) label = 'fire';
    else if (phase >= 3.82 && phase < 5.85) label = 'reload';
    else if (phase >= 5.85 && phase < 6.7) label = phase < 6.32 ? 'jump' : 'land';
    else if (phase >= 6.7) label = 'wall';
    document.body.dataset.weaponQaPhase = label;
    const airborne = phase >= 5.85 && phase < 6.48;
    return {
      moving: (phase >= 1.1 && phase < 2.9),
      sprinting: phase >= 2.05 && phase < 2.9,
      airborne,
      verticalVelocity: airborne ? Math.cos(((phase - 5.85) / 0.63) * Math.PI) * 5.5 : 0,
      wallDistance: phase >= 6.7 ? 0.48 : 2.1,
    };
  }

  syncRole(): void {
    this.pendingMelee = null;
    if (this.owner.team === Team.Infected) this.currentKind = WeaponKind.Claws;
    else if (this.owner.role === CharacterRole.Hero) this.currentKind = WeaponKind.HeroHmg;
    else this.currentKind = WeaponKind.Rifle;
    const runtime = this.current;
    if (runtime.definition.magazine > 0 && runtime.ammo <= 0 && runtime.reserve <= 0) {
      runtime.ammo = runtime.definition.magazine;
      runtime.reserve = runtime.definition.reserve;
    }
    this.viewModel.equip(this.currentKind);
    this.callbacks.onWeaponChanged(this.slotForKind(this.currentKind));
  }

  reset(): void {
    this.pendingMelee = null;
    for (const runtime of this.runtimes.values()) {
      runtime.ammo = runtime.definition.magazine;
      runtime.reserve = runtime.definition.reserve;
      runtime.cooldown = 0;
      runtime.reloadRemaining = 0;
    }
    this.syncRole();
  }

  equipPreferred(kind: WeaponKind): void {
    if (this.owner.team === Team.Infected || ![WeaponKind.Rifle, WeaponKind.Pistol, WeaponKind.Knife].includes(kind)) return;
    this.switchWeapon(kind, this.slotForKind(kind));
  }

  dispose(): void {
    this.viewModel.dispose();
  }

  setVisible(visible: boolean): void {
    this.viewModel.root.visible = visible;
  }

  private handleWeaponSwitch(): void {
    if (this.owner.team === Team.Infected || this.owner.role === CharacterRole.Hero) return;
    if (this.input.consumePress('Digit1')) this.switchWeapon(WeaponKind.Rifle, 1);
    if (this.input.consumePress('Digit2')) this.switchWeapon(WeaponKind.Pistol, 2);
    if (this.input.consumePress('Digit3')) this.switchWeapon(WeaponKind.Knife, 3);
  }

  private switchWeapon(kind: WeaponKind, slot: number): void {
    if (this.currentKind === kind) return;
    this.current.reloadRemaining = 0;
    this.currentKind = kind;
    this.viewModel.equip(kind);
    this.callbacks.onWeaponChanged(slot);
  }

  private reload(): void {
    const runtime = this.current;
    const definition = runtime.definition;
    if (definition.magazine === 0 || runtime.reloadRemaining > 0 || runtime.ammo >= definition.magazine || runtime.reserve <= 0) return;
    this.viewModel.startReload(runtime.ammo === 0);
    runtime.reloadRemaining = definition.reloadTime;
    this.audio.reload();
  }

  private finishReload(runtime: WeaponRuntime): void {
    const needed = runtime.definition.magazine - runtime.ammo;
    const transfer = Math.min(needed, runtime.reserve);
    runtime.ammo += transfer;
    runtime.reserve -= transfer;
  }

  private fire(): void {
    const runtime = this.current;
    const definition = runtime.definition;
    if (runtime.cooldown > 0 || runtime.reloadRemaining > 0) return;
    if (definition.magazine > 0 && runtime.ammo <= 0) {
      this.reload();
      return;
    }
    runtime.cooldown = definition.fireInterval;
    if (definition.magazine > 0) runtime.ammo -= 1;
    this.owner.stats.shots += 1;
    this.spreadVisual = Math.min(1, this.spreadVisual + definition.recoil * 8 + 0.08);
    this.callbacks.addRecoil(definition.recoil);

    if (definition.kind === WeaponKind.Knife || definition.kind === WeaponKind.Claws) {
      this.viewModel.fire(false);
      this.audio.meleeSwing();
      this.pendingMelee = {
        remaining: definition.kind === WeaponKind.Claws ? 0.24 : 0.12,
        runtime,
      };
      return;
    }

    const soundType = definition.kind === WeaponKind.Pistol ? 'pistol' : definition.kind === WeaponKind.HeroHmg ? 'hmg' : 'rifle';
    this.audio.shoot(soundType);
    this.viewModel.fire(this.callbacks.muzzleFlashEnabled());
    this.fireRay(runtime);
  }

  private fireRay(runtime: WeaponRuntime): void {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const sustained = this.spreadVisual * runtime.definition.spread;
    direction
      .addScaledVector(right, (Math.random() - 0.5) * (runtime.definition.spread + sustained))
      .addScaledVector(up, (Math.random() - 0.5) * (runtime.definition.spread + sustained))
      .normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.far = runtime.definition.range;

    const wallDistance = this.collision.firstHitDistance(origin, direction, runtime.definition.range);
    let nearest: { target: Character; point: THREE.Vector3; distance: number; headshot: boolean } | null = null;
    for (const target of this.callbacks.getCharacters()) {
      if (!target.alive || target.team === this.owner.team || target === this.owner) continue;
      const intersections = this.raycaster.intersectObjects(target.hitMeshes, false);
      const hit = intersections.find((intersection) => intersection.distance < wallDistance);
      if (!hit || (nearest && hit.distance >= nearest.distance)) continue;
      nearest = {
        target,
        point: hit.point.clone(),
        distance: hit.distance,
        headshot: hit.object.userData.hitPart === 'head',
      };
    }

    let end = origin.clone().addScaledVector(direction, wallDistance);
    if (nearest) {
      end = nearest.point;
      const damage = runtime.definition.damage * (nearest.headshot ? runtime.definition.headMultiplier : 1);
      const result = this.callbacks.applyDamage(this.owner, nearest.target, damage, nearest.headshot);
      if (result.applied) {
        this.owner.stats.hits += 1;
        this.callbacks.onHit(nearest.headshot);
        this.audio.hit(nearest.headshot);
      }
    }
    this.spawnTracer(origin, end, runtime.definition.kind === WeaponKind.HeroHmg ? 0xffd45b : 0x72eaff);
  }

  private meleeAttack(runtime: WeaponRuntime): boolean {
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    let best: Character | null = null;
    let bestDistance = runtime.definition.range;
    for (const target of this.callbacks.getCharacters()) {
      if (!target.alive || target.team === this.owner.team || target === this.owner) continue;
      const targetPoint = target.position.clone().add(new THREE.Vector3(0, 1, 0));
      const delta = targetPoint.sub(origin);
      const distance = delta.length();
      if (distance >= bestDistance || direction.dot(delta.normalize()) < 0.48) continue;
      if (this.collision.lineBlocked(origin, target.position.clone().add(new THREE.Vector3(0, 1, 0)))) continue;
      best = target;
      bestDistance = distance;
    }
    if (!best) return false;
    const result = this.callbacks.applyDamage(this.owner, best, runtime.definition.damage, false);
    if (result.applied) {
      this.owner.stats.hits += 1;
      this.callbacks.onHit(false);
      this.audio.hit(false);
    }
    return result.applied;
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    window.setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 55);
  }

  private slotForKind(kind: WeaponKind): number {
    if (kind === WeaponKind.Pistol) return 2;
    if (kind === WeaponKind.Knife || kind === WeaponKind.Claws) return 3;
    return 1;
  }
}
