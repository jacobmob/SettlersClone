/**
 * Hex grid geometry for Catan.
 *
 * Hexes use cube coordinates (x + y + z === 0). Vertices (settlement/city spots)
 * and edges (road spots) are derived from hexes and identified by a *canonical*
 * key built from the sorted cube keys of the hexes meeting at that corner/side.
 * Because the key is canonical, two hexes that share a corner or side produce the
 * exact same vertex/edge id, which makes adjacency trivial and handles coastal
 * borders without special cases (a coastal corner is simply a triple where some
 * of the hex positions are off-board water/phantom positions).
 */

export interface Cube {
  x: number;
  y: number;
  z: number;
}

export type VertexId = string;
export type EdgeId = string;

export function cube(x: number, y: number, z: number): Cube {
  return { x, y, z };
}

export function hexKey(h: Cube): string {
  return `${h.x},${h.y},${h.z}`;
}

export function parseHexKey(k: string): Cube {
  const parts = k.split(',').map(Number);
  return { x: parts[0]!, y: parts[1]!, z: parts[2]! };
}

export function cubeEquals(a: Cube, b: Cube): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function cubeAdd(a: Cube, b: Cube): Cube {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** The six neighbour directions, in cyclic (rotational) order around a hex. */
export const CUBE_DIRECTIONS: readonly Cube[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
];

export function hexNeighbors(h: Cube): Cube[] {
  return CUBE_DIRECTIONS.map((d) => cubeAdd(h, d));
}

function canonicalKey(hexes: Cube[]): string {
  return hexes.map(hexKey).sort().join('|');
}

/** The six corners (vertices) of a hex, as canonical ids. */
export function cornersOfHex(h: Cube): VertexId[] {
  const ns = hexNeighbors(h);
  const corners: VertexId[] = [];
  for (let i = 0; i < 6; i++) {
    corners.push(canonicalKey([h, ns[i]!, ns[(i + 1) % 6]!]));
  }
  return corners;
}

/** The six sides (edges) of a hex, as canonical ids. */
export function edgesOfHex(h: Cube): EdgeId[] {
  return hexNeighbors(h).map((n) => canonicalKey([h, n]));
}

/** The (up to 3) hexes meeting at a vertex. */
export function hexesOfVertex(v: VertexId): Cube[] {
  return v.split('|').map(parseHexKey);
}

/** The 2 hexes sharing an edge. */
export function hexesOfEdge(e: EdgeId): Cube[] {
  return e.split('|').map(parseHexKey);
}

/** The 3 edges incident to a vertex. */
export function edgesOfVertex(v: VertexId): EdgeId[] {
  const hs = hexesOfVertex(v);
  const edges: EdgeId[] = [];
  for (let i = 0; i < hs.length; i++) {
    for (let j = i + 1; j < hs.length; j++) {
      edges.push(canonicalKey([hs[i]!, hs[j]!]));
    }
  }
  return edges;
}

/** The 2 vertices at the ends of an edge. */
export function verticesOfEdge(e: EdgeId): VertexId[] {
  const hs = hexesOfEdge(e);
  const [x, y] = [hs[0]!, hs[1]!];
  const nx = new Set(hexNeighbors(x).map(hexKey));
  const common = hexNeighbors(y).filter((n) => nx.has(hexKey(n)));
  return common.map((z) => canonicalKey([x, y, z]));
}

/** The (up to 3) vertices adjacent to a vertex, one across each incident edge. */
export function adjacentVertices(v: VertexId): VertexId[] {
  const result = new Set<VertexId>();
  for (const e of edgesOfVertex(v)) {
    for (const other of verticesOfEdge(e)) {
      if (other !== v) result.add(other);
    }
  }
  return [...result];
}

// --- coordinate conversions for building map layouts ---

export function axialToCube(q: number, r: number): Cube {
  return { x: q, y: -q - r, z: r };
}

export function hexToAxial(h: Cube): { q: number; r: number } {
  return { q: h.x, r: h.z };
}

/** "odd-r" offset (row/column, rows shifted right on odd rows) to cube. */
export function oddRToCube(col: number, row: number): Cube {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  return { x, y: -x - z, z };
}
