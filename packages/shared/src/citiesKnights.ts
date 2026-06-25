import {
  type VertexId,
  cornersOfHex,
  edgesOfVertex,
  parseHexKey,
  verticesOfEdge,
} from './coords.js';
import { METROPOLIS_LEVEL } from './constants.js';
import { getPlayer, isConnectedToPlayer, isVertexOnBoard } from './rules.js';
import type { GameState, ImprovementTrack } from './types.js';

export function isCitiesKnights(state: GameState): boolean {
  return state.settings.expansions.includes('citiesAndKnights');
}

/** A knight may go on an empty, network-connected vertex (no distance rule). */
export function canBuildKnight(
  state: GameState,
  playerId: string,
  vertex: VertexId,
): string | null {
  if (!isVertexOnBoard(state, vertex)) return 'That spot is not on the board.';
  if (state.buildings[vertex]) return 'A building already occupies that spot.';
  if (state.knights[vertex]) return 'A knight is already there.';
  if (!isConnectedToPlayer(state, playerId, vertex))
    return 'A knight must connect to your roads.';
  return null;
}

/** Vertices one road/ship segment away from `from` along the player's own network. */
export function knightStepTargets(
  state: GameState,
  playerId: string,
  from: VertexId,
): VertexId[] {
  const out: VertexId[] = [];
  for (const e of edgesOfVertex(from)) {
    if (state.roads[e]?.owner !== playerId) continue; // walk only your own roads/ships
    for (const v of verticesOfEdge(e)) {
      if (v !== from) out.push(v);
    }
  }
  return [...new Set(out)];
}

/**
 * Whether the player's active knight at `from` may move to `to`. A move walks
 * one segment along the player's network onto an empty intersection, or onto a
 * strictly weaker opponent knight (displacement). Settlements/cities block.
 */
export function canMoveKnight(
  state: GameState,
  playerId: string,
  from: VertexId,
  to: VertexId,
): string | null {
  const knight = state.knights[from];
  if (!knight || knight.owner !== playerId) return 'That is not your knight.';
  if (!knight.active) return 'Activate the knight before moving it.';
  if (knight.moved) return 'That knight has already acted this turn.';
  if (!isVertexOnBoard(state, to)) return 'That spot is not on the board.';
  if (from === to) return 'Choose a different intersection.';
  if (!knightStepTargets(state, playerId, from).includes(to))
    return 'A knight moves one step along your roads.';
  if (state.buildings[to]) return 'A building occupies that spot.';
  const occupant = state.knights[to];
  if (occupant) {
    if (occupant.owner === playerId) return 'One of your knights is already there.';
    if (occupant.level >= knight.level) return 'That knight is too strong to displace.';
  }
  return null;
}

/** A vacant intersection a displaced knight can retreat to (connected to its owner). */
export function displaceRetreat(
  state: GameState,
  owner: string,
  at: VertexId,
  excluding: VertexId,
): VertexId | null {
  for (const e of edgesOfVertex(at)) {
    if (state.roads[e]?.owner !== owner) continue;
    for (const v of verticesOfEdge(e)) {
      if (v === at || v === excluding) continue;
      if (state.buildings[v] || state.knights[v]) continue;
      return v;
    }
  }
  return null;
}

/** Whether the player's active knight at `from` is adjacent to the robber. */
export function knightCanChase(state: GameState, playerId: string, from: VertexId): string | null {
  const knight = state.knights[from];
  if (!knight || knight.owner !== playerId) return 'That is not your knight.';
  if (!knight.active) return 'Activate the knight before chasing the robber.';
  if (knight.moved) return 'That knight has already acted this turn.';
  if (!cornersOfHex(parseHexKey(state.robberHex)).includes(from))
    return 'That knight is not next to the robber.';
  return null;
}

/** Total strength of a player's *active* knights (used to defend Catan). */
export function knightStrength(state: GameState, playerId: string): number {
  let total = 0;
  for (const k of Object.values(state.knights)) {
    if (k.owner === playerId && k.active) total += k.level;
  }
  return total;
}

export function cityCount(state: GameState): number {
  return Object.values(state.buildings).filter((b) => b.type === 'city').length;
}

/** Re-assign each discipline's metropolis to the highest improver (>= level 4). */
export function updateMetropolis(state: GameState): void {
  for (const track of ['trade', 'politics', 'science'] as ImprovementTrack[]) {
    let best = METROPOLIS_LEVEL - 1;
    for (const p of state.players) best = Math.max(best, p.improvements[track]);
    if (best < METROPOLIS_LEVEL) {
      state.metropolis[track] = null;
      continue;
    }
    const holder = state.metropolis[track];
    const holderLevel = holder ? (getPlayer(state, holder)?.improvements[track] ?? 0) : 0;
    if (holder && holderLevel === best) continue; // ties keep the current holder
    state.metropolis[track] = state.players.find((p) => p.improvements[track] === best)?.id ?? null;
  }
}

export interface BarbarianOutcome {
  defended: boolean;
  knightStrength: number;
  cities: number;
  defenders: string[]; // top contributors awarded a defender point
  losers: string[]; // players who lost a city
}

/**
 * Resolve a barbarian attack: compare total active knight strength to the
 * number of cities. Winners (top knight strength) earn a defender point;
 * otherwise the weakest city-owners each lose a city. All knights deactivate.
 */
export function resolveBarbarianAttack(state: GameState): BarbarianOutcome {
  const cities = cityCount(state);
  const strengths = new Map<string, number>();
  for (const p of state.players) strengths.set(p.id, knightStrength(state, p.id));
  const total = [...strengths.values()].reduce((a, b) => a + b, 0);

  const outcome: BarbarianOutcome = {
    defended: total >= cities,
    knightStrength: total,
    cities,
    defenders: [],
    losers: [],
  };

  if (outcome.defended) {
    const max = Math.max(0, ...strengths.values());
    if (max > 0) {
      for (const [id, s] of strengths) {
        if (s === max) {
          outcome.defenders.push(id);
          getPlayer(state, id)!.defenderPoints += 1;
        }
      }
    }
  } else {
    // Weakest city-owners lose a city (downgraded to a settlement).
    const owners = state.players.filter((p) =>
      Object.values(state.buildings).some((b) => b.owner === p.id && b.type === 'city'),
    );
    if (owners.length > 0) {
      const min = Math.min(...owners.map((p) => strengths.get(p.id)!));
      for (const p of owners) {
        if (strengths.get(p.id) !== min) continue;
        const cityVertex = Object.entries(state.buildings).find(
          ([, b]) => b.owner === p.id && b.type === 'city',
        )?.[0];
        if (!cityVertex) continue;
        state.buildings[cityVertex] = { type: 'settlement', owner: p.id };
        p.piecesLeft.city += 1;
        if (p.piecesLeft.settlement > 0) p.piecesLeft.settlement -= 1;
        outcome.losers.push(p.id);
      }
    }
  }

  // Knights deactivate after every attack; the barbarians retreat.
  for (const k of Object.values(state.knights)) k.active = false;
  state.barbarianPosition = 0;
  return outcome;
}
