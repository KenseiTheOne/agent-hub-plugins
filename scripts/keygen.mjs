#!/usr/bin/env node
// One-off generation of the registry signing key — ONLY when the owner decides to, on the owner's machine.
//
//   node scripts/keygen.mjs <directory outside the repo>
//
// Writes <directory>/agent-hub-index.key (JSON {keyId, pkcs8}, 0600) and agent-hub-index.pub (minisign format).
// The .key goes into the secret of the "registry-signing" environment on GitHub (INDEX_SIGNING_KEY) and lives nowhere else;
// the .pub goes into the daemon's config.json (services.plugins.publicKey) and into the app. A directory inside the repo is refused.

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair } from "./vendor/minisign.mjs";
import { isMain } from "./lib/is-main.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function keygen(dir) {
  const d = resolve(dir);
  if (d === ROOT || d.startsWith(ROOT + sep)) throw new Error("the key must not be inside the registry repo");
  mkdirSync(d, { recursive: true, mode: 0o700 });
  const keyFile = join(d, "agent-hub-index.key");
  if (existsSync(keyFile)) throw new Error(`${keyFile} already exists — not overwriting it`);
  const kp = generateKeyPair();
  writeFileSync(keyFile, kp.secretKey + "\n", { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  writeFileSync(join(d, "agent-hub-index.pub"), kp.publicKey);
  return { keyFile, pubFile: join(d, "agent-hub-index.pub"), keyId: kp.keyId };
}

if (isMain(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("give a directory outside the repo: node scripts/keygen.mjs <directory>");
    process.exit(2);
  }
  try {
    const r = keygen(process.argv[2]);
    console.log(`key ${r.keyId}: ${r.pubFile} (public); private — ${r.keyFile}, never put it in git`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
