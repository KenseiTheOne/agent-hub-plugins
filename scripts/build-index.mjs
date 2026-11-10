#!/usr/bin/env node
// Builds the registry catalog: dist/index.json + dist/archives/<id>-<version>.tar.gz (+ dist/index.json.minisig).
//
//   node scripts/build-index.mjs [--out dist] [--root .] [--generated-at <ISO>]
//                                [--sign-key-file <file> | --sign-key-env <VARIABLE>] [--flat-archives]
//                                [--published <published index.json>]
//
// --published: a version that is already in the published catalog with a different archive sha256 is a build error.
// Otherwise the archive <id>-<version>.tar.gz would be overwritten in the release, and a client with the old index would
// get registry:sha256.
//
// Archives are deterministic (scripts/vendor/tarball.mjs): same files → same sha256. In the index each plugin has
// the archive sha256 and size, permissions with their "why" (from the same metadata tags), tier (official — from
// official.json, otherwise community) and the older official flag.
// A plugin with linter errors doesn't get into the index — the whole build fails.
//
// The signature is minisign format (Ed25519 + BLAKE2b) via node:crypto (scripts/vendor/minisign.mjs). The private
// key is JSON {keyId, pkcs8}; in CI it lives only in an environment secret and only on push to main. Without a key the
// index is built unsigned (for checks in PRs).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sign } from "./vendor/minisign.mjs";
import { indexPermissions } from "./vendor/perms.mjs";
import { isMain } from "./lib/is-main.mjs";
import { inspectPlugin, packPlugin, pluginIds, readBlocklist, readOfficial, sha256 } from "./lib/registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// flat — archives next to index.json (for GitHub Release assets, which have no subdirectories).
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
      // translations of the title, description and permission "why" (tags with lang="xx", title-xx for actions): the hub's
      // manager shows them in the hub's language; the permissions themselves (keys) don't depend on the translation
      ...i18nOf(info.meta),
      author: info.meta.author,
      platforms: info.meta.platforms,
      type: info.meta.type,
      interval: /^[^.]+\.(\d+(?:ms|s|m|h|d))\./.exec(info.main)?.[1] || null,
      // the tier is assigned by the registry (official.json, edited only by the owner), not by the plugin's metadata
      tier: info.official ? "official" : "community",
      official: info.official,
      archive: flat ? name : `archives/${name}`,
      sha256: sha256(gz),
      size: gz.length,
      // watch — in the older entry form (the whole line with " — why"): otherwise a core older than 05.11 can't match the
      // archive's permissions to the entry and refuses to install (registry:archive-permissions); the new core reads both forms
      permissions: indexPermissions(info.meta),
      // dependencies (<agenthub.requires>): the hub's manager shows "Needs Hermes" with a link and checks the check path
      ...(info.meta.requires?.length ? { requires: info.meta.requires.map((r) => ({ name: r.name, url: r.url, check: r.check, note: r.note })) } : {}),
      // contract 2: the minimum contract version (<agenthub.contract>; no tag — no field, the hub assumes 1) — a hub of
      // version 2 or newer with an older contract shows "Needs a newer hub" and doesn't install; contract 1 hubs don't know
      // the field and install (publish only after the hub is updated: docs/contract/extension-points.md "Contract versions");
      // the tile icon (<agenthub.icon>) — the catalog draws it before installation
      ...(Number.isInteger(info.meta.contract) ? { contract: info.meta.contract } : {}),
      ...(info.meta.icon?.symbol ? { icon: { symbol: info.meta.icon.symbol, ...(info.meta.icon.color ? { color: info.meta.icon.color } : {}) } } : {}),
    });
  }
  // a published version doesn't change content: a change without a new version is an error, not a silent archive overwrite
  const was = new Map((Array.isArray(published?.plugins) ? published.plugins : []).filter((p) => p && typeof p.id === "string").map((p) => [`${p.id}@${p.version}`, p.sha256]));
  for (const p of plugins) {
    const old = was.get(`${p.id}@${p.version}`);
    if (old && old !== p.sha256) errors.push(`${p.id}: version ${p.version} is already published with a different archive (sha256 ${String(old).slice(0, 12)}… → ${p.sha256.slice(0, 12)}…) — bump the version`);
  }
  if (errors.length) throw new Error(`plugins with errors:\n${errors.join("\n")}`);
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
      console.error(`variable ${val("--sign-key-env")} is empty — nothing to sign with`);
      process.exit(1);
    }
  }
  try {
    // the published catalog: no file (first publication) — nothing to compare with; a file that isn't JSON is an error
    let published = null;
    if (val("--published") && existsSync(resolve(val("--published")))) published = JSON.parse(readFileSync(resolve(val("--published")), "utf8"));
    const r = buildIndex({ root: val("--root") ? resolve(val("--root")) : ROOT, out: val("--out") ? resolve(val("--out")) : join(ROOT, "dist"), generatedAt: val("--generated-at"), secretKey, flat: a.includes("--flat-archives"), published });
    console.log(`index.json: ${r.index.plugins.length} plugins, blocklist ${r.index.blocklist.length}${r.signed ? ", signed" : ", unsigned"} → ${r.out}`);
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
