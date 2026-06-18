import {
  type EdgeId,
  type GameView,
  type VertexId,
  hexToPixel,
  vertexToPixel,
  verticesOfEdge,
} from '@catan/shared';
import { PIECE_COLORS, RESOURCE_COLORS, RESOURCE_ICON } from '../config.js';

const SIZE = 46;

export type BoardMode = 'none' | 'settlement' | 'city' | 'road' | 'ship' | 'robber' | 'knight';

interface Props {
  view: GameView;
  mode: BoardMode;
  legalVertices: Set<VertexId>;
  legalEdges: Set<EdgeId>;
  legalTiles: Set<string>;
  onVertex: (v: VertexId) => void;
  onEdge: (e: EdgeId) => void;
  onTile: (hex: string) => void;
  onKnight: (v: VertexId) => void;
}

function hexCorners(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 90) * Math.PI) / 180;
    pts.push(`${cx + SIZE * Math.cos(a)},${cy + SIZE * Math.sin(a)}`);
  }
  return pts.join(' ');
}

export function Board({
  view,
  mode,
  legalVertices,
  legalEdges,
  legalTiles,
  onVertex,
  onEdge,
  onTile,
  onKnight,
}: Props) {
  const tiles = Object.values(view.tiles);
  const centers = tiles.map((t) => hexToPixel(t.coord, SIZE));
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const pad = SIZE * 1.8;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;

  const ownerColor = (id: string) =>
    PIECE_COLORS[view.players.find((p) => p.id === id)?.color ?? 'white'];

  return (
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} style={{ width: '100%', height: '100%' }}>
      {/* tiles */}
      {tiles.map((t) => {
        const c = hexToPixel(t.coord, SIZE);
        const robber = view.robberHex === t.id;
        const clickable = mode === 'robber' && legalTiles.has(t.id);
        return (
          <g key={t.id} className={clickable ? 'hex-clickable' : undefined}
            onClick={clickable ? () => onTile(t.id) : undefined}>
            <polygon
              points={hexCorners(c.x, c.y)}
              fill={RESOURCE_COLORS[t.type]}
              stroke={clickable ? 'var(--accent)' : '#0006'}
              strokeWidth={clickable ? 3 : 1.5}
            />
            {t.number !== null && (
              <>
                <circle cx={c.x} cy={c.y} r={15} fill="#f4ecd2" stroke="#0006" />
                <text
                  x={c.x}
                  y={c.y + 5}
                  textAnchor="middle"
                  fontWeight="700"
                  fontSize={16}
                  fill={t.number === 6 || t.number === 8 ? '#c0392b' : '#333'}
                >
                  {t.number}
                </text>
              </>
            )}
            {t.type === 'fog' && (
              <text x={c.x} y={c.y + 8} textAnchor="middle" fontSize={22} fill="#8b96a6">
                ?
              </text>
            )}
            {robber && (
              <circle cx={c.x} cy={c.y - 22} r={9} fill="#1a1a1a" stroke="#000" strokeWidth={2} />
            )}
          </g>
        );
      })}

      {/* ports */}
      {view.ports.map((port, i) => {
        const ps = port.vertices.map((v) => vertexToPixel(v, SIZE));
        const mx = (ps[0]!.x + ps[1]!.x) / 2;
        const my = (ps[0]!.y + ps[1]!.y) / 2;
        const label = port.type === 'any' ? '3:1' : `2:1 ${RESOURCE_ICON[port.type] ?? ''}`;
        return (
          <g key={`port-${i}`}>
            <text x={mx} y={my} textAnchor="middle" fontSize={11} fill="#cfe3ff" fontWeight={700}>
              {label}
            </text>
          </g>
        );
      })}

      {/* existing roads & ships */}
      {Object.entries(view.roads).map(([edge, road]) => {
        const [a, b] = verticesOfEdge(edge).map((v) => vertexToPixel(v, SIZE));
        const isShip = road.kind === 'ship';
        return (
          <line
            key={edge}
            x1={a!.x}
            y1={a!.y}
            x2={b!.x}
            y2={b!.y}
            stroke={ownerColor(road.owner)}
            strokeWidth={isShip ? 6 : 8}
            strokeLinecap="round"
            strokeDasharray={isShip ? '7 5' : undefined}
          />
        );
      })}

      {/* legal road / ship highlights */}
      {(mode === 'road' || mode === 'ship') &&
        [...legalEdges].map((edge) => {
          const [a, b] = verticesOfEdge(edge).map((v) => vertexToPixel(v, SIZE));
          return (
            <line
              key={`hl-${edge}`}
              x1={a!.x}
              y1={a!.y}
              x2={b!.x}
              y2={b!.y}
              stroke={mode === 'ship' ? '#7fd3ff' : 'var(--accent)'}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={mode === 'ship' ? '7 5' : undefined}
              opacity={0.5}
              style={{ cursor: 'pointer' }}
              onClick={() => onEdge(edge)}
            />
          );
        })}

      {/* existing buildings */}
      {Object.entries(view.buildings).map(([vertex, b]) => {
        const p = vertexToPixel(vertex, SIZE);
        const color = ownerColor(b.owner);
        return b.type === 'city' ? (
          <g key={vertex}>
            <rect x={p.x - 9} y={p.y - 9} width={18} height={18} rx={3} fill={color} stroke="#000" />
            <circle cx={p.x} cy={p.y} r={4} fill="#0008" />
          </g>
        ) : (
          <circle key={vertex} cx={p.x} cy={p.y} r={7} fill={color} stroke="#000" strokeWidth={1.5} />
        );
      })}

      {/* knights */}
      {Object.entries(view.knights).map(([vertex, k]) => {
        const p = vertexToPixel(vertex, SIZE);
        const color = ownerColor(k.owner);
        const mine = k.owner === view.you;
        return (
          <g
            key={`kn-${vertex}`}
            style={{ cursor: mine ? 'pointer' : 'default' }}
            onClick={mine ? () => onKnight(vertex) : undefined}
            opacity={k.active ? 1 : 0.5}
          >
            <polygon
              points={`${p.x},${p.y - 9} ${p.x + 8},${p.y + 6} ${p.x - 8},${p.y + 6}`}
              fill={color}
              stroke={k.active ? '#fff' : '#000'}
              strokeWidth={k.active ? 2 : 1}
            />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#111">
              {k.level}
            </text>
          </g>
        );
      })}

      {/* legal vertex highlights (settlement / city / knight) */}
      {(mode === 'settlement' || mode === 'city' || mode === 'knight') &&
        [...legalVertices].map((vertex) => {
          const p = vertexToPixel(vertex, SIZE);
          return (
            <circle
              key={`hlv-${vertex}`}
              cx={p.x}
              cy={p.y}
              r={9}
              fill={mode === 'knight' ? '#b06bd6' : 'var(--accent)'}
              opacity={0.5}
              stroke="#fff"
              className="vertex-spot"
              onClick={() => onVertex(vertex)}
            />
          );
        })}
    </svg>
  );
}
