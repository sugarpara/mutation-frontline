import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { Character } from './Character';
import { CollisionWorld } from './CollisionWorld';
import { InputManager } from './InputManager';

export class PlayerController {
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  private verticalVelocity = 0;
  private grounded = true;
  private bobTime = 0;
  private recoilKick = 0;
  private cameraShake = 0;
  cameraShakeEnabled = true;

  constructor(
    readonly character: Character,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly collision: CollisionWorld,
  ) {
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.syncCamera();
  }

  update(delta: number, canMove: boolean, canLook = canMove): void {
    const mouse = this.input.consumeMouseDelta();
    if (canLook) {
      this.yaw -= mouse.x * 0.0018 * this.sensitivity;
      this.pitch -= mouse.y * 0.0018 * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.48, 1.48);
    }

    this.recoilKick = THREE.MathUtils.lerp(this.recoilKick, 0, 1 - Math.exp(-delta * 11));
    this.cameraShake = THREE.MathUtils.lerp(this.cameraShake, 0, 1 - Math.exp(-delta * 13));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + (this.cameraShakeEnabled ? Math.sin(performance.now() * 0.047) * this.cameraShake * 0.018 : 0);
    this.camera.rotation.x = this.pitch + this.recoilKick + (this.cameraShakeEnabled ? Math.cos(performance.now() * 0.039) * this.cameraShake * 0.012 : 0);
    this.camera.rotation.z = 0;

    if (!canMove || !this.character.alive) {
      this.character.velocity.set(0, 0, 0);
      this.character.update(delta, false);
      this.syncCamera();
      return;
    }

    const forwardInput = Number(this.input.isDown('KeyW')) - Number(this.input.isDown('KeyS'));
    const rightInput = Number(this.input.isDown('KeyD')) - Number(this.input.isDown('KeyA'));
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    direction.addScaledVector(forward, forwardInput).addScaledVector(right, rightInput);
    if (direction.lengthSq() > 1) direction.normalize();

    const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = this.character.speed * (sprinting && forwardInput > 0 ? GAME_CONFIG.human.sprintMultiplier : 1);
    const horizontalVelocity = direction.multiplyScalar(speed);
    this.character.velocity.set(horizontalVelocity.x, this.verticalVelocity, horizontalVelocity.z);

    const current = this.character.position.clone();
    const desired = current.clone().addScaledVector(horizontalVelocity, delta);
    const resolved = this.collision.resolveCircle(current, desired, GAME_CONFIG.playerRadius);
    this.character.position.x = resolved.x;
    this.character.position.z = resolved.z;

    const ground = this.collision.getGroundHeight(resolved.x, resolved.z, this.character.position.y);
    if (this.grounded && this.input.consumePress('Space')) {
      this.verticalVelocity = GAME_CONFIG.jumpVelocity;
      this.grounded = false;
    }
    this.verticalVelocity -= GAME_CONFIG.gravity * delta;
    this.character.position.y += this.verticalVelocity * delta;
    if (this.character.position.y <= ground) {
      this.character.position.y = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    const moving = horizontalVelocity.lengthSq() > 0.05 && this.grounded;
    if (moving) this.bobTime += delta * (sprinting ? 13 : 9);
    this.character.update(delta, moving);
    this.syncCamera(moving ? Math.sin(this.bobTime) * 0.025 : 0);
  }

  addRecoil(amount: number): void {
    this.recoilKick += amount * (0.72 + Math.random() * 0.45);
    this.yaw += (Math.random() - 0.5) * amount * 0.55;
  }

  addDamageShake(amount: number): void {
    this.cameraShake = Math.min(1, this.cameraShake + amount / 70);
  }

  faceDirection(direction: THREE.Vector3): void {
    this.yaw = Math.atan2(-direction.x, -direction.z);
  }

  private syncCamera(bob = 0): void {
    this.camera.position.set(
      this.character.position.x,
      this.character.position.y + GAME_CONFIG.eyeHeight + bob,
      this.character.position.z,
    );
  }
}
