import type { RoomSummary } from '@catan/shared';
import { useEffect, useState } from 'react';
import { lobby } from '../socket.js';
import { useStore } from '../store.js';

export function Home({ onProfile }: { onProfile: () => void }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const user = useStore((s) => s.user)!;

  const refresh = () => lobby.list().then(setRooms).catch(() => undefined);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    const res = await lobby.create({ maxPlayers: 4 });
    if (!res.ok) useStore.getState().pushToast('error', res.error);
  };

  const join = async (roomId: string) => {
    const res = await lobby.join(roomId);
    if (!res.ok) useStore.getState().pushToast('error', res.error);
  };

  return (
    <div className="page col">
      <div className="row">
        <h2 style={{ margin: 0 }}>Games</h2>
        <span className="spacer" />
        <button className="ghost" onClick={onProfile}>
          My stats ({user.wins}W / {user.losses}L)
        </button>
        <button className="accent" onClick={create}>
          + New game
        </button>
      </div>

      <div className="card col">
        <div className="row">
          <strong>Open lobbies</strong>
          <span className="spacer" />
          <button className="ghost" onClick={refresh}>
            Refresh
          </button>
        </div>
        {rooms.length === 0 && <p className="muted">No open games. Create one to get started.</p>}
        <div className="room-list">
          {rooms.map((r) => (
            <div className="room" key={r.roomId}>
              <div>
                <strong>{r.hostName}'s game</strong>
                <div className="muted">
                  {r.mapId} · {r.playerCount}/{r.maxPlayers} players
                </div>
              </div>
              <button onClick={() => join(r.roomId)} disabled={r.playerCount >= r.maxPlayers}>
                Join
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
