// The claude-code plugin (agent-hub-plugins/plugins/claude-code/claude-code.30s.mjs) on a synthetic HOME.
// ps is a double script in AGENTHUB_TEST_BIN_DIR; the hub's terminal is a hub socket double (a separate process on a
// unix socket in the test's HOME): real tabs, processes and the hub are never touched. The double logs every
// POST /terminal/send-text to hub.log and, by flag files in HOME, answers with hub refusals: typed (prompt-not-empty),
// mixed (prompt-mismatch), unsigned (unverified), notab (no-tab), off (503 disabled), bridge-off (503 bridge-offline),
// late (504 deadline), busy-once
// (session-busy once), slow (wait N s).
// Run: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/claude-code/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { after } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOutput, pluginDir, readPluginMeta, tempHome, testEnv } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "claude-code.30s.mjs");
const FIX = join(DIR, "fixtures");
const HUB = join(FIX, "hub-sessions.json");
const HUB_MODELS = join(FIX, "hub-models.json");
const mod = await import(pathToFileURL(PLUGIN).href);
const POSIX = { skip: process.platform === "win32" ? "the ps double is /bin/sh, the hub double is a unix socket" : false };
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const MARKERS = ["fixture-secret-do-not-print", "fixture-transcript-text-do-not-print"];

const LABEL = { [S1]: "alpha", [S2]: "beta", "33333333-3333-4333-8333-333333333333": "gamma" };
// Hub socket double: a node server in a separate process (the test runs the plugin via spawnSync and can't answer itself)
const HUB_DOUBLE = `
import { createServer } from "node:http";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
const [home, sock] = process.argv.slice(2);
const has = (f) => existsSync(join(home, f));
createServer((req, res) => {
  let t = "";
  req.on("data", (c) => (t += c));
  req.on("end", async () => {
    let b = {};
    try { b = JSON.parse(t); } catch {}
    const reply = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const log = (ok) => appendFileSync(join(home, "hub.log"), JSON.stringify({ path: req.url, sessionId: b.sessionId, text: b.text, ok }) + "\\n");
    if (req.url !== "/terminal/send-text") return reply(404, { error: "not-found" });
    if (has("off")) return reply(503, { error: "terminal:disabled" });
    if (has("bridge-off")) return (log(false), reply(503, { error: "terminal:bridge-offline" }));
    if (has("notab")) return (log(false), reply(409, { error: "terminal:no-tab" }));
    if (has("unsigned")) return (log(false), reply(409, { error: "terminal:unverified" }));
    if (has("typed")) return (log(false), reply(409, { error: "terminal:prompt-not-empty" }));
    if (has("busy-once")) { rmSync(join(home, "busy-once")); log(false); return reply(409, { error: "terminal:session-busy" }); }
    if (has("mixed")) return (log(false), reply(409, { error: "terminal:prompt-mismatch" }));
    log(true); // the typing "reached the terminal" — before the wait, as with the real hub
    if (has("slow")) await new Promise((r) => setTimeout(r, Number(readFileSync(join(home, "slow"), "utf8")) * 1000));
    if (has("late")) return reply(504, { error: "terminal:deadline" });
    reply(200, { ok: true, sessionId: b.sessionId, terminal: "test" });
  });
}).listen(sock);
`;
const doubles = [];
after(() => {
  for (const c of doubles) c.kill("SIGKILL");
});
function startHub(home) {
  const script = join(home, "hub-double.mjs");
  writeFileSync(script, HUB_DOUBLE);
  const sock = join(home, "hub.sock");
  const c = spawn(process.execPath, [script, home, sock], { stdio: "ignore" });
  doubles.push(c);
  const t0 = Date.now();
  while (!existsSync(sock)) {
    if (Date.now() - t0 > 5000) throw new Error("the hub double didn't start");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return sock;
}

// HOME from the fixture + a ps double (all three sessions are alive and are Claude Code) and a hub socket double
function makeHome() {
  const home = tempHome("ah-cc-");
  cpSync(join(FIX, "home"), home, { recursive: true });
  const ip = join(home, ".claude", "plugins", "installed_plugins.json");
  writeFileSync(ip, readFileSync(ip, "utf8").replace("HOME_PLACEHOLDER", home));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const exe = "/Users/demo/.local/share/claude/versions/2.1.321";
  writeFileSync(join(bin, "ps"), `#!/bin/sh\nfor p in 101 202 303; do echo "  $p Mon Nov 10 08:00:00 2026 ${exe}"; done\n`, { mode: 0o755 });
  startHub(home);
  return home;
}
const env = (home, extra = {}) => testEnv(home, { AGENTHUB_TEST_BIN_DIR: join(home, "bin"), AGENTHUB_PLUGIN_DATA_PATH: join(home, "data"), AGENTHUB_HUB_SOCKET: join(home, "hub.sock"), ...extra });
const WITH_HUB = { AGENTHUB_CLAUDE_SESSIONS_FILE: HUB };
const AUTO = { ...WITH_HUB, AGENTHUB_PAUSED: "0" };
function run(home, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  const parsed = parseOutput(r.stdout);
  assert.deepEqual(parsed.warnings, []);
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m), `marker ${m} in the output`);
  return { text: r.stdout, parsed };
}
// input — the text of an input action, as the hub writes it to stdin
function act(home, args, extra = {}, input = "") {
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: env(home, extra), encoding: "utf8", timeout: 10_000, input });
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m));
  const lines = r.stdout.trim().split("\n");
  const message = lines.find((l) => l.startsWith("message="))?.slice(8) ?? null;
  return { out: lines.at(-1), code: r.status, ...(message ? { message } : {}) };
}
const settings = (home) => JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
const writeSettingsFile = (home, obj) => writeFileSync(join(home, ".claude", "settings.json"), `${JSON.stringify(obj, null, 2)}\n`);
const hubLog = (home) => (existsSync(join(home, "hub.log")) ? readFileSync(join(home, "hub.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
// what was typed into tabs: "<session> <line>" from the hub double's log (only what reached the terminal)
const sent = (home) => hubLog(home).filter((x) => x.ok).map((x) => `${LABEL[x.sessionId] || x.sessionId} ${x.text}`);
const state = (home) => JSON.parse(readFileSync(join(home, "data", "state.json"), "utf8"));
const setStatus = (home, pid, from, to) => {
  const f = join(home, ".claude", "sessions", `${pid}.json`);
  writeFileSync(f, readFileSync(f, "utf8").replace(`"${from}"`, `"${to}"`));
};
function hubWith(home, patch) {
  const j = JSON.parse(readFileSync(HUB, "utf8"));
  for (const s of j.sessions) Object.assign(s, patch[s.sessionId] || {});
  const p = join(home, "hub.json");
  writeFileSync(p, JSON.stringify(j));
  return { AGENTHUB_CLAUDE_SESSIONS_FILE: p };
}

test("metadata: contract 3, typing only through the hub terminal (send /model /effort), no cmux or codesign; permissions with a why, actions", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.id, "claude-code");
  assert.equal(pm.meta.contract, 3);
  assert.deepEqual(pm.meta.terminal.map((e) => e.split(" — ")[0]), ["send /model /effort"], "only two slash commands, no read-screen, send * or mode signs");
  assert.deepEqual(pm.meta.effects, ["session.focus"]);
  assert.deepEqual(pm.meta.exec.map((e) => e.split(" ")[0]), ["/bin/ps"], "neither cmux nor codesign: typing and the signature belong to the hub");
  assert.ok(!pm.meta.fsRead.some((e) => /cmux/i.test(e)));
  assert.ok(pm.meta.watch.some((e) => e.startsWith("$AGENTHUB_CLAUDE_SESSIONS_FILE")));
  for (const k of ["fsRead", "watch"]) assert.ok(pm.meta[k].some((e) => e.startsWith("$AGENTHUB_CLAUDE_MODELS_FILE")), k);
  assert.ok(!pm.meta.fsRead.some((e) => e.includes(".claude.json")), "the account file isn't read");
  // the only typed-text action: the id of a model the list doesn't have; the hub checks the text against the pattern
  assert.deepEqual(pm.meta.actions.filter((a) => a.input).map((a) => [a.id, a.input.maxLength, a.arg.pattern]), [["set-model-id", 40, "^claude-[a-z]+-[0-9]{1,2}(?:-[0-9]{1,2})?$"]]);
  assert.deepEqual(
    pm.meta.actions.map((a) => [a.id, a.level, a.arg?.name ?? null]),
    [
      ["set-model", "immediate", "model"],
      ["set-model-id", "immediate", "model"],
      ["set-effort", "immediate", "level"],
      ["effort-max", "confirm-cost", null],
      ["set-style", "immediate", "style"],
      ["ultracode-on", "immediate", null],
      ["ultracode-off", "immediate", null],
      ["context-1m-on", "immediate", null],
      ["context-1m-off", "immediate", null],
      ["apply", "confirm-cost", "session"],
      ["apply-all", "confirm-cost", null],
      ["apply-continue", "confirm-cost", null],
      ["apply-stop", "immediate", null],
      ["apply-done", "immediate", null],
    ],
  );
  const src = readFileSync(PLUGIN, "utf8");
  for (const w of src.match(/^\/\/ <agenthub\.(?:exec|fsRead|fsWrite|watch|terminal)[^>]*>[^—]*/gm)) assert.doesNotMatch(w, /[А-Яа-яЁё]/, w);
  // the plugin knows nothing about a specific terminal: no cmux, its files or its program
  assert.doesNotMatch(src, /cmux/i);
  // transcripts are off-limits: the plugin neither mentions nor reads them
  assert.doesNotMatch(src, /\.claude[\\/]+projects/);
});

test("Claude Code not installed — a \"not installed\" frame, status=unknown", () => {
  const home = tempHome("ah-cc-");
  try {
    const { parsed } = run(home);
    assert.equal(parsed.status, "unknown");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("base: modelSettings beats effortLevel for Opus 5.5; legacy effortLevel for older models; default model = Opus 5.5", () => {
  assert.deepEqual(mod.readBase({ effortLevel: "high", model: "claude-opus-5-5" }), {
    model: "claude-opus-5-5",
    modelArg: "claude-opus-5-5",
    effort: "medium",
    effortFrom: "default",
    maxActive: false,
    envOverride: false,
    envAuto: false,
    maxPendingClear: false,
    context1m: true,
    context1mKind: "default",
    outputStyle: "Default",
    ultracode: false,
  });
  assert.equal(mod.readBase({ effortLevel: "high", model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "low" } } }).effort, "low");
  assert.equal(mod.readBase({ effortLevel: "xhigh", model: "claude-fable-5-1" }).effort, "xhigh");
  assert.equal(mod.readBase({ effortLevel: "high", model: "claude-sonnet-4-6" }).effort, "high", "3.x/4.x — legacy effortLevel works");
  // default model: effort is Opus 5.5's entry, other entries and the legacy effortLevel don't count
  assert.equal(mod.readBase({ modelSettings: { "claude-sonnet-5-5": { effortLevel: "xhigh" } } }).effort, "medium");
  assert.equal(mod.readBase({ effortLevel: "low", modelSettings: { "claude-opus-5-5": { effortLevel: "high" } } }).effort, "high");
  assert.equal(mod.readBase({ model: "opus[1m]" }).model, "claude-opus-5-5");
  assert.equal(mod.readBase({ model: "Opus[1m]" }).modelArg, "opus[1m]", "/model gets it as written");
  assert.equal(mod.readBase({ model: "opusplan" }).model, null);
  const mx = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "max" } });
  assert.deepEqual([mx.effort, mx.maxActive, mx.envOverride], ["max", true, true]);
  // env with a level below max overrides everything too
  const eh = mod.readBase({ model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "medium" } }, env: { CLAUDE_CODE_EFFORT_LEVEL: "High" } });
  assert.deepEqual([eh.effort, eh.maxActive, eh.envOverride], ["high", false, true]);
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "" } }).maxPendingClear, true);
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "" } }).envOverride, false);
  // like Claude Code: ultracode and junk don't override; auto — each model its own default; a number — as is
  assert.equal(mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "ultracode" } }).envOverride, false);
  assert.equal(mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: " high" } }).envOverride, false, "spaces aren't trimmed");
  const au = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "AUTO" } });
  assert.deepEqual([au.effort, au.envOverride, au.envAuto], ["auto", true, true]);
  assert.deepEqual(mod.sessionNow({ sessionId: S1 }, au, new Map([[S1, { model: "claude-fable-5-1", effort: "low", at: 0 }]]), { applied: {} }).effort, "high");
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "32000" } }).effort, "32000");
  assert.equal(mod.readBase({ outputStyle: "default", ultracode: true }).outputStyle, "Default");
});

test("allow list: dangerous keys (env, hooks, permissions, apiKeyHelper, __proto__) are never written", () => {
  for (const path of [["env", "ANTHROPIC_BASE_URL"], ["hooks"], ["permissions", "allow"], ["apiKeyHelper"], ["env"], ["modelSettings", "__proto__", "effortLevel"], ["statusLine"], ["modelSettings", "claude-opus-5-5", "maxEffortLevel"]]) {
    assert.throws(() => mod.applyOps({}, [{ path, value: "x" }]), /not-allowed/, path.join("."));
  }
  const o = mod.applyOps({ a: 1, env: { KEEP: "1" } }, [
    { path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "max" },
    { path: ["modelSettings", "claude-opus-5-5", "effortLevel"], value: "high" },
  ]);
  assert.deepEqual(o, { a: 1, env: { KEEP: "1", CLAUDE_CODE_EFFORT_LEVEL: "max" }, modelSettings: { "claude-opus-5-5": { effortLevel: "high" } } });
});

test("effort with no model chosen goes to the Opus 5.5 entry; env with a level is cleared the same way as max", () => {
  assert.deepEqual(mod.opsFor("effort", "high", {}), [
    { path: ["effortLevel"], value: "high" },
    { path: ["modelSettings", "claude-opus-5-5", "effortLevel"], value: "high" },
  ]);
  assert.deepEqual(mod.opsFor("effort", "low", { env: { CLAUDE_CODE_EFFORT_LEVEL: "high" }, model: "claude-opus-5-5" })[0], { path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "" });
});

test("write: other keys and their order are kept, a copy before the change, file mode, 20 copies kept", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    const before = settings(home);
    chmodSync(p, 0o640);
    const r = mod.writeSettings(home, (s) => mod.opsFor("effort", "high", s), { now: Date.UTC(2026, 10, 10) });
    assert.equal(r.ok, true);
    const after = settings(home);
    assert.deepEqual(Object.keys(after), Object.keys(before));
    assert.deepEqual(after.permissions, before.permissions);
    assert.deepEqual(after.env, before.env);
    assert.equal(after.effortLevel, "high");
    assert.equal(after.modelSettings["claude-opus-5-5"].effortLevel, "high");
    assert.equal(statSync(p).mode & 0o777, 0o640);
    const backups = readdirSync(join(home, ".claude", "backups"));
    assert.deepEqual(backups, ["settings.json.2026-11-10T00-00-00-000Z-agenthub"]);
    assert.deepEqual(JSON.parse(readFileSync(join(home, ".claude", "backups", backups[0]), "utf8")), before);
    assert.equal(statSync(join(home, ".claude", "backups", backups[0])).mode & 0o777, 0o600, "the copy holds your env: owner only");
    for (let i = 0; i < 25; i++) mod.writeSettings(home, (s) => mod.opsFor("ultracode", i % 2 === 0, s), { now: Date.UTC(2026, 10, 10, 1, i) });
    assert.equal(readdirSync(join(home, ".claude", "backups")).filter((n) => n.endsWith("-agenthub")).length, mod.KEEP_BACKUPS);
    writeFileSync(join(home, ".claude", "backups", "settings.json.manual"), "{}");
    mod.pruneBackups(home);
    assert.ok(existsSync(join(home, ".claude", "backups", "settings.json.manual")), "someone else's file in backups isn't deleted");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("write: the temp file has a random name, is created exclusively and owner-only, and never stays behind", POSIX, () => {
  const home = makeHome();
  try {
    const dir = join(home, ".claude");
    const p = join(dir, "settings.json");
    const temps = () => readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    chmodSync(p, 0o644);
    // the name earlier versions used (pid-based, guessable) is planted as a link to someone else's file
    const victim = join(home, "victim.txt");
    writeFileSync(victim, "untouched");
    const planted = `settings.json.agenthub-${process.pid}.tmp`;
    symlinkSync(victim, join(dir, planted));
    const seen = [];
    const r = mod.writeSettings(home, (s) => mod.opsFor("style", "Learning", s), {
      beforeRename: () => {
        for (const n of temps().filter((x) => x !== planted)) seen.push([n, statSync(join(dir, n)).mode & 0o777]);
      },
    });
    assert.equal(r.ok, true);
    assert.equal(seen.length, 1);
    assert.match(seen[0][0], /^settings\.json\.agenthub-[0-9a-f]{16}\.tmp$/);
    assert.equal(seen[0][1], 0o644, "the target's previous permissions are back before the rename");
    assert.equal(statSync(p).mode & 0o777, 0o644);
    assert.equal(readFileSync(victim, "utf8"), "untouched", "a planted link isn't written through");
    assert.deepEqual(temps(), [planted], "the plugin's own temp file is gone, someone else's isn't touched");
    // two writes never share a name
    const names = new Set();
    for (const style of ["Concise", "Learning"]) mod.writeSettings(home, (s) => mod.opsFor("style", style, s), { beforeRename: () => temps().filter((x) => x !== planted).forEach((n) => names.add(n)) });
    assert.equal(names.size, 2);
    // a concurrent change on every attempt (settings-busy) and a failure before the rename leave nothing behind
    assert.deepEqual(mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s), { beforeRename: (i) => writeSettingsFile(home, { ...settings(home), theme: `t${i}` }) }), { ok: false, reason: "settings-busy" });
    assert.deepEqual(temps(), [planted]);
    assert.throws(() => mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s), { beforeRename: () => { throw new Error("boom"); } }), /boom/);
    assert.deepEqual(temps(), [planted]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("write: settings.json is a symlink (dotfiles): the target file changes, the link stays", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    const dot = join(home, "dotfiles-settings.json");
    cpSync(p, dot);
    rmSync(p);
    symlinkSync(dot, p);
    assert.deepEqual(act(home, ["set-effort", "high"]), { out: "ok", code: 0 });
    assert.ok(lstatSync(p).isSymbolicLink());
    assert.equal(JSON.parse(readFileSync(dot, "utf8")).effortLevel, "high");
    // dangling link — refused, the link isn't replaced with a file
    rmSync(p);
    symlinkSync(join(home, "nowhere", "settings.json"), p);
    assert.equal(act(home, ["set-effort", "low"]).out, "reason=settings-link-broken");
    assert.ok(lstatSync(p).isSymbolicLink());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("write: file changed between read and write — re-read and retry; changed all the time — settings-busy; not JSON — leave it; empty — as {}", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    let n = 0;
    const r = mod.writeSettings(home, (s) => mod.opsFor("style", "Learning", s), {
      beforeRename: () => {
        if (n++ === 0) writeSettingsFile(home, { ...settings(home), theme: "light" });
      },
    });
    assert.equal(r.ok, true);
    assert.equal(settings(home).theme, "light", "a concurrent change isn't lost");
    assert.equal(settings(home).outputStyle, "Learning");
    const busy = mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s), { beforeRename: (i) => writeSettingsFile(home, { ...settings(home), theme: `t${i}` }) });
    assert.deepEqual(busy, { ok: false, reason: "settings-busy" });
    assert.equal(settings(home).outputStyle, "Learning");
    writeFileSync(p, "{ not json");
    assert.deepEqual(mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s)), { ok: false, reason: "settings-broken" });
    assert.equal(readFileSync(p, "utf8"), "{ not json");
    assert.equal(run(home).parsed.status, "error");
    writeFileSync(p, "  \n");
    assert.equal(run(home).parsed.status, "ok", "an empty file is empty settings, not \"not JSON\"");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1M context: which models have it, the toggle writes the env key or the [1m] suffix, a model change keeps it", POSIX, () => {
  assert.deepEqual(
    ["claude-fable-5-2", "claude-opus-5-5", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-5-5", "claude-haiku-4-5", "claude-nova-1", "junk"].map(mod.wideContext),
    ["default", "default", "default", "suffix", "none", "default", "suffix", "none", "default", "none", "default", "none"],
  );
  // read: on by itself, off by the env key, on by the suffix only where the suffix is what asks for it
  assert.equal(mod.readBase({ model: "claude-fable-5-2[1m]" }).context1m, true);
  assert.equal(mod.readBase({}).context1m, true, "no model key — the default model has the window");
  assert.equal(mod.readBase({ model: "claude-fable-5-2[1m]", env: { CLAUDE_CODE_DISABLE_1M_CONTEXT: "1" } }).context1m, false);
  assert.equal(mod.readBase({ model: "claude-fable-5-2", env: { CLAUDE_CODE_DISABLE_1M_CONTEXT: "0" } }).context1m, true);
  assert.equal(mod.readBase({ model: "claude-opus-4-6" }).context1m, false);
  assert.equal(mod.readBase({ model: "claude-opus-4-6[1m]" }).context1m, true);
  assert.equal(mod.readBase({ model: "claude-sonnet-4-5[1m]" }).context1m, false);
  const home = makeHome();
  try {
    // off on a model that has the window by itself: the env key holds it at 200K, the suffix goes away
    writeSettingsFile(home, { ...settings(home), model: "claude-fable-5-2[1m]" });
    assert.match(run(home, WITH_HUB).text, /^Контекст 1 млн токенов \| toggle=on action=context-1m-off note="[^"]+"$/m);
    assert.deepEqual(act(home, ["context-1m-off"]), { out: "ok", code: 0 });
    assert.deepEqual([settings(home).model, settings(home).env.CLAUDE_CODE_DISABLE_1M_CONTEXT], ["claude-fable-5-2", "1"]);
    assert.match(run(home, WITH_HUB).text, /^Контекст 1 млн токенов \| toggle=off action=context-1m-on note="[^"]+"$/m);
    // on: the key is removed, the model stays as it is
    assert.deepEqual(act(home, ["context-1m-on"]), { out: "ok", code: 0 });
    assert.deepEqual([settings(home).model, settings(home).env?.CLAUDE_CODE_DISABLE_1M_CONTEXT], ["claude-fable-5-2", undefined]);
    // a model that needs the suffix: on writes it, off removes it and writes no env key; a model change keeps the window
    writeSettingsFile(home, { ...settings(home), model: "claude-opus-4-6" });
    assert.deepEqual(act(home, ["context-1m-on"]), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-opus-4-6[1m]");
    assert.deepEqual(mod.opsFor("model", "claude-sonnet-4-6", settings(home)).find((o) => o.path[0] === "model"), { path: ["model"], value: "claude-sonnet-4-6[1m]" });
    assert.deepEqual(mod.opsFor("model", "claude-fable-5-2", settings(home)).find((o) => o.path[0] === "model"), { path: ["model"], value: "claude-fable-5-2" });
    assert.deepEqual(act(home, ["context-1m-off"]), { out: "ok", code: 0 });
    assert.deepEqual([settings(home).model, settings(home).env?.CLAUDE_CODE_DISABLE_1M_CONTEXT], ["claude-opus-4-6", undefined]);
    // a model without the window: no switch on the page, the action refuses in words
    writeSettingsFile(home, { ...settings(home), model: "claude-sonnet-4-5" });
    assert.match(run(home, WITH_HUB).text, /^Контекст 1 млн токенов \| note="[^"]+"$/m);
    assert.deepEqual(act(home, ["context-1m-on"]), { out: "reason=no-1m", code: 3, message: "У этой модели нет окна в 1 млн токенов — выберите другую модель." });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("settings actions: model (effort moves along), effort, style (only from the list), ultracode", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["set-model", "claude-sonnet-5-5"]), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-sonnet-5-5");
    assert.equal(settings(home).modelSettings["claude-sonnet-5-5"].effortLevel, "medium", "effort stayed the same on the new model");
    assert.deepEqual(act(home, ["set-effort", "xhigh"]), { out: "ok", code: 0 });
    assert.equal(settings(home).modelSettings["claude-sonnet-5-5"].effortLevel, "xhigh");
    assert.equal(settings(home).effortLevel, "xhigh");
    assert.deepEqual(act(home, ["set-style", "demo-plugin:Diagrams"]), { out: "ok", code: 0 });
    assert.equal(settings(home).outputStyle, "demo-plugin:Diagrams");
    assert.deepEqual(act(home, ["set-style", "Default"]), { out: "ok", code: 0 });
    assert.equal(settings(home).outputStyle, undefined);
    assert.deepEqual(act(home, ["set-style", "Nope"]), { out: "reason=unknown-style", code: 3, message: "Такого стиля ответов нет среди установленных." });
    assert.deepEqual(act(home, ["ultracode-on"]), { out: "ok", code: 0 });
    assert.equal(settings(home).ultracode, true);
    assert.deepEqual(act(home, ["set-model", "claude-mythos-5"]), { out: "reason=bad-arg", code: 3, message: "Такого значения нет." });
    assert.equal(act(home, ["set-effort", "max"]).out, "reason=bad-arg", "max only via effort-max with confirmation");
    assert.equal(act(home, ["bogus"]).out, "reason=unknown-action");
    assert.deepEqual(settings(home).env, { FIXTURE_SECRET_MARKER: "fixture-secret-do-not-print" }, "the rest of env is untouched");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("max: env.CLAUDE_CODE_EFFORT_LEVEL=max; leaving writes an empty string, the key is deleted once no sessions older than leaving remain", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["effort-max"]), { out: "ok", code: 0 });
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "max");
    const { text } = run(home, WITH_HUB);
    assert.match(text, /^Базовые: Opus 5\.5 · max/m);
    assert.match(text, /^max — во всех вкладках[^\n]* \| sfimage=exclamationmark\.triangle\.fill color=#FFB454$/m);
    assert.deepEqual(act(home, ["set-effort", "high"]), { out: "ok", code: 0 });
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "", "empty = \"not set\", not auto/unset");
    assert.equal(settings(home).modelSettings["claude-opus-5-5"].effortLevel, "high");
    assert.ok(state(home).maxClearedAt);
    // the fixture sessions started before leaving max — the key stays
    run(home, WITH_HUB);
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "");
    // ps didn't respond — unknown who is alive: the key isn't touched
    writeFileSync(join(home, "bin", "ps"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
    run(home, WITH_HUB);
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "");
    // no old sessions left — the key is deleted, the rest of env stays
    rmSync(join(home, ".claude", "sessions"), { recursive: true });
    run(home);
    assert.deepEqual(settings(home).env, { FIXTURE_SECRET_MARKER: "fixture-secret-do-not-print" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("open sessions: model and effort from the hub file, differences in orange, Fix on a free one, notes on busy ones", POSIX, () => {
  const home = makeHome();
  try {
    const { text, parsed } = run(home, WITH_HUB);
    assert.match(text, /^2 вкладки не как базовые$/m);
    assert.doesNotMatch(text, /^Проставить (?:базовые|всем)/m, "the Apply base button moved from the header into the sessions table");
    assert.doesNotMatch(text, /Проставить всем|Apply to all/, "one name for the button: Apply base");
    assert.match(text, /^Открытые сессии · 3 \| table=true columns="Вкладка¦Состояние¦Модель¦Effort"\n--Проставить базовые · 2 \| action=apply-all header=true$/m);
    // a table: the rows that differ first (cells, orange where they differ, a state dot), Fix/notes and an icon Switch;
    // the ones as the base in a collapsible group
    const go = (id, pre) => `\\n${pre}Перейти \\| effect="session\\.focus ${id}" sfimage=arrow\\.up\\.forward\\.app icon=true`;
    assert.match(text, new RegExp(`^--alpha \\| cells="простаивает¦Opus 5\\.5¦high" cellColors="¦¦#FFB454" sfimage=circle\\.fill iconColor=#8E8E93\\n----Привести \\| action=apply arg=${S1}${go(S1, "----")}$`, "m"));
    assert.match(text, new RegExp(`^--beta \\| cells="работает¦Sonnet 5\\.5¦medium" cellColors="¦#FFB454¦" sfimage=circle\\.fill iconColor=#64A8FF\\n----после хода \\| color=#8E8E93${go(S2, "----")}$`, "m"));
    assert.match(text, new RegExp(`^--Как базовые · 1 \\| group=true\\n----gamma \\| cells="ждёт ответа¦Opus 5\\.5¦medium" sfimage=circle\\.fill iconColor=#FFB454${go("33333333-3333-4333-8333-333333333333", "------")}$`, "m"));
    assert.doesNotMatch(text, /strip=true/, "no strips of cells: segments and a table");
    assert.equal(parsed.status, "ok");
    // without the hub file model and effort are unknown — not "as base" but "no data"
    const bare = run(home).text;
    assert.match(bare, /^вкладки: нет данных$/m);
    assert.match(bare, /хаб новее/);
    const en = run(home, { ...WITH_HUB, AGENTHUB_LANG: "en" }).text;
    assert.match(en, /^2 tabs differ from the base$/m);
    assert.match(en, /^----after the turn \| color=#8E8E93$/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Fix: only /effort is typed through the hub terminal (the model already matches), by sessionId; what was set is remembered with the typing time", POSIX, () => {
  const home = makeHome();
  try {
    const t0 = Date.now();
    assert.deepEqual(act(home, ["apply", S1], WITH_HUB), { out: "ok", code: 0 });
    assert.deepEqual(hubLog(home).map((x) => [x.path, x.sessionId, x.text]), [["/terminal/send-text", S1, "/effort medium"]]);
    assert.equal(state(home).applied[S1].effort, "medium");
    assert.ok(state(home).applied[S1].at >= t0 && state(home).applied[S1].at <= Date.now());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Fix: a busy or unverified session is refused without typing; text in the input line — leave it", POSIX, () => {
  const home = makeHome();
  try {
    // beta is working: Fix from a stale page is refused rather than typed into a running turn
    assert.deepEqual(act(home, ["apply", S2], WITH_HUB), { out: "reason=session-busy", code: 3, message: "Сессия сейчас занята — наберу, когда освободится, через «Проставить базовые»." });
    // the hub didn't verify alpha's signature in its file — the plugin doesn't even ask to type
    assert.equal(act(home, ["apply", S1], hubWith(home, { [S1]: { verified: false } })).out, "reason=unverified");
    assert.match(run(home, hubWith(home, { [S1]: { verified: false } })).text, /^----подпись не подтверждена \| color=#8E8E93$/m);
    assert.deepEqual(hubLog(home), []);
    // hub terminal refusals → the plugin's own reasons; nothing typed
    for (const [flag, reason] of [["unsigned", "unverified"], ["typed", "input-text"], ["notab", "no-tab"], ["off", "no-terminal"], ["mixed", "input-mixed"]]) {
      writeFileSync(join(home, flag), "");
      const r = act(home, ["apply", S1], WITH_HUB);
      assert.equal(r.out, `reason=${reason}`, flag);
      assert.ok(r.message, `${reason} has a text`);
      rmSync(join(home, flag));
    }
    assert.deepEqual(sent(home), []);
    // hub 0.1.6: the refusal window gets its rows — what was to be typed, the advice, the session — before message=
    writeFileSync(join(home, "typed"), "");
    const raw = spawnSync(process.execPath, [PLUGIN, "--action", "apply", S1], { env: env(home, WITH_HUB), encoding: "utf8", timeout: 10_000 }).stdout.trim().split("\n");
    rmSync(join(home, "typed"));
    assert.match(raw[0], /^fact=Хотел набрать: \/(?:model|effort) \S+(?:, \/effort \S+)?$/);
    assert.deepEqual(raw.slice(1), ["hint=Сотрите или отправьте текст во вкладке и нажмите «Повторить».", `session=${S1}`, "message=В поле ввода есть текст — вкладку не трогаю.", "reason=input-text"]);
    assert.deepEqual(mod.refusalLines({ ok: false, reason: "bad-arg" }, "en"), ["message=No such value.", "reason=bad-arg"], "a refusal with nothing to add stays two lines");
    assert.deepEqual(mod.refusalLines({ ok: false, reason: "rate", session: "junk", want: [] }, "en"), ["hint=Wait a minute and try again.", "message=Too often — try again in a minute.", "reason=rate"]);
    // the hub's own words: its button is "Apply base" on the page, and a paused hub is resumed
    assert.deepEqual(mod.refusalLines({ ok: false, reason: "session-busy" }, "en"), ["hint=Wait for the turn to end and try again — or use Apply base.", "message=The session is busy — use Apply base to type once it's free.", "reason=session-busy"]);
    assert.deepEqual(mod.refusalLines({ ok: false, reason: "paused" }, "en"), ["hint=Resume the hub and try again.", "message=The hub is paused.", "reason=paused"]);
    assert.equal(act(home, ["apply", "99999999-9999-4999-8999-999999999999"]).out, "reason=no-session");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Fix: unknown outcome (hub deadline) — \"check the tab\", not \"done\"; a hub record newer than the typing beats our own", POSIX, () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, "late"), "");
    const r = act(home, ["apply", S1], WITH_HUB);
    assert.equal(r.out, "reason=unknown-outcome");
    assert.match(r.message, /проверьте вкладку/);
    assert.equal(existsSync(join(home, "data", "state.json")) ? state(home).applied[S1] : undefined, undefined, "not recorded as set");
    rmSync(join(home, "late"));
    // the session is busy for a moment (hub: session-busy) — the first command wasn't typed: refused as busy, not a failure
    writeFileSync(join(home, "busy-once"), "");
    assert.equal(act(home, ["apply", S1], WITH_HUB).out, "reason=session-busy");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  // freshness: our own setting carries the typing start time; the session's answer in the hub file is newer — it is shown
  const base = mod.readBase({ model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "medium" } } });
  const sess = { sessionId: S1, startedAt: 1000 };
  const st = { applied: { [S1]: { model: "claude-opus-5-5", effort: "medium", at: 5000 } } };
  const hubOld = new Map([[S1, { model: "claude-sonnet-5-5", effort: "high", verified: true, at: 4000 }]]);
  const hubNew = new Map([[S1, { model: "claude-opus-5-5", effort: "low", verified: true, at: 6000 }]]);
  assert.deepEqual([mod.sessionNow(sess, base, hubOld, st).model, mod.sessionNow(sess, base, hubOld, st).effort], ["claude-opus-5-5", "medium"]);
  assert.deepEqual([mod.sessionNow(sess, base, hubNew, st).model, mod.sessionNow(sess, base, hubNew, st).effort], ["claude-opus-5-5", "low"]);
});

test("hub file: modelId beats the /model display name; without modelId — the id from model, a display name isn't an id", () => {
  const dir = tempHome("ah-cc-hub-");
  try {
    const p = join(dir, "s.json");
    writeFileSync(p, JSON.stringify({ version: 1, sessions: [
      { sessionId: S1, model: "Opus 5.5 (default)", modelId: "claude-opus-5-5", modelSource: "command", effort: "high", verified: true, at: "2026-11-10T12:00:00Z" },
      { sessionId: S2, model: "claude-sonnet-5-5", effort: "low", at: "2026-11-10T12:00:00Z" },
      { sessionId: "33333333-3333-4333-8333-333333333333", model: "Default (recommended)", modelId: null, at: "2026-11-10T12:00:00Z" },
    ] }));
    process.env.AGENTHUB_CLAUDE_SESSIONS_FILE = p;
    const h = mod.hubSessions();
    assert.equal(h.get(S1).model, "claude-opus-5-5");
    assert.equal(h.get(S2).model, "claude-sonnet-5-5");
    assert.equal(h.get("33333333-3333-4333-8333-333333333333").model, null);
  } finally {
    delete process.env.AGENTHUB_CLAUDE_SESSIONS_FILE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Fix: the model is typed as written in the settings (the opus[1m] alias doesn't turn into an id)", POSIX, () => {
  const home = makeHome();
  try {
    writeSettingsFile(home, { ...settings(home), model: "opus[1m]" });
    const hub = hubWith(home, { [S1]: { model: "claude-sonnet-5-5", effort: "medium" } });
    assert.deepEqual(act(home, ["apply", S1], hub), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["alpha /model opus[1m]"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Apply base: a free tab at once, a busy one after the turn (hub not paused), the result and Dismiss", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["apply-all"], AUTO), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["alpha /effort medium"]);
    assert.deepEqual(state(home).job.items.map((i) => [i.label, i.phase]), [["alpha", "done"], ["beta", "waitTurn"]]);
    let { text, parsed } = run(home, AUTO);
    assert.equal(parsed.status, "wait");
    assert.match(text, /^Проставляю… 1 из 2/m);
    assert.match(text, /^--beta — ждёт конца хода/m);
    assert.match(text, /^Остановить \| action=apply-stop$/m);
    assert.match(text, /^--beta \| [^\n]*\n----в очереди \| color=#8E8E93$/m);
    assert.equal(act(home, ["apply-all"], AUTO).out, "reason=job-running");
    setStatus(home, 202, "busy", "idle");
    ({ text } = run(home, AUTO));
    assert.deepEqual(sent(home), ["alpha /effort medium", "beta /model claude-opus-5-5"]);
    assert.match(text, /^Готово в 2 из 2 вкладок/m);
    assert.match(text, /^--beta — после хода/m);
    assert.doesNotMatch(text, /Повторить для/);
    assert.deepEqual(act(home, ["apply-done"]), { out: "ok", code: 0 });
    assert.equal(state(home).job, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Apply base: the hub doesn't report \"not paused\" — deferred typing waits for Continue; paused — the same", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], WITH_HUB);
    setStatus(home, 202, "busy", "idle");
    for (const extra of [WITH_HUB, { ...WITH_HUB, AGENTHUB_PAUSED: "1" }]) {
      const { text } = run(home, extra);
      assert.deepEqual(sent(home), ["alpha /effort medium"], "the background run typed nothing");
      assert.match(text, /^--beta — освободилась — нажмите «Продолжить»/m);
      assert.match(text, /^Продолжить \| action=apply-continue$/m);
    }
    assert.deepEqual(act(home, ["apply-continue"], WITH_HUB), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["alpha /effort medium", "beta /model claude-opus-5-5"]);
    assert.ok(state(home).job.finishedAt);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Apply base: Stop drops deferred items; ps didn't respond — the queue isn't lost", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    const ps = readFileSync(join(home, "bin", "ps"), "utf8");
    writeFileSync(join(home, "bin", "ps"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
    const { text } = run(home, AUTO);
    assert.match(text, /не удалось проверить/i);
    assert.deepEqual(state(home).job.items.map((i) => i.phase), ["done", "waitTurn"], "beta didn't \"close\" because of the ps failure");
    writeFileSync(join(home, "bin", "ps"), ps, { mode: 0o755 });
    assert.deepEqual(act(home, ["apply-stop"]), { out: "ok", code: 0 });
    setStatus(home, 202, "busy", "idle");
    run(home, AUTO);
    assert.deepEqual(sent(home), ["alpha /effort medium"]);
    assert.deepEqual(state(home).job.items.map((i) => [i.phase, i.reason]), [["done", null], ["skipped", "stopped"]]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("state lock: held — a regular run leaves the queue alone, an action answers plugin-busy; \"typing\" from a killed run isn't typed twice", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    setStatus(home, 202, "busy", "idle");
    mkdirSync(join(home, "data"), { recursive: true });
    // a lock of a live process (this test) — held
    writeFileSync(join(home, "data", "state.lock"), String(process.pid));
    run(home, AUTO);
    assert.deepEqual(sent(home), ["alpha /effort medium"], "nothing typed under someone else's lock");
    assert.equal(act(home, ["apply-stop"]).out, "reason=plugin-busy");
    rmSync(join(home, "data", "state.lock"));
    // the core killed the run mid-typing: the item stayed "typing"
    const st = state(home);
    st.job.items[1].phase = "typing";
    writeFileSync(join(home, "data", "state.json"), JSON.stringify(st));
    run(home, AUTO);
    assert.deepEqual(sent(home), ["alpha /effort medium"], "not typed a second time");
    assert.deepEqual(state(home).job.items[1].phase, "failed");
    assert.equal(state(home).job.items[1].reason, "interrupted");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// Run the plugin in the background (to do something else meanwhile); → Promise<{code, signal}>
function runAsync(home, extra = {}) {
  const c = spawn(process.execPath, [PLUGIN], { env: env(home, extra), stdio: "ignore" });
  return { child: c, done: new Promise((res) => c.on("exit", (code, signal) => res({ code, signal }))) };
}
const waitFor = async (cond, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 50));
  }
};

test("a run killed mid-typing: a dead process's lock is removed, \"typing\" isn't typed twice", POSIX, async () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    setStatus(home, 202, "busy", "idle");
    writeFileSync(join(home, "slow"), "3");
    const r = runAsync(home, AUTO);
    // the request reached the hub terminal (the double waits slow seconds before answering) — kill it then
    await waitFor(() => existsSync(join(home, "data", "state.json")) && state(home).job.items[1].phase === "typing" && sent(home).some((x) => x.startsWith("beta")));
    r.child.kill("SIGKILL");
    await r.done;
    assert.ok(existsSync(join(home, "data", "state.lock")), "the lock was left by the killed run");
    rmSync(join(home, "slow"));
    run(home, AUTO);
    assert.deepEqual(sent(home).filter((x) => x.startsWith("beta")).length, 1, "typed into beta once");
    assert.deepEqual([state(home).job.items[1].phase, state(home).job.items[1].reason], ["failed", "interrupted"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Stop during a run isn't overwritten: the run saves its part, the stop saves its own", POSIX, async () => {
  const home = makeHome();
  try {
    const hub = hubWith(home, { "33333333-3333-4333-8333-333333333333": { model: "claude-sonnet-5-5" } });
    act(home, ["apply-all"], { ...hub, AGENTHUB_PAUSED: "0" });
    assert.deepEqual(state(home).job.items.map((i) => i.phase), ["done", "waitTurn", "waitAnswer"]);
    setStatus(home, 202, "busy", "idle");
    writeFileSync(join(home, "slow"), "1");
    const r = runAsync(home, { ...hub, AGENTHUB_PAUSED: "0" });
    await waitFor(() => existsSync(join(home, "data", "state.json")) && state(home).job.items[1].phase === "typing");
    assert.deepEqual(act(home, ["apply-stop"]), { out: "ok", code: 0 });
    await r.done;
    const items = state(home).job.items.map((i) => [i.label, i.phase, i.reason]);
    assert.deepEqual(items, [["alpha", "done", null], ["beta", "done", null], ["gamma", "skipped", "stopped"]]);
    assert.ok(state(home).job.finishedAt);
    setStatus(home, 303, "waiting", "idle");
    run(home, { ...hub, AGENTHUB_PAUSED: "0" });
    assert.ok(!sent(home).some((x) => x.startsWith("gamma")), "nothing typed into gamma after Stop");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a session is live only if it is the same process (UTC start time) and Claude Code; no terminal from the hub — view only", POSIX, () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, "bin", "ps"), `#!/bin/sh\necho "  101 Mon Nov 10 09:00:00 2026 /Users/demo/.local/share/claude/versions/2.1.321"\necho "  202 Mon Nov 10 08:00:00 2026 /usr/bin/python3"\necho "  303 Mon Nov 10 08:00:00 2026 /Users/demo/.local/bin/claude"\n`, { mode: 0o755 });
    const { text } = run(home, WITH_HUB);
    assert.match(text, /^Открытые сессии · 1 \|/m, "101 is another process with the same pid, 202 isn't Claude Code");
    const r = run(home, { ...WITH_HUB, AGENTHUB_HUB_SOCKET: "" });
    assert.match(r.text, /Только просмотр: хаб не дал плагину терминал/);
    assert.doesNotMatch(r.text, /action=apply/);
    assert.match(r.text, /effect="session\.focus /, "switching to the tab is a hub effect, independent of the plugin's terminal");
    assert.equal(act(home, ["apply", S1], { ...WITH_HUB, AGENTHUB_HUB_SOCKET: "" }).out, "reason=no-terminal");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("styles: built-in, user, enabled plugins'; a plugin path outside the cache and escaping via .. aren't read", POSIX, () => {
  const home = makeHome();
  try {
    const s = settings(home);
    assert.deepEqual(mod.listStyles(home, s).map((x) => `${x.source}:${x.name}`), ["builtin:Default", "builtin:Proactive", "builtin:Concise", "builtin:Explanatory", "builtin:Learning", "user:Terse", "plugin:demo-plugin:Diagrams"]);
    const ip = join(home, ".claude", "plugins", "installed_plugins.json");
    writeFileSync(ip, JSON.stringify({ version: 2, plugins: { "demo-plugin@demo-market": [{ installPath: join(home, ".claude", "output-styles") }] } }));
    assert.ok(!mod.listStyles(home, s).some((x) => x.source === "plugin"));
    const pj = join(home, ".claude", "plugins", "cache", "demo-market", "demo-plugin", "1.0.0", ".claude-plugin", "plugin.json");
    writeFileSync(ip, readFileSync(join(FIX, "home", ".claude", "plugins", "installed_plugins.json"), "utf8").replace("HOME_PLACEHOLDER", home));
    writeFileSync(pj, JSON.stringify({ name: "demo-plugin", outputStyles: "../../../../../output-styles" }));
    assert.ok(!mod.listStyles(home, s).some((x) => x.source === "plugin"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("hub terminal answer: wait (busy, input not found, rate limit), unknown outcome (*-timeout, deadline) or a refusal with a reason", () => {
  const o = (status, error) => mod.termOutcome(status === 0 ? { status, error } : { status, body: { error: `terminal:${error}` } });
  assert.deepEqual(mod.termOutcome({ status: 200, body: { ok: true } }), { ok: true });
  for (const c of ["session-busy", "not-foreground", "prompt-not-found", "rate-limited"]) assert.equal(o(409, c).kind, "wait", c);
  for (const c of ["deadline", "bridge-timeout", "bridge-pickup-timeout", "terminal-x-timeout"]) assert.equal(o(504, c).kind, "unknown", c);
  assert.equal(o(0, "timeout").kind, "unknown", "the plugin itself gave up waiting for the answer");
  assert.deepEqual([o(409, "prompt-not-empty").reason, o(409, "prompt-mismatch").reason, o(409, "pid-mismatch").reason, o(503, "disabled").reason, o(0, "ENOENT").reason], ["input-text", "input-mixed", "unverified", "no-terminal", "terminal-failed"]);
});

test("commands into a tab — only /model and /effort with the base values; with env (max or a level) — only /model", () => {
  const base = mod.readBase({ model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "medium" } } });
  assert.deepEqual(mod.commandsFor({ model: "claude-sonnet-5-5", effort: "high" }, base), ["/model claude-opus-5-5", "/effort medium"]);
  const mx = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "max" } });
  assert.deepEqual(mod.commandsFor({ model: "claude-sonnet-5-5", effort: "max" }, mx), ["/model claude-opus-5-5"]);
});

test("Default base: a tab on another model differs and gets /model default (not the id, which /model would save)", () => {
  const base = mod.readBase({ effortLevel: "high", modelSettings: { [mod.DEFAULT_MODEL]: { effortLevel: "high" } } });
  assert.equal(base.model, null);
  const sonnet = { sessionId: "s1", status: "idle", model: "claude-sonnet-5-5", effort: "high" };
  const row = mod.rowFor(sonnet, base, new Map([["s1", { model: "claude-sonnet-5-5", effort: "high", verified: true, at: 1 }]]), {});
  assert.equal(row.modelDiffers, true);
  assert.equal(row.action, "fix");
  assert.deepEqual(mod.commandsFor({ model: "claude-sonnet-5-5", effort: "medium" }, base), ["/model default", "/effort high"]);
  // already on the default model and effort — nothing to type
  assert.deepEqual(mod.commandsFor({ model: mod.DEFAULT_MODEL, effort: "high" }, base), []);
});

test("every refusal code has a ru and en text, up to 120 chars, no newline and no \"|\"", () => {
  const src = readFileSync(PLUGIN, "utf8");
  const codes = new Set([...src.matchAll(/reason: "([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const c of codes) {
    if (["gone", "stopped", "interrupted"].includes(c)) continue; // queue item reasons, not action refusals
    for (const lang of ["ru", "en"]) {
      const m = mod.refusalMessage(c, lang);
      assert.ok(m, `${c} ${lang}`);
      assert.ok([...m].length <= 120 && !/[\n|]/.test(m), `${c} ${lang}`);
    }
  }
});

test("Russian plurals: вкладка / вкладки / вкладок", () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map((n) => mod.tabsN(n, "ru")), ["1 вкладка", "2 вкладки", "5 вкладок", "11 вкладок", "21 вкладка", "22 вкладки", "25 вкладок"]);
  assert.equal(mod.tabsN(1, "en"), "1 tab");
});

test("design v2: model and effort are segments, Default (Opus 5.5) removes the model key; style is a select, ultracode a toggle", POSIX, () => {
  const home = makeHome();
  try {
    let { text } = run(home, WITH_HUB);
    assert.match(text, /^Модель \| segment=true\n--По умолчанию \(Opus 5\.5\) \| action=set-model arg=default\n--Opus 5\.5 \| selected=true\n/m);
    assert.match(text, /^Effort \| segment=true\n--low \| action=set-effort arg=low\n--medium \| selected=true\n/m);
    assert.match(text, /^Стиль ответов \| select=true note="[^"]+"\n(?:--[^\n]*\n)*--Explanatory \| selected=true\n/m);
    assert.match(text, /^Ultracode \| toggle=off action=ultracode-on note="[^"]+"$/m);
    // Default: the model key goes away; the header spells the default model out, the tile names the model itself
    assert.deepEqual(act(home, ["set-model", "default"]), { out: "ok", code: 0 });
    assert.equal(settings(home).model, undefined);
    ({ text } = run(home, WITH_HUB));
    assert.match(text, /^Базовые: по умолчанию \(Opus 5\.5\) · medium \| status=ok tile="Opus 5\.5 · medium" tileLabel="Claude модель"$/m);
    assert.match(text, /^--По умолчанию \(Opus 5\.5\) \| selected=true$/m);
    assert.equal(act(home, ["set-model", "claude-nope-1"]).out, "reason=bad-arg");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("model list: the newest known version of each family; the base model is an extra item and never hides the newest; labels and effort by rule", () => {
  const ids = (o) => mod.knownModels(o).page.map((m) => m.id);
  assert.deepEqual(mod.knownModels().page, [
    { id: "claude-opus-5-5", label: "Opus 5.5" },
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
    { id: "claude-haiku-5-5", label: "Haiku 5.5" },
    { id: "claude-fable-5-1", label: "Fable 5.1" },
  ]);
  // a newer version that a session ran on replaces the older one of its family; older ones don't come back
  assert.deepEqual(ids({ seen: ["claude-fable-5-2", "claude-opus-5", "claude-fable-5"] }), ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"]);
  assert.deepEqual(mod.knownModels({ seen: ["claude-fable-5-2"] }).remember, ["claude-fable-5-2"]);
  assert.deepEqual(mod.knownModels({ seen: ["claude-opus-5-5"] }).remember, [], "what SEED already has isn't stored");
  // remembered from an earlier run — the same as seen now
  assert.deepEqual(ids({ remembered: ["claude-fable-5-2"] }).at(-1), "claude-fable-5-2");
  // the base model is shown even when it is older — next to the newest, in version order
  assert.deepEqual(ids({ seen: ["claude-fable-5-2"], base: "claude-fable-5-1" }).slice(-2), ["claude-fable-5-1", "claude-fable-5-2"]);
  // a base the plugin has never met is one more item: it neither replaces the newest nor is remembered
  const typo = mod.knownModels({ seen: ["claude-fable-5-2"], base: "claude-fable-9-9" });
  assert.deepEqual(typo.page.map((m) => m.id).slice(-2), ["claude-fable-5-2", "claude-fable-9-9"]);
  assert.deepEqual(typo.remember, ["claude-fable-5-2"]);
  // a new family goes after the known ones, by name; a date suffix isn't a version, junk is skipped
  assert.deepEqual(ids({ seen: ["claude-zeta-1", "claude-mythos-5-2", "claude-opus-5-20261001", "gpt-9", null, "claude-opus-5-5-20261001"] }), ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-mythos-5-2", "claude-zeta-1"]);
  // the hub's model list, when there is one, is the whole list: the newest of each family in it, whatever was met
  // before; the base model is still one more item; a list with nothing usable — as without it
  const listed = ["claude-fable-5-2", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-opus-5", "claude-opus-4-5-20251101"];
  assert.deepEqual(ids({ listed }), ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"]);
  assert.deepEqual(ids({ listed: ["claude-opus-6", "claude-fable-5-3"], seen: ["claude-mythos-5-2"], remembered: ["claude-fable-5-9"] }), ["claude-opus-6", "claude-fable-5-3"]);
  assert.deepEqual(ids({ listed, base: "claude-fable-5-1" }).slice(-2), ["claude-fable-5-1", "claude-fable-5-2"]);
  assert.deepEqual(ids({ listed: ["claude-opus-4-5-20251101", "gpt-9"], seen: ["claude-fable-5-2"] }).at(-1), "claude-fable-5-2");
  assert.deepEqual(mod.knownModels({ listed, seen: ["claude-mythos-5-2"] }).remember, ["claude-mythos-5-2"], "what was met is still kept for a run without the list");
  assert.deepEqual(["claude-fable-5-2", "claude-opus-5", "claude-zeta-10-3", "claude-opus-5-20261001"].map(mod.modelLabel), ["Fable 5.2", "Opus 5", "Zeta 10.3", "claude-opus-5-20261001"]);
  // effort: the generations before Opus 5.5 / Fable 5.2 follow effortLevel and start at high; these and everything
  // newer (a family the table doesn't know included) take only modelSettings and start at medium
  assert.deepEqual(["claude-fable-5-1", "claude-opus-5", "claude-haiku-5", "claude-sonnet-4-6"].map(mod.newEffort), [false, false, false, false]);
  assert.deepEqual(["claude-fable-5-2", "claude-fable-5-3", "claude-opus-6", "claude-mythos-5-2", "claude-zeta-1"].map(mod.newEffort), [true, true, true, true, true]);
  assert.equal(mod.readBase({ effortLevel: "xhigh", model: "claude-fable-5-3" }).effort, "medium");
  assert.equal(mod.readBase({ model: "claude-fable-5-1" }).effort, "high");
  assert.equal(mod.readBase({ effortLevel: "low", model: "claude-zeta-1", modelSettings: { "claude-zeta-1": { effortLevel: "xhigh" } } }).effort, "xhigh");
});

test("model list on the page, from the hub: the buttons are the newest model of each family in the hub's list and set its full id; a new model shows up by itself; no usable file — the fallback", POSIX, () => {
  const home = makeHome();
  try {
    const models = (text) => text.match(/^Модель \| segment=true\n((?:--[^\n]*\n)+)/m)[1].trim().split("\n").map((l) => l.slice(2).split(" | ")[0]);
    const WITH_MODELS = { ...WITH_HUB, AGENTHUB_CLAUDE_MODELS_FILE: HUB_MODELS };
    let { text } = run(home, WITH_MODELS);
    assert.deepEqual(models(text), ["По умолчанию (Opus 5.5)", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.2"]);
    assert.match(text, /^--Fable 5\.2 \| action=set-model arg=claude-fable-5-2$/m);
    // the button writes the full id; without the hub's list the same model isn't offered yet
    assert.equal(act(home, ["set-model", "claude-fable-5-2"], WITH_HUB).out, "reason=bad-arg");
    assert.deepEqual(act(home, ["set-model", "claude-fable-5-2"], WITH_MODELS), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-fable-5-2");
    // an older model of the list isn't a button, so it isn't accepted either
    assert.equal(act(home, ["set-model", "claude-fable-5-1"], WITH_MODELS).out, "reason=bad-arg");
    // the hub fetched a list with a new model and a new family: the page follows, nothing is hard-coded
    const p = join(home, "models.json");
    const j = JSON.parse(readFileSync(HUB_MODELS, "utf8"));
    writeFileSync(p, JSON.stringify({ ...j, error: "http-429", models: [{ id: "claude-fable-5-3" }, { id: "claude-mythos-6" }, { id: 7 }, null, ...j.models] }));
    const newer = { ...WITH_HUB, AGENTHUB_CLAUDE_MODELS_FILE: p };
    ({ text } = run(home, newer));
    assert.deepEqual(models(text), ["По умолчанию (Opus 5.5)", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.2", "Fable 5.3", "Mythos 6"], "the base (5.2) stays as one more item next to the newest");
    assert.match(text, /^--Fable 5\.2 \| selected=true$/m);
    assert.deepEqual(act(home, ["set-model", "claude-mythos-6"], newer), { out: "ok", code: 0 });
    assert.deepEqual(models(run(home, newer).text).slice(-2), ["Fable 5.3", "Mythos 6"]);
    // no file yet, garbage, an empty list (signed out) — the list of met models, as on a hub without the service
    writeSettingsFile(home, { ...settings(home), model: "claude-opus-5-5" });
    for (const junk of [null, "not json", "[]", JSON.stringify({ models: "x" }), JSON.stringify({ error: "no-token", models: [] })]) {
      if (junk === null) rmSync(p);
      else writeFileSync(p, junk);
      assert.deepEqual(models(run(home, newer).text), ["По умолчанию (Opus 5.5)", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.1"], String(junk));
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("model list on the page without the hub's list: a model a tab runs on appears by itself and stays after the tab is gone", POSIX, () => {
  const home = makeHome();
  try {
    const models = (text) => text.match(/^Модель \| segment=true\n((?:--[^\n]*\n)+)/m)[1].trim().split("\n").map((l) => l.slice(2).split(" | ")[0]);
    // the fixture: nobody runs anything newer — the floor
    assert.deepEqual(models(run(home, WITH_HUB).text), ["По умолчанию (Opus 5.5)", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.1"]);
    assert.equal(act(home, ["set-model", "claude-fable-5-2"], WITH_HUB).out, "reason=bad-arg", "not in the list yet");
    // a tab switched to Fable 5.2 (the hub saw the turn): the segment offers it instead of 5.1
    const fable = hubWith(home, { [S2]: { model: "Fable 5.2 (1M context)", modelId: "claude-fable-5-2", modelSource: "command" } });
    let { text } = run(home, fable);
    assert.deepEqual(models(text), ["По умолчанию (Opus 5.5)", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.2"]);
    assert.match(text, /^--Fable 5\.2 \| action=set-model arg=claude-fable-5-2$/m);
    assert.deepEqual(state(home).models, ["claude-fable-5-2"]);
    // … and it can be chosen; effort moves to its modelSettings entry
    assert.deepEqual(act(home, ["set-model", "claude-fable-5-2"], fable), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-fable-5-2");
    assert.equal(settings(home).modelSettings["claude-fable-5-2"].effortLevel, "medium");
    // the tab is gone, the hub's file too: the model is remembered — still listed, selected and still accepted
    ({ text } = run(home));
    assert.match(text, /^--Fable 5\.2 \| selected=true$/m);
    assert.match(text, /^Базовые: Fable 5\.2 · medium \|/m);
    assert.deepEqual(act(home, ["set-model", "claude-opus-5-5"]), { out: "ok", code: 0 });
    assert.deepEqual(models(run(home).text).slice(-1), ["Fable 5.2"]);
    assert.deepEqual(act(home, ["set-model", "claude-fable-5-2"]), { out: "ok", code: 0 });
    // an older base is shown next to the newest one, never instead of it
    writeSettingsFile(home, { ...settings(home), model: "claude-fable-5-1" });
    ({ text } = run(home));
    assert.deepEqual(models(text).slice(-2), ["Fable 5.1", "Fable 5.2"]);
    assert.match(text, /^--Fable 5\.1 \| selected=true$/m);
    // a damaged state file doesn't break the list
    writeFileSync(join(home, "data", "state.json"), JSON.stringify({ models: ["claude-fable-5-2", "rm -rf", 5, "claude-opus-5-20261001"] }));
    assert.deepEqual(models(run(home).text).slice(-2), ["Fable 5.1", "Fable 5.2"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Fix with the hub's terminal bridge down: the refusal says to start the bridge and where the command is, nothing is typed", POSIX, () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, "bridge-off"), "");
    assert.deepEqual(act(home, ["apply", S1], WITH_HUB), { out: "reason=terminal-offline", code: 3, message: "Мост терминала хаба не запущен или устарел — запустите его заново: команда в настройках хаба, «Терминал»." });
    assert.equal(act(home, ["apply", S1], { ...WITH_HUB, AGENTHUB_LANG: "en" }).message, "The hub's terminal bridge is down or outdated — start it again: the command is in the hub's Settings, Terminal.");
    assert.deepEqual(sent(home), []);
    assert.equal(mod.termOutcome({ status: 503, body: { error: "terminal:bridge-outdated" } }).reason, "terminal-offline");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Another model: the id typed in the hub becomes the base as a full id, even for a model the list doesn't have; anything that isn't an id is refused", POSIX, () => {
  const home = makeHome();
  try {
    // the page offers the field without an argument (the text is typed in the hub) and with a live example
    let { text } = run(home, WITH_HUB);
    assert.match(text, /^Другая модель… \| action=set-model-id note="идентификатор, например claude-fable-5-1"$/m);
    const before = readFileSync(join(home, ".claude", "settings.json"), "utf8");
    for (const junk of ["", "\n", "fable\n", "default\n", "claude-fable-5-3[1m]\n", "claude-opus-5-20261001\n", "claude-fable-5-3 --dangerously-skip-permissions\n", "Claude-Fable-5-3\n"]) {
      assert.deepEqual(act(home, ["set-model-id"], WITH_HUB, junk), { out: "reason=bad-arg", code: 3, message: "Такого значения нет." }, JSON.stringify(junk));
    }
    assert.equal(readFileSync(join(home, ".claude", "settings.json"), "utf8"), before, "a refused id writes nothing");
    // an argument on the command line is not the text: only stdin counts
    assert.equal(act(home, ["set-model-id", "claude-fable-5-3"], WITH_HUB).out, "reason=bad-arg");
    // a model newer than anything known here
    assert.deepEqual(act(home, ["set-model-id"], WITH_HUB, "claude-fable-5-3\n"), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-fable-5-3");
    ({ text } = run(home, WITH_HUB));
    assert.match(text, /^--Fable 5\.3 \| selected=true$/m, "the typed model is the selected item");
    assert.match(text, /^--Fable 5\.1 \| action=set-model arg=claude-fable-5-1$/m, "the newest model known to exist stays");
    // it isn't remembered as existing until a session runs on it: after switching away it leaves the list
    assert.equal(act(home, ["set-model", "claude-opus-5-5"], WITH_HUB).out, "ok");
    ({ text } = run(home, WITH_HUB));
    assert.doesNotMatch(text, /Fable 5\.3/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("aliases in a settings.json written by hand: fable is what Claude Code resolves it to, and /model gets the value as written", () => {
  assert.equal(mod.readBase({ model: "fable" }).model, "claude-fable-5-1");
  assert.equal(mod.readBase({ model: "fable" }).modelArg, "fable");
  assert.equal(mod.readBase({ model: "claude-fable-5-2" }).modelArg, "claude-fable-5-2");
});
