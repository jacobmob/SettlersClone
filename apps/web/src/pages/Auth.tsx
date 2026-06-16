import { useState } from 'react';
import { type PublicUser, api } from '../api.js';

export function Auth({ onAuth }: { onAuth: (token: string, user: PublicUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const { token, user } = await fn(username.trim(), password);
      onAuth(token, user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth card col" onSubmit={submit}>
      <h1>⬡ Catan</h1>
      <p className="muted" style={{ textAlign: 'center', marginTop: -8 }}>
        {mode === 'login' ? 'Welcome back' : 'Create an account'}
      </p>
      <div className="field">
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <div className="error">{error}</div>}
      <button className="accent" disabled={busy}>
        {mode === 'login' ? 'Sign in' : 'Sign up'}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
        }}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
