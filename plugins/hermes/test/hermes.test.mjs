// Плагин hermes (agent-hub-plugins/plugins/hermes/hermes.60s.mjs) на синтетическом HOME.
// Запуск: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/hermes/test/*.test.mjs (или scripts/check.sh --only hermes)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseOutput, pluginDir, readPluginMeta, tempHome } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "hermes.60s.mjs");
const FIX = join(DIR, "fixtures");
const SECRET_MARKERS = ["СИНТЕТИЧЕСКИЙ-ПРОМПТ", "СИНТЕТИЧЕСКАЯ-ОШИБКА", "synthetic-chat"];

// Синтетический ~/.hermes: корень с gateway, профиль demo-bot с cron.
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
  assert.deepEqual(parsed.warnings, [], "вывод разбирается ядром без предупреждений");
  return { text: r.stdout, parsed };
}

function noSecrets(text) {
  for (const m of SECRET_MARKERS) assert.ok(!text.includes(m), `в выводе нет «${m}»`);
}

test("метаданные: standard 60 с, effects только open.file, управление — объявленными действиями с шаблоном job", () => {
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
  assert.ok(pm.meta.push.some((r) => r.key === "gateway-silent" && r.macOnly === true));
});

test("упавшая задача и вдвое дороже обычного → события; промпты и ошибки не выводятся", () => {
  const home = makeHome();
  try {
    const { text, parsed } = run(home);
    assert.equal(parsed.status, "error");
    assert.ok(parsed.events.includes("job-failed-bbbb33334444"), "задача bbbb упала последним запуском");
    assert.ok(parsed.events.includes("job-costly-aaaa11112222"), "aaaa: 96 500 при обычных ~41 000");
    assert.ok(!parsed.events.includes("job-failed-aaaa11112222"), "старое падение aaaa перекрыто удачными запусками");
    assert.ok(!parsed.events.includes("gateway-silent"));
    assert.ok(!parsed.events.includes("source-broken"), "обрезанная последняя строка usage_audit — не поломка");
    assert.match(text, /demo: на паузе — на паузе/);
    assert.match(text, /Падений подряд: 2/);
    noSecrets(text);
    const open = parsed.body.find((i) => i.effect && i.effect.startsWith("open.file"));
    assert.ok(open, "есть предложение открыть выводы задачи");
    assert.ok(open.effect.includes(join(home, ".hermes", "profiles", "demo-bot", "cron", "output", "aaaa11112222")));
    const cron = parsed.body.filter((i) => i.action === "cron-pause" || i.action === "cron-resume").map((i) => `${i.action} ${i.params.arg}`);
    assert.deepEqual(cron, ["cron-pause aaaa11112222", "cron-pause bbbb33334444", "cron-resume cccc55556666"]);
    assert.ok(!parsed.body.some((i) => i.effect && !i.effect.startsWith("open.")), "effect — только open.*");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway молчит: старый пульс", () => {
  const home = makeHome({ heartbeatAgeSec: 600 });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.equal(parsed.status, "error");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway молчит: процесса нет при свежем пульсе", () => {
  const home = makeHome({ gatewayPid: 999_999 });
  try {
    const { parsed, text } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.match(text, /процесса нет/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway остановлен штатно — не «молчит»", () => {
  const home = makeHome({ gatewayState: "stopped", heartbeatAgeSec: 9999 });
  try {
    const { parsed } = run(home);
    assert.ok(!parsed.events.includes("gateway-silent"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("планировщик не тикает → ticker-silent; ESTOP → estop и без ticker-silent", () => {
  let home = makeHome({ tickerAgeSec: 1000 });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("ticker-silent-demo-bot"));
    // без ESTOP — кнопка паузы всего Hermes (объявленное действие pause, без аргумента)
    const pause = parsed.body.filter((i) => i.action === "pause");
    assert.equal(pause.length, 1, "действие pause предлагается");
    assert.equal(pause[0].params.arg, undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  home = makeHome({ tickerAgeSec: 1000, estop: true });
  try {
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("estop"));
    assert.ok(!parsed.events.includes("ticker-silent-demo-bot"), "на паузе тишина планировщика ожидаема");
    assert.ok(!parsed.body.some((i) => i.action === "pause"), "уже на паузе — кнопки нет");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("порча jobs.json → unknown + source-broken", () => {
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

test("порча схемы executions.db → source-broken", () => {
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

test("нет ~/.hermes → ok без событий", () => {
  const home = tempHome("ah-herm-");
  try {
    const { parsed } = run(home);
    assert.equal(parsed.status, "ok");
    assert.deepEqual(parsed.events, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("costCheck и median", async () => {
  const { costCheck, median } = await import(PLUGIN);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const s = (xs) => xs.map((tokens) => ({ tokens }));
  assert.equal(costCheck(s([10, 10, 10, 19])).costly, false);
  assert.equal(costCheck(s([10, 10, 10, 20])).costly, true);
  assert.equal(costCheck(s([10, 10, 20])).usual, null, "мало истории — не судим");
  assert.equal(costCheck([]), null);
});

test("executions.db открывается только на чтение (immutable): файл не меняется", () => {
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

// Режим действия — как его запускает ядро: тот же файл с `--action <id> [<job>]`; hermes — двойник.
function act(home, args) {
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(home, "hermes.log");
  writeFileSync(join(bin, "hermes"), `#!/bin/sh\necho "$@" >> '${log}'\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: bin }, encoding: "utf8", timeout: 10_000 });
  let calls = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  } catch {}
  rmSync(log, { force: true });
  return { out: r.stdout.trim(), code: r.status, calls };
}

test("действия: профиль задачи из jobs.json, pause/resume по состоянию, argv hermes -p профиль cron …", () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["cron-pause", "aaaa11112222"]), { out: "ok", code: 0, calls: ["-p demo-bot cron pause aaaa11112222"] });
    assert.deepEqual(act(home, ["cron-resume", "cccc55556666"]), { out: "ok", code: 0, calls: ["-p demo-bot cron resume cccc55556666"] });
    assert.deepEqual(act(home, ["cron-run", "bbbb33334444"]).calls, ["-p demo-bot cron run bbbb33334444"]);
    assert.deepEqual(act(home, ["cron-pause", "cccc55556666"]), { out: "reason=already-paused", code: 3, calls: [] });
    assert.deepEqual(act(home, ["cron-resume", "aaaa11112222"]), { out: "reason=not-paused", code: 3, calls: [] });
    assert.deepEqual(act(home, ["cron-run", "ffff00000000"]), { out: "reason=unknown-job", code: 3, calls: [] });
    assert.deepEqual(act(home, ["cron-run", "--help"]), { out: "reason=bad-job", code: 3, calls: [] });
    assert.deepEqual(act(home, ["pause"]), { out: "ok", code: 0, calls: ["pause"] });
    writeFileSync(join(home, ".hermes", "ESTOP"), "");
    assert.deepEqual(act(home, ["pause"]), { out: "reason=already-paused", code: 3, calls: [] });
    assert.equal(act(home, ["bogus"]).out, "reason=unknown-action");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
