import { SERVER_URL } from '../config.js';

export function Avatar({
  avatar,
  name,
  color,
  size = 28,
}: {
  avatar: string | null;
  name: string;
  color: string;
  size?: number;
}) {
  const src = avatar ? (avatar.startsWith('http') ? avatar : SERVER_URL + avatar) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}`, flex: 'none' }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'grid',
        placeItems: 'center',
        color: '#111',
        fontWeight: 700,
        fontSize: size * 0.45,
        flex: 'none',
      }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </div>
  );
}
