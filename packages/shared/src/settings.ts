import type { GameSettings } from './types.js';

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 4,
  victoryPoints: 10,
  friendlyRobber: false,
  friendlyRobberThreshold: 3,
  hideBankCards: false,
  diceMode: 'random',
  rollTimerSec: 0,
  turnTimerSec: 0,
  discardThreshold: 7,
  expansions: [],
  fogOfWar: false,
  mapId: 'base-3-4',
};

export function normalizeSettings(partial: Partial<GameSettings>): GameSettings {
  const s = { ...DEFAULT_SETTINGS, ...partial };
  s.maxPlayers = clamp(Math.round(s.maxPlayers), 2, 6);
  s.victoryPoints = clamp(Math.round(s.victoryPoints), 3, 25);
  s.friendlyRobberThreshold = clamp(Math.round(s.friendlyRobberThreshold), 0, 12);
  s.rollTimerSec = clamp(Math.round(s.rollTimerSec), 0, 600);
  s.turnTimerSec = clamp(Math.round(s.turnTimerSec), 0, 3600);
  s.discardThreshold = clamp(Math.round(s.discardThreshold), 0, 20);
  // Pick a sensible default map for the player count if none is appropriate.
  if (s.maxPlayers >= 5 && s.mapId === 'base-3-4') s.mapId = 'base-5-6';
  return s;
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
