#!/usr/bin/env node
// Probe the public Direct Sockets API in an already-running, installed IWA.
// Example: node scripts/probe_iwa_direct_sockets.mjs http://127.0.0.1:9225 isolated-app://<bundle-id>/

const [baseUrl, appOrigin] = process.argv.slice(2);
if (!baseUrl || !appOrigin?.startsWith('isolated-app://')) {
  console.error('Usage: probe_iwa_direct_sockets.mjs CDP_BASE ISOLATED_APP_ORIGIN');
  process.exit(2);
}

const targetsResponse = await fetch(`${baseUrl}/json/list`);
if (!targetsResponse.ok) {
  throw new Error(`CDP target listing failed: HTTP ${targetsResponse.status}`);
}
const targets = await targetsResponse.json();
const target = targets.find((item) => item.type === 'page' && item.url.startsWith(appOrigin));
if (!target) {
  throw new Error(`No installed IWA page found for ${appOrigin}`);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });

  const expression = `(async () => {
    const manifest = await (await fetch('/.well-known/manifest.webmanifest')).json();
    const policy = document.permissionsPolicy ?? document.featurePolicy;
    return {
      url: location.href,
      secure: isSecureContext,
      crossOriginIsolated,
      manifestDirectSockets: manifest.permissions_policy?.['direct-sockets'] ?? null,
      policyAllowsDirectSockets: policy?.allowsFeature('direct-sockets') ?? false,
      tcp: typeof TCPSocket,
      tcpServer: typeof TCPServerSocket,
      udp: typeof UDPSocket,
    };
  })()`;
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP evaluation timed out')), 10000);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      resolve(message);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {expression, returnByValue: true, awaitPromise: true},
    }));
  });
  if (reply.error || reply.result?.exceptionDetails) {
    throw new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails));
  }

  const result = reply.result?.result?.value;
  console.log(JSON.stringify(result, null, 2));
  if (!result?.secure || !result.crossOriginIsolated ||
      !result.manifestDirectSockets?.includes('self') ||
      !result.policyAllowsDirectSockets ||
      result.tcp !== 'function' || result.tcpServer !== 'function' ||
      result.udp !== 'function') {
    process.exitCode = 1;
  }
} finally {
  socket.close();
}
