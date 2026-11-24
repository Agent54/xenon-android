#!/usr/bin/env node

// Bounded emulator test: an accepted IWA TCP connection survives a brief
// background/foreground round trip. No device network setting is changed.
import {execFile} from 'node:child_process';
import net from 'node:net';
import {promisify} from 'node:util';

const run = promisify(execFile);
const [baseUrl, adbPath, serial, origin] = process.argv.slice(2);
if (!baseUrl || !adbPath || !serial || !origin?.startsWith('isolated-app://')) {
  throw new Error('usage: test_iwa_direct_sockets_background.mjs CDP_URL ADB SERIAL IWA_ORIGIN');
}

const targets = await fetch(`${baseUrl}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith(origin));
if (!target) throw new Error(`No IWA page for ${origin}`);
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  cdp.addEventListener('open', resolve, {once: true});
  cdp.addEventListener('error', reject, {once: true});
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
      params: {expression, returnByValue: true, awaitPromise: true},
    }));
  });
}

let port;
let client;
let backgrounded = false;
try {
  const opened = await evaluate(`(async () => {
    const server = new TCPServerSocket('127.0.0.1');
    const socket = await server.opened;
    globalThis.__xenonBackgroundProbe = {server, incoming: socket.readable.getReader()};
    return {port: socket.localPort};
  })()`);
  port = opened.port;
  if (!Number.isInteger(port) || port < 32768 || port > 65535) {
    throw new Error(`Unexpected listener port: ${port}`);
  }
  await run(adbPath, ['-s', serial, 'forward', `tcp:${port}`, `tcp:${port}`]);
  client = net.connect({host: '127.0.0.1', port});
  client.on('error', () => {});
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  client.write('xenon-before-background');
  const before = await evaluate(`(async () => {
    const probe = globalThis.__xenonBackgroundProbe;
    const accepted = await probe.incoming.read();
    if (accepted.done) throw new Error('Listener closed before accept');
    const socket = await accepted.value.opened;
    probe.accepted = accepted.value;
    probe.reader = socket.readable.getReader();
    const data = await probe.reader.read();
    return {done: data.done, text: new TextDecoder().decode(data.value)};
  })()`);
  if (before.done || before.text !== 'xenon-before-background') {
    throw new Error(`Pre-background TCP marker failed: ${JSON.stringify(before)}`);
  }

  await run(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  backgrounded = true;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  client.write('xenon-while-background');
  const during = await evaluate(`(async () => {
    const probe = globalThis.__xenonBackgroundProbe;
    const data = await probe.reader.read();
    return {done: data.done, text: new TextDecoder().decode(data.value),
            visibility: document.visibilityState};
  })()`);
  if (during.done || during.text !== 'xenon-while-background') {
    throw new Error(`Background TCP marker failed: ${JSON.stringify(during)}`);
  }

  await run(adbPath, ['-s', serial, 'shell', 'am', 'start',
    '-n', 'org.agent54.xenon.iwa.kitchensink/.LauncherActivity']);
  backgrounded = false;
  const resumed = await evaluate(`({url: location.href,
    sameProbe: !!globalThis.__xenonBackgroundProbe,
    tcp: typeof TCPSocket})`);
  if (!resumed.url.startsWith(origin) || !resumed.sameProbe || resumed.tcp !== 'function') {
    throw new Error(`Foreground shim did not preserve IWA page: ${JSON.stringify(resumed)}`);
  }
  console.log(JSON.stringify({before: true, background: true,
    backgroundVisibility: during.visibility, resumed: true}));
} finally {
  if (backgrounded) {
    await run(adbPath, ['-s', serial, 'shell', 'am', 'start',
      '-n', 'org.agent54.xenon.iwa.kitchensink/.LauncherActivity']).catch(() => {});
  }
  client?.destroy();
  if (port) {
    await run(adbPath, ['-s', serial, 'forward', '--remove', `tcp:${port}`]).catch(() => {});
  }
  await evaluate(`(async () => {
    const probe = globalThis.__xenonBackgroundProbe;
    if (probe) {
      probe.reader?.releaseLock();
      probe.incoming?.releaseLock();
      await probe.accepted?.close().catch(() => {});
      await probe.server?.close().catch(() => {});
      delete globalThis.__xenonBackgroundProbe;
    }
  })()`).catch(() => {});
  cdp.close();
}
