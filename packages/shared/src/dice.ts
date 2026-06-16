import { Rng, randInt } from './rng.js';

/** The 36-outcome multiset of two-dice sums, used by "balanced" mode. */
export function buildDiceDeck(): number[] {
  const counts: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
  };
  const deck: number[] = [];
  for (const [sum, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) deck.push(Number(sum));
  }
  return deck;
}

export function shuffledDiceDeck(rngState: number): { deck: number[]; rngState: number } {
  const rng = new Rng(rngState);
  const deck = rng.shuffle(buildDiceDeck());
  return { deck, rngState: rng.state };
}

/** Two independent d6. */
export function rollRandom(rngState: number): {
  dice: [number, number];
  sum: number;
  rngState: number;
} {
  const a = randInt(rngState, 6);
  const b = randInt(a.state, 6);
  const d1 = a.value + 1;
  const d2 = b.value + 1;
  return { dice: [d1, d2], sum: d1 + d2, rngState: b.state };
}

/** Pick a random pair of faces that add up to `sum` (for display only). */
function facesForSum(sum: number, rngState: number): { dice: [number, number]; rngState: number } {
  const lo = Math.max(1, sum - 6);
  const hi = Math.min(6, sum - 1);
  const r = randInt(rngState, hi - lo + 1);
  const d1 = lo + r.value;
  return { dice: [d1, sum - d1], rngState: r.state };
}

/** Draw the next sum from a balanced deck, reshuffling a fresh deck when empty. */
export function drawBalanced(
  deck: number[],
  rngState: number,
): { dice: [number, number]; sum: number; deck: number[]; rngState: number } {
  let working = deck;
  let state = rngState;
  if (working.length === 0) {
    const reshuffled = shuffledDiceDeck(state);
    working = reshuffled.deck;
    state = reshuffled.rngState;
  }
  working = [...working];
  const sum = working.pop()!;
  const faces = facesForSum(sum, state);
  return { dice: faces.dice, sum, deck: working, rngState: faces.rngState };
}
