import type { GameView, LobbyState, TimerState } from '@catan/shared';
import { create } from 'zustand';
import type { PublicUser } from './api.js';

export interface Toast {
  id: number;
  type: 'error' | 'info';
  text: string;
}

interface AppState {
  token: string | null;
  user: PublicUser | null;
  lobby: LobbyState | null;
  game: GameView | null;
  timer: TimerState | null;
  toasts: Toast[];

  setAuth: (token: string, user: PublicUser) => void;
  setUser: (user: PublicUser) => void;
  logout: () => void;
  setLobby: (lobby: LobbyState | null) => void;
  setGame: (game: GameView, timer: TimerState) => void;
  clearRoom: () => void;
  pushToast: (type: Toast['type'], text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useStore = create<AppState>((set) => ({
  token: localStorage.getItem('catan_token'),
  user: null,
  lobby: null,
  game: null,
  timer: null,
  toasts: [],

  setAuth: (token, user) => {
    localStorage.setItem('catan_token', token);
    set({ token, user });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem('catan_token');
    set({ token: null, user: null, lobby: null, game: null, timer: null });
  },
  setLobby: (lobby) => set({ lobby }),
  setGame: (game, timer) => set({ game, timer }),
  clearRoom: () => set({ lobby: null, game: null, timer: null }),
  pushToast: (type, text) =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, type, text }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
