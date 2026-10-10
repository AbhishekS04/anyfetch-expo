/**
 * Keep-Alive Heartbeat Worker.
 * Periodically pings the server's /health endpoint to prevent free cloud instances
 * (Voroa / Render / Railway) from going into idle sleep mode.
 */
export function startKeepAlive(port: number, externalUrl?: string) {
  // Render / Voroa free tier goes to sleep after 15 minutes of no external traffic.
  // Pinging every 4 minutes guarantees the idle timer is constantly reset.
  const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

  console.log(`[KeepAlive] Heartbeat initialized. Interval: 4 minutes.`);
  if (externalUrl) {
    console.log(`[KeepAlive] Target external URL: ${externalUrl}`);
  } else {
    console.log(`[KeepAlive] Note: Set EXTERNAL_URL or RENDER_EXTERNAL_URL to ping via public internet edge.`);
  }

  const ping = async () => {
    const targets: string[] = [];
    if (externalUrl && !externalUrl.includes('localhost')) {
      targets.push(`${externalUrl.replace(/\/+$/, '')}/health`);
    }
    targets.push(`http://localhost:${port}/health`);

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
