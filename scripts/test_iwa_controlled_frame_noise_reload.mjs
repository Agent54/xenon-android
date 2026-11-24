#!/usr/bin/env node
// Run with the disposable signed IWA's Google guest active in the emulator.
// This checks token stability through a guest document reload, not a browser
// restart or a newly allocated guest partition.

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:9225';
const guestId = process.argv[3];
if (!guestId) throw new Error('Pass the exact Google guest CDP target ID');
const targets = () => fetch(`${baseUrl}/json/list`).then((response) => response.json());

async function call(target, method, params = {}) {
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
      ws.send(JSON.stringify({id: 1, method, params}));
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

const initialTargets = await targets();
const before = initialTargets.find((target) => target.id === guestId);
if (!before || before.type !== 'webview' ||
    !before.url.startsWith('https://www.google.com/')) {
  throw new Error('Target is not the expected Google Controlled Frame guest');
}
if (initialTargets.filter((target) => target.type === 'webview' &&
    target.url.startsWith('https://www.google.com/')).length !== 1) {
  throw new Error('Reload probe requires exactly one Google guest');
}
const first = await call(before, 'Runtime.evaluate', {
  expression, returnByValue: true,
});
await call(before, 'Page.reload', {ignoreCache: true});
let after;
for (let i = 0; i < 30; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const current = (await targets()).find((target) => target.type === 'webview' &&
    target.url.startsWith('https://www.google.com/'));
  if (!current) continue;
  try {
    after = await call(current, 'Runtime.evaluate', {
      expression, returnByValue: true,
    });
    if (after?.origin === 'https://www.google.com') break;
  } catch {
    // The guest may still be replacing its execution context.
  }
}
console.log(JSON.stringify({first, after}, null, 2));
if (!after || first.origin !== 'https://www.google.com' ||
    after.origin !== first.origin || after.hash !== first.hash) {
  throw new Error('Canvas noise was not stable across guest reload');
}
