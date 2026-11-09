#!/usr/bin/env node
// Сборка каталога реестра: dist/index.json + dist/archives/<id>-<версия>.tar.gz (+ dist/index.json.minisig).
//
//   node scripts/build-index.mjs [--out dist] [--root .] [--generated-at <ISO>]
//                                [--sign-key-file <файл> | --sign-key-env <ПЕРЕМЕННАЯ>] [--flat-archives]
//                                [--published <опубликованный index.json>]
//
// --published: версия, которая уже есть в опубликованном каталоге с другим sha256 архива, — ошибка сборки. Архив
// <id>-<версия>.tar.gz иначе перезаписался бы в релизе, и клиент со старым индексом получил бы registry:sha256.
//
// Архивы детерминированы (scripts/vendor/tarball.mjs): одинаковые файлы → одинаковый sha256. В индексе у
// каждого плагина — sha256 и размер архива, права с «зачем» (из тех же тегов метаданных), tier (official —
// из official.json, иначе community) и прежняя метка official.
// Плагин с ошибками линтера в индекс не попадает — сборка падает целиком.
//
// Подпись — формат minisign (Ed25519 + BLAKE2b) через node:crypto (scripts/vendor/minisign.mjs). Закрытый
// ключ — JSON {keyId, pkcs8}; в CI он только в секрете environment и только на push в main. Без ключа индекс
// собирается неподписанным (для проверки в PR).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sign } from "./vendor/minisign.mjs";
import { indexPermissions } from "./vendor/perms.mjs";
import { isMain } from "./lib/is-main.mjs";
import { inspectPlugin, packPlugin, pluginIds, readBlocklist, readOfficial, sha256 } from "./lib/registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// flat — архивы рядом с index.json (для ассетов GitHub Release, где нет подкаталогов).
export function buildIndex({ root = ROOT, out = join(ROOT, "dist"), generatedAt = null, secretKey = null, flat = false, published = null } = {}) {
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
      // переводы названия, описания и «зачем» у прав (теги с lang="xx", у действий — title-xx): менеджер хаба
      // показывает их на языке хаба; сами права (ключи) от перевода не зависят
      ...i18nOf(info.meta),
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
      // watch — в прежнем виде записи (вся строка с « — зачем»): иначе ядро до 05.11 не сверит права архива
      // с записью и откажет в установке (registry:archive-permissions); новое ядро читает оба вида
      permissions: indexPermissions(info.meta),
      // зависимости (<agenthub.requires>): менеджер хаба показывает «Нужен Hermes» со ссылкой и проверяет путь check
      ...(info.meta.requires?.length ? { requires: info.meta.requires.map((r) => ({ name: r.name, url: r.url, check: r.check, note: r.note })) } : {}),
    });
  }
  // опубликованная версия не меняет содержимое: правка без новой версии — ошибка, а не тихая перезапись архива
  const was = new Map((Array.isArray(published?.plugins) ? published.plugins : []).filter((p) => p && typeof p.id === "string").map((p) => [`${p.id}@${p.version}`, p.sha256]));
  for (const p of plugins) {
    const old = was.get(`${p.id}@${p.version}`);
    if (old && old !== p.sha256) errors.push(`${p.id}: версия ${p.version} уже опубликована с другим архивом (sha256 ${String(old).slice(0, 12)}… → ${p.sha256.slice(0, 12)}…) — поднимите версию`);
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

if (isMain(import.meta.url)) {
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
    // опубликованный каталог: файла нет (первая публикация) — проверять не с чем; файл есть, но не JSON — ошибка
    let published = null;
    if (val("--published") && existsSync(resolve(val("--published")))) published = JSON.parse(readFileSync(resolve(val("--published")), "utf8"));
    const r = buildIndex({ root: val("--root") ? resolve(val("--root")) : ROOT, out: val("--out") ? resolve(val("--out")) : join(ROOT, "dist"), generatedAt: val("--generated-at"), secretKey, flat: a.includes("--flat-archives"), published });
    console.log(`index.json: ${r.index.plugins.length} плагинов, blocklist ${r.index.blocklist.length}${r.signed ? ", подписан" : ", без подписи"} → ${r.out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function i18nOf(meta) {
  const out = {};
  for (const [lang, v] of Object.entries(meta.i18n || {})) {
    const e = {};
    if (v.title) e.title = v.title;
    if (v.desc) e.desc = v.desc;
    if (v.why && Object.keys(v.why).length) e.why = { ...v.why };
    if (v.requires && Object.keys(v.requires).length) e.requires = { ...v.requires };
    if (Object.keys(e).length) out[lang] = e;
  }
  for (const a of meta.actions || []) {
    for (const [lang, v] of Object.entries(a.i18n || {})) if (v?.title) (((out[lang] ||= {}).actions ||= {})[a.id] = v.title);
  }
  return Object.keys(out).length ? { i18n: out } : {};
}
