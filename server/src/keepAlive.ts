/**
 * Keep-Alive Heartbeat Worker.
 * Periodically pings the server's /health endpoint to prevent free cloud instances
 * (Voroa / Render / Railway) from going into idle sleep mode.
 */
export function startKeepAlive(port: number, externalUrl?: string) {
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  console.log(`[KeepAlive] Heartbeat initialized. Interval: 10 minutes.`);
  if (externalUrl) {
    console.log(`[KeepAlive] Target external URL: ${externalUrl}`);
  }

  const ping = async () => {
    const targets = [`http://localhost:${port}/health`];
    if (externalUrl && !externalUrl.includes('localhost')) {
      targets.push(`${externalUrl.replace(/\/+$/, '')}/health`);
    }

    for (const target of targets) {
      try {
        const start = Date.now();
        const res = await fetch(target, {
          headers: { 'User-Agent': 'AnyFetch-KeepAlive-Bot/1.0' },
        });
        const elapsed = Date.now() - start;
        console.log(`[KeepAlive] Ping to ${target} -> ${res.status} (${elapsed}ms) at ${new Date().toLocaleTimeString()}`);
      } catch (err: any) {
        console.warn(`[KeepAlive] Ping failed to ${target}: ${err.message}`);
      }
    }
  };

  // Run initial ping after 1 minute, then recurring every 10 minutes
  setTimeout(ping, 60 * 1000);
  const timer = setInterval(ping, PING_INTERVAL_MS);

  return () => clearInterval(timer);
}
