#!/usr/bin/env node
// Compare one HTTP(S) origin in an ordinary tab and an IWA Controlled Frame.
// Launch the two contexts first; this script only reads their public canvas API.

const cdpBase = process.argv[2] ?? 'http://127.0.0.1:9225';
const expectedOrigin = process.argv[3] ?? 'https://www.google.com';
const targets = await fetch(`${cdpBase}/json/list`).then((response) => response.json());
const ordinary = targets.find((target) =>
  target.type === 'page' && target.url.startsWith(`${expectedOrigin}/`));
const guest = targets.find((target) =>
  target.type === 'webview' && target.url.startsWith(`${expectedOrigin}/`));
if (!ordinary || !guest) {
  throw new Error('Open an ordinary tab and an IWA Controlled Frame at the same origin');
}

const expression = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 40;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ef0';
  context.fillRect(0, 0, 120, 40);
  context.fillStyle = '#123';
  context.font = '15px Arial';
  context.fillText('Xenon noise test', 3, 24);
  const bytes = context.getImageData(0, 0, 120, 40).data;
  let pixelsHash = 2166136261;
  for (const byte of bytes) {
    pixelsHash = Math.imul(pixelsHash ^ byte, 16777619) >>> 0;
  }
  const dataUrl = canvas.toDataURL();
  let dataUrlHash = 2166136261;
  for (let i = 0; i < dataUrl.length; i += 1) {
    dataUrlHash = Math.imul(dataUrlHash ^ dataUrl.charCodeAt(i), 16777619) >>> 0;
  }
  return {origin: location.origin, pixelsHash, dataUrlHash,
    dataUrlLength: dataUrl.length};
})()`;

async function sample(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  try {
    const reply = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10000);
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        resolve(message);
      });
      socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate',
        params: {expression, returnByValue: true}}));
    });
    if (reply.error || reply.result?.exceptionDetails) {
      throw new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails));
    }
    return reply.result?.result?.value;
  } finally {
    socket.close();
  }
}

const ordinaryFirst = await sample(ordinary);
const guestFirst = await sample(guest);
const ordinarySecond = await sample(ordinary);
const guestSecond = await sample(guest);
if (ordinaryFirst?.origin !== expectedOrigin || guestFirst?.origin !== expectedOrigin) {
  throw new Error('The sampled targets are not at the requested origin');
}
for (const [first, second] of [[ordinaryFirst, ordinarySecond],
  [guestFirst, guestSecond]]) {
  if (first.pixelsHash !== second.pixelsHash ||
      first.dataUrlHash !== second.dataUrlHash) {
    throw new Error('A canvas hash changed within one page session');
  }
}
if (ordinaryFirst.pixelsHash === guestFirst.pixelsHash &&
    ordinaryFirst.dataUrlHash === guestFirst.dataUrlHash) {
  throw new Error('Ordinary and Controlled Frame canvas hashes are linked');
}
console.log(JSON.stringify({ordinary: ordinaryFirst, guest: guestFirst,
  ordinaryTargetId: ordinary.id, guestTargetId: guest.id}, null, 2));
