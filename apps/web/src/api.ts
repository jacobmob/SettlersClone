import { SERVER_URL } from './config.js';

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
  userStats: (userId: string) =>
    request<{
      wins: number;
      losses: number;
      totals: Record<string, number>;
      diceHistogram: Record<number, number>;
      headToHead: { opponentId: string; name: string; wins: number; losses: number; games: number }[];
    }>(`/api/users/${userId}/stats`),
};
