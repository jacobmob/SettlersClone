import type { Cube, EdgeId, VertexId } from './coords.js';

export type Resource = 'brick' | 'wood' | 'sheep' | 'wheat' | 'ore';
export const RESOURCES: readonly Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];

export type TileType = Resource | 'desert' | 'water' | 'gold';

export type DevCardType =
  | 'knight'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly'
  | 'victoryPoint';

/** Port trade ratios: a specific resource is 2:1, 'any' is the generic 3:1 port. */
export type PortType = Resource | 'any';

export type PlayerColor = 'red' | 'orange' | 'blue' | 'white' | 'green' | 'brown';
export const PLAYER_COLORS: readonly PlayerColor[] = [
  'red',
  'orange',
  'blue',
  'white',
  'green',
  'brown',
];

export type ResourceCounts = Record<Resource, number>;

export interface Tile {
  id: string; // hexKey
  coord: Cube;
  type: TileType;
  /** Dice number; null for desert/water. */
  number: number | null;
}

export interface Port {
  type: PortType;
  vertices: VertexId[];
}

export type BuildingType = 'settlement' | 'city';

export interface Building {
  type: BuildingType;
  owner: string; // player id
}

export interface Road {
  owner: string; // player id
  /** 'road' on land edges, 'ship' on sea edges (Seafarers). Defaults to 'road'. */
  kind: 'road' | 'ship';
}

export interface Player {
  id: string; // stable per-game id
  userId: string | null; // db user id, null for guests/bots
  name: string;
  color: PlayerColor;
  avatar: string | null;
  isBot: boolean;
  resources: ResourceCounts;
  /** Dev cards playable from a previous turn. */
  devCards: DevCardType[];
  /** Dev cards bought this turn (cannot be played until next turn). */
  newDevCards: DevCardType[];
  playedKnights: number;
  hasPlayedDevCardThisTurn: boolean;
  piecesLeft: { settlement: number; city: number; road: number; ship: number };
  connected: boolean;
}

export type GamePhase =
  | 'lobby'
  | 'setup' // initial snake placement
  | 'rollDice'
  | 'discard' // players over the limit must discard after a 7
  | 'moveRobber'
  | 'goldChoice' // Seafarers: players pick resources for gold-field production
  | 'main' // build / trade / play dev cards
  | 'specialBuild' // 5-6 player special build phase
  | 'gameOver';

export interface TradeOffer {
  id: string;
  from: string;
  give: Partial<ResourceCounts>;
  receive: Partial<ResourceCounts>;
  /** Target player ids; empty means open to all. */
  to: string[];
  responses: Record<string, 'accept' | 'reject' | 'pending'>;
}

export interface PlayerStats {
  rollHistogram: Record<number, number>;
  knightsPlayed: number;
  roadsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  devCardsBought: number;
  robberMoves: number;
  resourcesGained: number;
}

export interface GameStats {
  perPlayer: Record<string, PlayerStats>;
  rollHistogram: Record<number, number>;
}

export interface LogEntry {
  id: number;
  type: string;
  playerId?: string;
  message: string;
}

export type DiceMode = 'random' | 'balanced';

export interface GameSettings {
  maxPlayers: number; // 3-6
  victoryPoints: number; // target to win, default 10
  friendlyRobber: boolean; // cannot rob players under the threshold
  friendlyRobberThreshold: number; // VP threshold, default 3
  hideBankCards: boolean; // hide remaining bank resource counts
  diceMode: DiceMode;
  rollTimerSec: number; // 0 = off
  turnTimerSec: number; // 0 = off
  discardThreshold: number; // hand size that triggers discard on a 7, default 7
  /** Reserved for later PRs; declared now so the type is stable. */
  expansions: string[];
  fogOfWar: boolean;
  mapId: string;
}

export interface SetupState {
  /** Snake order of player ids for the two setup rounds. */
  queue: string[];
  index: number;
  awaitingRoad: boolean;
  lastSettlement: VertexId | null;
  round: 1 | 2;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  settings: GameSettings;
  mapId: string;

  tiles: Record<string, Tile>;
  ports: Port[];
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, Road>;

  players: Player[];
  order: string[];
  currentPlayerIndex: number;

  dice: [number, number] | null;
  lastRoll: number | null;
  /** Pre-shuffled deck of dice sums for balanced mode (drawn from the end). */
  diceDeck: number[];

  robberHex: string;

  setup: SetupState | null;

  /** player id -> number of cards they still must discard after a 7. */
  pendingDiscards: Record<string, number>;
  /** Seafarers: player id -> resources still owed from gold-field production. */
  pendingGold: Record<string, number>;
  /** Free roads still owed from a Road Building card / setup. */
  freeRoadsRemaining: number;
  /** True once the current player has rolled this turn. */
  hasRolled: boolean;

  bank: ResourceCounts;
  devDeck: DevCardType[];

  largestArmyHolder: string | null;
  longestRoadHolder: string | null;
  longestRoadLength: number;

  activeTrade: TradeOffer | null;

  /** Index into `order` of the player currently in the special-build phase. */
  specialBuildIndex: number | null;

  stats: GameStats;
  log: LogEntry[];
  logSeq: number;
  winner: string | null;
  turnNumber: number;
  rngState: number;
}

// --- Actions (player intents) ---

export type Action =
  | { type: 'placeSettlement'; vertex: VertexId }
  | { type: 'placeRoad'; edge: EdgeId }
  | { type: 'rollDice' }
  | { type: 'discard'; resources: Partial<ResourceCounts> }
  | { type: 'moveRobber'; hex: string; stealFrom: string | null }
  | { type: 'buildSettlement'; vertex: VertexId }
  | { type: 'buildCity'; vertex: VertexId }
  | { type: 'buildRoad'; edge: EdgeId }
  | { type: 'buildShip'; edge: EdgeId }
  | { type: 'placeShip'; edge: EdgeId }
  | { type: 'chooseGold'; resources: Partial<ResourceCounts> }
  | { type: 'buyDevCard' }
  | { type: 'playKnight'; hex: string; stealFrom: string | null }
  | { type: 'playRoadBuilding'; edges: EdgeId[] }
  | { type: 'playYearOfPlenty'; resources: Resource[] }
  | { type: 'playMonopoly'; resource: Resource }
  | { type: 'bankTrade'; give: Resource; receive: Resource }
  | {
      type: 'proposeTrade';
      give: Partial<ResourceCounts>;
      receive: Partial<ResourceCounts>;
      to: string[];
    }
  | { type: 'respondTrade'; accept: boolean }
  | { type: 'acceptTradeWith'; playerId: string }
  | { type: 'cancelTrade' }
  | { type: 'endTurn' }
  | { type: 'requestSpecialBuild' }
  | { type: 'endSpecialBuild' };

export type ActionType = Action['type'];

export interface ActionResultOk {
  ok: true;
  state: GameState;
}
export interface ActionResultErr {
  ok: false;
  error: string;
}
export type ActionResult = ActionResultOk | ActionResultErr;

// --- Map definition (used by createBoard; general enough for the future editor) ---

export interface HexDef {
  coord: Cube;
  /** Fixed tile type, or omit to draw from the resource bag at game start. */
  fixedType?: TileType;
}

export interface PortDef {
  /** Edge given as a land hex plus a neighbour-direction index (0-5). */
  hex: Cube;
  dir: number;
  type: PortType;
}

export interface MapDef {
  id: string;
  name: string;
  playerRange: [number, number];
  hexes: HexDef[];
  ports: PortDef[];
  /** Multiset of tile types drawn (shuffled) onto non-fixed hexes. */
  resourceBag: TileType[];
  /** Multiset of dice numbers placed (shuffled) onto resource hexes. */
  numberBag: number[];
  /**
   * Multiset of port types to distribute evenly around the coast when `ports`
   * is empty. Lets built-in/random maps avoid hand-placing every port.
   */
  portBag?: PortType[];
}
