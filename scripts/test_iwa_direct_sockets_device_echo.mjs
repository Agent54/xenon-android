#!/usr/bin/env node

// Bounded physical-device canary: only this host's explicitly named interface.
import dgram from 'node:dgram';
import net from 'node:net';
import {networkInterfaces} from 'node:os';

const [baseUrl, origin, hostAddress] = process.argv.slice(2);
if (!baseUrl || !origin || !hostAddress) {
  throw new Error('usage: test_iwa_direct_sockets_device_echo.mjs CDP_URL IWA_ORIGIN HOST_INTERFACE_IPV4');
}
const localAddresses = Object.values(networkInterfaces()).flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
if (!localAddresses.includes(hostAddress)) {
  throw new Error(`HOST_INTERFACE_IPV4 is not a local interface: ${hostAddress}`);
}

const targets = await fetch(`${baseUrl}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.url.startsWith(origin));
if (!target) throw new Error(`No IWA target for ${origin}`);
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  cdp.addEventListener('open', resolve, {once: true});
  cdp.addEventListener('error', reject, {once: true});
});

let requestId = 0;
function evaluate(expression) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cdp.removeEventListener('message', onMessage);
      reject(new Error('CDP evaluation timed out; check the device consent prompt'));
    }, 45000);
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
    cdp.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: {expression, returnByValue: true, awaitPromise: true},
    }));
  });
}

const acceptedSockets = new Set();
const tcpServer = net.createServer((socket) => {
  acceptedSockets.add(socket);
  socket.once('close', () => acceptedSockets.delete(socket));
  socket.pipe(socket);
});
const udpServer = dgram.createSocket('udp4');
let udpBound = false;
udpServer.on('message', (message, sender) => {
  udpServer.send(message, sender.port, sender.address);
});
try {
  await new Promise((resolve, reject) => {
    tcpServer.once('error', reject);
    tcpServer.listen(0, hostAddress, resolve);
  });
  await new Promise((resolve, reject) => {
    udpServer.once('error', reject);
    udpServer.bind(0, hostAddress, resolve);
  });
  udpBound = true;
  const tcpPort = tcpServer.address().port;
  const udpPort = udpServer.address().port;
  console.log(JSON.stringify({phase: 'tcp', hostAddress, port: tcpPort}));
  const tcp = await evaluate(`(async () => {
    const socket = new TCPSocket('${hostAddress}', ${tcpPort});
    try {
      const {readable, writable} = await socket.opened;
      const writer = writable.getWriter();
      const reader = readable.getReader();
      const marker = 'xenon-device-tcp';
      await writer.write(new TextEncoder().encode(marker));
      const {value, done} = await reader.read();
      writer.releaseLock();
      reader.releaseLock();
      return {done, echo: new TextDecoder().decode(value)};
    } finally {
      await socket.close().catch(() => {});
    }
  })()`);
  if (tcp.done || tcp.echo !== 'xenon-device-tcp') {
    throw new Error(`TCP echo mismatch: ${JSON.stringify(tcp)}`);
  }

  console.log(JSON.stringify({phase: 'udp', hostAddress, port: udpPort}));
  const udp = await evaluate(`(async () => {
    const socket = new UDPSocket({remoteAddress: '${hostAddress}', remotePort: ${udpPort}});
    try {
      const {readable, writable} = await socket.opened;
      const writer = writable.getWriter();
      const reader = readable.getReader();
      const marker = 'xenon-device-udp';
      await writer.write({data: new TextEncoder().encode(marker)});
      const {value, done} = await reader.read();
      writer.releaseLock();
      reader.releaseLock();
      return {done, echo: new TextDecoder().decode(value.data)};
    } finally {
      await socket.close().catch(() => {});
    }
  })()`);
  if (udp.done || udp.echo !== 'xenon-device-udp') {
    throw new Error(`UDP echo mismatch: ${JSON.stringify(udp)}`);
  }
  console.log(JSON.stringify({tcpEcho: true, udpEcho: true, hostAddress}));
} finally {
  for (const socket of acceptedSockets) socket.destroy();
  if (udpBound) udpServer.close();
  await new Promise((resolve) => tcpServer.close(resolve));
  cdp.close();
}
