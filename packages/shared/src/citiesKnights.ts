import type { VertexId } from './coords.js';
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
