import { hexKey, hexNeighbors, hexesOfVertex } from './coords.js';
import { totalResources } from './constants.js';
import { getVictoryPoints, publicVictoryPoints } from './scoring.js';
import type {
  CommodityCounts,
  DevCardType,
  EventDieFace,
  GamePhase,
  GameSettings,
  GameState,
  ImprovementTrack,
  Knight,
  LogEntry,
  PlayerColor,
  Port,
  ResourceCounts,
  Road,
  TradeOffer,
  ViewTile,
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
  piecesLeft: { settlement: number; city: number; road: number; ship: number; knight: number };
  victoryPoints: number; // public VP only
  // Cities & Knights (public)
  improvements: Record<ImprovementTrack, number>;
  defenderPoints: number;
  commodityCount: number;
  // Present only for the viewing player:
  resources?: ResourceCounts;
  commodities?: CommodityCounts;
  devCards?: DevCardType[];
  newDevCards?: DevCardType[];
  hasPlayedDevCardThisTurn?: boolean;
}

export interface GameView {
  id: string;
  phase: GamePhase;
  settings: GameSettings;
  mapId: string;
  tiles: Record<string, ViewTile>;
  ports: Port[];
  buildings: GameState['buildings'];
  roads: Record<string, Road>;
  knights: Record<string, Knight>;
  players: PublicPlayer[];
  order: string[];
  currentPlayerIndex: number;
  specialBuildIndex: number | null;
  dice: [number, number] | null;
  lastRoll: number | null;
  hasRolled: boolean;
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
  pendingGold: Record<string, number>;
  // Cities & Knights
  eventDie: EventDieFace | null;
  barbarianPosition: number;
  metropolis: Record<ImprovementTrack, string | null>;
  // viewer-specific
  you: string;
  yourVictoryPoints: number; // includes hidden VP cards
  yourPendingDiscard: number;
  yourPendingGold: number;
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
      improvements: p.improvements,
      defenderPoints: p.defenderPoints,
      commodityCount: p.commodities.paper + p.commodities.cloth + p.commodities.coin,
    };
    if (p.id === viewerId) {
      base.resources = p.resources;
      base.commodities = p.commodities;
      base.devCards = p.devCards;
      base.newDevCards = p.newDevCards;
      base.hasPlayedDevCardThisTurn = p.hasPlayedDevCardThisTurn;
    }
    return base;
  });

  const tiles = redactTiles(state, viewerId);

  return {
    id: state.id,
    phase: state.phase,
    settings: state.settings,
    mapId: state.mapId,
    tiles,
    ports: state.ports,
    buildings: state.buildings,
    roads: state.roads,
    knights: state.knights,
    players,
    order: state.order,
    currentPlayerIndex: state.currentPlayerIndex,
    specialBuildIndex: state.specialBuildIndex,
    dice: state.dice,
    lastRoll: state.lastRoll,
    hasRolled: state.hasRolled,
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
    pendingGold: state.pendingGold,
    eventDie: state.eventDie,
    barbarianPosition: state.barbarianPosition,
    metropolis: state.metropolis,
    you: viewerId,
    yourVictoryPoints: getVictoryPoints(state, viewerId, true),
    yourPendingDiscard: state.pendingDiscards[viewerId] ?? 0,
    yourPendingGold: state.pendingGold[viewerId] ?? 0,
  };
}

/**
 * Fog of war: sea is always visible (so placement stays valid), but the terrain
 * type and number of land tiles are hidden until the viewer has a building on or
 * next to them. Without fog, tiles pass through unchanged.
 */
function redactTiles(state: GameState, viewerId: string): Record<string, ViewTile> {
  if (!state.settings.fogOfWar) return state.tiles;

  // Reveal each land tile under or adjacent to one of the viewer's buildings.
  const revealed = new Set<string>();
  for (const [vertex, building] of Object.entries(state.buildings)) {
    if (building.owner !== viewerId) continue;
    for (const h of hexesOfVertex(vertex)) {
      revealed.add(hexKey(h));
      for (const n of hexNeighbors(h)) revealed.add(hexKey(n));
    }
  }

  const out: Record<string, ViewTile> = {};
  for (const [id, tile] of Object.entries(state.tiles)) {
    if (tile.type === 'water' || revealed.has(id)) out[id] = tile;
    else out[id] = { id: tile.id, coord: tile.coord, type: 'fog', number: null };
  }
  return out;
}
