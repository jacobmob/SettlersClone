import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { SERVER_URL } from '../config.js';
import { radio as radioApi } from '../socket.js';
import { useStore } from '../store.js';

export function Radio() {
  const radio = useStore((s) => s.radio);
  const token = useStore((s) => s.token);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Reconcile the local <audio> element with the shared, server-authoritative state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !radio) return;
    const track = radio.currentIndex >= 0 ? radio.queue[radio.currentIndex] : null;
    if (!track) {
      audio.pause();
      return;
    }
    const fullUrl = track.url.startsWith('http') ? track.url : SERVER_URL + track.url;
    if (!audio.src.endsWith(track.url)) audio.src = fullUrl;
    const target = radio.playing
      ? radio.positionSec + (Date.now() - radio.updatedAt) / 1000
      : radio.positionSec;
    if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 1.5) {
      try {
        audio.currentTime = target;
      } catch {
        /* not seekable yet */
      }
    }
    if (radio.playing) audio.play().catch(() => undefined);
    else audio.pause();
  }, [radio]);

  if (!radio) return null;
  const current = radio.currentIndex >= 0 ? radio.queue[radio.currentIndex] : null;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setBusy(true);
    try {
      const { url, title } = await api.uploadRadio(token, file, file.name);
      radioApi.add(title, url);
    } catch (err) {
      useStore.getState().pushToast('error', (err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const onAddUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    radioApi.add(u.split('/').pop() || 'Track', u);
    setUrlInput('');
  };

  const togglePlay = () => {
    if (radio.playing) radioApi.pause(audioRef.current?.currentTime ?? radio.positionSec);
    else radioApi.play();
  };

  return (
    <div className="card col">
      <strong>📻 Radio</strong>
      <audio ref={audioRef} onEnded={() => radioApi.skip(radio.currentIndex)} />
      <div className="row">
        <button onClick={togglePlay} disabled={radio.queue.length === 0}>
          {radio.playing ? '⏸' : '▶'}
        </button>
        <button
          className="ghost"
          onClick={() => radioApi.skip(radio.currentIndex)}
          disabled={radio.currentIndex < 0}
        >
          ⏭
        </button>
        <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current ? current.title : 'Nothing playing'}
        </span>
      </div>

      <div className="radio-queue">
        {radio.queue.map((t, i) => (
          <div key={t.id} className={`radio-track ${i === radio.currentIndex ? 'current' : ''}`}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title}
            </span>
            <span className="spacer" />
            <button className="ghost" onClick={() => radioApi.remove(t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <label className="ghost upload-btn">
        {busy ? 'Uploading…' : '＋ Upload song'}
        <input type="file" accept="audio/*" hidden onChange={onUpload} disabled={busy} />
      </label>
      <div className="row">
        <input
          placeholder="or paste an audio URL"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={onAddUrl}>Add</button>
      </div>
    </div>
  );
}
