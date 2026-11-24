#!/usr/bin/env node
// Disposable signed IWA for cross-owner Controlled Frame privacy checks.
// The signing key exists only in this process; do not commit the bundle.

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
  'content-security-policy': "base-uri 'none'; default-src 'self'; object-src 'none'; script-src 'self'; frame-src https://www.google.com",
});
const add = (path, type, body) =>
  builder.addExchange(`${origin}${path}`, 200, headers(type), body);

add('/', 'text/html', `<!doctype html><html><head><meta charset="utf-8"><title>Xenon Controlled Frame noise probe</title><link rel="manifest" href="/.well-known/manifest.webmanifest"></head><body><h1>Controlled Frame noise probe</h1><controlledframe id="cf" src="https://www.google.com/"></controlledframe></body></html>`);
add('/.well-known/manifest.webmanifest', 'application/manifest+json', JSON.stringify({
  name: 'Xenon Controlled Frame noise probe',
  short_name: 'CF noise probe',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  version: '1.0.0',
  icons: [{src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml'}],
  permissions_policy: {
    'cross-origin-isolated': ['self'],
    'controlled-frame': ['self'],
  },
}));
add('/icon.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#123"/><circle cx="96" cy="96" r="62" fill="#8ef"/></svg>');

const signed = await wbnSign.SignedWebBundle.fromWebBundle(builder.createBundle(), [
  new wbnSign.NodeCryptoSigningStrategy(privateKey),
]);
writeFileSync(output, signed.getSignedWebBundleBytes());
console.log(JSON.stringify({id, origin, output}));
