// The claude-code plugin (agent-hub-plugins/plugins/claude-code/claude-code.30s.mjs) on a synthetic HOME.
// ps is a double script in AGENTHUB_TEST_BIN_DIR; the hub's terminal is a hub socket double (a separate process on a
// unix socket in the test's HOME): real tabs, processes and the hub are never touched. The double logs every
// POST /terminal/send-text to hub.log and, by flag files in HOME, answers with hub refusals: typed (prompt-not-empty),
// mixed (prompt-mismatch), unsigned (unverified), notab (no-tab), off (503 disabled), late (504 deadline), busy-once
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
function act(home, args, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
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
  assert.deepEqual(
    pm.meta.actions.map((a) => [a.id, a.level, a.arg?.name ?? null]),
    [
      ["set-model", "immediate", "model"],
      ["set-effort", "immediate", "level"],
      ["effort-max", "confirm-cost", null],
      ["set-style", "immediate", "style"],
      ["ultracode-on", "immediate", null],
      ["ultracode-off", "immediate", null],
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
    assert.doesNotMatch(text, /^Проставить всем/m, "the Apply button moved from the header into the sessions table");
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
    assert.deepEqual(act(home, ["apply", S2], WITH_HUB), { out: "reason=session-busy", code: 3, message: "Сессия сейчас занята — наберу, когда освободится, через «Проставить всем»." });
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

test("Apply to all: a free tab at once, a busy one after the turn (hub not paused), the result and Dismiss", POSIX, () => {
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

test("Apply to all: the hub doesn't report \"not paused\" — deferred typing waits for Continue; paused — the same", POSIX, () => {
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

test("Apply to all: Stop drops deferred items; ps didn't respond — the queue isn't lost", POSIX, () => {
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
    assert.match(text, /^Базовые: по умолчанию \(Opus 5\.5\) · medium \| status=ok tile="Opus 5\.5 · medium"$/m);
    assert.match(text, /^--По умолчанию \(Opus 5\.5\) \| selected=true$/m);
    assert.equal(act(home, ["set-model", "claude-nope-1"]).out, "reason=bad-arg");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
