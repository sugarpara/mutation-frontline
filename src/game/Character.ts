import * as THREE from 'three';
import { GAME_CONFIG, OPERATORS } from './config';
import { CharacterRole, Team, type CombatStats, type OperatorId } from './types';

export class Character {
  readonly mesh = new THREE.Group();
  readonly hitMeshes: THREE.Object3D[] = [];
  readonly stats: CombatStats = { kills: 0, infections: 0, plants: 0, defuses: 0, shots: 0, hits: 0 };
  readonly velocity = new THREE.Vector3();
  team = Team.Human;
  role = CharacterRole.Human;
  health: number = GAME_CONFIG.human.health;
  maxHealth: number = GAME_CONFIG.human.health;
  armor: number = GAME_CONFIG.human.armor;
  maxArmor: number = GAME_CONFIG.human.armor;
  alive = true;
  respawnTimer = 0;
  invulnerableTimer = 0;
  stunRemaining = 0;
  stateLabel = '待命';
  walkCycle = 0;
  lastDamageDirection = new THREE.Vector3();
  private readonly humanVisual = new THREE.Group();
  private readonly infectedVisual = new THREE.Group();
  private readonly heroAura = new THREE.Group();
  private readonly alphaAura = new THREE.Group();
  private marker!: THREE.Mesh;
  private motherLabel!: THREE.Sprite;
  private muzzleFlash!: THREE.Mesh;
  private muzzleFlashTimer = 0;
  private infectedFleshMaterial!: THREE.MeshStandardMaterial;
  private infectedMutationMaterial!: THREE.MeshStandardMaterial;
  private infectedArmorMaterial!: THREE.MeshStandardMaterial;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private infectedLeftArm!: THREE.Group;
  private infectedRightArm!: THREE.Group;
  private infectedLeftLeg!: THREE.Group;
  private infectedRightLeg!: THREE.Group;
  private readonly infectedAura = new THREE.Group();
  private readonly alphaDetails = new THREE.Group();

  constructor(
    readonly id: string,
    readonly name: string,
    readonly isPlayer: boolean,
    readonly operator: OperatorId,
    scene: THREE.Scene,
  ) {
    this.mesh.name = `${name} Character`;
    this.buildHumanVisual();
    this.buildInfectedVisual();
    this.buildMarker();
    this.buildHeroAura();
    this.buildAlphaAura();
    scene.add(this.mesh);
    if (isPlayer) this.mesh.visible = false;
    this.configureHuman();
  }

  get position(): THREE.Vector3 { return this.mesh.position; }

  get speed(): number {
    if (this.role === CharacterRole.Hero) return GAME_CONFIG.hero.speed;
    if (this.role === CharacterRole.AlphaInfected) return GAME_CONFIG.alphaInfected.speed;
    if (this.role === CharacterRole.Infected) return GAME_CONFIG.infected.speed;
    return GAME_CONFIG.human.speed;
  }

  configureHuman(): void {
    this.team = Team.Human;
    this.role = CharacterRole.Human;
    this.maxHealth = GAME_CONFIG.human.health;
    this.health = this.maxHealth;
    this.maxArmor = GAME_CONFIG.human.armor;
    this.armor = this.maxArmor;
    this.alive = true;
    this.respawnTimer = 0;
    this.invulnerableTimer = 1;
    this.stunRemaining = 0;
    this.mesh.scale.setScalar(1);
    this.updateVisuals();
  }

  configureInfected(alpha: boolean): void {
    this.team = Team.Infected;
    this.role = alpha ? CharacterRole.AlphaInfected : CharacterRole.Infected;
    this.maxHealth = alpha ? GAME_CONFIG.alphaInfected.health : GAME_CONFIG.infected.health;
    this.health = this.maxHealth;
    this.maxArmor = 0;
    this.armor = 0;
    this.alive = true;
    this.respawnTimer = 0;
    this.invulnerableTimer = 1.1;
    this.stunRemaining = 0;
    this.mesh.scale.setScalar(alpha ? GAME_CONFIG.alphaInfected.scale : 1);
    this.updateVisuals();
  }

  configureCombatant(team: Team.Attackers | Team.Defenders): void {
    this.team = team;
    this.role = team === Team.Attackers ? CharacterRole.Attacker : CharacterRole.Defender;
    this.maxHealth = GAME_CONFIG.human.health;
    this.health = this.maxHealth;
    this.maxArmor = GAME_CONFIG.human.armor;
    this.armor = this.maxArmor;
    this.alive = true;
    this.respawnTimer = 0;
    this.invulnerableTimer = 0.8;
    this.stunRemaining = 0;
    this.mesh.scale.setScalar(1);
    this.updateVisuals();
  }

  setTacticalMarker(visible: boolean, color: number): void {
    this.marker.visible = visible;
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  configureHero(): void {
    this.team = Team.Human;
    this.role = CharacterRole.Hero;
    this.maxHealth = GAME_CONFIG.hero.health;
    this.health = this.maxHealth;
    this.maxArmor = GAME_CONFIG.hero.armor;
    this.armor = this.maxArmor;
    this.alive = true;
    this.respawnTimer = 0;
    this.invulnerableTimer = 1.2;
    this.stunRemaining = 0;
    this.velocity.set(0, 0, 0);
    this.mesh.scale.setScalar(1.04);
    this.updateVisuals();
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    this.mesh.visible = alive && !this.isPlayer;
  }

  resetStats(): void {
    this.stats.kills = 0;
    this.stats.infections = 0;
    this.stats.plants = 0;
    this.stats.defuses = 0;
    this.stats.shots = 0;
    this.stats.hits = 0;
  }

  flashMuzzle(): void {
    if (!this.muzzleFlash) return;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(0.7 + Math.random() * 0.75);
    this.muzzleFlashTimer = 0.055;
  }

  update(delta: number, moving: boolean): void {
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);
    this.stunRemaining = Math.max(0, this.stunRemaining - delta);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - delta);
    if (this.muzzleFlash) this.muzzleFlash.visible = this.muzzleFlashTimer > 0 && this.team !== Team.Infected;
    const speed = moving ? this.velocity.length() : 0;
    if (moving && speed > 0.1) this.walkCycle += delta * Math.min(12, 5 + speed);
    const swing = moving ? Math.sin(this.walkCycle) : 0;
    if (this.leftArm) this.leftArm.rotation.x = 0.72 + swing * 0.11;
    if (this.rightArm) this.rightArm.rotation.x = 0.58 - swing * 0.1;
    if (this.leftLeg) this.leftLeg.rotation.x = -swing * 0.42;
    if (this.rightLeg) this.rightLeg.rotation.x = swing * 0.42;
    if (this.infectedLeftArm) this.infectedLeftArm.rotation.x = 0.22 + swing * 0.38;
    if (this.infectedRightArm) this.infectedRightArm.rotation.x = 0.22 - swing * 0.38;
    if (this.infectedLeftLeg) this.infectedLeftLeg.rotation.x = -swing * 0.5;
    if (this.infectedRightLeg) this.infectedRightLeg.rotation.x = swing * 0.5;
    const bob = moving ? Math.abs(Math.sin(this.walkCycle * 2)) * 0.025 : 0;
    this.humanVisual.position.y = bob;
    this.infectedVisual.position.y = bob;
    this.heroAura.rotation.y += delta * 0.9;
    this.alphaAura.rotation.y -= delta * 0.7;
    this.infectedAura.rotation.y += delta * 0.65;
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
    this.heroAura.scale.setScalar(pulse);
    this.alphaAura.scale.setScalar(1 + Math.sin(performance.now() * 0.005) * 0.045);
    this.infectedAura.scale.setScalar(1 + Math.sin(performance.now() * 0.0035 + this.position.x) * 0.04);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    const materials = new Set<THREE.Material>();
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
        meshMaterials.forEach((material) => materials.add(material));
      } else if (child instanceof THREE.Sprite) {
        materials.add(child.material);
      }
    });
    materials.forEach((material) => {
      const map = (material as THREE.MeshStandardMaterial).map;
      map?.dispose();
      material.dispose();
    });
  }

  private buildHumanVisual(): void {
    const palette = OPERATORS[this.operator];
    const armorMaterial = new THREE.MeshStandardMaterial({ color: palette.primary, roughness: 0.58, metalness: 0.42 });
    const secondaryMaterial = new THREE.MeshStandardMaterial({ color: 0x26333a, roughness: 0.66, metalness: 0.34 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.48, roughness: 0.36, metalness: 0.24 });
    const fabricMaterial = new THREE.MeshStandardMaterial({ color: 0x20292e, roughness: 0.94, metalness: 0.02 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x10171b, roughness: 0.78, metalness: 0.22 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1013, roughness: 0.96, metalness: 0.02 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.92 });

    this.part(this.humanVisual, new THREE.CylinderGeometry(0.3, 0.25, 0.64, 6), fabricMaterial, [0, 1.13, 0], [0, 0, 0], 'body', 'Combat Jacket');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.7, 0.46, 0.34), armorMaterial, [0, 1.26, -0.015], [0.02, 0, 0], 'body', 'Torso Armor');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.5, 0.22, 0.08), secondaryMaterial, [0, 1.32, -0.205], [-0.08, 0, 0], undefined, 'Chest Plate');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.33, 0.08, 0.025), accentMaterial, [0, 1.36, -0.255], [-0.08, 0, 0], undefined, 'Chest Signal Bar');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.58, 0.14, 0.34), darkMaterial, [0, 0.86, 0], [0, 0, 0], 'body', 'Utility Belt');
    for (const x of [-0.22, 0, 0.22]) this.part(this.humanVisual, new THREE.BoxGeometry(0.15, 0.18, 0.11), darkMaterial, [x, 0.84, -0.22], [0, 0, 0], undefined, 'Belt Pouch');

    this.part(this.humanVisual, new THREE.CylinderGeometry(0.09, 0.105, 0.15, 7), skinMaterial, [0, 1.58, 0], [0, 0, 0], undefined, 'Neck');
    const head = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.245, 0), skinMaterial, [0, 1.78, -0.015], [0, 0, 0], 'head', 'Head');
    head.scale.set(this.operator === 'Iris' || this.operator === 'Vela' ? 0.94 : 1.02, 1.06, 0.94);
    this.part(this.humanVisual, new THREE.BoxGeometry(0.15, 0.035, 0.025), darkMaterial, [0, 1.76, -0.235], [0, 0, 0], undefined, 'Brow Guard');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.045, 0.025, 0.025), accentMaterial, [-0.055, 1.77, -0.25], [0, 0, 0], undefined, 'Left Eye Light');
    this.part(this.humanVisual, new THREE.BoxGeometry(0.045, 0.025, 0.025), accentMaterial, [0.055, 1.77, -0.25], [0, 0, 0], undefined, 'Right Eye Light');

    this.leftArm = this.buildHumanArm(-1, armorMaterial, fabricMaterial, gloveMaterial, secondaryMaterial);
    this.rightArm = this.buildHumanArm(1, armorMaterial, fabricMaterial, gloveMaterial, secondaryMaterial);
    this.leftLeg = this.buildHumanLeg(-1, fabricMaterial, darkMaterial, armorMaterial);
    this.rightLeg = this.buildHumanLeg(1, fabricMaterial, darkMaterial, armorMaterial);
    this.humanVisual.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    this.addOperatorDetails(armorMaterial, accentMaterial, darkMaterial, fabricMaterial, skinMaterial);
    this.buildHumanRifle(accentMaterial);
    this.mesh.add(this.humanVisual);
  }

  private buildHumanArm(side: -1 | 1, armor: THREE.Material, fabric: THREE.Material, glove: THREE.Material, secondary: THREE.Material): THREE.Group {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'Left Human Arm' : 'Right Human Arm';
    arm.position.set(side * 0.43, 1.43, 0.015);
    arm.rotation.set(side < 0 ? 0.72 : 0.58, 0, side * -0.08);
    const shoulder = this.part(arm, new THREE.DodecahedronGeometry(0.18, 0), armor, [0, -0.02, 0], [0, 0, side * 0.18], 'body', 'Shoulder Armor');
    shoulder.scale.set(1.18, 0.8, 1.05);
    this.part(arm, new THREE.CylinderGeometry(0.09, 0.1, 0.34, 7), fabric, [0, -0.2, 0], [0, 0, 0], 'body', 'Upper Arm');
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    elbow.rotation.x = side < 0 ? 0.36 : 0.48;
    this.part(elbow, new THREE.OctahedronGeometry(0.115, 0), secondary, [0, 0, -0.015], [0, 0, 0], 'body', 'Elbow Pad');
    this.part(elbow, new THREE.CylinderGeometry(0.075, 0.09, 0.34, 7), fabric, [0, -0.19, 0], [0, 0, 0], 'body', 'Forearm');
    this.part(elbow, new THREE.BoxGeometry(0.17, 0.13, 0.17), glove, [0, -0.39, -0.01], [0.12, 0, side * 0.08], 'body', 'Tactical Glove');
    for (let finger = -1; finger <= 1; finger += 1) this.part(elbow, new THREE.BoxGeometry(0.035, 0.11, 0.04), glove, [finger * 0.045, -0.46, -0.035], [0.18, 0, 0], undefined, 'Glove Finger');
    arm.add(elbow);
    return arm;
  }

  private buildHumanLeg(side: -1 | 1, fabric: THREE.Material, dark: THREE.Material, armor: THREE.Material): THREE.Group {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'Left Human Leg' : 'Right Human Leg';
    leg.position.set(side * 0.19, 0.78, 0);
    this.part(leg, new THREE.CylinderGeometry(0.12, 0.105, 0.42, 7), fabric, [0, -0.22, 0], [0, 0, 0], 'body', 'Armored Thigh');
    const knee = this.part(leg, new THREE.DodecahedronGeometry(0.13, 0), armor, [0, -0.45, -0.075], [0.12, 0, 0], 'body', 'Knee Guard');
    knee.scale.set(0.9, 0.72, 0.48);
    this.part(leg, new THREE.CylinderGeometry(0.095, 0.11, 0.38, 7), fabric, [0, -0.66, 0.015], [-0.04, 0, 0], 'body', 'Lower Leg');
    this.part(leg, new THREE.BoxGeometry(0.23, 0.2, 0.34), dark, [0, -0.91, -0.07], [0.06, 0, 0], 'body', 'Combat Boot');
    this.part(leg, new THREE.BoxGeometry(0.16, 0.26, 0.055), armor, [0, -0.66, -0.105], [-0.05, 0, 0], undefined, 'Shin Plate');
    return leg;
  }

  private addOperatorDetails(armor: THREE.MeshStandardMaterial, accent: THREE.MeshStandardMaterial, dark: THREE.MeshStandardMaterial, fabric: THREE.MeshStandardMaterial, skin: THREE.MeshStandardMaterial): void {
    if (this.operator === 'Rook') {
      for (const side of [-1, 1]) {
        const shoulder = this.part(this.humanVisual, new THREE.BoxGeometry(0.29, 0.18, 0.42), armor, [side * 0.5, 1.45, 0], [0, 0, side * 0.18], undefined, 'Rook Shoulder Shell');
        shoulder.scale.z = 0.82;
      }
      for (let index = -1; index <= 1; index += 1) {
        this.part(this.humanVisual, new THREE.BoxGeometry(0.15, 0.23, 0.11), dark, [index * 0.17, 1.12, -0.25], [0, 0, 0], undefined, 'Rook Magazine Pouch');
      }
      const helmet = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.27, 0), dark, [0, 1.89, 0.005], [0, 0, 0], undefined, 'Rook Helmet');
      helmet.scale.set(1.04, 0.62, 1.04);
      this.part(this.humanVisual, new THREE.BoxGeometry(0.33, 0.08, 0.1), accent, [0, 1.82, -0.2], [0.04, 0, 0], undefined, 'Rook Visor');
    } else if (this.operator === 'Kite') {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.085, 6, 12), new THREE.MeshStandardMaterial({ color: 0x796b4c, roughness: 0.96 }));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = 1.53;
      scarf.scale.z = 0.68;
      this.humanVisual.add(scarf);
      this.part(this.humanVisual, new THREE.BoxGeometry(0.48, 0.46, 0.18), dark, [0, 1.12, 0.29], [0, 0, 0], undefined, 'Kite Field Pack');
      const hair = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.255, 0), new THREE.MeshStandardMaterial({ color: 0x241d19, roughness: 0.96 }), [0, 1.9, 0.03], [0, 0, 0], undefined, 'Kite Hair');
      hair.scale.set(1.03, 0.45, 1);
      this.part(this.humanVisual, new THREE.BoxGeometry(0.17, 0.28, 0.12), fabric, [-0.36, 0.69, -0.05], [0.04, 0, 0.05], undefined, 'Kite Thigh Pouch');
    } else if (this.operator === 'Iris') {
      const white = new THREE.MeshStandardMaterial({ color: 0xd1d7d5, roughness: 0.7, metalness: 0.18 });
      this.part(this.humanVisual, new THREE.BoxGeometry(0.37, 0.44, 0.18), white, [0.2, 1.12, 0.29], [0, 0, 0], undefined, 'Iris Medical Pack');
      const glyphA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.02), accent);
      const glyphB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.02), accent);
      glyphA.position.set(0.2, 1.12, 0.39);
      glyphB.position.copy(glyphA.position);
      glyphA.rotation.z = Math.PI / 4;
      glyphB.rotation.z = Math.PI / 4;
      this.humanVisual.add(glyphA, glyphB);
      const hood = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.29, 0), white, [0, 1.87, 0.025], [0, 0, 0], undefined, 'Iris Hood');
      hood.scale.set(1.03, 0.68, 1.03);
      const face = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.215, 0), skin, [0, 1.78, -0.075], [0, 0, 0], undefined, 'Iris Face Guard Opening');
      face.scale.z = 0.85;
    } else {
      for (const side of [-1, 1]) {
        this.part(this.humanVisual, new THREE.OctahedronGeometry(0.1, 0), accent, [side * 0.49, 1.43, -0.12], [0, 0, 0], undefined, 'Vela Shoulder Sensor');
      }
      this.part(this.humanVisual, new THREE.BoxGeometry(0.46, 0.52, 0.12), armor, [0, 1.18, 0.27], [0, 0, 0], undefined, 'Vela Back Plate');
      const helmet = this.part(this.humanVisual, new THREE.DodecahedronGeometry(0.27, 0), dark, [0, 1.87, 0.015], [0, 0, 0], undefined, 'Vela Tactical Helmet');
      helmet.scale.set(0.98, 0.72, 1.02);
      this.part(this.humanVisual, new THREE.BoxGeometry(0.36, 0.11, 0.075), accent, [0, 1.8, -0.225], [0.02, 0, 0], undefined, 'Vela Optic Visor');
      for (const side of [-1, 1]) this.part(this.humanVisual, new THREE.BoxGeometry(0.1, 0.33, 0.08), armor, [side * 0.31, 0.69, -0.05], [0, 0, side * 0.04], undefined, 'Vela Thigh Module');
    }
  }

  private buildHumanRifle(accent: THREE.MeshStandardMaterial): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x202a30, roughness: 0.5, metalness: 0.72 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x10161a, roughness: 0.88, metalness: 0.08 });
    const rifle = new THREE.Group();
    rifle.name = 'AI Ember Rifle';
    this.part(rifle, new THREE.BoxGeometry(0.18, 0.2, 0.6), metal, [0, 0, 0], [0, 0, 0], undefined, 'Rifle Receiver');
    this.part(rifle, new THREE.BoxGeometry(0.17, 0.16, 0.48), polymer, [0, 0.01, -0.5], [0, 0, 0], undefined, 'Rifle Handguard');
    this.part(rifle, new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), metal, [0, 0.02, -0.98], [Math.PI / 2, 0, 0], undefined, 'Rifle Barrel');
    this.part(rifle, new THREE.CylinderGeometry(0.065, 0.065, 0.13, 8), metal, [0, 0.02, -1.3], [Math.PI / 2, 0, 0], undefined, 'Rifle Muzzle Brake');
    this.part(rifle, new THREE.BoxGeometry(0.14, 0.34, 0.18), metal, [0, -0.23, -0.02], [-0.2, 0, 0], undefined, 'Rifle Magazine');
    this.part(rifle, new THREE.BoxGeometry(0.17, 0.2, 0.38), polymer, [0, 0, 0.47], [0, 0, 0], undefined, 'Rifle Stock');
    this.part(rifle, new THREE.BoxGeometry(0.12, 0.35, 0.15), polymer, [0, -0.26, 0.24], [-0.18, 0, 0], undefined, 'Rifle Grip');
    this.part(rifle, new THREE.BoxGeometry(0.2, 0.04, 0.88), metal, [0, 0.13, -0.16], [0, 0, 0], undefined, 'Rifle Rail');
    this.part(rifle, new THREE.BoxGeometry(0.19, 0.045, 0.31), accent, [0.095, 0.035, -0.28], [0, 0, 0], undefined, 'Rifle Energy Strip');
    const optic = this.part(rifle, new THREE.BoxGeometry(0.2, 0.16, 0.2), polymer, [0, 0.23, 0.02], [0, 0, 0], undefined, 'Rifle Optic');
    optic.scale.x = 0.75;
    rifle.position.set(0.14, 1.23, -0.38);
    rifle.rotation.set(-0.04, -0.05, -0.08);
    this.muzzleFlash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: 0.9 }),
    );
    this.muzzleFlash.position.set(0, 0.02, -1.39);
    this.muzzleFlash.visible = false;
    rifle.add(this.muzzleFlash);
    this.humanVisual.add(rifle);
  }

  private part(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    hitPart?: 'body' | 'head',
    name = 'Character Part',
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (hitPart) {
      mesh.userData.characterId = this.id;
      mesh.userData.hitPart = hitPart;
      this.hitMeshes.push(mesh);
    }
    parent.add(mesh);
    return mesh;
  }

  private buildInfectedVisual(): void {
    this.infectedFleshMaterial = new THREE.MeshStandardMaterial({ color: 0x4d6258, roughness: 0.72, metalness: 0.12 });
    this.infectedMutationMaterial = new THREE.MeshStandardMaterial({ color: 0x6fdc83, emissive: 0x194f31, emissiveIntensity: 0.9, roughness: 0.48, metalness: 0.12 });
    this.infectedArmorMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2828, emissive: 0x0c2d20, emissiveIntensity: 0.48, roughness: 0.38, metalness: 0.62 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17201f, roughness: 0.88, metalness: 0.18 });

    this.part(this.infectedVisual, new THREE.CylinderGeometry(0.34, 0.27, 0.75, 7), this.infectedFleshMaterial, [0, 1.16, 0.01], [-0.04, 0, 0], 'body', 'Infected Torso');
    const chestShell = this.part(this.infectedVisual, new THREE.DodecahedronGeometry(0.42, 0), this.infectedArmorMaterial, [0, 1.34, -0.16], [-0.08, 0, 0], 'body', 'Infected Chest Carapace');
    chestShell.scale.set(1.02, 0.62, 0.48);
    for (let index = 0; index < 3; index += 1) {
      const plate = this.part(this.infectedVisual, new THREE.OctahedronGeometry(0.23, 0), index === 1 ? this.infectedMutationMaterial : this.infectedArmorMaterial, [0, 1.19 - index * 0.19, -0.25], [0.1, 0, 0], undefined, 'Infected Sternum Plate');
      plate.scale.set(1.18 - index * 0.12, 0.45, 0.32);
    }
    this.part(this.infectedVisual, new THREE.BoxGeometry(0.5, 0.16, 0.3), dark, [0, 0.82, 0.02], [0, 0, 0], 'body', 'Infected Pelvis');

    const head = this.part(this.infectedVisual, new THREE.DodecahedronGeometry(0.255, 0), this.infectedFleshMaterial, [0, 1.76, -0.045], [-0.08, 0, 0], 'head', 'Infected Head');
    head.scale.set(0.9, 1.08, 0.92);
    const helmet = this.part(this.infectedVisual, new THREE.ConeGeometry(0.3, 0.54, 5), this.infectedArmorMaterial, [0, 1.92, -0.015], [0.02, Math.PI / 5, 0], undefined, 'Infected Crown');
    helmet.scale.set(0.88, 1, 1.16);
    this.part(this.infectedVisual, new THREE.BoxGeometry(0.29, 0.055, 0.055), this.infectedMutationMaterial, [0, 1.78, -0.25], [-0.08, 0, 0], undefined, 'Infected Face Rift');
    for (const side of [-1, 1]) {
      const jaw = this.part(this.infectedVisual, new THREE.TetrahedronGeometry(0.15, 0), this.infectedArmorMaterial, [side * 0.14, 1.66, -0.12], [0.25, side * 0.34, side * -0.12], undefined, 'Infected Jaw Plate');
      jaw.scale.set(0.55, 1, 0.7);
      const shoulder = this.part(this.infectedVisual, new THREE.DodecahedronGeometry(0.25, 0), this.infectedArmorMaterial, [side * 0.46, 1.43, 0], [0, 0, side * 0.22], 'body', 'Infected Shoulder Shell');
      shoulder.scale.set(1.25, 0.68, 0.95);
    }

    this.infectedLeftArm = this.buildInfectedArm(-1);
    this.infectedRightArm = this.buildInfectedArm(1);
    this.infectedLeftLeg = this.buildInfectedLeg(-1, dark);
    this.infectedRightLeg = this.buildInfectedLeg(1, dark);
    this.infectedVisual.add(this.infectedLeftArm, this.infectedRightArm, this.infectedLeftLeg, this.infectedRightLeg);

    for (let index = 0; index < 5; index += 1) {
      const spine = this.part(this.infectedVisual, new THREE.ConeGeometry(0.075, 0.34 + index * 0.025, 4), this.infectedArmorMaterial, [0, 1.48 - index * 0.19, 0.25], [-0.62, Math.PI / 4, 0], undefined, 'Infected Dorsal Spine');
      spine.scale.x = 0.72;
    }

    const auraMaterial = new THREE.MeshBasicMaterial({ color: 0x70f38a, transparent: true, opacity: 0.5, depthWrite: false });
    for (let index = 0; index < 7; index += 1) {
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.035 + (index % 3) * 0.012, 0), auraMaterial);
      const angle = (index / 7) * Math.PI * 2;
      mote.position.set(Math.cos(angle) * (0.45 + (index % 2) * 0.12), 0.65 + (index % 4) * 0.34, Math.sin(angle) * 0.35);
      this.infectedAura.add(mote);
    }

    for (const side of [-1, 1]) {
      const alphaShoulder = this.part(this.alphaDetails, new THREE.ConeGeometry(0.19, 0.72, 5), this.infectedArmorMaterial, [side * 0.52, 1.58, 0.02], [0, 0, side * -1.12], undefined, 'Mother Shoulder Horn');
      alphaShoulder.scale.z = 0.65;
      const forearmBlade = this.part(this.alphaDetails, new THREE.ConeGeometry(0.17, 0.92, 4), this.infectedMutationMaterial, [side * 0.63, 0.87, -0.22], [-0.72, 0, side * 0.12], undefined, 'Mother Forearm Blade');
      forearmBlade.scale.set(0.58, 1, 0.34);
    }
    const core = this.part(this.alphaDetails, new THREE.OctahedronGeometry(0.18, 0), this.infectedMutationMaterial, [0, 1.31, -0.38], [0, 0, 0], undefined, 'Mother Chest Core');
    core.scale.set(0.8, 1.1, 0.5);
    for (let index = 0; index < 4; index += 1) {
      const alphaSpine = this.part(this.alphaDetails, new THREE.ConeGeometry(0.1, 0.58 + index * 0.08, 4), this.infectedArmorMaterial, [0, 1.62 - index * 0.28, 0.3], [-0.72, Math.PI / 4, 0], undefined, 'Mother Dorsal Blade');
      alphaSpine.scale.x = 0.78;
    }
    this.infectedVisual.add(this.infectedAura, this.alphaDetails);
    this.mesh.add(this.infectedVisual);
  }

  private buildInfectedArm(side: -1 | 1): THREE.Group {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'Left Infected Arm' : 'Right Infected Arm';
    arm.position.set(side * 0.47, 1.39, 0.01);
    arm.rotation.set(0.22, 0, side * 0.14);
    this.part(arm, new THREE.CylinderGeometry(0.1, 0.125, 0.38, 7), this.infectedFleshMaterial, [0, -0.2, 0], [0, 0, 0], 'body', 'Infected Upper Arm');
    const forearm = this.part(arm, new THREE.DodecahedronGeometry(0.22, 0), this.infectedArmorMaterial, [0, -0.52, -0.05], [0.18, 0, side * 0.05], 'body', 'Infected Forearm Carapace');
    forearm.scale.set(0.75, 1.4, 0.68);
    const palm = this.part(arm, new THREE.DodecahedronGeometry(0.145, 0), this.infectedFleshMaterial, [0, -0.79, -0.13], [0.25, 0, 0], 'body', 'Infected Hand');
    palm.scale.set(0.95, 0.7, 1.25);
    const blade = this.part(arm, new THREE.TetrahedronGeometry(0.2, 0), this.infectedArmorMaterial, [side * 0.11, -0.54, -0.18], [-0.2, side * 0.28, side * 0.18], undefined, 'Infected Forearm Fin');
    blade.scale.set(0.45, 1.6, 0.55);
    for (let finger = 0; finger < 4; finger += 1) {
      const claw = this.part(arm, new THREE.ConeGeometry(0.032, 0.34 + finger * 0.018, 5), this.infectedMutationMaterial, [-0.085 + finger * 0.055, -0.88, -0.24 - Math.abs(1.5 - finger) * 0.018], [-Math.PI / 2.35, 0, 0], undefined, 'Infected Claw');
      claw.rotation.z = side * (finger - 1.5) * 0.045;
    }
    return arm;
  }

  private buildInfectedLeg(side: -1 | 1, dark: THREE.Material): THREE.Group {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'Left Infected Leg' : 'Right Infected Leg';
    leg.position.set(side * 0.2, 0.8, 0);
    this.part(leg, new THREE.CylinderGeometry(0.125, 0.105, 0.42, 7), this.infectedFleshMaterial, [0, -0.22, 0], [0, 0, 0], 'body', 'Infected Thigh');
    const knee = this.part(leg, new THREE.DodecahedronGeometry(0.145, 0), this.infectedArmorMaterial, [0, -0.45, -0.08], [0.12, 0, 0], 'body', 'Infected Knee Shell');
    knee.scale.set(0.9, 0.78, 0.58);
    this.part(leg, new THREE.CylinderGeometry(0.085, 0.11, 0.39, 7), dark, [0, -0.66, 0.045], [-0.14, 0, 0], 'body', 'Infected Shin');
    this.part(leg, new THREE.BoxGeometry(0.2, 0.16, 0.36), this.infectedArmorMaterial, [0, -0.91, -0.09], [0.12, 0, 0], 'body', 'Infected Talon Foot');
    for (const offset of [-0.06, 0, 0.06]) this.part(leg, new THREE.ConeGeometry(0.025, 0.2, 5), this.infectedMutationMaterial, [offset, -0.96, -0.3], [-Math.PI / 2, 0, 0], undefined, 'Infected Toe Claw');
    return leg;
  }

  private buildMarker(): void {
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: 0x4a9eff, depthTest: false }),
    );
    this.marker.position.y = 2.35;
    this.marker.renderOrder = 4;
    this.mesh.add(this.marker);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(22, 5, 7, 0.86)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#9cff77';
    context.lineWidth = 4;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = '#e6ffd9';
    context.font = 'bold 34px Segoe UI';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('母体', canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.motherLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    this.motherLabel.position.y = 2.65;
    this.motherLabel.scale.set(1.25, 0.36, 1);
    this.motherLabel.renderOrder = 5;
    this.mesh.add(this.motherLabel);
  }

  private buildHeroAura(): void {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffd45b, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.025, 6, 24), ringMaterial);
    ringA.rotation.x = Math.PI / 2;
    ringA.position.y = 0.12;
    const ringB = ringA.clone();
    ringB.position.y = 1.4;
    ringB.rotation.y = Math.PI / 3;
    this.heroAura.add(ringA, ringB);
    this.mesh.add(this.heroAura);
  }

  private buildAlphaAura(): void {
    const red = new THREE.MeshBasicMaterial({ color: 0xc52f35, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const green = new THREE.MeshBasicMaterial({ color: 0x78ef6b, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const lower = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 6, 20), red);
    lower.rotation.x = Math.PI / 2;
    lower.position.y = 0.1;
    const upper = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 18), green);
    upper.rotation.x = Math.PI / 2;
    upper.position.y = 1.45;
    this.alphaAura.add(lower, upper);
    this.mesh.add(this.alphaAura);
  }

  private updateVisuals(): void {
    this.humanVisual.visible = this.team !== Team.Infected;
    this.infectedVisual.visible = this.team === Team.Infected;
    this.heroAura.visible = this.role === CharacterRole.Hero;
    this.alphaAura.visible = this.role === CharacterRole.AlphaInfected;
    this.infectedAura.visible = this.team === Team.Infected;
    this.alphaDetails.visible = this.role === CharacterRole.AlphaInfected;
    this.marker.visible = this.team === Team.Human || this.role === CharacterRole.AlphaInfected || this.team === Team.Attackers;
    this.motherLabel.visible = this.role === CharacterRole.AlphaInfected;
    const markerMaterial = this.marker.material as THREE.MeshBasicMaterial;
    markerMaterial.color.setHex(this.role === CharacterRole.AlphaInfected ? 0x91ff70 : this.team === Team.Attackers ? 0xffb14d : 0x4a9eff);
    const alpha = this.role === CharacterRole.AlphaInfected;
    this.infectedFleshMaterial.color.setHex(alpha ? 0x451b20 : 0x53685b);
    this.infectedFleshMaterial.emissive.setHex(alpha ? 0x310609 : 0x000000);
    this.infectedFleshMaterial.emissiveIntensity = alpha ? 0.55 : 0;
    this.infectedMutationMaterial.color.setHex(alpha ? 0x4e7b43 : 0x75d779);
    this.infectedMutationMaterial.emissive.setHex(alpha ? 0x7acb43 : 0x174f2c);
    this.infectedMutationMaterial.emissiveIntensity = alpha ? 1.3 : 0.7;
    this.infectedArmorMaterial.color.setHex(alpha ? 0x241417 : 0x202a29);
    this.infectedArmorMaterial.emissive.setHex(alpha ? 0x7d1719 : 0x0c2d20);
    this.infectedArmorMaterial.emissiveIntensity = alpha ? 0.9 : 0.45;
  }
}
