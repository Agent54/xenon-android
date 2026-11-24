import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const [baseUrl, adbPath, serial, origin] = process.argv.slice(2);
if (!baseUrl || !adbPath || !serial || !origin) throw new Error('missing arguments');

const targets = await fetch(`${baseUrl}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.url.startsWith(origin));
if (!target) throw new Error('IWA target missing');
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  cdp.addEventListener('open', resolve, { once: true });
  cdp.addEventListener('error', reject, { once: true });
});
let nextId = 0;
function evaluate(expression) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10000);
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
    cdp.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {
      expression, awaitPromise: true, returnByValue: true,
    }}));
  });
}

let port;
let client;
try {
  ({port} = await evaluate(`(async () => {
    const server = new TCPServerSocket('127.0.0.1');
    const opened = await server.opened;
    globalThis.__xenonRevokeProbe = {server, incoming: opened.readable.getReader()};
    return {port: opened.localPort};
  })()`));
  if (!Number.isInteger(port) || port < 32768 || port > 65535) {
    throw new Error(`unexpected listener port: ${port}`);
  }
  await execFileAsync(adbPath, ['-s', serial, 'forward', `tcp:${port}`, `tcp:${port}`]);
  client = net.connect({host: '127.0.0.1', port});
  client.on('error', () => {});
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  client.write('before-block');
  const accepted = await evaluate(`(async () => {
    const probe = globalThis.__xenonRevokeProbe;
    const {value, done} = await probe.incoming.read();
    if (done) throw new Error('listener closed');
    probe.accepted = value;
    const opened = await value.opened;
    probe.reader = opened.readable.getReader();
    probe.writer = opened.writable.getWriter();
    const data = await probe.reader.read();
    return new TextDecoder().decode(data.value);
  })()`);
  if (accepted !== 'before-block') throw new Error(`bad accepted marker: ${accepted}`);

  const blocked = await evaluate(`(async () => {
    const second = new TCPServerSocket('127.0.0.1');
    try { await second.opened; return {blocked: false}; }
    catch (error) { return {blocked: true, name: error.name, message: error.message}; }
    finally { await second.close().catch(() => {}); }
  })()`);
  if (!blocked.blocked) throw new Error('second listener unexpectedly opened');

  const dataPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000);
    client.once('data', (data) => {
      clearTimeout(timeout);
      resolve(data.toString());
    });
  });
  await evaluate(`(async () => {
    await globalThis.__xenonRevokeProbe.writer.write(new TextEncoder().encode('after-block'));
    return true;
  })()`);
  const afterBlock = await dataPromise;

  const reset = await evaluate(`(async () => {
    const signal = new TCPServerSocket('127.0.0.2');
    try { await signal.opened; return false; }
    catch { return true; }
    finally { await signal.close().catch(() => {}); }
  })()`);
  if (!reset) throw new Error('reset signal unexpectedly opened a listener');

  const postReset = await evaluate(`(async () => {
    const next = new TCPServerSocket('127.0.0.1');
    try { await next.opened; return true; }
    catch { return false; }
    finally { await next.close().catch(() => {}); }
  })()`);
  console.log(JSON.stringify({accepted, blocked, afterBlock, reset, postReset}));
  if (afterBlock !== 'after-block' || !postReset) {
    throw new Error('unexpected active-socket or reset result');
  }
} finally {
  // Reset even if an assertion failed after the BLOCK was installed.
  await evaluate(`(async () => {
    const signal = new TCPServerSocket('127.0.0.2');
    try { await signal.opened; } catch {}
    await signal.close().catch(() => {});
    return true;
  })()`).catch(() => {});
  await evaluate(`(async () => {
    try { globalThis.__xenonRevokeProbe?.reader?.releaseLock(); } catch {}
    try { globalThis.__xenonRevokeProbe?.writer?.releaseLock(); } catch {}
    await Promise.allSettled([
      globalThis.__xenonRevokeProbe?.accepted?.close(),
      globalThis.__xenonRevokeProbe?.server?.close(),
    ]);
    return true;
  })()`).catch(() => {});
  client?.destroy();
  if (port) await execFileAsync(adbPath, ['-s', serial, 'forward', '--remove', `tcp:${port}`]).catch(() => {});
  cdp.close();
}
