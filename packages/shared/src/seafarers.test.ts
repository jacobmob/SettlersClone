import { describe, expect, it } from 'vitest';
import { cornersOfHex, edgesOfVertex, hexKey, hexesOfVertex, verticesOfEdge } from './coords.js';
import { type CreateGameOptions, applyAction, createGame } from './game.js';
import {
  canPlaceShip,
  distributeResources,
  getBoardVertices,
  getRoadEdges,
  getShipEdges,
} from './rules.js';
import { computeLongestRoad } from './scoring.js';
import { PLAYER_COLORS, type GameState } from './types.js';

function seafarersGame(): GameState {
  const opts: CreateGameOptions = {
    id: `sea-${Math.random()}`,
    players: ['a', 'b', 'c'].map((id, i) => ({
      id,
      userId: id,
      name: id,
      color: PLAYER_COLORS[i]!,
    })),
    settings: { maxPlayers: 3, mapId: 'seafarers-1', expansions: ['seafarers'] },
    seed: 5,
  };
  return createGame(opts);
}

const isLand = (s: GameState, v: string) =>
  hexesOfVertex(v).some((h) => {
    const t = s.tiles[hexKey(h)];
    return t && t.type !== 'water';
  });

describe('seafarers board', () => {
  it('has water tiles and both land and sea edges', () => {
    const s = seafarersGame();
    expect(Object.values(s.tiles).some((t) => t.type === 'water')).toBe(true);
    expect(getRoadEdges(s).length).toBeGreaterThan(0);
    expect(getShipEdges(s).length).toBeGreaterThan(0);
  });

  it('only exposes settlement vertices that touch land', () => {
    const s = seafarersGame();
    for (const v of getBoardVertices(s)) expect(isLand(s, v)).toBe(true);
  });
});

describe('ships', () => {
  it('require connection to your ships or a coastal settlement', () => {
    const s = seafarersGame();
    const shipEdge = getShipEdges(s)[0]!;
    const v = verticesOfEdge(shipEdge).find((x) => isLand(s, x))!;
    // disconnected: no piece anywhere yet
    expect(canPlaceShip(s, 'a', shipEdge, false, null)).not.toBeNull();
    // a coastal settlement lets you start a shipping route
    s.buildings[v] = { type: 'settlement', owner: 'a' };
    expect(canPlaceShip(s, 'a', shipEdge, false, null)).toBeNull();
  });
});

describe('longest trade route', () => {
  it('joins a road and a ship only through your settlement', () => {
    const s = seafarersGame();
    // find a coastal vertex incident to both a road edge and a ship edge
    const roadSet = new Set(getRoadEdges(s));
    const shipSet = new Set(getShipEdges(s));
    let chosen: { v: string; road: string; ship: string } | null = null;
    for (const v of getBoardVertices(s)) {
      const edges = edgesOfVertex(v);
      const road = edges.find((e) => roadSet.has(e));
      const ship = edges.find((e) => e !== road && shipSet.has(e));
      if (road && ship) {
        chosen = { v, road, ship };
        break;
      }
    }
    expect(chosen).not.toBeNull();
    const { v, road, ship } = chosen!;
    s.roads[road] = { owner: 'a', kind: 'road' };
    s.roads[ship] = { owner: 'a', kind: 'ship' };
    // without a building at the junction the route does not combine
    expect(computeLongestRoad(s, 'a')).toBe(1);
    // your settlement at the junction joins them into a length-2 route
    s.buildings[v] = { type: 'settlement', owner: 'a' };
    expect(computeLongestRoad(s, 'a')).toBe(2);
  });
});

describe('gold fields', () => {
  it('queue a player choice and chooseGold draws from the bank', () => {
    const s = seafarersGame();
    const gold = Object.values(s.tiles).find((t) => t.type === 'gold' && t.number !== null)!;
    const corner = cornersOfHex(gold.coord).find((v) => isLand(s, v))!;
    s.buildings[corner] = { type: 'settlement', owner: 'a' };
    s.robberHex = Object.values(s.tiles).find((t) => t.id !== gold.id && t.type !== 'water')!.id;

    distributeResources(s, gold.number!);
    expect(s.pendingGold['a']).toBe(1);

    s.phase = 'goldChoice';
    const before = s.players[0]!.resources.wheat;
    const bankBefore = s.bank.wheat;
    const r = applyAction(s, 'a', { type: 'chooseGold', resources: { wheat: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players[0]!.resources.wheat).toBe(before + 1);
      expect(r.state.bank.wheat).toBe(bankBefore - 1);
      expect(r.state.phase).toBe('main');
    }
  });
});
