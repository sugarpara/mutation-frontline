import * as THREE from 'three';
import { CollisionWorld } from '../CollisionWorld';
import { RIFLE_VIEW_CONFIG } from './viewModelConfig';

interface ActiveCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  age: number;
  bounced: boolean;
}

export class ShellCasingSystem {
  private readonly casings: ActiveCasing[] = [];
  private readonly geometry = new THREE.CylinderGeometry(0.014, 0.018, 0.064, 8, 1, false);
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xa87432, roughness: 0.34, metalness: 0.8 });

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collision: CollisionWorld,
  ) {}

  spawn(ejectionPort: THREE.Object3D): void {
    ejectionPort.updateWorldMatrix(true, false);
    const position = ejectionPort.getWorldPosition(new THREE.Vector3());
    const orientation = ejectionPort.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
    const rear = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.name = 'Ejected Rifle Casing';
    mesh.position.copy(position).addScaledVector(right, 0.035);
    mesh.quaternion.copy(orientation);
    mesh.rotateX(Math.random() * Math.PI);
    mesh.rotateZ(Math.random() * Math.PI);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.casings.push({
      mesh,
      velocity: right.multiplyScalar(2.15 + Math.random() * 0.85)
        .addScaledVector(up, 1.25 + Math.random() * 0.75)
        .addScaledVector(rear, 0.25 + Math.random() * 0.35),
      angularVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 20,
      ),
      life: RIFLE_VIEW_CONFIG.shellLifetime,
      age: 0,
      bounced: false,
    });
  }

  update(delta: number): void {
    for (let index = this.casings.length - 1; index >= 0; index -= 1) {
      const casing = this.casings[index];
      casing.life -= delta;
      casing.age += delta;
      casing.velocity.y -= 9.8 * delta;
      const movement = casing.velocity.clone().multiplyScalar(delta);
      const distance = movement.length();
      if (distance > 0.0001 && casing.age > 0.04) {
        const hitDistance = this.collision.firstHitDistance(casing.mesh.position, movement.clone().normalize(), distance + 0.018);
        if (hitDistance < distance + 0.018) {
          casing.velocity.x *= -0.32;
          casing.velocity.z *= -0.32;
          casing.velocity.y *= 0.52;
          movement.multiplyScalar(0.2);
        }
      }
      casing.mesh.position.add(movement);
      casing.mesh.rotation.x += casing.angularVelocity.x * delta;
      casing.mesh.rotation.y += casing.angularVelocity.y * delta;
      casing.mesh.rotation.z += casing.angularVelocity.z * delta;

      const ground = this.collision.getGroundHeight(casing.mesh.position.x, casing.mesh.position.z, casing.mesh.position.y);
      if (casing.mesh.position.y <= ground + 0.025) {
        casing.mesh.position.y = ground + 0.025;
        if (Math.abs(casing.velocity.y) > 0.32) {
          casing.velocity.y = Math.abs(casing.velocity.y) * (casing.bounced ? 0.18 : 0.32);
          casing.velocity.x *= 0.62;
          casing.velocity.z *= 0.62;
          casing.angularVelocity.multiplyScalar(0.72);
          casing.bounced = true;
        } else {
          casing.velocity.set(0, 0, 0);
          casing.angularVelocity.multiplyScalar(Math.max(0, 1 - delta * 5));
        }
      }
      if (casing.life <= 0) {
        this.scene.remove(casing.mesh);
        this.casings.splice(index, 1);
      }
    }
  }

  dispose(): void {
    this.casings.forEach((casing) => this.scene.remove(casing.mesh));
    this.casings.length = 0;
    this.geometry.dispose();
    this.material.dispose();
  }
}
