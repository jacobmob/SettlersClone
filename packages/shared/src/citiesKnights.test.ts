import { describe, expect, it } from 'vitest';
import {
  canBuildKnight,
  knightStrength,
  resolveBarbarianAttack,
} from './citiesKnights.js';
import { cornersOfHex, verticesOfEdge } from './coords.js';
import { type CreateGameOptions, applyAction, createGame } from './game.js';
import { distributeResources, getRoadEdges } from './rules.js';
import { getVictoryPoints } from './scoring.js';
import { PLAYER_COLORS, type GameState } from './types.js';

function ckGame(n: number): GameState {
  const opts: CreateGameOptions = {
    id: `ck-${Math.random()}`,
    players: ['a', 'b', 'c'].slice(0, n).map((id, i) => ({
      id,
      userId: id,
      name: id,
      color: PLAYER_COLORS[i]!,
    })),
    settings: { maxPlayers: n, victoryPoints: 13, expansions: ['citiesAndKnights'] },
    seed: 11,
  };
  return createGame(opts);
}

describe('cities & knights production', () => {
  it('gives a city a resource plus its commodity', () => {
    const s = ckGame(3);
    const wood = Object.values(s.tiles).find((t) => t.type === 'wood' && t.number !== null)!;
    s.buildings[cornersOfHex(wood.coord)[0]!] = { type: 'city', owner: 'a' };
    s.robberHex = Object.values(s.tiles).find((t) => t.id !== wood.id && t.type !== 'water')!.id;

    distributeResources(s, wood.number!);
    expect(s.players[0]!.resources.wood).toBe(1);
    expect(s.players[0]!.commodities.paper).toBe(1);
  });
});

describe('city improvements', () => {
  it('spends commodities, advances the track, and grants a metropolis at level 4', () => {
    let s = ckGame(2);
    s = { ...s, phase: 'main' };
    s.players[0]!.commodities.paper = 20;
    for (let i = 0; i < 4; i++) {
      const r = applyAction(s, 'a', { type: 'improveCity', track: 'science' });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.players[0]!.improvements.science).toBe(4);
    expect(s.players[0]!.commodities.paper).toBe(20 - (1 + 2 + 3 + 4));
    expect(s.metropolis.science).toBe('a');
    expect(getVictoryPoints(s, 'a')).toBeGreaterThanOrEqual(2);
  });
});

describe('knights', () => {
  it('can be built on a connected vertex but not in the wilderness', () => {
    const s = ckGame(2);
    const edge = getRoadEdges(s)[0]!;
    s.roads[edge] = { owner: 'a', kind: 'road' };
    const connected = verticesOfEdge(edge)[0]!;
    expect(canBuildKnight(s, 'a', connected)).toBeNull();
    // a vertex with no road of yours is illegal
    const far = getRoadEdges(s).map((e) => verticesOfEdge(e)[0]!).find((v) => v !== connected)!;
    expect(canBuildKnight(s, 'a', far)).not.toBeNull();
  });

  it('measures active strength and resolves barbarian attacks', () => {
    const s = ckGame(2);
    s.buildings['cityB'] = { type: 'city', owner: 'b' };
    s.knights['k1'] = { owner: 'a', level: 2, active: true, moved: false };
    expect(knightStrength(s, 'a')).toBe(2);

    // 2 strength vs 1 city -> defended, 'a' is the defender, knights deactivate
    const won = resolveBarbarianAttack(s);
    expect(won.defended).toBe(true);
    expect(won.defenders).toContain('a');
    expect(s.players[0]!.defenderPoints).toBe(1);
    expect(s.knights['k1']!.active).toBe(false);

    // now nobody can defend: b's city is sacked
    const lost = resolveBarbarianAttack(s);
    expect(lost.defended).toBe(false);
    expect(lost.losers).toContain('b');
    expect(s.buildings['cityB']!.type).toBe('settlement');
  });
});
