import * as THREE from 'three';
import { RIFLE_VIEW_CONFIG } from './viewModelConfig';
import { RifleModel } from './RifleModel';

export interface WeaponMotionState {
  moving: boolean;
  sprinting: boolean;
  airborne: boolean;
  verticalVelocity: number;
  wallDistance: number;
  reloadProgress: number | null;
}

export class WeaponAnimator {
  private time = 0;
  private equipTime = 0;
  private recoilImpulse = 0;
  private boltImpulse = 0;
  private landingImpulse = 0;
  private sprintBlend = 0;
  private moveBlend = 0;
  private wallBlend = 0;
  private wasAirborne = false;
  private reloadWasEmpty = false;
  private recoilRoll = 0;
  private readonly targetPosition = new THREE.Vector3();
  private readonly targetRotation = new THREE.Euler(0, 0, 0, 'XYZ');

  constructor(
    private readonly poseRoot: THREE.Group,
    private readonly rifle: RifleModel,
  ) {
    this.reset();
  }

  reset(): void {
    const config = RIFLE_VIEW_CONFIG;
    this.time = 0;
    this.equipTime = 0;
    this.recoilImpulse = 0;
    this.boltImpulse = 0;
    this.landingImpulse = 0;
    this.sprintBlend = 0;
    this.moveBlend = 0;
    this.wallBlend = 0;
    this.wasAirborne = false;
    this.poseRoot.position.set(config.basePosition.x, config.basePosition.y - 0.5, config.basePosition.z + 0.08);
    this.poseRoot.rotation.set(config.baseRotation.x + 0.26, config.baseRotation.y, config.baseRotation.z + 0.08);
    this.rifle.resetAnimatedParts();
  }

  equip(): void {
    this.equipTime = 0;
  }

  fire(): void {
    const recoil = RIFLE_VIEW_CONFIG.recoil;
    this.recoilImpulse = Math.min(recoil.maximum, this.recoilImpulse + recoil.accumulation);
    this.boltImpulse = 1;
    this.recoilRoll = (Math.random() - 0.5) * recoil.roll;
  }

  startReload(wasEmpty: boolean): void {
    this.reloadWasEmpty = wasEmpty;
  }

  update(delta: number, state: WeaponMotionState): void {
    const config = RIFLE_VIEW_CONFIG;
    this.time += delta;
    this.equipTime = Math.min(config.equipDuration, this.equipTime + delta);
    this.recoilImpulse = this.damp(this.recoilImpulse, 0, config.recoil.recovery, delta);
    this.boltImpulse = this.damp(this.boltImpulse, 0, 32, delta);
    this.landingImpulse = this.damp(this.landingImpulse, 0, 12, delta);
    this.moveBlend = this.damp(this.moveBlend, state.moving ? 1 : 0, 9, delta);
    this.sprintBlend = this.damp(this.sprintBlend, state.sprinting ? 1 : 0, 10, delta);
    const wallTarget = THREE.MathUtils.clamp(
      (config.wall.startDistance - state.wallDistance) / (config.wall.startDistance - config.wall.fullDistance),
      0,
      1,
    );
    this.wallBlend = this.damp(this.wallBlend, wallTarget, 12, delta);
    if (this.wasAirborne && !state.airborne) this.landingImpulse = 1;
    this.wasAirborne = state.airborne;

    this.targetPosition.set(config.basePosition.x, config.basePosition.y, config.basePosition.z);
    this.targetRotation.set(config.baseRotation.x, config.baseRotation.y, config.baseRotation.z);
    this.addIdleMotion();
    this.addWalkMotion();
    this.addSprintMotion();
    this.addAirborneMotion(state);
    this.addWallMotion();
    this.addRecoilMotion();
    this.addEquipMotion();

    if (state.reloadProgress !== null) this.addReloadMotion(state.reloadProgress, delta);
    else this.restoreReloadParts(delta);

    const alpha = 1 - Math.exp(-config.smoothing * delta);
    this.poseRoot.position.lerp(this.targetPosition, alpha);
    this.poseRoot.rotation.x = THREE.MathUtils.lerp(this.poseRoot.rotation.x, this.targetRotation.x, alpha);
    this.poseRoot.rotation.y = THREE.MathUtils.lerp(this.poseRoot.rotation.y, this.targetRotation.y, alpha);
    this.poseRoot.rotation.z = THREE.MathUtils.lerp(this.poseRoot.rotation.z, this.targetRotation.z, alpha);

    if (state.reloadProgress === null) {
      this.rifle.bolt.position.copy(this.rifle.boltHome).add(new THREE.Vector3(0, 0, config.reload.boltTravel * this.boltImpulse));
      this.rifle.chargingHandle.position.copy(this.rifle.chargingHandleHome);
    }
  }

  private addIdleMotion(): void {
    const idle = RIFLE_VIEW_CONFIG.idle;
    const breath = this.time * idle.frequency;
    this.targetPosition.x += Math.sin(breath * 0.72) * idle.horizontal;
    this.targetPosition.y += Math.sin(breath) * idle.vertical;
    this.targetRotation.z += Math.sin(breath * 0.68) * idle.roll;
  }

  private addWalkMotion(): void {
    if (this.moveBlend < 0.001) return;
    const walk = RIFLE_VIEW_CONFIG.walk;
    const sprintMultiplier = THREE.MathUtils.lerp(1, RIFLE_VIEW_CONFIG.sprint.swayMultiplier, this.sprintBlend);
    const phase = this.time * walk.frequency * THREE.MathUtils.lerp(1, 1.28, this.sprintBlend);
    this.targetPosition.x += Math.sin(phase) * walk.horizontal * this.moveBlend * sprintMultiplier;
    this.targetPosition.y += Math.abs(Math.cos(phase)) * walk.vertical * this.moveBlend * sprintMultiplier;
    this.targetRotation.z += Math.sin(phase) * walk.roll * this.moveBlend * sprintMultiplier;
    this.targetRotation.x += Math.cos(phase * 2) * walk.pitch * this.moveBlend;
  }

  private addSprintMotion(): void {
    const sprint = RIFLE_VIEW_CONFIG.sprint;
    this.targetPosition.x += sprint.position.x * this.sprintBlend;
    this.targetPosition.y += sprint.position.y * this.sprintBlend;
    this.targetPosition.z += sprint.position.z * this.sprintBlend;
    this.targetRotation.x += sprint.rotation.x * this.sprintBlend;
    this.targetRotation.y += sprint.rotation.y * this.sprintBlend;
    this.targetRotation.z += sprint.rotation.z * this.sprintBlend;
  }

  private addAirborneMotion(state: WeaponMotionState): void {
    const airborne = RIFLE_VIEW_CONFIG.airborne;
    if (state.airborne) {
      this.targetPosition.y += airborne.positionY;
      this.targetPosition.y -= THREE.MathUtils.clamp(state.verticalVelocity * airborne.velocityInfluence, -0.035, 0.035);
      this.targetRotation.x += airborne.pitch;
    }
    this.targetPosition.y -= airborne.landingDrop * this.landingImpulse;
    this.targetRotation.x += airborne.landingPitch * this.landingImpulse;
  }

  private addWallMotion(): void {
    const wall = RIFLE_VIEW_CONFIG.wall;
    this.targetPosition.z += wall.retract * this.wallBlend;
    this.targetRotation.x += wall.lift * this.wallBlend;
    this.targetRotation.y += wall.yaw * this.wallBlend;
  }

  private addRecoilMotion(): void {
    const recoil = RIFLE_VIEW_CONFIG.recoil;
    this.targetPosition.z += recoil.backward * this.recoilImpulse;
    this.targetPosition.y += recoil.upward * this.recoilImpulse;
    this.targetRotation.x += recoil.pitch * this.recoilImpulse;
    this.targetRotation.z += this.recoilRoll * this.recoilImpulse;
  }

  private addEquipMotion(): void {
    const progress = THREE.MathUtils.clamp(this.equipTime / RIFLE_VIEW_CONFIG.equipDuration, 0, 1);
    const inverse = 1 - this.smootherStep(progress);
    this.targetPosition.y -= inverse * 0.5;
    this.targetPosition.z += inverse * 0.08;
    this.targetRotation.x += inverse * 0.26;
    this.targetRotation.z += inverse * 0.08;
  }

  private addReloadMotion(progress: number, delta: number): void {
    const config = RIFLE_VIEW_CONFIG.reload;
    this.rifle.bolt.position.copy(this.rifle.boltHome);
    this.rifle.chargingHandle.position.copy(this.rifle.chargingHandleHome);
    const enter = this.smootherStep(THREE.MathUtils.clamp(progress / 0.16, 0, 1));
    const exit = this.smootherStep(THREE.MathUtils.clamp((progress - 0.82) / 0.18, 0, 1));
    const reloadBlend = enter * (1 - exit);
    this.targetPosition.y -= config.lower * reloadBlend;
    this.targetRotation.z += config.tilt * reloadBlend;
    this.targetRotation.y -= 0.075 * reloadBlend;

    const handAway = progress < 0.68
      ? this.smootherStep(THREE.MathUtils.clamp((progress - 0.08) / 0.18, 0, 1))
      : 1 - this.smootherStep(THREE.MathUtils.clamp((progress - 0.68) / 0.24, 0, 1));
    const handTarget = this.rifle.leftHandHome.clone().add(new THREE.Vector3(
      config.handTravel.x * handAway,
      config.handTravel.y * handAway,
      config.handTravel.z * handAway,
    ));
    this.rifle.leftHand.position.lerp(handTarget, 1 - Math.exp(-18 * delta));
    this.rifle.leftHand.rotation.x = THREE.MathUtils.lerp(this.rifle.leftHand.rotation.x, this.rifle.leftHandHomeRotation.x - 0.3 * handAway, 1 - Math.exp(-16 * delta));
    this.rifle.leftHand.rotation.z = THREE.MathUtils.lerp(this.rifle.leftHand.rotation.z, this.rifle.leftHandHomeRotation.z - 0.42 * handAway, 1 - Math.exp(-16 * delta));

    if (progress < 0.47) {
      const drop = this.smootherStep(THREE.MathUtils.clamp((progress - 0.18) / 0.29, 0, 1));
      this.rifle.magazine.visible = true;
      this.rifle.magazine.position.copy(this.rifle.magazineHome);
      this.rifle.magazine.position.y -= config.magazineDrop * drop;
      this.rifle.magazine.position.z += 0.09 * drop;
      this.rifle.magazine.rotation.x = this.rifle.magazineHomeRotation.x - 0.24 * drop;
      this.rifle.magazine.rotation.z = this.rifle.magazineHomeRotation.z + 0.15 * drop;
    } else {
      const insert = this.smootherStep(THREE.MathUtils.clamp((progress - 0.48) / 0.24, 0, 1));
      this.rifle.magazine.visible = progress >= 0.5;
      this.rifle.magazine.position.copy(this.rifle.magazineHome);
      this.rifle.magazine.position.y -= config.magazineDrop * (1 - insert);
      this.rifle.magazine.position.z += 0.06 * (1 - insert);
      this.rifle.magazine.rotation.x = this.rifle.magazineHomeRotation.x - 0.18 * (1 - insert);
      this.rifle.magazine.rotation.z = this.rifle.magazineHomeRotation.z - 0.12 * (1 - insert);
    }

    if (this.reloadWasEmpty && progress > 0.72 && progress < 0.88) {
      const chargeProgress = Math.sin(((progress - 0.72) / 0.16) * Math.PI);
      this.rifle.chargingHandle.position.copy(this.rifle.chargingHandleHome);
      this.rifle.chargingHandle.position.z += config.boltTravel * chargeProgress;
      this.rifle.bolt.position.copy(this.rifle.boltHome);
      this.rifle.bolt.position.z += config.boltTravel * chargeProgress;
    }
  }

  private restoreReloadParts(delta: number): void {
    const alpha = 1 - Math.exp(-20 * delta);
    this.rifle.magazine.visible = true;
    this.rifle.magazine.position.lerp(this.rifle.magazineHome, alpha);
    this.rifle.magazine.rotation.x = THREE.MathUtils.lerp(this.rifle.magazine.rotation.x, this.rifle.magazineHomeRotation.x, alpha);
    this.rifle.magazine.rotation.y = THREE.MathUtils.lerp(this.rifle.magazine.rotation.y, this.rifle.magazineHomeRotation.y, alpha);
    this.rifle.magazine.rotation.z = THREE.MathUtils.lerp(this.rifle.magazine.rotation.z, this.rifle.magazineHomeRotation.z, alpha);
    this.rifle.leftHand.position.lerp(this.rifle.leftHandHome, alpha);
    this.rifle.leftHand.rotation.x = THREE.MathUtils.lerp(this.rifle.leftHand.rotation.x, this.rifle.leftHandHomeRotation.x, alpha);
    this.rifle.leftHand.rotation.y = THREE.MathUtils.lerp(this.rifle.leftHand.rotation.y, this.rifle.leftHandHomeRotation.y, alpha);
    this.rifle.leftHand.rotation.z = THREE.MathUtils.lerp(this.rifle.leftHand.rotation.z, this.rifle.leftHandHomeRotation.z, alpha);
  }

  private damp(current: number, target: number, lambda: number, delta: number): number {
    return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));
  }

  private smootherStep(value: number): number {
    return value * value * value * (value * (value * 6 - 15) + 10);
  }
}
