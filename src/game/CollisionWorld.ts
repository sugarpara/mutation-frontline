import * as THREE from 'three';
import { GAME_CONFIG } from './config';

export interface CollisionObstacle {
  box: THREE.Box3;
  label: string;
  blocksSight: boolean;
}

export class CollisionWorld {
  readonly obstacles: CollisionObstacle[] = [];
  private groundResolver: (x: number, z: number, currentY: number) => number = () => 0;

  addBox(center: THREE.Vector3, size: THREE.Vector3, label = 'obstacle', blocksSight = true): void {
    const half = size.clone().multiplyScalar(0.5);
    this.obstacles.push({
      box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)),
      label,
      blocksSight,
    });
  }

  clear(): void { this.obstacles.length = 0; }

  setGroundResolver(resolver: (x: number, z: number, currentY: number) => number): void {
    this.groundResolver = resolver;
  }

  resolveCircle(current: THREE.Vector3, desired: THREE.Vector3, radius: number, height = 1.8): THREE.Vector3 {
    const result = desired.clone();
    result.x = THREE.MathUtils.clamp(result.x, -GAME_CONFIG.worldHalfWidth + radius, GAME_CONFIG.worldHalfWidth - radius);
    result.z = THREE.MathUtils.clamp(result.z, -GAME_CONFIG.worldHalfDepth + radius, GAME_CONFIG.worldHalfDepth - radius);

    for (let pass = 0; pass < 3; pass += 1) {
      for (const obstacle of this.obstacles) {
        if (result.y > obstacle.box.max.y + 0.3 || result.y + height < obstacle.box.min.y) continue;
        const closestX = THREE.MathUtils.clamp(result.x, obstacle.box.min.x, obstacle.box.max.x);
        const closestZ = THREE.MathUtils.clamp(result.z, obstacle.box.min.z, obstacle.box.max.z);
        let dx = result.x - closestX;
        let dz = result.z - closestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;

        if (distanceSq < 0.00001) {
          const distances = [
            { axis: 'x', value: Math.abs(result.x - obstacle.box.min.x), direction: -1 },
            { axis: 'x', value: Math.abs(obstacle.box.max.x - result.x), direction: 1 },
            { axis: 'z', value: Math.abs(result.z - obstacle.box.min.z), direction: -1 },
            { axis: 'z', value: Math.abs(obstacle.box.max.z - result.z), direction: 1 },
          ].sort((a, b) => a.value - b.value)[0];
          if (distances.axis === 'x') result.x += distances.direction * (distances.value + radius + 0.001);
          else result.z += distances.direction * (distances.value + radius + 0.001);
        } else {
          const distance = Math.sqrt(distanceSq);
          dx /= distance;
          dz /= distance;
          const push = radius - distance + 0.002;
          result.x += dx * push;
          result.z += dz * push;
        }
      }
    }

    if (!Number.isFinite(result.x) || !Number.isFinite(result.z)) return current.clone();
    return result;
  }

  lineBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const delta = to.clone().sub(from);
    const distance = delta.length();
    if (distance <= 0.001) return false;
    const ray = new THREE.Ray(from, delta.normalize());
    const hit = new THREE.Vector3();
    return this.obstacles.some((obstacle) => {
      if (!obstacle.blocksSight) return false;
      const intersection = ray.intersectBox(obstacle.box, hit);
      return intersection !== null && from.distanceTo(intersection) < distance - 0.15;
    });
  }

  firstHitDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): number {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    const hit = new THREE.Vector3();
    let closest = maxDistance;
    for (const obstacle of this.obstacles) {
      if (!obstacle.blocksSight) continue;
      const intersection = ray.intersectBox(obstacle.box, hit);
      if (!intersection) continue;
      const distance = origin.distanceTo(intersection);
      if (distance > 0.08 && distance < closest) closest = distance;
    }
    return closest;
  }

  getGroundHeight(x: number, z: number, currentY: number): number {
    return this.groundResolver(x, z, currentY);
  }
}
