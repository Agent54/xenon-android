#!/usr/bin/env node

// Disposable-emulator behavior probe. This does not alter browser preferences.
import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const [baseUrl, adbPath, serial, origin] = process.argv.slice(2);
if (!baseUrl || !adbPath || !serial || !origin) {
  throw new Error('usage: test_iwa_direct_sockets_active_teardown.mjs CDP_URL ADB SERIAL IWA_ORIGIN');
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

let port;
let client;
try {
  const opened = await evaluate(`(async () => {
    const server = new TCPServerSocket('127.0.0.1');
    const socket = await server.opened;
    globalThis.__xenonTeardownProbe = {
      server,
      incoming: socket.readable.getReader(),
    };
    return {port: socket.localPort};
  })()`);
  port = opened.port;
  if (!Number.isInteger(port) || port < 32768 || port > 65535) {
    throw new Error(`Unexpected listener port: ${port}`);
  }

  await execFileAsync(adbPath, ['-s', serial, 'forward', `tcp:${port}`, `tcp:${port}`]);
  client = net.connect({ host: '127.0.0.1', port });
  client.on('error', () => {});
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  client.write('xenon-active-teardown');

  const received = await evaluate(`(async () => {
    const probe = globalThis.__xenonTeardownProbe;
    const {value, done} = await probe.incoming.read();
    if (done) throw new Error('Listener closed before accept');
    probe.accepted = value;
    const opened = await value.opened;
    const reader = opened.readable.getReader();
    probe.acceptedReader = reader;
    const data = await reader.read();
    return {accepted: !data.done, text: new TextDecoder().decode(data.value)};
  })()`);
  if (!received.accepted || received.text !== 'xenon-active-teardown') {
    throw new Error(`Accepted socket did not receive marker: ${JSON.stringify(received)}`);
  }

  const closed = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    client.once('close', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
  await evaluate(`(location.href = 'about:blank')`);
  const connectionClosed = await closed;
  if (!connectionClosed) throw new Error('Accepted TCP connection stayed open after navigation');
  console.log(JSON.stringify({ activeConnection: true, navigated: true, connectionClosed }));
} finally {
  client?.destroy();
  if (port) {
    await execFileAsync(adbPath, ['-s', serial, 'forward', '--remove', `tcp:${port}`]).catch(() => {});
  }
  cdp.close();
}
