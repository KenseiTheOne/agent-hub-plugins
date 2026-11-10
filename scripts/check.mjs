#!/usr/bin/env node
// Registry check — one entry point for CI and authors (scripts/check.sh).
//
//   node scripts/check.mjs [--base <git revision> | --base-dir <directory>] [--report <file.json>] [--skip-tests]
//                          [--only <id>] [--root <registry directory>] [--perms-only]
//
// --perms-only — the permission diff only: plugin metadata under --root is read as data, neither plugins nor their
// tests run, vendoring isn't checked. This way CI (the perms job) computes permission growth with the base branch's
// scripts over the PR's files and doesn't execute PR code in the same job (otherwise a plugin test could replace the
// report script).
//
// 1. Vendoring: the copies of the core parsers (scripts/vendor/) match VENDOR.json (and agent-hub, if it's next door).
// 2. blocklist.json, official.json — shape.
// 3. Each plugins/<id>/: structure, metadata via the same parser the daemon uses, the permission linter (forbidden
//    paths; third-party plugins get only open.*, session.focus and cmux.focus — deprecated in favour of
//    session.focus <sessionId> since contract 3 — and no <agenthub.action>).
// 4. The permission diff against the base revision (--base / --base-dir): printed, $GITHUB_STEP_SUMMARY, --report.
// 5. Tests on a synthetic HOME: a smoke run of the plugin (HOME = a copy of fixtures/home or an empty directory,
//    environment cleaned like the daemon does, 5 s timeout) + plugins/<id>/test/*.test.mjs via node --test.
//    Tests have no network and no secrets: CI gives no secrets to a PR from a fork, and tests must work offline.
// Exit code: 0 — all good, 1 — errors, 2 — bad invocation.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEffectSpec, parseOutput } from "./vendor/output.mjs";
import { effectUnderCeiling, THIRD_PARTY_EFFECTS } from "./vendor/perms.mjs";
import { parseFileName } from "./vendor/meta.mjs";
import { checkVendor } from "./sync-vendor.mjs";
import { isMain } from "./lib/is-main.mjs";
import { diffMarkdown, inspectPlugin, permissionsAtDir, permissionsAtRef, permissionsDiff, pluginIds, readBlocklist, readOfficial, unbumpedChanges } from "./lib/registry.mjs";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = { darwin: "macos", win32: "windows", linux: "linux" }[process.platform] || process.platform;
const RUN_TIMEOUT_MS = 5000;

function parseArgs(argv) {
  const o = { root: SCRIPT_ROOT, base: null, baseDir: null, report: null, skipTests: false, only: null, permsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a}: needs an argument`);
      return argv[++i];
    };
    if (a === "--base") o.base = next();
    else if (a === "--base-dir") o.baseDir = resolve(next());
    else if (a === "--report") o.report = resolve(next());
    else if (a === "--root") o.root = resolve(next());
    else if (a === "--only") o.only = next();
    else if (a === "--skip-tests") o.skipTests = true;
    else if (a === "--perms-only") o.permsOnly = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

function interpreter(ext) {
  if (["mjs", "js", "cjs"].includes(ext)) return [process.execPath];
  if (ext === "py") return [process.platform === "win32" ? "python" : "/usr/bin/python3"];
  if (ext === "sh" || ext === "bash") return [process.platform === "win32" ? "bash" : "/bin/bash"];
  if (ext === "zsh") return ["/bin/zsh"];
  return null;
}

// Environment like the daemon's (daemon/lib/runner.mjs buildEnv), with a synthetic HOME.
export function pluginEnv(id, home) {
  const data = join(home, ".agenthub-data", id);
  const cache = join(home, ".agenthub-cache", id);
  mkdirSync(data, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const env = {
    HOME: home,
    PATH: process.platform === "win32" ? process.env.PATH || "" : "/usr/bin:/bin:/usr/sbin:/sbin",
    TMPDIR: tmpdir(),
    LANG: "en_US.UTF-8",
    USER: "agenthub-ci",
    AGENTHUB_PLUGIN_ID: id,
    AGENTHUB_PLUGIN_DATA_PATH: data,
    AGENTHUB_PLUGIN_CACHE_PATH: cache,
    AGENTHUB_REFRESH_REASON: "FirstLaunch",
    OS_PLATFORM: PLATFORM,
  };
  if (process.platform === "win32") {
    // no Windows process starts without these; there are no secrets here
    for (const k of ["SystemRoot", "windir", "COMSPEC", "PATHEXT"]) if (process.env[k]) env[k] = process.env[k];
    env.USERPROFILE = home;
  }
  return env;
}

function syntheticHome(info) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ahp-home-")));
  if (info.hasFixtures) {
    const src = join(info.dir, "fixtures", "home");
    try {
      cpSync(src, home, { recursive: true });
    } catch {}
  }
  return home;
}

// Smoke run. → { ok, errors, output }
export function smokeRun(info) {
  return new Promise((resolveRun) => {
    const errors = [];
    const fn = parseFileName(info.main);
    const interp = interpreter(fn.ext);
    if (!interp) return resolveRun({ ok: false, errors: [`no interpreter for .${fn.ext}`] });
    const home = syntheticHome(info);
    const streamable = info.meta.type === "streamable";
    const child = spawn(interp[0], [...interp.slice(1), join(info.dir, info.main)], {
      cwd: info.dir,
      env: pluginEnv(info.id, home),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let out = "";
    let done = false;
    const finish = (extraErr) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
      if (extraErr) errors.push(extraErr);
      rmSync(home, { recursive: true, force: true });
      const frame = streamable ? out.split(/\r?\n~~~\r?\n?/)[0] : out;
      errors.push(...outputErrors(info, frame));
      resolveRun({ ok: errors.length === 0, errors, output: frame });
    };
    const timer = setTimeout(() => finish(streamable ? "streamable: no first frame (~~~) within 5 s" : "5 s timeout"), RUN_TIMEOUT_MS);
    child.stdout.on("data", (c) => {
      out += c;
      if (out.length > 1024 * 1024) finish("output over 1 MB");
      else if (streamable && /(^|\n)~~~\r?(\n|$)/.test(out)) finish();
    });
    child.stderr.on("data", () => {});
    child.on("error", (e) => finish(`failed to start: ${e.code || e.message}`));
    child.on("exit", (code) => {
      if (streamable) return finish(/(^|\n)~~~/.test(out) ? null : `streamable exited (code ${code}) without a frame`);
      finish(code === 0 ? null : `exit code ${code}`);
    });
    if (streamable) child.stdin.write(JSON.stringify({ type: "refresh", reason: "FirstLaunch" }) + "\n");
    else child.stdin.end();
  });
}

// Output: format; effects only from the declared ones and under the ceiling (THIRD_PARTY_EFFECTS: open.*, session.focus
// and the deprecated cmux.focus — for all registry plugins); action= — official only, declared only, with arg= matching
// the pattern from the metadata.
export function outputErrors(info, text) {
  const errors = [];
  const parsed = parseOutput(text);
  if (!parsed.header.length) errors.push("empty output header");
  for (const w of parsed.warnings) errors.push(`output: ${w}`);
  const declared = info.permissions?.effects || [];
  for (const item of [...parsed.header, ...parsed.body]) {
    // the core turns href= into open.url without a declaration; effect= — only from <agenthub.effects>
    if (item.effect) {
      const spec = parseEffectSpec(item.effect);
      if (!spec) errors.push(`output: effect "${String(item.effect).slice(0, 40)}" could not be parsed`);
      else if (!effectUnderCeiling(spec.primitive, THIRD_PARTY_EFFECTS)) errors.push(`output: effect ${spec.primitive} is not available to a registry plugin (only ${THIRD_PARTY_EFFECTS.join(", ")}; cmux.focus is deprecated — use session.focus <sessionId>)`);
      else if (!effectUnderCeiling(spec.primitive, declared)) errors.push(`output: effect ${spec.primitive} is not declared in <agenthub.effects>`);
    }
    if (item.href && !/^https?:\/\//i.test(item.href)) errors.push(`output: href must be http(s)`);
    if (item.action && !info.official) errors.push(`output: action=${item.action} — actions are for official plugins only`);
    else if (item.action) {
      const a = (info.meta?.actions || []).find((x) => x.id === item.action);
      const arg = item.params?.arg;
      if (!a) errors.push(`output: action=${item.action} is not declared in <agenthub.action>`);
      else if (a.arg && (typeof arg !== "string" || arg.startsWith("-") || !new RegExp(`^(?:${a.arg.pattern})$`, "u").test(arg))) errors.push(`output: action=${item.action} arg=${String(arg).slice(0, 40)} doesn't match the pattern ${a.arg.pattern}`);
      else if (!a.arg && arg !== undefined) errors.push(`output: action=${item.action}: arg is not declared`);
    }
  }
  return errors;
}

function runPluginTests(info) {
  const home = syntheticHome(info);
  const env = { ...pluginEnv(info.id, home), AGENTHUB_PLUGIN_FILE: join(info.dir, info.main), AGENTHUB_FIXTURES: join(info.dir, "fixtures") };
  if (process.platform !== "win32") env.PATH = `${dirname(process.execPath)}:${env.PATH}`;
  const r = spawnSync(process.execPath, ["--test", ...info.tests], { cwd: info.dir, env, encoding: "utf8", timeout: 120_000 });
  rmSync(home, { recursive: true, force: true });
  return { ok: r.status === 0, output: `${r.stdout || ""}${r.stderr || ""}`.slice(-4000) };
}

export async function runCheck(opts) {
  const report = { ok: true, vendor: null, registry: [], plugins: [], diff: [] };
  const fail = (bucket, msg) => {
    report.ok = false;
    bucket.push(msg);
  };
  if (opts.permsOnly) {
    if (!opts.base && !opts.baseDir) throw new Error("--perms-only: needs a base (--base or --base-dir)");
    const base = opts.baseDir ? permissionsAtDir(opts.baseDir) : permissionsAtRef(opts.root, opts.base);
    report.diff = permissionsDiff(base, permissionsAtDir(opts.root));
    report.permissionsGrew = report.diff.some((d) => d.added.length);
    report.vendor = { ok: true, skipped: true, problems: [], drift: [] };
    return report;
  }
  // 1. vendoring (the copies in this repo, not under --root: --root is for tests with a temporary registry)
  const v = checkVendor();
  report.vendor = v;
  if (!v.ok) report.ok = false;
  // 2. registry files
  let official = new Set();
  try {
    official = readOfficial(opts.root);
  } catch (e) {
    fail(report.registry, e.message);
  }
  try {
    const bl = readBlocklist(opts.root);
    for (const e of bl.errors) fail(report.registry, e);
  } catch (e) {
    fail(report.registry, `blocklist.json: ${e.message}`);
  }
  for (const id of official) if (!pluginIds(opts.root).includes(id)) report.registry.push(`official.json: ${id} is not in plugins/ yet (warning)`);
  // 3. plugins
  const ids = pluginIds(opts.root).filter((id) => !opts.only || id === opts.only);
  for (const id of ids) {
    const info = inspectPlugin(opts.root, id, { official });
    const rec = { id, official: info.official, errors: [...info.errors], warnings: info.warnings, smoke: null, tests: null };
    const platformOk = info.meta && (!info.meta.platforms.length || info.meta.platforms.includes(PLATFORM));
    if (!opts.skipTests && info.main && info.meta && platformOk) {
      const s = await smokeRun(info);
      rec.smoke = s.ok ? "ok" : "fail";
      rec.errors.push(...s.errors.map((e) => `run: ${e}`));
      if (info.tests.length) {
        const t = runPluginTests(info);
        rec.tests = t.ok ? "ok" : "fail";
        if (!t.ok) rec.errors.push(`test/: failed\n${t.output}`);
      }
    } else if (!platformOk && info.meta) rec.smoke = `skip (${PLATFORM})`;
    if (rec.errors.length) report.ok = false;
    report.plugins.push(rec);
  }
  // 4. a change without a new version (only with --base: needs git history) — the archive of the same version would be overwritten
  if (opts.base) {
    for (const u of unbumpedChanges(opts.root, opts.base)) {
      const rec = report.plugins.find((p) => p.id === u.id);
      if (!rec) continue;
      rec.errors.push(`files changed since ${opts.base} (${u.files.slice(0, 5).join(", ")}${u.files.length > 5 ? ", …" : ""}), but the version is the same (${u.version}) — bump the version: otherwise the published archive ${u.id}-${u.version}.tar.gz gets overwritten with different content`);
      report.ok = false;
    }
  }
  // 5. permission diff
  if (opts.base || opts.baseDir) {
    const base = opts.baseDir ? permissionsAtDir(opts.baseDir) : permissionsAtRef(opts.root, opts.base);
    report.diff = permissionsDiff(base, permissionsAtDir(opts.root));
    report.permissionsGrew = report.diff.some((d) => d.added.length);
  }
  return report;
}

function printReport(r) {
  const lines = [];
  for (const p of r.vendor?.problems || []) lines.push(`✗ vendoring: ${p}`);
  for (const p of r.vendor?.drift || []) lines.push(`! vendoring: ${p}`);
  for (const m of r.registry) lines.push(`${m.includes("(warning)") ? "!" : "✗"} ${m}`);
  for (const p of r.plugins) {
    lines.push(`${p.errors.length ? "✗" : "✓"} ${p.id}${p.official ? " [official]" : ""}${p.smoke ? ` run: ${p.smoke}` : ""}${p.tests ? ` tests: ${p.tests}` : ""}`);
    for (const e of p.errors) lines.push(`    ✗ ${e}`);
    for (const w of p.warnings) lines.push(`    ! ${w}`);
  }
  if (r.diff.length) lines.push("", diffMarkdown(r.diff));
  lines.push(r.ok ? "Check passed." : "Check FAILED.");
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  let r;
  try {
    r = await runCheck(opts);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  console.log(printReport(r));
  if (opts.report) writeFileSync(opts.report, JSON.stringify(r, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY && (opts.base || opts.baseDir)) appendFileSync(process.env.GITHUB_STEP_SUMMARY, diffMarkdown(r.diff) + "\n");
  process.exit(r.ok ? 0 : 1);
}
