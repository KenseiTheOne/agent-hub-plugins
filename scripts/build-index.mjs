#!/usr/bin/env node
// Сборка каталога реестра: dist/index.json + dist/archives/<id>-<версия>.tar.gz (+ dist/index.json.minisig).
//
//   node scripts/build-index.mjs [--out dist] [--root .] [--generated-at <ISO>]
//                                [--sign-key-file <файл> | --sign-key-env <ПЕРЕМЕННАЯ>] [--flat-archives]
//
// Архивы детерминированы (scripts/vendor/tarball.mjs): одинаковые файлы → одинаковый sha256. В индексе у
// каждого плагина — sha256 и размер архива, права с «зачем» (из тех же тегов метаданных), tier (official —
// из official.json, иначе community) и прежняя метка official.
// Плагин с ошибками линтера в индекс не попадает — сборка падает целиком.
//
// Подпись — формат minisign (Ed25519 + BLAKE2b) через node:crypto (scripts/vendor/minisign.mjs). Закрытый
// ключ — JSON {keyId, pkcs8}; в CI он только в секрете environment и только на push в main. Без ключа индекс
// собирается неподписанным (для проверки в PR).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sign } from "./vendor/minisign.mjs";
import { inspectPlugin, packPlugin, pluginIds, readBlocklist, readOfficial, sha256 } from "./lib/registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// flat — архивы рядом с index.json (для ассетов GitHub Release, где нет подкаталогов).
export function buildIndex({ root = ROOT, out = join(ROOT, "dist"), generatedAt = null, secretKey = null, flat = false } = {}) {
  const official = readOfficial(root);
  const bl = readBlocklist(root);
  if (bl.errors.length) throw new Error(bl.errors.join("; "));
  const plugins = [];
  const errors = [];
  const archives = [];
  for (const id of pluginIds(root)) {
    const info = inspectPlugin(root, id, { official });
    if (!info.ok) {
      errors.push(`${id}: ${info.errors.join("; ")}`);
      continue;
    }
    const gz = packPlugin(info);
    const name = `${id}-${info.meta.version}.tar.gz`;
    archives.push([name, gz]);
    plugins.push({
      id,
      version: info.meta.version,
      title: info.meta.title,
      desc: info.meta.desc,
      author: info.meta.author,
      platforms: info.meta.platforms,
      type: info.meta.type,
      interval: /^[^.]+\.(\d+(?:ms|s|m|h|d))\./.exec(info.main)?.[1] || null,
      // уровень назначает реестр (official.json, правит только владелец), не метаданные плагина
      tier: info.official ? "official" : "community",
      official: info.official,
      archive: flat ? name : `archives/${name}`,
      sha256: sha256(gz),
      size: gz.length,
      permissions: info.permissions,
    });
  }
  if (errors.length) throw new Error(`плагины с ошибками:\n${errors.join("\n")}`);
  const index = {
    version: 1,
    generatedAt: generatedAt || (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString()),
    plugins,
    blocklist: bl.entries,
  };
  rmSync(out, { recursive: true, force: true });
  mkdirSync(flat ? out : join(out, "archives"), { recursive: true });
  for (const [name, gz] of archives) writeFileSync(flat ? join(out, name) : join(out, "archives", name), gz);
  const text = JSON.stringify(index, null, 2) + "\n";
  writeFileSync(join(out, "index.json"), text);
  let signed = false;
  if (secretKey) {
    const sig = sign(Buffer.from(text), secretKey, {
      trustedComment: `agent-hub-plugins index generatedAt=${index.generatedAt} plugins=${plugins.length}`,
      untrustedComment: "agent-hub-plugins index signature",
    });
    writeFileSync(join(out, "index.json.minisig"), sig);
    signed = true;
  }
  return { index, out, signed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : null;
  };
  let secretKey = null;
  if (val("--sign-key-file")) secretKey = readFileSync(resolve(val("--sign-key-file")), "utf8");
  else if (val("--sign-key-env")) {
    secretKey = process.env[val("--sign-key-env")] || null;
    if (!secretKey) {
      console.error(`переменная ${val("--sign-key-env")} пуста — подписывать нечем`);
      process.exit(1);
    }
  }
  try {
    const r = buildIndex({ root: val("--root") ? resolve(val("--root")) : ROOT, out: val("--out") ? resolve(val("--out")) : join(ROOT, "dist"), generatedAt: val("--generated-at"), secretKey, flat: a.includes("--flat-archives") });
    console.log(`index.json: ${r.index.plugins.length} плагинов, blocklist ${r.index.blocklist.length}${r.signed ? ", подписан" : ", без подписи"} → ${r.out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
