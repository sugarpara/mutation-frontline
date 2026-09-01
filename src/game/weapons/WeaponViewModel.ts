import * as THREE from 'three';
import { CollisionWorld } from '../CollisionWorld';
import { WeaponKind } from '../types';
import { MuzzleFlash } from './MuzzleFlash';
import { RifleModel } from './RifleModel';
import { ShellCasingSystem } from './ShellCasing';
import { WeaponAnimator, type WeaponMotionState } from './WeaponAnimator';
import { RIFLE_VIEW_CONFIG } from './viewModelConfig';

export class WeaponViewModel {
  readonly root = new THREE.Group();
  private readonly poseRoot = new THREE.Group();
  private readonly shellCasings: ShellCasingSystem;
  private readonly keyLight = new THREE.PointLight(0xffe5d0, 1.65, 4.5, 1.8);
  private readonly rimLight = new THREE.PointLight(0xff5426, 0.72, 3.2, 2);
  private rifle: RifleModel | null = null;
  private animator: WeaponAnimator | null = null;
  private muzzleEffect: MuzzleFlash | null = null;
  private currentKind = WeaponKind.Rifle;
  private time = 0;
  private genericKick = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    collision: CollisionWorld,
  ) {
    this.root.name = 'First Person Weapon Viewmodel';
    this.poseRoot.name = 'Viewmodel Animated Pose';
    this.root.add(this.poseRoot);
    this.keyLight.position.set(-0.65, 0.65, 0.4);
    this.rimLight.position.set(0.85, -0.15, -1.5);
    this.keyLight.layers.set(1);
    this.rimLight.layers.set(1);
    this.root.add(this.keyLight, this.rimLight);
    this.camera.layers.enable(1);
    this.camera.add(this.root);
    this.shellCasings = new ShellCasingSystem(scene, collision);
  }

  equip(kind: WeaponKind): void {
    this.clearCurrentModel();
    this.currentKind = kind;
    this.time = 0;
    this.genericKick = 0;
    if (kind === WeaponKind.Rifle) {
      this.rifle = new RifleModel();
      this.rifle.root.scale.setScalar(RIFLE_VIEW_CONFIG.modelScale);
      this.poseRoot.add(this.rifle.root);
      this.animator = new WeaponAnimator(this.poseRoot, this.rifle);
      this.muzzleEffect = new MuzzleFlash(this.scene, this.rifle.muzzle);
      this.animator.equip();
      return;
    }
    const muzzle = this.buildGenericModel(kind);
    if (muzzle) this.muzzleEffect = new MuzzleFlash(this.scene, muzzle);
  }

  update(delta: number, state: WeaponMotionState): void {
    this.time += delta;
    this.shellCasings.update(delta);
    this.muzzleEffect?.update(delta);
    if (this.animator) {
      this.animator.update(delta, state);
      return;
    }
    this.updateGenericPose(delta, state);
  }

  fire(showFlash: boolean): void {
    this.animator?.fire();
    this.genericKick = Math.min(1.4, this.genericKick + 0.7);
    this.muzzleEffect?.fire(showFlash);
    if (this.currentKind === WeaponKind.Rifle && this.rifle) this.shellCasings.spawn(this.rifle.ejectionPort);
  }

  startReload(wasEmpty: boolean): void {
    this.animator?.startReload(wasEmpty);
  }

  dispose(): void {
    this.clearCurrentModel();
    this.shellCasings.dispose();
    this.camera.remove(this.root);
    this.keyLight.dispose();
    this.rimLight.dispose();
  }

  private buildGenericModel(kind: WeaponKind): THREE.Object3D | null {
    const infected = kind === WeaponKind.Claws;
    const hero = kind === WeaponKind.HeroHmg;
    const pistol = kind === WeaponKind.Pistol;
    const knife = kind === WeaponKind.Knife;
    const baseColor = infected ? 0x202a29 : hero ? 0x5d5836 : 0x273d49;
    const accentColor = infected ? 0x73ff8d : hero ? 0xffd45b : 0x53d5df;
    const baseMaterial = this.viewMaterial({ color: baseColor, roughness: 0.58, metalness: infected ? 0.05 : 0.64 });
    const accentMaterial = this.viewMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.42, roughness: 0.35, metalness: 0.3 });
    const skinMaterial = this.viewMaterial({ color: infected ? 0x46594e : 0xa87864, roughness: 0.82, metalness: 0.02 });

    if (infected) {
      this.poseRoot.position.set(0, 0, 0);
      this.poseRoot.rotation.set(0, 0, 0);
      const clawArmor = this.viewMaterial({ color: 0x172321, emissive: 0x0a281b, emissiveIntensity: 0.5, roughness: 0.38, metalness: 0.58 });
      const clawFlesh = this.viewMaterial({ color: 0x3e574c, roughness: 0.72, metalness: 0.08 });
      for (const side of [-1, 1]) {
        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.7, 6), clawFlesh);
        forearm.position.set(side * 0.31, -0.49, -0.57);
        forearm.rotation.x = -1.18;
        forearm.rotation.z = side * 0.12;
        this.prepareGenericMesh(forearm);
        const cuff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), clawArmor);
        cuff.position.set(side * 0.31, -0.4, -0.75);
        cuff.scale.set(0.82, 0.62, 1.35);
        cuff.rotation.z = side * 0.12;
        this.prepareGenericMesh(cuff);
        const vein = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.36), accentMaterial);
        vein.position.set(side * 0.31, -0.37, -0.7);
        vein.rotation.x = -0.18;
        this.prepareGenericMesh(vein);
        const palm = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), clawFlesh);
        palm.position.set(side * 0.31, -0.28, -0.94);
        palm.scale.set(0.92, 0.68, 1.2);
        palm.rotation.z = side * 0.08;
        this.prepareGenericMesh(palm);
        for (let index = 0; index < 4; index += 1) {
          const knuckle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 0), clawArmor);
          knuckle.position.set(side * (0.205 + index * 0.058), -0.22, -1.02 - Math.abs(1.5 - index) * 0.012);
          this.prepareGenericMesh(knuckle);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.031, 0.37 + index * 0.018, 5), accentMaterial);
          claw.position.set(side * (0.205 + index * 0.058), -0.2, -1.18 - Math.abs(1.5 - index) * 0.018);
          claw.rotation.x = -Math.PI / 2;
          claw.rotation.z = side * (index - 1.5) * 0.045;
          this.prepareGenericMesh(claw);
        }
        const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 5), accentMaterial);
        thumb.position.set(side * 0.41, -0.34, -1.04);
        thumb.rotation.set(-1.2, 0, side * 0.52);
        this.prepareGenericMesh(thumb);
      }
      return null;
    }

    if (knife) {
      this.poseRoot.position.set(0, 0, 0);
      this.poseRoot.rotation.set(0, 0, 0);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), skinMaterial);
      hand.position.set(0.42, -0.35, -0.65);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.72), accentMaterial);
      blade.position.set(0.35, -0.26, -1.18);
      blade.rotation.x = -0.08;
      this.prepareGenericMesh(hand);
      this.prepareGenericMesh(blade);
      return null;
    }

    if (pistol) {
      const slideMaterial = this.viewMaterial({ color: 0x242b30, roughness: 0.42, metalness: 0.72 });
      const frameMaterial = this.viewMaterial({ color: 0x182126, roughness: 0.7, metalness: 0.28 });
      const gripMaterial = this.viewMaterial({ color: 0x101719, roughness: 0.92, metalness: 0.04 });
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.64), slideMaterial);
      slide.position.set(0.34, -0.37, -0.76);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.42), frameMaterial);
      frame.position.set(0.34, -0.52, -0.61);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.5, 8), slideMaterial);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.34, -0.37, -1.03);
      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.12, 8), slideMaterial);
      muzzleBrake.rotation.x = Math.PI / 2;
      muzzleBrake.position.set(0.34, -0.37, -1.3);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.42, 0.22), gripMaterial);
      grip.position.set(0.34, -0.72, -0.49);
      grip.rotation.x = -0.2;
      const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 5, 10, Math.PI), frameMaterial);
      triggerGuard.position.set(0.34, -0.62, -0.72);
      triggerGuard.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      const energyLine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.28), accentMaterial);
      energyLine.position.set(0.455, -0.405, -0.72);
      const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.05), frameMaterial);
      rearSight.position.set(0.34, -0.235, -0.52);
      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.04), frameMaterial);
      frontSight.position.set(0.34, -0.23, -1.04);
      [slide, frame, barrel, muzzleBrake, grip, triggerGuard, energyLine, rearSight, frontSight].forEach((mesh) => this.prepareGenericMesh(mesh));
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.34, -0.37, -1.39);
      muzzle.layers.set(1);
      this.poseRoot.add(muzzle);
      return muzzle;
    }

    const width = 0.34;
    const length = 1.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.34, length), baseMaterial);
    body.position.set(0.42, hero ? -0.48 : -0.34, -1.28);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, 0.07, length * 0.7), accentMaterial);
    rail.position.set(body.position.x, body.position.y + 0.2, body.position.z - 0.05);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.21), baseMaterial);
    grip.position.set(body.position.x, body.position.y - 0.28, body.position.z + length * 0.2);
    grip.rotation.x = -0.24;
    this.prepareGenericMesh(body);
    this.prepareGenericMesh(rail);
    this.prepareGenericMesh(grip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(body.position.x, body.position.y, body.position.z - length * 0.55);
    muzzle.layers.set(1);
    this.poseRoot.add(muzzle);
    return muzzle;
  }

  private updateGenericPose(delta: number, state: WeaponMotionState): void {
    this.genericKick = THREE.MathUtils.lerp(this.genericKick, 0, 1 - Math.exp(-delta * 14));
    const moving = state.moving ? 1 : 0;
    const sprint = state.sprinting ? 1 : 0;
    const reload = state.reloadProgress === null ? 0 : Math.sin(state.reloadProgress * Math.PI);
    const x = Math.sin(this.time * 8.4) * 0.014 * moving;
    const y = Math.abs(Math.cos(this.time * 8.4)) * 0.012 * moving + Math.sin(this.time * 1.4) * 0.004;
    const targetPosition = new THREE.Vector3(x + sprint * 0.065, y - sprint * 0.1 - reload * 0.04, this.genericKick * 0.035);
    const targetRotation = new THREE.Euler(this.genericKick * 0.045 - sprint * 0.08, 0, -sprint * 0.16 + reload * 0.25);
    const alpha = 1 - Math.exp(-delta * 14);
    this.poseRoot.position.lerp(targetPosition, alpha);
    this.poseRoot.rotation.x = THREE.MathUtils.lerp(this.poseRoot.rotation.x, targetRotation.x, alpha);
    this.poseRoot.rotation.y = THREE.MathUtils.lerp(this.poseRoot.rotation.y, targetRotation.y, alpha);
    this.poseRoot.rotation.z = THREE.MathUtils.lerp(this.poseRoot.rotation.z, targetRotation.z, alpha);
  }

  private prepareGenericMesh(mesh: THREE.Mesh): void {
    mesh.layers.set(1);
    mesh.renderOrder = 1000;
    this.poseRoot.add(mesh);
  }

  private viewMaterial(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...parameters, depthTest: false, depthWrite: false });
  }

  private clearCurrentModel(): void {
    this.muzzleEffect?.dispose();
    this.muzzleEffect = null;
    if (this.rifle) {
      this.rifle.dispose();
      this.rifle = null;
    } else {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      this.poseRoot.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
          meshMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
    this.animator = null;
    this.poseRoot.clear();
    this.poseRoot.position.set(0, 0, 0);
    this.poseRoot.rotation.set(0, 0, 0);
  }
}
