import * as THREE from 'three';
import { AudioManager } from './AudioManager';
import { Character } from './Character';
import { GAME_CONFIG, WEAPONS } from './config';
import { CollisionWorld } from './CollisionWorld';
import { MapBuilder } from './MapBuilder';
import { AIState, CharacterRole, GamePhase, Team, WeaponKind, type DamageResult, type NavigationNode } from './types';

interface AICallbacks {
  getCharacters: () => Character[];
  applyDamage: (attacker: Character, target: Character, damage: number, headshot: boolean) => DamageResult;
  getPlayer: () => Character;
  getTacticalPoint?: (character: Character) => THREE.Vector3 | null;
  isObjectiveInteracting?: (character: Character) => boolean;
}

export class AIController {
  state = AIState.Defend;
  private target: Character | null = null;
  private path: NavigationNode[] = [];
  private pathIndex = 0;
  private pathRefresh = 0;
  private lastGoal = new THREE.Vector3(999, 999, 999);
  private shootCooldown = 0;
  private attackCooldown = 0;
  private attackWindup = 0;
  private pendingAttackTarget: Character | null = null;
  private reloadTimer = 0;
  private ammo = WEAPONS[WeaponKind.Rifle].magazine;
  private reserve = WEAPONS[WeaponKind.Rifle].reserve;
  private boostCooldown = 4 + Math.random() * 4;
  private boostRemaining = 0;
  private stuckTimer = 0;
  private sidestepTimer = 0;
  private sidestepSign = Math.random() > 0.5 ? 1 : -1;
  private lastRole: CharacterRole;
  private defenseTarget: THREE.Vector3 | null = null;

  constructor(
    readonly character: Character,
    private readonly scene: THREE.Scene,
    private readonly map: MapBuilder,
    private readonly collision: CollisionWorld,
    private readonly audio: AudioManager,
    private readonly callbacks: AICallbacks,
  ) {
    this.lastRole = character.role;
  }

  reset(): void {
    this.state = AIState.Defend;
    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.pathRefresh = 0;
    this.shootCooldown = Math.random() * 0.35;
    this.attackCooldown = 0;
    this.attackWindup = 0;
    this.pendingAttackTarget = null;
    this.reloadTimer = 0;
    this.ammo = WEAPONS[WeaponKind.Rifle].magazine;
    this.reserve = WEAPONS[WeaponKind.Rifle].reserve;
    this.boostCooldown = 4 + Math.random() * 4;
    this.boostRemaining = 0;
    this.stuckTimer = 0;
    this.defenseTarget = null;
    this.lastRole = this.character.role;
  }

  update(delta: number, phase: GamePhase): void {
    if (!this.character.alive) {
      this.state = AIState.Respawn;
      this.character.velocity.set(0, 0, 0);
      return;
    }
    if (this.lastRole !== this.character.role) {
      this.reset();
      this.lastRole = this.character.role;
    }
    if (this.character.stunRemaining > 0) {
      this.character.velocity.set(0, 0, 0);
      this.character.update(delta, false);
      return;
    }
    this.shootCooldown = Math.max(0, this.shootCooldown - delta);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.boostCooldown = Math.max(0, this.boostCooldown - delta);
    this.boostRemaining = Math.max(0, this.boostRemaining - delta);
    this.pathRefresh = Math.max(0, this.pathRefresh - delta);
    this.sidestepTimer = Math.max(0, this.sidestepTimer - delta);

    if (this.callbacks.isObjectiveInteracting?.(this.character)) {
      this.state = AIState.Defend;
      this.character.velocity.set(0, 0, 0);
      this.pendingAttackTarget = null;
      this.attackWindup = 0;
      this.character.update(delta, false);
      return;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - delta);
      this.state = AIState.Reload;
      if (this.reloadTimer === 0) this.finishReload();
      this.character.update(delta, false);
      return;
    }

    if (phase === GamePhase.Countdown) {
      this.state = AIState.Defend;
      this.navigateTo(this.getDefenseTarget(), delta, this.character.speed * 0.76);
      return;
    }
    if (phase !== GamePhase.Active) return;

    if (this.character.team === Team.Infected) this.updateInfected(delta);
    else this.updateHuman(delta);
  }

  private updateHuman(delta: number): void {
    this.target = this.nearestHostile();
    const tacticalPoint = this.callbacks.getTacticalPoint?.(this.character) ?? null;
    if (!this.target) {
      this.state = AIState.Follow;
      const player = this.callbacks.getPlayer();
      const destination = tacticalPoint ?? (player.team === this.character.team ? player.position : this.getDefenseTarget());
      this.navigateTo(destination, delta, this.character.speed * 0.8);
      return;
    }

    const distance = this.character.position.distanceTo(this.target.position);
    const canSee = this.hasLineOfSight(this.target);
    if (tacticalPoint && (!canSee || distance > 18)) {
      this.state = AIState.Defend;
      this.navigateTo(tacticalPoint, delta, this.character.speed * 0.9);
      return;
    }
    if (this.character.health < this.character.maxHealth * 0.34 && distance < 18) {
      this.state = AIState.Retreat;
      this.moveAwayFrom(this.target.position, delta, this.character.speed);
      return;
    }
    if (distance < 5.2) {
      this.state = AIState.Evade;
      this.moveAwayFrom(this.target.position, delta, this.character.speed * 1.1);
      if (canSee) this.shootAt(this.target);
      return;
    }
    if (canSee && distance < 30) {
      this.state = AIState.Shoot;
      this.character.velocity.set(0, 0, 0);
      this.faceTarget(this.target.position);
      this.character.update(delta, false);
      this.shootAt(this.target);
      return;
    }
    this.state = AIState.Search;
    const searchPoint = distance < 34 ? this.target.position : tacticalPoint ?? this.getDefenseTarget();
    this.navigateTo(searchPoint, delta, this.character.speed * 0.92);
  }

  private updateInfected(delta: number): void {
    if (this.attackWindup > 0) {
      this.state = AIState.Attack;
      this.character.velocity.set(0, 0, 0);
      if (this.pendingAttackTarget?.alive) this.faceTarget(this.pendingAttackTarget.position);
      this.character.update(delta, false);
      this.attackWindup = Math.max(0, this.attackWindup - delta);
      if (this.attackWindup === 0) this.resolveMeleeAttack();
      return;
    }
    this.target = this.nearestEnemy(Team.Human);
    if (!this.target) {
      this.state = AIState.Search;
      this.character.velocity.set(0, 0, 0);
      return;
    }
    const distance = this.character.position.distanceTo(this.target.position);
    if (this.character.role === CharacterRole.AlphaInfected && this.boostCooldown <= 0 && distance > 8 && distance < 26) {
      this.boostRemaining = GAME_CONFIG.alphaInfected.boostDuration;
      this.boostCooldown = GAME_CONFIG.alphaInfected.boostCooldown;
    }
    if (distance <= GAME_CONFIG.infected.attackRange && this.hasLineOfSight(this.target)) {
      this.state = AIState.Attack;
      this.character.velocity.set(0, 0, 0);
      this.faceTarget(this.target.position);
      this.character.update(delta, false);
      if (this.attackCooldown <= 0) {
        this.attackCooldown = GAME_CONFIG.infected.attackInterval;
        this.attackWindup = GAME_CONFIG.infected.attackWindup;
        this.pendingAttackTarget = this.target;
        this.audio.meleeSwing();
      }
      return;
    }
    this.state = AIState.Chase;
    const multiplier = this.boostRemaining > 0 ? GAME_CONFIG.alphaInfected.boostMultiplier : 1;
    this.navigateTo(this.target.position, delta, this.character.speed * multiplier);
  }

  private shootAt(target: Character): void {
    const definition = WEAPONS[WeaponKind.Rifle];
    if (this.shootCooldown > 0) return;
    if (this.ammo <= 0) {
      if (this.reserve > 0) {
        this.reloadTimer = definition.reloadTime;
        this.audio.reload();
      }
      return;
    }
    this.shootCooldown = definition.fireInterval * 4.15 + Math.random() * 0.12;
    this.ammo -= 1;
    this.character.stats.shots += 1;
    const start = this.character.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const targetPoint = target.position.clone().add(new THREE.Vector3(0, 1.12, 0));
    const distance = start.distanceTo(targetPoint);
    const hitChance = THREE.MathUtils.clamp(0.72 - distance * 0.02, 0.2, 0.64);
    const hit = Math.random() < hitChance;
    const headshot = hit && Math.random() < 0.12;
    const end = hit
      ? target.position.clone().add(new THREE.Vector3(0, headshot ? 1.72 : 1.08, 0))
      : targetPoint.add(new THREE.Vector3((Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 3.5));
    this.character.flashMuzzle();
    this.spawnTracer(start, end, this.character.team === Team.Attackers ? 0xffb14d : 0x60c9ff);
    if (distance < 20 && start.distanceTo(this.callbacks.getPlayer().position) < 23) {
      this.audio.shoot('rifle');
    }
    if (!hit) return;
    const damage = definition.damage * (headshot ? definition.headMultiplier : 1);
    const result = this.callbacks.applyDamage(this.character, target, damage, headshot);
    if (result.applied) this.character.stats.hits += 1;
  }

  private finishReload(): void {
    const definition = WEAPONS[WeaponKind.Rifle];
    const needed = definition.magazine - this.ammo;
    const transfer = Math.min(needed, this.reserve);
    this.ammo += transfer;
    this.reserve -= transfer;
    if (this.reserve <= 0) this.reserve = definition.reserve;
  }

  private nearestEnemy(team: Team): Character | null {
    let nearest: Character | null = null;
    let bestDistance = Infinity;
    for (const character of this.callbacks.getCharacters()) {
      if (!character.alive || character.team !== team || character === this.character) continue;
      const distance = this.character.position.distanceToSquared(character.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = character;
      }
    }
    return nearest;
  }

  private nearestHostile(): Character | null {
    let nearest: Character | null = null;
    let bestDistance = Infinity;
    for (const character of this.callbacks.getCharacters()) {
      if (!character.alive || character.team === this.character.team || character === this.character) continue;
      const distance = this.character.position.distanceToSquared(character.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = character;
      }
    }
    return nearest;
  }

  private hasLineOfSight(target: Character): boolean {
    const from = this.character.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const to = target.position.clone().add(new THREE.Vector3(0, 1.05, 0));
    return !this.collision.lineBlocked(from, to);
  }

  private getDefenseTarget(): THREE.Vector3 {
    if (this.defenseTarget && this.character.position.distanceTo(this.defenseTarget) > 2.2) return this.defenseTarget;
    const defenseIds = new Set(this.map.navigationNodes.filter((node) => node.defense).map((node) => node.id));
    const choices = this.map.navigationNodes
      .filter((node) => node.defense || node.neighbors.some((neighbor) => defenseIds.has(neighbor)))
      .map((node) => node.position);
    const fallback = this.map.defensePoints.length ? this.map.defensePoints : [new THREE.Vector3(0, 0, 12)];
    const pool = choices.length ? choices : fallback;
    const indexed = Math.abs(Number.parseInt(this.character.id.replace(/\D/g, ''), 10) || 0) % pool.length;
    this.defenseTarget = pool[indexed].clone();
    return this.defenseTarget;
  }

  private moveAwayFrom(danger: THREE.Vector3, delta: number, speed: number): void {
    const direction = this.character.position.clone().sub(danger).setY(0);
    if (direction.lengthSq() < 0.01) direction.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    direction.normalize();
    this.moveDirection(direction, delta, speed);
  }

  private navigateTo(goal: THREE.Vector3, delta: number, speed: number): void {
    const here = this.character.position;
    const verticalDifference = Math.abs(goal.y - here.y);
    const direct = !this.collision.lineBlocked(
      here.clone().add(new THREE.Vector3(0, 0.8, 0)),
      goal.clone().add(new THREE.Vector3(0, 0.8, 0)),
    );
    let waypoint = goal;
    if (!direct || verticalDifference > 1.5) {
      if (this.pathRefresh <= 0 || this.lastGoal.distanceToSquared(goal) > 16 || this.pathIndex >= this.path.length) {
        this.path = this.findPath(here, goal);
        this.pathIndex = 0;
        this.pathRefresh = 0.8 + Math.random() * 0.45;
        this.lastGoal.copy(goal);
      }
      if (this.path.length) {
        waypoint = this.path[Math.min(this.pathIndex, this.path.length - 1)].position;
        if (here.distanceTo(waypoint) < 1.15) {
          this.pathIndex += 1;
          waypoint = this.path[Math.min(this.pathIndex, this.path.length - 1)]?.position ?? goal;
        }
      }
    }
    const direction = waypoint.clone().sub(here).setY(0);
    if (direction.lengthSq() < 0.015) {
      this.character.velocity.set(0, 0, 0);
      this.character.update(delta, false);
      return;
    }
    direction.normalize();
    this.moveDirection(direction, delta, speed);
  }

  private moveDirection(direction: THREE.Vector3, delta: number, speed: number): void {
    if (this.sidestepTimer > 0) {
      direction = new THREE.Vector3(-direction.z * this.sidestepSign, 0, direction.x * this.sidestepSign).normalize();
    }
    const separation = new THREE.Vector3();
    for (const other of this.callbacks.getCharacters()) {
      if (!other.alive || other === this.character) continue;
      const offset = this.character.position.clone().sub(other.position).setY(0);
      const distanceSq = offset.lengthSq();
      if (distanceSq <= 0.0001 || distanceSq > 2.25) continue;
      separation.add(offset.normalize().multiplyScalar((2.25 - distanceSq) / 2.25));
    }
    if (separation.lengthSq() > 0.001) direction.add(separation.multiplyScalar(0.72)).normalize();
    const current = this.character.position.clone();
    const desired = current.clone().addScaledVector(direction, delta * speed);
    const resolved = this.collision.resolveCircle(current, desired, GAME_CONFIG.characterRadius);
    const moved = new THREE.Vector2(resolved.x - current.x, resolved.z - current.z).length();
    if (moved < delta * speed * 0.18) this.stuckTimer += delta;
    else this.stuckTimer = Math.max(0, this.stuckTimer - delta * 2);
    if (this.stuckTimer > 0.65) {
      this.stuckTimer = 0;
      this.sidestepTimer = 0.55;
      this.sidestepSign *= -1;
      this.pathRefresh = 0;
    }
    this.character.position.x = resolved.x;
    this.character.position.z = resolved.z;
    const ground = this.collision.getGroundHeight(resolved.x, resolved.z, this.character.position.y);
    const maxStep = delta * 8.5;
    this.character.position.y = THREE.MathUtils.lerp(this.character.position.y, ground, Math.min(1, maxStep));
    this.character.velocity.set(direction.x * speed, 0, direction.z * speed);
    this.character.mesh.rotation.y = Math.atan2(direction.x, direction.z);
    this.character.update(delta, moved > 0.005);
  }

  private resolveMeleeAttack(): void {
    const target = this.pendingAttackTarget;
    this.pendingAttackTarget = null;
    if (!target || !target.alive || target.team !== Team.Human) {
      this.audio.meleeMiss();
      return;
    }
    const inRange = this.character.position.distanceTo(target.position) <= GAME_CONFIG.infected.attackRange + 0.35;
    if (!inRange || !this.hasLineOfSight(target)) {
      this.audio.meleeMiss();
      return;
    }
    const result = this.callbacks.applyDamage(this.character, target, GAME_CONFIG.infected.damage, false);
    if (result.applied) this.audio.meleeHit();
    else this.audio.meleeMiss();
  }

  private faceTarget(position: THREE.Vector3): void {
    const delta = position.clone().sub(this.character.position);
    this.character.mesh.rotation.y = Math.atan2(delta.x, delta.z);
  }

  private findPath(start: THREE.Vector3, goal: THREE.Vector3): NavigationNode[] {
    const nodes = this.map.navigationNodes;
    if (!nodes.length) return [];
    const startNode = this.closestNode(start);
    const goalNode = this.closestNode(goal);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const open = new Set<string>([startNode.id]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startNode.id, 0]]);
    const fScore = new Map<string, number>([[startNode.id, startNode.position.distanceTo(goalNode.position)]]);

    while (open.size) {
      const currentId = [...open].sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity))[0];
      if (currentId === goalNode.id) {
        const path: NavigationNode[] = [goalNode];
        let cursor = currentId;
        while (cameFrom.has(cursor)) {
          cursor = cameFrom.get(cursor)!;
          path.unshift(byId.get(cursor)!);
        }
        path.shift();
        path.push({ id: 'goal', position: goal.clone(), neighbors: [] });
        return path;
      }
      open.delete(currentId);
      const current = byId.get(currentId)!;
      for (const neighborId of current.neighbors) {
        const neighbor = byId.get(neighborId)!;
        const tentative = (gScore.get(currentId) ?? Infinity) + current.position.distanceTo(neighbor.position);
        if (tentative >= (gScore.get(neighborId) ?? Infinity)) continue;
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentative);
        fScore.set(neighborId, tentative + neighbor.position.distanceTo(goalNode.position));
        open.add(neighborId);
      }
    }
    return [];
  }

  private closestNode(position: THREE.Vector3): NavigationNode {
    return this.map.navigationNodes.reduce((best, node) => {
      const score = node.position.distanceToSquared(position) + Math.abs(node.position.y - position.y) * 12;
      const bestScore = best.position.distanceToSquared(position) + Math.abs(best.position.y - position.y) * 12;
      return score < bestScore ? node : best;
    });
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    window.setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 65);
  }
}
