import { type Cube, type EditorTile, axialToCube, hexKey, hexToPixel } from '@catan/shared';
import { useEffect, useMemo, useState } from 'react';
import { type CustomMapSummary, api } from '../api.js';
import { RESOURCE_COLORS } from '../config.js';
import { useStore } from '../store.js';

type Brush = 'none' | 'water' | 'land' | 'desert' | 'gold';
const BRUSHES: Brush[] = ['land', 'water', 'desert', 'gold', 'none'];
const BRUSH_LABEL: Record<Brush, string> = {
  land: 'Land (random)',
  water: 'Water',
  desert: 'Desert',
  gold: 'Gold',
  none: 'Erase',
};
const SIZE = 32;
const RADIUS = 3;

function candidateCoords(): Cube[] {
  const out: Cube[] = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
      out.push(axialToCube(q, r));
    }
  }
  return out;
}

function hexCorners(cx: number, cy: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${cx + SIZE * Math.cos(a)},${cy + SIZE * Math.sin(a)}`;
  }).join(' ');
}

export function MapEditor({ onClose }: { onClose: () => void }) {
  const token = useStore((s) => s.token)!;
  const coords = useMemo(candidateCoords, []);
  const [paint, setPaint] = useState<Record<string, Brush>>(() => {
    const init: Record<string, Brush> = {};
    for (const c of coords) init[hexKey(c)] = Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) <= 2 ? 'land' : 'none';
    return init;
  });
  const [brush, setBrush] = useState<Brush>('water');
  const [name, setName] = useState('My map');
  const [maps, setMaps] = useState<CustomMapSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listMaps(token).then(setMaps).catch(() => undefined);
  useEffect(() => {
    refresh();
  }, []);

  const counts = useMemo(() => {
    const c = { land: 0, water: 0, desert: 0, gold: 0 };
    for (const k of Object.values(paint)) if (k !== 'none') c[k]++;
    return c;
  }, [paint]);

  const centers = coords.map((c) => hexToPixel(c, SIZE));
  const xs = centers.map((p) => p.x);
  const ys = centers.map((p) => p.y);
  const pad = SIZE * 1.6;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${
    Math.max(...xs) - Math.min(...xs) + pad * 2
  } ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;

  const save = async () => {
    const tiles: EditorTile[] = coords
      .filter((c) => paint[hexKey(c)] !== 'none')
      .map((c) => ({ coord: c, kind: paint[hexKey(c)] as EditorTile['kind'] }));
    if (tiles.length === 0) {
      useStore.getState().pushToast('error', 'Paint at least one tile.');
      return;
    }
    setBusy(true);
    try {
      await api.saveMap(token, name.trim() || 'Custom map', tiles);
      useStore.getState().pushToast('info', 'Map saved — pick it in a lobby.');
      refresh();
    } catch (e) {
      useStore.getState().pushToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteMap(token, id);
      refresh();
    } catch (e) {
      useStore.getState().pushToast('error', (e as Error).message);
    }
  };

  const fill = (kind: Brush) => {
    const next: Record<string, Brush> = {};
    for (const c of coords) next[hexKey(c)] = kind;
    setPaint(next);
  };

  return (
    <div className="page col">
      <div className="row">
        <h2 style={{ margin: 0 }}>Map editor</h2>
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          Back
        </button>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 360 }}>
          <svg viewBox={vb} style={{ width: '100%', height: 460 }}>
            {coords.map((c) => {
              const p = hexToPixel(c, SIZE);
              const kind = paint[hexKey(c)]!;
              const fillColor = kind === 'none' ? '#1c2330' : RESOURCE_COLORS[kind];
              return (
                <polygon
                  key={hexKey(c)}
                  points={hexCorners(p.x, p.y)}
                  fill={fillColor}
                  stroke="#0007"
                  strokeWidth={1.5}
                  opacity={kind === 'none' ? 0.4 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPaint((prev) => ({ ...prev, [hexKey(c)]: brush }))}
                />
              );
            })}
          </svg>
        </div>

        <div className="card col" style={{ width: 280 }}>
          <strong>Brush</strong>
          <div className="row">
            {BRUSHES.map((b) => (
              <button
                key={b}
                className={brush === b ? 'accent' : 'ghost'}
                onClick={() => setBrush(b)}
              >
                {BRUSH_LABEL[b]}
              </button>
            ))}
          </div>
          <p className="muted">
            Land tiles get a random resource &amp; number at game start. {counts.land} land,{' '}
            {counts.water} sea, {counts.desert} desert, {counts.gold} gold.
          </p>
          <div className="row">
            <button className="ghost" onClick={() => fill('land')}>
              Fill land
            </button>
            <button className="ghost" onClick={() => fill('none')}>
              Clear
            </button>
          </div>

          <div className="field">
            <label>Map name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          <button className="accent" onClick={save} disabled={busy}>
            Save map
          </button>

          <strong>Saved maps</strong>
          {maps.length === 0 && <span className="muted">None yet.</span>}
          {maps.map((m) => (
            <div className="row" key={m.id}>
              <span>
                {m.name} <span className="muted">· {m.tileCount} tiles</span>
              </span>
              <span className="spacer" />
              <button className="ghost" onClick={() => remove(m.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
