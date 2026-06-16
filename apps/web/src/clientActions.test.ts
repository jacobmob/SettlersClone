import { PLAYER_COLORS, createGame, redactStateForPlayer } from '@catan/shared';
import { describe, expect, it } from 'vitest';
import { isMyTurn, landTiles, legalSettlements, robberTargets } from './clientActions.js';

function freshView() {
  const game = createGame({
    id: 'test',
    settings: { maxPlayers: 3 },
    players: ['a', 'b', 'c'].map((id, i) => ({
      id,
      userId: id,
      name: id,
      color: PLAYER_COLORS[i]!,
    })),
    seed: 7,
  });
  return redactStateForPlayer(game, 'a');
}

describe('client action helpers', () => {
  it('treats every spot as a legal opening settlement', () => {
    const view = freshView();
    // Base board has 54 intersections, all open at the start.
    expect(legalSettlements(view, true).length).toBe(54);
  });

  it('knows whose turn it is', () => {
    const view = freshView();
    expect(isMyTurn(view)).toBe(true);
  });

  it('lists land tiles except the robber tile and finds no targets yet', () => {
    const view = freshView();
    expect(landTiles(view).length).toBe(18); // 19 tiles - the desert robber sits on
    const anyHex = landTiles(view)[0]!;
    expect(robberTargets(view, anyHex)).toEqual([]);
  });
});
