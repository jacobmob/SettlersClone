import { useEffect, useState } from 'react';
import { api } from '../api.js';

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
        <h2 style={{ margin: 0 }}>Your statistics</h2>
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          Back
        </button>
      </div>

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
        <Stat label="Best VP" value={stats.totals.bestVP} />
        <Stat label="Longest Road awards" value={stats.totals.longestRoadAwards} />
        <Stat label="Largest Army awards" value={stats.totals.largestArmyAwards} />
      </div>

      <div className="card col">
        <strong>Lifetime totals</strong>
        <div className="row">
          <Stat label="Knights" value={stats.totals.knightsPlayed} />
          <Stat label="Settlements" value={stats.totals.settlementsBuilt} />
          <Stat label="Cities" value={stats.totals.citiesBuilt} />
          <Stat label="Roads" value={stats.totals.roadsBuilt} />
          <Stat label="Dev cards" value={stats.totals.devCardsBought} />
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

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 110 }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value ?? 0}</div>
    </div>
  );
}
