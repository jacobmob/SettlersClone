import type {
  Commodity,
  CommodityCounts,
  DevCardType,
  ImprovementTrack,
  ProgressCard,
  Resource,
  ResourceCounts,
} from './types.js';

export const BUILD_COSTS: Record<'road' | 'settlement' | 'city' | 'devCard', Partial<ResourceCounts>> =
  {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    devCard: { sheep: 1, wheat: 1, ore: 1 },
  };

export const STARTING_PIECES = { settlement: 5, city: 4, road: 15, ship: 15, knight: 6 };

export const SHIP_COST: Partial<ResourceCounts> = { wood: 1, sheep: 1 };

// --- Cities & Knights ---
export const KNIGHT_COST: Partial<ResourceCounts> = { ore: 1, sheep: 1 };
export const KNIGHT_ACTIVATE_COST: Partial<ResourceCounts> = { wheat: 1 };
export const MAX_IMPROVEMENT = 5;
export const METROPOLIS_LEVEL = 4;
export const MAX_KNIGHT_LEVEL = 3;
export const BARBARIAN_MAX = 7;
export const CK_VICTORY_POINTS = 13;
export const VP_METROPOLIS = 2; // on top of the city's 2

/** Terrain -> commodity a city produces (in addition to its resource). */
export const TERRAIN_COMMODITY: Partial<Record<Resource, Commodity>> = {
  wood: 'paper',
  ore: 'coin',
  sheep: 'cloth',
};

/** Commodity required to advance each improvement track. */
export const TRACK_COMMODITY: Record<ImprovementTrack, Commodity> = {
  trade: 'cloth',
  politics: 'coin',
  science: 'paper',
};

/** Which discipline deck each progress card is drawn from. */
export const PROGRESS_TRACK: Record<ProgressCard, ImprovementTrack> = {
  alchemist: 'science',
  crane: 'science',
  irrigation: 'science',
  medicine: 'science',
  mining: 'science',
  printer: 'science',
  roadBuilding: 'science',
  smith: 'science',
  bishop: 'politics',
  constitution: 'politics',
  deserter: 'politics',
  warlord: 'politics',
  masterMerchant: 'trade',
  merchantFleet: 'trade',
  resourceMonopoly: 'trade',
  tradeMonopoly: 'trade',
};

/** Player-facing names and a one-line description for each progress card. */
export const PROGRESS_INFO: Record<ProgressCard, { label: string; desc: string }> = {
  alchemist: { label: 'Alchemist', desc: 'Set the two number dice before your next roll.' },
  crane: { label: 'Crane', desc: 'Your next city improvement costs 1 fewer commodity.' },
  irrigation: { label: 'Irrigation', desc: '+2 wheat for each field your buildings border.' },
  medicine: { label: 'Medicine', desc: 'Build one city this turn for 2 ore + 1 wheat.' },
  mining: { label: 'Mining', desc: '+2 ore for each mountain your buildings border.' },
  printer: { label: 'Printer', desc: 'Gain 1 victory point (kept, face-up).' },
  roadBuilding: { label: 'Road Building', desc: 'Build up to 2 roads for free.' },
  smith: { label: 'Smith', desc: 'Promote up to 2 of your knights for free.' },
  bishop: { label: 'Bishop', desc: 'Move the robber and steal from every adjacent player.' },
  constitution: { label: 'Constitution', desc: 'Gain 1 victory point (kept, face-up).' },
  deserter: { label: 'Deserter', desc: 'An opponent loses a knight; you gain one to deploy.' },
  warlord: { label: 'Warlord', desc: 'Activate all of your knights for free.' },
  masterMerchant: { label: 'Master Merchant', desc: 'Take 2 cards from a player with more points.' },
  merchantFleet: { label: 'Merchant Fleet', desc: 'Trade one resource at 2:1 this turn.' },
  resourceMonopoly: { label: 'Resource Monopoly', desc: 'Take up to 2 of a resource from each opponent.' },
  tradeMonopoly: { label: 'Trade Monopoly', desc: 'Take 1 of a commodity from each opponent.' },
};

export const PROGRESS_HAND_LIMIT = 4;

/** Build the three discipline decks (drawn from the end). */
export function buildProgressDecks(): Record<ImprovementTrack, ProgressCard[]> {
  const make = (entries: [ProgressCard, number][]): ProgressCard[] => {
    const out: ProgressCard[] = [];
    for (const [card, n] of entries) for (let i = 0; i < n; i++) out.push(card);
    return out;
  };
  return {
    science: make([
      ['alchemist', 2],
      ['crane', 2],
      ['irrigation', 2],
      ['medicine', 2],
      ['mining', 2],
      ['printer', 1],
      ['roadBuilding', 2],
      ['smith', 2],
    ]),
    politics: make([
      ['bishop', 2],
      ['constitution', 1],
      ['deserter', 2],
      ['warlord', 2],
    ]),
    trade: make([
      ['masterMerchant', 2],
      ['merchantFleet', 2],
      ['resourceMonopoly', 4],
      ['tradeMonopoly', 2],
    ]),
  };
}

/** Commodities needed to go from `level` to `level + 1`. */
export function improvementCost(level: number): number {
  return level + 1;
}

export function emptyCommodityCounts(): CommodityCounts {
  return { paper: 0, cloth: 0, coin: 0 };
}

export const COMMODITY_LIST: Commodity[] = ['paper', 'cloth', 'coin'];

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
