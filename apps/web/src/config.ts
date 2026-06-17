export const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

export const PIECE_COLORS: Record<string, string> = {
  red: '#d64545',
  orange: '#e08e35',
  blue: '#3a7bd5',
  white: '#e9e9ef',
  green: '#3fa34d',
  brown: '#8a5a2b',
};

export const RESOURCE_COLORS: Record<string, string> = {
  brick: '#b5532e',
  wood: '#2f7d3a',
  sheep: '#9ad06b',
  wheat: '#e6c34d',
  ore: '#7d8a99',
  desert: '#d9c79a',
  water: '#2f5d8a',
  gold: '#e3b53b',
};

export const RESOURCE_ICON: Record<string, string> = {
  brick: '🧱',
  wood: '🌲',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};
