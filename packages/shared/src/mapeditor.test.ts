import { describe, expect, it } from 'vitest';
import { createBoard } from './board.js';
import { axialToCube, cornersOfHex } from './coords.js';
import { createGame } from './game.js';
import { type EditorTile, makeCustomMap } from './maps.js';
import { Rng } from './rng.js';
import { PLAYER_COLORS } from './types.js';
import { redactStateForPlayer } from './view.js';

describe('makeCustomMap', () => {
  const tiles: EditorTile[] = [
    { coord: axialToCube(0, 0), kind: 'land' },
    { coord: axialToCube(1, 0), kind: 'land' },
    { coord: axialToCube(0, 1), kind: 'desert' },
    { coord: axialToCube(-1, 1), kind: 'water' },
    { coord: axialToCube(1, -1), kind: 'gold' },
  ];

  it('sizes the resource and number bags to the painted board', () => {
    const def = makeCustomMap('m1', 'Test', tiles);
    expect(def.hexes.length).toBe(5);
    expect(def.resourceBag.length).toBe(2); // two land tiles
    expect(def.numberBag.length).toBe(3); // land + gold get numbers
  });

  it('builds a playable board with fixed water/desert/gold and random land', () => {
    const board = createBoard(makeCustomMap('m1', 'Test', tiles), new Rng(3));
    const types = Object.values(board.tiles).map((t) => t.type);
    expect(types.filter((t) => t === 'water').length).toBe(1);
    expect(types.filter((t) => t === 'desert').length).toBe(1);
    expect(types.filter((t) => t === 'gold').length).toBe(1);
    // robber starts on the desert; numbered tiles are the land + gold ones
    expect(board.tiles[board.robberHex]!.type).toBe('desert');
    const numbered = Object.values(board.tiles).filter((t) => t.number !== null);
    expect(numbered.length).toBe(3);
  });
});

describe('fog of war', () => {
  it('hides distant land terrain but reveals tiles around your buildings', () => {
    const game = createGame({
      id: 'fog',
      players: ['a', 'b', 'c'].map((id, i) => ({ id, userId: id, name: id, color: PLAYER_COLORS[i]! })),
      settings: { maxPlayers: 3, fogOfWar: true },
      seed: 9,
    });
    const homeTile = Object.values(game.tiles)[0]!;
    const vertex = cornersOfHex(homeTile.coord)[0]!;
    game.buildings[vertex] = { type: 'settlement', owner: 'a' };

    const view = redactStateForPlayer(game, 'a');
    expect(view.tiles[homeTile.id]!.type).not.toBe('fog');
    expect(Object.values(view.tiles).some((t) => t.type === 'fog')).toBe(true);

    // A player with no buildings sees only fog (base map has no water).
    const blind = redactStateForPlayer(game, 'b');
    expect(Object.values(blind.tiles).every((t) => t.type === 'fog')).toBe(true);
  });
});
