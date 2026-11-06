#!/usr/bin/env node
// Проверка реестра — один вход для CI и автора (scripts/check.sh).
//
//   node scripts/check.mjs [--base <ревизия git> | --base-dir <каталог>] [--report <файл.json>] [--skip-tests]
//                          [--only <id>] [--root <каталог реестра>] [--perms-only]
//
// --perms-only — только дифф прав: метаданные плагинов --root читаются как данные, ни плагины, ни их тесты
// не запускаются, вендоринг не проверяется. Так CI (job perms) считает рост прав скриптами базовой ветки
// над файлами PR и не исполняет код PR в том же job (иначе тест плагина мог бы подменить скрипт отчёта).
//
// 1. Вендоринг: копии разборщиков ядра (scripts/vendor/) совпадают с VENDOR.json (и с agent-hub, если он рядом).
// 2. blocklist.json, official.json — форма.
// 3. Каждый plugins/<id>/: структура, метаданные тем же парсером, что у демона, линтер прав (запретные пути;
//    сторонним — только open.*, cmux.focus и без <agenthub.action>).
// 4. Дифф прав с базовой ревизией (--base / --base-dir): печать, $GITHUB_STEP_SUMMARY, --report.
// 5. Тесты на синтетическом HOME: пробный запуск плагина (HOME = копия fixtures/home или пустой каталог,
//    окружение очищено как у демона, таймаут 5 с) + plugins/<id>/test/*.test.mjs через node --test.
//    Сети и секретов у тестов нет: в PR из форка CI секретов не даёт, а тесты обязаны работать без сети.
// Код выхода: 0 — всё хорошо, 1 — ошибки, 2 — неверный вызов.

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
      if (i + 1 >= argv.length) throw new Error(`${a}: нужен аргумент`);
      return argv[++i];
    };
    if (a === "--base") o.base = next();
    else if (a === "--base-dir") o.baseDir = resolve(next());
    else if (a === "--report") o.report = resolve(next());
    else if (a === "--root") o.root = resolve(next());
    else if (a === "--only") o.only = next();
    else if (a === "--skip-tests") o.skipTests = true;
    else if (a === "--perms-only") o.permsOnly = true;
    else throw new Error(`неизвестный ключ ${a}`);
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

// Окружение как у демона (daemon/lib/runner.mjs buildEnv), HOME — синтетический.
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
    // без них не стартует ни один процесс Windows; секретов тут нет
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

// Пробный запуск. → { ok, errors, output }
export function smokeRun(info) {
  return new Promise((resolveRun) => {
    const errors = [];
    const fn = parseFileName(info.main);
    const interp = interpreter(fn.ext);
    if (!interp) return resolveRun({ ok: false, errors: [`нет интерпретатора для .${fn.ext}`] });
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
    const timer = setTimeout(() => finish(streamable ? "streamable: нет первого кадра (~~~) за 5 с" : "таймаут 5 с"), RUN_TIMEOUT_MS);
    child.stdout.on("data", (c) => {
      out += c;
      if (out.length > 1024 * 1024) finish("вывод больше 1 МБ");
      else if (streamable && /(^|\n)~~~\r?(\n|$)/.test(out)) finish();
    });
    child.stderr.on("data", () => {});
    child.on("error", (e) => finish(`не запустился: ${e.code || e.message}`));
    child.on("exit", (code) => {
      if (streamable) return finish(/(^|\n)~~~/.test(out) ? null : `streamable вышел (код ${code}) без кадра`);
      finish(code === 0 ? null : `код выхода ${code}`);
    });
    if (streamable) child.stdin.write(JSON.stringify({ type: "refresh", reason: "FirstLaunch" }) + "\n");
    else child.stdin.end();
  });
}

// Вывод: формат, effects только из объявленных и под потолком (open.*, cmux.focus — у всех плагинов реестра),
// action= — только у official, только объявленные, с arg= по шаблону из метаданных.
export function outputErrors(info, text) {
  const errors = [];
  const parsed = parseOutput(text);
  if (!parsed.header.length) errors.push("пустая шапка вывода");
  for (const w of parsed.warnings) errors.push(`вывод: ${w}`);
  const declared = info.permissions?.effects || [];
  for (const item of [...parsed.header, ...parsed.body]) {
    // href= ядро превращает в open.url без объявления; effect= — только из <agenthub.effects>
    if (item.effect) {
      const spec = parseEffectSpec(item.effect);
      if (!spec) errors.push(`вывод: effect «${String(item.effect).slice(0, 40)}» не разобран`);
      else if (!effectUnderCeiling(spec.primitive, THIRD_PARTY_EFFECTS)) errors.push(`вывод: effect ${spec.primitive} плагину реестра недоступен (только ${THIRD_PARTY_EFFECTS.join(", ")})`);
      else if (!effectUnderCeiling(spec.primitive, declared)) errors.push(`вывод: effect ${spec.primitive} не объявлен в <agenthub.effects>`);
    }
    if (item.href && !/^https?:\/\//i.test(item.href)) errors.push(`вывод: href только http(s)`);
    if (item.action && !info.official) errors.push(`вывод: action=${item.action} — действия только у official`);
    else if (item.action) {
      const a = (info.meta?.actions || []).find((x) => x.id === item.action);
      const arg = item.params?.arg;
      if (!a) errors.push(`вывод: action=${item.action} не объявлено в <agenthub.action>`);
      else if (a.arg && (typeof arg !== "string" || arg.startsWith("-") || !new RegExp(`^(?:${a.arg.pattern})$`, "u").test(arg))) errors.push(`вывод: action=${item.action} arg=${String(arg).slice(0, 40)} не по шаблону ${a.arg.pattern}`);
      else if (!a.arg && arg !== undefined) errors.push(`вывод: action=${item.action}: arg не объявлен`);
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
    if (!opts.base && !opts.baseDir) throw new Error("--perms-only: нужна база (--base или --base-dir)");
    const base = opts.baseDir ? permissionsAtDir(opts.baseDir) : permissionsAtRef(opts.root, opts.base);
    report.diff = permissionsDiff(base, permissionsAtDir(opts.root));
    report.permissionsGrew = report.diff.some((d) => d.added.length);
    report.vendor = { ok: true, skipped: true, problems: [], drift: [] };
    return report;
  }
  // 1. вендоринг (копии из этой репы, не из --root: --root нужен тестам с временным реестром)
  const v = checkVendor();
  report.vendor = v;
  if (!v.ok) report.ok = false;
  // 2. файлы реестра
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
  for (const id of official) if (!pluginIds(opts.root).includes(id)) report.registry.push(`official.json: ${id} пока нет в plugins/ (предупреждение)`);
  // 3. плагины
  const ids = pluginIds(opts.root).filter((id) => !opts.only || id === opts.only);
  for (const id of ids) {
    const info = inspectPlugin(opts.root, id, { official });
    const rec = { id, official: info.official, errors: [...info.errors], warnings: info.warnings, smoke: null, tests: null };
    const platformOk = info.meta && (!info.meta.platforms.length || info.meta.platforms.includes(PLATFORM));
    if (!opts.skipTests && info.main && info.meta && platformOk) {
      const s = await smokeRun(info);
      rec.smoke = s.ok ? "ok" : "fail";
      rec.errors.push(...s.errors.map((e) => `запуск: ${e}`));
      if (info.tests.length) {
        const t = runPluginTests(info);
        rec.tests = t.ok ? "ok" : "fail";
        if (!t.ok) rec.errors.push(`test/: не прошли\n${t.output}`);
      }
    } else if (!platformOk && info.meta) rec.smoke = `skip (${PLATFORM})`;
    if (rec.errors.length) report.ok = false;
    report.plugins.push(rec);
  }
  // 4. правка без новой версии (только с --base: нужна история git) — архив той же версии перезаписался бы
  if (opts.base) {
    for (const u of unbumpedChanges(opts.root, opts.base)) {
      const rec = report.plugins.find((p) => p.id === u.id);
      if (!rec) continue;
      rec.errors.push(`файлы изменились относительно ${opts.base} (${u.files.slice(0, 5).join(", ")}${u.files.length > 5 ? ", …" : ""}), а версия та же (${u.version}) — поднимите версию: иначе опубликованный архив ${u.id}-${u.version}.tar.gz перезапишется другим содержимым`);
      report.ok = false;
    }
  }
  // 5. дифф прав
  if (opts.base || opts.baseDir) {
    const base = opts.baseDir ? permissionsAtDir(opts.baseDir) : permissionsAtRef(opts.root, opts.base);
    report.diff = permissionsDiff(base, permissionsAtDir(opts.root));
    report.permissionsGrew = report.diff.some((d) => d.added.length);
  }
  return report;
}

function printReport(r) {
  const lines = [];
  for (const p of r.vendor?.problems || []) lines.push(`✗ вендоринг: ${p}`);
  for (const p of r.vendor?.drift || []) lines.push(`! вендоринг: ${p}`);
  for (const m of r.registry) lines.push(`${m.includes("предупреждение") ? "!" : "✗"} ${m}`);
  for (const p of r.plugins) {
    lines.push(`${p.errors.length ? "✗" : "✓"} ${p.id}${p.official ? " [official]" : ""}${p.smoke ? ` запуск: ${p.smoke}` : ""}${p.tests ? ` тесты: ${p.tests}` : ""}`);
    for (const e of p.errors) lines.push(`    ✗ ${e}`);
    for (const w of p.warnings) lines.push(`    ! ${w}`);
  }
  if (r.diff.length) lines.push("", diffMarkdown(r.diff));
  lines.push(r.ok ? "Проверка пройдена." : "Проверка НЕ пройдена.");
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
