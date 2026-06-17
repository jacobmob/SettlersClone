import type { Action, GameSettings, PlayerColor } from './types.js';
import type { GameView } from './view.js';

export type RoomStatus = 'lobby' | 'active' | 'ended';

export interface LobbyMemberView {
  userId: string;
  name: string;
  color: PlayerColor;
  avatar: string | null;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyState {
  roomId: string;
  status: RoomStatus;
  hostUserId: string;
  settings: GameSettings;
  members: LobbyMemberView[];
}

export interface RoomSummary {
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapId: string;
  status: RoomStatus;
}

export interface TimerState {
  kind: 'roll' | 'turn' | null;
  deadline: number | null; // epoch ms
}

export interface GameStatePayload {
  view: GameView;
  timer: TimerState;
}

export interface RadioTrack {
  id: string;
  title: string;
  url: string;
  addedBy: string;
}

export interface RadioState {
  queue: RadioTrack[];
  currentIndex: number; // -1 when nothing is selected
  playing: boolean;
  /** Playback position within the current track at `updatedAt`. */
  positionSec: number;
  updatedAt: number; // epoch ms
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ClientToServerEvents {
  'lobby:create': (
    payload: { settings: Partial<GameSettings> },
    ack: (res: Ack<{ roomId: string }>) => void,
  ) => void;
  'lobby:join': (payload: { roomId: string }, ack: (res: Ack<{ roomId: string }>) => void) => void;
  'lobby:leave': () => void;
  'lobby:list': (ack: (rooms: RoomSummary[]) => void) => void;
  'lobby:updateSettings': (payload: { settings: Partial<GameSettings> }) => void;
  'lobby:setColor': (payload: { color: PlayerColor }) => void;
  'lobby:setReady': (payload: { ready: boolean }) => void;
  'lobby:start': (ack: (res: Ack<Record<string, never>>) => void) => void;
  'game:action': (payload: { action: Action }, ack: (res: Ack<Record<string, never>>) => void) => void;
  'game:sync': () => void;
  'radio:add': (payload: { title: string; url: string }) => void;
  'radio:remove': (payload: { id: string }) => void;
  'radio:play': () => void;
  'radio:pause': (payload: { positionSec: number }) => void;
  'radio:skip': (payload: { fromIndex: number }) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (state: LobbyState) => void;
  'game:state': (payload: GameStatePayload) => void;
  'radio:state': (state: RadioState) => void;
  toast: (msg: { type: 'error' | 'info'; text: string }) => void;
}
