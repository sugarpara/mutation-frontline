import type { Vector3 } from 'three';

export enum Team {
  Human = 'human',
  Infected = 'infected',
  Attackers = 'attackers',
  Defenders = 'defenders',
}

export enum CharacterRole {
  Human = 'human',
  Infected = 'infected',
  AlphaInfected = 'alpha-infected',
  Hero = 'hero',
  Attacker = 'attacker',
  Defender = 'defender',
}

export enum WeaponKind {
  Rifle = 'rifle',
  Pistol = 'pistol',
  Knife = 'knife',
  Claws = 'claws',
  HeroHmg = 'hero-hmg',
}

export enum GamePhase {
  Menu = 'menu',
  Countdown = 'countdown',
  Active = 'active',
  Paused = 'paused',
  Ended = 'ended',
}

export enum AIState {
  Follow = 'follow',
  Defend = 'defend',
  Search = 'search',
  Shoot = 'shoot',
  Evade = 'evade',
  Reload = 'reload',
  Retreat = 'retreat',
  Chase = 'chase',
  Attack = 'attack',
  Respawn = 'respawn',
}

export type OperatorId = 'Rook' | 'Kite' | 'Iris' | 'Vela';
export type MapId = 'refinery' | 'harbor' | 'quarantine';
export type GameModeId = 'bio' | 'bomb';

export interface WeaponDefinition {
  kind: WeaponKind;
  name: string;
  magazine: number;
  reserve: number;
  damage: number;
  headMultiplier: number;
  fireInterval: number;
  reloadTime: number;
  recoil: number;
  spread: number;
  range: number;
  automatic: boolean;
  pellets?: number;
}

export interface WeaponRuntime {
  definition: WeaponDefinition;
  ammo: number;
  reserve: number;
  cooldown: number;
  reloadRemaining: number;
}

export interface NavigationNode {
  id: string;
  position: Vector3;
  neighbors: string[];
  defense?: boolean;
}

export interface CombatStats {
  kills: number;
  infections: number;
  plants: number;
  defuses: number;
  shots: number;
  hits: number;
}

export interface GameSettings {
  sensitivity: number;
  volume: number;
  muzzleFlash: boolean;
  cameraShake: boolean;
  operator: OperatorId;
  map: MapId;
  startingWeapon: WeaponKind;
  mode: GameModeId;
}

export interface DamageResult {
  applied: boolean;
  defeated: boolean;
  infected: boolean;
}
