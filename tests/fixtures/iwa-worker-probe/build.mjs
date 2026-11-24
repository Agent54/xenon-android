#!/usr/bin/env node
// Build a disposable, signed IWA to probe dedicated-worker Direct Sockets.
// The signing key exists only in this process. Never use this bundle as a
// persistent app or store the generated bundle in Git.

import {generateKeyPairSync} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import * as wbn from 'wbn';
import * as wbnSign from 'wbn-sign';

const output = process.argv[2];
if (!output) {
  console.error('Usage: node build.mjs OUTPUT.swbn');
  process.exit(2);
}

const {privateKey} = generateKeyPairSync('ed25519');
const id = new wbnSign.WebBundleId(privateKey).serialize();
const origin = `isolated-app://${id}`;
const builder = new wbn.BundleBuilder();
const headers = (type) => ({
  'content-type': type,
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "base-uri 'none'; default-src 'self'; object-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'self'",
});
const add = (path, type, body) =>
  builder.addExchange(`${origin}${path}`, 200, headers(type), body);

add('/', 'text/html', `<!doctype html><html><head><meta charset="utf-8"><title>Xenon IWA worker probe</title><link rel="manifest" href="/.well-known/manifest.webmanifest"><script type="module" src="/main.js"></script></head><body><h1>Xenon IWA worker probe</h1><p id="status">pending</p></body></html>`);
add('/.well-known/manifest.webmanifest', 'application/manifest+json', JSON.stringify({
  name: 'Xenon IWA worker probe',
  short_name: 'IWA worker probe',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  version: '1.0.0',
  icons: [{src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml'}],
  permissions_policy: {
    'cross-origin-isolated': ['self'],
    'direct-sockets': ['self'],
    'direct-sockets-private': ['self'],
    'local-network': ['self'],
    'loopback-network': ['self'],
  },
}));
add('/icon.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#172554"/><circle cx="96" cy="96" r="62" fill="#38bdf8"/></svg>');
add('/main.js', 'text/javascript', `
window.probe = {parent: {tcp: typeof TCPSocket, tcpServer: typeof TCPServerSocket, udp: typeof UDPSocket}, worker: 'pending'};
const policy = trustedTypes.createPolicy('xenon-worker-probe', {createScriptURL: value => value});
const worker = new Worker(policy.createScriptURL('/worker.js'));
worker.onmessage = event => { window.probe.worker = event.data; document.getElementById('status').textContent = JSON.stringify(window.probe); };
worker.onerror = event => { window.probe.worker = {error: event.message}; document.getElementById('status').textContent = JSON.stringify(window.probe); };
`);
add('/worker.js', 'text/javascript', 'self.postMessage({tcp: typeof TCPSocket, tcpServer: typeof TCPServerSocket, udp: typeof UDPSocket});');

const signed = await wbnSign.SignedWebBundle.fromWebBundle(builder.createBundle(), [
  new wbnSign.NodeCryptoSigningStrategy(privateKey),
]);
writeFileSync(output, signed.getSignedWebBundleBytes());
console.log(JSON.stringify({id, origin, output}));
