import * as THREE from 'three';
import { RIFLE_VIEW_CONFIG } from './viewModelConfig';

interface SmokeParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class MuzzleFlash {
  readonly group = new THREE.Group();
  private readonly flameMeshes: THREE.Mesh[] = [];
  private readonly smokeParticles: SmokeParticle[] = [];
  private readonly flashLight = new THREE.PointLight(0xff8a32, 2.8, 4.2, 2);
  private timer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly muzzleAnchor: THREE.Object3D,
  ) {
    this.group.name = 'Rifle Muzzle Flash';
    this.group.visible = false;
    this.group.layers.set(1);
    this.flashLight.layers.set(1);
    this.flashLight.visible = false;
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0xfff1a4, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ color: 0xff8b2c, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ color: 0xff451f, transparent: true, opacity: 0.58, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    ];
    const sizes: Array<[number, number]> = [[0.07, 0.28], [0.11, 0.18], [0.055, 0.36]];
    sizes.forEach(([radius, length], index) => {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 5, 1, true), materials[index]);
      flame.name = `Muzzle Flame ${index + 1}`;
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = -length * 0.48;
      flame.layers.set(1);
      flame.renderOrder = 1200;
      this.group.add(flame);
      this.flameMeshes.push(flame);
    });
    this.muzzleAnchor.add(this.group, this.flashLight);
  }

  fire(showFlash: boolean): void {
    this.muzzleAnchor.updateWorldMatrix(true, false);
    if (showFlash) {
      this.timer = RIFLE_VIEW_CONFIG.muzzleFlashSeconds;
      this.group.visible = true;
      this.flashLight.visible = true;
      this.flameMeshes.forEach((flame, index) => {
        flame.rotation.z = Math.random() * Math.PI;
        flame.scale.set(
          0.7 + Math.random() * 0.65,
          0.82 + Math.random() * 0.5 + index * 0.08,
          0.7 + Math.random() * 0.65,
        );
      });
    }
    if (Math.random() < 0.72) this.spawnSmoke();
  }

  update(delta: number): void {
    this.timer = Math.max(0, this.timer - delta);
    if (this.timer === 0) {
      this.group.visible = false;
      this.flashLight.visible = false;
    }
    for (let index = this.smokeParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.smokeParticles[index];
      particle.life -= delta;
      particle.velocity.y += 0.18 * delta;
      particle.velocity.multiplyScalar(Math.max(0, 1 - delta * 1.2));
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.scale.multiplyScalar(1 + delta * 1.45);
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, (particle.life / particle.maxLife) * 0.24);
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        material.dispose();
        this.smokeParticles.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.timer = 0;
    this.group.visible = false;
    this.flashLight.visible = false;
    this.smokeParticles.forEach((particle) => {
      this.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      (particle.mesh.material as THREE.Material).dispose();
    });
    this.smokeParticles.length = 0;
  }

  dispose(): void {
    this.muzzleAnchor.remove(this.group, this.flashLight);
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.clear();
    this.flashLight.dispose();
  }

  private spawnSmoke(): void {
    const worldPosition = this.muzzleAnchor.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = this.muzzleAnchor.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion);
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.028, 1),
      new THREE.MeshBasicMaterial({ color: 0xaeb6b5, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    mesh.name = 'Muzzle Smoke';
    mesh.position.copy(worldPosition).addScaledVector(forward, 0.08);
    this.scene.add(mesh);
    const life = 0.5 + Math.random() * 0.28;
    this.smokeParticles.push({
      mesh,
      velocity: forward.multiplyScalar(0.24 + Math.random() * 0.18).addScaledVector(up, 0.18 + Math.random() * 0.16),
      life,
      maxLife: life,
    });
  }
}
