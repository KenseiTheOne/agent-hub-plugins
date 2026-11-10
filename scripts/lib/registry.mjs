// Shared by check.mjs and build-index.mjs: walking plugins/, parsing metadata with the same parser the daemon uses
// (scripts/vendor/meta.mjs), structure checks, the permission linter, permissions at a git revision, packing the archive.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT_VERSION, parseFileName, parseMetaText } from "../vendor/meta.mjs";
import { diffPermissions, ID_RE, lintPlugin, permissionsFromMeta, pushWarnings, RESERVED_IDS, sourceViolations } from "../vendor/perms.mjs";
import { LIMITS, packTarGz } from "../vendor/tarball.mjs";

// The registry takes only text plugins with a known interpreter: a reviewer can't read a binary.
export const ALLOWED_EXT = new Set(["mjs", "js", "cjs", "py", "sh", "bash", "zsh"]);
// Not packed into the archive: tests and fixtures (they're for CI), dot files.
export const PACK_EXCLUDE_TOP = new Set(["test", "fixtures"]);
// Whether the file plugins/<id>/<rel> goes into the plugin archive (excluding test/, fixtures/, dot files and dot directories).
export const inPack = (rel) => !rel.split("/").some((s) => s.startsWith(".")) && !PACK_EXCLUDE_TOP.has(rel.split("/")[0]);

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${path} is missing`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// Hub core event keys and warnings about push rules (kind="security", reserved keys) — shared with the daemon's
// check of a local folder: scripts/vendor/perms.mjs (daemon/lib/registry/perms.mjs).
export { CORE_PUSH_KEYS, pushWarnings } from "../vendor/perms.mjs";

// Contract version (<agenthub.contract>, docs/contract/extension-points.md "Contract versions"). A plugin that uses
// contract 2 features without the tag is a warning: a hub of contract 2 or newer would show "Needs a newer hub" given
// the tag, where its contract is older. (A contract 1 hub doesn't know the tag at all: it installs the plugin and doesn't
// understand it — drops kind="plugin", no connection; only the rollout order protects against it,
// docs/contract/extension-points.md.) A contract newer than the vendored copy knows (scripts/vendor/meta.mjs) is an
// error: the check here runs on the older parser.
// → { errors, warnings }
export function contractCheck(meta, source = "") {
  const errors = [];
  const warnings = [];
  const need = Number.isInteger(meta?.contract) ? meta.contract : 1;
  if (need > CONTRACT_VERSION) errors.push(`<agenthub.contract>${need}: the vendored copy knows contract ${CONTRACT_VERSION} — run node scripts/sync-vendor.mjs against a hub with this contract`);
  const v2 = [];
  if (meta?.connections?.length) v2.push("<agenthub.connection>");
  if (meta?.icon) v2.push("<agenthub.icon>");
  if ((meta?.push || []).some((r) => r.kind === "plugin" && !(r.legacyKind && !r.wasDeclared))) v2.push('kind="plugin"');
  if (/(?:^|["'`\n])message=/m.test(String(source))) v2.push("message= in action output");
  if (v2.length && need < 2) warnings.push(`uses contract 2 (${v2.join(", ")}), but <agenthub.contract>2</agenthub.contract> is not declared: a hub with an older contract will accept the plugin silently and only partly understand it`);
  return { errors, warnings };
}

// official.json: { "official": ["night-runner", …] } — only the owner sets the label (CODEOWNERS).
export function readOfficial(root) {
  const j = readJson(join(root, "official.json"), { official: [] });
  if (!Array.isArray(j.official) || !j.official.every((x) => typeof x === "string" && ID_RE.test(x))) throw new Error("official.json: expected {\"official\": [id…]}");
  return new Set(j.official);
}

// blocklist.json: { "version": 1, "entries": [{ id, versions?, sha256?, reason }] }
export function readBlocklist(root) {
  const j = readJson(join(root, "blocklist.json"), { version: 1, entries: [] });
  const errors = [];
  if (j.version !== 1 || !Array.isArray(j.entries)) errors.push("blocklist.json: expected {\"version\":1,\"entries\":[…]}");
  const entries = [];
  for (const [i, e] of (j.entries || []).entries()) {
    if (!e || typeof e.id !== "string" || !ID_RE.test(e.id)) {
      errors.push(`blocklist.json[${i}]: id`);
      continue;
    }
    if (typeof e.reason !== "string" || !e.reason.trim()) errors.push(`blocklist.json[${i}]: no reason`);
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

// All files in the plugin directory. → [{ rel, abs, size, symlink }]
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

// Full parse and check of one plugins/<id>/. → { id, ok, errors, warnings, meta, permissions, main, pack }
export function inspectPlugin(root, id, { official = new Set() } = {}) {
  const errors = [];
  const warnings = [];
  const dir = join(root, "plugins", id);
  const isOfficial = official.has(id);
  if (!ID_RE.test(id) || RESERVED_IDS.has(id)) errors.push(`folder name "${id}": only a-z, 0-9, "-"`);
  const files = walk(dir);
  for (const f of files) if (f.symlink) errors.push(`${f.rel}: symbolic links are not allowed`);
  if (files.length > LIMITS.maxFiles) errors.push(`more than ${LIMITS.maxFiles} files`);
  const top = readdirSync(dir);
  if (!top.includes("README.md")) errors.push("README.md is missing");
  const mains = mainCandidates(top.filter((n) => lstatSync(join(dir, n)).isFile()), id);
  let meta = null;
  let source = "";
  let main = null;
  if (mains.length !== 1) errors.push(mains.length ? `several executable files: ${mains.join(", ")}` : `no file ${id}.<interval>.<extension> or ${id}.<extension>`);
  else {
    main = mains[0];
    const fn = parseFileName(main);
    if (!ALLOWED_EXT.has(fn.ext)) errors.push(`${main}: the registry takes only ${[...ALLOWED_EXT].join(", ")} (binaries and anything else are not accepted)`);
    const buf = readFileSync(join(dir, main));
    if (buf.subarray(0, 8192).includes(0)) errors.push(`${main}: binary file`);
    source = buf.toString("utf8");
    const parsed = parseMetaText(buf.subarray(0, 64 * 1024).toString("utf8"));
    meta = parsed.meta;
    for (const w of parsed.warnings) errors.push(`metadata: ${w}`);
    const lint = lintPlugin({ id, meta, source, official: isOfficial });
    errors.push(...lint.errors);
    warnings.push(...lint.warnings);
    warnings.push(...pushWarnings(meta));
    const c = contractCheck(meta, source);
    errors.push(...c.errors);
    warnings.push(...c.warnings);
  }
  // the plugin's other text files must not reach into forbidden locations either
  const pack = files.filter((f) => !f.symlink && inPack(f.rel));
  let total = 0;
  for (const f of pack) {
    total += f.size;
    if (f.size > LIMITS.maxFileBytes) errors.push(`${f.rel}: over ${LIMITS.maxFileBytes} bytes`);
    if (f.rel === main) continue;
    const b = readFileSync(f.abs);
    if (b.subarray(0, 8192).includes(0)) {
      errors.push(`${f.rel}: binary files are not accepted in a plugin archive`);
      continue;
    }
    // forbidden locations are an error for every registry plugin; the official label grants no exception
    for (const what of sourceViolations(b.toString("utf8"))) errors.push(`${f.rel}: mentions a forbidden location: ${what}`);
  }
  if (total > LIMITS.maxTotalBytes) errors.push(`plugin is over ${LIMITS.maxTotalBytes} bytes`);
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

// A deterministic archive of plugins/<id>/ (without test/, fixtures/, dot files). All files are 0644: plugins run by
// extension through an interpreter, so the x bit isn't needed and doesn't carry over between macOS and Windows.
export function packPlugin(info) {
  return packTarGz(info.pack.map((f) => ({ path: `${info.id}/${f.rel}`, data: readFileSync(f.abs), mode: 0o644 })));
}

// ---------- permissions at a revision ----------

// Permissions of all plugins in a directory. → Map(id → permissions)
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
  if (!/^[\w./~^@{}-]{1,200}$/.test(ref) || ref.startsWith("-")) throw new Error(`suspicious revision: ${ref}`);
}

// Permissions at a git revision (object reads only: ls-tree + show). → Map(id → permissions)
export function permissionsAtRef(root, ref) {
  const out = new Map();
  for (const [id, meta] of metaAtRef(root, ref)) out.set(id, permissionsFromMeta(meta));
  return out;
}

// Metadata of the plugins' main files at a git revision. → Map(id → meta)
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

// Plugins whose archive files changed since revision ref while the version stayed the same: the archive
// <id>-<version>.tar.gz in the "index" release would be overwritten with different content, and a client with the old
// index would get registry:sha256 on install. The comparison is git diff of the revision against the working tree
// (respecting .gitattributes), plus untracked files. → [{ id, version, files: [rel] }]
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

// Permission diff between revisions. → [{ id, change: "new"|"changed"|"removed", added, removed }]
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
  if (!diff.length) return "Plugin permissions did not change.\n";
  const lines = ["## Plugin permission changes", "", "A second reviewer (CODEOWNERS) is needed if permissions grew.", ""];
  for (const d of diff) {
    lines.push(`### ${d.id} — ${{ new: "new plugin", changed: "permissions changed", removed: "plugin removed" }[d.change]}`);
    for (const p of d.added) lines.push(`- \`+ ${p.kind}\` ${p.what}${p.why ? ` — ${p.why}` : ""}`);
    for (const p of d.removed) lines.push(`- \`- ${p.kind}\` ${p.what}`);
    lines.push("");
  }
  return lines.join("\n");
}
