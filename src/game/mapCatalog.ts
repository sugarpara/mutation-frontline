import type { GameModeId, MapId } from './types';

export interface MapDefinition {
  id: MapId;
  mode: GameModeId;
  name: string;
  shortName: string;
  description: string;
}

export const MAP_CATALOG: Record<MapId, MapDefinition> = {
  refinery: {
    id: 'refinery',
    mode: 'bio',
    name: '沙脊炼化基地',
    shortName: '沙脊炼化基地',
    description: '夕照炼油设施，管桥、高台、仓库和低位管廊形成四路交叉。',
  },
  harbor: {
    id: 'harbor',
    mode: 'bio',
    name: '夜港货运站',
    shortName: '夜港货运站',
    description: '潮湿夜港，中央仓楼、集装箱巷道、起重机平台与下穿通道。',
  },
  quarantine: {
    id: 'quarantine',
    mode: 'bio',
    name: 'Q-17 地下隔离区',
    shortName: 'Q-17 隔离区',
    description: '废弃地铁轴线连接培养舱、检疫实验室、坍塌区与排水回路。',
  },
  relay: {
    id: 'relay',
    mode: 'bomb',
    name: 'C-9 高塔中继站',
    shortName: 'C-9 中继站',
    description: '封闭通讯枢纽由控制厅、冷却廊和双侧天线阵列构成，适合紧凑的双目标攻防。',
  },
  foundry: {
    id: 'foundry',
    mode: 'bomb',
    name: '赤砧装配厂',
    shortName: '赤砧装配厂',
    description: '停产装配线围绕铸造核心与质检仓展开，进攻方可经中路或两翼切入。',
  },
};

export const MAP_IDS: MapId[] = ['refinery', 'harbor', 'quarantine', 'relay', 'foundry'];

export const DEFAULT_MAP_BY_MODE: Record<GameModeId, MapId> = {
  bio: 'quarantine',
  bomb: 'relay',
};

export function mapsForMode(mode: GameModeId): MapDefinition[] {
  return MAP_IDS.map((id) => MAP_CATALOG[id]).filter((map) => map.mode === mode);
}

export function isMapId(value: string | null): value is MapId {
  return value !== null && MAP_IDS.includes(value as MapId);
}

export function isMapAllowed(mode: GameModeId, map: MapId): boolean {
  return MAP_CATALOG[map].mode === mode;
}

export function normalizeMapForMode(mode: GameModeId, map: MapId): MapId {
  return isMapAllowed(mode, map) ? map : DEFAULT_MAP_BY_MODE[mode];
}
