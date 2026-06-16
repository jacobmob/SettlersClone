import { describe, expect, it } from 'vitest';
import { buildDiceDeck, drawBalanced, shuffledDiceDeck } from './dice.js';

describe('dice', () => {
  it('balanced deck has the exact 36-outcome distribution', () => {
    const deck = buildDiceDeck();
    expect(deck.length).toBe(36);
    const counts: Record<number, number> = {};
    for (const n of deck) counts[n] = (counts[n] ?? 0) + 1;
    expect(counts[7]).toBe(6);
    expect(counts[6]).toBe(5);
    expect(counts[8]).toBe(5);
    expect(counts[2]).toBe(1);
    expect(counts[12]).toBe(1);
  });

  it('draws every outcome exactly once over a full balanced deck', () => {
    let { deck, rngState } = shuffledDiceDeck(99);
    const drawn: number[] = [];
    for (let i = 0; i < 36; i++) {
      const r = drawBalanced(deck, rngState);
      drawn.push(r.sum);
      deck = r.deck;
      rngState = r.rngState;
      expect(r.dice[0] + r.dice[1]).toBe(r.sum);
    }
    drawn.sort((a, b) => a - b);
    expect(drawn).toEqual(buildDiceDeck().sort((a, b) => a - b));
  });

  it('reshuffles a fresh deck when empty', () => {
    const r = drawBalanced([], 7);
    expect(r.deck.length).toBe(35);
    expect(r.sum).toBeGreaterThanOrEqual(2);
    expect(r.sum).toBeLessThanOrEqual(12);
  });
});
