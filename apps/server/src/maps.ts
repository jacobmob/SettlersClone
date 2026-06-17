import { type EditorTile, type MapDef, makeCustomMap } from '@catan/shared';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, authenticate } from './auth.js';
import { prisma } from './db.js';

export const mapsRouter: Router = Router();

const cube = z.object({ x: z.number(), y: z.number(), z: z.number() });
const editorTile = z.object({
  coord: cube,
  kind: z.enum(['water', 'land', 'desert', 'gold']),
});
const saveSchema = z.object({
  name: z.string().min(1).max(40),
  tiles: z.array(editorTile).min(1).max(120),
});

/** List every custom map (shared library — this is for playing with friends). */
mapsRouter.get('/maps', authenticate, async (_req, res) => {
  const maps = await prisma.customMap.findMany({
    orderBy: { createdAt: 'desc' },
    include: { owner: { select: { displayName: true } } },
  });
  res.json(
    maps.map((m) => ({
      id: m.id,
      name: m.name,
      owner: m.owner.displayName,
      tileCount: (m.def as unknown as MapDef).hexes.length,
    })),
  );
});

mapsRouter.get('/maps/:id', authenticate, async (req, res) => {
  const map = await prisma.customMap.findUnique({ where: { id: req.params.id } });
  if (!map) {
    res.status(404).json({ error: 'Map not found.' });
    return;
  }
  res.json({ id: map.id, name: map.name, def: map.def });
});

mapsRouter.post('/maps', authenticate, async (req: AuthedRequest, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A map needs a name and at least one tile.' });
    return;
  }
  // Build the authoritative MapDef on the server so bags are always valid.
  const created = await prisma.customMap.create({
    data: { name: parsed.data.name, ownerId: req.user!.userId, def: {} },
  });
  const def = makeCustomMap(created.id, parsed.data.name, parsed.data.tiles as EditorTile[]);
  await prisma.customMap.update({ where: { id: created.id }, data: { def: def as object } });
  res.json({ id: created.id, name: created.name });
});

mapsRouter.delete('/maps/:id', authenticate, async (req: AuthedRequest, res) => {
  const map = await prisma.customMap.findUnique({ where: { id: req.params.id } });
  if (!map) {
    res.status(404).json({ error: 'Map not found.' });
    return;
  }
  if (map.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'Only the owner can delete this map.' });
    return;
  }
  await prisma.customMap.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
