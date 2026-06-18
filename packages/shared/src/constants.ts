import type { DevCardType, Resource, ResourceCounts } from './types.js';

export const BUILD_COSTS: Record<'road' | 'settlement' | 'city' | 'devCard', Partial<ResourceCounts>> =
  {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    devCard: { sheep: 1, wheat: 1, ore: 1 },
  };

export const STARTING_PIECES = { settlement: 5, city: 4, road: 15, ship: 15 };

export const SHIP_COST: Partial<ResourceCounts> = { wood: 1, sheep: 1 };

export const BANK_PER_RESOURCE = 19;

export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

export const VP_SETTLEMENT = 1;
export const VP_CITY = 2;
export const VP_LONGEST_ROAD = 2;
export const VP_LARGEST_ARMY = 2;

/** Base-game development card deck composition (25 cards). */
export function buildDevDeck(): DevCardType[] {
  const deck: DevCardType[] = [];
  const add = (card: DevCardType, n: number) => {
    for (let i = 0; i < n; i++) deck.push(card);
  };
  add('knight', 14);
  add('victoryPoint', 5);
  add('roadBuilding', 2);
  add('yearOfPlenty', 2);
  add('monopoly', 2);
  return deck;
}

export function emptyResourceCounts(): ResourceCounts {
  return { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function fullBank(): ResourceCounts {
  return {
    brick: BANK_PER_RESOURCE,
    wood: BANK_PER_RESOURCE,
    sheep: BANK_PER_RESOURCE,
    wheat: BANK_PER_RESOURCE,
    ore: BANK_PER_RESOURCE,
  };
}

export function totalResources(counts: ResourceCounts): number {
  return (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
}

export const RESOURCE_LIST: Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];
