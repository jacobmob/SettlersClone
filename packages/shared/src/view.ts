import { totalResources } from './constants.js';
import { getVictoryPoints, publicVictoryPoints } from './scoring.js';
import type {
  DevCardType,
  GamePhase,
  GameSettings,
  GameState,
  LogEntry,
  PlayerColor,
  Port,
  ResourceCounts,
  Road,
  Tile,
  TradeOffer,
} from './types.js';

export interface PublicPlayer {
  id: string;
  userId: string | null;
  name: string;
  color: PlayerColor;
  avatar: string | null;
  isBot: boolean;
  connected: boolean;
  resourceCount: number;
  /** Total unplayed development cards (hidden identities). */
  devCardCount: number;
  playedKnights: number;
  piecesLeft: { settlement: number; city: number; road: number };
  victoryPoints: number; // public VP only
  // Present only for the viewing player:
  resources?: ResourceCounts;
  devCards?: DevCardType[];
  newDevCards?: DevCardType[];
  hasPlayedDevCardThisTurn?: boolean;
}

export interface GameView {
  id: string;
  phase: GamePhase;
  settings: GameSettings;
  mapId: string;
  tiles: Record<string, Tile>;
  ports: Port[];
  buildings: GameState['buildings'];
  roads: Record<string, Road>;
  players: PublicPlayer[];
  order: string[];
  currentPlayerIndex: number;
  specialBuildIndex: number | null;
  dice: [number, number] | null;
  lastRoll: number | null;
  robberHex: string;
  setupAwaiting: 'settlement' | 'road' | null;
  setupPlayerId: string | null;
  pendingDiscards: Record<string, number>;
  bank: ResourceCounts | null; // null when hidden by settings
  devDeckCount: number;
  largestArmyHolder: string | null;
  longestRoadHolder: string | null;
  longestRoadLength: number;
  activeTrade: TradeOffer | null;
  stats: GameState['stats'];
  log: LogEntry[];
  winner: string | null;
  turnNumber: number;
  // viewer-specific
  you: string;
  yourVictoryPoints: number; // includes hidden VP cards
  yourPendingDiscard: number;
}

/**
 * Redact full game state down to what a single player may see. This is the
 * single chokepoint for hidden information (hands, dev cards, bank counts) and
 * is where fog-of-war redaction will hook in later.
 */
export function redactStateForPlayer(state: GameState, viewerId: string): GameView {
  const players: PublicPlayer[] = state.players.map((p) => {
    const base: PublicPlayer = {
      id: p.id,
      userId: p.userId,
      name: p.name,
      color: p.color,
      avatar: p.avatar,
      isBot: p.isBot,
      connected: p.connected,
      resourceCount: totalResources(p.resources),
      devCardCount: p.devCards.length + p.newDevCards.length,
      playedKnights: p.playedKnights,
      piecesLeft: p.piecesLeft,
      victoryPoints: publicVictoryPoints(state, p.id),
    };
    if (p.id === viewerId) {
      base.resources = p.resources;
      base.devCards = p.devCards;
      base.newDevCards = p.newDevCards;
      base.hasPlayedDevCardThisTurn = p.hasPlayedDevCardThisTurn;
    }
    return base;
  });

  return {
    id: state.id,
    phase: state.phase,
    settings: state.settings,
    mapId: state.mapId,
    tiles: state.tiles,
    ports: state.ports,
    buildings: state.buildings,
    roads: state.roads,
    players,
    order: state.order,
    currentPlayerIndex: state.currentPlayerIndex,
    specialBuildIndex: state.specialBuildIndex,
    dice: state.dice,
    lastRoll: state.lastRoll,
    robberHex: state.robberHex,
    setupAwaiting: state.setup ? (state.setup.awaitingRoad ? 'road' : 'settlement') : null,
    setupPlayerId: state.setup ? (state.setup.queue[state.setup.index] ?? null) : null,
    pendingDiscards: state.pendingDiscards,
    bank: state.settings.hideBankCards ? null : state.bank,
    devDeckCount: state.devDeck.length,
    largestArmyHolder: state.largestArmyHolder,
    longestRoadHolder: state.longestRoadHolder,
    longestRoadLength: state.longestRoadLength,
    activeTrade: state.activeTrade,
    stats: state.stats,
    log: state.log,
    winner: state.winner,
    turnNumber: state.turnNumber,
    you: viewerId,
    yourVictoryPoints: getVictoryPoints(state, viewerId, true),
    yourPendingDiscard: state.pendingDiscards[viewerId] ?? 0,
  };
}
