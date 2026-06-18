import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Auth } from './pages/Auth.js';
import { GameScreen } from './pages/Game.js';
import { Home } from './pages/Home.js';
import { Lobby } from './pages/Lobby.js';
import { MapEditor } from './pages/MapEditor.js';
import { Profile } from './pages/Profile.js';
import { Toasts } from './pages/Toasts.js';
import { connectSocket, disconnectSocket, lobby as lobbyApi } from './socket.js';
import { useStore } from './store.js';

export function App() {
  const { token, user, lobby, game, setAuth, setUser, logout } = useStore();
  const [nav, setNav] = useState<'home' | 'profile' | 'editor'>('home');
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .me(token)
      .then(({ user }) => {
        setUser(user);
        connectSocket(token);
      })
      .catch(() => logout())
      .finally(() => setBooting(false));
    return () => disconnectSocket();
  }, [token]);

  if (booting) return <div className="center muted">Loading…</div>;
  if (!token || !user) return <Auth onAuth={setAuth} />;

  const leaveRoom = () => {
    lobbyApi.leave();
    useStore.getState().clearRoom();
    setNav('home');
  };

  let screen;
  if (game) screen = <GameScreen onLeave={leaveRoom} />;
  else if (lobby) screen = <Lobby onLeave={leaveRoom} />;
  else if (nav === 'profile') screen = <Profile userId={user.id} onClose={() => setNav('home')} />;
  else if (nav === 'editor') screen = <MapEditor onClose={() => setNav('home')} />;
  else screen = <Home onProfile={() => setNav('profile')} onEditor={() => setNav('editor')} />;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand" onClick={leaveRoom}>
          ⬡ Catan
        </span>
        <span className="spacer" />
        <span className="muted">{user.displayName}</span>
        {!game && !lobby && (
          <button className="ghost" onClick={() => setNav(nav === 'profile' ? 'home' : 'profile')}>
            {nav === 'profile' ? 'Home' : 'Profile'}
          </button>
        )}
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </header>
      <main>{screen}</main>
      <Toasts />
    </div>
  );
}
