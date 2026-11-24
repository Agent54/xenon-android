#!/usr/bin/env node

// One-shot disposable-emulator probe using a signed IWA with fresh permissions.
import net from 'node:net';

const [baseUrl, origin, holdMsRaw = '500'] = process.argv.slice(2);
if (!baseUrl || !origin) {
  throw new Error('usage: test_iwa_direct_sockets_pending_navigation.mjs CDP_URL FRESH_IWA_ORIGIN [HOLD_MS]');
}
const holdMs = Number(holdMsRaw);
if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 10000) {
  throw new Error(`Invalid HOLD_MS: ${holdMsRaw}`);
}

const targets = await fetch(`${baseUrl}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.url.startsWith(origin));
if (!target) throw new Error(`No IWA target for ${origin}`);

const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  cdp.addEventListener('open', resolve, { once: true });
  cdp.addEventListener('error', reject, { once: true });
});

let requestId = 0;
function evaluate(expression) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cdp.removeEventListener('message', onMessage);
      reject(new Error('CDP evaluation timed out'));
    }, 10000);
    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout);
      cdp.removeEventListener('message', onMessage);
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
      } else {
        resolve(message.result?.result?.value);
      }
    }
    cdp.addEventListener('message', onMessage);
    cdp.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

const server = net.createServer();
let connections = 0;
server.on('connection', (socket) => {
  connections++;
  socket.destroy();
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const started = await evaluate(`(() => {
    const socket = new TCPSocket('10.0.2.2', ${port});
    globalThis.__xenonPendingSocketProbe = {state: 'pending', socket};
    socket.opened.then(
      () => globalThis.__xenonPendingSocketProbe.state = 'opened',
      error => globalThis.__xenonPendingSocketProbe.state = error.name
    );
    return globalThis.__xenonPendingSocketProbe.state;
  })()`);
  if (started !== 'pending') throw new Error(`Unexpected initial state: ${started}`);

  // A fresh-origin permission prompt should keep this request unresolved.
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  const beforeNavigation = await evaluate('globalThis.__xenonPendingSocketProbe.state');
  if (beforeNavigation !== 'pending' || connections !== 0) {
    throw new Error(`Consent was not pending: ${beforeNavigation}, connections=${connections}`);
  }

  await evaluate(`(location.href = 'about:blank')`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const afterNavigation = await evaluate('location.href');
  if (afterNavigation !== 'about:blank' || connections !== 0) {
    throw new Error(`Pending request survived navigation: ${afterNavigation}, connections=${connections}`);
  }
  console.log(JSON.stringify({consentPending: true, navigated: true, outboundConnections: 0}));
} finally {
  await new Promise((resolve) => server.close(resolve));
  cdp.close();
}
