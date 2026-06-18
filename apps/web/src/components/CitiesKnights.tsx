import type { GameView, ImprovementTrack } from '@catan/shared';
import { COMMODITY_ICON, TRACK_INFO } from '../config.js';
import { improveInfo, isCK, isMyTurn, me } from '../clientActions.js';
import { emitAction } from '../socket.js';

const TRACKS: ImprovementTrack[] = ['science', 'trade', 'politics'];

export function CitiesKnights({ view }: { view: GameView }) {
  if (!isCK(view)) return null;
  const mine = me(view);
  const canAct = isMyTurn(view) && (view.phase === 'main' || view.phase === 'specialBuild');
  const com = mine.commodities ?? { paper: 0, cloth: 0, coin: 0 };

  return (
    <div className="card col">
      <div className="row">
        <strong>⚔️ Cities &amp; Knights</strong>
        <span className="spacer" />
        <span className="muted" title="event die">
          {view.eventDie === 'barbarian' ? '🛡️ ship' : view.eventDie ? `🎯 ${view.eventDie}` : '—'}
        </span>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {(['paper', 'cloth', 'coin'] as const).map((c) => (
          <span className="resource-pill" key={c} title={c}>
            {COMMODITY_ICON[c]} {com[c]}
          </span>
        ))}
      </div>

      {TRACKS.map((track) => {
        const info = TRACK_INFO[track]!;
        const level = mine.improvements[track];
        const next = improveInfo(view, track);
        return (
          <div className="row" key={track} style={{ gap: 8 }}>
            <span style={{ width: 70, color: info.color }}>{info.label}</span>
            <span className="muted">lvl {level}/5</span>
            <span className="spacer" />
            {next ? (
              <button
                className="ghost"
                disabled={!canAct || !next.affordable}
                onClick={() => emitAction({ type: 'improveCity', track })}
                title={`${next.cost} ${next.commodity}`}
              >
                ↑ {COMMODITY_ICON[next.commodity]}×{next.cost}
              </button>
            ) : (
              <span className="tag">max</span>
            )}
            {view.metropolis[track] === view.you && <span className="tag">metropolis</span>}
          </div>
        );
      })}

      <div className="row">
        <span>Barbarians</span>
        <span className="spacer" />
        <span className="timer" title="steps until the barbarians attack">
          {view.barbarianPosition}/7
        </span>
      </div>
    </div>
  );
}
