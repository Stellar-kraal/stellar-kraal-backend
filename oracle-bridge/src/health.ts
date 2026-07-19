/**
 * src/health.ts
 *
 * Tiny dependency-free HTTP server exposing GET /health. Used by:
 *  - Docker Compose healthchecks
 *  - The DR drill script, to detect when standby has finished promoting
 *  - Humans, during a manual incident, to check bridge status at a glance
 */

import * as http from 'http';
import { BridgeState } from './state';

export interface HealthSnapshot {
  status: 'ok';
  role: BridgeState['role'];
  contractId: string;
  lastSubmittedAt: string | null;
  lastBackupAt: string | null;
  uptimeSeconds: number;
}

export function startHealthServer(port: number, getSnapshot: () => HealthSnapshot): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const body = JSON.stringify(getSnapshot());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port);
  return server;
}
