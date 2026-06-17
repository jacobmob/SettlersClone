import {
  BUILD_COSTS,
  type EdgeId,
  type GameState,
  type GameView,
  type Resource,
  type ResourceCounts,
  type VertexId,
  canBuildCity,
  canPlaceRoad,
  canPlaceShip,
  canPlaceSettlement,
  cornersOfHex,
  edgesOfVertex,
  getBoardVertices,
  getRoadEdges,
  getShipEdges,
  parseHexKey,
} from '@catan/shared';

// The view carries enough board/state for the pure read-only validators.
const asState = (v: GameView) => v as unknown as GameState;

export function isMyTurn(view: GameView): boolean {
  const actor =
    view.phase === 'specialBuild' && view.specialBuildIndex !== null
      ? view.order[view.specialBuildIndex]
      : view.order[view.currentPlayerIndex];
  return actor === view.you;
}

/** The settlement just placed in setup = your building with no adjacent own road. */
export function activeSetupSettlement(view: GameView): VertexId | null {
  for (const [vertex, building] of Object.entries(view.buildings)) {
    if (building.owner !== view.you) continue;
    const hasRoad = edgesOfVertex(vertex).some((e) => view.roads[e]?.owner === view.you);
    if (!hasRoad) return vertex;
  }
  return null;
}

export function legalSettlements(view: GameView, isSetup: boolean): VertexId[] {
  return getBoardVertices(asState(view)).filter(
    (v) => canPlaceSettlement(asState(view), view.you, v, isSetup) === null,
  );
}

export function legalRoads(view: GameView, isSetup: boolean): EdgeId[] {
  const last = isSetup ? activeSetupSettlement(view) : null;
  return getRoadEdges(asState(view)).filter(
    (e) => canPlaceRoad(asState(view), view.you, e, isSetup, last) === null,
  );
}

export function legalShips(view: GameView, isSetup: boolean): EdgeId[] {
  if (!view.settings.expansions.includes('seafarers')) return [];
  const last = isSetup ? activeSetupSettlement(view) : null;
  return getShipEdges(asState(view)).filter(
    (e) => canPlaceShip(asState(view), view.you, e, isSetup, last) === null,
  );
}

export function legalCities(view: GameView): VertexId[] {
  return Object.keys(view.buildings).filter(
    (v) => canBuildCity(asState(view), view.you, v) === null,
  );
}

export function me(view: GameView) {
  return view.players.find((p) => p.id === view.you)!;
}

export function canAfford(view: GameView, cost: Partial<ResourceCounts>): boolean {
  const res = me(view).resources;
  if (!res) return false;
  return (Object.entries(cost) as [Resource, number][]).every(([r, n]) => res[r] >= n);
}

/** Land tiles the robber may move to (count-based; the server re-validates). */
export function landTiles(view: GameView): string[] {
  return Object.values(view.tiles)
    .filter((t) => t.type !== 'water' && t.id !== view.robberHex)
    .map((t) => t.id);
}

/** Steal candidates if the robber moves to `hex`, using public info only. */
export function robberTargets(view: GameView, hex: string): { id: string; name: string }[] {
  const owners = new Set<string>();
  for (const v of cornersOfHex(parseHexKey(hex))) {
    const b = view.buildings[v];
    if (b && b.owner !== view.you) owners.add(b.owner);
  }
  return [...owners]
    .map((id) => view.players.find((p) => p.id === id)!)
    .filter((p) => {
      if (p.resourceCount === 0) return false;
      if (view.settings.friendlyRobber && p.victoryPoints < view.settings.friendlyRobberThreshold)
        return false;
      return true;
    })
    .map((p) => ({ id: p.id, name: p.name }));
}

export const COSTS = BUILD_COSTS;
