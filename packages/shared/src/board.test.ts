import { describe, expect, it } from 'vitest';
import { createBoard } from './board.js';
import { hexNeighbors, hexKey } from './coords.js';
import { BASE_3_4 } from './maps.js';
import { Rng } from './rng.js';

const RED = new Set([6, 8]);

describe('createBoard', () => {
  it('places resources, numbers, robber and ports for the base map', () => {
    const board = createBoard(BASE_3_4, new Rng(42));
    const tiles = Object.values(board.tiles);
    expect(tiles.length).toBe(19);

    const deserts = tiles.filter((t) => t.type === 'desert');
    expect(deserts.length).toBe(1);

    // Desert has no number; every other tile does.
    for (const t of tiles) {
      if (t.type === 'desert') expect(t.number).toBeNull();
      else expect(t.number).not.toBeNull();
    }

    // Robber starts on the desert.
    expect(board.tiles[board.robberHex]!.type).toBe('desert');

    // Ports come from the bag (9 for the base map), each with two vertices.
    expect(board.ports.length).toBe(9);
    for (const p of board.ports) expect(p.vertices.length).toBe(2);
  });

  it('keeps red numbers (6/8) off adjacent tiles', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const board = createBoard(BASE_3_4, new Rng(seed));
      for (const tile of Object.values(board.tiles)) {
        if (tile.number === null || !RED.has(tile.number)) continue;
        for (const n of hexNeighbors(tile.coord)) {
          const neighbor = board.tiles[hexKey(n)];
          if (neighbor?.number != null && RED.has(neighbor.number)) {
            throw new Error(`adjacent reds at seed ${seed}`);
          }
        }
      }
    }
  });
});
