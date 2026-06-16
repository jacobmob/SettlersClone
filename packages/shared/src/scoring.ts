import { type EdgeId, type VertexId, verticesOfEdge } from './coords.js';
import {
  LARGEST_ARMY_MIN,
  LONGEST_ROAD_MIN,
  VP_CITY,
  VP_LARGEST_ARMY,
  VP_LONGEST_ROAD,
  VP_SETTLEMENT,
} from './constants.js';
import type { GameState } from './types.js';

/**
 * Longest continuous road for a player: the longest trail through their road
 * network that never reuses a segment and is broken wherever an *opponent's*
 * settlement or city sits on an intervening vertex.
 */
export function computeLongestRoad(state: GameState, playerId: string): number {
  const myRoads = Object.entries(state.roads)
    .filter(([, r]) => r.owner === playerId)
    .map(([e]) => e);
  if (myRoads.length === 0) return 0;

  const incident = new Map<VertexId, EdgeId[]>();
  for (const e of myRoads) {
    for (const v of verticesOfEdge(e)) {
      const list = incident.get(v);
      if (list) list.push(e);
      else incident.set(v, [e]);
    }
  }

  const blocked = (v: VertexId): boolean => {
    const b = state.buildings[v];
    return !!b && b.owner !== playerId;
  };

  const used = new Set<EdgeId>();
  let best = 0;

  const dfs = (at: VertexId, length: number): void => {
    if (length > best) best = length;
    if (blocked(at)) return; // road is severed by an opponent building
    for (const e of incident.get(at) ?? []) {
      if (used.has(e)) continue;
      const [a, b] = verticesOfEdge(e);
      const next = a === at ? b! : a!;
      used.add(e);
      dfs(next, length + 1);
      used.delete(e);
    }
  };

  for (const e of myRoads) {
    const [a, b] = verticesOfEdge(e);
    used.add(e);
    dfs(b!, 1);
    dfs(a!, 1);
    used.delete(e);
  }
  return best;
}

/**
 * Recompute every player's longest road and (re)assign the Longest Road award.
 * The current holder keeps the award on ties; a challenger must strictly exceed
 * the holder's length (and meet the 5-segment minimum).
 */
export function updateLongestRoad(state: GameState): void {
  const lengths = new Map<string, number>();
  for (const p of state.players) lengths.set(p.id, computeLongestRoad(state, p.id));

  const holder = state.longestRoadHolder;
  const holderLen = holder ? (lengths.get(holder) ?? 0) : 0;

  // A holder who no longer reaches the minimum loses the award outright.
  let bestId: string | null = holder && holderLen >= LONGEST_ROAD_MIN ? holder : null;
  let bestLen = bestId ? holderLen : LONGEST_ROAD_MIN - 1;

  for (const p of state.players) {
    const len = lengths.get(p.id)!;
    if (len >= LONGEST_ROAD_MIN && len > bestLen) {
      bestId = p.id;
      bestLen = len;
    }
  }

  state.longestRoadHolder = bestId;
  state.longestRoadLength = bestId ? (lengths.get(bestId) ?? 0) : 0;
}

/** (Re)assign the Largest Army award (>=3 knights, strictly-more-to-steal). */
export function updateLargestArmy(state: GameState): void {
  const holder = state.largestArmyHolder;
  const knightsOf = (id: string) => state.players.find((p) => p.id === id)?.playedKnights ?? 0;
  let bestId = holder && knightsOf(holder) >= LARGEST_ARMY_MIN ? holder : null;
  let bestN = bestId ? knightsOf(bestId) : LARGEST_ARMY_MIN - 1;

  for (const p of state.players) {
    if (p.playedKnights >= LARGEST_ARMY_MIN && p.playedKnights > bestN) {
      bestId = p.id;
      bestN = p.playedKnights;
    }
  }
  state.largestArmyHolder = bestId;
}

export function countBuildings(
  state: GameState,
  playerId: string,
): { settlements: number; cities: number } {
  let settlements = 0;
  let cities = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== playerId) continue;
    if (b.type === 'city') cities++;
    else settlements++;
  }
  return { settlements, cities };
}

/**
 * Victory points. `includeHidden` adds the player's hidden victory-point dev
 * cards (used for win detection and the owner's own view, not public scores).
 */
export function getVictoryPoints(
  state: GameState,
  playerId: string,
  includeHidden = false,
): number {
  const { settlements, cities } = countBuildings(state, playerId);
  let vp = settlements * VP_SETTLEMENT + cities * VP_CITY;
  if (state.longestRoadHolder === playerId) vp += VP_LONGEST_ROAD;
  if (state.largestArmyHolder === playerId) vp += VP_LARGEST_ARMY;
  if (includeHidden) {
    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      vp += [...player.devCards, ...player.newDevCards].filter((c) => c === 'victoryPoint').length;
    }
  }
  return vp;
}

export function publicVictoryPoints(state: GameState, playerId: string): number {
  return getVictoryPoints(state, playerId, false);
}
