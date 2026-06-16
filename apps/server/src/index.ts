import { env } from './env.js';
import { buildServer } from './server.js';

const { httpServer } = buildServer();

httpServer.listen(env.port, () => {
  console.log(`Catan server listening on http://localhost:${env.port}`);
});
