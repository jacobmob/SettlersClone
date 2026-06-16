import {
  type Action,
  type GameState,
  type GameView,
  type PlayerColor,
  canPlaceRoad,
  canPlaceSettlement,
  getBoardEdges,
  getBoardVertices,
} from '@catan/shared';
import { type AddressInfo } from 'node:net';
import { type Socket, io as ioClient } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signToken } from './auth.js';
import { type BuiltServer, buildServer } from './server.js';

let server: BuiltServer;
let port: number;

beforeAll(async () => {
  server = buildServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  port = (server.httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  server.io.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

function connect(userId: string): { socket: Socket; latest: () => GameView | null } {
  const token = signToken({ userId, username: userId });
  const socket = ioClient(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  let view: GameView | null = null;
  socket.on('game:state', (payload: { view: GameView }) => {
    view = payload.view;
  });
  return { socket, latest: () => view };
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Emit a game action and wait until every watcher has the resulting state. */
async function act(actor: Socket, action: Action, watchers: Socket[]): Promise<void> {
  const waits = watchers.map((s) => once(s, 'game:state'));
  const ack = await emitAck<{ ok: boolean; error?: string }>(actor, 'game:action', { action });
  if (!ack.ok) throw new Error(ack.error);
  await Promise.all(waits);
}

const asState = (v: GameView) => v as unknown as GameState;

describe('socket game flow', () => {
  it('runs lobby -> setup -> first roll across two clients', async () => {
    const u1 = connect('user-1');
    const u2 = connect('user-2');
    await Promise.all([once(u1.socket, 'connect'), once(u2.socket, 'connect')]);

    const created = await emitAck<{ ok: true; data: { roomId: string } }>(
      u1.socket,
      'lobby:create',
      { settings: { maxPlayers: 2, victoryPoints: 10 } },
    );
    expect(created.ok).toBe(true);
    const roomId = created.data.roomId;

    const joined = await emitAck<{ ok: boolean }>(u2.socket, 'lobby:join', { roomId });
    expect(joined.ok).toBe(true);

    // Pick distinct colors and ready up.
    u1.socket.emit('lobby:setColor', { color: 'red' as PlayerColor });
    u2.socket.emit('lobby:setColor', { color: 'blue' as PlayerColor });
    u2.socket.emit('lobby:setReady', { ready: true });
    await once(u1.socket, 'lobby:state');

    const firstState = once<{ view: GameView }>(u1.socket, 'game:state');
    const start = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      u1.socket.emit('lobby:start', resolve),
    );
    expect(start.ok).toBe(true);
    await firstState;

    const clients: Record<string, { socket: Socket; latest: () => GameView | null }> = {
      'user-1': u1,
      'user-2': u2,
    };
    const watchers = [u1.socket, u2.socket];
    const lastSettlement: Record<string, string> = {};

    // Drive the snake setup to completion.
    let guard = 0;
    while (guard++ < 40) {
      const view = u1.latest()!;
      if (view.phase !== 'setup') break;
      const pid = view.setupPlayerId!;
      const client = clients[pid]!;
      if (view.setupAwaiting === 'settlement') {
        const vertex = getBoardVertices(asState(view)).find(
          (v) => canPlaceSettlement(asState(view), pid, v, true) === null,
        )!;
        lastSettlement[pid] = vertex;
        await act(client.socket, { type: 'placeSettlement', vertex }, watchers);
      } else {
        const edge = getBoardEdges(asState(view)).find(
          (e) => canPlaceRoad(asState(view), pid, e, true, lastSettlement[pid] ?? null) === null,
        )!;
        await act(client.socket, { type: 'placeRoad', edge }, watchers);
      }
    }

    const afterSetup = u1.latest()!;
    expect(afterSetup.phase).toBe('rollDice');
    expect(afterSetup.currentPlayerIndex).toBe(0);
    // Everyone received resources from their second settlement.
    const totalResources = afterSetup.players.reduce((sum, p) => sum + p.resourceCount, 0);
    expect(totalResources).toBeGreaterThan(0);

    // First player rolls.
    await act(u1.socket, { type: 'rollDice' }, watchers);
    const rolled = u1.latest()!;
    expect(rolled.lastRoll).not.toBeNull();
    expect(['main', 'discard', 'moveRobber']).toContain(rolled.phase);

    u1.socket.disconnect();
    u2.socket.disconnect();
  }, 20000);
});
