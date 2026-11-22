// The codex plugin (agent-hub-plugins/plugins/codex/codex.30s.mjs) on a synthetic HOME: a copy of fixtures/home in a
// temporary directory. The real ~/.codex is never read or written.
// Run: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/codex/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOutput, pluginDir, readPluginMeta, tempHome, testEnv } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "codex.30s.mjs");
const FIX = join(DIR, "fixtures");
const mod = await import(pathToFileURL(PLUGIN).href);
const POSIX = { skip: process.platform === "win32" ? "file modes and symlinks" : false };
const MARKERS = ["fixture-secret-do-not-print", "fixture-transcript-text-do-not-print"];

function makeHome({ fixture = true } = {}) {
  const home = tempHome("ah-cx-");
  if (fixture) cpSync(join(FIX, "home"), home, { recursive: true });
  return home;
}
const env = (home, extra = {}) => testEnv(home, { AGENTHUB_PLUGIN_DATA_PATH: join(home, "data"), ...extra });
function run(home, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  const parsed = parseOutput(r.stdout);
  assert.deepEqual(parsed.warnings, []);
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m), `marker ${m} in the output`);
  return { text: r.stdout, parsed };
}
function act(home, args, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m));
  const lines = r.stdout.trim().split("\n");
  const message = lines.find((l) => l.startsWith("message="))?.slice(8) ?? null;
  return { out: lines.at(-1), code: r.status, ...(message ? { message } : {}) };
}
const cfgPath = (home) => join(home, ".codex", "config.toml");
const cfg = (home) => readFileSync(cfgPath(home), "utf8");
const setCfg = (home, text) => writeFileSync(cfgPath(home), text);
const withHome = (fn, opts) => () => {
  const home = makeHome(opts);
  try {
    return fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};
// In-process actions read AGENTHUB_PLUGIN_DATA_PATH (backups) from process.env
function inProc(home, fn) {
  const prev = process.env.AGENTHUB_PLUGIN_DATA_PATH;
  process.env.AGENTHUB_PLUGIN_DATA_PATH = join(home, "data");
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.AGENTHUB_PLUGIN_DATA_PATH;
    else process.env.AGENTHUB_PLUGIN_DATA_PATH = prev;
  }
}

test("metadata: contract 3, reads only config.toml, models_cache.json and version.json, writes only config.toml; two immediate actions", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.id, "codex");
  assert.equal(pm.meta.contract, 3);
  const what = (k) => pm.meta[k].map((e) => e.split(" — ")[0]);
  assert.deepEqual(what("fsRead"), ["~/.codex/config.toml", "~/.codex/models_cache.json", "~/.codex/version.json"]);
  // the dependency check is a file every Codex run creates (app-server's resolve_installation_id), not the ~/.codex
  // folder: the hub linter refuses a check path that covers ~/.codex/sessions
  assert.deepEqual(pm.meta.requires.map((r) => r.check), ["~/.codex/installation_id"]);
  assert.deepEqual(what("fsWrite"), ["~/.codex/config.toml"]);
  assert.deepEqual(what("watch"), ["~/.codex/config.toml", "~/.codex/models_cache.json"]);
  assert.deepEqual(pm.meta.exec ?? [], []);
  assert.deepEqual(
    pm.meta.actions.map((a) => [a.id, a.level, a.arg?.name ?? null]),
    [
      ["set-model", "immediate", "model"],
      ["set-effort", "immediate", "level"],
    ],
  );
  const src = readFileSync(PLUGIN, "utf8");
  for (const w of src.match(/^\/\/ <agenthub\.(?:exec|fsRead|fsWrite|watch)[^>]*>[^—]*/gm)) assert.doesNotMatch(w, /[А-Яа-яЁё]/, w);
  // Codex's sign-in file, conversations, history and sqlite state are off-limits: the plugin doesn't even name them
  const signIn = ["auth", "json"].join(".");
  assert.ok(!src.includes(signIn));
  assert.doesNotMatch(src, /\.codex[\\/]+(?:sessions|history|archived_sessions)|sqlite/i);
  // the action patterns match the checks in the code
  const pat = Object.fromEntries(pm.meta.actions.map((a) => [a.id, new RegExp(a.arg.pattern)]));
  for (const ok of ["default", "gpt-6.1-terra", "demo-beta"]) assert.ok(pat["set-model"].test(ok), ok);
  for (const bad of ["-rf", "GPT", "a b", "x".repeat(65)]) assert.ok(!pat["set-model"].test(bad), bad);
  for (const ok of ["default", "low", "xhigh", "ultra", "persistent"]) assert.ok(pat["set-effort"].test(ok), ok);
  for (const bad of ["-x", "High", "1"]) assert.ok(!pat["set-effort"].test(bad), bad);
});

test("Codex not installed (no ~/.codex) — a \"not installed\" frame, status=unknown; actions refuse with no-codex", withHome((home) => {
  const { parsed } = run(home);
  assert.equal(parsed.status, "unknown");
  assert.deepEqual(act(home, ["set-model", "default"]), { out: "reason=no-codex", code: 3, message: "Codex не установлен: нет папки ~/.codex." });
}, { fixture: false }));

test("page: model is a dropdown of listed models (priority order, hidden and invalid ids skipped), effort a segment of the model's levels; ru and en", withHome((home) => {
  let { text, parsed } = run(home, { AGENTHUB_LANG: "en" });
  assert.equal(parsed.status, "ok");
  assert.match(text, /^Base: Demo Beta · medium \| status=ok tile="Demo Beta · medium" tileLabel=Codex$/m);
  assert.match(text, /^Model \| select=true\n--Default \(Demo Alpha\) \| action=set-model arg=default\n--Demo Alpha \| action=set-model arg=demo-alpha\n--Demo Beta \| selected=true\nEffort \| segment=true\n/m);
  assert.match(text, /^--default \| action=set-effort arg=default tooltip="the model's default level — medium"\n--low \| action=set-effort arg=low\n--medium \| selected=true\n--high \| action=set-effort arg=high\n/m);
  assert.doesNotMatch(text, /Hidden|Not an id|ultra/);
  ({ text } = run(home));
  assert.match(text, /^Базовые: Demo Beta · medium \| status=ok/m);
  assert.match(text, /^--По умолчанию \(Demo Alpha\) \| action=set-model arg=default$/m);
  assert.match(text, /^Пишется в ~\/\.codex\/config\.toml/m);
}));

test("page: no model key — Default (the first listed model) is selected, effort shows that model's levels and default", withHome((home) => {
  setCfg(home, "[projects.\"/work/demo\"]\ntrust_level = \"trusted\"\n");
  const { text } = run(home, { AGENTHUB_LANG: "en" });
  assert.match(text, /^Base: default \(Demo Alpha\) · default \(low\) \| status=ok tile="Demo Alpha · low"/m);
  assert.match(text, /^--Default \(Demo Alpha\) \| selected=true$/m);
  assert.match(text, /^--default \| selected=true tooltip="the model's default level — low"$/m);
  assert.match(text, /^--ultra \| action=set-effort arg=ultra$/m);
}));

test("page: a hidden or unknown model stays visible as an extra item; an unsupported level is orange; a top-level profile and odd keys get a warning", withHome((home) => {
  setCfg(home, 'model = "demo-hidden"\nmodel_reasoning_effort = "ultra"\nprofile = "work"\n');
  let { text } = run(home, { AGENTHUB_LANG: "en" });
  assert.match(text, /^--Demo Hidden \| selected=true note="not in Codex's list"$/m);
  assert.match(text, /^--ultra \| selected=true color=#FFB454$/m);
  assert.match(text, /^Demo Hidden has no ultra level \| color=#FFB454$/m);
  assert.match(text, /^config\.toml has a profile = "work" line: Codex refuses to start with it — remove it and pick a profile with --profile \| color=#FFB454$/m);
  assert.match(text, /^For a single run they are overridden by --profile, -c and a project's \.codex\/config\.toml \| color=#8E8E93$/m);
  setCfg(home, 'model = "someone-elses-model"\n');
  ({ text } = run(home, { AGENTHUB_LANG: "en" }));
  assert.match(text, /^--someone-elses-model \| selected=true note="not in Codex's list"$/m);
  assert.match(text, /^Codex's list has no someone-elses-model — its effort levels are unknown/m);
  setCfg(home, "model = [\n  \"a\",\n]\nmodel_reasoning_effort = 3\n");
  ({ text } = run(home, { AGENTHUB_LANG: "en" }));
  assert.match(text, /^Base: \? · \? \| status=ok/m);
  assert.match(text, /^model, model_reasoning_effort in config\.toml is written in a form the plugin doesn't edit/m);
}));

test("page: no models_cache.json — the current values and a hint to start Codex; set-model refuses no-models, default still works", withHome((home) => {
  rmSync(join(home, ".codex", "models_cache.json"));
  const { text } = run(home, { AGENTHUB_LANG: "en" });
  assert.match(text, /^Base: demo-beta · medium/m);
  assert.match(text, /^The model list appears once Codex fetches it/m);
  assert.equal(act(home, ["set-model", "demo-alpha"]).out, "reason=no-models");
  assert.equal(act(home, ["set-effort", "high"]).out, "reason=no-models");
  assert.equal(act(home, ["set-model", "default"]).out, "ok");
  assert.doesNotMatch(cfg(home), /^model =/m);
}));

test("page: a root line the plugin can't parse — status=error, and actions don't write", withHome((home) => {
  const broken = 'model = "demo-beta"\nthis is not toml\n[t]\n';
  setCfg(home, broken);
  const { text, parsed } = run(home, { AGENTHUB_LANG: "en" });
  assert.equal(parsed.status, "error");
  assert.match(text, /couldn't parse line 2 before the first table/);
  assert.equal(act(home, ["set-model", "demo-alpha"]).out, "reason=config-unparsed");
  assert.equal(act(home, ["set-effort", "default"]).out, "reason=config-unparsed");
  assert.equal(cfg(home), broken);
}));

// ---------- the config.toml editor ----------
test("editor: replacing a value keeps the key spelling, spacing, trailing comment and every other byte", () => {
  const t = readFileSync(join(FIX, "home", ".codex", "config.toml"), "utf8");
  const out = mod.setRootKey(t, "model", "demo-alpha");
  assert.equal(out, t.replace('model = "demo-beta"   # picked by hand', 'model = "demo-alpha"   # picked by hand'));
  assert.equal(mod.setRootKey(out, "model", "demo-beta"), t, "a round trip gives the file back byte for byte");
  // quoted key and literal string, odd spacing, tabs
  const t2 = "\"model\"\t=  'demo-beta'  # x\n";
  assert.equal(mod.setRootKey(t2, "model", "demo-alpha"), "\"model\"\t=  \"demo-alpha\"  # x\n");
  assert.deepEqual(mod.readRoot(t2).model, { state: "ok", value: "demo-beta" });
});

test("editor: a new key goes after the last root entry; none — before the first table and its comments, with a blank line; no tables — at the end", () => {
  const t = 'approval_policy = "never"\n\n# servers\n[mcp_servers.x]\ncommand = "x"\n';
  assert.equal(mod.setRootKey(t, "model", "m1"), 'approval_policy = "never"\nmodel = "m1"\n\n# servers\n[mcp_servers.x]\ncommand = "x"\n');
  const t2 = '# Codex\n\n# projects I trust\n# (two lines)\n[projects."/x"]\ntrust_level = "trusted"\n';
  assert.equal(mod.setRootKey(t2, "model", "m1"), '# Codex\n\nmodel = "m1"\n\n# projects I trust\n# (two lines)\n[projects."/x"]\ntrust_level = "trusted"\n');
  const real = '[projects."/Users/demo"]\ntrust_level = "trusted"\n'; // the shape Codex writes on first trust
  assert.equal(mod.setRootKey(real, "model_reasoning_effort", "high"), `model_reasoning_effort = "high"\n\n${real}`);
  assert.equal(mod.setRootKey("", "model", "m1"), 'model = "m1"\n');
  assert.equal(mod.setRootKey("# only a comment", "model", "m1"), '# only a comment\nmodel = "m1"\n');
  assert.equal(mod.setRootKey('a = 1', "model", "m1"), 'a = 1\nmodel = "m1"\n');
});

test("editor: removing a key drops only its line; removing an absent key changes nothing", () => {
  const t = '# c\nmodel = "m1" # mine\nmodel_reasoning_effort = "high"\n[t]\nmodel = "inner"\n';
  assert.equal(mod.setRootKey(t, "model", null), '# c\nmodel_reasoning_effort = "high"\n[t]\nmodel = "inner"\n');
  assert.equal(mod.setRootKey('a = 1\n[t]\nmodel = "inner"\n', "model", null), 'a = 1\n[t]\nmodel = "inner"\n', "a key inside a table isn't the root key");
});

test("editor: CRLF files get CRLF lines, a BOM stays", () => {
  const t = '﻿a = 1\r\n[t]\r\nb = 2\r\n';
  assert.equal(mod.setRootKey(t, "model", "m1"), '﻿a = 1\r\nmodel = "m1"\r\n[t]\r\nb = 2\r\n');
  const t2 = '﻿[t]\r\nb = 2\r\n';
  assert.equal(mod.setRootKey(t2, "model", "m1"), '﻿model = "m1"\r\n\r\n[t]\r\nb = 2\r\n');
  assert.equal(mod.setRootKey('model = "a"\r\n', "model", "b"), 'model = "b"\r\n');
});

test("editor: '[' inside strings, multi-line strings and nested arrays is not a table header", () => {
  const t = [
    'notify = [',
    '  ["nested", "array"],',
    '  "[not a header]", # comment with [brackets]',
    ']',
    'instructions = """',
    '[also not a header]',
    'still the string """',
    "lit = '''",
    "[nope]'''",
    'tbl = { a = "[x]", b = [1, 2] }',
    'when = 1979-05-27 07:32:00Z',
    '[real]',
    'x = 1',
    '',
  ].join("\n");
  const p = mod.parseRoot(t);
  assert.ok(!p.error, JSON.stringify(p));
  assert.deepEqual(p.entries.map((e) => e.path.join(".")), ["notify", "instructions", "lit", "tbl", "when"]);
  assert.equal(t.slice(p.headerAt, p.headerAt + 6), "[real]");
  assert.equal(mod.setRootKey(t, "model", "m1"), t.replace("when = 1979-05-27 07:32:00Z\n", 'when = 1979-05-27 07:32:00Z\nmodel = "m1"\n'));
});

test("editor: refuses what it can't edit unambiguously — multi-line, dotted, repeated, a table, not a string; refuses other keys and bad values", () => {
  const refused = (t, key = "model", v = "m1") => {
    try {
      mod.setRootKey(t, key, v);
    } catch (e) {
      return e.message;
    }
    return "written";
  };
  assert.equal(refused('model = """\nm0"""\n'), "config-odd");
  assert.equal(refused('model.name = "m0"\n'), "config-odd");
  assert.equal(refused('"model" . x = 1\n'), "config-odd");
  assert.equal(refused('model = "a"\nmodel = "b"\n'), "config-odd");
  assert.equal(refused('model = "a"\n"model" = "b"\n'), "config-odd");
  assert.equal(refused('a = 1\n[model]\nname = "x"\n'), "config-odd");
  assert.equal(refused('a = 1\n[ "model" . sub ]\n'), "config-odd");
  assert.equal(refused("model = 5\n"), "config-odd");
  assert.equal(refused("model = ['a']\n"), "config-odd");
  assert.equal(refused('model = "a"\n', "model", null), "written", "removing a plain key is fine");
  assert.equal(refused('model = """\nm0"""\n', "model", null), "config-odd", "nor is a multi-line one removed");
  assert.equal(refused("x = \n"), "config-unparsed");
  assert.equal(refused('x = "unterminated\n'), "config-unparsed");
  assert.equal(refused("x = [1,\n"), "config-unparsed");
  assert.equal(refused('x = "a" junk\n'), "config-unparsed");
  assert.equal(refused("", "approval_policy", "never"), "not-allowed");
  assert.equal(refused("", "model", 'x"\n[evil]'), "bad-arg");
  assert.equal(refused("", "model_reasoning_effort", "High"), "bad-arg");
});

// ---------- writing ----------
test("write: other bytes and the file mode are kept, a 0600 copy goes to the plugin's data (20 kept), the temp file never stays", POSIX, withHome((home) => {
  chmodSync(cfgPath(home), 0o640);
  const before = cfg(home);
  inProc(home, () => {
    for (let i = 0; i < 23; i++) assert.deepEqual(mod.runAction(["set-effort", i % 2 ? "low" : "high"], { home, now: Date.UTC(2026, 10, 22, 0, 0, i) }), { ok: true });
  });
  assert.equal(statSync(cfgPath(home)).mode & 0o777, 0o640);
  assert.equal(cfg(home), before.replace('model_reasoning_effort = "medium"', 'model_reasoning_effort = "high"'));
  const backups = readdirSync(join(home, "data", "backups"));
  assert.equal(backups.length, mod.KEEP_BACKUPS);
  assert.ok(backups.every((n) => /^config\.toml\..+-agenthub$/.test(n)));
  assert.equal(statSync(join(home, "data", "backups", backups[0])).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(join(home, ".codex")).filter((n) => n.includes(".agenthub-")), []);
}));

test("write: no config.toml yet — created owner-only with just the key; no data dir — no copy, still written", POSIX, withHome((home) => {
  rmSync(cfgPath(home));
  const r = spawnSync(process.execPath, [PLUGIN, "--action", "set-model", "demo-alpha"], { env: testEnv(home), encoding: "utf8" });
  assert.equal(r.stdout, "ok\n");
  assert.equal(cfg(home), 'model = "demo-alpha"\n');
  assert.equal(statSync(cfgPath(home)).mode & 0o777, 0o600);
  assert.ok(!existsSync(join(home, "data")));
}));

test("write: config.toml is a symlink (dotfiles) — the target changes, the link stays; a dangling link is refused", POSIX, withHome((home) => {
  const real = join(home, "dotfiles", "codex.toml");
  mkdirSync(join(home, "dotfiles"));
  writeFileSync(real, cfg(home));
  rmSync(cfgPath(home));
  symlinkSync(real, cfgPath(home));
  assert.equal(act(home, ["set-model", "demo-alpha"]).out, "ok");
  assert.match(readFileSync(real, "utf8"), /^model = "demo-alpha"/m);
  assert.equal(readdirSync(join(home, ".codex")).includes("config.toml"), true);
  assert.equal(readFileSync(cfgPath(home), "utf8"), readFileSync(real, "utf8"));
  rmSync(real);
  assert.equal(act(home, ["set-model", "demo-beta"]).out, "reason=config-link-broken");
  assert.ok(!existsSync(real));
}));

test("write: the file changed between read and rename — re-read and retry; changed every time — config-busy, file and temp left as they are", POSIX, withHome((home) => {
  let n = 0;
  const once = () => {
    if (n++ === 0) writeFileSync(cfgPath(home), `${cfg(home)}# touched by Codex\n`);
  };
  inProc(home, () => assert.deepEqual(mod.runAction(["set-model", "demo-alpha"], { home, beforeRename: once }), { ok: true }));
  assert.match(cfg(home), /^model = "demo-alpha"/m);
  assert.match(cfg(home), /# touched by Codex\n$/, "the concurrent change survives");
  let k = 0;
  const always = () => writeFileSync(cfgPath(home), `${cfg(home)}# ${k++}\n`);
  inProc(home, () => assert.deepEqual(mod.runAction(["set-model", "demo-beta"], { home, beforeRename: always }), { ok: false, reason: "config-busy" }));
  assert.match(cfg(home), /^model = "demo-alpha"/m);
  assert.deepEqual(readdirSync(join(home, ".codex")).filter((n2) => n2.includes(".agenthub-")), []);
}));

// ---------- actions ----------
test("actions: a listed model; a hidden or unknown one is refused; default removes the key; nothing else in the file moves", withHome((home) => {
  const before = cfg(home);
  assert.deepEqual(act(home, ["set-model", "demo-alpha"]), { out: "ok", code: 0 });
  assert.equal(cfg(home), before.replace('"demo-beta"', '"demo-alpha"'));
  assert.equal(act(home, ["set-model", "demo-hidden"]).out, "reason=unknown-model");
  assert.deepEqual(act(home, ["set-model", "nope"], { AGENTHUB_LANG: "en" }), { out: "reason=unknown-model", code: 3, message: "Codex's list has no such model." });
  assert.equal(act(home, ["set-model", "-rf"]).out, "reason=bad-arg");
  assert.equal(act(home, ["set-model"]).out, "reason=bad-arg");
  assert.equal(act(home, ["set-model", "default"]).out, "ok");
  assert.equal(cfg(home), before.replace('model = "demo-beta"   # picked by hand\n', ""));
  assert.equal(act(home, ["set-model", "default"]).out, "ok", "already default — ok, no change");
  assert.equal(act(home, ["nope"]).out, "reason=unknown-action");
}));

test("actions: effort only from the model's levels (the default model's when none is set); a model switch drops a level the new model lacks", withHome((home) => {
  assert.equal(act(home, ["set-effort", "ultra"]).out, "reason=unsupported-effort", "Demo Beta has no ultra");
  assert.equal(act(home, ["set-effort", "high"]).out, "ok");
  assert.match(cfg(home), /^model_reasoning_effort = "high"$/m);
  assert.equal(act(home, ["set-model", "demo-alpha"]).out, "ok");
  assert.equal(act(home, ["set-effort", "ultra"]).out, "ok");
  assert.equal(act(home, ["set-model", "demo-beta"]).out, "ok");
  assert.doesNotMatch(cfg(home), /model_reasoning_effort/, "ultra isn't a Demo Beta level: back to the model's default");
  assert.equal(act(home, ["set-model", "default"]).out, "ok");
  assert.equal(act(home, ["set-effort", "ultra"]).out, "ok", "no model set: the default model (Demo Alpha) has ultra");
  assert.equal(act(home, ["set-effort", "default"]).out, "ok");
  assert.doesNotMatch(cfg(home), /model_reasoning_effort/);
  setCfg(home, 'model = "someone-elses-model"\n');
  assert.equal(act(home, ["set-effort", "low"]).out, "reason=unknown-model");
  assert.equal(act(home, ["set-effort", "default"]).out, "ok");
  setCfg(home, "model.name = 'x'\n");
  assert.equal(act(home, ["set-effort", "low"]).out, "reason=config-odd");
}));

test("every refusal code has a ru and en text, up to 120 chars, no newline and no \"|\"", () => {
  const src = readFileSync(PLUGIN, "utf8");
  const codes = new Set([...src.matchAll(/(?:reason: |refuse\()"([a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(codes.size >= 10);
  for (const c of codes) {
    for (const lang of ["ru", "en"]) {
      const m = mod.refusalMessage(c, lang);
      assert.ok(m, `${c} ${lang}`);
      assert.ok([...m].length <= 120 && !/[\n|]/.test(m), `${c} ${lang}`);
    }
  }
  assert.deepEqual(mod.refusalLines({ reason: "config-busy" }, "en"), ["message=The settings changed at the same time — try again.", "reason=config-busy"]);
});

test("model list: only the fields the page needs, sorted by priority; ids the actions couldn't write are skipped", withHome((home) => {
  const c = mod.loadModels(home);
  assert.deepEqual(
    c.models.map((m) => [m.slug, m.label, m.listed, m.defaultLevel, m.levels.join(","), m.chatgptOnly]),
    [
      ["demo-alpha", "Demo Alpha", true, "low", "low,medium,high,xhigh,max,ultra", false],
      ["demo-hidden", "Demo Hidden", false, "medium", "medium", false],
      ["demo-beta", "Demo Beta", true, "medium", "low,medium,high", false],
    ],
  );
  assert.equal(mod.defaultModel(c).slug, "demo-alpha");
  assert.deepEqual(Object.keys(c).sort(), ["fetchedAt", "models", "version"]);
  writeFileSync(join(home, ".codex", "models_cache.json"), "{not json");
  assert.equal(mod.loadModels(home), null);
}));

// ---------- review fixes ----------
const refusedBy = (t, key = "model", v = "m1") => {
  try {
    return mod.setRootKey(t, key, v);
  } catch (e) {
    return `refused:${e.message}`;
  }
};

test("editor: table headers are decoded like keys — [\"model\"], ['model'], [\"mod\\u0065l\"], [[ \"model\" ]] make model a table; a header that doesn't parse refuses both keys", () => {
  for (const h of ['["model"]', "['model']", '["mod\\u0065l"]', '["\\x6dodel"]', '[[ "model" ]]', '[ "mod\\U00000065l" . x ]', "[model . x]"]) {
    const t = `a = 1\n${h}\nx = 1\n`;
    assert.equal(refusedBy(t), "refused:config-odd", h);
    assert.equal(refusedBy(t, "model", null), "refused:config-odd", h);
    assert.equal(mod.readRoot(t).model.state, "odd", h);
    assert.equal(refusedBy(t, "model_reasoning_effort", "high"), `a = 1\nmodel_reasoning_effort = "high"\n${h}\nx = 1\n`, `${h}: the other key is fine`);
  }
  for (const h of ['["mod\\q"]', '["model"', "[ ]", "[a.]"]) {
    const t = `a = 1\n${h}\nx = 1\n`;
    assert.equal(refusedBy(t), "refused:config-odd", h);
    assert.equal(refusedBy(t, "model_reasoning_effort", "high"), "refused:config-odd", h);
  }
  assert.deepEqual(mod.tableHeaders('[a]\n[ "b" . c ]  # x\n[[d]]\n', 0), [["a"], ["b", "c"], ["d"]]);
});

test("editor: a header-looking line inside a multi-line string or array after the first table is not a header", () => {
  const cases = [
    'a = 1\n[t]\ns = """\n[model]\n"""\n',
    "a = 1\n[t]\ns = '''\n[model]\n'''\n",
    'a = 1\n[t]\narr = [\n  ["model"],\n  [ "model_reasoning_effort" ],\n]\n',
    'a = 1\n[t]\ninl = {\n  x = """\n[model]"""\n}\n',
  ];
  for (const t of cases) {
    assert.equal(mod.readRoot(t).model.state, "absent", t);
    assert.equal(refusedBy(t), t.replace("a = 1\n", 'a = 1\nmodel = "m1"\n'), t);
    assert.equal(refusedBy(t, "model_reasoning_effort", "high"), t.replace("a = 1\n", 'a = 1\nmodel_reasoning_effort = "high"\n'), t);
  }
  // a real header after such a string is still seen
  assert.equal(refusedBy('a = 1\n[t]\ns = """\n[x]\n"""\n[model]\n'), "refused:config-odd");
});

test("editor: quoted keys and values are decoded as TOML basic strings (\\U, \\x, \\e, a literal tab), not as JSON; what TOML rejects is refused", () => {
  assert.deepEqual(mod.readRoot('"mod\\U00000065l" = "a"\nx = 1\n').model, { state: "ok", value: "a" });
  assert.equal(refusedBy('"mod\\U00000065l" = "a"\nx = 1\n'), '"mod\\U00000065l" = "m1"\nx = 1\n');
  assert.deepEqual(mod.readRoot('"\\x6dodel" = "\\U0001F600"\n').model, { state: "ok", value: "\u{1F600}" });
  assert.deepEqual(mod.readRoot('"a\tb" = 1\nmodel = "x\ty"\n').model, { state: "ok", value: "x\ty" });
  assert.equal(refusedBy('"a\tb" = "\\e"\nmodel = "a"\n'), '"a\tb" = "\\e"\nmodel = "m1"\n');
  assert.equal(mod.decodeString('a\\u00e9\\\\\\"', true), 'aé\\"');
  assert.equal(mod.decodeString("C:\\x", false), "C:\\x", "a literal string keeps backslashes");
  for (const bad of ["\\q", "\\u12", "\\uD800", "\\U00110000", "\\x4", "a\u0001", "a\u007f", "a\\"]) assert.equal(mod.decodeString(bad, true), null, JSON.stringify(bad));
  assert.equal(mod.decodeString("a\u0001", false), null);
  assert.equal(refusedBy('"mod\\q" = 1\n'), "refused:config-unparsed");
  assert.equal(refusedBy('model = "a\u0001"\n'), "refused:config-odd");
  assert.equal(refusedBy('model = "\\uD800"\n'), "refused:config-odd");
});

test("page: a key or value JSON can't decode (\\U escape, literal tab) no longer breaks the page", withHome((home) => {
  setCfg(home, '"mod\\U00000065l" = "demo-alpha"\n"tab\there" = "x\ty"\n[t]\nk = 1\n');
  const { text, parsed } = run(home, { AGENTHUB_LANG: "en" });
  assert.equal(parsed.status, "ok");
  assert.match(text, /^Base: Demo Alpha · default \(low\)/m);
  assert.equal(act(home, ["set-effort", "high"]).out, "ok");
  assert.equal(cfg(home), '"mod\\U00000065l" = "demo-alpha"\n"tab\there" = "x\ty"\nmodel_reasoning_effort = "high"\n[t]\nk = 1\n');
}));

test("editor: a new line takes the line ending of the line next to it, not \"any CRLF in the file\"", () => {
  assert.equal(refusedBy("a = 1\r\nb = 2\n[t]\r\n"), 'a = 1\r\nb = 2\nmodel = "m1"\n[t]\r\n');
  assert.equal(refusedBy("a = 1\nb = 2\r\n"), 'a = 1\nb = 2\r\nmodel = "m1"\r\n');
  assert.equal(refusedBy("a = 1\r\nb = 2\r\nc = 3"), 'a = 1\r\nb = 2\r\nc = 3\r\nmodel = "m1"\r\n', "no newline next to it — the file's most common");
  assert.equal(refusedBy("a = 1\r\nb = 2\nc = 3\nd = 4"), 'a = 1\r\nb = 2\nc = 3\nd = 4\nmodel = "m1"\n');
  assert.equal(refusedBy("[t]\r\nb = 1\n"), 'model = "m1"\r\n\r\n[t]\r\nb = 1\n');
  assert.equal(refusedBy("x = 1\n# about t\r\n[t]\n"), 'x = 1\nmodel = "m1"\n# about t\r\n[t]\n');
  assert.equal(refusedBy("# c\r\n"), '# c\r\nmodel = "m1"\r\n');
  assert.equal(mod.eolNear("", 0), "\n");
});

test("page: a non-openai model_provider or a model_catalog_json warns that the list may not match; openai doesn't", withHome((home) => {
  const warn = /^config\.toml sets (.*): Codex takes its models from there, so this list may not match \| color=#FFB454$/m;
  setCfg(home, 'model = "demo-beta"\nmodel_provider = "openai"\n');
  assert.doesNotMatch(run(home, { AGENTHUB_LANG: "en" }).text, warn);
  setCfg(home, 'model = "demo-beta"\nmodel_provider = "ollama"\n');
  assert.equal(warn.exec(run(home, { AGENTHUB_LANG: "en" }).text)?.[1], 'model_provider = "ollama"');
  setCfg(home, 'model_catalog_json = "/Users/demo/models.json"\n');
  assert.equal(warn.exec(run(home, { AGENTHUB_LANG: "en" }).text)?.[1], "model_catalog_json");
  setCfg(home, "model_provider = 3\nmodel_catalog_json = '/x.json'\n");
  assert.equal(warn.exec(run(home, { AGENTHUB_LANG: "en" }).text)?.[1], "model_provider, model_catalog_json");
  assert.match(run(home).text, /^В config\.toml задан model_provider, model_catalog_json: Codex берёт модели оттуда/m);
}));

test("page: a model with supported_in_api false is marked \"ChatGPT sign-in only\", not hidden", withHome((home) => {
  const p = join(home, ".codex", "models_cache.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  j.models.find((m) => m.slug === "demo-beta").supported_in_api = false;
  writeFileSync(p, JSON.stringify(j));
  let { text } = run(home, { AGENTHUB_LANG: "en" });
  assert.match(text, /^--Demo Alpha \| action=set-model arg=demo-alpha\n--Demo Beta \| selected=true note="ChatGPT sign-in only"$/m);
  setCfg(home, "");
  ({ text } = run(home, { AGENTHUB_LANG: "en" }));
  assert.match(text, /^--Demo Beta \| action=set-model arg=demo-beta note="ChatGPT sign-in only"$/m);
  assert.match(run(home).text, /^--Demo Beta \| action=set-model arg=demo-beta note="только со входом через ChatGPT"$/m);
}));

test("page: version.json names a newer Codex than the one that fetched the list — a \"list may be stale\" note; older, equal, missing or broken — none", withHome((home) => {
  const vp = join(home, ".codex", "version.json");
  const note = /^The model list was fetched by Codex 0\.159\.3 and (\S+) is out: if you've updated, start Codex to refresh the list \| color=#8E8E93$/m;
  assert.doesNotMatch(run(home, { AGENTHUB_LANG: "en" }).text, note, "the fixture's 0.158.0 is older");
  writeFileSync(vp, '{"latest_version":"0.160.0","last_checked_at":"2026-11-21T00:00:00Z"}');
  assert.equal(note.exec(run(home, { AGENTHUB_LANG: "en" }).text)?.[1], "0.160.0");
  assert.match(run(home).text, /^Список моделей скачан Codex 0\.159\.3, а вышел 0\.160\.0/m);
  for (const v of ['{"latest_version":"0.159.3"}', '{"latest_version":"1.0.0-beta"}', "{oops"]) {
    writeFileSync(vp, v);
    assert.doesNotMatch(run(home, { AGENTHUB_LANG: "en" }).text, note, v);
  }
  rmSync(vp);
  assert.doesNotMatch(run(home, { AGENTHUB_LANG: "en" }).text, note);
  assert.equal(mod.newerVersion("0.160.0", "0.159.3"), true);
  assert.equal(mod.newerVersion("0.159.10", "0.159.9"), true);
  assert.equal(mod.newerVersion("1.0.0", "0.999.999"), true);
  assert.equal(mod.newerVersion("0.159.3", "0.159.3"), false);
  assert.equal(mod.newerVersion("0.158.0", "0.159.3"), false);
  assert.equal(mod.newerVersion(null, "0.159.3"), false);
}));

test("page: a profile line in any form gets the warning; a [profiles.*] table alone doesn't", withHome((home) => {
  setCfg(home, "profile = 3\n");
  assert.match(run(home, { AGENTHUB_LANG: "en" }).text, /^config\.toml has a profile line: Codex refuses to start with it/m);
  setCfg(home, '[profiles.work]\nmodel = "demo-alpha"\n');
  assert.doesNotMatch(run(home, { AGENTHUB_LANG: "en" }).text, /profile line/, "Codex ignores a [profiles.*] table; it doesn't fail");
}));

test("editor: set then default above the first table gives back the same bytes (the blank line the insertion added goes too)", () => {
  for (const t of ['[projects."/x"]\ntrust_level = "trusted"\n', "# about t\r\n[t]\r\n", "﻿[t]\n", "a = 1\n\n[t]\n"]) {
    for (const key of ["model", "model_reasoning_effort"]) {
      const set = mod.setRootKey(t, key, key === "model" ? "m1" : "high");
      assert.equal(mod.setRootKey(set, key, null), t, JSON.stringify(t));
    }
  }
  assert.equal(mod.setRootKey('a = 1\nmodel = "x"\n\n[t]\n', "model", null), "a = 1\n\n[t]\n", "after an entry the blank line stays");
  assert.equal(mod.setRootKey('model = "x"\n# c\n[t]\n', "model", null), "# c\n[t]\n");
});
