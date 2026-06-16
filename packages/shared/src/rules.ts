import {
  type EdgeId,
  type VertexId,
  adjacentVertices,
  cornersOfHex,
  edgesOfHex,
  edgesOfVertex,
  parseHexKey,
  verticesOfEdge,
} from './coords.js';
import { RESOURCE_LIST, totalResources } from './constants.js';
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

/** A road edge the player owns that touches this vertex. */
function playerRoadAtVertex(state: GameState, playerId: string, vertex: VertexId): boolean {
  return edgesOfVertex(vertex).some((e) => state.roads[e]?.owner === playerId);
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
  if (!isEdgeOnBoard(state, edge)) return 'That road position is not on the board.';
  if (state.roads[edge]) return 'There is already a road there.';
  const [a, b] = verticesOfEdge(edge);

  if (isSetup) {
    // The setup road must touch the settlement just placed.
    if (setupSettlement && a !== setupSettlement && b !== setupSettlement)
      return 'Your first roads must connect to the settlement you just placed.';
    return null;
  }

  if (connectsToNetwork(state, playerId, a!) || connectsToNetwork(state, playerId, b!)) return null;
  return 'A road must connect to your existing roads or buildings.';
}

/** Whether the player may extend a road from this vertex. */
function connectsToNetwork(state: GameState, playerId: string, vertex: VertexId): boolean {
  const building = state.buildings[vertex];
  if (building) return building.owner === playerId; // your own building, yes; opponent's blocks
  return playerRoadAtVertex(state, playerId, vertex);
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

// The set of legal vertices/edges is exactly the corners/sides of the board's
// tiles. Topology depends only on the map layout, so cache per mapId.
const boardCache = new Map<string, { vertices: Set<VertexId>; edges: Set<EdgeId> }>();
function boardSets(state: GameState): { vertices: Set<VertexId>; edges: Set<EdgeId> } {
  const cached = boardCache.get(state.mapId);
  if (cached) return cached;
  const vertices = new Set<VertexId>();
  const edges = new Set<EdgeId>();
  for (const tile of Object.values(state.tiles)) {
    if (tile.type === 'water') continue;
    for (const v of cornersOfHex(tile.coord)) vertices.add(v);
    for (const e of edgesOfHex(tile.coord)) edges.add(e);
  }
  const result = { vertices, edges };
  boardCache.set(state.mapId, result);
  return result;
}

export function isVertexOnBoard(state: GameState, vertex: VertexId): boolean {
  return boardSets(state).vertices.has(vertex);
}
export function isEdgeOnBoard(state: GameState, edge: EdgeId): boolean {
  return boardSets(state).edges.has(edge);
}

export function getBoardVertices(state: GameState): VertexId[] {
  return [...boardSets(state).vertices];
}
export function getBoardEdges(state: GameState): EdgeId[] {
  return [...boardSets(state).edges];
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
    const resource = tile.type as Resource;
    for (const vertex of cornersOfHex(tile.coord)) {
      const building = state.buildings[vertex];
      if (!building) continue;
      const amount = building.type === 'city' ? 2 : 1;
      const map = demand[resource];
      map.set(building.owner, (map.get(building.owner) ?? 0) + amount);
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
