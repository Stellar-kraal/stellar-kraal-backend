/**
 * tests/chaos/toxiproxy-client.ts
 *
 * Lightweight Toxiproxy management client.
 *
 * Wraps the Toxiproxy HTTP management API (port 8474) with typed helpers for
 * creating, removing, and managing toxics on named proxies.
 *
 * Toxiproxy HTTP API reference:
 * https://github.com/Shopify/toxiproxy#http-api
 */

const TOXIPROXY_API = process.env['TOXIPROXY_API'] ?? 'http://localhost:8474';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToxicAttributes {
  latency?: number;     // ms — for latency toxic
  jitter?: number;      // ms — for latency toxic
  rate?: number;        // bytes/sec — for bandwidth toxic
  timeout?: number;     // ms — for timeout toxic
  bytes?: number;       // for slicer toxic
  average_size?: number;
  size_variation?: number;
  delay?: number;
  percent?: number;     // 0-100 — for slow_close, limit_data
}

export interface Toxic {
  name: string;
  type: 'latency' | 'bandwidth' | 'slow_close' | 'timeout' | 'slicer' | 'limit_data';
  stream?: 'upstream' | 'downstream';
  toxicity?: number;   // 0.0-1.0 probability
  attributes: ToxicAttributes;
}

export type ProxyName = 'stellar-rpc' | 'oracle-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${TOXIPROXY_API}${path}`;
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(url, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Toxiproxy API ${method} ${path} failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── Proxy Operations ──────────────────────────────────────────────────────────

/** Check if Toxiproxy is available */
export async function isAvailable(): Promise<boolean> {
  try {
    await apiCall('GET', '/proxies');
    return true;
  } catch {
    return false;
  }
}

/** Enable a proxy */
export async function enableProxy(name: ProxyName): Promise<void> {
  await apiCall('POST', `/proxies/${name}/enable`);
}

/** Disable a proxy (simulates complete connection failure) */
export async function disableProxy(name: ProxyName): Promise<void> {
  await apiCall('POST', `/proxies/${name}/disable`);
}

/** Reset a proxy — removes all toxics and re-enables it */
export async function resetProxy(name: ProxyName): Promise<void> {
  // Remove all toxics
  const proxy = (await apiCall('GET', `/proxies/${name}`)) as {
    toxics?: Array<{ name: string }>;
  };
  for (const toxic of proxy.toxics ?? []) {
    await removeToxic(name, toxic.name).catch(() => null);
  }
  await enableProxy(name);
}

/** Reset all proxies to clean state */
export async function resetAll(): Promise<void> {
  await apiCall('POST', '/reset');
}

// ── Toxic Management ──────────────────────────────────────────────────────────

/** Add a toxic to a proxy */
export async function addToxic(name: ProxyName, toxic: Toxic): Promise<void> {
  await apiCall('POST', `/proxies/${name}/toxics`, toxic);
}

/** Remove a named toxic from a proxy */
export async function removeToxic(name: ProxyName, toxicName: string): Promise<void> {
  await apiCall('DELETE', `/proxies/${name}/toxics/${toxicName}`);
}

// ── Pre-built Fault Helpers ───────────────────────────────────────────────────

/**
 * Inject a fixed latency (timeout-style) on a proxy.
 * @param latencyMs   Delay in milliseconds
 */
export async function injectLatency(
  proxy: ProxyName,
  latencyMs: number,
  jitterMs = 0,
  toxicName = 'latency',
): Promise<void> {
  await addToxic(proxy, {
    name: toxicName,
    type: 'latency',
    stream: 'downstream',
    toxicity: 1.0,
    attributes: { latency: latencyMs, jitter: jitterMs },
  });
}

/**
 * Throttle bandwidth to simulate a slow connection.
 * @param rateBytesPerSec  e.g. 1024 = 1 KB/s
 */
export async function injectBandwidthLimit(
  proxy: ProxyName,
  rateBytesPerSec: number,
  toxicName = 'bandwidth',
): Promise<void> {
  await addToxic(proxy, {
    name: toxicName,
    type: 'bandwidth',
    stream: 'downstream',
    toxicity: 1.0,
    attributes: { rate: rateBytesPerSec },
  });
}

/**
 * Inject a connection timeout after `timeoutMs` of inactivity.
 */
export async function injectTimeout(
  proxy: ProxyName,
  timeoutMs: number,
  toxicName = 'timeout',
): Promise<void> {
  await addToxic(proxy, {
    name: toxicName,
    type: 'timeout',
    stream: 'downstream',
    toxicity: 1.0,
    attributes: { timeout: timeoutMs },
  });
}

/**
 * Disable the proxy entirely — simulates a total connection failure.
 */
export async function injectConnectionFailure(proxy: ProxyName): Promise<void> {
  await disableProxy(proxy);
}

/**
 * Remove all toxics and re-enable a proxy (restore to healthy state).
 */
export async function restoreProxy(proxy: ProxyName): Promise<void> {
  await resetProxy(proxy);
}
