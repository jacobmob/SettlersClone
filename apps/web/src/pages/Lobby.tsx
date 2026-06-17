import { type GameSettings, PLAYER_COLORS, type PlayerColor } from '@catan/shared';
import { Avatar } from '../components/Avatar.js';
import { Radio } from '../components/Radio.js';
import { PIECE_COLORS } from '../config.js';
import { lobby } from '../socket.js';
import { useStore } from '../store.js';

export function Lobby({ onLeave }: { onLeave: () => void }) {
  const state = useStore((s) => s.lobby)!;
  const me = useStore((s) => s.user)!;
  const isHost = state.hostUserId === me.id;
  const myMember = state.members.find((m) => m.userId === me.id);
  const s = state.settings;

  const set = (patch: Partial<GameSettings>) => isHost && lobby.updateSettings(patch);
  const takenColors = new Set(state.members.filter((m) => m.userId !== me.id).map((m) => m.color));

  const start = async () => {
    const res = await lobby.start();
    if (!res.ok) useStore.getState().pushToast('error', res.error);
  };

  return (
    <div className="page col">
      <div className="row">
        <h2 style={{ margin: 0 }}>Lobby</h2>
        <span className="spacer" />
        <button className="ghost" onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card col" style={{ flex: 1, minWidth: 260 }}>
          <strong>Players ({state.members.length}/{s.maxPlayers})</strong>
          <div className="members">
            {state.members.map((m) => (
              <div className="member" key={m.userId}>
                <Avatar avatar={m.avatar} name={m.name} color={PIECE_COLORS[m.color]!} size={26} />
                <span>{m.name}</span>
                {m.isHost && <span className="tag">host</span>}
                {m.userId === me.id && <span className="tag">you</span>}
                <span className="spacer" />
                {!m.connected && <span className="tag">offline</span>}
                <span className={m.ready ? 'tag' : 'muted'}>{m.ready ? 'ready' : '…'}</span>
              </div>
            ))}
          </div>

          <strong>Your color</strong>
          <div className="row">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                className="swatch"
                title={c}
                disabled={takenColors.has(c)}
                style={{
                  background: PIECE_COLORS[c],
                  width: 28,
                  height: 28,
                  outline: myMember?.color === c ? '2px solid var(--accent)' : 'none',
                }}
                onClick={() => lobby.setColor(c as PlayerColor)}
              />
            ))}
          </div>

          <div className="row">
            <button
              className={myMember?.ready ? 'ghost' : 'accent'}
              onClick={() => lobby.setReady(!myMember?.ready)}
            >
              {myMember?.ready ? 'Not ready' : "I'm ready"}
            </button>
            {isHost && (
              <button className="accent" onClick={start}>
                Start game
              </button>
            )}
          </div>
        </div>

        <div className="card col" style={{ flex: 1, minWidth: 320 }}>
          <strong>Game settings {!isHost && <span className="muted">(host controls)</span>}</strong>
          <div className="settings-grid">
            <div className="setting">
              <label>Map</label>
              <select value={s.mapId} disabled={!isHost} onChange={(e) => set({ mapId: e.target.value })}>
                <option value="base-3-4">Base (3-4)</option>
                <option value="base-5-6">Base (5-6)</option>
                <option value="seafarers-1">Seafarers — Home Island</option>
              </select>
            </div>
            <div className="setting">
              <label>Max players</label>
              <input
                type="number"
                min={2}
                max={6}
                value={s.maxPlayers}
                disabled={!isHost}
                onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
              />
            </div>
            <div className="setting">
              <label>Points to win</label>
              <input
                type="number"
                min={3}
                max={25}
                value={s.victoryPoints}
                disabled={!isHost}
                onChange={(e) => set({ victoryPoints: Number(e.target.value) })}
              />
            </div>
            <div className="setting">
              <label>Dice</label>
              <select
                value={s.diceMode}
                disabled={!isHost}
                onChange={(e) => set({ diceMode: e.target.value as GameSettings['diceMode'] })}
              >
                <option value="random">Random</option>
                <option value="balanced">Balanced deck</option>
              </select>
            </div>
            <div className="setting">
              <label>Discard limit</label>
              <input
                type="number"
                min={0}
                max={20}
                value={s.discardThreshold}
                disabled={!isHost}
                onChange={(e) => set({ discardThreshold: Number(e.target.value) })}
              />
            </div>
            <div className="setting">
              <label>Roll timer (s)</label>
              <input
                type="number"
                min={0}
                max={600}
                value={s.rollTimerSec}
                disabled={!isHost}
                onChange={(e) => set({ rollTimerSec: Number(e.target.value) })}
              />
            </div>
            <div className="setting">
              <label>Turn timer (s)</label>
              <input
                type="number"
                min={0}
                max={3600}
                value={s.turnTimerSec}
                disabled={!isHost}
                onChange={(e) => set({ turnTimerSec: Number(e.target.value) })}
              />
            </div>
            <div className="setting">
              <label>Friendly robber</label>
              <input
                type="checkbox"
                checked={s.friendlyRobber}
                disabled={!isHost}
                onChange={(e) => set({ friendlyRobber: e.target.checked })}
              />
            </div>
            <div className="setting">
              <label>Hide bank cards</label>
              <input
                type="checkbox"
                checked={s.hideBankCards}
                disabled={!isHost}
                onChange={(e) => set({ hideBankCards: e.target.checked })}
              />
            </div>
            <div className="setting">
              <label>Seafarers (ships + sea)</label>
              <input
                type="checkbox"
                checked={s.expansions.includes('seafarers')}
                disabled={!isHost}
                onChange={(e) =>
                  set({
                    expansions: e.target.checked ? ['seafarers'] : [],
                    mapId: e.target.checked ? 'seafarers-1' : 'base-3-4',
                  })
                }
              />
            </div>
          </div>
          <p className="muted">0 disables a timer. Friendly robber protects players under {s.friendlyRobberThreshold} VP.</p>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <Radio />
        </div>
      </div>
    </div>
  );
}
