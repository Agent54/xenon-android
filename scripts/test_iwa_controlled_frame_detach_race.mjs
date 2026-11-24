#!/usr/bin/env node
// Bounded Android emulator regression: tear down a Controlled Frame while its
// guest is busy, then recover the app-owned IWA. No profile settings change.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const [baseUrl, adbPath, serial, countArg = '5'] = process.argv.slice(2);
const iterations = Number(countArg);
if (!baseUrl || !adbPath || !/^emulator-\d+$/.test(serial ?? '') ||
    !Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
  throw new Error('Usage: test_iwa_controlled_frame_detach_race.mjs CDP_URL ADB emulator-SERIAL [1..20]');
}

const iwaOrigin =
  'isolated-app://b7looprugym3zyxqffzqdz4mzc2vz4j6ge3arxg2ybbzwgb6ne2qaaic';
const googleOrigin = 'https://www.google.com';
const targets = async () => {
  const response = await fetch(`${baseUrl}/json/list`, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  return response.json();
};
const owner = (list) => list.find((target) => target.type === 'page' &&
  target.url.startsWith(`${iwaOrigin}/`));
const guests = (list) => list.filter((target) => target.type === 'webview' &&
  target.url.startsWith(`${googleOrigin}/`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = predicate(await targets());
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true});
      socket.addEventListener('error', reject, {once: true});
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP evaluation timed out')), 10000);
      const finish = (result, error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      socket.addEventListener('close', () => finish(null, new Error('Guest target detached')),
        {once: true});
      socket.addEventListener('message', (event) => {
        const reply = JSON.parse(event.data);
        if (reply.id !== 1) return;
        if (reply.error || reply.result?.exceptionDetails) {
          finish(null, new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails)));
        } else {
          finish(reply.result?.result?.value);
        }
      });
      socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
        expression, awaitPromise, returnByValue: true,
      }}));
    });
  } finally {
    socket.close();
  }
}

async function browserPid() {
  const {stdout} = await execFileAsync(adbPath, ['-s', serial, 'shell', 'pidof',
    'org.agent54.xenon.iwa']);
  const pid = stdout.trim();
  if (!/^\d+$/.test(pid)) throw new Error(`Browser main-process PID invalid: ${pid}`);
  return pid;
}

async function launchShim() {
  await execFileAsync(adbPath, ['-s', serial, 'shell', 'monkey',
    '-p', 'org.agent54.xenon.iwa.kitchensink', '1']);
  return waitFor((list) => owner(list), 'app-owned shim recovery');
}

async function readyGuestSample(target) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const sample = await evaluate(target, hashExpression);
    if (sample?.origin === googleOrigin && sample.readyState !== 'loading') {
      await sleep(100);
      const repeat = await evaluate(target, hashExpression);
      if (repeat.hash !== sample.hash || repeat.shapeHash !== sample.shapeHash) {
        throw new Error(JSON.stringify({reason: 'Canvas changed within one ready guest',
          first: sample, repeat, guestId: target.id}));
      }
      return sample;
    }
    await sleep(100);
  }
  throw new Error(`Google guest ${target.id} did not become interactive`);
}

const hashExpression = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120; canvas.height = 40;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ef0'; context.fillRect(0, 0, 120, 40);
  context.fillStyle = '#123'; context.font = '15px Arial';
  context.fillText('Xenon noise test', 3, 24);
  let hash = 2166136261;
  for (const byte of context.getImageData(0, 0, 120, 40).data) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  }
  const shape = document.createElement('canvas');
  shape.width = 120; shape.height = 40;
  const shapeContext = shape.getContext('2d');
  shapeContext.fillStyle = '#ef0'; shapeContext.fillRect(0, 0, 120, 40);
  shapeContext.fillStyle = '#123'; shapeContext.fillRect(7, 5, 76, 19);
  shapeContext.fillStyle = '#49a';
  shapeContext.beginPath(); shapeContext.arc(93, 19, 11, 0, 2 * Math.PI);
  shapeContext.fill();
  let shapeHash = 2166136261;
  for (const byte of shapeContext.getImageData(0, 0, 120, 40).data) {
    shapeHash = Math.imul(shapeHash ^ byte, 16777619) >>> 0;
  }
  return {origin: location.origin, href: location.href,
    readyState: document.readyState, fontStatus: document.fonts.status,
    hash, shapeHash};
})()`;

const initial = await targets();
if (guests(initial).length !== 0 || owner(initial)?.url !== `${iwaOrigin}/`) {
  throw new Error('Expected Kitchen Sink home with no Google guest; refusing to alter other tabs');
}
const initialPid = await browserPid();
const results = [];
try {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const kitchen = await waitFor((list) => owner(list)?.url === `${iwaOrigin}/` &&
      guests(list).length === 0 && owner(list), 'Kitchen Sink home');
    await evaluate(kitchen, `location.href = ${JSON.stringify(`${iwaOrigin}/cf.html`)}`);
    const guest = await waitFor((list) => guests(list).length === 1 && guests(list)[0],
      'one Google guest');
    const early = await evaluate(guest, hashExpression);
    const before = await readyGuestSample(guest);
    if (before?.origin !== googleOrigin) throw new Error('Guest origin mismatch');

    // Alternate a busy renderer with a same-origin guest navigation. The
    // latter exercises the browser's navigation-time guest-scope decision.
    const mode = iteration % 2 === 0 ? 'busy-renderer' : 'guest-navigation';
    const expression = mode === 'busy-renderer'
      ? 'new Promise(resolve => setTimeout(() => resolve(location.origin), 200))'
      : `location.href = ${JSON.stringify(
        `${googleOrigin}/?xenon_cf_detach_race=${iteration}`)};
         new Promise(resolve => setTimeout(() => resolve(location.origin), 200))`;
    // Rejection because the browser-owned guest detaches is expected.
    const busyGuest = evaluate(guest, expression, true)
      .then(() => 'completed', () => 'detached');
    await sleep(5);
    const current = await waitFor((list) => owner(list), 'IWA owner before detach');
    await evaluate(current, "location.href = 'about:blank'");
    await waitFor((list) => guests(list).length === 0, 'all old guests removed');
    await waitFor((list) => list.some((target) => target.id === current.id &&
      target.url === 'about:blank'), 'owner about:blank');
    const guestWork = await busyGuest;
    if (await browserPid() !== initialPid) {
      throw new Error('Experimental browser main process changed during guest teardown');
    }

    const recovered = await launchShim();
    if (recovered.url !== `${iwaOrigin}/`) throw new Error('Shim recovered wrong URL');
    await evaluate(recovered, `location.href = ${JSON.stringify(`${iwaOrigin}/cf.html`)}`);
    const recreated = await waitFor((list) => guests(list).length === 1 &&
      guests(list)[0].id !== guest.id && guests(list)[0], 'new Google guest');
    const after = await readyGuestSample(recreated);
    if (after?.origin !== googleOrigin || after.hash !== before.hash ||
        after.shapeHash !== before.shapeHash) {
      await sleep(250);
      const afterRetry = await evaluate(recreated, hashExpression).catch(
        (error) => ({error: String(error)}));
      throw new Error(JSON.stringify({reason: 'Guest scope changed after teardown/recovery',
        iteration: iteration + 1, mode, browserPid: await browserPid(),
        early, before, after, afterRetry, oldGuest: {id: guest.id, url: guest.url},
        newGuest: {id: recreated.id, url: recreated.url}}));
    }
    const finalOwner = await waitFor((list) => owner(list), 'recovered IWA owner');
    await evaluate(finalOwner, `location.href = ${JSON.stringify(`${iwaOrigin}/`)}`);
    await waitFor((list) => guests(list).length === 0, 'recreated guest cleanup');
    const result = {iteration: iteration + 1, mode, earlyHash: early.hash,
      readyHash: before.hash, shapeHash: before.shapeHash, guestWork};
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  const current = owner(await targets());
  if (current && current.url !== `${iwaOrigin}/`) {
    await evaluate(current, `location.href = ${JSON.stringify(`${iwaOrigin}/`)}`);
  } else if (!current) {
    const recovered = await launchShim();
    if (recovered.url !== `${iwaOrigin}/`) {
      await evaluate(recovered, `location.href = ${JSON.stringify(`${iwaOrigin}/`)}`);
    }
  }
}
console.log(JSON.stringify({initialPid, iterations: results}, null, 2));
