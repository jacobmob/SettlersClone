import {
  type EdgeId,
  type VertexId,
  adjacentVertices,
  cornersOfHex,
  edgesOfHex,
  edgesOfVertex,
  hexKey,
  hexesOfEdge,
  parseHexKey,
  verticesOfEdge,
} from './coords.js';
import { RESOURCE_LIST, TERRAIN_COMMODITY, totalResources } from './constants.js';
import { publicVictoryPoints } from './scoring.js';
import type { GameState, Player, Resource, ResourceCounts } from './types.js';

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function hasResources(player: Player, cost: Partial<ResourceCounts>): boolean {
  return (Object.entries(cost) as [Resource, number][]).every(
    ([res, n]) => player.resources[res] >= n,
  );
}

/** Move a build cost from the player back to the bank. */
export function payCost(state: GameState, player: Player, cost: Partial<ResourceCounts>): void {
  for (const [res, n] of Object.entries(cost) as [Resource, number][]) {
    player.resources[res] -= n;
    state.bank[res] += n;
  }
}

export function vertexHasNeighborBuilding(state: GameState, vertex: VertexId): boolean {
  return adjacentVertices(vertex).some((v) => state.buildings[v]);
}

/** A road/ship the player owns that touches this vertex (any kind). */
function playerRoadAtVertex(state: GameState, playerId: string, vertex: VertexId): boolean {
  return edgesOfVertex(vertex).some((e) => state.roads[e]?.owner === playerId);
}

/** A piece of the given kind the player owns that touches this vertex. */
function playerPieceAtVertex(
  state: GameState,
  playerId: string,
  vertex: VertexId,
  kind: 'road' | 'ship',
): boolean {
  return edgesOfVertex(vertex).some(
    (e) => state.roads[e]?.owner === playerId && state.roads[e]?.kind === kind,
  );
}

export function canPlaceSettlement(
  state: GameState,
  playerId: string,
  vertex: VertexId,
  isSetup: boolean,
): string | null {
  if (!isVertexOnBoard(state, vertex)) return 'That spot is not on the board.';
  if (state.buildings[vertex]) return 'That spot is already occupied.';
  if (vertexHasNeighborBuilding(state, vertex))
    return 'Too close to another settlement (distance rule).';
  if (!isSetup && !playerRoadAtVertex(state, playerId, vertex))
    return 'A settlement must connect to one of your roads.';
  return null;
}

export function canPlaceRoad(
  state: GameState,
  playerId: string,
  edge: EdgeId,
  isSetup: boolean,
  setupSettlement: VertexId | null,
): string | null {
  if (!isRoadEdge(state, edge)) return 'A road must go on a land edge.';
  return canPlaceEdgePiece(state, playerId, edge, 'road', isSetup, setupSettlement);
}

/** Ships go on sea edges and connect via your ships or coastal buildings. */
export function canPlaceShip(
  state: GameState,
  playerId: string,
  edge: EdgeId,
  isSetup: boolean,
  setupSettlement: VertexId | null,
): string | null {
  if (!isShipEdge(state, edge)) return 'A ship must go on a sea edge.';
  return canPlaceEdgePiece(state, playerId, edge, 'ship', isSetup, setupSettlement);
}

function canPlaceEdgePiece(
  state: GameState,
  playerId: string,
  edge: EdgeId,
  kind: 'road' | 'ship',
  isSetup: boolean,
  setupSettlement: VertexId | null,
): string | null {
  if (state.roads[edge]) return 'There is already a piece there.';
  const [a, b] = verticesOfEdge(edge);

  if (isSetup) {
    if (setupSettlement && a !== setupSettlement && b !== setupSettlement)
      return 'Your first pieces must connect to the settlement you just placed.';
    return null;
  }

  if (connectsToNetwork(state, playerId, a!, kind) || connectsToNetwork(state, playerId, b!, kind))
    return null;
  return kind === 'ship'
    ? 'A ship must connect to your ships or a coastal settlement.'
    : 'A road must connect to your existing roads or buildings.';
}

/** Whether the player may extend a piece of `kind` from this vertex. */
function connectsToNetwork(
  state: GameState,
  playerId: string,
  vertex: VertexId,
  kind: 'road' | 'ship',
): boolean {
  const building = state.buildings[vertex];
  if (building) return building.owner === playerId; // your building joins road & ship routes
  return playerPieceAtVertex(state, playerId, vertex, kind);
}

/** Whether a vertex is part of the player's network (own building or road there). */
export function isConnectedToPlayer(state: GameState, playerId: string, vertex: VertexId): boolean {
  const b = state.buildings[vertex];
  if (b) return b.owner === playerId;
  return edgesOfVertex(vertex).some((e) => state.roads[e]?.owner === playerId);
}

export function canBuildCity(
  state: GameState,
  playerId: string,
  vertex: VertexId,
): string | null {
  const b = state.buildings[vertex];
  if (!b) return 'You can only upgrade your own settlement.';
  if (b.owner !== playerId) return 'That is not your settlement.';
  if (b.type !== 'settlement') return 'That is already a city.';
  return null;
}

// Board topology. A vertex is buildable iff it touches >=1 land-like tile
// (resource/desert/gold), so open-ocean corners are excluded. Edges are split
// into road edges (touch >=1 land-like tile) and ship edges (touch >=1 water
// tile); coastal land|water edges are in both. Topology depends only on the map
// layout, so it is cached per mapId.
interface BoardSets {
  vertices: Set<VertexId>;
  roadEdges: Set<EdgeId>;
  shipEdges: Set<EdgeId>;
}
const boardCache = new Map<string, BoardSets>();

function isLandLike(state: GameState, h: { x: number; y: number; z: number }): boolean {
  const t = state.tiles[hexKey(h)];
  return !!t && t.type !== 'water';
}
function isWater(state: GameState, h: { x: number; y: number; z: number }): boolean {
  return state.tiles[hexKey(h)]?.type === 'water';
}

function boardSets(state: GameState): BoardSets {
  const cached = boardCache.get(state.mapId);
  if (cached) return cached;
  const vertices = new Set<VertexId>();
  const roadEdges = new Set<EdgeId>();
  const shipEdges = new Set<EdgeId>();
  for (const tile of Object.values(state.tiles)) {
    if (tile.type !== 'water') {
      for (const v of cornersOfHex(tile.coord)) vertices.add(v);
    }
    for (const e of edgesOfHex(tile.coord)) {
      const [a, b] = hexesOfEdge(e);
      if (isLandLike(state, a!) || isLandLike(state, b!)) roadEdges.add(e);
      if (isWater(state, a!) || isWater(state, b!)) shipEdges.add(e);
    }
  }
  const result = { vertices, roadEdges, shipEdges };
  boardCache.set(state.mapId, result);
  return result;
}

export function isVertexOnBoard(state: GameState, vertex: VertexId): boolean {
  return boardSets(state).vertices.has(vertex);
}
export function isRoadEdge(state: GameState, edge: EdgeId): boolean {
  return boardSets(state).roadEdges.has(edge);
}
export function isShipEdge(state: GameState, edge: EdgeId): boolean {
  return boardSets(state).shipEdges.has(edge);
}
export function isEdgeOnBoard(state: GameState, edge: EdgeId): boolean {
  const sets = boardSets(state);
  return sets.roadEdges.has(edge) || sets.shipEdges.has(edge);
}

export function getBoardVertices(state: GameState): VertexId[] {
  return [...boardSets(state).vertices];
}
export function getRoadEdges(state: GameState): EdgeId[] {
  return [...boardSets(state).roadEdges];
}
export function getShipEdges(state: GameState): EdgeId[] {
  return [...boardSets(state).shipEdges];
}
export function getBoardEdges(state: GameState): EdgeId[] {
  const sets = boardSets(state);
  return [...new Set([...sets.roadEdges, ...sets.shipEdges])];
}

/**
 * Players the given player may steal from if the robber is moved to `hex`:
 * owners of an adjacent building who hold a card and (under the friendly-robber
 * rule) are at or above the VP threshold.
 */
export function robberStealTargets(state: GameState, playerId: string, hex: string): string[] {
  const owners = new Set<string>();
  for (const v of cornersOfHex(parseHexKey(hex))) {
    const b = state.buildings[v];
    if (b && b.owner !== playerId) owners.add(b.owner);
  }
  return [...owners].filter((id) => {
    const p = getPlayer(state, id);
    if (!p || totalResources(p.resources) === 0) return false;
    if (
      state.settings.friendlyRobber &&
      publicVictoryPoints(state, id) < state.settings.friendlyRobberThreshold
    ) {
      return false;
    }
    return true;
  });
}

/** Best bank-trade ratio per resource for a player (4, or 3/2 with ports). */
export function portRatios(state: GameState, playerId: string): Record<Resource, number> {
  const ratios: Record<Resource, number> = { brick: 4, wood: 4, sheep: 4, wheat: 4, ore: 4 };
  for (const port of state.ports) {
    const owns = port.vertices.some((v) => state.buildings[v]?.owner === playerId);
    if (!owns) continue;
    if (port.type === 'any') {
      for (const r of RESOURCE_LIST) ratios[r] = Math.min(ratios[r], 3);
    } else {
      ratios[port.type] = Math.min(ratios[port.type], 2);
    }
  }
  return ratios;
}

/**
 * Pay out resources for a dice roll. Honours the bank-shortage rule: if the
 * bank can't satisfy everyone owed a resource and more than one player is owed
 * it, nobody gets that resource; a sole claimant takes whatever remains.
 */
export function distributeResources(state: GameState, roll: number): void {
  const ck = state.settings.expansions.includes('citiesAndKnights');
  const demand: Record<Resource, Map<string, number>> = {
    brick: new Map(),
    wood: new Map(),
    sheep: new Map(),
    wheat: new Map(),
    ore: new Map(),
  };

  for (const tile of Object.values(state.tiles)) {
    if (tile.number !== roll) continue;
    if (tile.type === 'desert' || tile.type === 'water') continue;
    if (state.robberHex === tile.id) continue;
    for (const vertex of cornersOfHex(tile.coord)) {
      const building = state.buildings[vertex];
      if (!building) continue;
      const isCity = building.type === 'city';
      if (tile.type === 'gold') {
        // Seafarers: gold fields let the owner pick any resource(s) later.
        state.pendingGold[building.owner] = (state.pendingGold[building.owner] ?? 0) + (isCity ? 2 : 1);
        continue;
      }
      const resource = tile.type as Resource;
      const commodity = ck && isCity ? TERRAIN_COMMODITY[resource] : undefined;
      if (commodity) {
        // C&K cities on forest/mountain/pasture: 1 resource + 1 commodity.
        addDemand(demand[resource], building.owner, 1);
        const p = getPlayer(state, building.owner);
        if (p) p.commodities[commodity] += 1;
      } else {
        // settlements: 1; cities: 2 (base, and C&K fields/hills).
        addDemand(demand[resource], building.owner, isCity ? 2 : 1);
      }
    }
  }

  for (const resource of RESOURCE_LIST) {
    const map = demand[resource];
    if (map.size === 0) continue;
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    if (total <= state.bank[resource]) {
      grant(state, map, resource);
    } else if (map.size === 1) {
      // sole claimant takes what's left
      const playerId = [...map.keys()][0]!;
      grant(state, new Map([[playerId, state.bank[resource]]]), resource);
    }
    // otherwise: contested shortage -> no one receives this resource
  }
}

function addDemand(map: Map<string, number>, owner: string, amount: number): void {
  map.set(owner, (map.get(owner) ?? 0) + amount);
}

function grant(state: GameState, map: Map<string, number>, resource: Resource): void {
  for (const [playerId, amount] of map) {
    if (amount <= 0) continue;
    const player = getPlayer(state, playerId);
    if (!player) continue;
    player.resources[resource] += amount;
    state.bank[resource] -= amount;
    state.stats.perPlayer[playerId]!.resourcesGained += amount;
  }
}
