import { createBoard } from './board.js';
import { BUILD_COSTS, STARTING_PIECES, buildDevDeck, emptyResourceCounts, fullBank, totalResources, RESOURCE_LIST } from './constants.js';
import { cornersOfHex, parseHexKey } from './coords.js';
import { drawBalanced, rollRandom, shuffledDiceDeck } from './dice.js';
import { getMap } from './maps.js';
import { Rng, makeSeed, randInt } from './rng.js';
import {
  canBuildCity,
  canPlaceRoad,
  canPlaceSettlement,
  distributeResources,
  getPlayer,
  hasResources,
  payCost,
  portRatios,
} from './rules.js';
import {
  getVictoryPoints,
  publicVictoryPoints,
  updateLargestArmy,
  updateLongestRoad,
} from './scoring.js';
import { normalizeSettings } from './settings.js';
import type {
  Action,
  ActionResult,
  DevCardType,
  GameSettings,
  GameState,
  Player,
  PlayerColor,
  PlayerStats,
  Resource,
  ResourceCounts,
} from './types.js';

export interface NewPlayer {
  id: string;
  userId: string | null;
  name: string;
  color: PlayerColor;
  avatar?: string | null;
  isBot?: boolean;
}

export interface CreateGameOptions {
  id: string;
  settings: Partial<GameSettings>;
  players: NewPlayer[];
  seed?: number;
}

function emptyStats(): PlayerStats {
  return {
    rollHistogram: {},
    knightsPlayed: 0,
    roadsBuilt: 0,
    settlementsBuilt: 0,
    citiesBuilt: 0,
    devCardsBought: 0,
    robberMoves: 0,
    resourcesGained: 0,
  };
}

export function createGame(opts: CreateGameOptions): GameState {
  const settings = normalizeSettings(opts.settings);
  const map = getMap(settings.mapId);
  const seed = opts.seed ?? makeSeed();
  const rng = new Rng(seed);
  const board = createBoard(map, rng);

  const players: Player[] = opts.players.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.name,
    color: p.color,
    avatar: p.avatar ?? null,
    isBot: p.isBot ?? false,
    resources: emptyResourceCounts(),
    devCards: [],
    newDevCards: [],
    playedKnights: 0,
    hasPlayedDevCardThisTurn: false,
    piecesLeft: { ...STARTING_PIECES },
    connected: true,
  }));

  const order = players.map((p) => p.id);
  // Snake order for the two setup rounds: forward, then reverse.
  const queue = [...order, ...[...order].reverse()];

  const devDeck = rng.shuffle(buildDevDeck());
  const balanced = settings.diceMode === 'balanced';
  let rngState = rng.state;
  let diceDeck: number[] = [];
  if (balanced) {
    const d = shuffledDiceDeck(rngState);
    diceDeck = d.deck;
    rngState = d.rngState;
  }

  return {
    id: opts.id,
    phase: 'setup',
    settings,
    mapId: map.id,
    tiles: board.tiles,
    ports: board.ports,
    buildings: {},
    roads: {},
    players,
    order,
    currentPlayerIndex: 0,
    dice: null,
    lastRoll: null,
    diceDeck,
    robberHex: board.robberHex,
    setup: { queue, index: 0, awaitingRoad: false, lastSettlement: null, round: 1 },
    pendingDiscards: {},
    freeRoadsRemaining: 0,
    hasRolled: false,
    bank: fullBank(),
    devDeck,
    largestArmyHolder: null,
    longestRoadHolder: null,
    longestRoadLength: 0,
    activeTrade: null,
    specialBuildIndex: null,
    stats: {
      perPlayer: Object.fromEntries(players.map((p) => [p.id, emptyStats()])),
      rollHistogram: {},
    },
    log: [],
    logSeq: 0,
    winner: null,
    turnNumber: 0,
    rngState,
  };
}

function log(s: GameState, type: string, message: string, playerId?: string): void {
  s.log.push({ id: s.logSeq++, type, message, playerId });
  if (s.log.length > 200) s.log.shift();
}

/** Player allowed to take build/trade actions right now. */
function actingPlayerId(s: GameState): string {
  if (s.phase === 'specialBuild' && s.specialBuildIndex !== null) {
    return s.order[s.specialBuildIndex]!;
  }
  return s.order[s.currentPlayerIndex]!;
}

export function applyAction(state: GameState, playerId: string, action: Action): ActionResult {
  const s: GameState = structuredClone(state);
  const error = dispatch(s, playerId, action);
  if (error) return { ok: false, error };
  return { ok: true, state: s };
}

function dispatch(s: GameState, playerId: string, action: Action): string | null {
  if (s.phase === 'gameOver') return 'The game is over.';
  const player = getPlayer(s, playerId);
  if (!player) return 'Unknown player.';

  switch (action.type) {
    case 'placeSettlement':
      return handleSetupSettlement(s, playerId, action.vertex);
    case 'placeRoad':
      return handleSetupRoad(s, playerId, action.edge);
    case 'rollDice':
      return handleRoll(s, playerId);
    case 'discard':
      return handleDiscard(s, playerId, action.resources);
    case 'moveRobber':
      return handleMoveRobber(s, playerId, action.hex, action.stealFrom);
    case 'buildSettlement':
      return handleBuildSettlement(s, playerId, action.vertex);
    case 'buildCity':
      return handleBuildCity(s, playerId, action.vertex);
    case 'buildRoad':
      return handleBuildRoad(s, playerId, action.edge);
    case 'buyDevCard':
      return handleBuyDevCard(s, playerId);
    case 'playKnight':
      return handlePlayKnight(s, playerId, action.hex, action.stealFrom);
    case 'playRoadBuilding':
      return handlePlayRoadBuilding(s, playerId, action.edges);
    case 'playYearOfPlenty':
      return handlePlayYearOfPlenty(s, playerId, action.resources);
    case 'playMonopoly':
      return handlePlayMonopoly(s, playerId, action.resource);
    case 'bankTrade':
      return handleBankTrade(s, playerId, action.give, action.receive);
    case 'proposeTrade':
      return handleProposeTrade(s, playerId, action.give, action.receive, action.to);
    case 'respondTrade':
      return handleRespondTrade(s, playerId, action.accept);
    case 'acceptTradeWith':
      return handleAcceptTradeWith(s, playerId, action.playerId);
    case 'cancelTrade':
      return handleCancelTrade(s, playerId);
    case 'endTurn':
      return handleEndTurn(s, playerId);
    case 'requestSpecialBuild':
      return 'Special build is automatic between turns.';
    case 'endSpecialBuild':
      return handleEndSpecialBuild(s, playerId);
    default:
      return 'Unknown action.';
  }
}

// --- setup ---

function handleSetupSettlement(s: GameState, playerId: string, vertex: string): string | null {
  if (s.phase !== 'setup' || !s.setup) return 'Not in the setup phase.';
  if (s.setup.queue[s.setup.index] !== playerId) return 'It is not your turn to place.';
  if (s.setup.awaitingRoad) return 'Place your road first.';
  const err = canPlaceSettlement(s, playerId, vertex, true);
  if (err) return err;

  const player = getPlayer(s, playerId)!;
  s.buildings[vertex] = { type: 'settlement', owner: playerId };
  player.piecesLeft.settlement--;
  s.stats.perPlayer[playerId]!.settlementsBuilt++;
  s.setup.lastSettlement = vertex;
  s.setup.awaitingRoad = true;

  if (s.setup.round === 2) {
    // Second settlement grants one of each adjacent resource.
    for (const tile of cornerTiles(s, vertex)) {
      if (tile.type === 'desert' || tile.type === 'water') continue;
      const res = tile.type as Resource;
      if (s.bank[res] > 0) {
        player.resources[res]++;
        s.bank[res]--;
        s.stats.perPlayer[playerId]!.resourcesGained++;
      }
    }
  }
  log(s, 'setup', `${player.name} placed a settlement.`, playerId);
  return null;
}

function cornerTiles(s: GameState, vertex: string) {
  return parseVertexTiles(vertex)
    .map((key) => s.tiles[key])
    .filter((t): t is NonNullable<typeof t> => !!t);
}

function parseVertexTiles(vertex: string): string[] {
  return vertex.split('|');
}

function handleSetupRoad(s: GameState, playerId: string, edge: string): string | null {
  if (s.phase !== 'setup' || !s.setup) return 'Not in the setup phase.';
  if (s.setup.queue[s.setup.index] !== playerId) return 'It is not your turn to place.';
  if (!s.setup.awaitingRoad) return 'Place a settlement first.';
  const err = canPlaceRoad(s, playerId, edge, true, s.setup.lastSettlement);
  if (err) return err;

  const player = getPlayer(s, playerId)!;
  s.roads[edge] = { owner: playerId };
  player.piecesLeft.road--;
  s.stats.perPlayer[playerId]!.roadsBuilt++;
  s.setup.awaitingRoad = false;
  s.setup.lastSettlement = null;
  s.setup.index++;
  log(s, 'setup', `${player.name} placed a road.`, playerId);

  if (s.setup.index >= s.setup.queue.length) {
    // Setup complete -> first player's turn.
    s.setup = null;
    s.phase = 'rollDice';
    s.currentPlayerIndex = 0;
    s.turnNumber = 1;
    updateLongestRoad(s);
  } else {
    s.setup.round = s.setup.index < s.players.length ? 1 : 2;
  }
  return null;
}

// --- rolling & robber ---

function handleRoll(s: GameState, playerId: string): string | null {
  if (s.phase !== 'rollDice') return 'You cannot roll right now.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  if (s.hasRolled) return 'You have already rolled.';

  let sum: number;
  if (s.settings.diceMode === 'balanced') {
    const r = drawBalanced(s.diceDeck, s.rngState);
    s.dice = r.dice;
    s.diceDeck = r.deck;
    s.rngState = r.rngState;
    sum = r.sum;
  } else {
    const r = rollRandom(s.rngState);
    s.dice = r.dice;
    s.rngState = r.rngState;
    sum = r.sum;
  }
  s.lastRoll = sum;
  s.hasRolled = true;
  s.stats.rollHistogram[sum] = (s.stats.rollHistogram[sum] ?? 0) + 1;
  const ps = s.stats.perPlayer[playerId]!;
  ps.rollHistogram[sum] = (ps.rollHistogram[sum] ?? 0) + 1;
  log(s, 'roll', `${getPlayer(s, playerId)!.name} rolled ${sum}.`, playerId);

  if (sum === 7) {
    // Determine who must discard.
    s.pendingDiscards = {};
    for (const p of s.players) {
      const total = totalResources(p.resources);
      if (total > s.settings.discardThreshold) {
        s.pendingDiscards[p.id] = Math.floor(total / 2);
      }
    }
    s.phase = Object.keys(s.pendingDiscards).length > 0 ? 'discard' : 'moveRobber';
  } else {
    distributeResources(s, sum);
    s.phase = 'main';
  }
  return null;
}

function handleDiscard(
  s: GameState,
  playerId: string,
  resources: Partial<ResourceCounts>,
): string | null {
  if (s.phase !== 'discard') return 'No discard is required right now.';
  const required = s.pendingDiscards[playerId];
  if (!required) return 'You do not need to discard.';
  const player = getPlayer(s, playerId)!;
  const total = sumPartial(resources);
  if (total !== required) return `You must discard exactly ${required} cards.`;
  for (const [res, n] of Object.entries(resources) as [Resource, number][]) {
    if ((n ?? 0) < 0) return 'Invalid discard.';
    if (player.resources[res] < (n ?? 0)) return 'You do not have those cards.';
  }
  for (const [res, n] of Object.entries(resources) as [Resource, number][]) {
    player.resources[res] -= n ?? 0;
    s.bank[res] += n ?? 0;
  }
  delete s.pendingDiscards[playerId];
  log(s, 'discard', `${player.name} discarded ${required} cards.`, playerId);
  if (Object.keys(s.pendingDiscards).length === 0) s.phase = 'moveRobber';
  return null;
}

function handleMoveRobber(
  s: GameState,
  playerId: string,
  hex: string,
  stealFrom: string | null,
): string | null {
  if (s.phase !== 'moveRobber') return 'You cannot move the robber right now.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  return resolveRobber(s, playerId, hex, stealFrom);
}

function resolveRobber(
  s: GameState,
  playerId: string,
  hex: string,
  stealFrom: string | null,
): string | null {
  const tile = s.tiles[hex];
  if (!tile || tile.type === 'water') return 'The robber must go on a land tile.';
  if (hex === s.robberHex) return 'The robber must move to a different tile.';
  s.robberHex = hex;
  s.stats.perPlayer[playerId]!.robberMoves++;

  const targets = robberTargets(s, playerId, hex);
  if (stealFrom) {
    if (!targets.includes(stealFrom)) return 'You cannot steal from that player.';
    stealRandom(s, stealFrom, playerId);
    log(s, 'robber', `${getPlayer(s, playerId)!.name} moved the robber and stole a card.`, playerId);
  } else {
    if (targets.length > 0) return 'You must choose a player to steal from.';
    log(s, 'robber', `${getPlayer(s, playerId)!.name} moved the robber.`, playerId);
  }
  s.phase = s.hasRolled ? 'main' : 'rollDice';
  return null;
}

function robberTargets(s: GameState, playerId: string, hex: string): string[] {
  const owners = new Set<string>();
  for (const v of cornersOfHex(parseHexKey(hex))) {
    const b = s.buildings[v];
    if (b && b.owner !== playerId) owners.add(b.owner);
  }
  return [...owners].filter((id) => {
    const p = getPlayer(s, id)!;
    if (totalResources(p.resources) === 0) return false;
    if (
      s.settings.friendlyRobber &&
      publicVictoryPoints(s, id) < s.settings.friendlyRobberThreshold
    ) {
      return false;
    }
    return true;
  });
}

function stealRandom(s: GameState, fromId: string, toId: string): void {
  const victim = getPlayer(s, fromId)!;
  const thief = getPlayer(s, toId)!;
  const pool: Resource[] = [];
  for (const r of RESOURCE_LIST) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
  if (pool.length === 0) return;
  const pick = randInt(s.rngState, pool.length);
  s.rngState = pick.state;
  const r = pool[pick.value]!;
  victim.resources[r]--;
  thief.resources[r]++;
}

// --- building (main / special build) ---

function ensureBuildPhase(s: GameState, playerId: string): string | null {
  if (s.phase !== 'main' && s.phase !== 'specialBuild') return 'You cannot build right now.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  return null;
}

function handleBuildSettlement(s: GameState, playerId: string, vertex: string): string | null {
  const gate = ensureBuildPhase(s, playerId);
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  if (player.piecesLeft.settlement <= 0) return 'No settlements left to build.';
  const err = canPlaceSettlement(s, playerId, vertex, false);
  if (err) return err;
  if (!hasResources(player, BUILD_COSTS.settlement)) return 'Not enough resources.';

  payCost(s, player, BUILD_COSTS.settlement);
  s.buildings[vertex] = { type: 'settlement', owner: playerId };
  player.piecesLeft.settlement--;
  s.stats.perPlayer[playerId]!.settlementsBuilt++;
  updateLongestRoad(s); // a new settlement may sever an opponent's road
  log(s, 'build', `${player.name} built a settlement.`, playerId);
  return checkWin(s, playerId);
}

function handleBuildCity(s: GameState, playerId: string, vertex: string): string | null {
  const gate = ensureBuildPhase(s, playerId);
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  if (player.piecesLeft.city <= 0) return 'No cities left to build.';
  const err = canBuildCity(s, playerId, vertex);
  if (err) return err;
  if (!hasResources(player, BUILD_COSTS.city)) return 'Not enough resources.';

  payCost(s, player, BUILD_COSTS.city);
  s.buildings[vertex] = { type: 'city', owner: playerId };
  player.piecesLeft.city--;
  player.piecesLeft.settlement++; // settlement returns to supply
  s.stats.perPlayer[playerId]!.citiesBuilt++;
  log(s, 'build', `${player.name} built a city.`, playerId);
  return checkWin(s, playerId);
}

function handleBuildRoad(s: GameState, playerId: string, edge: string): string | null {
  const gate = ensureBuildPhase(s, playerId);
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  if (player.piecesLeft.road <= 0) return 'No roads left to build.';
  const err = canPlaceRoad(s, playerId, edge, false, null);
  if (err) return err;
  if (!hasResources(player, BUILD_COSTS.road)) return 'Not enough resources.';

  payCost(s, player, BUILD_COSTS.road);
  placeRoad(s, playerId, edge);
  log(s, 'build', `${player.name} built a road.`, playerId);
  return checkWin(s, playerId);
}

function placeRoad(s: GameState, playerId: string, edge: string): void {
  const player = getPlayer(s, playerId)!;
  s.roads[edge] = { owner: playerId };
  player.piecesLeft.road--;
  s.stats.perPlayer[playerId]!.roadsBuilt++;
  updateLongestRoad(s);
}

// --- dev cards ---

function handleBuyDevCard(s: GameState, playerId: string): string | null {
  if (s.phase !== 'main' && s.phase !== 'specialBuild') return 'You cannot buy a card right now.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  if (s.devDeck.length === 0) return 'The development deck is empty.';
  const player = getPlayer(s, playerId)!;
  if (!hasResources(player, BUILD_COSTS.devCard)) return 'Not enough resources.';

  payCost(s, player, BUILD_COSTS.devCard);
  const card = s.devDeck.pop()!;
  player.newDevCards.push(card);
  s.stats.perPlayer[playerId]!.devCardsBought++;
  log(s, 'devcard', `${player.name} bought a development card.`, playerId);
  return checkWin(s, playerId); // a victory-point card could win immediately
}

function hasPlayableCard(player: Player, card: DevCardType): boolean {
  return player.devCards.includes(card);
}

function removeCard(player: Player, card: DevCardType): void {
  const i = player.devCards.indexOf(card);
  if (i >= 0) player.devCards.splice(i, 1);
}

function ensureDevPlayable(s: GameState, playerId: string, card: DevCardType): string | null {
  if (s.phase !== 'main' && s.phase !== 'rollDice') return 'You cannot play that now.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  const player = getPlayer(s, playerId)!;
  if (player.hasPlayedDevCardThisTurn) return 'You already played a development card this turn.';
  if (!hasPlayableCard(player, card)) return 'You do not have that card available.';
  return null;
}

function handlePlayKnight(
  s: GameState,
  playerId: string,
  hex: string,
  stealFrom: string | null,
): string | null {
  const gate = ensureDevPlayable(s, playerId, 'knight');
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  removeCard(player, 'knight');
  player.playedKnights++;
  player.hasPlayedDevCardThisTurn = true;
  s.stats.perPlayer[playerId]!.knightsPlayed++;
  updateLargestArmy(s);
  const err = resolveRobber(s, playerId, hex, stealFrom);
  if (err) return err;
  log(s, 'devcard', `${player.name} played a knight.`, playerId);
  return checkWin(s, playerId);
}

function handlePlayRoadBuilding(s: GameState, playerId: string, edges: string[]): string | null {
  const gate = ensureDevPlayable(s, playerId, 'roadBuilding');
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  const toPlace = edges.slice(0, 2);
  if (toPlace.length === 0) return 'Choose at least one road to build.';

  // Validate sequentially (a second road may rely on the first).
  const placed: string[] = [];
  for (const edge of toPlace) {
    if (player.piecesLeft.road <= 0) break;
    const err = canPlaceRoad(s, playerId, edge, false, null);
    if (err) return err;
    s.roads[edge] = { owner: playerId };
    player.piecesLeft.road--;
    s.stats.perPlayer[playerId]!.roadsBuilt++;
    placed.push(edge);
  }
  if (placed.length === 0) return 'No roads could be placed.';
  removeCard(player, 'roadBuilding');
  player.hasPlayedDevCardThisTurn = true;
  updateLongestRoad(s);
  log(s, 'devcard', `${player.name} played Road Building.`, playerId);
  return checkWin(s, playerId);
}

function handlePlayYearOfPlenty(
  s: GameState,
  playerId: string,
  resources: Resource[],
): string | null {
  const gate = ensureDevPlayable(s, playerId, 'yearOfPlenty');
  if (gate) return gate;
  if (resources.length !== 2) return 'Choose exactly two resources.';
  for (const r of resources) if (s.bank[r] <= 0) return 'The bank is out of that resource.';
  // Ensure the bank can cover duplicates.
  const need: Partial<ResourceCounts> = {};
  for (const r of resources) need[r] = (need[r] ?? 0) + 1;
  for (const [r, n] of Object.entries(need) as [Resource, number][]) {
    if (s.bank[r] < n) return 'The bank does not have enough.';
  }
  const player = getPlayer(s, playerId)!;
  for (const r of resources) {
    player.resources[r]++;
    s.bank[r]--;
  }
  removeCard(player, 'yearOfPlenty');
  player.hasPlayedDevCardThisTurn = true;
  log(s, 'devcard', `${player.name} played Year of Plenty.`, playerId);
  return null;
}

function handlePlayMonopoly(s: GameState, playerId: string, resource: Resource): string | null {
  const gate = ensureDevPlayable(s, playerId, 'monopoly');
  if (gate) return gate;
  const player = getPlayer(s, playerId)!;
  let taken = 0;
  for (const p of s.players) {
    if (p.id === playerId) continue;
    taken += p.resources[resource];
    p.resources[resource] = 0;
  }
  player.resources[resource] += taken;
  removeCard(player, 'monopoly');
  player.hasPlayedDevCardThisTurn = true;
  log(s, 'devcard', `${player.name} played Monopoly and took ${taken} ${resource}.`, playerId);
  return null;
}

// --- trading ---

function handleBankTrade(
  s: GameState,
  playerId: string,
  give: Resource,
  receive: Resource,
): string | null {
  const gate = ensureBuildPhase(s, playerId);
  if (gate) return gate;
  if (give === receive) return 'Choose two different resources.';
  const player = getPlayer(s, playerId)!;
  const ratio = portRatios(s, playerId)[give];
  if (player.resources[give] < ratio) return `You need ${ratio} ${give}.`;
  if (s.bank[receive] <= 0) return 'The bank is out of that resource.';
  player.resources[give] -= ratio;
  s.bank[give] += ratio;
  player.resources[receive]++;
  s.bank[receive]--;
  log(s, 'trade', `${player.name} traded ${ratio} ${give} for 1 ${receive}.`, playerId);
  return null;
}

function handleProposeTrade(
  s: GameState,
  playerId: string,
  give: Partial<ResourceCounts>,
  receive: Partial<ResourceCounts>,
  to: string[],
): string | null {
  if (s.phase !== 'main') return 'You can only trade during your main phase.';
  if (actingPlayerId(s) !== playerId) return 'It is not your turn.';
  if (sumPartial(give) === 0 || sumPartial(receive) === 0) return 'Offer must give and receive.';
  const player = getPlayer(s, playerId)!;
  for (const [res, n] of Object.entries(give) as [Resource, number][]) {
    if (player.resources[res] < (n ?? 0)) return 'You do not have those resources.';
  }
  const targets = to.filter((id) => id !== playerId && getPlayer(s, id));
  const responders = targets.length ? targets : s.order.filter((id) => id !== playerId);
  s.activeTrade = {
    id: `${s.logSeq}`,
    from: playerId,
    give,
    receive,
    to: targets,
    responses: Object.fromEntries(responders.map((id) => [id, 'pending'])),
  };
  log(s, 'trade', `${player.name} proposed a trade.`, playerId);
  return null;
}

function handleRespondTrade(s: GameState, playerId: string, accept: boolean): string | null {
  if (!s.activeTrade) return 'There is no active trade.';
  if (!(playerId in s.activeTrade.responses)) return 'This trade is not offered to you.';
  s.activeTrade.responses[playerId] = accept ? 'accept' : 'reject';
  return null;
}

function handleAcceptTradeWith(s: GameState, playerId: string, withId: string): string | null {
  if (!s.activeTrade) return 'There is no active trade.';
  if (s.activeTrade.from !== playerId) return 'Only the proposer can finalize the trade.';
  if (s.activeTrade.responses[withId] !== 'accept') return 'That player has not accepted.';
  const proposer = getPlayer(s, playerId)!;
  const partner = getPlayer(s, withId)!;
  const { give, receive } = s.activeTrade;
  // Validate both sides still hold the goods.
  for (const [res, n] of Object.entries(give) as [Resource, number][]) {
    if (proposer.resources[res] < (n ?? 0)) return 'You no longer have those resources.';
  }
  for (const [res, n] of Object.entries(receive) as [Resource, number][]) {
    if (partner.resources[res] < (n ?? 0)) return 'They no longer have those resources.';
  }
  for (const [res, n] of Object.entries(give) as [Resource, number][]) {
    proposer.resources[res] -= n ?? 0;
    partner.resources[res] += n ?? 0;
  }
  for (const [res, n] of Object.entries(receive) as [Resource, number][]) {
    partner.resources[res] -= n ?? 0;
    proposer.resources[res] += n ?? 0;
  }
  log(s, 'trade', `${proposer.name} traded with ${partner.name}.`, playerId);
  s.activeTrade = null;
  return null;
}

function handleCancelTrade(s: GameState, playerId: string): string | null {
  if (!s.activeTrade) return 'There is no active trade.';
  if (s.activeTrade.from !== playerId) return 'Only the proposer can cancel the trade.';
  s.activeTrade = null;
  return null;
}

// --- turn flow ---

function handleEndTurn(s: GameState, playerId: string): string | null {
  if (s.phase !== 'main') return 'You cannot end your turn right now.';
  if (s.order[s.currentPlayerIndex] !== playerId) return 'It is not your turn.';
  if (!s.hasRolled) return 'You must roll before ending your turn.';
  finishTurnState(s, playerId);

  if (usesSpecialBuild(s)) {
    s.phase = 'specialBuild';
    s.specialBuildIndex = (s.currentPlayerIndex + 1) % s.players.length;
  } else {
    advanceToNextPlayer(s);
  }
  return null;
}

function finishTurnState(s: GameState, playerId: string): void {
  const player = getPlayer(s, playerId)!;
  // Cards bought this turn become playable next turn.
  player.devCards.push(...player.newDevCards);
  player.newDevCards = [];
  player.hasPlayedDevCardThisTurn = false;
  s.activeTrade = null;
}

function usesSpecialBuild(s: GameState): boolean {
  return s.players.length >= 5;
}

function handleEndSpecialBuild(s: GameState, playerId: string): string | null {
  if (s.phase !== 'specialBuild' || s.specialBuildIndex === null) return 'Not in special build.';
  if (s.order[s.specialBuildIndex] !== playerId) return 'It is not your special build.';
  s.activeTrade = null;
  const next = (s.specialBuildIndex + 1) % s.players.length;
  if (next === s.currentPlayerIndex) {
    s.specialBuildIndex = null;
    advanceToNextPlayer(s);
  } else {
    s.specialBuildIndex = next;
  }
  return null;
}

function advanceToNextPlayer(s: GameState): void {
  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  s.specialBuildIndex = null;
  s.phase = 'rollDice';
  s.hasRolled = false;
  s.dice = null;
  s.freeRoadsRemaining = 0;
  s.turnNumber++;
  const next = getPlayer(s, s.order[s.currentPlayerIndex]!)!;
  next.hasPlayedDevCardThisTurn = false;
}

// --- win check ---

function checkWin(s: GameState, playerId: string): null {
  if (getVictoryPoints(s, playerId, true) >= s.settings.victoryPoints) {
    s.phase = 'gameOver';
    s.winner = playerId;
    log(s, 'gameover', `${getPlayer(s, playerId)!.name} wins the game!`, playerId);
  }
  return null;
}

// --- small helpers ---

function sumPartial(counts: Partial<ResourceCounts>): number {
  return (Object.values(counts) as number[]).reduce((a, b) => a + (b ?? 0), 0);
}
