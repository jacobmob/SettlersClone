import type { EditorPort, EditorTile } from '@catan/shared';
import { SERVER_URL } from './config.js';

export interface CustomMapSummary {
  id: string;
  name: string;
  owner: string;
  tileCount: number;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  preferredColor: string;
  avatarKey: string | null;
  wins: number;
  losses: number;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: (token: string) => request<{ user: PublicUser }>('/api/auth/me', {}, token),
  updateProfile: (
    token: string,
    data: { displayName?: string; preferredColor?: string; avatarKey?: string | null },
  ) =>
    request<{ user: PublicUser }>(
      '/api/auth/me',
      { method: 'PATCH', body: JSON.stringify(data) },
      token,
    ),
  uploadRadio: async (token: string, file: File, title: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    const res = await fetch(`${SERVER_URL}/api/radio/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Upload failed');
    return body as { url: string; title: string };
  },
  uploadAvatar: async (token: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${SERVER_URL}/api/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Upload failed');
    return body as { url: string };
  },
  listMaps: (token: string) => request<CustomMapSummary[]>('/api/maps', {}, token),
  saveMap: (token: string, name: string, tiles: EditorTile[], ports: EditorPort[] = []) =>
    request<{ id: string; name: string }>(
      '/api/maps',
      { method: 'POST', body: JSON.stringify({ name, tiles, ports }) },
      token,
    ),
  deleteMap: (token: string, id: string) =>
    request<{ ok: boolean }>(`/api/maps/${id}`, { method: 'DELETE' }, token),
  userStats: (userId: string) =>
    request<{
      wins: number;
      losses: number;
      totals: Record<string, number>;
      diceHistogram: Record<number, number>;
      headToHead: { opponentId: string; name: string; wins: number; losses: number; games: number }[];
    }>(`/api/users/${userId}/stats`),
};
