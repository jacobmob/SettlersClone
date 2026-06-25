import {
  type Commodity,
  type GameState,
  type GameView,
  PROGRESS_INFO,
  type ProgressCard,
  type ProgressParams,
  type Resource,
  type ResourceCounts,
  portRatios,
} from '@catan/shared';
import { useState } from 'react';
import { COMMODITY_ICON, RESOURCE_ICON } from '../config.js';
import { emitAction } from '../socket.js';
import { labelDev } from './Panels.js';

const RESOURCES: Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];
const COMMODITIES: Commodity[] = ['paper', 'cloth', 'coin'];
const asState = (v: GameView) => v as unknown as GameState;

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overlay">
      <div className="modal col">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Counter({
  value,
  onChange,
  max,
}: {
  value: Partial<ResourceCounts>;
  onChange: (v: Partial<ResourceCounts>) => void;
  max: (r: Resource) => number;
}) {
  return (
    <div className="row">
      {RESOURCES.map((r) => (
        <div className="col" key={r} style={{ alignItems: 'center', gap: 2 }}>
          <span>{RESOURCE_ICON[r]}</span>
          <div className="row" style={{ gap: 4 }}>
            <button
              className="ghost"
              onClick={() => onChange({ ...value, [r]: Math.max(0, (value[r] ?? 0) - 1) })}
            >
              −
            </button>
            <span style={{ minWidth: 16, textAlign: 'center' }}>{value[r] ?? 0}</span>
            <button
              className="ghost"
              onClick={() => onChange({ ...value, [r]: Math.min(max(r), (value[r] ?? 0) + 1) })}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const total = (v: Partial<ResourceCounts>) =>
  Object.values(v).reduce((a, b) => a + (b ?? 0), 0);

export function DiscardModal({ view }: { view: GameView }) {
  const need = view.yourPendingDiscard;
  const have = view.players.find((p) => p.id === view.you)!.resources!;
  const [picks, setPicks] = useState<Partial<ResourceCounts>>({});
  return (
    <Modal title={`Discard ${need} cards`}>
      <p className="muted">You rolled into a 7 with too many cards.</p>
      <Counter value={picks} onChange={setPicks} max={(r) => have[r]} />
      <button
        className="accent"
        disabled={total(picks) !== need}
        onClick={() => emitAction({ type: 'discard', resources: picks })}
      >
        Discard ({total(picks)}/{need})
      </button>
    </Modal>
  );
}

export function GoldChoiceModal({ view }: { view: GameView }) {
  const need = view.yourPendingGold;
  const [picks, setPicks] = useState<Partial<ResourceCounts>>({});
  const cap = (r: Resource) => (view.bank ? view.bank[r] : need);
  return (
    <Modal title={`Gold field — choose ${need} resource${need === 1 ? '' : 's'}`}>
      <p className="muted">Your gold field produced — take any resources from the bank.</p>
      <Counter value={picks} onChange={setPicks} max={cap} />
      <button
        className="accent"
        disabled={total(picks) !== need}
        onClick={() => emitAction({ type: 'chooseGold', resources: picks })}
      >
        Collect ({total(picks)}/{need})
      </button>
    </Modal>
  );
}

export function StealModal({
  targets,
  onPick,
  onCancel,
}: {
  targets: { id: string; name: string }[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="Steal from a player">
      <div className="col">
        {targets.map((t) => (
          <button key={t.id} onClick={() => onPick(t.id)}>
            {t.name}
          </button>
        ))}
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function YearOfPlentyModal({ onClose }: { onClose: () => void }) {
  const [picks, setPicks] = useState<Partial<ResourceCounts>>({});
  return (
    <Modal title="Year of Plenty — take 2 from the bank">
      <Counter value={picks} onChange={setPicks} max={() => 2} />
      <div className="row">
        <button
          className="accent"
          disabled={total(picks) !== 2}
          onClick={() => {
            const list: Resource[] = [];
            for (const r of RESOURCES) for (let i = 0; i < (picks[r] ?? 0); i++) list.push(r);
            emitAction({ type: 'playYearOfPlenty', resources: list });
            onClose();
          }}
        >
          Take
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function MonopolyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Monopoly — choose a resource">
      <div className="row">
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => {
              emitAction({ type: 'playMonopoly', resource: r });
              onClose();
            }}
          >
            {RESOURCE_ICON[r]} {r}
          </button>
        ))}
      </div>
      <button className="ghost" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

export function BankTradeModal({ view, onClose }: { view: GameView; onClose: () => void }) {
  const ratios = portRatios(asState(view), view.you);
  const have = view.players.find((p) => p.id === view.you)!.resources!;
  const [give, setGive] = useState<Resource>('brick');
  const [receive, setReceive] = useState<Resource>('ore');
  const ratio = ratios[give];
  return (
    <Modal title="Trade with the bank">
      <div className="row">
        <div className="col">
          <label>Give ({ratio}:1)</label>
          <select value={give} onChange={(e) => setGive(e.target.value as Resource)}>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r} (have {have[r]}, rate {ratios[r]})
              </option>
            ))}
          </select>
        </div>
        <div className="col">
          <label>Receive</label>
          <select value={receive} onChange={(e) => setReceive(e.target.value as Resource)}>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button
          className="accent"
          disabled={give === receive || have[give] < ratio}
          onClick={() => {
            emitAction({ type: 'bankTrade', give, receive });
            onClose();
          }}
        >
          Trade {ratio} {give} → 1 {receive}
        </button>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function ProposeTradeModal({ view, onClose }: { view: GameView; onClose: () => void }) {
  const have = view.players.find((p) => p.id === view.you)!.resources!;
  const [give, setGive] = useState<Partial<ResourceCounts>>({});
  const [receive, setReceive] = useState<Partial<ResourceCounts>>({});
  return (
    <Modal title="Propose a trade (to everyone)">
      <div className="col">
        <label>You give</label>
        <Counter value={give} onChange={setGive} max={(r) => have[r]} />
        <label>You want</label>
        <Counter value={receive} onChange={setReceive} max={() => 9} />
      </div>
      <div className="row">
        <button
          className="accent"
          disabled={total(give) === 0 || total(receive) === 0}
          onClick={() => {
            emitAction({ type: 'proposeTrade', give, receive, to: [] });
            onClose();
          }}
        >
          Offer
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function KnightModal({
  view,
  vertex,
  canAct,
  nearRobber,
  onMove,
  onChase,
  onClose,
}: {
  view: GameView;
  vertex: string;
  canAct: boolean;
  nearRobber: boolean;
  onMove: (vertex: string) => void;
  onChase: (vertex: string) => void;
  onClose: () => void;
}) {
  const knight = view.knights[vertex];
  if (!knight) return null;
  const mine = knight.owner === view.you;
  // An active knight that hasn't acted yet this turn may move/displace or chase.
  const canUse = mine && canAct && knight.active && !knight.moved;
  return (
    <Modal title={`Knight (level ${knight.level}${knight.active ? ', active' : ', inactive'})`}>
      <div className="col">
        {mine && canAct && !knight.active && (
          <button
            className="accent"
            onClick={() => {
              emitAction({ type: 'activateKnight', vertex });
              onClose();
            }}
          >
            Activate (1 🌾)
          </button>
        )}
        {mine && canAct && knight.level < 3 && (
          <button
            onClick={() => {
              emitAction({ type: 'promoteKnight', vertex });
              onClose();
            }}
          >
            Promote (1 ⛰️ + 1 🐑)
          </button>
        )}
        {canUse && (
          <button
            onClick={() => {
              onMove(vertex);
              onClose();
            }}
          >
            Move / displace
          </button>
        )}
        {canUse && nearRobber && (
          <button
            onClick={() => {
              onChase(vertex);
              onClose();
            }}
          >
            Chase the robber
          </button>
        )}
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function ProgressModal({
  view,
  card,
  onClose,
}: {
  view: GameView;
  card: ProgressCard;
  onClose: () => void;
}) {
  const meView = view.players.find((p) => p.id === view.you)!;
  const opponents = view.players.filter((p) => p.id !== view.you);
  const info = PROGRESS_INFO[card];
  const [d1, setD1] = useState(3);
  const [d2, setD2] = useState(4);
  const [picks, setPicks] = useState<string[]>([]);

  const play = (params?: ProgressParams) => {
    emitAction({ type: 'playProgress', card, params });
    onClose();
  };

  const togglePick = (v: string) =>
    setPicks((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].slice(0, 2),
    );

  let body: React.ReactNode;
  if (card === 'alchemist') {
    body = (
      <>
        <div className="row" style={{ gap: 8 }}>
          {[
            [d1, setD1],
            [d2, setD2],
          ].map(([val, set], i) => (
            <select
              key={i}
              value={val as number}
              onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ))}
        </div>
        <button className="accent" onClick={() => play({ dice: [d1, d2] })}>
          Lock in {d1} + {d2} = {d1 + d2}
        </button>
      </>
    );
  } else if (card === 'smith') {
    const mine = Object.entries(view.knights).filter(
      ([, k]) => k.owner === view.you && k.level < 3,
    );
    body = (
      <>
        <p className="muted">Choose up to 2 knights to promote ({picks.length}/2).</p>
        <div className="col">
          {mine.map(([v, k]) => (
            <button
              key={v}
              className={picks.includes(v) ? 'accent' : 'ghost'}
              onClick={() => togglePick(v)}
            >
              Knight (level {k.level})
            </button>
          ))}
          {mine.length === 0 && <span className="muted">You have no promotable knights.</span>}
        </div>
        <button className="accent" disabled={picks.length === 0} onClick={() => play({ vertices: picks })}>
          Promote
        </button>
      </>
    );
  } else if (card === 'resourceMonopoly' || card === 'merchantFleet') {
    body = (
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => play(card === 'merchantFleet' ? { tradeResource: r } : { resource: r })}
          >
            {RESOURCE_ICON[r]} {r}
          </button>
        ))}
      </div>
    );
  } else if (card === 'tradeMonopoly') {
    body = (
      <div className="row" style={{ gap: 4 }}>
        {COMMODITIES.map((c) => (
          <button key={c} onClick={() => play({ commodity: c })}>
            {COMMODITY_ICON[c]} {c}
          </button>
        ))}
      </div>
    );
  } else if (card === 'deserter' || card === 'masterMerchant') {
    const eligible =
      card === 'masterMerchant'
        ? opponents.filter((p) => p.victoryPoints > meView.victoryPoints)
        : opponents;
    body = (
      <div className="col">
        {eligible.map((p) => (
          <button key={p.id} onClick={() => play({ targetPlayer: p.id })}>
            {p.name}
          </button>
        ))}
        {eligible.length === 0 && <span className="muted">No eligible opponent.</span>}
      </div>
    );
  } else {
    // No-parameter cards (printer, constitution, warlord, crane, medicine, irrigation, mining).
    body = (
      <button className="accent" onClick={() => play()}>
        Play {info.label}
      </button>
    );
  }

  return (
    <Modal title={info.label}>
      <p className="muted">{info.desc}</p>
      {body}
      <button className="ghost" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

export function GameOverModal({ view, onLeave }: { view: GameView; onLeave: () => void }) {
  const winner = view.players.find((p) => p.id === view.winner);
  const rows = view.order.map((id) => {
    const p = view.players.find((x) => x.id === id)!;
    const stats = view.stats.perPlayer[id]!;
    return { p, stats };
  });
  return (
    <Modal title={`🏆 ${winner?.name ?? 'Someone'} wins!`}>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>VP</th>
            <th title="knights">⚔️</th>
            <th>Roads</th>
            <th>Settle</th>
            <th>Cities</th>
            <th>Dev</th>
            <th title="resources gained">Res</th>
            <th title="robber moves">🦹</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, stats }) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.victoryPoints}</td>
              <td>{stats.knightsPlayed}</td>
              <td>{stats.roadsBuilt}</td>
              <td>{stats.settlementsBuilt}</td>
              <td>{stats.citiesBuilt}</td>
              <td>{stats.devCardsBought}</td>
              <td>{stats.resourcesGained}</td>
              <td>{stats.robberMoves}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Awards: Longest Road &amp; Largest Army count toward VP above.</p>

      <strong>Dice rolls this game</strong>
      {rows.map(({ p, stats }) => {
        const max = Math.max(1, ...Object.values(stats.rollHistogram));
        return (
          <div key={p.id} className="row" style={{ alignItems: 'flex-end', gap: 3, height: 60 }}>
            <span style={{ width: 70, fontSize: 12 }}>{p.name}</span>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => {
              const c = stats.rollHistogram[n] ?? 0;
              return (
                <div key={n} className="col" style={{ alignItems: 'center', flex: 1, gap: 1 }}>
                  <div className="bar" style={{ width: '70%', height: `${(c / max) * 40}px` }} title={`${c}× ${n}`} />
                  <span style={{ fontSize: 9 }}>{n}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <button className="accent" onClick={onLeave}>
        Back to lobby browser
      </button>
    </Modal>
  );
}

export { labelDev };
