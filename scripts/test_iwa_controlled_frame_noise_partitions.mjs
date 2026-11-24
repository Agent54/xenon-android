#!/usr/bin/env node
// Self-contained same-origin browser check on the signed Kitchen Sink IWA.
// Creates only a temporary ordinary tab and guest, then removes what it owns.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const iwaPrefix = 'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic/';
const googlePrefix = 'https://www.google.com/';
const targets = async () => {
  const response = await fetch(`${baseUrl}/json/list`, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  return response.json();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iwaTarget = (list) => list.find((target) => target.type === 'page' &&
  target.url.startsWith(iwaPrefix));
const googleTabs = (list) => list.filter((target) => target.type === 'page' &&
  target.url.startsWith(googlePrefix));
const googleGuests = (list) => list.filter((target) => target.type === 'webview' &&
  target.url.startsWith(googlePrefix));

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = predicate(await targets());
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function browserCommand(method, params) {
  const response = await fetch(`${baseUrl}/json/version`,
    {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`CDP browser endpoint failed: ${response.status}`);
  const version = await response.json();
  if (version['Android-Package'] !== 'org.agent54.xenon.iwa') {
    throw new Error('Refusing to create a tab outside the experimental browser');
  }
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true});
      socket.addEventListener('error', reject, {once: true});
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10000);
      socket.addEventListener('message', (event) => {
        const reply = JSON.parse(event.data);
        if (reply.id !== 1) return;
        clearTimeout(timer);
        if (reply.error) reject(new Error(JSON.stringify(reply.error)));
        else resolve(reply.result);
      });
      socket.send(JSON.stringify({id: 1, method, params}));
    });
  } finally {
    socket.close();
  }
}

async function evaluate(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, {once: true});
      ws.addEventListener('error', reject, {once: true});
    });
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
  const shape = document.createElement('canvas');
  shape.width = 120; shape.height = 40;
  const shapeCtx = shape.getContext('2d');
  shapeCtx.fillStyle = '#ef0'; shapeCtx.fillRect(0, 0, 120, 40);
  shapeCtx.fillStyle = '#123'; shapeCtx.fillRect(7, 5, 76, 19);
  shapeCtx.fillStyle = '#49a';
  shapeCtx.beginPath(); shapeCtx.arc(93, 19, 11, 0, 2 * Math.PI);
  shapeCtx.fill();
  let shapeHash = 2166136261;
  for (const byte of shapeCtx.getImageData(0, 0, 120, 40).data) {
    shapeHash = Math.imul(shapeHash ^ byte, 16777619) >>> 0;
  }
  return {origin: location.origin, readyState: document.readyState,
    fontStatus: document.fonts.status, hash, shapeHash};
})()`;

async function readySample(target) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const sample = await evaluate(target, expression);
    if (sample?.readyState !== 'loading' && sample?.fontStatus === 'loaded') {
      await sleep(100);
      const repeat = await evaluate(target, expression);
      if (repeat.hash !== sample.hash || repeat.shapeHash !== sample.shapeHash) {
        throw new Error('Canvas changed within one ready page');
      }
      return sample;
    }
    await sleep(100);
  }
  throw new Error(`Target ${target.id} did not become ready`);
}

const before = await targets();
let iwa = iwaTarget(before);
if (!iwa || ![iwaPrefix, `${iwaPrefix}cf.html`].includes(iwa.url) ||
    googleTabs(before).length > 1 || googleGuests(before).length > 1) {
  throw new Error('Expected one Kitchen Sink home/CF page and at most one Google tab/guest');
}
if (iwa.url === iwaPrefix && googleGuests(before).length !== 0) {
  throw new Error('A Google guest exists outside Kitchen Sink CF; refusing ambiguous ownership');
}
let ordinary = googleTabs(before)[0];
let existingGuest = googleGuests(before)[0];
let createdOrdinaryId;
let navigatedIwa = false;
let newGuest;
try {
  if (!existingGuest) {
    if (iwa.url !== iwaPrefix) throw new Error('CF page has no guest');
    await evaluate(iwa, `location.href = ${JSON.stringify(`${iwaPrefix}cf.html`)}`);
    navigatedIwa = true;
    existingGuest = await waitFor((list) => googleGuests(list).length === 1 &&
      googleGuests(list)[0], 'first Google guest');
  }
  if (!ordinary) {
    const created = await browserCommand('Target.createTarget', {url: googlePrefix});
    createdOrdinaryId = created.targetId;
    ordinary = await waitFor((list) => googleTabs(list).find((target) =>
      target.id === createdOrdinaryId), 'temporary ordinary Google tab');
  }
  iwa = await waitFor((list) => iwaTarget(list), 'Kitchen Sink CF owner');
  await evaluate(iwa, `(() => {
    const frame = document.createElement('controlledframe');
    frame.id = 'xenon-noise-partition-probe';
    frame.setAttribute('partition', 'xenon-noise-ephemeral');
    frame.src = 'https://www.google.com/';
    document.body.append(frame);
    return frame.outerHTML;
  })()`);
  newGuest = await waitFor((list) => googleGuests(list).length === 2 &&
    googleGuests(list).find((target) => target.id !== existingGuest.id),
  'second partition guest');
  const samples = {
    ordinary: await readySample(ordinary),
    firstGuest: await readySample(existingGuest),
    secondGuest: await readySample(newGuest),
  };
  console.log(JSON.stringify(samples, null, 2));
  if (Object.values(samples).some((sample) =>
    sample.origin !== 'https://www.google.com')) {
    throw new Error('Probe origins did not match');
  }
  if (new Set(Object.values(samples).map((sample) => sample.hash)).size !== 3) {
    throw new Error('Text canvas noise outputs are linked across partitions or tab');
  }
  if (new Set(Object.values(samples).map((sample) => sample.shapeHash)).size !== 3) {
    throw new Error('Font-free canvas noise outputs are linked across partitions or tab');
  }
} finally {
  try {
    const current = iwaTarget(await targets());
    if (current) {
      await evaluate(current, "document.getElementById('xenon-noise-partition-probe')?.remove()");
      if (navigatedIwa) {
        await evaluate(current, `location.href = ${JSON.stringify(iwaPrefix)}`);
      }
    }
  } finally {
    if (createdOrdinaryId) {
      const closed = await browserCommand('Target.closeTarget',
        {targetId: createdOrdinaryId});
      if (!closed.success) throw new Error('Could not close temporary ordinary tab');
    }
  }
}
