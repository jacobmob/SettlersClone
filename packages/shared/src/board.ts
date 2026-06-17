import {
  type Cube,
  type EdgeId,
  edgesOfHex,
  hexKey,
  hexNeighbors,
  hexesOfEdge,
  verticesOfEdge,
} from './coords.js';
import { edgeMidpoint, hexToPixel } from './geometry.js';
import type { Rng } from './rng.js';
import type { MapDef, Port, Tile } from './types.js';

const RED_NUMBERS = new Set([6, 8]);

export interface Board {
  tiles: Record<string, Tile>;
  ports: Port[];
  robberHex: string;
}

/**
 * Build a concrete board from a map definition. Resource types and number
 * tokens are *randomised at game start* (per the product requirement) rather
 * than baked into the map. Red numbers (6/8) are kept off adjacent tiles when
 * a quick reshuffle can achieve it.
 */
export function createBoard(map: MapDef, rng: Rng): Board {
  const coords = map.hexes.map((h) => h.coord);
  const tiles: Record<string, Tile> = {};

  // 1. Assign resource types (respect fixed types; draw the rest from the bag).
  const bag = rng.shuffle([...map.resourceBag]);
  let bagIdx = 0;
  for (let i = 0; i < map.hexes.length; i++) {
    const def = map.hexes[i]!;
    const type = def.fixedType ?? bag[bagIdx++]!;
    tiles[hexKey(def.coord)] = {
      id: hexKey(def.coord),
      coord: def.coord,
      type,
      number: null,
    };
  }

  // 2. Assign numbers to resource-bearing tiles, avoiding adjacent 6/8 if we can.
  const numbered = coords.filter((c) => {
    const t = tiles[hexKey(c)]!.type;
    return t !== 'desert' && t !== 'water';
  });
  const adjacency = buildAdjacency(coords);
  assignNumbers(tiles, numbered, [...map.numberBag], adjacency, rng);

  // 3. Robber starts on the desert; if a custom map has none, tuck it on the
  // sea (or the first tile) until someone rolls a 7.
  const desert = coords.find((c) => tiles[hexKey(c)]!.type === 'desert');
  const water = coords.find((c) => tiles[hexKey(c)]!.type === 'water');
  const robberHex = hexKey(desert ?? water ?? coords[0]!);

  // 4. Ports.
  const ports = map.ports.length
    ? map.ports.map((p) => ({
        type: p.type,
        vertices: verticesOfEdge(edgesOfHex(p.hex)[p.dir]!),
      }))
    : autoPlacePorts(coords, tiles, map.portBag ?? [], rng);

  return { tiles, ports, robberHex };
}

function buildAdjacency(coords: Cube[]): Map<string, string[]> {
  const present = new Set(coords.map(hexKey));
  const adj = new Map<string, string[]>();
  for (const c of coords) {
    const key = hexKey(c);
    adj.set(
      key,
      hexNeighbors(c)
        .map(hexKey)
        .filter((n) => present.has(n)),
    );
  }
  return adj;
}

function assignNumbers(
  tiles: Record<string, Tile>,
  numbered: Cube[],
  numbers: number[],
  adjacency: Map<string, string[]>,
  rng: Rng,
): void {
  const keys = numbered.map(hexKey);
  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = rng.shuffle([...numbers]);
    keys.forEach((k, i) => (tiles[k]!.number = shuffled[i]!));
    if (!hasAdjacentReds(keys, tiles, adjacency)) return;
  }
  // Give up on the constraint after many tries; the last assignment stands.
}

function hasAdjacentReds(
  keys: string[],
  tiles: Record<string, Tile>,
  adjacency: Map<string, string[]>,
): boolean {
  for (const k of keys) {
    const n = tiles[k]!.number;
    if (n === null || !RED_NUMBERS.has(n)) continue;
    for (const neighbor of adjacency.get(k) ?? []) {
      const nn = tiles[neighbor]?.number;
      if (nn !== null && nn !== undefined && RED_NUMBERS.has(nn)) return true;
    }
  }
  return false;
}

function autoPlacePorts(
  coords: Cube[],
  tiles: Record<string, Tile>,
  portBag: Port['type'][],
  rng: Rng,
): Port[] {
  if (portBag.length === 0) return [];
  const landLike = (h: Cube) => {
    const t = tiles[hexKey(h)];
    return !!t && t.type !== 'water';
  };

  // Collect unique coastline edges (land-like on one side, sea/off-board on the other).
  const coastal = new Set<EdgeId>();
  for (const c of coords) {
    if (!landLike(c)) continue;
    for (const e of edgesOfHex(c)) {
      const [a, b] = hexesOfEdge(e);
      if (landLike(a!) !== landLike(b!)) coastal.add(e);
    }
  }

  // Sort coastal edges by angle around the board centroid.
  const centers = coords.map((c) => hexToPixel(c));
  const centroid = {
    x: centers.reduce((s, p) => s + p.x, 0) / centers.length,
    y: centers.reduce((s, p) => s + p.y, 0) / centers.length,
  };
  const ordered = [...coastal].sort((e1, e2) => angle(e1) - angle(e2));
  function angle(e: EdgeId): number {
    const m = edgeMidpoint(e);
    return Math.atan2(m.y - centroid.y, m.x - centroid.x);
  }

  // Distribute ports evenly around the coast.
  const types = rng.shuffle([...portBag]);
  const ports: Port[] = [];
  const count = Math.min(types.length, ordered.length);
  for (let i = 0; i < count; i++) {
    const edge = ordered[Math.floor((i * ordered.length) / count)]!;
    ports.push({ type: types[i]!, vertices: verticesOfEdge(edge) });
  }
  return ports;
}
