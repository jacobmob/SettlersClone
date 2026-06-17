import {
  type Action,
  type ClientToServerEvents,
  type GameSettings,
  type GameState,
  type GameStatePayload,
  type LobbyState,
  type NewPlayer,
  PLAYER_COLORS,
  type PlayerColor,
  type ResourceCounts,
  type RoomSummary,
  type ServerToClientEvents,
  type TimerState,
  applyAction,
  computeLongestRoad,
  createGame,
  getVictoryPoints,
  normalizeSettings,
  redactStateForPlayer,
  robberStealTargets,
} from '@catan/shared';
import type { DefaultEventsMap, Server } from 'socket.io';
import { prisma } from './db.js';
import type { TokenPayload } from './auth.js';

export interface SocketData {
  user: TokenPayload;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

interface Member {
  userId: string;
  name: string;
  color: PlayerColor;
  avatar: string | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

interface Room {
  id: string;
  status: 'lobby' | 'active' | 'ended';
  settings: GameSettings;
  members: Member[];
  game: GameState | null;
  persisted: boolean;
  rollTimer?: NodeJS.Timeout;
  turnTimer?: NodeJS.Timeout;
  turnToken: string;
  turnDeadline: number | null;
  timer: TimerState;
}

let roomSeq = 1;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private userRoom = new Map<string, string>();
  private userSockets = new Map<string, Set<string>>();
  private socketUser = new Map<string, TokenPayload>();

  constructor(private io: TypedServer) {}

  // --- socket lifecycle ---

  registerSocket(socketId: string, user: TokenPayload): void {
    this.socketUser.set(socketId, user);
    const set = this.userSockets.get(user.userId) ?? new Set();
    set.add(socketId);
    this.userSockets.set(user.userId, set);

    const room = this.roomOf(user.userId);
    if (room) {
      const member = room.members.find((m) => m.userId === user.userId);
      if (member) member.connected = true;
      this.broadcastLobby(room);
      if (room.game) this.sendGame(room, user.userId);
    }
  }

  unregisterSocket(socketId: string): void {
    const user = this.socketUser.get(socketId);
    this.socketUser.delete(socketId);
    if (!user) return;
    const set = this.userSockets.get(user.userId);
    set?.delete(socketId);
    if (set && set.size === 0) {
      this.userSockets.delete(user.userId);
      const room = this.roomOf(user.userId);
      if (room) {
        const member = room.members.find((m) => m.userId === user.userId);
        if (member) member.connected = false;
        // In a lobby, drop them entirely; mid-game keep the seat for reconnect.
        if (room.status === 'lobby') this.removeMember(room, user.userId);
        this.broadcastLobby(room);
      }
    }
  }

  // --- lobby ---

  createRoom(user: TokenPayload, settings: Partial<GameSettings>): string {
    this.leaveRoom(user.userId);
    const id = `room-${roomSeq++}`;
    const normalized = normalizeSettings(settings);
    const room: Room = {
      id,
      status: 'lobby',
      settings: normalized,
      members: [],
      game: null,
      persisted: false,
      turnToken: '',
      turnDeadline: null,
      timer: { kind: null, deadline: null },
    };
    this.rooms.set(id, room);
    this.addMember(room, user, true);
    this.userRoom.set(user.userId, id);
    this.broadcastLobby(room);
    return id;
  }

  joinRoom(user: TokenPayload, roomId: string): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.members.some((m) => m.userId === user.userId)) {
      this.userRoom.set(user.userId, roomId);
      this.broadcastLobby(room);
      return { ok: true };
    }
    if (room.status !== 'lobby') return { ok: false, error: 'That game has already started.' };
    if (room.members.length >= room.settings.maxPlayers)
      return { ok: false, error: 'That room is full.' };
    this.leaveRoom(user.userId);
    this.addMember(room, user, false);
    this.userRoom.set(user.userId, roomId);
    this.broadcastLobby(room);
    return { ok: true };
  }

  leaveRoom(userId: string): void {
    const room = this.roomOf(userId);
    if (!room) return;
    this.userRoom.delete(userId);
    if (room.status === 'lobby') this.removeMember(room, userId);
    else {
      const m = room.members.find((x) => x.userId === userId);
      if (m) m.connected = false;
    }
    this.broadcastLobby(room);
  }

  listRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'lobby')
      .map((r) => ({
        roomId: r.id,
        hostName: r.members.find((m) => m.isHost)?.name ?? '?',
        playerCount: r.members.length,
        maxPlayers: r.settings.maxPlayers,
        mapId: r.settings.mapId,
        status: r.status,
      }));
  }

  updateSettings(userId: string, settings: Partial<GameSettings>): void {
    const room = this.roomOf(userId);
    if (!room || room.status !== 'lobby') return;
    if (!this.isHost(room, userId)) return;
    const next = normalizeSettings({ ...room.settings, ...settings });
    next.maxPlayers = Math.max(next.maxPlayers, room.members.length);
    room.settings = next;
    this.broadcastLobby(room);
  }

  setColor(userId: string, color: PlayerColor): void {
    const room = this.roomOf(userId);
    if (!room || room.status !== 'lobby') return;
    if (room.members.some((m) => m.userId !== userId && m.color === color)) return;
    const member = room.members.find((m) => m.userId === userId);
    if (member) member.color = color;
    this.broadcastLobby(room);
  }

  setReady(userId: string, ready: boolean): void {
    const room = this.roomOf(userId);
    if (!room || room.status !== 'lobby') return;
    const member = room.members.find((m) => m.userId === userId);
    if (member) member.ready = ready;
    this.broadcastLobby(room);
  }

  startGame(userId: string): { ok: true } | { ok: false; error: string } {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, error: 'You are not in a room.' };
    if (!this.isHost(room, userId)) return { ok: false, error: 'Only the host can start.' };
    if (room.status !== 'lobby') return { ok: false, error: 'Already started.' };
    if (room.members.length < 2) return { ok: false, error: 'Need at least 2 players.' };
    if (!room.members.every((m) => m.ready || m.isHost))
      return { ok: false, error: 'All players must be ready.' };

    const players: NewPlayer[] = room.members.map((m) => ({
      id: m.userId,
      userId: m.userId,
      name: m.name,
      color: m.color,
      avatar: m.avatar,
    }));
    room.settings = normalizeSettings({ ...room.settings, maxPlayers: room.members.length });
    room.game = createGame({ id: room.id, settings: room.settings, players });
    room.status = 'active';
    this.afterChange(room);
    return { ok: true };
  }

  // --- gameplay ---

  handleAction(
    userId: string,
    action: Action,
  ): { ok: true } | { ok: false; error: string } {
    const room = this.roomOf(userId);
    if (!room || !room.game || room.status !== 'active')
      return { ok: false, error: 'No active game.' };
    const result = applyAction(room.game, userId, action);
    if (!result.ok) return { ok: false, error: result.error };
    room.game = result.state;
    this.afterChange(room);
    return { ok: true };
  }

  sync(userId: string): void {
    const room = this.roomOf(userId);
    if (!room) return;
    this.broadcastLobby(room);
    if (room.game) this.sendGame(room, userId);
  }

  // --- internal helpers ---

  private roomOf(userId: string): Room | undefined {
    const id = this.userRoom.get(userId);
    return id ? this.rooms.get(id) : undefined;
  }

  private isHost(room: Room, userId: string): boolean {
    return room.members.find((m) => m.isHost)?.userId === userId;
  }

  private addMember(room: Room, user: TokenPayload, isHost: boolean): void {
    const used = new Set(room.members.map((m) => m.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0]!;
    room.members.push({
      userId: user.userId,
      name: user.username,
      color,
      avatar: null,
      ready: false,
      connected: true,
      isHost,
    });
  }

  private removeMember(room: Room, userId: string): void {
    const wasHost = this.isHost(room, userId);
    room.members = room.members.filter((m) => m.userId !== userId);
    if (room.members.length === 0) {
      this.clearTimers(room);
      this.rooms.delete(room.id);
      return;
    }
    if (wasHost) room.members[0]!.isHost = true;
  }

  private afterChange(room: Room): void {
    if (room.game && room.game.phase === 'gameOver' && !room.persisted) {
      void this.persistGame(room);
    }
    this.updateTimers(room);
    this.broadcastGame(room);
  }

  // --- broadcasting ---

  private lobbyState(room: Room): LobbyState {
    return {
      roomId: room.id,
      status: room.status,
      hostUserId: room.members.find((m) => m.isHost)?.userId ?? '',
      settings: room.settings,
      members: room.members.map((m) => ({
        userId: m.userId,
        name: m.name,
        color: m.color,
        avatar: m.avatar,
        ready: m.ready,
        isHost: m.isHost,
        connected: m.connected,
      })),
    };
  }

  private broadcastLobby(room: Room): void {
    if (!this.rooms.has(room.id)) return;
    const state = this.lobbyState(room);
    for (const m of room.members) {
      for (const sid of this.userSockets.get(m.userId) ?? []) {
        this.io.to(sid).emit('lobby:state', state);
      }
    }
  }

  private sendGame(room: Room, userId: string): void {
    if (!room.game) return;
    const payload: GameStatePayload = {
      view: redactStateForPlayer(room.game, userId),
      timer: room.timer,
    };
    for (const sid of this.userSockets.get(userId) ?? []) {
      this.io.to(sid).emit('game:state', payload);
    }
  }

  private broadcastGame(room: Room): void {
    if (!room.game) return;
    for (const m of room.members) this.sendGame(room, m.userId);
  }

  // --- timers & auto-resolution ---

  private clearTimers(room: Room): void {
    if (room.rollTimer) clearTimeout(room.rollTimer);
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.rollTimer = undefined;
    room.turnTimer = undefined;
  }

  private updateTimers(room: Room): void {
    this.clearTimers(room);
    const s = room.game;
    if (!s || s.phase === 'gameOver' || room.status !== 'active') {
      room.timer = { kind: null, deadline: null };
      return;
    }
    const now = Date.now();
    const { rollTimerSec, turnTimerSec } = s.settings;

    let turnDeadline: number | null = null;
    if (turnTimerSec > 0) {
      const token = `${s.currentPlayerIndex}:${s.turnNumber}:${
        s.phase === 'specialBuild' ? s.specialBuildIndex : '-'
      }`;
      if (room.turnToken !== token) {
        room.turnToken = token;
        room.turnDeadline = now + turnTimerSec * 1000;
      }
      turnDeadline = room.turnDeadline;
      room.turnTimer = setTimeout(
        () => this.onTurnTimeout(room.id),
        Math.max(0, (turnDeadline ?? now) - now),
      );
    } else {
      room.turnDeadline = null;
    }

    let rollDeadline: number | null = null;
    if (rollTimerSec > 0 && s.phase === 'rollDice' && !s.hasRolled) {
      rollDeadline = now + rollTimerSec * 1000;
      room.rollTimer = setTimeout(() => this.onRollTimeout(room.id), rollTimerSec * 1000);
    }

    if (rollDeadline !== null) room.timer = { kind: 'roll', deadline: rollDeadline };
    else if (turnDeadline !== null) room.timer = { kind: 'turn', deadline: turnDeadline };
    else room.timer = { kind: null, deadline: null };
  }

  private onRollTimeout(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return;
    const s = room.game;
    if (s.phase !== 'rollDice' || s.hasRolled) return;
    this.applyServer(room, s.order[s.currentPlayerIndex]!, { type: 'rollDice' });
    this.afterChange(room);
  }

  private onTurnTimeout(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return;
    this.autoResolveTurn(room);
    this.afterChange(room);
  }

  private applyServer(room: Room, userId: string, action: Action): boolean {
    if (!room.game) return false;
    const result = applyAction(room.game, userId, action);
    if (result.ok) {
      room.game = result.state;
      return true;
    }
    return false;
  }

  /** Force the current turn to completion when the turn timer expires. */
  private autoResolveTurn(room: Room): void {
    let guard = 0;
    while (room.game && room.game.phase !== 'gameOver' && guard++ < 60) {
      const s = room.game;
      if (s.phase === 'specialBuild' && s.specialBuildIndex !== null) {
        if (!this.applyServer(room, s.order[s.specialBuildIndex]!, { type: 'endSpecialBuild' }))
          break;
        continue;
      }
      const cur = s.order[s.currentPlayerIndex]!;
      if (s.phase === 'rollDice' && !s.hasRolled) {
        if (!this.applyServer(room, cur, { type: 'rollDice' })) break;
      } else if (s.phase === 'discard') {
        const pid = Object.keys(s.pendingDiscards)[0]!;
        if (!this.applyServer(room, pid, autoDiscard(s, pid))) break;
      } else if (s.phase === 'goldChoice') {
        const pid = Object.keys(s.pendingGold)[0]!;
        if (!this.applyServer(room, pid, autoGold(s, pid))) break;
      } else if (s.phase === 'moveRobber') {
        if (!this.applyServer(room, cur, autoRobber(s, cur))) break;
      } else if (s.phase === 'main') {
        this.applyServer(room, cur, { type: 'endTurn' });
        break;
      } else {
        break; // setup or unexpected phase
      }
    }
  }

  // --- persistence ---

  private async persistGame(room: Room): Promise<void> {
    if (!room.game || room.persisted) return;
    room.persisted = true;
    room.status = 'ended';
    const s = room.game;
    try {
      await prisma.game.create({
        data: {
          id: `${room.id}-${Date.now()}`,
          mapId: s.mapId,
          settingsJson: s.settings as unknown as object,
          winnerUserId: s.winner,
          endedAt: new Date(),
          players: {
            create: s.players.map((p) => ({
              userId: p.userId!,
              seatColor: p.color,
              finalVP: getVictoryPoints(s, p.id, true),
              knightsPlayed: s.stats.perPlayer[p.id]!.knightsPlayed,
              longestRoadLen: computeLongestRoad(s, p.id),
              hadLargestArmy: s.largestArmyHolder === p.id,
              hadLongestRoad: s.longestRoadHolder === p.id,
              roadsBuilt: s.stats.perPlayer[p.id]!.roadsBuilt,
              settlementsBuilt: s.stats.perPlayer[p.id]!.settlementsBuilt,
              citiesBuilt: s.stats.perPlayer[p.id]!.citiesBuilt,
              devCardsBought: s.stats.perPlayer[p.id]!.devCardsBought,
              diceHistogramJson: s.stats.perPlayer[p.id]!.rollHistogram,
            })),
          },
        },
      });
      await Promise.all(
        s.players.map((p) =>
          prisma.user.update({
            where: { id: p.userId! },
            data: p.id === s.winner ? { wins: { increment: 1 } } : { losses: { increment: 1 } },
          }),
        ),
      );
    } catch (err) {
      console.error('Failed to persist game result:', err);
    }
  }
}

function autoDiscard(s: GameState, pid: string): Action {
  const player = s.players.find((p) => p.id === pid)!;
  const counts: ResourceCounts = { ...player.resources };
  const out: Partial<ResourceCounts> = {};
  let need = s.pendingDiscards[pid] ?? 0;
  const resources = Object.keys(counts) as (keyof ResourceCounts)[];
  while (need > 0) {
    resources.sort((a, b) => counts[b] - counts[a]);
    const r = resources[0]!;
    if (counts[r] <= 0) break;
    out[r] = (out[r] ?? 0) + 1;
    counts[r]--;
    need--;
  }
  return { type: 'discard', resources: out };
}

function autoGold(s: GameState, pid: string): Action {
  // Take the gold as whatever the bank has most of.
  const need = s.pendingGold[pid] ?? 0;
  const bank: ResourceCounts = { ...s.bank };
  const out: Partial<ResourceCounts> = {};
  const resources = Object.keys(bank) as (keyof ResourceCounts)[];
  let taken = 0;
  while (taken < need) {
    resources.sort((a, b) => bank[b] - bank[a]);
    const r = resources[0]!;
    if (bank[r] <= 0) break;
    out[r] = (out[r] ?? 0) + 1;
    bank[r]--;
    taken++;
  }
  return { type: 'chooseGold', resources: out };
}

function autoRobber(s: GameState, pid: string): Action {
  const candidates = Object.values(s.tiles).filter(
    (t) => t.type !== 'water' && t.id !== s.robberHex,
  );
  // Prefer a tile where we can actually steal something.
  let chosen = candidates[0]!;
  for (const tile of candidates) {
    if (robberStealTargets(s, pid, tile.id).length > 0) {
      chosen = tile;
      break;
    }
  }
  const targets = robberStealTargets(s, pid, chosen.id);
  return { type: 'moveRobber', hex: chosen.id, stealFrom: targets[0] ?? null };
}
