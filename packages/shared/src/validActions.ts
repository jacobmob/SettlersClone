import { BUILD_COSTS } from './constants.js';
import type { EdgeId, VertexId } from './coords.js';
import {
  canBuildCity,
  canPlaceRoad,
  canPlaceSettlement,
  getBoardEdges,
  getBoardVertices,
  getPlayer,
  hasResources,
} from './rules.js';
import type { DevCardType, GameState } from './types.js';

export interface ValidActions {
  isYourTurn: boolean;
  canRoll: boolean;
  mustDiscard: number;
  mustMoveRobber: boolean;
  canBuyDevCard: boolean;
  canEndTurn: boolean;
  canEndSpecialBuild: boolean;
  playableDevCards: DevCardType[];
  buildSettlement: VertexId[];
  buildCity: VertexId[];
  buildRoad: EdgeId[];
  setupAction: 'settlement' | 'road' | null;
  setupSettlementSpots: VertexId[];
  setupRoadSpots: EdgeId[];
}

/**
 * Everything `playerId` may legally do right now. Drives the client's UI and is
 * also used by the server to pick a safe auto-action when a timer expires.
 */
export function getValidActions(state: GameState, playerId: string): ValidActions {
  const acting =
    state.phase === 'specialBuild' && state.specialBuildIndex !== null
      ? state.order[state.specialBuildIndex]
      : state.order[state.currentPlayerIndex];
  const isActing = acting === playerId;
  const player = getPlayer(state, playerId);

  const result: ValidActions = {
    isYourTurn: isActing,
    canRoll: state.phase === 'rollDice' && isActing && !state.hasRolled,
    mustDiscard: state.pendingDiscards[playerId] ?? 0,
    mustMoveRobber: state.phase === 'moveRobber' && isActing,
    canBuyDevCard: false,
    canEndTurn:
      state.phase === 'main' && state.order[state.currentPlayerIndex] === playerId && state.hasRolled,
    canEndSpecialBuild: state.phase === 'specialBuild' && isActing,
    playableDevCards: [],
    buildSettlement: [],
    buildCity: [],
    buildRoad: [],
    setupAction: null,
    setupSettlementSpots: [],
    setupRoadSpots: [],
  };

  if (!player) return result;

  // Setup phase.
  if (state.phase === 'setup' && state.setup && state.setup.queue[state.setup.index] === playerId) {
    if (state.setup.awaitingRoad) {
      result.setupAction = 'road';
      result.setupRoadSpots = getBoardEdges(state).filter(
        (e) => !canPlaceRoad(state, playerId, e, true, state.setup!.lastSettlement),
      );
    } else {
      result.setupAction = 'settlement';
      result.setupSettlementSpots = getBoardVertices(state).filter(
        (v) => !canPlaceSettlement(state, playerId, v, true),
      );
    }
    return result;
  }

  const inBuildPhase =
    (state.phase === 'main' || state.phase === 'specialBuild') && isActing;

  if (inBuildPhase) {
    if (hasResources(player, BUILD_COSTS.settlement) && player.piecesLeft.settlement > 0) {
      result.buildSettlement = getBoardVertices(state).filter(
        (v) => !canPlaceSettlement(state, playerId, v, false),
      );
    }
    if (hasResources(player, BUILD_COSTS.city) && player.piecesLeft.city > 0) {
      result.buildCity = Object.entries(state.buildings)
        .filter(([, b]) => b.owner === playerId && b.type === 'settlement')
        .map(([v]) => v)
        .filter((v) => !canBuildCity(state, playerId, v));
    }
    if (hasResources(player, BUILD_COSTS.road) && player.piecesLeft.road > 0) {
      result.buildRoad = getBoardEdges(state).filter(
        (e) => !canPlaceRoad(state, playerId, e, false, null),
      );
    }
    result.canBuyDevCard =
      state.devDeck.length > 0 && hasResources(player, BUILD_COSTS.devCard);
  }

  // Dev cards can be played on your own turn (main or before rolling).
  if ((state.phase === 'main' || state.phase === 'rollDice') && isActing && !player.hasPlayedDevCardThisTurn) {
    result.playableDevCards = [...new Set(player.devCards)].filter((c) => c !== 'victoryPoint');
  }

  return result;
}

/** The safe action to apply when a player's timer expires. */
export function autoAction(state: GameState, playerId: string): { type: 'rollDice' } | { type: 'endTurn' } | null {
  const va = getValidActions(state, playerId);
  if (va.canRoll) return { type: 'rollDice' };
  if (va.canEndTurn) return { type: 'endTurn' };
  return null;
}
