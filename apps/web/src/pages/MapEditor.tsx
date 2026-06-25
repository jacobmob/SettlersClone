import {
  type Cube,
  type EditorPort,
  type EditorTile,
  type PortType,
  axialToCube,
  edgeMidpoint,
  edgesOfHex,
  hexKey,
  hexNeighbors,
  hexToPixel,
  verticesOfEdge,
  vertexToPixel,
} from '@catan/shared';
import { useEffect, useMemo, useState } from 'react';
import { type CustomMapSummary, api } from '../api.js';
import { RESOURCE_COLORS, RESOURCE_ICON } from '../config.js';
import { useStore } from '../store.js';

// A brush is either a terrain to paint, an eraser, or the port tool.
type Brush = EditorTile['kind'] | 'none' | 'port';
const TERRAIN_BRUSHES: Brush[] = [
  'land',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'desert',
  'gold',
  'water',
  'none',
];
const BRUSH_LABEL: Record<Brush, string> = {
  land: 'Land (random)',
  wood: '🌲 Wood',
  brick: '🧱 Brick',
  sheep: '🐑 Sheep',
  wheat: '🌾 Wheat',
  ore: '⛰️ Ore',
  desert: 'Desert',
  gold: 'Gold',
  water: 'Water',
  none: 'Erase',
  port: 'Port',
};
const PORT_TYPES: PortType[] = ['any', 'brick', 'wood', 'sheep', 'wheat', 'ore'];
const PORT_LABEL = (t: PortType) => (t === 'any' ? '3:1' : `2:1 ${RESOURCE_ICON[t] ?? ''}`);

const SIZE = 32;
const MIN_RADIUS = 2;
const MAX_RADIUS = 6;

function hexagonCoords(radius: number): Cube[] {
  const out: Cube[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
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

const portKey = (hex: Cube, dir: number) => `${hexKey(hex)}:${dir}`;

export function MapEditor({ onClose }: { onClose: () => void }) {
  const token = useStore((s) => s.token)!;
  const [radius, setRadius] = useState(3);
  const coords = useMemo(() => hexagonCoords(radius), [radius]);
  // Paint starts blank so maps are built from scratch (any size/shape).
  const [paint, setPaint] = useState<Record<string, Brush>>({});
  const [ports, setPorts] = useState<Record<string, EditorPort>>({});
  const [brush, setBrush] = useState<Brush>('land');
  const [portType, setPortType] = useState<PortType>('any');
  const [name, setName] = useState('My map');
  const [maps, setMaps] = useState<CustomMapSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listMaps(token).then(setMaps).catch(() => undefined);
  useEffect(() => {
    refresh();
  }, []);

  const tileKind = (key: string): Brush => paint[key] ?? 'none';
  const isLandLike = (key: string): boolean => {
    const k = tileKind(key);
    return k !== 'none' && k !== 'water';
  };

  const counts = useMemo(() => {
    const c = { land: 0, fixed: 0, water: 0, desert: 0, gold: 0 };
    for (const k of Object.values(paint)) {
      if (k === 'land') c.land++;
      else if (k === 'water') c.water++;
      else if (k === 'desert') c.desert++;
      else if (k === 'gold') c.gold++;
      else if (k !== 'none' && k !== 'port') c.fixed++;
    }
    return c;
  }, [paint]);

  // Coastal edges of painted land tiles (neighbour is water / blank / off-board).
  const portSlots = useMemo(() => {
    const slots: { hex: Cube; dir: number; mid: { x: number; y: number } }[] = [];
    for (const c of coords) {
      if (!isLandLike(hexKey(c))) continue;
      const neighbours = hexNeighbors(c);
      const edges = edgesOfHex(c);
      neighbours.forEach((n, dir) => {
        if (isLandLike(hexKey(n))) return; // interior edge — not a coast
        slots.push({ hex: c, dir, mid: edgeMidpoint(edges[dir]!, SIZE) });
      });
    }
    return slots;
  }, [coords, paint]);

  const centers = coords.map((c) => hexToPixel(c, SIZE));
  const xs = centers.map((p) => p.x);
  const ys = centers.map((p) => p.y);
  const pad = SIZE * 1.8;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${
    Math.max(...xs) - Math.min(...xs) + pad * 2
  } ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;

  const paintTile = (c: Cube) => {
    if (brush === 'port') return;
    const key = hexKey(c);
    setPaint((prev) => {
      const next = { ...prev };
      if (brush === 'none') delete next[key];
      else next[key] = brush;
      return next;
    });
    // Painting water/erasing under a port removes that port.
    if (brush === 'none' || brush === 'water') {
      setPorts((prev) => {
        const next = { ...prev };
        for (let dir = 0; dir < 6; dir++) delete next[portKey(c, dir)];
        return next;
      });
    }
  };

  const togglePort = (hex: Cube, dir: number) => {
    const key = portKey(hex, dir);
    setPorts((prev) => {
      const next = { ...prev };
      if (next[key] && next[key]!.type === portType) delete next[key];
      else next[key] = { hex, dir, type: portType };
      return next;
    });
  };

  const fill = (kind: Brush) => {
    if (kind === 'none') {
      setPaint({});
      setPorts({});
      return;
    }
    const next: Record<string, Brush> = {};
    for (const c of coords) next[hexKey(c)] = kind;
    setPaint(next);
  };

  const save = async () => {
    const tiles: EditorTile[] = coords
      .filter((c) => tileKind(hexKey(c)) !== 'none')
      .map((c) => ({ coord: c, kind: paint[hexKey(c)] as EditorTile['kind'] }));
    if (tiles.length === 0) {
      useStore.getState().pushToast('error', 'Paint at least one tile.');
      return;
    }
    setBusy(true);
    try {
      await api.saveMap(token, name.trim() || 'Custom map', tiles, Object.values(ports));
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
          <svg viewBox={vb} style={{ width: '100%', height: 480 }}>
            {coords.map((c) => {
              const p = hexToPixel(c, SIZE);
              const kind = tileKind(hexKey(c));
              const fillColor = kind === 'none' || kind === 'port' ? '#1c2330' : RESOURCE_COLORS[kind];
              return (
                <polygon
                  key={hexKey(c)}
                  points={hexCorners(p.x, p.y)}
                  fill={fillColor}
                  stroke="#0007"
                  strokeWidth={1.5}
                  opacity={kind === 'none' ? 0.35 : 1}
                  style={{ cursor: brush === 'port' ? 'default' : 'pointer' }}
                  onClick={() => paintTile(c)}
                />
              );
            })}

            {/* placed ports */}
            {Object.values(ports).map((port) => {
              const edge = edgesOfHex(port.hex)[port.dir]!;
              const [a, b] = verticesOfEdge(edge).map((v) => vertexToPixel(v, SIZE));
              const mid = edgeMidpoint(edge, SIZE);
              return (
                <g key={portKey(port.hex, port.dir)}>
                  <line
                    x1={a!.x}
                    y1={a!.y}
                    x2={b!.x}
                    y2={b!.y}
                    stroke="#cfe3ff"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                  <text
                    x={mid.x}
                    y={mid.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#cfe3ff"
                  >
                    {PORT_LABEL(port.type)}
                  </text>
                </g>
              );
            })}

            {/* port slots (only while the port tool is active) */}
            {brush === 'port' &&
              portSlots.map(({ hex, dir, mid }) => {
                const placed = ports[portKey(hex, dir)];
                return (
                  <circle
                    key={`slot-${portKey(hex, dir)}`}
                    cx={mid.x}
                    cy={mid.y}
                    r={8}
                    fill={placed ? '#cfe3ff' : 'var(--accent)'}
                    opacity={0.65}
                    stroke="#fff"
                    style={{ cursor: 'pointer' }}
                    onClick={() => togglePort(hex, dir)}
                  />
                );
              })}
          </svg>
        </div>

        <div className="card col" style={{ width: 300 }}>
          <strong>Canvas size</strong>
          <div className="row">
            <button
              className="ghost"
              disabled={radius <= MIN_RADIUS}
              onClick={() => setRadius((r) => Math.max(MIN_RADIUS, r - 1))}
            >
              −
            </button>
            <span style={{ minWidth: 90, textAlign: 'center' }}>radius {radius}</span>
            <button
              className="ghost"
              disabled={radius >= MAX_RADIUS}
              onClick={() => setRadius((r) => Math.min(MAX_RADIUS, r + 1))}
            >
              +
            </button>
          </div>

          <strong>Brush</strong>
          <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
            {TERRAIN_BRUSHES.map((b) => (
              <button
                key={b}
                className={brush === b ? 'accent' : 'ghost'}
                onClick={() => setBrush(b)}
              >
                {BRUSH_LABEL[b]}
              </button>
            ))}
            <button className={brush === 'port' ? 'accent' : 'ghost'} onClick={() => setBrush('port')}>
              ⚓ Port
            </button>
          </div>

          {brush === 'port' && (
            <>
              <strong>Port type</strong>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                {PORT_TYPES.map((t) => (
                  <button
                    key={t}
                    className={portType === t ? 'accent' : 'ghost'}
                    onClick={() => setPortType(t)}
                  >
                    {PORT_LABEL(t)}
                  </button>
                ))}
              </div>
              <p className="muted">
                Click a marker on a coastline edge to add/remove a port. {Object.keys(ports).length}{' '}
                placed.
              </p>
            </>
          )}

          <p className="muted">
            Land tiles get a random resource &amp; number at game start; painted resources stay
            fixed. {counts.land} land, {counts.fixed} fixed, {counts.water} sea, {counts.desert}{' '}
            desert, {counts.gold} gold.
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
