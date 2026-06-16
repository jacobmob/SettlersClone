import {
  type Cube,
  type EdgeId,
  type VertexId,
  hexToAxial,
  hexesOfEdge,
  hexesOfVertex,
} from './coords.js';

export interface Point {
  x: number;
  y: number;
}

/** Pointy-top hex centre in pixel space. */
export function hexToPixel(h: Cube, size = 1): Point {
  const { q, r } = hexToAxial(h);
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

function average(points: Point[]): Point {
  const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** A vertex sits at the shared corner = centroid of its (up to 3) hex centres. */
export function vertexToPixel(v: VertexId, size = 1): Point {
  return average(hexesOfVertex(v).map((h) => hexToPixel(h, size)));
}

/** An edge midpoint = midpoint between its two hex centres. */
export function edgeMidpoint(e: EdgeId, size = 1): Point {
  return average(hexesOfEdge(e).map((h) => hexToPixel(h, size)));
}
