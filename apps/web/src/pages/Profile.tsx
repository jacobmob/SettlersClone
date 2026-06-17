import { PLAYER_COLORS } from '@catan/shared';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../components/Avatar.js';
import { PIECE_COLORS } from '../config.js';
import { useStore } from '../store.js';

type Stats = Awaited<ReturnType<typeof api.userStats>>;

export function Profile({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .userStats(userId)
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  if (error) return <div className="page">Could not load stats: {error}</div>;
  if (!stats) return <div className="page muted">Loading stats…</div>;

  const maxRoll = Math.max(1, ...Object.values(stats.diceHistogram));

  return (
    <div className="page col">
      <div className="row">
        <h2 style={{ margin: 0 }}>Your profile</h2>
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          Back
        </button>
      </div>

      <ProfileEditor />

      <div className="row">
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">Record</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {stats.wins}
            <span className="muted"> W</span> · {stats.losses}
            <span className="muted"> L</span>
          </div>
        </div>
        <Stat label="Games" value={stats.totals.games} />
        <Stat label="Win rate %" value={stats.totals.winRate} />
        <Stat label="Avg VP" value={stats.totals.avgVP} />
        <Stat label="Best VP" value={stats.totals.bestVP} />
      </div>

      <div className="card col">
        <strong>Lifetime totals</strong>
        <div className="row">
          <Stat label="Knights" value={stats.totals.knightsPlayed} />
          <Stat label="Settlements" value={stats.totals.settlementsBuilt} />
          <Stat label="Cities" value={stats.totals.citiesBuilt} />
          <Stat label="Roads" value={stats.totals.roadsBuilt} />
          <Stat label="Dev cards" value={stats.totals.devCardsBought} />
          <Stat label="Resources" value={stats.totals.resourcesGained} />
          <Stat label="Robber moves" value={stats.totals.robberMoves} />
          <Stat label="Longest Road" value={stats.totals.longestRoadAwards} />
          <Stat label="Largest Army" value={stats.totals.largestArmyAwards} />
        </div>
      </div>

      <div className="card col">
        <strong>Dice rolls</strong>
        <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 120 }}>
          {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => {
            const count = stats.diceHistogram[n] ?? 0;
            return (
              <div key={n} className="col" style={{ alignItems: 'center', flex: 1, gap: 2 }}>
                <div className="muted" style={{ fontSize: 11 }}>
                  {count}
                </div>
                <div
                  className="bar"
                  style={{ width: '70%', height: `${(count / maxRoll) * 90}px` }}
                  title={`${count} rolls of ${n}`}
                />
                <div>{n}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card col">
        <strong>Head to head</strong>
        {stats.headToHead.length === 0 ? (
          <p className="muted">No recorded games yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Record (you)</th>
                <th>Games together</th>
              </tr>
            </thead>
            <tbody>
              {stats.headToHead.map((h) => (
                <tr key={h.opponentId}>
                  <td>{h.name}</td>
                  <td>
                    {h.wins} - {h.losses}
                  </td>
                  <td>{h.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ProfileEditor() {
  const user = useStore((s) => s.user)!;
  const token = useStore((s) => s.token)!;
  const setUser = useStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [color, setColor] = useState(user.preferredColor);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { user: updated } = await api.updateProfile(token, {
        displayName: displayName.trim() || user.displayName,
        preferredColor: color,
      });
      setUser(updated);
      useStore.getState().pushToast('info', 'Profile saved (applies to your next game).');
    } catch (e) {
      useStore.getState().pushToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.uploadAvatar(token, file);
      const { user: updated } = await api.updateProfile(token, { avatarKey: url });
      setUser(updated);
      useStore.getState().pushToast('info', 'Avatar updated.');
    } catch (err) {
      useStore.getState().pushToast('error', (err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="card col">
      <strong>Profile</strong>
      <div className="row" style={{ alignItems: 'center' }}>
        <Avatar avatar={user.avatarKey} name={user.displayName} color={PIECE_COLORS[color] ?? '#888'} size={56} />
        <label className="upload-btn">
          {busy ? 'Working…' : 'Upload avatar'}
          <input type="file" accept="image/*" hidden onChange={onAvatar} disabled={busy} />
        </label>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} />
        </div>
        <div className="field">
          <label>Preferred color</label>
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            {PLAYER_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="accent" onClick={save} disabled={busy} style={{ alignSelf: 'flex-start' }}>
        Save profile
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 110 }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value ?? 0}</div>
    </div>
  );
}
