#!/usr/bin/env node

// Disposable-emulator behavior probe. The endpoint is a controlled local server.
import net from 'node:net';

const [baseUrl, origin] = process.argv.slice(2);
if (!baseUrl || !origin) {
  throw new Error('usage: test_iwa_direct_sockets_outbound_teardown.mjs CDP_URL IWA_ORIGIN');
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
    }, 15000);
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
let port;
let accepted;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    // 10.0.2.2 is the emulator's host-loopback gateway, not a LAN peer.
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
  const incoming = new Promise((resolve) => {
    server.once('connection', (socket) => {
      accepted = socket;
      socket.on('error', () => {});
      resolve(socket);
    });
  });

  const opened = await evaluate(`(async () => {
    const socket = new TCPSocket('10.0.2.2', ${port});
    const connection = await socket.opened;
    globalThis.__xenonOutboundTeardownProbe = {socket, connection};
    return {readable: !!connection.readable, writable: !!connection.writable};
  })()`);
  if (!opened.readable || !opened.writable) {
    throw new Error(`Outbound socket did not open: ${JSON.stringify(opened)}`);
  }
  let connectTimeout;
  try {
    await Promise.race([
      incoming,
      new Promise((_, reject) => {
        connectTimeout = setTimeout(() => reject(new Error('Outbound socket did not reach local endpoint')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(connectTimeout);
  }
  const closed = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    accepted.once('close', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
  await evaluate(`(location.href = 'about:blank')`);
  if (!await closed) throw new Error('Outbound TCP connection stayed open after navigation');
  console.log(JSON.stringify({outboundConnection: true, navigated: true, connectionClosed: true}));
} finally {
  accepted?.destroy();
  await new Promise((resolve) => server.close(resolve));
  cdp.close();
}
