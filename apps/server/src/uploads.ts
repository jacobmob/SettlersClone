import { Router } from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { type AuthedRequest, authenticate } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = join(here, '..', 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`;
    cb(null, safe);
  },
});

const audioUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('audio/')),
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

export const uploadsRouter: Router = Router();

uploadsRouter.post(
  '/radio/upload',
  authenticate,
  audioUpload.single('file'),
  (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded.' });
      return;
    }
    const title = (req.body?.title as string | undefined)?.trim() || req.file.originalname;
    res.json({ url: `/uploads/${req.file.filename}`, title });
  },
);

uploadsRouter.post(
  '/profile/avatar',
  authenticate,
  imageUpload.single('file'),
  (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded.' });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  },
);
