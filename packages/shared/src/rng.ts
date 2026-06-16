/**
 * Deterministic, serialisable PRNG (mulberry32). The game state stores a single
 * numeric `rngState` so the authoritative server can advance randomness
 * reproducibly. Pure helpers return the next state alongside the value.
 */

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t >>> 0 };
}

export function randInt(state: number, maxExclusive: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * maxExclusive), state: r.state };
}

/** Stateful wrapper, convenient for one-shot setup (board/deck creation). */
export class Rng {
  state: number;

  constructor(seed: number) {
    // avoid a zero state producing a degenerate stream
    this.state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  }

  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}

export function makeSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) | 0) >>> 0;
}
