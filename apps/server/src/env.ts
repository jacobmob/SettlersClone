// Load apps/server/.env if present (Node 20.6+ built-in, no dependency needed).
try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on real environment variables
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
  databaseUrl: process.env.DATABASE_URL ?? '',
};
