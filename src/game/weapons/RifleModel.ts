import * as THREE from 'three';

interface RifleMaterials {
  receiver: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  magazine: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  groove: THREE.MeshStandardMaterial;
  armorRed: THREE.MeshStandardMaterial;
  energyGlass: THREE.MeshStandardMaterial;
  glove: THREE.MeshBasicMaterial;
  sleeve: THREE.MeshBasicMaterial;
}

export class RifleModel {
  readonly root = new THREE.Group();
  readonly weapon = new THREE.Group();
  readonly hands = new THREE.Group();
  readonly magazine = new THREE.Group();
  readonly bolt = new THREE.Group();
  readonly chargingHandle = new THREE.Group();
  readonly leftHand = new THREE.Group();
  readonly rightHand = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  readonly ejectionPort = new THREE.Object3D();
  readonly leftHandHome = new THREE.Vector3();
  readonly leftHandHomeRotation = new THREE.Euler();
  readonly magazineHome = new THREE.Vector3();
  readonly magazineHomeRotation = new THREE.Euler();
  readonly boltHome = new THREE.Vector3();
  readonly chargingHandleHome = new THREE.Vector3();
  private readonly materials: RifleMaterials;
  private readonly textures: THREE.Texture[] = [];

  constructor() {
    this.root.name = 'Yalong Prototype Rifle Viewmodel';
    this.weapon.name = 'Rifle Assembly';
    this.hands.name = 'First Person Arms';
    this.materials = this.createMaterials();
    this.root.add(this.weapon, this.hands);
    this.buildStock();
    this.buildReceiver();
    this.buildHandguardAndBarrel();
    this.buildDragonChassis();
    this.buildGripAndTrigger();
    this.buildMagazine();
    this.buildRailAndSights();
    this.buildDetails();
    this.buildHands();
    this.captureHomePoses();
    this.root.traverse((object) => {
      object.layers.set(1);
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
        object.renderOrder = 1000;
      }
    });
  }

  resetAnimatedParts(): void {
    this.magazine.visible = true;
    this.magazine.position.copy(this.magazineHome);
    this.magazine.rotation.copy(this.magazineHomeRotation);
    this.leftHand.visible = true;
    this.leftHand.position.copy(this.leftHandHome);
    this.leftHand.rotation.copy(this.leftHandHomeRotation);
    this.bolt.position.copy(this.boltHome);
    this.chargingHandle.position.copy(this.chargingHandleHome);
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }

  private createMaterials(): RifleMaterials {
    const viewMaterial = (parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial({ ...parameters, depthTest: false, depthWrite: false });
      material.toneMapped = true;
      return material;
    };
    const viewBasic = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
    return {
      receiver: viewMaterial({ color: 0x292d32, roughness: 0.34, metalness: 0.7 }),
      metalDark: viewMaterial({ color: 0x15191d, roughness: 0.42, metalness: 0.78 }),
      polymer: viewMaterial({ color: 0x111619, roughness: 0.82, metalness: 0.08 }),
      rubber: viewMaterial({ color: 0x0a0d0f, roughness: 0.96, metalness: 0 }),
      magazine: viewMaterial({ color: 0x252c31, roughness: 0.54, metalness: 0.48 }),
      steel: viewMaterial({ color: 0x69737a, roughness: 0.27, metalness: 0.86 }),
      brass: viewMaterial({ color: 0xa97834, roughness: 0.31, metalness: 0.8 }),
      accent: viewMaterial({ color: 0xff3525, emissive: 0xff1c0f, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.38 }),
      groove: viewMaterial({ color: 0x070a0c, roughness: 0.88, metalness: 0.12 }),
      armorRed: viewMaterial({ color: 0x4f171a, emissive: 0x260407, emissiveIntensity: 0.38, roughness: 0.48, metalness: 0.58 }),
      energyGlass: viewMaterial({ color: 0x6e1719, emissive: 0xff2415, emissiveIntensity: 1.15, transparent: true, opacity: 0.58, roughness: 0.18, metalness: 0.12 }),
      glove: viewBasic(0x11171b),
      sleeve: viewBasic(0x0b1013),
    };
  }

  private buildStock(): void {
    const stock = new THREE.Group();
    stock.name = 'Adjustable Stock';
    const stockBody = this.extrudedSideProfile(
      [[-0.22, 0.13], [0.17, 0.15], [0.26, 0.04], [0.22, -0.13], [-0.2, -0.12], [-0.28, -0.03]],
      0.245,
      this.materials.polymer,
    );
    stockBody.position.set(-0.1225, 0, 0.66);
    stock.add(stockBody);
    this.addBox(stock, 'Rubber Butt Pad', [0.27, 0.33, 0.075], [0, -0.005, 0.94], this.materials.rubber, [0.04, 0, 0]);
    this.addBox(stock, 'Stock Cheek Rest', [0.22, 0.07, 0.34], [0, 0.17, 0.68], this.materials.receiver, [-0.03, 0, 0]);
    this.addCylinder(stock, 'Buffer Tube', 0.035, 0.54, [0, 0.055, 0.49], this.materials.steel);
    this.addBox(stock, 'Stock Latch', [0.07, 0.055, 0.13], [0, -0.17, 0.63], this.materials.accent, [0.15, 0, 0]);
    this.addBox(stock, 'Stock Lower Brace', [0.055, 0.055, 0.48], [0, -0.145, 0.68], this.materials.steel, [-0.18, 0, 0]);
    this.addBox(stock, 'Stock Ember Inset', [0.018, 0.035, 0.33], [0.132, -0.035, 0.7], this.materials.accent, [-0.04, 0, 0]);
    this.addBox(stock, 'Stock Heel Armor', [0.29, 0.055, 0.08], [0, -0.16, 0.9], this.materials.brass, [0.05, 0, 0]);
    this.weapon.add(stock);
  }

  private buildReceiver(): void {
    const receiver = new THREE.Group();
    receiver.name = 'Receiver';
    this.addBox(receiver, 'Lower Receiver', [0.31, 0.23, 0.57], [0, -0.035, 0.12], this.materials.receiver);
    this.addBox(receiver, 'Upper Receiver', [0.29, 0.17, 0.62], [0, 0.145, 0.06], this.materials.metalDark, [-0.018, 0, 0]);
    this.addBox(receiver, 'Rear Trunnion', [0.25, 0.18, 0.16], [0, 0.015, 0.48], this.materials.steel);
    this.addBox(receiver, 'Forward Trunnion', [0.27, 0.2, 0.15], [0, 0.02, -0.26], this.materials.receiver);

    const glowLine = this.addBox(receiver, 'Emissive Status Line', [0.012, 0.035, 0.34], [0.158, 0.095, 0.08], this.materials.accent);
    glowLine.rotation.x = 0.02;
    this.addBox(receiver, 'Status Line Break', [0.014, 0.055, 0.042], [0.159, 0.095, 0.12], this.materials.groove);

    this.ejectionPort.position.set(0.167, 0.125, -0.035);
    receiver.add(this.ejectionPort);
    this.addBox(this.ejectionPort, 'Ejection Port Recess', [0.015, 0.095, 0.23], [0, 0, 0], this.materials.groove);
    this.addBox(this.bolt, 'Visible Bolt Carrier', [0.018, 0.075, 0.19], [0, 0, 0], this.materials.steel);
    this.bolt.position.set(0.178, 0.125, -0.04);
    receiver.add(this.bolt);

    this.addBox(this.chargingHandle, 'Charging Handle', [0.115, 0.045, 0.07], [0, 0, 0], this.materials.steel, [0, 0, -0.08]);
    this.chargingHandle.position.set(-0.17, 0.195, 0.19);
    receiver.add(this.chargingHandle);
    this.weapon.add(receiver);
  }

  private buildHandguardAndBarrel(): void {
    const front = new THREE.Group();
    front.name = 'Handguard And Barrel';
    this.addBox(front, 'Handguard Core', [0.33, 0.245, 0.61], [0, 0.015, -0.49], this.materials.polymer, [0.012, 0, 0]);
    this.addBox(front, 'Handguard Top Spine', [0.27, 0.085, 0.61], [0, 0.168, -0.49], this.materials.receiver);
    this.addBox(front, 'Hand Stop', [0.34, 0.09, 0.07], [0, -0.145, -0.72], this.materials.rubber, [0.2, 0, 0]);
    this.addBox(front, 'Lower Accessory Rail', [0.18, 0.045, 0.5], [0, -0.14, -0.48], this.materials.steel);
    for (let index = 0; index < 4; index += 1) {
      const z = -0.29 - index * 0.14;
      this.addBox(front, `Left Cooling Groove ${index + 1}`, [0.013, 0.045, 0.09], [-0.171, 0.02, z], this.materials.groove, [0, 0, -0.18]);
      this.addBox(front, `Right Cooling Groove ${index + 1}`, [0.013, 0.045, 0.09], [0.171, 0.02, z], this.materials.groove, [0, 0, 0.18]);
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const vent = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), index === 1 ? this.materials.brass : this.materials.receiver);
        vent.name = `Handguard Scale ${side} ${index + 1}`;
        vent.position.set(side * 0.19, 0.13 - index * 0.085, -0.42 - index * 0.16);
        vent.rotation.set(0.1, side * 0.34, side * 0.08);
        vent.scale.set(0.45, 0.65, 1.4);
        front.add(vent);
      }
    }
    this.addCylinder(front, 'Barrel', 0.037, 0.66, [0, 0.045, -1.02], this.materials.metalDark);
    this.addCylinder(front, 'Gas Block', 0.075, 0.12, [0, 0.055, -0.82], this.materials.receiver);
    this.addCylinder(front, 'Muzzle Brake Body', 0.066, 0.19, [0, 0.045, -1.42], this.materials.steel, 8);
    this.addCylinder(front, 'Muzzle Brake Tip', 0.081, 0.055, [0, 0.045, -1.53], this.materials.metalDark, 8);
    for (const side of [-1, 1]) {
      this.addBox(front, `Muzzle Vent ${side}`, [0.052, 0.035, 0.07], [side * 0.052, 0.085, -1.45], this.materials.groove, [0, 0, side * 0.2]);
    }
    this.muzzle.position.set(0, 0.045, -1.59);
    front.add(this.muzzle);
    this.weapon.add(front);
  }

  private buildGripAndTrigger(): void {
    const controls = new THREE.Group();
    controls.name = 'Grip And Fire Controls';
    const grip = this.extrudedSideProfile(
      [[-0.1, 0.11], [0.11, 0.09], [0.14, -0.32], [-0.02, -0.39], [-0.13, -0.24]],
      0.17,
      this.materials.rubber,
    );
    grip.position.set(-0.085, -0.2, 0.28);
    grip.rotation.x = -0.12;
    grip.name = 'Pistol Grip';
    controls.add(grip);
    for (let index = 0; index < 4; index += 1) {
      this.addBox(controls, `Grip Texture ${index + 1}`, [0.18, 0.015, 0.025], [0, -0.31 + index * 0.065, 0.31 + index * 0.008], this.materials.groove, [-0.12, 0, 0]);
    }
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 5, 12, Math.PI * 1.35), this.materials.metalDark);
    guard.name = 'Trigger Guard';
    guard.position.set(0, -0.17, 0.01);
    guard.rotation.set(0, Math.PI / 2, Math.PI * 0.83);
    controls.add(guard);
    this.addBox(controls, 'Trigger', [0.022, 0.105, 0.018], [0, -0.17, 0.02], this.materials.steel, [0.2, 0, 0]);
    this.addCylinder(controls, 'Selector Switch', 0.025, 0.027, [0.17, 0.005, 0.26], this.materials.accent, 8, 'x');
    this.weapon.add(controls);
  }

  private buildDragonChassis(): void {
    const chassis = new THREE.Group();
    chassis.name = 'Original Ember Spine Chassis';

    // Layered angular side armor keeps the readable rifle proportions while adding a restrained bio-mechanical silhouette.
    for (const side of [-1, 1]) {
      this.addBox(chassis, `Receiver Side Plate ${side}`, [0.035, 0.16, 0.52], [side * 0.176, 0.02, 0.07], this.materials.armorRed, [0.02, 0, side * 0.05]);
      this.addBox(chassis, `Brass Receiver Trim ${side}`, [0.018, 0.035, 0.43], [side * 0.198, 0.095, 0.04], this.materials.brass, [0.02, 0, side * 0.08]);
      this.addBox(chassis, `Forward Jaw Plate ${side}`, [0.04, 0.13, 0.55], [side * 0.188, 0.025, -0.55], this.materials.receiver, [0.04, 0, side * 0.09]);
      this.addBox(chassis, `Forward Ember Channel ${side}`, [0.018, 0.028, 0.46], [side * 0.213, 0.04, -0.55], this.materials.accent, [0.02, 0, side * 0.08]);
    }

    // Exposed energy core inspired by laboratory power hardware, not a copied weapon component.
    this.addCylinder(chassis, 'Ember Core', 0.064, 0.5, [0, 0.045, -0.62], this.materials.accent, 10);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.48, 12, 1, true), this.materials.energyGlass);
    glass.name = 'Energy Chamber Glass';
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, 0.045, -0.62);
    chassis.add(glass);
    for (const z of [-0.82, -0.7, -0.58, -0.46, -0.34]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 5, 10), this.materials.brass);
      rib.position.set(0, 0.045, z);
      chassis.add(rib);
    }

    // Low-poly dorsal fins form an original "ember spine" without obscuring the sights.
    for (let index = 0; index < 8; index += 1) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16 + index * 0.008, 4), index % 3 === 0 ? this.materials.brass : this.materials.metalDark);
      fin.name = `Dorsal Fin ${index + 1}`;
      fin.position.set(0, 0.34, -0.92 + index * 0.17);
      fin.rotation.y = Math.PI / 4;
      fin.scale.z = 0.55;
      chassis.add(fin);
    }

    for (const side of [-1, 1]) {
      const jaw = new THREE.Mesh(new THREE.TetrahedronGeometry(0.13, 0), this.materials.metalDark);
      jaw.name = `Muzzle Crown ${side}`;
      jaw.position.set(side * 0.09, 0.055, -1.5);
      jaw.rotation.set(0.2, side * 0.35, side * 0.2);
      jaw.scale.set(0.58, 0.82, 1.35);
      chassis.add(jaw);
    }
    this.weapon.add(chassis);
  }

  private buildMagazine(): void {
    this.magazine.name = 'Curved Magazine';
    const shape = new THREE.Shape();
    shape.moveTo(-0.08, 0.08);
    shape.lineTo(0.15, 0.06);
    shape.quadraticCurveTo(0.29, -0.13, 0.32, -0.48);
    shape.lineTo(0.14, -0.54);
    shape.quadraticCurveTo(0.1, -0.22, -0.05, -0.11);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.19, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.012, bevelThickness: 0.012, curveSegments: 5 });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-0.095, 0, 0);
    const body = new THREE.Mesh(geometry, this.materials.magazine);
    body.name = 'Magazine Body';
    this.magazine.add(body);
    for (let index = 0; index < 3; index += 1) {
      this.addBox(this.magazine, `Magazine Rib ${index + 1}`, [0.205, 0.018, 0.035], [0, -0.13 - index * 0.105, -0.08 - index * 0.035], this.materials.metalDark, [0.06, 0, 0]);
    }
    this.addBox(this.magazine, 'Magazine Brass Spine', [0.018, 0.38, 0.055], [0.113, -0.25, -0.12], this.materials.brass, [0.1, 0, -0.08]);
    this.addBox(this.magazine, 'Magazine Energy Channel', [0.016, 0.33, 0.04], [0.126, -0.25, -0.12], this.materials.accent, [0.1, 0, -0.08]);
    for (let index = 0; index < 5; index += 1) this.addBox(this.magazine, `Magazine Round Window ${index + 1}`, [0.014, 0.035, 0.045], [0.132, -0.08 - index * 0.075, -0.08 - index * 0.025], this.materials.energyGlass, [0, 0, 0]);
    this.addBox(this.magazine, 'Magazine Base Plate', [0.225, 0.055, 0.16], [0, -0.52, -0.2], this.materials.rubber, [0.08, 0, 0]);
    this.magazine.position.set(0, -0.17, 0.01);
    this.weapon.add(this.magazine);
  }

  private buildRailAndSights(): void {
    const rail = new THREE.Group();
    rail.name = 'Top Rail And Sights';
    this.addBox(rail, 'Top Rail Spine', [0.16, 0.035, 1.06], [0, 0.255, -0.15], this.materials.metalDark);
    for (let index = 0; index < 12; index += 1) {
      this.addBox(rail, `Rail Tooth ${index + 1}`, [0.215, 0.035, 0.045], [0, 0.285, 0.32 - index * 0.085], this.materials.steel);
    }
    const rearSight = new THREE.Group();
    rearSight.name = 'Rear Iron Sight';
    this.addBox(rearSight, 'Rear Sight Base', [0.2, 0.07, 0.13], [0, 0, 0], this.materials.receiver);
    this.addBox(rearSight, 'Rear Sight Left Ear', [0.035, 0.18, 0.05], [-0.073, 0.1, 0], this.materials.metalDark);
    this.addBox(rearSight, 'Rear Sight Right Ear', [0.035, 0.18, 0.05], [0.073, 0.1, 0], this.materials.metalDark);
    this.addCylinder(rearSight, 'Rear Aperture', 0.04, 0.022, [0, 0.12, -0.015], this.materials.groove, 10, 'z');
    rearSight.position.set(0, 0.315, 0.32);
    rail.add(rearSight);
    const frontSight = new THREE.Group();
    frontSight.name = 'Front Iron Sight';
    this.addBox(frontSight, 'Front Sight Base', [0.18, 0.065, 0.11], [0, 0, 0], this.materials.receiver);
    this.addBox(frontSight, 'Front Sight Post', [0.028, 0.2, 0.035], [0, 0.105, 0], this.materials.steel);
    this.addBox(frontSight, 'Front Sight Left Guard', [0.028, 0.17, 0.035], [-0.065, 0.08, 0], this.materials.metalDark, [0, 0, -0.15]);
    this.addBox(frontSight, 'Front Sight Right Guard', [0.028, 0.17, 0.035], [0.065, 0.08, 0], this.materials.metalDark, [0, 0, 0.15]);
    frontSight.position.set(0, 0.315, -0.74);
    rail.add(frontSight);

    const optic = new THREE.Group();
    optic.name = 'Ember Reflex Optic';
    this.addBox(optic, 'Optic Rail Clamp', [0.22, 0.055, 0.24], [0, 0, 0], this.materials.receiver);
    this.addBox(optic, 'Optic Left Frame', [0.035, 0.22, 0.15], [-0.09, 0.12, 0], this.materials.brass, [0, 0, -0.08]);
    this.addBox(optic, 'Optic Right Frame', [0.035, 0.22, 0.15], [0.09, 0.12, 0], this.materials.brass, [0, 0, 0.08]);
    this.addBox(optic, 'Optic Roof', [0.2, 0.04, 0.15], [0, 0.23, 0], this.materials.metalDark);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), this.materials.energyGlass);
    lens.name = 'Optic Lens';
    lens.position.set(0, 0.12, -0.079);
    optic.add(lens);
    this.addBox(optic, 'Optic Emitter', [0.055, 0.055, 0.06], [0.075, 0.1, 0.09], this.materials.accent);
    optic.position.set(0, 0.31, 0.03);
    rail.add(optic);
    this.weapon.add(rail);
  }

  private buildDetails(): void {
    const details = new THREE.Group();
    details.name = 'Surface Details';
    for (const [x, y, z] of [[0.166, 0.01, 0.37], [0.166, -0.07, 0.18], [0.166, 0.05, -0.18], [-0.166, 0.03, 0.31]] as const) {
      this.addCylinder(details, 'Receiver Screw', 0.018, 0.018, [x, y, z], this.materials.steel, 8, 'x');
    }
    this.addBox(details, 'Forward Accent Slash', [0.014, 0.055, 0.19], [0.172, -0.035, -0.48], this.materials.accent, [0.24, 0, 0]);
    const logoTexture = this.createLogoTexture();
    const logoMaterial = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), logoMaterial);
    logo.name = 'Yalong Prototype Mark';
    logo.position.set(0.171, 0.045, 0.19);
    logo.rotation.y = Math.PI / 2;
    details.add(logo);
    this.weapon.add(details);
  }

  private buildHands(): void {
    this.rightHand.name = 'Right Grip Hand';
    this.addBox(this.rightHand, 'Right Palm', [0.19, 0.2, 0.24], [0, 0, 0], this.materials.glove, [0.05, 0, -0.08]);
    for (let index = 0; index < 4; index += 1) {
      this.addBox(this.rightHand, `Right Finger ${index + 1}`, [0.035, 0.16, 0.055], [-0.065 + index * 0.045, -0.04, -0.12], this.materials.glove, [0.25, 0, 0]);
    }
    this.addBox(this.rightHand, 'Right Thumb', [0.055, 0.15, 0.065], [-0.105, 0.015, -0.02], this.materials.glove, [0.5, 0, -0.55]);
    for (let index = 0; index < 3; index += 1) this.addBox(this.rightHand, `Right Knuckle Plate ${index + 1}`, [0.045, 0.035, 0.065], [-0.055 + index * 0.055, 0.105, -0.075], this.materials.steel, [0, 0, 0]);
    this.addBox(this.rightHand, 'Right Glove Cuff', [0.2, 0.11, 0.19], [0.075, -0.18, 0.055], this.materials.armorRed, [0.08, 0, -0.16]);
    this.addBox(this.rightHand, 'Right Forearm', [0.135, 0.46, 0.14], [0.13, -0.34, 0.1], this.materials.sleeve, [0.14, 0, -0.28]);
    this.rightHand.position.set(0.015, -0.27, 0.31);
    this.rightHand.rotation.set(-0.13, 0.03, -0.02);

    this.leftHand.name = 'Left Support Hand';
    this.addBox(this.leftHand, 'Left Palm', [0.22, 0.18, 0.24], [0, 0, 0], this.materials.glove, [-0.05, 0, 0.06]);
    for (let index = 0; index < 4; index += 1) {
      this.addBox(this.leftHand, `Left Finger ${index + 1}`, [0.04, 0.14, 0.065], [-0.075 + index * 0.05, -0.08, 0.03], this.materials.glove, [-0.22, 0, 0]);
    }
    this.addBox(this.leftHand, 'Left Thumb', [0.06, 0.14, 0.07], [0.12, 0.025, -0.03], this.materials.glove, [0.52, 0, 0.48]);
    for (let index = 0; index < 3; index += 1) this.addBox(this.leftHand, `Left Knuckle Plate ${index + 1}`, [0.05, 0.035, 0.07], [-0.06 + index * 0.06, 0.095, -0.07], this.materials.steel, [0, 0, 0]);
    this.addBox(this.leftHand, 'Left Glove Cuff', [0.21, 0.11, 0.2], [-0.08, -0.18, 0.08], this.materials.armorRed, [-0.08, 0, 0.16]);
    this.addBox(this.leftHand, 'Left Forearm', [0.14, 0.5, 0.145], [-0.16, -0.39, 0.16], this.materials.sleeve, [-0.28, 0, 0.3]);
    this.leftHand.position.set(-0.015, -0.16, -0.52);
    this.leftHand.rotation.set(0.02, -0.03, 0.04);
    this.hands.add(this.rightHand, this.leftHand);
    this.hands.position.y = -0.035;
  }

  private captureHomePoses(): void {
    this.leftHandHome.copy(this.leftHand.position);
    this.leftHandHomeRotation.copy(this.leftHand.rotation);
    this.magazineHome.copy(this.magazine.position);
    this.magazineHomeRotation.copy(this.magazine.rotation);
    this.boltHome.copy(this.bolt.position);
    this.chargingHandleHome.copy(this.chargingHandle.position);
  }

  private createLogoTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ff5a2d';
    context.fillRect(5, 18, 10, 92);
    context.font = '700 42px Segoe UI, Microsoft YaHei';
    context.textBaseline = 'middle';
    context.fillText('炎龙 // YL-X2', 35, 64);
    context.fillStyle = '#aeb8bd';
    context.font = '600 18px Segoe UI';
    context.fillText('EMBER SPINE  /  KESTREL FORGE', 38, 105);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    return texture;
  }

  private extrudedSideProfile(points: Array<[number, number]>, width: number, material: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.01, bevelThickness: 0.01, curveSegments: 2 });
    geometry.rotateY(Math.PI / 2);
    return new THREE.Mesh(geometry, material);
  }

  private addBox(
    parent: THREE.Object3D,
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  private addCylinder(
    parent: THREE.Object3D,
    name: string,
    radius: number,
    length: number,
    position: [number, number, number],
    material: THREE.Material,
    segments = 8,
    axis: 'x' | 'y' | 'z' = 'z',
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments, 1, false), material);
    mesh.name = name;
    mesh.position.set(...position);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    mesh.rotation.x += rotation[0];
    mesh.rotation.y += rotation[1];
    mesh.rotation.z += rotation[2];
    parent.add(mesh);
    return mesh;
  }
}
