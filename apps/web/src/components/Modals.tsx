import {
  type GameState,
  type GameView,
  type Resource,
  type ResourceCounts,
  portRatios,
} from '@catan/shared';
import { useState } from 'react';
import { RESOURCE_ICON } from '../config.js';
import { emitAction } from '../socket.js';
import { labelDev } from './Panels.js';

const RESOURCES: Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];
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
            <th>⚔️</th>
            <th>Roads</th>
            <th>Settle</th>
            <th>Cities</th>
            <th>Dev</th>
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
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Awards: Longest Road & Largest Army count toward VP above.</p>
      <button className="accent" onClick={onLeave}>
        Back to lobby browser
      </button>
    </Modal>
  );
}

export { labelDev };
