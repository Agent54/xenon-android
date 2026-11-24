#!/usr/bin/env node
// Requires installed Kitchen Sink and an ordinary experimental browser profile.
// The test creates, removes, and recreates one named in-memory Google guest.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const kitchenOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
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
const googleGuests = (list) => list.filter((target) =>
  target.type === 'webview' && target.url.startsWith('https://www.google.com/'));
const waitFor = async (predicate, description) => {
  for (let i = 0; i < 30; i += 1) {
    const result = predicate(await targets());
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const kitchen = (await targets()).find((target) => target.type === 'page' &&
  target.url.startsWith(`${kitchenOrigin}/`));
if (!kitchen) throw new Error('Kitchen Sink page is missing');
const originalUrl = kitchen.url;
let created = false;
try {
  if (!kitchen.url.endsWith('/cf.html')) {
    await evaluate(kitchen, `location.href = ${JSON.stringify(`${kitchenOrigin}/cf.html`)}`);
    await waitFor((list) => list.find((target) => target.id === kitchen.id &&
      target.url.endsWith('/cf.html')), 'Kitchen Sink Controlled Frame page');
  }
  const baseline = new Set(googleGuests(await targets()).map((target) => target.id));
  const attach = `(() => {
    const frame = document.createElement('controlledframe');
    frame.id = 'xenon-noise-recreation-probe';
    frame.setAttribute('partition', 'xenon-noise-recreate');
    frame.src = 'https://www.google.com/';
    document.body.append(frame);
    return frame.outerHTML;
  })()`;
  const currentKitchen = () => targets().then((list) =>
    list.find((target) => target.id === kitchen.id));
  await evaluate(await currentKitchen(), attach);
  created = true;
  const firstTarget = await waitFor((list) => googleGuests(list).find((target) =>
    !baseline.has(target.id)), 'first named guest');
  const first = await evaluate(firstTarget, expression);
  await evaluate(await currentKitchen(),
    "document.getElementById('xenon-noise-recreation-probe')?.remove()");
  await waitFor((list) => !list.some((target) => target.id === firstTarget.id),
    'first guest teardown');
  created = false;
  await evaluate(await currentKitchen(), attach);
  created = true;
  const secondTarget = await waitFor((list) => googleGuests(list).find((target) =>
    !baseline.has(target.id) && target.id !== firstTarget.id),
  'recreated named guest');
  const second = await evaluate(secondTarget, expression);
  console.log(JSON.stringify({first, second, targetReplaced:
    firstTarget.id !== secondTarget.id}, null, 2));
  if (first.origin !== 'https://www.google.com' ||
      second.origin !== first.origin || first.hash !== second.hash) {
    throw new Error('Noise changed across recreation of the same guest partition');
  }
} finally {
  const current = (await targets()).find((target) => target.id === kitchen.id);
  if (current && current.url.startsWith(kitchenOrigin)) {
    if (created) {
      await evaluate(current,
        "document.getElementById('xenon-noise-recreation-probe')?.remove()");
    }
    if (originalUrl !== current.url) {
      await evaluate(current, `location.href = ${JSON.stringify(originalUrl)}`);
    }
  }
}
