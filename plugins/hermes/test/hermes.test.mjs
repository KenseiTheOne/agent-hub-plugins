// Плагин hermes (agent-hub-plugins/plugins/hermes/hermes.60s.mjs) на синтетическом HOME.
// Запуск: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/hermes/test/*.test.mjs (или scripts/check.sh --only hermes)

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

test("gateway молчит — activity= нет: что идёт у Hermes, неизвестно, в «проверено» карточки выключения он не попадает", () => {
  const home = makeHome({ heartbeatAgeSec: 600 });
  try {
    const { parsed, text } = run(home);
    assert.ok(parsed.events.includes("gateway-silent"));
    assert.equal(parsed.activity, null, "не «участвую, тихо»");
    assert.doesNotMatch(text.split("\n")[0], /activity=/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gateway молчит: процесса нет при свежем пульсе", () => {
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

test("ESTOP профиля — пауза только этого профиля: тишина планировщика корня видна, кнопка pause есть, подсказка с -p", () => {
  const home = makeHome({ tickerAgeSec: 1000 });
  try {
    const root = join(home, ".hermes");
    // у корня своё расписание, и оно встало
    mkdirSync(join(root, "cron"), { recursive: true });
    writeFileSync(join(root, "cron", "jobs.json"), JSON.stringify({ jobs: [] }));
    writeFileSync(join(root, "cron", "ticker_heartbeat"), `${Date.now() / 1000 - 1200} ${process.pid}`);
    // `hermes -p demo-bot pause`
    writeFileSync(join(root, "profiles", "demo-bot", "ESTOP"), "");
    const { text, parsed } = run(home);
    assert.ok(parsed.events.includes("ticker-silent-default"), JSON.stringify(parsed.events));
    assert.ok(!parsed.events.includes("ticker-silent-demo-bot"), "у профиля на паузе тишина ожидаема");
    assert.ok(parsed.events.includes("estop-demo-bot"));
    assert.ok(!parsed.events.includes("estop"), "весь Hermes не на паузе");
    assert.doesNotMatch(parsed.header[0].title, /^Hermes на паузе/);
    assert.match(text, /^--Снять: hermes -p demo-bot resume в терминале/m);
    assert.doesNotMatch(text, /^--Снять: hermes resume/m);
    assert.equal(parsed.body.filter((i) => i.action === "pause").length, 1, "кнопка паузы всего Hermes остаётся");
    // ESTOP корня — пауза всего: ни одной тишины планировщика, кнопки нет
    writeFileSync(join(root, "ESTOP"), "");
    const all = run(home).parsed;
    assert.ok(all.events.includes("estop"));
    assert.ok(!all.events.some((e) => e.startsWith("ticker-silent")), JSON.stringify(all.events));
    assert.ok(!all.body.some((i) => i.action === "pause"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("executions.db в режиме WAL: запуск, который лежит только в -wal (у Hermes открыто соединение), виден; база Hermes не меняется", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    t.skip("нет node:sqlite");
    return;
  }
  const home = makeHome();
  const cron = join(home, ".hermes", "profiles", "demo-bot", "cron");
  const dbPath = join(cron, "executions.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    db.exec("INSERT INTO executions (id, job_id, source, process_id, pid, status, claimed_at, started_at, finished_at, error) VALUES ('e06','aaaa11112222','tick','p1',100,'failed','2026-11-04T22:00:20+01:00','2026-11-04T22:00:21+01:00','2026-11-04T22:01:00+01:00','x')");
    assert.ok(statSync(`${dbPath}-wal`).size > 0, "строка — только в журнале WAL");
    const before = readdirSync(cron).sort();
    const main = readFileSync(dbPath);
    const wal = readFileSync(`${dbPath}-wal`);
    const { parsed } = run(home);
    assert.ok(parsed.events.includes("job-failed-aaaa11112222"), JSON.stringify(parsed.events));
    assert.ok(!parsed.events.includes("source-broken"));
    assert.deepEqual(readdirSync(cron).sort(), before, "в каталоге Hermes ничего не появилось");
    assert.ok(main.equals(readFileSync(dbPath)) && wal.equals(readFileSync(`${dbPath}-wal`)), "база и журнал не тронуты");
  } finally {
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("AGENTHUB_LANG=en: поломки источников — по-английски; «что» у прав — без русского", () => {
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

test("нет ~/.hermes → unknown «Hermes не установлен» без событий", () => {
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

test("costCheck и median", async () => {
  const { costCheck, median } = await import(pathToFileURL(PLUGIN).href);
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
// out — последняя строка (ok или reason=<код>), message — объяснение отказа (строка message=, контракт 2).
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
// двойник hermes — shell-скрипт: на Windows его не запустить (плагин и так только для macOS)
const POSIX = { skip: process.platform === "win32" ? "двойник hermes — /bin/sh" : false };

test("действия: профиль задачи из jobs.json, pause/resume по состоянию, argv hermes -p профиль cron …", POSIX, () => {
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

test("1.2.2: activity= для вердикта хаба «можно ли выключать» — задачи в работе; нет таких — пусто", () => {
  const quiet = makeHome();
  try {
    assert.deepEqual(run(quiet).parsed.activity, [], "задач в работе нет — плагин участвует, у него тихо");
  } finally {
    rmSync(quiet, { recursive: true, force: true });
  }
  const jobs = JSON.parse(readFileSync(join(FIX, "jobs.json"), "utf8"));
  jobs.jobs.push({ ...jobs.jobs[0], id: "dddd77778888", name: "demo: идёт сейчас", state: "running", last_failure: null, last_run_at: null });
  const home = makeHome({ jobsText: JSON.stringify(jobs) });
  try {
    const { parsed } = run(home);
    assert.deepEqual(parsed.activity, ["Hermes: 1 задача в работе"]);
    assert.deepEqual(parsed.needsOn, null, "needsOn Hermes не сообщает");
    const r = spawnSync(process.execPath, [PLUGIN], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_LANG: "en" }, encoding: "utf8", timeout: 10_000 });
    assert.deepEqual(parseOutput(r.stdout).activity, ["Hermes: 1 job running"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1.3.0 (контракт 2): текст отказа действия пишет плагин — message= перед reason=, на языке хаба (ru и en)", POSIX, () => {
  const home = makeHome();
  try {
    const en = act(home, ["cron-pause", "cccc55556666"], { lang: "en" });
    assert.deepEqual(en, { out: "reason=already-paused", code: 3, calls: [], message: "The job is already paused." });
    assert.equal(act(home, ["cron-resume", "aaaa11112222"], { lang: "en" }).message, "The job isn't paused.");
    assert.equal(act(home, ["cron-run", "--help"], { lang: "en" }).message, "No such task.");
    // программа есть, а ~/.hermes нет — свой код: «нет ~/.local/bin/hermes» указал бы не на тот файл
    rmSync(join(home, ".hermes"), { recursive: true, force: true });
    assert.deepEqual(act(home, ["cron-run", "aaaa11112222"]), { out: "reason=no-hermes-home", code: 3, calls: [], message: "Нет папки ~/.hermes — данных Hermes нет." });
    assert.equal(act(home, ["cron-run", "aaaa11112222"], { lang: "en" }).message, "No ~/.hermes folder — no Hermes data.");
    // строка message= — до reason= (ядро берёт reason= из последней строки, message= — из последних пяти)
    const r = spawnSync(process.execPath, [PLUGIN, "--action", "bogus"], { env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: join(home, "bin") }, encoding: "utf8", timeout: 10_000 });
    assert.deepEqual(r.stdout.trim().split("\n"), ["message=Плагин не знает такого действия.", "reason=unknown-action"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("1.3.0: у каждого кода отказа — текст на ru и en, до 120 знаков, без перевода строки и без «|»", async () => {
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

test("1.3.0: метаданные контракта 2 — значок, контракт, свой переключатель уведомлений с переносом «Прогоны агентов»", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.meta.version, "1.3.0");
  assert.equal(pm.meta.contract, 2);
  assert.deepEqual(pm.meta.icon, { symbol: "alarm", color: "#30D158" });
  assert.deepEqual(pm.meta.push.map((r) => [r.key, r.kind, r.legacyKind]), ["job-failed", "job-costly", "ticker-silent", "gateway-silent", "estop"].map((k) => [k, "plugin", "runs"]));
  assert.ok(pm.meta.push.every((r) => r.labels?.en), "у каждого правила — английский ярлык");
  assert.equal(readFileSync(PLUGIN, "utf8").includes('kind="runs"'), false, "устаревшего вида нет");
});
