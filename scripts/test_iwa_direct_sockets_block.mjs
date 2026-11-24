#!/usr/bin/env node

// Public-API half of the disposable emulator BLOCK fixture. The test-only
// browser patch sets and resets the content setting; this script never edits
// a profile or device preference.
const [baseUrl, origin, expected] = process.argv.slice(2);
if (!baseUrl || !origin?.startsWith('isolated-app://') ||
    !['allow', 'block'].includes(expected)) {
  throw new Error('usage: test_iwa_direct_sockets_block.mjs CDP_URL IWA_ORIGIN allow|block');
}

const targets = await fetch(`${baseUrl}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith(origin));
if (!target) throw new Error(`No installed IWA page for ${origin}`);
const cdp = new WebSocket(target.webSocketDebuggerUrl);
try {
  await new Promise((resolve, reject) => {
    cdp.addEventListener('open', resolve, {once: true});
    cdp.addEventListener('error', reject, {once: true});
  });
  const expression = `(async () => {
    const policy = document.permissionsPolicy ?? document.featurePolicy;
    const result = {
      url: location.href,
      secure: isSecureContext,
      crossOriginIsolated,
      policyAllows: policy?.allowsFeature('direct-sockets') ?? false,
      constructors: {
        tcpServer: typeof TCPServerSocket,
        tcpClient: typeof TCPSocket,
        udp: typeof UDPSocket,
      },
      outcomes: {},
    };
    const probes = {
      tcpServer: () => new TCPServerSocket('127.0.0.1'),
      tcpClient: () => new TCPSocket('127.0.0.1', 1),
      udp: () => new UDPSocket({remoteAddress: '127.0.0.1', remotePort: 1}),
    };
    for (const [kind, create] of Object.entries(probes)) {
      if ('${expected}' === 'allow' && kind !== 'tcpServer') continue;
      let socket;
      try {
        socket = create();
        const opened = await socket.opened;
        result.outcomes[kind] = {outcome: 'opened', port: opened.localPort};
      } catch (error) {
        result.outcomes[kind] = {outcome: 'rejected', error: error.name};
      } finally {
        if (socket) {
          try {
            await socket.close();
          } catch {}
        }
      }
    }
    return result;
  })()`;
  const reply = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP evaluation timed out')), 15000);
    cdp.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      resolve(message);
    });
    cdp.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {expression, returnByValue: true, awaitPromise: true},
    }));
  });
  if (reply.error || reply.result?.exceptionDetails) {
    throw new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails));
  }
  const result = reply.result?.result?.value;
  console.log(JSON.stringify(result));
  if (!result?.url.startsWith(origin) || !result.secure ||
      !result.crossOriginIsolated || !result.policyAllows ||
      Object.keys(result.constructors ?? {}).length !== 3 ||
      Object.values(result.constructors ?? {}).some((value) => value !== 'function')) {
    throw new Error('The IWA was not entitled to request Direct Sockets');
  }
  if (expected === 'allow' &&
      (result.outcomes?.tcpServer?.outcome !== 'opened' ||
       !Number.isInteger(result.outcomes.tcpServer.port))) {
    throw new Error('Allowed IWA TCP listener did not open');
  }
  if (expected === 'block' &&
      Object.entries(result.outcomes ?? {}).length !== 3) {
    throw new Error('The BLOCK probe did not exercise all three socket forms');
  }
  for (const [kind, outcome] of Object.entries(result.outcomes ?? {})) {
    if (expected === 'block' &&
        (outcome.outcome !== 'rejected' || outcome.error !== 'InvalidAccessError')) {
      throw new Error(`Explicit BLOCK did not deny ${kind}`);
    }
  }
} finally {
  cdp.close();
}
