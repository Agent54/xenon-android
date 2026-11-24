#!/usr/bin/env node
// Requires an ordinary Google tab, the disposable signed CF-noise IWA, and
// Kitchen Sink installed in the same experimental browser profile.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const secondIwaId = process.argv[3];
if (!secondIwaId) throw new Error('Pass the disposable signed IWA bundle ID');
const kitchenOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
const secondOrigin = `isolated-app://${secondIwaId}`;
const targets = () => fetch(`${baseUrl}/json/list`).then((response) => response.json());

async function evaluate(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout')), 10000);
      ws.addEventListener('message', (event) => {
        const value = JSON.parse(event.data);
        if (value.id !== 1) return;
        clearTimeout(timer);
        resolve(value);
      });
      ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
        expression, returnByValue: true,
      }}));
    });
    if (reply.error || reply.result?.exceptionDetails) {
      throw new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails));
    }
    return reply.result?.result?.value;
  } finally {
    ws.close();
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

const before = await targets();
const ordinary = before.find((target) => target.type === 'page' &&
  target.url.startsWith('https://www.google.com/'));
const secondIwa = before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${secondOrigin}/`));
const kitchen = before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${kitchenOrigin}/`));
const secondGuest = before.find((target) => target.type === 'webview' &&
  target.url.startsWith('https://www.google.com/'));
if (!ordinary || !secondIwa || !kitchen || !secondGuest) {
  throw new Error('Missing ordinary tab, IWA pages, or first guest');
}
if (await evaluate(secondIwa, "document.querySelector('controlledframe#cf')?.src") !==
    'https://www.google.com/') {
  throw new Error('Disposable IWA does not own its Google Controlled Frame');
}

const originalKitchenUrl = kitchen.url;
let kitchenGuest;
try {
  await evaluate(kitchen, `location.href = ${JSON.stringify(`${kitchenOrigin}/cf.html`)}`);
  for (let i = 0; i < 30; i += 1) {
    const current = await targets();
    kitchenGuest = current.find((target) => target.type === 'webview' &&
      target.url.startsWith('https://www.google.com/') &&
      target.id !== secondGuest.id);
    if (kitchenGuest) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!kitchenGuest) throw new Error('Kitchen Sink guest did not load');
  const samples = {
    ordinary: await evaluate(ordinary, expression),
    secondIwaGuest: await evaluate(secondGuest, expression),
    kitchenGuest: await evaluate(kitchenGuest, expression),
  };
  const stable = {
    secondIwaGuest: await evaluate(secondGuest, expression),
    kitchenGuest: await evaluate(kitchenGuest, expression),
  };
  console.log(JSON.stringify({samples, stable}, null, 2));
  if (Object.values(samples).some((sample) =>
    sample.origin !== 'https://www.google.com')) {
    throw new Error('Probe origins did not match');
  }
  if (new Set(Object.values(samples).map((sample) => sample.hash)).size !== 3) {
    throw new Error('Noise outputs are linked across owning IWAs or ordinary tab');
  }
  if (samples.secondIwaGuest.hash !== stable.secondIwaGuest.hash ||
      samples.kitchenGuest.hash !== stable.kitchenGuest.hash) {
    throw new Error('Noise outputs changed within a guest');
  }
} finally {
  const currentKitchen = (await targets()).find((target) => target.id === kitchen.id);
  if (currentKitchen && currentKitchen.url.startsWith(kitchenOrigin)) {
    await evaluate(currentKitchen,
      `location.href = ${JSON.stringify(originalKitchenUrl)}`);
  }
}
