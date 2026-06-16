import { type Cube, axialToCube, oddRToCube } from './coords.js';
import type { HexDef, MapDef, PortType, TileType } from './types.js';

/** All axial coords within a hexagon of the given radius (centred at origin). */
function hexagon(radius: number): Cube[] {
  const out: Cube[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push(axialToCube(q, r));
    }
  }
  return out;
}

/** Centred offset rows -> cube coords (used for the elongated 5-6 board). */
function offsetRows(rowLengths: number[]): Cube[] {
  const out: Cube[] = [];
  rowLengths.forEach((len, row) => {
    const start = -Math.floor(len / 2);
    for (let i = 0; i < len; i++) out.push(oddRToCube(start + i, row));
  });
  return out;
}

function toHexDefs(coords: Cube[]): HexDef[] {
  return coords.map((coord) => ({ coord }));
}

// Standard base-game bags (resources include the desert; numbers exclude it).
const BASE_RESOURCES: TileType[] = [
  ...Array<TileType>(4).fill('wood'),
  ...Array<TileType>(4).fill('sheep'),
  ...Array<TileType>(4).fill('wheat'),
  ...Array<TileType>(3).fill('brick'),
  ...Array<TileType>(3).fill('ore'),
  'desert',
];
const BASE_NUMBERS: number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const BASE_PORTS: PortType[] = ['any', 'any', 'any', 'any', 'brick', 'wood', 'sheep', 'wheat', 'ore'];

// 5-6 player extension bags.
const EXT_RESOURCES: TileType[] = [
  ...Array<TileType>(6).fill('wood'),
  ...Array<TileType>(6).fill('sheep'),
  ...Array<TileType>(6).fill('wheat'),
  ...Array<TileType>(5).fill('brick'),
  ...Array<TileType>(5).fill('ore'),
  'desert',
  'desert',
];
const EXT_NUMBERS: number[] = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
];
const EXT_PORTS: PortType[] = [
  'any',
  'any',
  'any',
  'any',
  'any',
  'brick',
  'wood',
  'sheep',
  'sheep',
  'wheat',
  'ore',
];

export const BASE_3_4: MapDef = {
  id: 'base-3-4',
  name: 'Base (3-4 players)',
  playerRange: [3, 4],
  hexes: toHexDefs(hexagon(2)),
  ports: [],
  resourceBag: BASE_RESOURCES,
  numberBag: BASE_NUMBERS,
  portBag: BASE_PORTS,
};

export const BASE_5_6: MapDef = {
  id: 'base-5-6',
  name: 'Base (5-6 players)',
  playerRange: [5, 6],
  hexes: toHexDefs(offsetRows([3, 4, 5, 6, 5, 4, 3])),
  ports: [],
  resourceBag: EXT_RESOURCES,
  numberBag: EXT_NUMBERS,
  portBag: EXT_PORTS,
};

export const BUILT_IN_MAPS: Record<string, MapDef> = {
  [BASE_3_4.id]: BASE_3_4,
  [BASE_5_6.id]: BASE_5_6,
};

export function getMap(id: string): MapDef {
  return BUILT_IN_MAPS[id] ?? BASE_3_4;
}
