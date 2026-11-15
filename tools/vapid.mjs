// Makes a VAPID key pair for Web Push.
// The private key (JWK) goes to stdout so it can be piped straight into
// `wrangler secret put VAPID_PRIVATE_KEY` without touching a file.
// The public key goes to stderr, for VAPID_PUBLIC_KEY in wrangler.jsonc.
//
//   node tools/vapid.mjs | npx wrangler secret put VAPID_PRIVATE_KEY

const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await subtle.exportKey("jwk", pair.privateKey);
const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const publicKey = Buffer.from(raw).toString("base64url");

process.stderr.write(`\nVAPID_PUBLIC_KEY for wrangler.jsonc:\n${publicKey}\n\n`);
process.stdout.write(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }));
