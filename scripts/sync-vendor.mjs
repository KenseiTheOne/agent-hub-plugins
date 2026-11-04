#!/usr/bin/env node
// Вендоринг разборщиков ядра Agent Hub в реестр.
//
// CI реестра не видит соседнюю репу agent-hub, поэтому нужные модули демона лежат копией в scripts/vendor/:
//   meta.mjs, output.mjs                — разбор метаданных и вывода (daemon/lib/)
//   minisign.mjs, tarball.mjs, perms.mjs — подпись, архив, права (daemon/lib/registry/)
//   native.mjs                           — заглушка (аддон peercred реестру не нужен; xattr бинарников —
//                                          не наш случай: в реестре только текстовые плагины)
// Копии побайтные; их sha256 записываются в scripts/vendor/VENDOR.json. check.sh сверяет копии с этим
// файлом всегда, а с исходником — если рядом есть agent-hub (AGENT_HUB_DIR или ../agent-hub).
//
//   node scripts/sync-vendor.mjs [--from <путь к agent-hub>] [--check]
// --check — только сверить (код 1 при расхождении), ничего не писать.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_DIR = join(ROOT, "scripts", "vendor");
export const FILES = {
  "meta.mjs": "daemon/lib/meta.mjs",
  "output.mjs": "daemon/lib/output.mjs",
  "minisign.mjs": "daemon/lib/registry/minisign.mjs",
  "tarball.mjs": "daemon/lib/registry/tarball.mjs",
  "perms.mjs": "daemon/lib/registry/perms.mjs",
};
export const NATIVE_STUB = `// Заглушка вендоринга (scripts/sync-vendor.mjs): реестру аддон peercred не нужен.
export function loadNative() {
  return null;
}
`;

const sha = (b) => createHash("sha256").update(b).digest("hex");

export function agentHubDir(env = process.env) {
  const cands = [env.AGENT_HUB_DIR, join(ROOT, "..", "agent-hub")].filter(Boolean);
  return cands.find((d) => existsSync(join(d, "daemon", "lib", "meta.mjs"))) || null;
}

// → { ok, problems: [...], drift: [...] } — problems: копия не совпала с VENDOR.json; drift: исходник ушёл вперёд
export function checkVendor({ from = agentHubDir() } = {}) {
  const problems = [];
  const drift = [];
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(VENDOR_DIR, "VENDOR.json"), "utf8")).files || {};
  } catch {
    problems.push("нет scripts/vendor/VENDOR.json");
  }
  const all = { ...FILES, "native.mjs": null };
  for (const name of Object.keys(all)) {
    const p = join(VENDOR_DIR, name);
    if (!existsSync(p)) {
      problems.push(`нет scripts/vendor/${name}`);
      continue;
    }
    const h = sha(readFileSync(p));
    if (manifest[name] !== h) problems.push(`scripts/vendor/${name} не совпадает с VENDOR.json (правка руками?)`);
    if (from && all[name]) {
      const src = join(from, all[name]);
      if (existsSync(src) && sha(readFileSync(src)) !== h) drift.push(`${name} отличается от ${all[name]} — запустите node scripts/sync-vendor.mjs`);
    }
  }
  return { ok: problems.length === 0, problems, drift };
}

export function syncVendor(from) {
  mkdirSync(VENDOR_DIR, { recursive: true });
  const files = {};
  for (const [name, rel] of Object.entries(FILES)) {
    const data = readFileSync(join(from, rel));
    writeFileSync(join(VENDOR_DIR, name), data);
    files[name] = sha(data);
  }
  writeFileSync(join(VENDOR_DIR, "native.mjs"), NATIVE_STUB);
  files["native.mjs"] = sha(Buffer.from(NATIVE_STUB));
  const manifest = { note: "копии модулей agent-hub/daemon; обновлять только scripts/sync-vendor.mjs", source: FILES, files };
  writeFileSync(join(VENDOR_DIR, "VENDOR.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--from");
  const from = i >= 0 ? resolve(args[i + 1]) : agentHubDir();
  if (args.includes("--check")) {
    const r = checkVendor({ from });
    for (const p of [...r.problems, ...r.drift]) console.error(p);
    process.exit(r.ok && !r.drift.length ? 0 : 1);
  }
  if (!from) {
    console.error("не найден agent-hub: укажите --from <путь> или AGENT_HUB_DIR");
    process.exit(2);
  }
  const m = syncVendor(from);
  console.log(`скопировано из ${from}: ${Object.keys(m.files).join(", ")}`);
}
