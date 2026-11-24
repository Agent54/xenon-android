#!/usr/bin/env node
// Requires an ordinary Google tab and Kitchen Sink's Google Controlled Frame.
// Pass a second signed IWA bundle ID for the cross-owner test, or --single-iwa
// to test one guest (for example on a physical device). This uses
// OfflineAudioContext only; it never records or plays device audio.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const secondIwaId = process.argv[3] === '--single-iwa' ? null : process.argv[3];
const expectDisabled = process.argv.includes('--expect-disabled');
if (!secondIwaId && process.argv[3] !== '--single-iwa') {
  throw new Error('Pass the second signed IWA bundle ID or --single-iwa');
}
const kitchenOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
const secondOrigin = secondIwaId ? `isolated-app://${secondIwaId}` : null;
const targets = () => fetch(`${baseUrl}/json/list`).then((response) => response.json());

async function evaluate(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout')), 30000);
      ws.addEventListener('message', (event) => {
        const value = JSON.parse(event.data);
        if (value.id !== 1) return;
        clearTimeout(timer);
        resolve(value);
      });
      ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
        expression, awaitPromise: true, returnByValue: true,
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

const audioExpression = `(async () => {
  const context = new OfflineAudioContext(1, 8192, 44100);
  const source = new ConstantSourceNode(context, {offset: 0.5});
  source.connect(context.destination);
  source.start();
  const samples = (await context.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset,
    samples.byteLength);
  let sum = 0, nonRaw = 0, hash = 2166136261;
  for (const sample of samples) {
    sum += sample;
    if (sample !== 0.5) nonRaw += 1;
  }
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return {origin: location.origin, mean: sum / samples.length,
    nonRaw, hash};
})()`;

const before = await targets();
const ordinary = before.find((target) => target.type === 'page' &&
  target.url.startsWith('https://www.google.com/'));
const secondIwa = secondOrigin ? before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${secondOrigin}/`)) : null;
const kitchen = before.find((target) => target.type === 'page' &&
  target.url.startsWith(`${kitchenOrigin}/`));
if (!secondIwaId && before.some((target) => target.type === 'page' &&
    target.url.startsWith('isolated-app://') &&
    !target.url.startsWith(`${kitchenOrigin}/`))) {
  throw new Error('Single-IWA mode found another open IWA');
}
const googleGuests = before.filter((target) => target.type === 'webview' &&
  target.url.startsWith('https://www.google.com/'));
if (!secondIwaId && googleGuests.length !== 1) {
  throw new Error('Single-IWA mode requires exactly one Google guest');
}
const firstGuest = googleGuests[0];
if (!ordinary || !kitchen || !firstGuest || (secondIwaId && !secondIwa)) {
  throw new Error('Missing ordinary tab, IWA page, or Google guest');
}
if (secondIwa && await evaluate(secondIwa,
    "document.querySelector('controlledframe#cf')?.src") !==
      'https://www.google.com/') {
  throw new Error('Disposable IWA does not own its Google Controlled Frame');
}
if (!secondIwa && (kitchen.url !== `${kitchenOrigin}/cf.html` ||
    await evaluate(kitchen, "document.querySelector('controlledframe')?.src") !==
      'https://www.google.com/')) {
  throw new Error('Kitchen Sink is not showing its Google Controlled Frame');
}

const originalKitchenUrl = kitchen.url;
try {
  let contexts;
  if (secondIwa) {
    await evaluate(kitchen,
      `location.href = ${JSON.stringify(`${kitchenOrigin}/cf.html`)}`);
    let kitchenGuest;
    for (let i = 0; i < 30; i += 1) {
      const current = await targets();
      kitchenGuest = current.find((target) => target.type === 'webview' &&
        target.url.startsWith('https://www.google.com/') &&
        target.id !== firstGuest.id);
      if (kitchenGuest) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!kitchenGuest) throw new Error('Kitchen Sink guest did not load');
    contexts = {ordinary, secondIwaGuest: firstGuest, kitchenGuest};
  } else {
    contexts = {ordinary, kitchenGuest: firstGuest};
  }
  const samples = {};
  const stable = {};
  for (const [name, target] of Object.entries(contexts)) {
    samples[name] = await evaluate(target, audioExpression);
    stable[name] = await evaluate(target, audioExpression);
  }
  console.log(JSON.stringify({samples, stable, expectDisabled}, null, 2));
  if (Object.values(samples).some((sample) =>
    sample.origin !== 'https://www.google.com')) {
    throw new Error('Probe origins did not match');
  }
  if (expectDisabled) {
    if (Object.values(samples).some((sample) =>
      sample.nonRaw !== 0 || sample.mean !== 0.5) ||
        new Set(Object.values(samples).map((sample) => sample.hash)).size !== 1) {
      throw new Error('Feature-disabled offline audio was not raw and equal');
    }
  } else if (Object.values(samples).some((sample) => sample.nonRaw === 0) ||
      new Set(Object.values(samples).map((sample) =>
        Math.round(sample.mean * 1e6))).size !== Object.keys(contexts).length ||
      Object.entries(samples).some(([name, sample]) =>
        Math.abs(sample.mean - stable[name].mean) > 1e-6)) {
    // Helium's per-render coordinate jitter changes the exact buffer hash;
    // the many-sample mean isolates its stable per-token component.
    throw new Error('Audio noise is absent, linked, or unstable in mean');
  }
} finally {
  const currentKitchen = (await targets()).find((target) => target.id === kitchen.id);
  if (secondIwa && currentKitchen &&
      currentKitchen.url.startsWith(kitchenOrigin)) {
    await evaluate(currentKitchen,
      `location.href = ${JSON.stringify(originalKitchenUrl)}`);
  }
}
