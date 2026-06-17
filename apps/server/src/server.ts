import type { ClientToServerEvents, ServerToClientEvents } from '@catan/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { type Server as HttpServer, createServer } from 'node:http';
import { type DefaultEventsMap, Server } from 'socket.io';
import { authRouter, verifyToken } from './auth.js';
import { env } from './env.js';
import { mapsRouter } from './maps.js';
import { RoomManager, type SocketData } from './rooms.js';
import { statsRouter } from './stats.js';
import { UPLOADS_DIR, uploadsRouter } from './uploads.js';

export interface BuiltServer {
  app: Express;
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
  manager: RoomManager;
}

export function buildServer(): BuiltServer {
  const app = express();
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', statsRouter);
  app.use('/api', mapsRouter);
  app.use('/api', uploadsRouter);
  app.use('/uploads', express.static(UPLOADS_DIR));

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(
    httpServer,
    { cors: { origin: env.clientOrigin, credentials: true } },
  );

  const manager = new RoomManager(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      next(new Error('Not authenticated'));
      return;
    }
    socket.data.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    manager.registerSocket(socket.id, user);

    socket.on('lobby:create', ({ settings }, ack) => {
      const roomId = manager.createRoom(user, settings);
      ack?.({ ok: true, data: { roomId } });
    });

    socket.on('lobby:join', ({ roomId }, ack) => {
      const res = manager.joinRoom(user, roomId);
      if (res.ok) ack?.({ ok: true, data: { roomId } });
      else ack?.({ ok: false, error: res.error });
    });

    socket.on('lobby:leave', () => manager.leaveRoom(user.userId));
    socket.on('lobby:list', (ack) => ack?.(manager.listRooms()));
    socket.on('lobby:updateSettings', ({ settings }) =>
      manager.updateSettings(user.userId, settings),
    );
    socket.on('lobby:setColor', ({ color }) => manager.setColor(user.userId, color));
    socket.on('lobby:setReady', ({ ready }) => manager.setReady(user.userId, ready));

    socket.on('lobby:start', async (ack) => {
      const res = await manager.startGame(user.userId);
      if (res.ok) ack?.({ ok: true, data: {} });
      else ack?.({ ok: false, error: res.error });
    });

    socket.on('game:action', ({ action }, ack) => {
      const res = manager.handleAction(user.userId, action);
      if (res.ok) ack?.({ ok: true, data: {} });
      else {
        ack?.({ ok: false, error: res.error });
        socket.emit('toast', { type: 'error', text: res.error });
      }
    });

    socket.on('game:sync', () => manager.sync(user.userId));

    socket.on('radio:add', ({ title, url }) => manager.radioAdd(user.userId, title, url));
    socket.on('radio:remove', ({ id }) => manager.radioRemove(user.userId, id));
    socket.on('radio:play', () => manager.radioPlay(user.userId));
    socket.on('radio:pause', ({ positionSec }) => manager.radioPause(user.userId, positionSec));
    socket.on('radio:skip', ({ fromIndex }) => manager.radioSkip(user.userId, fromIndex));

    socket.on('disconnect', () => manager.unregisterSocket(socket.id));
  });

  return { app, httpServer, io, manager };
}
