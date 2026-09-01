import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { Character } from './Character';
import type { CollisionWorld } from './CollisionWorld';
import type { MapBuilder } from './MapBuilder';
import { Team } from './types';

export class SpawnManager {
  constructor(
    private readonly map: MapBuilder,
    private readonly collision: CollisionWorld,
  ) {}

  placeRoundCharacters(characters: Character[]): void {
    const available = this.shuffle(this.map.spawnPoints.map((point) => point.clone()));
    const used: THREE.Vector3[] = [];
    characters.forEach((character, index) => {
      const preferred = available[index % available.length] ?? new THREE.Vector3(index * 1.5, 0, 18);
      const position = this.resolveValid(preferred, used);
      character.position.copy(position);
      used.push(position.clone());
    });
  }

  infectedRespawn(characters: Character[], respawning: Character): THREE.Vector3 {
    const humans = characters.filter((character) => character.alive && character.team === Team.Human);
    const occupied = characters.filter((character) => character.alive && character !== respawning);
    const candidates = this.map.infectedSpawnPoints.map((point) => this.resolveValid(point, occupied.map((character) => character.position)));
    if (!candidates.length) return new THREE.Vector3(0, 0, -28);

    return candidates.reduce((best, candidate) => {
      const score = this.spawnScore(candidate, humans, occupied);
      return score > best.score ? { position: candidate, score } : best;
    }, { position: candidates[0], score: -Infinity }).position.clone();
  }

  private spawnScore(position: THREE.Vector3, humans: Character[], occupied: Character[]): number {
    const nearestHuman = humans.length
      ? Math.min(...humans.map((human) => human.position.distanceTo(position)))
      : 30;
    const nearestOccupied = occupied.length
      ? Math.min(...occupied.map((character) => character.position.distanceTo(position)))
      : 10;
    const lastHumanPenalty = humans.length === 1 && nearestHuman < 18 ? (18 - nearestHuman) * 8 : 0;
    return nearestHuman + Math.min(8, nearestOccupied * 1.8) - lastHumanPenalty;
  }

  private resolveValid(preferred: THREE.Vector3, used: THREE.Vector3[]): THREE.Vector3 {
    const offsets = [
      new THREE.Vector3(),
      new THREE.Vector3(1.6, 0, 0),
      new THREE.Vector3(-1.6, 0, 0),
      new THREE.Vector3(0, 0, 1.6),
      new THREE.Vector3(0, 0, -1.6),
    ];
    for (const offset of offsets) {
      const candidate = preferred.clone().add(offset);
      const resolved = this.collision.resolveCircle(candidate, candidate, GAME_CONFIG.characterRadius);
      if (resolved.distanceToSquared(candidate) > 0.2) continue;
      if (used.every((position) => position.distanceToSquared(resolved) >= 2.25)) return resolved;
    }
    return this.collision.resolveCircle(preferred, preferred, GAME_CONFIG.characterRadius);
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
