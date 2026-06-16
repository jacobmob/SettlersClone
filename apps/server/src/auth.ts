import bcrypt from 'bcryptjs';
import { type NextFunction, type Request, type Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './env.js';

export interface TokenPayload {
  userId: string;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.user = payload;
  next();
}

const credentials = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(128),
});

function publicUser(u: {
  id: string;
  username: string;
  displayName: string;
  preferredColor: string;
  avatarKey: string | null;
  wins: number;
  losses: number;
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    preferredColor: u.preferredColor,
    avatarKey: u.avatarKey,
    wins: u.wins,
    losses: u.losses,
  };
}

export const authRouter: Router = Router();

authRouter.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Username must be 3+ chars and password 6+ chars.' });
    return;
  }
  const { username, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'That username is taken.' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, displayName: username },
  });
  res.json({ token: signToken({ userId: user.id, username }), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials.' });
    return;
  }
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Wrong username or password.' });
    return;
  }
  res.json({ token: signToken({ userId: user.id, username }), user: publicUser(user) });
});

authRouter.get('/me', authenticate, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: publicUser(user) });
});

const profileUpdate = z.object({
  displayName: z.string().min(1).max(24).optional(),
  preferredColor: z.string().max(16).optional(),
  avatarKey: z.string().max(64).nullable().optional(),
});

authRouter.patch('/me', authenticate, async (req: AuthedRequest, res) => {
  const parsed = profileUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update.' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: parsed.data,
  });
  res.json({ user: publicUser(user) });
});
