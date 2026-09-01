import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld';
import type { MapId, NavigationNode } from './types';

type NodeData = [string, number, number, number, boolean?];

interface BoxOptions {
  collision?: boolean;
  sight?: boolean;
  label?: string;
  emissive?: number;
  roughness?: number;
  metalness?: number;
}

export class MapBuilder {
  readonly group = new THREE.Group();
  readonly navigationNodes: NavigationNode[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly infectedSpawnPoints: THREE.Vector3[] = [];
  readonly defensePoints: THREE.Vector3[] = [];
  currentMap: MapId = 'refinery';
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(private readonly scene: THREE.Scene, readonly collision: CollisionWorld) {
    this.group.name = 'Mutation Frontline Map';
    scene.add(this.group);
  }

  build(mapId: MapId = this.currentMap): void {
    this.currentMap = mapId;
    this.collision.clear();
    this.clearGroup();
    if (mapId === 'harbor') this.buildHarbor();
    else if (mapId === 'quarantine') this.buildQuarantine();
    else this.buildRefinery();
  }

  private buildRefinery(): void {
    this.group.name = 'Kestrel Dune Refinery';
    this.setAtmosphere(0x60361f, 0x6d3d26, 0xffc47f, 0x3b2619, 2.55, 0.0115, 0.48);
    this.addGround(0x604735, 0x8c6848, false);
    this.addBoundary(0x4a392e, 0xc0783b);

    // Open A warehouse.
    this.box(-29, 2.4, -8, 0.7, 4.8, 16, 0x59483c, { label: 'A warehouse wall' });
    this.box(-18, 2.4, -13, 0.7, 4.8, 6, 0x59483c, { label: 'A warehouse wall' });
    this.box(-18, 2.4, -3, 0.7, 4.8, 4, 0x59483c, { label: 'A warehouse wall' });
    this.box(-23.5, 2.4, -16, 11.7, 4.8, 0.7, 0x59483c, { label: 'A warehouse wall' });
    this.box(-26.5, 2.4, 0, 5.5, 4.8, 0.7, 0x59483c, { label: 'A warehouse wall' });
    this.addSign(-23.5, 3.15, -15.62, 'A / ORE STORAGE', 0xff8a42, Math.PI);
    this.addCrates([[-25, -11], [-21, -7], [-25, -3]], 0x72543d);

    // Central process hall and refinery silhouettes.
    this.box(1, 2.7, -1, 10, 5.4, 10, 0x594a40, { label: 'process hall' });
    this.box(1, 5.55, -1, 9.2, 0.25, 9.2, 0x292725, { collision: false, metalness: 0.55 });
    this.addSign(1, 3.35, 4.03, 'CRACKER CORE / R-08', 0xffa447, 0);
    for (const x of [-2, 1, 4]) this.addPipe(x, 6.4, -1, 0.32, 5.2, 0xa96938, 'y');
    for (const [x, z, height] of [[8, -27, 11], [-4, -27, 8], [18, -27, 7]] as const) this.addTower(x, z, height);

    // Pipe bridge and B platform.
    this.box(3, 4.08, -19, 26, 0.22, 4, 0x3e3a36, { collision: false, metalness: 0.62 });
    this.addRamp(-14, -19, 8, 4, 4.2, 0x564c43);
    this.addRailings(3, 4.92, -19, 26, 4, 0xb97b42);
    for (let x = -9; x <= 15; x += 3) this.box(x, 4.205, -19, 0.07, 0.025, 3.5, 0x8f765e, { collision: false, metalness: 0.58 });
    this.box(3, 4.21, -19, 24, 0.025, 0.055, 0xd28a43, { collision: false, emissive: 0x8c431f });
    for (const z of [-20.25, -17.75]) this.addPipe(3, 3.76, z, 0.16, 24, 0xa4542e, 'x');
    this.box(25, 2.86, -7, 12, 0.26, 11, 0x49423a, { collision: false, metalness: 0.45 });
    this.addRamp(15.5, -7, 7, 4, 3, 0x5d5145);
    this.addRailings(25, 3.5, -7, 12, 11, 0xff9d42);
    this.addSign(25, 4.1, -12.38, 'B / PRESSURE DECK', 0xffb14e, 0);
    this.defensePoints.push(new THREE.Vector3(-23, 0, -8), new THREE.Vector3(25, 3, -7));

    this.addLowRoute(23, 0x302c28, 0x9b5d34, 'LOW PIPE SERVICE');
    this.addTank(31, 15, 4.4, 0x655a4d, 0xb46c36);
    this.addTank(30, -20, 3.6, 0x5d554c, 0xb46c36);
    this.addCrates([[-12, 9], [13, 8], [18, 18], [-15, 18]], 0x66513d);
    this.addLights([[-33, 5], [-15, 8], [13, 11], [32, 1]], 0xffb466);
    this.addRefineryNavigation();
    this.collision.setGroundResolver((x, z, y) => this.refineryGround(x, z, y));
  }

  private buildHarbor(): void {
    this.group.name = 'Nocturne Harbor Freight Terminal';
    this.setAtmosphere(0x071624, 0x071624, 0x87bfea, 0x101c24, 2.2, 0.015, 1.05);
    this.addGround(0x22343e, 0x3d6b82, true);
    this.addBoundary(0x22313a, 0x3184b7);
    this.addWaterAndShip();

    this.box(-7, 3.1, -7, 11, 6.2, 10, 0x2d3941, { label: 'harbor operations west' });
    this.box(7.5, 2.5, -10, 9, 5, 8, 0x34414a, { label: 'harbor operations east' });
    this.addWindows(-7, 3.8, -12.02, 8.5, 0x8fd7ff);
    this.addWindows(7.5, 3.2, -14.02, 6.5, 0x72bfff);
    this.addSign(-7, 2.35, -1.96, 'NIGHT CARGO CONTROL', 0x6ac4ff, 0);

    this.addZoneMark(-24, 0.04, 7, 'A', 0xff9b3d);
    this.box(23, 2.78, 7, 13, 0.25, 11, 0x263640, { collision: false, metalness: 0.5 });
    this.addZoneMark(23, 2.92, 7, 'B', 0xffa23c);
    this.addRamp(14.5, 7, 7, 4, 2.9, 0x354853);
    this.addRailings(23, 3.45, 7, 13, 11, 0xeaa04c);
    this.defensePoints.push(new THREE.Vector3(-24, 0, 7), new THREE.Vector3(23, 2.9, 7));

    for (const [x, z, color, rotate] of [
      [-30, -10, 0x334f62, false], [-23, -21, 0x70413a, true], [-29, 17, 0x455d66, true],
      [18, -23, 0x5b3f48, false], [28, -16, 0x3c5666, true], [31, 18, 0x6d443d, true],
      [15, 18, 0x324d62, false], [-5, 16, 0x5a463d, false],
    ] as const) this.addContainer(x, z, color, rotate);

    this.box(2, 3.58, -18, 28, 0.22, 3.6, 0x263640, { collision: false, metalness: 0.66 });
    this.addRamp(-16, -18, 8, 3.6, 3.65, 0x354955);
    this.addRailings(2, 4.2, -18, 28, 3.6, 0x4e9bc7);
    this.addLowRoute(24, 0x18252c, 0x37a6d2, 'UNDERDOCK BYPASS');
    this.addCrane(29, -25);
    this.addLights([[-32, 4], [-15, 9], [12, 10], [32, 2], [2, 20]], 0xffc77a);
    this.addZoneLight(-28, 4, 22, 0x78bfff, 2.2, 24);
    this.addZoneLight(2, 5, 4, 0x8ed8ff, 1.8, 24);
    this.addHarborNavigation();
    this.collision.setGroundResolver((x, z, y) => this.harborGround(x, z, y));
  }

  private buildQuarantine(): void {
    this.group.name = 'Q-17 Underground Quarantine Sector';
    this.setAtmosphere(0x091417, 0x0b181a, 0x9be9df, 0x162326, 2.35, 0.0165, 1.65);
    this.addGround(0x1b272a, 0x3a6667, true);
    this.addBoundary(0x20282b, 0x3c7777);

    // Subway platform spine.
    this.box(0, 1.08, 0, 28, 0.24, 8, 0x293338, { collision: false, metalness: 0.45 });
    this.addRamp(-18, 0, 8, 4, 1.2, 0x303c40);
    this.box(1, 1.9, 0, 19, 2.7, 2.6, 0x354348, { label: 'quarantine train' });
    this.addWindows(1, 2.05, -1.32, 15.5, 0x87d7d6);
    this.addSign(0, 2.65, 4.02, 'Q-17 TRANSIT SPINE', 0x81e2d0, 0);

    this.box(0, 3.18, -18, 34, 0.22, 3.5, 0x263035, { collision: false, metalness: 0.55 });
    this.addRamp(-21, -18, 8, 3.5, 3.25, 0x334146);
    this.addRailings(0, 3.82, -18, 34, 3.5, 0x62b8b0);

    this.addRoom(-27, -13, 12, 9, 'COLLAPSE WARD', 0xa6423c);
    this.addRoom(-25, 9, 13, 10, 'MAINTENANCE HUB', 0xd0a24c);
    this.addRoom(4, -25, 17, 9, 'INCUBATION VAULT', 0x57dfbd);
    this.addIncubationTanks(4, -25);
    this.addRoom(27, -13, 12, 10, 'BIO ANALYSIS', 0xc33d43);
    this.addRoom(25, 8, 14, 10, 'SCREENING LAB', 0x5cd9cf);
    this.addRoom(-4, 18, 15, 8, 'MAINTENANCE TUNNEL', 0x8bb8b0);
    this.addLowRoute(25, 0x121a1d, 0x4cc6b3, 'DRAINAGE LOOP');
    this.addCrates([[-13, -8], [13, -6], [-14, 12], [13, 15]], 0x303d3e);
    this.addLights([[-17, -4], [17, 3], [-10, 17], [13, -19]], 0x70e2d2);
    this.addZoneLight(25, 3, -13, 0xff3f4c, 2.3, 16);
    this.addZoneLight(-27, 3, -13, 0xff5a45, 1.6, 14);
    this.addZoneLight(-28, 4, 24, 0x74d8cf, 2.6, 25);
    this.addZoneLight(0, 5, 8, 0x70cfc9, 2.2, 24);
    this.addZoneLight(-28, 4.5, 18, 0xa4eee3, 1.8, 22);
    this.defensePoints.push(new THREE.Vector3(-25, 0, 9), new THREE.Vector3(25, 0, 8));
    this.addQuarantineNavigation();
    this.collision.setGroundResolver((x, z, y) => this.quarantineGround(x, z, y));
  }

  private clearGroup(): void {
    const sharedMaterials = new Set<THREE.Material>(this.materials.values());
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (sharedMaterials.has(material)) return;
        const map = (material as THREE.MeshStandardMaterial).map;
        map?.dispose();
        material.dispose();
      });
    });
    this.group.clear();
    this.navigationNodes.length = 0;
    this.spawnPoints.length = 0;
    this.infectedSpawnPoints.length = 0;
    this.defensePoints.length = 0;
  }

  private setAtmosphere(background: number, fog: number, sky: number, ground: number, keyIntensity: number, density: number, ambientIntensity: number): void {
    this.scene.background = new THREE.Color(background);
    this.scene.fog = new THREE.FogExp2(fog, density);
    this.group.add(new THREE.HemisphereLight(sky, ground, 2));
    this.group.add(new THREE.AmbientLight(sky, ambientIntensity));
    const key = new THREE.DirectionalLight(sky, keyIntensity);
    key.position.set(-24, 38, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -45;
    key.shadow.camera.right = 45;
    key.shadow.camera.top = 38;
    key.shadow.camera.bottom = -38;
    this.group.add(key);
  }

  private addGround(color: number, gridColor: number, wet: boolean): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 64),
      new THREE.MeshStandardMaterial({ color, roughness: wet ? 0.3 : 0.92, metalness: wet ? 0.4 : 0.05, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    floor.receiveShadow = true;
    this.group.add(floor);
    const grid = new THREE.GridHelper(76, 38, gridColor, gridColor);
    grid.position.y = 0.005;
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((material) => { material.opacity = wet ? 0.15 : 0.23; material.transparent = true; });
    this.group.add(grid);
  }

  private addBoundary(color: number, accent: number): void {
    this.box(0, 2.1, -32, 77, 4.2, 0.7, color, { label: 'north boundary' });
    this.box(0, 2.1, 32, 77, 4.2, 0.7, color, { label: 'south boundary' });
    this.box(-38, 2.1, 0, 0.7, 4.2, 65, color, { label: 'west boundary' });
    this.box(38, 2.1, 0, 0.7, 4.2, 65, color, { label: 'east boundary' });
    for (let x = -33; x <= 33; x += 6) this.box(x, 4.35, -31.58, 4.2, 0.08, 0.14, accent, { collision: false, emissive: accent });
  }

  private addLowRoute(z: number, wallColor: number, accent: number, label: string): void {
    this.box(0, -2.65, z, 38, 0.2, 5.5, wallColor, { collision: false, metalness: 0.45 });
    this.box(0, -1.2, z - 2.75, 38, 2.9, 0.3, wallColor, { label: `${label} wall` });
    this.box(0, -1.2, z + 2.75, 38, 2.9, 0.3, wallColor, { label: `${label} wall` });
    this.addRamp(-23, z, 8, 5.5, -2.6, wallColor);
    this.addRamp(23, z, 8, 5.5, 2.6, wallColor, -2.6);
    for (let x = -15; x <= 15; x += 6) this.box(x, -0.2, z, 2.3, 0.06, 0.15, accent, { collision: false, emissive: accent });
    this.addSign(0, -0.7, z + 2.58, label, accent, Math.PI);
  }

  private addRoom(x: number, z: number, width: number, depth: number, label: string, accent: number): void {
    const wall = 0x263034;
    this.box(x - width / 2, 2.25, z, 0.55, 4.5, depth, wall, { label: `${label} wall` });
    this.box(x + width / 2, 2.25, z, 0.55, 4.5, depth, wall, { label: `${label} wall` });
    this.box(x, 2.25, z - depth / 2, width, 4.5, 0.55, wall, { label: `${label} wall` });
    this.box(x - width * 0.3, 2.25, z + depth / 2, width * 0.28, 4.5, 0.55, wall, { label: `${label} wall` });
    this.box(x + width * 0.3, 2.25, z + depth / 2, width * 0.28, 4.5, 0.55, wall, { label: `${label} wall` });
    this.addSign(x, 3.1, z + depth / 2 + 0.29, label, accent, Math.PI);
    this.addZoneLight(x, 2.8, z, accent, 1.1, Math.max(width, depth));
  }

  private addIncubationTanks(x: number, z: number): void {
    for (const offset of [-4.5, -1.5, 1.5, 4.5]) {
      const material = new THREE.MeshStandardMaterial({ color: 0x62b9a8, emissive: 0x2a9c83, emissiveIntensity: 0.85, transparent: true, opacity: 0.42, roughness: 0.2 });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.1, 10), material);
      tank.position.set(x + offset, 1.55, z);
      this.group.add(tank);
      this.collision.addBox(tank.position, new THREE.Vector3(1.2, 3.1, 1.2), 'incubation tank');
    }
  }

  private addWaterAndShip(): void {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(110, 42), new THREE.MeshStandardMaterial({ color: 0x071e32, roughness: 0.18, metalness: 0.5 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.3, -51);
    this.group.add(water);
    this.box(9, 3, -43, 28, 5, 7, 0x142631, { collision: false, metalness: 0.5 });
    this.box(9, 6.3, -43, 8, 2.8, 5, 0x263b47, { collision: false });
    this.addZoneLight(9, 7, -39, 0xffad64, 1.8, 18);
  }

  private addCrane(x: number, z: number): void {
    for (const side of [-1, 1]) this.box(x + side * 5, 6, z, 0.55, 12, 0.55, 0x6d4f2f, { collision: false, metalness: 0.65 });
    this.box(x, 12, z, 12, 0.55, 0.7, 0x765632, { collision: false, metalness: 0.7 });
    this.box(x - 2, 12, z - 6, 0.45, 0.45, 12, 0x765632, { collision: false, metalness: 0.7 });
  }

  private addTower(x: number, z: number, height: number): void {
    this.addPipe(x, height / 2, z, 0.65, height, 0x55473c, 'y');
    for (let y = 2; y < height; y += 2.1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.055, 6, 14), this.material(0xb36c36, 0.38, 0.65));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      this.group.add(ring);
    }
  }

  private addTank(x: number, z: number, radius: number, color: number, accent: number): void {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 4.8, 16), this.material(color, 0.55, 0.52));
    tank.position.set(x, 2.4, z);
    tank.castShadow = true;
    this.group.add(tank);
    this.collision.addBox(tank.position, new THREE.Vector3(radius * 1.65, 4.8, radius * 1.65), 'storage tank');
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.82, 0.07, 6, 20), this.material(accent, 0.4, 0.6));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 4.75, z);
    this.group.add(rim);
  }

  private addContainer(x: number, z: number, color: number, rotate: boolean): void {
    const width = rotate ? 3 : 7.5;
    const depth = rotate ? 7.5 : 3;
    this.box(x, 1.35, z, width, 2.7, depth, color, { label: 'cargo container', metalness: 0.45 });
    for (const offset of [-0.32, 0, 0.32]) {
      this.box(x + (rotate ? offset * width : 0), 1.35, z + (rotate ? 0 : offset * depth), rotate ? 0.05 : width + 0.04, 2.45, rotate ? depth + 0.04 : 0.05, 0x18232a, { collision: false });
    }
  }

  private addCrates(points: Array<[number, number]>, color: number): void {
    points.forEach(([x, z], index) => {
      const size = index % 2 ? 1.8 : 2.2;
      this.box(x, size * 0.42, z, size, size * 0.84, size, color, { label: 'supply crate', metalness: 0.22 });
      this.box(x, size * 0.86, z, size + 0.04, 0.06, size + 0.04, 0x262b2c, { collision: false });
    });
  }

  private addLights(points: Array<[number, number]>, color: number): void {
    points.forEach(([x, z]) => {
      this.box(x, 2.8, z, 0.12, 5.6, 0.12, 0x4b5354, { collision: false, metalness: 0.7 });
      this.box(x, 5.55, z, 1.2, 0.12, 0.35, color, { collision: false, emissive: color });
      this.addZoneLight(x, 5.3, z, color, 1.25, 13);
    });
  }

  private addWindows(x: number, y: number, z: number, width: number, color: number): void {
    for (let offset = -width / 2 + 0.7; offset < width / 2; offset += 1.4) this.box(x + offset, y, z, 0.8, 0.45, 0.05, color, { collision: false, emissive: color });
  }

  private addZoneMark(x: number, y: number, z: number, label: string, color: number): void {
    const texture = this.makeTexture(label, color, 128, 128, 72);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, y, z);
    this.group.add(mark);
  }

  private addZoneLight(x: number, y: number, z: number, color: number, intensity: number, distance: number): void {
    const light = new THREE.PointLight(color, intensity, distance, 1.7);
    light.position.set(x, y, z);
    this.group.add(light);
  }

  private addRailings(x: number, y: number, z: number, width: number, depth: number, color: number): void {
    this.box(x, y, z - depth / 2, width, 0.1, 0.1, color, { collision: false, emissive: color });
    this.box(x, y, z + depth / 2, width, 0.1, 0.1, color, { collision: false, emissive: color });
    for (let px = x - width / 2; px <= x + width / 2; px += 2.8) {
      this.box(px, y - 0.35, z - depth / 2, 0.09, 0.8, 0.09, color, { collision: false });
      this.box(px, y - 0.35, z + depth / 2, 0.09, 0.8, 0.09, color, { collision: false });
    }
  }

  private addRamp(x: number, z: number, length: number, width: number, heightDelta: number, color: number, startY = 0): void {
    const slopeLength = Math.hypot(length, heightDelta);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(slopeLength, 0.22, width), this.material(color, 0.68, 0.38));
    ramp.rotation.z = Math.atan2(heightDelta, length);
    ramp.position.set(x, startY + heightDelta / 2 - 0.08, z);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.group.add(ramp);
  }

  private addPipe(x: number, y: number, z: number, radius: number, length: number, color: number, axis: 'x' | 'y' | 'z'): void {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), this.material(color, 0.42, 0.65));
    pipe.position.set(x, y, z);
    if (axis === 'x') pipe.rotation.z = Math.PI / 2;
    if (axis === 'z') pipe.rotation.x = Math.PI / 2;
    pipe.castShadow = true;
    this.group.add(pipe);
  }

  private addSign(x: number, y: number, z: number, text: string, color: number, rotationY: number): void {
    const texture = this.makeTexture(text, color, 512, 96, 29);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.9), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    sign.position.set(x, y, z);
    sign.rotation.y = rotationY;
    this.group.add(sign);
  }

  private makeTexture(text: string, color: number, width: number, height: number, fontSize: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(5, 10, 13, 0.88)';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.lineWidth = Math.max(3, width / 120);
    context.strokeRect(4, 4, width - 8, height - 8);
    context.fillStyle = '#e7eff1';
    context.font = `bold ${fontSize}px Segoe UI`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private box(x: number, y: number, z: number, width: number, height: number, depth: number, color: number, options: BoxOptions = {}): THREE.Mesh {
    const material = options.emissive !== undefined
      ? new THREE.MeshStandardMaterial({ color, emissive: options.emissive, emissiveIntensity: 1.25, roughness: options.roughness ?? 0.5, metalness: options.metalness ?? 0.25 })
      : this.material(color, options.roughness, options.metalness);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (options.collision !== false) this.collision.addBox(mesh.position, new THREE.Vector3(width, height, depth), options.label ?? 'structure', options.sight ?? true);
    return mesh;
  }

  private material(color: number, roughness = 0.78, metalness = 0.18): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}:${metalness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return this.materials.get(key)!;
  }

  private setNavigation(data: NodeData[], links: Array<[string, string]>, spawns: THREE.Vector3[], infectedSpawns: THREE.Vector3[]): void {
    const nodes = new Map<string, NavigationNode>();
    data.forEach(([id, x, y, z, defense]) => nodes.set(id, { id, position: new THREE.Vector3(x, y, z), neighbors: [], defense }));
    links.forEach(([a, b]) => { nodes.get(a)?.neighbors.push(b); nodes.get(b)?.neighbors.push(a); });
    this.navigationNodes.push(...nodes.values());
    this.spawnPoints.push(...spawns);
    this.infectedSpawnPoints.push(...infectedSpawns);
  }

  private addRefineryNavigation(): void {
    const data: NodeData[] = [
      ['spawn',-30,0,24], ['south-west',-15,0,17], ['south-mid',0,0,15], ['south-east',15,0,17],
      ['warehouse-south',-24,0,3], ['warehouse',-23,0,-8,true], ['warehouse-north',-22,0,-20],
      ['core-west',-8,0,-1], ['core-north',1,0,-9], ['core-east',10,0,-1], ['core-south',1,0,7],
      ['bridge-ramp',-18,0,-19], ['bridge-west',-10,4.2,-19], ['bridge-mid',3,4.2,-19], ['bridge-east',16,4.2,-19],
      ['b-ramp',13,0,-7], ['b-deck',25,3,-7,true], ['tank-north',26,0,-24], ['tank-south',24,0,16],
      ['low-west-entry',-29,0,23], ['low-west',-19,-2.6,23], ['low-mid',0,-2.6,23], ['low-east',19,-2.6,23], ['low-east-entry',29,0,23],
    ];
    const links: Array<[string,string]> = [
      ['spawn','south-west'], ['spawn','low-west-entry'], ['south-west','warehouse-south'], ['south-west','south-mid'],
      ['warehouse-south','warehouse'], ['warehouse-south','core-west'], ['warehouse','warehouse-north'], ['warehouse-north','bridge-ramp'],
      ['bridge-ramp','bridge-west'], ['bridge-west','bridge-mid'], ['bridge-mid','bridge-east'], ['bridge-east','tank-north'],
      ['core-west','core-north'], ['core-west','core-south'], ['core-north','core-east'], ['core-north','b-ramp'],
      ['core-east','core-south'], ['core-east','b-ramp'], ['b-ramp','b-deck'], ['b-deck','tank-north'], ['b-deck','tank-south'],
      ['core-south','south-mid'], ['south-mid','south-east'], ['south-east','tank-south'], ['tank-south','low-east-entry'],
      ['low-west-entry','low-west'], ['low-west','low-mid'], ['low-mid','low-east'], ['low-east','low-east-entry'],
    ];
    this.setNavigation(data, links, this.humanSpawns(16), this.cornerSpawns());
  }

  private addHarborNavigation(): void {
    const data: NodeData[] = [
      ['spawn',-31,0,23], ['a-yard',-24,0,7,true], ['west-north',-23,0,-18], ['west-mid',-16,0,-2], ['west-south',-14,0,16],
      ['ops-west-north',-14,0,-12], ['ops-west-south',-7,0,0], ['center',1,0,6], ['ops-east',14,0,-8],
      ['bridge-ramp',-20,0,-18], ['bridge-west',-12,3.65,-18], ['bridge-mid',2,3.65,-18], ['bridge-east',16,3.65,-18],
      ['b-ramp',12,0,7], ['b-yard',23,2.9,7,true], ['east-north',28,0,-18], ['east-south',29,0,20],
      ['low-west-entry',-29,0,24], ['low-west',-19,-2.6,24], ['low-mid',0,-2.6,24], ['low-east',19,-2.6,24], ['low-east-entry',29,0,24],
    ];
    const links: Array<[string,string]> = [
      ['spawn','a-yard'], ['spawn','low-west-entry'], ['a-yard','west-mid'], ['a-yard','west-south'], ['a-yard','west-north'],
      ['west-north','bridge-ramp'], ['bridge-ramp','bridge-west'], ['bridge-west','bridge-mid'], ['bridge-mid','bridge-east'], ['bridge-east','east-north'],
      ['west-mid','ops-west-north'], ['west-mid','ops-west-south'], ['ops-west-north','ops-east'], ['ops-west-south','center'], ['center','ops-east'],
      ['center','b-ramp'], ['b-ramp','b-yard'], ['b-yard','east-north'], ['b-yard','east-south'], ['west-south','center'],
      ['west-south','low-west-entry'], ['east-south','low-east-entry'], ['low-west-entry','low-west'], ['low-west','low-mid'], ['low-mid','low-east'], ['low-east','low-east-entry'],
    ];
    this.setNavigation(data, links, this.humanSpawns(10), this.cornerSpawns());
  }

  private addQuarantineNavigation(): void {
    const data: NodeData[] = [
      ['spawn',-31,0,24], ['maintenance',-25,0,9,true], ['collapse',-27,0,-13], ['west-platform',-17,1.2,0],
      ['platform-west',-10,1.2,5], ['platform-east',11,1.2,5], ['center-north',0,0,-8], ['center-south',0,0,10],
      ['upper-ramp',-25,0,-18], ['upper-west',-17,3.25,-18], ['upper-mid',0,3.25,-18], ['upper-east',17,3.25,-18],
      ['incubation',4,0,-20], ['bio-lab',27,0,-13], ['screening',25,0,8,true], ['east-south',28,0,19],
      ['low-west-entry',-29,0,25], ['low-west',-19,-2.6,25], ['low-mid',0,-2.6,25], ['low-east',19,-2.6,25], ['low-east-entry',29,0,25],
    ];
    const links: Array<[string,string]> = [
      ['spawn','maintenance'], ['spawn','low-west-entry'], ['maintenance','collapse'], ['maintenance','platform-west'], ['collapse','upper-ramp'],
      ['upper-ramp','upper-west'], ['upper-west','upper-mid'], ['upper-mid','upper-east'], ['upper-mid','incubation'], ['upper-east','bio-lab'],
      ['west-platform','platform-west'], ['platform-west','center-north'], ['platform-west','center-south'], ['platform-east','center-north'], ['platform-east','center-south'],
      ['center-north','incubation'], ['center-north','bio-lab'], ['center-south','screening'], ['screening','bio-lab'], ['screening','east-south'],
      ['center-south','maintenance'], ['east-south','low-east-entry'], ['low-west-entry','low-west'], ['low-west','low-mid'], ['low-mid','low-east'], ['low-east','low-east-entry'],
    ];
    this.setNavigation(data, links, this.humanSpawns(17, 20), this.cornerSpawns());
  }

  private humanSpawns(secondRowZ: number, firstRowZ = 28): THREE.Vector3[] {
    return [
      new THREE.Vector3(-34,0,firstRowZ), new THREE.Vector3(-30,0,firstRowZ), new THREE.Vector3(-26,0,firstRowZ), new THREE.Vector3(-22,0,firstRowZ),
      new THREE.Vector3(-34,0,secondRowZ), new THREE.Vector3(-30,0,secondRowZ), new THREE.Vector3(-26,0,secondRowZ), new THREE.Vector3(-22,0,secondRowZ),
    ];
  }

  private cornerSpawns(): THREE.Vector3[] {
    return [new THREE.Vector3(34,0,-27), new THREE.Vector3(-34,0,-27), new THREE.Vector3(34,0,27), new THREE.Vector3(31,0,17)];
  }

  private refineryGround(x: number, z: number, y: number): number {
    if (z >= 20.25 && z <= 25.75) return this.lowRouteGround(x, y);
    if (z >= -21 && z <= -17) {
      if (x >= -18 && x < -10) return 4.2 * ((x + 18) / 8);
      if (x >= -10 && x <= 16 && y > 1.1) return 4.2;
    }
    if (z >= -9 && z <= -5 && x >= 12 && x < 19) return 3 * ((x - 12) / 7);
    if (z >= -12.5 && z <= -1.5 && x >= 19 && x <= 31 && y > 0.8) return 3;
    return 0;
  }

  private harborGround(x: number, z: number, y: number): number {
    if (z >= 21.25 && z <= 26.75) return this.lowRouteGround(x, y);
    if (z >= -19.8 && z <= -16.2) {
      if (x >= -20 && x < -12) return 3.65 * ((x + 20) / 8);
      if (x >= -12 && x <= 16 && y > 1) return 3.65;
    }
    if (z >= 5 && z <= 9 && x >= 11 && x < 18) return 2.9 * ((x - 11) / 7);
    if (z >= 1.5 && z <= 12.5 && x >= 16.5 && x <= 29.5 && y > 0.8) return 2.9;
    return 0;
  }

  private quarantineGround(x: number, z: number, y: number): number {
    if (z >= 22.25 && z <= 27.75) return this.lowRouteGround(x, y);
    if (z >= -19.75 && z <= -16.25) {
      if (x >= -25 && x < -17) return 3.25 * ((x + 25) / 8);
      if (x >= -17 && x <= 17 && y > 0.9) return 3.25;
    }
    if (z >= -4 && z <= 4) {
      if (x >= -22 && x < -18) return 1.2 * ((x + 22) / 4);
      if (x >= -18 && x <= 18 && y > 0.45) return 1.2;
    }
    return 0;
  }

  private lowRouteGround(x: number, y: number): number {
    if (x >= -27 && x < -19) return -2.6 * ((x + 27) / 8);
    if (x > 19 && x <= 27) return -2.6 * ((27 - x) / 8);
    if (x >= -19 && x <= 19 && y < -0.75) return -2.6;
    return 0;
  }
}
