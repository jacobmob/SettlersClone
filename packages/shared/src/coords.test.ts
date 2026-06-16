import { describe, expect, it } from 'vitest';
import {
  type Cube,
  adjacentVertices,
  cornersOfHex,
  edgesOfHex,
  hexKey,
  hexNeighbors,
  verticesOfEdge,
} from './coords.js';
import { BASE_3_4, BASE_5_6 } from './maps.js';

function boardVE(coords: Cube[]) {
  const V = new Set<string>();
  const E = new Set<string>();
  for (const c of coords) {
    cornersOfHex(c).forEach((v) => V.add(v));
    edgesOfHex(c).forEach((e) => E.add(e));
  }
  return { V, E };
}

function isContiguous(coords: Cube[]): boolean {
  const present = new Set(coords.map(hexKey));
  const seen = new Set<string>([hexKey(coords[0]!)]);
  const queue = [coords[0]!];
  while (queue.length) {
    const h = queue.pop()!;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (present.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size === present.size;
}

describe('hex geometry', () => {
  it('base board has the canonical 19 tiles / 54 vertices / 72 edges', () => {
    expect(BASE_3_4.hexes.length).toBe(19);
    const { V, E } = boardVE(BASE_3_4.hexes.map((h) => h.coord));
    expect(V.size).toBe(54);
    expect(E.size).toBe(72);
  });

  it('5-6 board has 30 contiguous tiles', () => {
    expect(BASE_5_6.hexes.length).toBe(30);
    expect(isContiguous(BASE_5_6.hexes.map((h) => h.coord))).toBe(true);
  });

  it('base board is contiguous', () => {
    expect(isContiguous(BASE_3_4.hexes.map((h) => h.coord))).toBe(true);
  });

  it('vertex adjacency is reciprocal and edges resolve to known vertices', () => {
    const { V } = boardVE(BASE_3_4.hexes.map((h) => h.coord));
    for (const v of V) {
      const neighbors = adjacentVertices(v);
      expect(neighbors.length).toBeGreaterThanOrEqual(2);
      expect(neighbors.length).toBeLessThanOrEqual(3);
      for (const u of neighbors) {
        expect(adjacentVertices(u)).toContain(v);
      }
    }
  });

  it('every edge connects exactly two board vertices', () => {
    const { V, E } = boardVE(BASE_3_4.hexes.map((h) => h.coord));
    for (const e of E) {
      const ends = verticesOfEdge(e);
      expect(ends.length).toBe(2);
      for (const end of ends) expect(V.has(end)).toBe(true);
    }
  });
});
