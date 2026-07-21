/**
 * src/monitoring/health.ts
 *
 * Minimal health-check HTTP server (no Express dependency needed for one
 * route) for container orchestration / Docker Compose healthchecks.
 */

import http from 'node:http';
import { monitorConfig } from './config';
import { createLogger } from './logger';
import { StreamStats } from './horizon/stream';

const log = createLogger('health');

export function startHealthServer(getStats: () => StreamStats): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }

    const stats = getStats();
    const lagOk = stats.lastProcessingLagMs === null || stats.lastProcessingLagMs <= monitorConfig.MAX_EVENT_LAG_MS;
    const healthy = stats.connected && lagOk;

    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: healthy ? 'ok' : 'unhealthy',
        streamConnected: stats.connected,
        lastMessageAt: stats.lastMessageAt,
        lastProcessingLagMs: stats.lastProcessingLagMs,
        maxEventLagMs: monitorConfig.MAX_EVENT_LAG_MS,
      }),
    );
  });

  server.listen(monitorConfig.MONITOR_PORT, () => {
    log.info('Health server listening', { port: monitorConfig.MONITOR_PORT });
  });

  return server;
}
