// Общее для check.mjs и build-index.mjs: обход plugins/, разбор метаданных тем же парсером, что у демона
// (scripts/vendor/meta.mjs), проверка структуры, линтер прав, права на ревизии git, упаковка архива.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFileName, parseMetaText } from "../vendor/meta.mjs";
import { diffPermissions, ID_RE, lintPlugin, permissionsFromMeta, RESERVED_IDS, sourceViolations } from "../vendor/perms.mjs";
import { LIMITS, packTarGz } from "../vendor/tarball.mjs";

// В реестре — только текстовые плагины с известным интерпретатором: бинарник ревьюер не прочтёт.
export const ALLOWED_EXT = new Set(["mjs", "js", "cjs", "py", "sh", "bash", "zsh"]);
// В архив не идут: тесты и фикстуры (они для CI), dot-файлы.
export const PACK_EXCLUDE_TOP = new Set(["test", "fixtures"]);
// Попадает ли файл plugins/<id>/<rel> в архив плагина (без test/, fixtures/, dot-файлов и dot-каталогов).
export const inPack = (rel) => !rel.split("/").some((s) => s.startsWith(".")) && !PACK_EXCLUDE_TOP.has(rel.split("/")[0]);

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`нет ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// official.json: { "official": ["night-runner", …] } — метку ставит только владелец (CODEOWNERS).
export function readOfficial(root) {
  const j = readJson(join(root, "official.json"), { official: [] });
  if (!Array.isArray(j.official) || !j.official.every((x) => typeof x === "string" && ID_RE.test(x))) throw new Error("official.json: ждём {\"official\": [id…]}");
  return new Set(j.official);
}

// blocklist.json: { "version": 1, "entries": [{ id, versions?, sha256?, reason }] }
export function readBlocklist(root) {
  const j = readJson(join(root, "blocklist.json"), { version: 1, entries: [] });
  const errors = [];
  if (j.version !== 1 || !Array.isArray(j.entries)) errors.push("blocklist.json: ждём {\"version\":1,\"entries\":[…]}");
  const entries = [];
  for (const [i, e] of (j.entries || []).entries()) {
    if (!e || typeof e.id !== "string" || !ID_RE.test(e.id)) {
      errors.push(`blocklist.json[${i}]: id`);
      continue;
    }
    if (typeof e.reason !== "string" || !e.reason.trim()) errors.push(`blocklist.json[${i}]: нет reason`);
    if (e.versions !== undefined && !(Array.isArray(e.versions) && e.versions.every((v) => typeof v === "string"))) errors.push(`blocklist.json[${i}]: versions`);
    if (e.sha256 !== undefined && !(Array.isArray(e.sha256) && e.sha256.every((v) => /^[0-9a-f]{64}$/.test(v)))) errors.push(`blocklist.json[${i}]: sha256`);
    entries.push({ id: e.id, ...(e.versions ? { versions: e.versions } : {}), ...(e.sha256 ? { sha256: e.sha256 } : {}), reason: String(e.reason || "") });
  }
  return { entries, errors };
}

export function pluginIds(root) {
  const dir = join(root, "plugins");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith(".") && lstatSync(join(dir, n)).isDirectory())
    .sort();
}

function mainCandidates(names, id) {
  return names.filter((n) => {
    const fn = parseFileName(n);
    return fn && fn.id === id;
  });
}

// Все файлы каталога плагина. → [{ rel, abs, size, symlink }]
function walk(dir, rel = "", out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) out.push({ rel: r, abs, size: 0, symlink: true });
    else if (st.isDirectory()) walk(abs, r, out);
    else if (st.isFile()) out.push({ rel: r, abs, size: st.size, symlink: false });
  }
  return out;
}

// Полный разбор и проверка одного plugins/<id>/. → { id, ok, errors, warnings, meta, permissions, main, pack }
export function inspectPlugin(root, id, { official = new Set() } = {}) {
  const errors = [];
  const warnings = [];
  const dir = join(root, "plugins", id);
  const isOfficial = official.has(id);
  if (!ID_RE.test(id) || RESERVED_IDS.has(id)) errors.push(`имя папки «${id}»: только a-z, 0-9, «-»`);
  const files = walk(dir);
  for (const f of files) if (f.symlink) errors.push(`${f.rel}: символьные ссылки запрещены`);
  if (files.length > LIMITS.maxFiles) errors.push(`файлов больше ${LIMITS.maxFiles}`);
  const top = readdirSync(dir);
  if (!top.includes("README.md")) errors.push("нет README.md");
  const mains = mainCandidates(top.filter((n) => lstatSync(join(dir, n)).isFile()), id);
  let meta = null;
  let source = "";
  let main = null;
  if (mains.length !== 1) errors.push(mains.length ? `несколько исполняемых файлов: ${mains.join(", ")}` : `нет файла ${id}.<интервал>.<расширение> или ${id}.<расширение>`);
  else {
    main = mains[0];
    const fn = parseFileName(main);
    if (!ALLOWED_EXT.has(fn.ext)) errors.push(`${main}: в реестре только ${[...ALLOWED_EXT].join(", ")} (бинарники и прочее не принимаются)`);
    const buf = readFileSync(join(dir, main));
    if (buf.subarray(0, 8192).includes(0)) errors.push(`${main}: двоичный файл`);
    source = buf.toString("utf8");
    const parsed = parseMetaText(buf.subarray(0, 64 * 1024).toString("utf8"));
    meta = parsed.meta;
    for (const w of parsed.warnings) errors.push(`метаданные: ${w}`);
    const lint = lintPlugin({ id, meta, source, official: isOfficial });
    errors.push(...lint.errors);
    warnings.push(...lint.warnings);
  }
  // остальные текстовые файлы плагина тоже не должны лезть в запретные места
  const pack = files.filter((f) => !f.symlink && inPack(f.rel));
  let total = 0;
  for (const f of pack) {
    total += f.size;
    if (f.size > LIMITS.maxFileBytes) errors.push(`${f.rel}: больше ${LIMITS.maxFileBytes} байт`);
    if (f.rel === main) continue;
    const b = readFileSync(f.abs);
    if (b.subarray(0, 8192).includes(0)) {
      errors.push(`${f.rel}: двоичные файлы в архив плагина не принимаются`);
      continue;
    }
    // запретные места — ошибка для всех плагинов реестра, исключений по метке official нет
    for (const what of sourceViolations(b.toString("utf8"))) errors.push(`${f.rel}: упоминает запретное место: ${what}`);
  }
  if (total > LIMITS.maxTotalBytes) errors.push(`плагин больше ${LIMITS.maxTotalBytes} байт`);
  return {
    id,
    dir,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    official: isOfficial,
    meta,
    main,
    permissions: meta ? permissionsFromMeta(meta) : null,
    pack,
    hasFixtures: existsSync(join(dir, "fixtures")),
    tests: existsSync(join(dir, "test")) ? readdirSync(join(dir, "test")).filter((n) => /\.test\.mjs$/.test(n)).map((n) => join(dir, "test", n)) : [],
  };
}

// Детерминированный архив plugins/<id>/ (без test/, fixtures/, dot-файлов). Все файлы 0644: запуск — по
// расширению интерпретатором, бит x не нужен и не переносится между macOS и Windows.
export function packPlugin(info) {
  return packTarGz(info.pack.map((f) => ({ path: `${info.id}/${f.rel}`, data: readFileSync(f.abs), mode: 0o644 })));
}

// ---------- права на ревизии ----------

// Права всех плагинов каталога. → Map(id → permissions)
export function permissionsAtDir(root) {
  const out = new Map();
  for (const id of pluginIds(root)) {
    const dir = join(root, "plugins", id);
    const mains = mainCandidates(readdirSync(dir).filter((n) => lstatSync(join(dir, n)).isFile()), id);
    if (mains.length !== 1) continue;
    out.set(id, permissionsFromMeta(parseMetaText(readFileSync(join(dir, mains[0])).subarray(0, 64 * 1024).toString("utf8")).meta));
  }
  return out;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function checkRef(ref) {
  if (!/^[\w./~^@{}-]{1,200}$/.test(ref) || ref.startsWith("-")) throw new Error(`странная ревизия: ${ref}`);
}

// Права на ревизии git (только чтение объектов: ls-tree + show). → Map(id → permissions)
export function permissionsAtRef(root, ref) {
  const out = new Map();
  for (const [id, meta] of metaAtRef(root, ref)) out.set(id, permissionsFromMeta(meta));
  return out;
}

// Метаданные главных файлов плагинов на ревизии git. → Map(id → meta)
export function metaAtRef(root, ref) {
  checkRef(ref);
  const names = git(root, ["ls-tree", "-r", "--name-only", ref, "--", "plugins"]).toString("utf8").split("\n").filter(Boolean);
  const byId = new Map();
  for (const n of names) {
    const m = /^plugins\/([^/]+)\/([^/]+)$/.exec(n);
    if (!m) continue;
    if (!byId.has(m[1])) byId.set(m[1], []);
    byId.get(m[1]).push(m[2]);
  }
  const out = new Map();
  for (const [id, files] of byId) {
    const mains = mainCandidates(files, id);
    if (mains.length !== 1) continue;
    const text = git(root, ["show", `${ref}:plugins/${id}/${mains[0]}`]).subarray(0, 64 * 1024).toString("utf8");
    out.set(id, parseMetaText(text).meta);
  }
  return out;
}

// Плагины, у которых относительно ревизии ref изменились файлы архива, а версия осталась прежней: архив
// <id>-<версия>.tar.gz в релизе «index» перезаписался бы другим содержимым, и клиент со старым индексом получил
// бы при установке registry:sha256. Сравнение — git diff ревизии с рабочим деревом (с учётом .gitattributes),
// плюс неотслеживаемые файлы. → [{ id, version, files: [rel] }]
export function unbumpedChanges(root, ref) {
  const base = metaAtRef(root, ref);
  const out = [];
  for (const id of pluginIds(root)) {
    const was = base.get(id);
    if (!was?.version) continue;
    const dir = join(root, "plugins", id);
    const mains = mainCandidates(readdirSync(dir).filter((n) => lstatSync(join(dir, n)).isFile()), id);
    if (mains.length !== 1) continue;
    const version = parseMetaText(readFileSync(join(dir, mains[0])).subarray(0, 64 * 1024).toString("utf8")).meta.version;
    if (version !== was.version) continue;
    const prefix = `plugins/${id}/`;
    const names = [
      ...git(root, ["diff", "--name-only", ref, "--", prefix]).toString("utf8").split("\n"),
      ...git(root, ["ls-files", "--others", "--exclude-standard", "--", prefix]).toString("utf8").split("\n"),
    ].filter((n) => n.startsWith(prefix));
    const files = [...new Set(names.map((n) => n.slice(prefix.length)))].filter(inPack).sort();
    if (files.length) out.push({ id, version, files });
  }
  return out;
}

// Дифф прав между ревизиями. → [{ id, change: "new"|"changed"|"removed", added, removed }]
export function permissionsDiff(base, head) {
  const out = [];
  for (const [id, p] of head) {
    if (!base.has(id)) {
      out.push({ id, change: "new", ...diffPermissions({}, p) });
      continue;
    }
    const d = diffPermissions(base.get(id), p);
    if (d.added.length || d.removed.length) out.push({ id, change: "changed", ...d });
  }
  for (const [id, p] of base) if (!head.has(id)) out.push({ id, change: "removed", added: [], removed: diffPermissions({}, p).added });
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function diffMarkdown(diff) {
  if (!diff.length) return "Права плагинов не менялись.\n";
  const lines = ["## Изменение прав плагинов", "", "Нужен второй ревьюер (CODEOWNERS), если права выросли.", ""];
  for (const d of diff) {
    lines.push(`### ${d.id} — ${{ new: "новый плагин", changed: "права изменились", removed: "плагин удалён" }[d.change]}`);
    for (const p of d.added) lines.push(`- \`+ ${p.kind}\` ${p.what}${p.why ? ` — ${p.why}` : ""}`);
    for (const p of d.removed) lines.push(`- \`- ${p.kind}\` ${p.what}`);
    lines.push("");
  }
  return lines.join("\n");
}
