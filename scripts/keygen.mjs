#!/usr/bin/env node
// Разовая генерация ключа подписи реестра — ТОЛЬКО по решению владельца, на его машине.
//
//   node scripts/keygen.mjs <каталог вне репы>
//
// Пишет <каталог>/agent-hub-index.key (JSON {keyId, pkcs8}, 0600) и agent-hub-index.pub (формат minisign).
// .key кладётся в секрет environment «registry-signing» на GitHub (INDEX_SIGNING_KEY) и больше нигде не живёт;
// .pub — в config.json демона (services.plugins.publicKey) и в приложение. Каталог внутри репы — отказ.

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair } from "./vendor/minisign.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function keygen(dir) {
  const d = resolve(dir);
  if (d === ROOT || d.startsWith(ROOT + sep)) throw new Error("ключ внутри репы реестра — нельзя");
  mkdirSync(d, { recursive: true, mode: 0o700 });
  const keyFile = join(d, "agent-hub-index.key");
  if (existsSync(keyFile)) throw new Error(`${keyFile} уже есть — не перезаписываю`);
  const kp = generateKeyPair();
  writeFileSync(keyFile, kp.secretKey + "\n", { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  writeFileSync(join(d, "agent-hub-index.pub"), kp.publicKey);
  return { keyFile, pubFile: join(d, "agent-hub-index.pub"), keyId: kp.keyId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("укажите каталог вне репы: node scripts/keygen.mjs <каталог>");
    process.exit(2);
  }
  try {
    const r = keygen(process.argv[2]);
    console.log(`ключ ${r.keyId}: ${r.pubFile} (открытый); закрытый — ${r.keyFile}, в git не класть`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
