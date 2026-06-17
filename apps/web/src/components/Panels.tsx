import type { GameView, Resource, TimerState } from '@catan/shared';
import { useEffect, useState } from 'react';
import { PIECE_COLORS, RESOURCE_ICON } from '../config.js';
import { Avatar } from './Avatar.js';

const RESOURCES: Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];

export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function PlayerList({ view }: { view: GameView }) {
  return (
    <div className="col">
      {view.order.map((id, i) => {
        const p = view.players.find((x) => x.id === id)!;
        const isCurrent = view.currentPlayerIndex === i && view.phase !== 'gameOver';
        return (
          <div
            key={id}
            className={`player-card ${isCurrent ? 'current' : ''}`}
            style={{ borderLeftColor: PIECE_COLORS[p.color] }}
          >
            <div className="row">
              <Avatar avatar={p.avatar} name={p.name} color={PIECE_COLORS[p.color]!} size={24} />
              <strong>{p.name}</strong>
              {p.id === view.you && <span className="tag">you</span>}
              {!p.connected && <span className="tag">offline</span>}
              <span className="spacer" />
              <strong title="victory points">{p.victoryPoints} VP</strong>
            </div>
            <div className="row" style={{ gap: 8, fontSize: 12 }}>
              <span title="resource cards">🃏 {p.resourceCount}</span>
              <span title="development cards">📜 {p.devCardCount}</span>
              <span title="knights played">⚔️ {p.playedKnights}</span>
              {view.longestRoadHolder === id && <span className="tag">Longest Road</span>}
              {view.largestArmyHolder === id && <span className="tag">Largest Army</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Hand({ view }: { view: GameView }) {
  const me = view.players.find((p) => p.id === view.you)!;
  const res = me.resources ?? { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  const devs = [...(me.devCards ?? []), ...(me.newDevCards ?? [])];
  const devCounts = devs.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="card col">
      <strong>Your hand</strong>
      <div className="row">
        {RESOURCES.map((r) => (
          <span className="resource-pill" key={r} title={r}>
            {RESOURCE_ICON[r]} {res[r]}
          </span>
        ))}
      </div>
      {devs.length > 0 && (
        <div className="row" style={{ fontSize: 12 }}>
          {Object.entries(devCounts).map(([c, n]) => (
            <span className="tag" key={c}>
              {labelDev(c)} ×{n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function labelDev(c: string): string {
  switch (c) {
    case 'knight':
      return 'Knight';
    case 'roadBuilding':
      return 'Road Building';
    case 'yearOfPlenty':
      return 'Year of Plenty';
    case 'monopoly':
      return 'Monopoly';
    case 'victoryPoint':
      return 'Victory Point';
    default:
      return c;
  }
}

export function DiceTimer({ view, timer }: { view: GameView; timer: TimerState | null }) {
  const now = useNow();
  const remaining = timer?.deadline ? Math.max(0, Math.ceil((timer.deadline - now) / 1000)) : null;
  return (
    <div className="card row">
      <div className="dice">
        <div className="die">{view.dice?.[0] ?? '–'}</div>
        <div className="die">{view.dice?.[1] ?? '–'}</div>
      </div>
      <div className="col" style={{ gap: 0 }}>
        <span className="muted">Last roll</span>
        <strong>{view.lastRoll ?? '—'}</strong>
      </div>
      <span className="spacer" />
      {remaining !== null && (
        <div className="col" style={{ gap: 0, alignItems: 'flex-end' }}>
          <span className="muted">{timer!.kind === 'roll' ? 'Roll in' : 'Turn ends'}</span>
          <span className={`timer ${remaining <= 5 ? 'warn' : ''}`}>{remaining}s</span>
        </div>
      )}
    </div>
  );
}

export function GameLog({ view }: { view: GameView }) {
  return (
    <div className="log">
      {view.log.slice(-40).map((e) => (
        <div key={e.id}>{e.message}</div>
      ))}
    </div>
  );
}
