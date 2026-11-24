#!/usr/bin/env node
// Disposable Android-emulator policy probe. Requires a Google ordinary tab,
// Kitchen Sink at its home page, and the test-only policy browser APK.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const phase = process.argv[3];
const rawHash = Number(process.argv[4]);
if (!['blocked', 'reset'].includes(phase) || !Number.isInteger(rawHash)) {
  throw new Error('Usage: node test_iwa_controlled_frame_noise_policy.mjs CDP_URL blocked|reset RAW_HASH');
}

const iwaOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
const googleOrigin = 'https://www.google.com';
const targets = () => fetch(`${baseUrl}/json/list`).then((response) => response.json());

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
  canvas.width = 120;
  canvas.height = 40;
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
const kitchen = before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${iwaOrigin}/`));
const ordinary = before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${googleOrigin}/`));
const priorGuests = before.filter((target) => target.type === 'webview' &&
  target.url.startsWith(`${googleOrigin}/`));
if (!kitchen || !ordinary || priorGuests.length !== 0 ||
    kitchen.url !== `${iwaOrigin}/`) {
  throw new Error('Expected Kitchen Sink home, one ordinary Google tab, and no Google guests');
}

try {
  await evaluate(kitchen, `location.href = ${JSON.stringify(`${iwaOrigin}/cf.html`)}`);
  let guest;
  for (let i = 0; i < 30; i += 1) {
    guest = (await targets()).find((target) => target.type === 'webview' &&
      target.url.startsWith(`${googleOrigin}/`));
    if (guest) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!guest) throw new Error('Controlled Frame guest did not load');
  const samples = {
    ordinary: await evaluate(ordinary, expression),
    guest: await evaluate(guest, expression),
  };
  const again = {
    ordinary: await evaluate(ordinary, expression),
    guest: await evaluate(guest, expression),
  };
  console.log(JSON.stringify({phase, samples, again}, null, 2));
  if (samples.ordinary.origin !== googleOrigin ||
      samples.guest.origin !== googleOrigin ||
      samples.ordinary.hash !== again.ordinary.hash ||
      samples.guest.hash !== again.guest.hash) {
    throw new Error('Origin or per-page stability check failed');
  }
  if ((phase === 'blocked') !== (samples.ordinary.hash === rawHash)) {
    throw new Error('Ordinary-site exception did not produce expected raw/noisy output');
  }
  if (samples.guest.hash === rawHash ||
      samples.guest.hash === samples.ordinary.hash) {
    throw new Error('Validated Controlled Frame guest lost its independent noise');
  }
} finally {
  const current = (await targets()).find((target) => target.type === 'page' &&
    target.url.startsWith(`${iwaOrigin}/`));
  if (current) {
    await evaluate(current, `location.href = ${JSON.stringify(`${iwaOrigin}/`)}`);
  }
}
