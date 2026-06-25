import { describe, expect, it } from 'vitest';
import { cornersOfHex, edgesOfVertex, parseHexKey, verticesOfEdge } from './coords.js';
import { type CreateGameOptions, applyAction, createGame } from './game.js';
import { getRoadEdges } from './rules.js';
import { getVictoryPoints } from './scoring.js';
import { PLAYER_COLORS, type GameState } from './types.js';

function ckGame(n: number, seed = 11): GameState {
  const opts: CreateGameOptions = {
    id: `ck2-${seed}-${n}`,
    players: ['a', 'b', 'c'].slice(0, n).map((id, i) => ({
      id,
      userId: id,
      name: id,
      color: PLAYER_COLORS[i]!,
    })),
    settings: { maxPlayers: n, victoryPoints: 13, expansions: ['citiesAndKnights'] },
    seed,
  };
  return createGame(opts);
}

/** A game forced into a main phase with the dice already rolled. */
function ckMain(n = 2, seed = 11): GameState {
  return { ...ckGame(n, seed), phase: 'main', hasRolled: true };
}

describe('progress card decks', () => {
  it('shuffles three populated decks at game start', () => {
    const s = ckGame(2);
    expect(s.progressDecks.science.length).toBe(15);
    expect(s.progressDecks.politics.length).toBe(7);
    expect(s.progressDecks.trade.length).toBe(10);
  });

  it('awards a progress card on a coloured event die when improved enough', () => {
    for (let seed = 1; seed < 300; seed++) {
      let s = ckGame(2, seed);
      s = { ...s, phase: 'rollDice', hasRolled: false, currentPlayerIndex: 0 };
      for (const track of ['science', 'politics', 'trade'] as const) {
        s.players[0]!.improvements[track] = 5;
      }
      const r = applyAction(s, 'a', { type: 'rollDice' });
      if (!r.ok) continue;
      const ns = r.state;
      if (ns.eventDie && ns.eventDie !== 'barbarian' && ns.dice![0]! <= 5) {
        expect(ns.players[0]!.progressCards.length).toBe(1);
        expect(ns.players[1]!.progressCards.length).toBe(0); // unimproved player draws nothing
        return;
      }
    }
    throw new Error('no qualifying coloured event die found across seeds');
  });
});

describe('progress card effects', () => {
  it('printer grants a permanent victory point', () => {
    const s = ckMain();
    s.players[0]!.progressCards = ['printer'];
    const before = getVictoryPoints(s, 'a');
    const r = applyAction(s, 'a', { type: 'playProgress', card: 'printer' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players[0]!.progressVP).toBe(1);
      expect(getVictoryPoints(r.state, 'a')).toBe(before + 1);
      expect(r.state.players[0]!.progressCards).toHaveLength(0);
    }
  });

  it('resource monopoly takes up to 2 of a resource from each opponent', () => {
    const s = ckMain(3);
    s.players[0]!.progressCards = ['resourceMonopoly'];
    s.players[1]!.resources.wheat = 3;
    s.players[2]!.resources.wheat = 1;
    const r = applyAction(s, 'a', {
      type: 'playProgress',
      card: 'resourceMonopoly',
      params: { resource: 'wheat' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players[0]!.resources.wheat).toBe(3); // 2 + 1
      expect(r.state.players[1]!.resources.wheat).toBe(1);
      expect(r.state.players[2]!.resources.wheat).toBe(0);
    }
  });

  it('warlord activates every knight you own', () => {
    const s = ckMain();
    s.players[0]!.progressCards = ['warlord'];
    s.knights['v1'] = { owner: 'a', level: 1, active: false, moved: false };
    s.knights['v2'] = { owner: 'a', level: 2, active: false, moved: false };
    s.knights['v3'] = { owner: 'b', level: 1, active: false, moved: false };
    const r = applyAction(s, 'a', { type: 'playProgress', card: 'warlord' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.knights['v1']!.active).toBe(true);
      expect(r.state.knights['v2']!.active).toBe(true);
      expect(r.state.knights['v3']!.active).toBe(false);
    }
  });

  it('road building places two free roads', () => {
    const s = ckMain();
    const edge = getRoadEdges(s)[0]!;
    const [v0] = verticesOfEdge(edge);
    s.buildings[v0!] = { type: 'settlement', owner: 'a' };
    const second = edgesOfVertex(v0!).find((e) => e !== edge && getRoadEdges(s).includes(e))!;
    s.players[0]!.progressCards = ['roadBuilding'];
    const roadsBefore = s.players[0]!.piecesLeft.road;
    const woodBefore = s.players[0]!.resources.wood;
    const r = applyAction(s, 'a', {
      type: 'playProgress',
      card: 'roadBuilding',
      params: { edges: [edge, second] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.state.roads)).toHaveLength(2);
      expect(r.state.players[0]!.piecesLeft.road).toBe(roadsBefore - 2);
      expect(r.state.players[0]!.resources.wood).toBe(woodBefore); // free
    }
  });

  it('crane discounts the next city improvement by one commodity', () => {
    const s = ckMain();
    s.players[0]!.progressCards = ['crane'];
    s.players[0]!.commodities.paper = 1; // science level 0 -> 1 normally costs 1, crane makes it 0
    const played = applyAction(s, 'a', { type: 'playProgress', card: 'crane' });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const r = applyAction(played.state, 'a', { type: 'improveCity', track: 'science' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players[0]!.improvements.science).toBe(1);
      expect(r.state.players[0]!.commodities.paper).toBe(1); // nothing spent
      expect(r.state.players[0]!.progressFlags.crane).toBe(false);
    }
  });

  it('alchemist locks in the next roll', () => {
    const s = { ...ckGame(2), phase: 'rollDice' as const, hasRolled: false, currentPlayerIndex: 0 };
    s.players[0]!.progressCards = ['alchemist'];
    const played = applyAction(s, 'a', {
      type: 'playProgress',
      card: 'alchemist',
      params: { dice: [2, 2] },
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingAlchemist).toEqual([2, 2]);
    const rolled = applyAction(played.state, 'a', { type: 'rollDice' });
    expect(rolled.ok).toBe(true);
    if (rolled.ok) {
      expect(rolled.state.dice).toEqual([2, 2]);
      expect(rolled.state.pendingAlchemist).toBeNull();
    }
  });
});

describe('advanced knight actions', () => {
  it('moves an active knight one step along your road', () => {
    const s = ckMain();
    const edge = getRoadEdges(s)[0]!;
    s.roads[edge] = { owner: 'a', kind: 'road' };
    const [from, to] = verticesOfEdge(edge);
    s.knights[from!] = { owner: 'a', level: 1, active: true, moved: false };
    const r = applyAction(s, 'a', { type: 'moveKnight', from: from!, to: to! });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.knights[to!]).toBeTruthy();
      expect(r.state.knights[from!]).toBeUndefined();
      expect(r.state.knights[to!]!.moved).toBe(true);
    }
  });

  it('displaces a weaker opponent knight to a retreat intersection', () => {
    const s = ckMain();
    const edge1 = getRoadEdges(s)[0]!;
    const [v0, v1] = verticesOfEdge(edge1);
    const edge2 = edgesOfVertex(v1!).find((e) => e !== edge1 && getRoadEdges(s).includes(e))!;
    const v2 = verticesOfEdge(edge2).find((v) => v !== v1)!;
    s.roads[edge1] = { owner: 'a', kind: 'road' };
    s.roads[edge2] = { owner: 'b', kind: 'road' };
    s.knights[v0!] = { owner: 'a', level: 2, active: true, moved: false };
    s.knights[v1!] = { owner: 'b', level: 1, active: true, moved: false };
    const r = applyAction(s, 'a', { type: 'moveKnight', from: v0!, to: v1! });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.knights[v1!]!.owner).toBe('a');
      expect(r.state.knights[v2!]!.owner).toBe('b');
    }
  });

  it('chases the robber with an adjacent knight', () => {
    const s = ckMain();
    const corner = cornersOfHex(parseHexKey(s.robberHex))[0]!;
    s.knights[corner] = { owner: 'a', level: 1, active: true, moved: false };
    const dest = Object.values(s.tiles).find((t) => t.type !== 'water' && t.id !== s.robberHex)!.id;
    const r = applyAction(s, 'a', {
      type: 'chaseRobber',
      from: corner,
      hex: dest,
      stealFrom: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.robberHex).toBe(dest);
      expect(r.state.knights[corner]!.moved).toBe(true);
    }
  });

  it('refuses to move an inactive or already-acted knight', () => {
    const s = ckMain();
    const edge = getRoadEdges(s)[0]!;
    s.roads[edge] = { owner: 'a', kind: 'road' };
    const [from, to] = verticesOfEdge(edge);
    s.knights[from!] = { owner: 'a', level: 1, active: false, moved: false };
    expect(applyAction(s, 'a', { type: 'moveKnight', from: from!, to: to! }).ok).toBe(false);
  });
});
