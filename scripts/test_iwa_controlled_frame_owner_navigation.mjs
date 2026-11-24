#!/usr/bin/env node
// Bounded emulator check: owner navigation must destroy its Controlled Frame
// guest, and a fresh app-owned launch must recover the same partition scope.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const [baseUrl, adbPath, serial] = process.argv.slice(2);
if (!baseUrl || !adbPath || !serial) {
  throw new Error('Usage: test_iwa_controlled_frame_owner_navigation.mjs CDP_URL ADB SERIAL');
}
const iwaOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
const googleOrigin = 'https://www.google.com';
const targets = () => fetch(`${baseUrl}/json/list`).then((response) => response.json());
const guestTargets = (list) => list.filter((target) => target.type === 'webview' &&
  target.url.startsWith(`${googleOrigin}/`));
const iwaTarget = (list) => list.find((target) => target.type === 'page' &&
  target.url.startsWith(`${iwaOrigin}/`));

async function initialTargets() {
  for (let i = 0; i < 30; i += 1) {
    try {
      return await targets();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('CDP target list remained unavailable after browser startup');
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 30; i += 1) {
    const result = predicate(await targets());
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout')), 10000);
      socket.addEventListener('message', (event) => {
        const value = JSON.parse(event.data);
        if (value.id !== 1) return;
        clearTimeout(timer);
        resolve(value);
      });
      socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
        expression, returnByValue: true,
      }}));
    });
    if (reply.error || reply.result?.exceptionDetails) {
      throw new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails));
    }
    return reply.result?.result?.value;
  } finally {
    socket.close();
  }
}

const expression = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120; canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ef0'; ctx.fillRect(0, 0, 120, 40);
  ctx.fillStyle = '#123'; ctx.font = '15px Arial';
  ctx.fillText('Xenon noise test', 3, 24);
  let hash = 2166136261;
  for (const byte of ctx.getImageData(0, 0, 120, 40).data) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  }
  return {origin: location.origin, hash};
})()`;

const before = await initialTargets();
const kitchen = iwaTarget(before);
if (!kitchen || kitchen.url !== `${iwaOrigin}/` || guestTargets(before).length) {
  throw new Error('Expected Kitchen Sink home page with no Google guest');
}
let navigatedAway = false;
try {
  await evaluate(kitchen, `location.href = ${JSON.stringify(`${iwaOrigin}/cf.html`)}`);
  const firstGuest = await waitFor((list) => guestTargets(list)[0], 'first Google guest');
  const first = await evaluate(firstGuest, expression);
  if (first.origin !== googleOrigin) throw new Error('First guest origin mismatch');

  const current = await waitFor((list) => iwaTarget(list), 'IWA owner page');
  await evaluate(current, "location.href = 'about:blank'");
  navigatedAway = true;
  await waitFor((list) => !list.some((target) => target.id === firstGuest.id),
    'old guest teardown');
  await waitFor((list) => list.some((target) => target.id === kitchen.id &&
    target.url === 'about:blank'), 'owner leaving IWA');

  await execFileAsync(adbPath, ['-s', serial, 'shell', 'monkey',
    '-p', 'org.agent54.xenon.iwa.kitchensink', '1']);
  const resumed = await waitFor((list) => iwaTarget(list), 'shim owner recovery');
  if (resumed.url !== `${iwaOrigin}/`) {
    throw new Error(`Shim did not recover the installed IWA URL: ${resumed.url}`);
  }
  await evaluate(resumed, `location.href = ${JSON.stringify(`${iwaOrigin}/cf.html`)}`);
  const secondGuest = await waitFor((list) => guestTargets(list).find((target) =>
    target.id !== firstGuest.id), 'new Google guest');
  const second = await evaluate(secondGuest, expression);
  console.log(JSON.stringify({first, second, guestTargetReplaced:
    firstGuest.id !== secondGuest.id}, null, 2));
  if (second.origin !== googleOrigin || second.hash !== first.hash) {
    throw new Error('Partition-scoped noise changed after owner navigation');
  }
} finally {
  const current = iwaTarget(await targets());
  if (current) {
    await evaluate(current, `location.href = ${JSON.stringify(`${iwaOrigin}/`)}`);
  } else if (navigatedAway) {
    await execFileAsync(adbPath, ['-s', serial, 'shell', 'monkey',
      '-p', 'org.agent54.xenon.iwa.kitchensink', '1']);
  }
}
