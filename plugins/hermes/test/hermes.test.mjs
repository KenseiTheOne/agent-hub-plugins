// The hermes plugin (agent-hub-plugins/plugins/hermes/hermes.60s.mjs) on a synthetic HOME.
// Run: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/hermes/test/*.test.mjs (or scripts/check.sh --only hermes)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOutput, pluginDir, readPluginMeta, tempHome } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "hermes.60s.mjs");
const FIX = join(DIR, "fixtures");
const SECRET_MARKERS = ["СИНТЕТИЧЕСКИЙ-ПРОМПТ", "СИНТЕТИЧЕСКАЯ-ОШИБКА", "synthetic-chat"];

// A synthetic ~/.hermes: the root with a gateway, the demo-bot profile with cron.
function makeHome({ heartbeatAgeSec = 10, gatewayPid = process.pid, tickerAgeSec = 15, estop = false, jobsText = null, gatewayState = "running" } = {}) {
  const home = tempHome("ah-herm-");
  const root = join(home, ".hermes");
  const cron = join(root, "profiles", "demo-bot", "cron");
  mkdirSync(join(root, "state"), { recursive: true });
  mkdirSync(join(cron, "output", "aaaa11112222"), { recursive: true });
  const gs = JSON.parse(readFileSync(join(FIX, "gateway_state.json"), "utf8"));
  gs.pid = gatewayPid;
  gs.gateway_state = gatewayState;
  writeFileSync(join(root, "gateway_state.json"), JSON.stringify(gs));
  const hbAt = new Date(Date.now() - heartbeatAgeSec * 1000).toISOString();
  writeFileSync(join(root, "state", "gateway.heartbeat"), JSON.stringify({ pid: gatewayPid, updated_at: hbAt, loop_tick_socket: true }));
  writeFileSync(join(cron, "jobs.json"), jobsText ?? readFileSync(join(FIX, "jobs.json"), "utf8"));
  copyFileSync(join(FIX, "usage_audit.jsonl"), join(cron, "usage_audit.jsonl"));
  execFileSync("/usr/bin/sqlite3", [join(cron, "executions.db")], { input: readFileSync(join(FIX, "executions.sql"), "utf8") });
  writeFileSync(join(cron, "ticker_heartbeat"), `${Date.now() / 1000 - tickerAgeSec} ${process.pid}`);
  if (estop) writeFileSync(join(root, "ESTOP"), "");
  return home;
}

function run(home) {
  const r = spawnSync(process.execPath, [PLUGIN], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  const parsed = parseOutput(r.stdout);
  assert.deepEqual(parsed.warnings, [], "the core parses the output without warnings");
  return { text: r.stdout, parsed };
}

function noSecrets(text) {
  for (const m of SECRET_MARKERS) assert.ok(!text.includes(m), `the output has no "${m}"`);
}

test("metadata: standard 60 s, effects only open.file, control via declared actions with a job pattern", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.equal(pm.id, "hermes");
  assert.equal(pm.intervalMs, 60_000);
  assert.equal(pm.meta.type, "standard");
  assert.deepEqual(pm.meta.effects, ["open.file"]);
  assert.deepEqual(pm.meta.secrets, []);
  assert.deepEqual(pm.meta.actions.map((a) => [a.id, a.level, a.arg?.name ?? null]), [
    ["cron-pause", "confirm-cost", "job"],
    ["cron-resume", "confirm-cost", "job"],
    ["cron-run", "confirm-cost", "job"],
    ["pause", "confirm", null],
  ]);
  assert.ok(pm.meta.push.some((r) => r.key === "gateway-silent" && !r.macOnly), "macOnly is gone: the hub has no Telegram since 2026-11-11");
});

test("a failed job and a twice-as-costly one → events; prompts and errors are not shown", () => {
  const home = makeHome();
  try {
    const { text, parsed } = run(home);
    assert.equal(parsed.status, "error");
    assert.ok(parsed.events.includes("job-failed-bbbb33334444"), "job bbbb failed on its last run");
    assert.ok(parsed.events.includes("job-costly-aaaa11112222"), "aaaa: 96,500 against the usual ~41,000");
    assert.ok(!parsed.events.includes("job-failed-aaaa11112222"), "the old aaaa failure is superseded by successful runs");
    assert.ok(!parsed.events.includes("gateway-silent"));
    assert.ok(!parsed.events.includes("source-broken"), "a truncated last line of usage_audit is not a breakage");
    assert.match(text, /demo: на паузе — на паузе/);
    assert.match(text, /Падений подряд: 2/);
    noSecrets(text);
    const open = parsed.body.find((i) => i.effect && i.effect.startsWith("open.file"));
    assert.ok(open, "there is an offer to open the job output");
    assert.ok(open.effect.includes(join(home, ".hermes", "profiles", "demo-bot", "cron", "output", "aaaa11112222")));
    const cron = parsed.body.filter((i) => i.action === "cron-pause" || i.action === "cron-resume").map((i) => `${i.action} ${i.params.arg}`);
    assert.deepEqual(cron, ["cron-pause aaaa11112222", "cron-pause bbbb33334444", "cron-resume cccc55556666"]);
    assert.ok(!parsed.body.some((i) => i.effect && !i.effect.startsWith("open.")), "effect is only open.*");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway silent: old heartbeat", () => {
  const home = makeHome({ heartbeatAgeSec: 600 });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.equal(parsed.status, "error");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway silent — no activity=: what Hermes is running is unknown, it does not land in the shutdown card's \"checked\"", () => {
  const home = makeHome({ heartbeatAgeSec: 600 });
  try {
    const { parsed, text } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.equal(parsed.activity, null, "not \"taking part, quiet\"");
    assert.doesNotMatch(text.split("\n")[0], /activity=/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway silent: no process despite a fresh heartbeat", () => {
  const home = makeHome({ gatewayPid: 999_999 });
  try {
    const { parsed, text } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.match(text, /^Hermes не отвечает: служба не запущена \| status=error tile="\d проблем/);
    assert.match(text, /--Подробности \| details=true\n----служба gateway, процесс \d+/);
    assert.match(text, /--Запускается каждый день в 22:00/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway stopped normally — not \"silent\"", () => {
  const home = makeHome({ gatewayState: "stopped", heartbeatAgeSec: 9999 });
  try {
    const { parsed } = run(home);
    assert.ok(!parsed.events.includes("gateway-silent"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("scheduler not ticking → ticker-silent; ESTOP → estop and no ticker-silent", () => {
  let home = makeHome({ tickerAgeSec: 1000 });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("ticker-silent-demo-bot"));
    // without ESTOP: the button to pause all of Hermes (the declared pause action, no argument)
    const pause = parsed.body.filter((i) => i.action === "pause");
    assert.equal(pause.length, 1, "the pause action is offered");
    assert.equal(pause[0].params.arg, undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  home = makeHome({ tickerAgeSec: 1000, estop: true });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("estop"));
    assert.ok(!parsed.events.includes("ticker-silent-demo-bot"), "while paused a silent scheduler is expected");
    assert.ok(!parsed.body.some((i) => i.action === "pause"), "already paused — no button");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a profile ESTOP pauses only that profile: the root scheduler silence is visible, the pause button is there, the hint uses -p", () => {
  const home = makeHome({ tickerAgeSec: 1000 });
  try {
    const root = join(home, ".hermes");
    // the root has its own schedule, and it has stopped
    mkdirSync(join(root, "cron"), { recursive: true });
    writeFileSync(join(root, "cron", "jobs.json"), JSON.stringify({ jobs: [] }));
    writeFileSync(join(root, "cron", "ticker_heartbeat"), `${Date.now() / 1000 - 1200} ${process.pid}`);
    // `hermes -p demo-bot pause`
    writeFileSync(join(root, "profiles", "demo-bot", "ESTOP"), "");
    const { text, parsed } = run(home);
    assert.ok(parsed.events.includes("ticker-silent-default"), JSON.stringify(parsed.events));
    assert.ok(!parsed.events.includes("ticker-silent-demo-bot"), "silence is expected for a paused profile");
    assert.ok(parsed.events.includes("estop-demo-bot"));
    assert.ok(!parsed.events.includes("estop"), "all of Hermes is not paused");
    assert.doesNotMatch(parsed.header[0].title, /^Hermes на паузе/);
    assert.match(text, /^--Снять: hermes -p demo-bot resume в терминале/m);
    assert.doesNotMatch(text, /^--Снять: hermes resume/m);
    assert.equal(parsed.body.filter((i) => i.action === "pause").length, 1, "the button to pause all of Hermes stays");
    // a root ESTOP pauses everything: no scheduler silence at all, no button
    writeFileSync(join(root, "ESTOP"), "");
    const all = run(home).parsed;
    assert.ok(all.events.includes("estop"));
    assert.ok(!all.events.some((e) => e.startsWith("ticker-silent")), JSON.stringify(all.events));
    assert.ok(!all.body.some((i) => i.action === "pause"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("executions.db in WAL mode: a run that lives only in -wal (Hermes holds a connection open) is visible; the Hermes database is unchanged", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    t.skip("no node:sqlite");
    return;
  }
  const home = makeHome();
  const cron = join(home, ".hermes", "profiles", "demo-bot", "cron");
  const dbPath = join(cron, "executions.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    db.exec("INSERT INTO executions (id, job_id, source, process_id, pid, status, claimed_at, started_at, finished_at, error) VALUES ('e06','aaaa11112222','tick','p1',100,'failed','2026-11-04T22:00:20+01:00','2026-11-04T22:00:21+01:00','2026-11-04T22:01:00+01:00','x')");
    assert.ok(statSync(`${dbPath}-wal`).size > 0, "the row is only in the WAL journal");
    const before = readdirSync(cron).sort();
    const main = readFileSync(dbPath);
    const wal = readFileSync(`${dbPath}-wal`);
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("job-failed-aaaa11112222"), JSON.stringify(parsed.events));
    assert.ok(!parsed.events.includes("source-broken"));
    assert.deepEqual(readdirSync(cron).sort(), before, "nothing appeared in the Hermes folder");
    assert.ok(main.equals(readFileSync(dbPath)) && wal.equals(readFileSync(`${dbPath}-wal`)), "the database and the journal are untouched");
  } finally {
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("AGENTHUB_LANG=en: source breakages in English; the \"what\" of permissions has no Russian", () => {
  const home = makeHome({ jobsText: JSON.stringify({ tasks: [] }) });
  try {
    const r = spawnSync(process.execPath, [PLUGIN], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_LANG: "en" }, encoding: "utf8", timeout: 10_000 });
    assert.match(r.stdout, /^--demo-bot\/jobs\.json: no jobs array \| color=gray$/m);
    const ru = spawnSync(process.execPath, [PLUGIN], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 10_000 });
    assert.match(ru.stdout, /^--demo-bot\/jobs\.json: нет массива jobs \| color=gray$/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  const whats = readFileSync(PLUGIN, "utf8").match(/^\/\/ <agenthub\.(?:exec|fsRead|fsWrite|watch)[^>]*>[^—]*/gm);
  assert.ok(whats.length > 5);
  assert.doesNotMatch(whats.join("\n"), /[А-Яа-яЁё]/);
});

test("corrupted jobs.json → unknown + source-broken", () => {
  for (const bad of ["{не json", JSON.stringify({ tasks: [] }), JSON.stringify({ jobs: [{ name: "без id" }] })]) {
    const home = makeHome({ jobsText: bad });
    try {
      const { parsed } = run(home);
      assert.ok(parsed.events.includes("source-broken"), bad);
      assert.ok(["unknown", "error", "wait"].includes(parsed.status));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("corrupted executions.db schema → source-broken", () => {
  const home = makeHome();
  try {
    const db = join(home, ".hermes", "profiles", "demo-bot", "cron", "executions.db");
    rmSync(db);
    execFileSync("/usr/bin/sqlite3", [db, "CREATE TABLE executions (id TEXT, what TEXT);"]);
    assert.ok(run(home).parsed.events.includes("source-broken"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("no ~/.hermes → unknown \"Hermes не установлен\" with no events", () => {
  const home = tempHome("ah-herm-");
  try {
    const { parsed } = run(home);
    assert.equal(parsed.status, "unknown");
    assert.equal(parsed.header[0].title, "Hermes не установлен");
    assert.deepEqual(parsed.events, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("costCheck and median", async () => {
  const { costCheck, median } = await import(pathToFileURL(PLUGIN).href);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const s = (xs) => xs.map((tokens) => ({ tokens }));
  assert.equal(costCheck(s([10, 10, 10, 19])).costly, false);
  assert.equal(costCheck(s([10, 10, 10, 20])).costly, true);
  assert.equal(costCheck(s([10, 10, 20])).usual, null, "too little history — no verdict");
  assert.equal(costCheck([]), null);
});

test("executions.db is opened read-only (immutable): the file does not change", () => {
  const home = makeHome();
  try {
    const db = join(home, ".hermes", "profiles", "demo-bot", "cron", "executions.db");
    const before = readFileSync(db);
    run(home);
    assert.ok(before.equals(readFileSync(db)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// Action mode, the way the core runs it: the same file with `--action <id> [<job>]`; hermes is a test double.
// out is the last line (ok or reason=<code>), message is the refusal explanation (the message= line, contract 2).
function act(home, args, { lang = null } = {}) {
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(home, "hermes.log");
  writeFileSync(join(bin, "hermes"), `#!/bin/sh\necho "$@" >> '${log}'\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: bin, ...(lang ? { AGENTHUB_LANG: lang } : {}) }, encoding: "utf8", timeout: 10_000 });
  let calls = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  } catch {}
  rmSync(log, { force: true });
  const lines = r.stdout.trim().split("\n");
  const message = lines.find((l) => l.startsWith("message="))?.slice(8) ?? null;
  return { out: lines.at(-1), code: r.status, calls, ...(message ? { message } : {}) };
}
// the hermes double is a shell script: it can't run on Windows (the plugin is macOS-only anyway)
const POSIX = { skip: process.platform === "win32" ? "the hermes double is /bin/sh" : false };

test("actions: the job's profile from jobs.json, pause/resume by state, argv hermes -p profile cron …", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["cron-pause", "aaaa11112222"]), { out: "ok", code: 0, calls: ["-p demo-bot cron pause aaaa11112222"] });
    assert.deepEqual(act(home, ["cron-resume", "cccc55556666"]), { out: "ok", code: 0, calls: ["-p demo-bot cron resume cccc55556666"] });
    assert.deepEqual(act(home, ["cron-run", "bbbb33334444"]).calls, ["-p demo-bot cron run bbbb33334444"]);
    assert.deepEqual(act(home, ["cron-pause", "cccc55556666"]), { out: "reason=already-paused", code: 3, calls: [], message: "Задача уже на паузе." });
    assert.deepEqual(act(home, ["cron-resume", "aaaa11112222"]), { out: "reason=not-paused", code: 3, calls: [], message: "Задача не на паузе." });
    assert.deepEqual(act(home, ["cron-run", "ffff00000000"]), { out: "reason=unknown-job", code: 3, calls: [], message: "Задачи с таким id нет ни в одном профиле Hermes." });
    assert.deepEqual(act(home, ["cron-run", "--help"]), { out: "reason=bad-job", code: 3, calls: [], message: "Такой задачи нет." });
    assert.deepEqual(act(home, ["pause"]), { out: "ok", code: 0, calls: ["pause"] });
    writeFileSync(join(home, ".hermes", "ESTOP"), "");
    assert.deepEqual(act(home, ["pause"]), { out: "reason=hermes-paused", code: 3, calls: [], message: "Hermes уже на паузе." });
    assert.equal(act(home, ["bogus"]).out, "reason=unknown-action");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1.2.2: activity= for the hub's \"OK to shut down\" verdict — jobs in progress; none — empty", () => {
  const quiet = makeHome();
  try {
    assert.deepEqual(run(quiet).parsed.activity, [], "no jobs in progress — the plugin takes part and is quiet");
  } finally {
    rmSync(quiet, { recursive: true, force: true });
  }
  const jobs = JSON.parse(readFileSync(join(FIX, "jobs.json"), "utf8"));
  jobs.jobs.push({ ...jobs.jobs[0], id: "dddd77778888", name: "demo: идёт сейчас", state: "running", last_failure: null, last_run_at: null });
  const home = makeHome({ jobsText: JSON.stringify(jobs) });
  try {
    const { parsed } = run(home);
    assert.deepEqual(parsed.activity, ["Hermes: 1 задача в работе"]);
    assert.deepEqual(parsed.needsOn, null, "Hermes does not report needsOn");
    const r = spawnSync(process.execPath, [PLUGIN], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_LANG: "en" }, encoding: "utf8", timeout: 10_000 });
    assert.deepEqual(parseOutput(r.stdout).activity, ["Hermes: 1 job running"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1.3.0 (contract 2): the plugin writes the action refusal text — message= before reason=, in the hub's language (ru and en)", POSIX, () => {
  const home = makeHome();
  try {
    const en = act(home, ["cron-pause", "cccc55556666"], { lang: "en" });
    assert.deepEqual(en, { out: "reason=already-paused", code: 3, calls: [], message: "The job is already paused." });
    assert.equal(act(home, ["cron-resume", "aaaa11112222"], { lang: "en" }).message, "The job isn't paused.");
    assert.equal(act(home, ["cron-run", "--help"], { lang: "en" }).message, "No such task.");
    // the program is there but ~/.hermes isn't — its own code: "no ~/.local/bin/hermes" would point at the wrong file
    rmSync(join(home, ".hermes"), { recursive: true, force: true });
    assert.deepEqual(act(home, ["cron-run", "aaaa11112222"]), { out: "reason=no-hermes-home", code: 3, calls: [], message: "Нет папки ~/.hermes — данных Hermes нет." });
    assert.equal(act(home, ["cron-run", "aaaa11112222"], { lang: "en" }).message, "No ~/.hermes folder — no Hermes data.");
    // the message= line comes before reason= (the core takes reason= from the last line, message= from the last five)
    const r = spawnSync(process.execPath, [PLUGIN, "--action", "bogus"], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: join(home, "bin") }, encoding: "utf8", timeout: 10_000 });
    assert.deepEqual(r.stdout.trim().split("\n"), ["message=Плагин не знает такого действия.", "reason=unknown-action"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1.3.0: every refusal code has ru and en text, up to 120 characters, no line break and no \"|\"", async () => {
  const mod = await import(pathToFileURL(PLUGIN).href);
  const src = readFileSync(PLUGIN, "utf8");
  const codes = new Set([...src.matchAll(/reason: "([a-z0-9-]+)"/g)].map((m) => m[1]));
  codes.add("hermes-failed");
  codes.add("timeout");
  for (const c of codes) {
    for (const lang of ["ru", "en"]) {
      const t = mod.refusalMessage(c, lang);
      assert.ok(t, `${c} (${lang})`);
      assert.ok([...t].length <= 120 && !/[\n|]/.test(t), `${c} (${lang}): ${t}`);
    }
  }
  assert.equal(mod.refusalMessage("hermes-failed", "ru", 2), "Команда hermes завершилась с ошибкой (код 2).");
  assert.equal(mod.refusalMessage("hermes-failed", "en", 2), "The hermes command failed (exit code 2).");
  assert.equal(mod.refusalMessage("nope", "ru"), null);
});

test("1.3.x: contract 2 metadata — icon, contract, its own notification toggle carrying over \"Agent runs\"", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.meta.version, "1.3.2");
  assert.equal(pm.meta.contract, 2);
  assert.deepEqual(pm.meta.icon, { symbol: "alarm", color: "#30D158" });
  assert.deepEqual(pm.meta.push.map((r) => [r.key, r.kind, r.legacyKind]), ["job-failed", "job-costly", "ticker-silent", "gateway-silent", "estop"].map((k) => [k, "plugin", "runs"]));
  assert.ok(pm.meta.push.every((r) => r.labels?.en), "every rule has an English label");
  assert.equal(readFileSync(PLUGIN, "utf8").includes('kind="runs"'), false, "no legacy kind");
});
