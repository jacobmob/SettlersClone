import type {
  Ack,
  Action,
  ClientToServerEvents,
  GameSettings,
  PlayerColor,
  RoomSummary,
  ServerToClientEvents,
} from '@catan/shared';
import { type Socket, io } from 'socket.io-client';
import { SERVER_URL } from './config.js';
import { useStore } from './store.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;

export function connectSocket(token: string): ClientSocket {
  if (socket) socket.disconnect();
  socket = io(SERVER_URL, { auth: { token }, transports: ['websocket'] });
  const store = useStore.getState();
  socket.on('lobby:state', (lobby) => useStore.getState().setLobby(lobby));
  socket.on('game:state', ({ view, timer }) => useStore.getState().setGame(view, timer));
  socket.on('radio:state', (radio) => useStore.getState().setRadio(radio));
  socket.on('toast', ({ type, text }) => store.pushToast(type, text));
  socket.on('connect', () => socket?.emit('game:sync'));
  socket.on('connect_error', (err) => store.pushToast('error', err.message));
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

function ensure(): ClientSocket {
  if (!socket) throw new Error('Not connected');
  return socket;
}

export const lobby = {
  create: (settings: Partial<GameSettings>): Promise<Ack<{ roomId: string }>> =>
    new Promise((resolve) => ensure().emit('lobby:create', { settings }, resolve)),
  join: (roomId: string): Promise<Ack<{ roomId: string }>> =>
    new Promise((resolve) => ensure().emit('lobby:join', { roomId }, resolve)),
  list: (): Promise<RoomSummary[]> => new Promise((resolve) => ensure().emit('lobby:list', resolve)),
  leave: () => ensure().emit('lobby:leave'),
  updateSettings: (settings: Partial<GameSettings>) =>
    ensure().emit('lobby:updateSettings', { settings }),
  setColor: (color: PlayerColor) => ensure().emit('lobby:setColor', { color }),
  setReady: (ready: boolean) => ensure().emit('lobby:setReady', { ready }),
  start: (): Promise<Ack<Record<string, never>>> =>
    new Promise((resolve) => ensure().emit('lobby:start', resolve)),
};

export function emitAction(action: Action): Promise<Ack<Record<string, never>>> {
  return new Promise((resolve) => ensure().emit('game:action', { action }, resolve));
}

export const radio = {
  add: (title: string, url: string) => ensure().emit('radio:add', { title, url }),
  remove: (id: string) => ensure().emit('radio:remove', { id }),
  play: () => ensure().emit('radio:play'),
  pause: (positionSec: number) => ensure().emit('radio:pause', { positionSec }),
  skip: (fromIndex: number) => ensure().emit('radio:skip', { fromIndex }),
};
