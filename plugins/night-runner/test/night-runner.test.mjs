// Плагин night-runner: файловый режим (замок, блокеры, сводки, очередь), режим команд раннера после этапа 1,
// порча источников → unknown + source-broken, только чтение.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, realpathSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseOutput, pluginDir } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const FILE = join(DIR, "night-runner.30s.mjs");
const FIX = join(DIR, "fixtures");
const N = await import(pathToFileURL(FILE).href);

const NOW = "2026-11-04T10:00:00Z";
const STATE = ".claude/task-runs/night";

// Синтетический HOME + двойники ps/pmset. → { home, bin, run(), write(rel, text), rm(rel), stop() }
function world({ ps = "default", power = "ac", usage = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ah-night-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  cpSync(join(FIX, "home"), home, { recursive: true });
  mkdirSync(bin);
  // кэш квоты хаба (служба usage) — вне HOME плагина, путь передаёт ядро в AGENTHUB_USAGE_FILE
  const usageFile = join(root, "usage.json");
  cpSync(join(FIX, "usage.json"), usageFile);
  const w = {
    home,
    bin,
    usageFile,
    usage,
    setUsage(obj) {
      writeFileSync(usageFile, JSON.stringify(obj));
    },
    setPs(text) {
      writeFileSync(join(root, "ps.txt"), text.replaceAll("{{HOME}}", home));
      writeFileSync(join(bin, "ps"), `#!/bin/sh\ncat '${join(root, "ps.txt")}'\n`);
      chmodSync(join(bin, "ps"), 0o755);
    },
    setPower(kind) {
      writeFileSync(join(bin, "pmset"), `#!/bin/sh\ncat '${join(FIX, `pmset-${kind === "ac" ? "ac" : "battery"}.txt`)}'\n`);
      chmodSync(join(bin, "pmset"), 0o755);
    },
    write(rel, text) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    },
    rm(rel) {
      rmSync(join(home, rel), { recursive: true, force: true });
    },
    run({ now = NOW } = {}) {
      const text = execFileSync(process.execPath, [FILE], {
        env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: bin, AGENTHUB_TEST_NOW: now, ...(w.usage ? { AGENTHUB_USAGE_FILE: usageFile } : {}) },
        encoding: "utf8",
      });
      return { text, parsed: parseOutput(text) };
    },
    stop() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  const psText = readFileSync(join(FIX, "ps.txt"), "utf8");
  w.setPs(ps === "default" ? psText : ps === "no-unity" ? psText.split("\n").filter((l) => !/Game-night/.test(l)).join("\n") : ps);
  w.setPower(power);
  return w;
}

const titles = (items) => items.map((i) => i.title);

test("night-runner: Unity на night-worktree → block и событие; импорт-воркер и основной чекаут не в счёт", () => {
  const w = world();
  try {
    const { parsed, text } = w.run();
    assert.deepEqual(parsed.warnings, []);
    assert.equal(parsed.status, "block");
    assert.match(parsed.header[0].title, /^Ночь не запустится: Unity открыт на \S+ — закройте до 04:30$/);
    assert.deepEqual(parsed.events, ["unity-open:game"]);
    assert.doesNotMatch(text, /pid 4300|pid 4250/);
  } finally {
    w.stop();
  }
});

test("night-runner: без блокеров — готова, итоги ночей (последний прогон даты), план dry-run и «держатся»", () => {
  const w = world({ ps: "no-unity" });
  try {
    const { parsed, text } = w.run();
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.header[0].title, "Ночь готова · старт в 04:30");
    const t = titles(parsed.body);
    assert.ok(t.includes("Последняя ночь 03.11: задач 1, PR 0 · ручной прогон завершён"));
    // «Последние ночи» — лента (strip=true): старые слева, итог — в note, полная строка — в подсказке
    const strip = parsed.body.findIndex((i) => i.title === "Последние ночи");
    assert.equal(parsed.body[strip].params.strip, "true");
    const cells = parsed.body.slice(strip + 1).filter((i) => i.level === 1).slice(0, 2);
    assert.deepEqual(cells.map((c) => [c.title, c.params.note]), [["02.11", "задач 2 · PR 1"], ["03.11", "задач 1 · PR 0"]]);
    assert.equal(cells[1].params.tooltip, "03.11 22:00–22:41: задач 1, PR 0 · ручной прогон завершён");
    assert.equal(cells[0].params.tooltip, "02.11 04:30–06:12: задач 2, PR 1 · очередь пуста");
    // карточки-цифры
    const stats = parsed.body.filter((i) => i.params.stat);
    assert.deepEqual(stats.map((i) => [i.params.stat, i.title]).slice(0, 2), [["Следующий запуск", "04:30"], ["План на ночь", "4 задачи"]]);
    // план: две секции, пункт с «|» в имени не ломает параметры
    const plan = parsed.body.find((i) => i.title.startsWith("План на ночь") && i.title.includes(": 4 задачи"));
    assert.ok(plan, text);
    assert.equal(plan.params.sfimage, "list.bullet");
    const d = parsed.body.find((i) => i.title.startsWith("Синтетическая задача D"));
    assert.equal(d.title, "Синтетическая задача D ¦ с чертой");
    assert.equal(d.level, 2);
    assert.equal(d.href, "https://app.clickup.com/t/ddd444");
    assert.ok(t.includes("--пропущено по фильтрам: 1".slice(2)));
    // держатся: без retries и retries ≥ 3; на повторе — retries 1
    assert.ok(t.includes("Отложены: 3 · повторятся: 1 (на " + t.find((x) => x.startsWith("Отложены")).split("(на ")[1]));
    assert.ok(t.includes("aaa111 · PR открыт · 02.11"));
    assert.ok(t.includes("ggg777 · повторов 3: нет RESULT.json · 31.10"));
    assert.ok(t.includes("ccc333 · повтор 1/3 · таймаут"));
    assert.match(text, /файлы раннера \(status --json ещё нет\)/);
  } finally {
    w.stop();
  }
});

test("night-runner: свежесть плана — старый .dry.md помечен «устарел»", () => {
  const w = world({ ps: "no-unity" });
  try {
    const old = new Date("2026-11-01T10:00:00Z");
    utimesSync(join(w.home, STATE, "20261103.dry.md"), old, old);
    const { parsed } = w.run();
    const plan = parsed.body.find((i) => i.title.startsWith("План на ночь"));
    assert.match(plan.title, /от 01\.11 \d\d:00, 3 дн назад\): \d+ задач\S* — устарел/);
    assert.equal(plan.params.color, "gray");
  } finally {
    w.stop();
  }
});

test("night-runner: живой замок ночи → «Ночь идёт», текущая задача из night.log", () => {
  const w = world();
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    const { parsed } = w.run();
    assert.equal(parsed.status, "ok");
    assert.match(parsed.header[0].title, /^Ночь идёт с \d\d:30 · задача ccc333$/);
    assert.ok(titles(parsed.body).some((t) => /^Ночь идёт с 04\.11 \d\d:30 · задача ccc333$/.test(t)));
  } finally {
    w.stop();
  }
});

test("night-runner: замок post и протухший замок — не ночь", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:59:00.000Z", command: "post" }));
    let r = w.run();
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт в 04:30");
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("Раннер занят командой «post»")));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-01T03:30:00.000Z" }));
    r = w.run();
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("Ночь не идёт; остался старый замок")));
    w.write(`${STATE}/night.lock`, "{oops");
    r = w.run();
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("night.lock не разобран")));
  } finally {
    w.stop();
  }
});

test("night-runner: маркер подмены, батарея, снятое задание launchd, квота ≥ порога", () => {
  const w = world({ ps: "no-unity", power: "battery" });
  try {
    let r = w.run();
    assert.equal(r.parsed.status, "wait");
    assert.deepEqual(r.parsed.events, ["power"]);
    w.write(`${STATE}/git-config-changed.txt`, "20261103 проект game, подготовка: изменён .git/config\n");
    w.rm("Library/LaunchAgents/com.kensei.night-runner.plist");
    w.setUsage({ version: 1, fetched_at: 1793790000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent: 83, resets_at: "2026-11-09T04:00:00+00:00" }] });
    r = w.run();
    assert.equal(r.parsed.status, "block");
    assert.deepEqual([...r.parsed.events].sort(), ["launchd-missing", "power", "quota-skip", "tamper"]);
    const tamper = r.parsed.body.find((i) => i.event === "tamper");
    assert.match(tamper.title, /Найден маркер подмены — ночь заблокирована до проверки/);
    assert.match(tamper.effect, /^open\.file \/.*git-config-changed\.txt$/);
  } finally {
    w.stop();
  }
});

test("night-runner: итог ночи сегодня → событие night-done:<дата>", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/20261104.md`, "# Ночной прогон 20261104\n\n04:30–05:10 · квота неизвестна · остановка: очередь пуста · задач 0 · PR 0\n");
    const { parsed } = w.run();
    assert.ok(parsed.events.includes("night-done:20261104"));
  } finally {
    w.stop();
  }
});

test("night-runner: порча фикстуры → unknown + source-broken", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/20261103.md`, "что-то другое\n");
    let r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.ok(r.parsed.events.includes("source-broken"));
    assert.match(r.text, /сводка 20261103\.md: незнакомая форма/);
    w.write(`${STATE}/20261103.md`, readFileSync(join(FIX, "home", STATE, "20261103.md"), "utf8"));
    w.write("Projects/IT/night-runner/config.json", JSON.stringify({ schema: 2, projects: "все" }));
    r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.match(r.text, /нет списка projects/);
    w.write("Projects/IT/night-runner/config.json", "{не json");
    r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.ok(r.parsed.events.includes("source-broken"));
    w.setPs("");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.match(r.text, /ps не ответил/);
  } finally {
    w.stop();
  }
});

test("night-runner: раннер со status/queue --json (этап 1) → режим команд; незнакомая форма → файлы", () => {
  const w = world({ ps: "no-unity" });
  try {
    for (const f of ["night-run.mjs", "status.json", "queue.json"]) cpSync(join(FIX, "runner-v2", f), join(w.home, "Projects/IT/night-runner", f));
    let r = w.run();
    assert.match(r.parsed.header[0].title, /^Ночь идёт с \d\d:30 · задача ccc333$/);
    assert.ok(r.parsed.events.includes("power"));
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("План на ночь (пробный прогон") && t.includes(": 1 задача")));
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("Отложены: 1 · повторятся: 1")));
    assert.match(r.text, /--night-run\.mjs status --json/);
    w.write("Projects/IT/night-runner/status.json", JSON.stringify({ hello: "world" }));
    r = w.run();
    assert.match(r.text, /status --json: нет ответа или незнакомая форма — читаю файлы/);
    assert.match(r.text, /файлы раннера \(status --json ещё нет\)/);
  } finally {
    w.stop();
  }
});

test("night-runner: только чтение — дерево HOME не меняется", () => {
  const w = world();
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    const snap = () => {
      const out = [];
      const walk = (d) => {
        for (const n of readdirSync(d).sort()) {
          const p = join(d, n);
          const st = statSync(p);
          out.push(`${p}|${st.size}|${st.mtimeMs}|${st.mode}`);
          if (st.isDirectory()) walk(p);
        }
      };
      walk(w.home);
      return out;
    };
    const before = snap();
    w.run();
    w.run();
    assert.deepEqual(snap(), before);
  } finally {
    w.stop();
  }
});

test("night-runner: чистые функции", () => {
  assert.deepEqual(N.runnerCommands('const COMMANDS = ["run", "check"];'), ["run", "check"]);
  assert.deepEqual(N.runnerCommands("нет списка"), []);
  const c = N.parseRunnerConfig({ projects: [{ id: "a", main_checkout: "~/A", profile: { type: "unity", project_path: "P" } }] }, "/h");
  assert.equal(c.projects[0].worktree, "/h/A-night");
  assert.equal(c.projects[0].unityDir, "/h/A-night/P");
  assert.equal(c.stateDir, "/h/.claude/task-runs/night");
  const v1 = N.parseRunnerConfig({ worktree: "~/PW-night", state_dir: "~/s" }, "/h");
  assert.equal(v1.projects[0].unityDir, "/h/PW-night/Client/PerfectWar");
  assert.equal(N.parseRunnerConfig([], "/h").ok, false);
  const procs = N.parsePs(" 10 1 /U/Unity -projectpath '/w/P/' -x\n 11 10 /U/Unity -batchMode -projectPath /w/P\n 12 1 /U/Unity -projectPath /w/P2\n");
  assert.equal(N.liveEditor(procs, "/w/P"), 10);
  assert.equal(N.liveEditor(procs.slice(1), "/w/P"), null);
  assert.equal(N.currentTaskFromLog("t задача A: старт, x\nt проект p, задача A: ok\nt задача B: старт, y\n"), "B");
  assert.equal(N.currentTaskFromLog("t задача A: старт\nt проект p, задача A: ok — x\n"), null);
  const s = N.parseSummary("# Ночной прогон 20261101\n\n04:30–05:00 · остановка: x · задач 1 · PR 1\n\n---\n\n# Ночной прогон 20261101\n\n06:00–06:10 · квота неизвестна · остановка: y · задач 0 · PR 0\n");
  assert.deepEqual([s.range, s.stop, s.tasks, s.prs], ["06:00–06:10", "y", 0, 0]);
  assert.equal(N.parseSummary("# Ночной прогон 20261101\n\nбез фактов\n").ok, false);
  assert.equal(N.clean("a|b\nc --- ~~~"), "a¦b c --- ~~~");
  assert.equal(N.clean("---x"), "x");
  assert.equal(N.adaptStatus({ running: "да", blockers: [] }), null);
  assert.equal(N.adaptQueue({ held: [] }), null);
});

test("night-runner: пустой план dry-run показывает причину остановки", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/20261104.dry.md`, "# Ночной прогон 20261104\n\nквота неизвестна · остановка: pre-flight: ни один проект ночи не готов · задач 0 · PR 0\n\n## Game · ClickUp\n\nочередь не прочитана: pre-flight\n");
    const { parsed } = w.run();
    const plan = parsed.body.find((i) => i.title.startsWith("План на ночь"));
    assert.match(plan.title, /^План на ночь \(пробный прогон от .*\): 0 задач · pre-flight: ни один проект ночи не готов$/);
  } finally {
    w.stop();
  }
});

// ---------- находки ревью: падение раннера, провалы подряд, чужой держатель замка, управление ночью ----------

test("night-runner: протухший замок ночи → «раннер упал» и событие runner-crashed:<дата>", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-04T04:30:00.000Z" }));
    const { parsed } = w.run();
    assert.equal(parsed.status, "block");
    assert.match(parsed.header[0].title, /^Ночь оборвалась \(раннер упал\) — откройте night\.log$/);
    assert.ok(parsed.events.includes("runner-crashed:20261104"), JSON.stringify(parsed.events));
    // протухший замок post — не падение ночи
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-04T04:30:00.000Z", command: "post" }));
    assert.equal(w.run().parsed.events.some((e) => e.startsWith("runner-crashed")), false);
    // замка нет, а сводка дня «прогон не завершён» — тоже упал
    w.rm(`${STATE}/night.lock`);
    w.write(`${STATE}/20261104.md`, "# Ночной прогон 20261104\n\n04:30–… · квота неизвестна · остановка: прогон не завершён · задач 1 · PR 0\n");
    assert.ok(w.run().parsed.events.includes("runner-crashed:20261104"));
  } finally {
    w.stop();
  }
});

test("night-runner: ночь остановлена провалами подряд → событие infra-failures:<дата>", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/20261104.md`, "# Ночной прогон 20261104\n\n04:30–05:20 · квота неизвестна · остановка: 3 инфраструктурных провала подряд · задач 3 · PR 0\n");
    const { parsed } = w.run();
    assert.ok(parsed.events.includes("infra-failures:20261104"), JSON.stringify(parsed.events));
    assert.ok(parsed.events.includes("night-done:20261104"));
  } finally {
    w.stop();
  }
});

test("night-runner: замок держит research (без command в замке) — не «Ночь идёт», блокеры не маскируются", () => {
  const ps = readFileSync(join(FIX, "ps.txt"), "utf8").replace(/night-run\.mjs\s*$/m, "night-run.mjs research --project game");
  const w = world({ ps });
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:05:00.000Z" }));
    const { parsed } = w.run();
    assert.doesNotMatch(parsed.header[0].title, /Ночь идёт/);
    assert.equal(parsed.status, "block", "Unity на night-worktree виден");
    assert.ok(titles(parsed.body).some((t) => t.startsWith("Раннер занят командой «research»")));
    assert.equal(parsed.events.some((e) => e.startsWith("runner-crashed")), false);
    // после патча этапа 1 у ночи command="run" — это ночь
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8").replace(/night-run\.mjs\s*$/m, "night-run.mjs run"));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z", command: "run" }));
    assert.match(w.run().parsed.header[0].title, /^Ночь идёт/);
  } finally {
    w.stop();
  }
});

test("night-runner: идущая ночь предлагает действия stop и skip текущей задачи; план — skip и run задач", () => {
  const w = world();
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    const { parsed } = w.run();
    const all = [...parsed.header, ...parsed.body];
    assert.ok(!all.some((i) => i.effect && !/^open\./.test(i.effect)), "effect — только open.*: управление ночью не примитив ядра");
    const stop = parsed.body.find((i) => i.action === "stop");
    assert.ok(stop, "есть «Остановить ночь»");
    assert.equal(stop.params.arg, undefined);
    assert.ok(parsed.body.some((i) => i.action === "skip" && i.params.arg === "ccc333"));
    assert.ok(parsed.body.some((i) => i.action === "skip" && /^[A-Za-z0-9_-]+$/.test(i.params.arg) && i.params.arg !== "ccc333"), "у задач плана есть пропуск");
    assert.ok(!parsed.body.some((i) => i.action === "run"), "при живом замке днём ничего не запускаем");
    assert.equal(N.taskIdFromUrl("https://app.clickup.com/t/86c0abc12"), "86c0abc12");
    assert.equal(N.taskIdFromUrl("https://x/a b"), null);
    assert.equal(N.holderSubcommand("/opt/homebrew/bin/node /x/night-run.mjs research --deep"), "research");
    assert.equal(N.holderSubcommand("node night-run.mjs"), null);
    assert.equal(N.isNightLock(null, "research"), false);
    assert.equal(N.isNightLock("run", "run"), true);
  } finally {
    w.stop();
  }
});

test("night-runner: без замка план предлагает run (без пуша), объявленные действия — с шаблоном аргумента", async () => {
  const w = world({ ps: "no-unity" });
  try {
    const { parsed } = w.run();
    const run = parsed.body.filter((i) => i.action === "run");
    assert.ok(run.length > 0, "у задач плана есть «Запустить днём без пуша»");
    for (const i of run) assert.match(i.params.arg, /^[A-Za-z0-9_-]{1,64}$/);
    const { readPluginMeta } = await import("../../../scripts/lib/plugin-test.mjs");
    const meta = readPluginMeta(FILE).meta;
    assert.deepEqual(meta.effects, ["open.file", "open.url"]);
    const byId = Object.fromEntries(meta.actions.map((a) => [a.id, a]));
    assert.deepEqual(Object.keys(byId).sort(), ["run", "skip", "stop"]);
    assert.equal(byId.stop.level, "confirm");
    assert.equal(byId.stop.arg, undefined);
    assert.deepEqual(byId.skip.arg, { name: "taskId", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" });
    assert.equal(byId.run.level, "confirm-cost");
    assert.match(byId.skip.command, /^night-runner\.30s\.mjs --action skip \{taskId\}$/);
    assert.ok(meta.push.some((r) => r.key === "unity-open" && r.hold === "evening"));
    assert.ok(meta.push.some((r) => r.key === "runner-crashed" && r.quietException === true));
  } finally {
    w.stop();
  }
});

// Режим действия: тот же файл с `--action <id> [<taskId>]`, как его запускает ядро.
function act(w, args, { stopFiles = true, nodeLog = null } = {}) {
  const data = join(w.home, "..", "data");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "config.json"), JSON.stringify(stopFiles ? { stopFiles: true } : {}));
  if (nodeLog) {
    writeFileSync(join(w.bin, "node"), `#!/bin/sh\necho "$PWD $@" >> '${nodeLog}'\n`);
    chmodSync(join(w.bin, "node"), 0o755);
  }
  let out = "";
  let code = 0;
  try {
    out = execFileSync(process.execPath, [FILE, "--action", ...args], {
      env: { HOME: w.home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: w.bin, AGENTHUB_PLUGIN_DATA_PATH: data },
      encoding: "utf8",
    });
  } catch (e) {
    out = String(e.stdout || "");
    code = e.status;
  }
  return { out: out.trim(), code, data };
}

test("night-runner, действие stop: без флага stopFiles — отказ; STOP (0600) только при идущей ночи", () => {
  const w = world();
  try {
    const stopPath = join(w.home, STATE, "STOP");
    assert.deepEqual(act(w, ["stop"], { stopFiles: false }), { out: "reason=runner-patch-required", code: 3, data: join(w.home, "..", "data") });
    assert.equal(act(w, ["stop"]).out, "reason=night-not-running", "замка нет");
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z", command: "research" }));
    assert.equal(act(w, ["stop"]).out, "reason=night-not-running", "замок держит research — не ночь");
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 6000, startedAt: "2026-11-04T03:30:02.000Z" }));
    assert.equal(act(w, ["stop"]).out, "reason=night-not-running", "держатель мёртв");
    assert.throws(() => statSync(stopPath));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    const r = act(w, ["stop"]);
    assert.deepEqual([r.out, r.code], ["ok", 0]);
    assert.equal(statSync(stopPath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(stopPath, "utf8")).nightPid, 5000);
    assert.deepEqual([act(w, ["stop"]).code], [0], "повтор — существующий STOP не трогаем");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    rmSync(stopPath);
    assert.equal(act(w, ["stop"]).out, "reason=lock-unknown", "ps не ответил — не знаем, чья ночь: отказ");
    assert.throws(() => statSync(stopPath));
  } finally {
    w.stop();
  }
});

test("night-runner, действие skip: SKIP-<id> 0600; плохой id и без флага — отказ", () => {
  const w = world();
  try {
    assert.equal(act(w, ["skip", "ccc333"], { stopFiles: false }).out, "reason=runner-patch-required");
    assert.equal(act(w, ["skip", "../etc"]).out, "reason=bad-task");
    assert.equal(act(w, ["skip"]).out, "reason=bad-task");
    const r = act(w, ["skip", "ccc333"]);
    assert.deepEqual([r.out, r.code], ["ok", 0]);
    const p = join(w.home, STATE, "SKIP-ccc333");
    assert.equal(statSync(p).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(p, "utf8")).taskId, "ccc333");
    assert.equal(act(w, ["bogus"]).out, "reason=unknown-action");
  } finally {
    w.stop();
  }
});

test("night-runner, действие run: только без живого замка, night-run.mjs run --task <проект>:<id> --no-push отдельным процессом", async () => {
  const w = world();
  const log = join(w.home, "..", "node.log");
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z", command: "post" }));
    assert.equal(act(w, ["run", "ccc333"], { nodeLog: log }).out, "reason=night-lock", "замок держит любая команда раннера — нельзя");
    w.rm(`${STATE}/night.lock`);
    assert.equal(act(w, ["run", "-rf"], { nodeLog: log }).out, "reason=bad-task");
    const r = act(w, ["run", "ccc333"], { nodeLog: log });
    assert.deepEqual([r.out, r.code], ["ok", 0]);
    for (let i = 0; i < 50 && !existsSync(log); i++) await new Promise((res) => setTimeout(res, 50));
    const line = readFileSync(log, "utf8").trim();
    // в конфиге два включённых проекта (game, web): голый id раннер отверг бы — проект из раздела плана
    assert.equal(line, `${realpathSync(join(w.home, "Projects/IT/night-runner"))} night-run.mjs run --task game:ccc333 --no-push`);
    const logs = readdirSync(r.data).filter((n) => /^runner-.*\.log$/.test(n));
    assert.equal(logs.length, 1);
    assert.equal(statSync(join(r.data, logs[0])).mode & 0o777, 0o600);
  } finally {
    w.stop();
  }
});

test("night-runner, действие run: проект задачи — по плану dry-run; нет в плане при двух проектах — отказ до запуска", async () => {
  const w = world();
  const log = join(w.home, "..", "node.log");
  try {
    const N = await import(pathToFileURL(FILE).href);
    const dirs = { runnerDir: join(w.home, "Projects/IT/night-runner"), stateDir: join(w.home, STATE), home: w.home };
    assert.deepEqual(N.taskRef("ccc333", dirs), { ref: "game:ccc333" });
    assert.deepEqual(N.taskRef("9", dirs), { ref: "web:9" }, "раздел «Web» — проект web по title");
    assert.deepEqual(N.taskRef("zzz999", dirs), { reason: "unknown-project" }, "два включённых проекта, в плане задачи нет");
    assert.equal(act(w, ["run", "zzz999"], { nodeLog: log }).out, "reason=unknown-project");
    assert.equal(act(w, ["run", "_ccc333"], { nodeLog: log }).out, "reason=bad-task", "раннер не примет id с «_» в начале");
    assert.ok(!existsSync(log), "раннер не запускался");
    // один включённый проект — его id, даже если задачи нет в плане
    const cfgPath = join(dirs.runnerDir, "config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.projects[1].enabled = false;
    writeFileSync(cfgPath, JSON.stringify(cfg));
    assert.deepEqual(N.taskRef("zzz999", dirs), { ref: "game:zzz999" });
  } finally {
    w.stop();
  }
});


// Бюджет ночи — формула раннера (night-runner/lib/schedule.mjs, nightBudget); квота — из кэша хаба.
test("night-runner: бюджет ночи — night_share_pct / 7 до потолка, последняя ночь перед сбросом — весь остаток", () => {
  const cfg = { stop_seven_day_pct: 85, night_share_pct: 30, skip_seven_day_pct: 80 };
  const at = Date.parse("2026-11-05T04:30:00Z");
  const reset = Date.parse("2026-11-09T04:00:00Z");
  assert.deepEqual(N.nightBudget(40, reset, at, cfg), { pct: 30 / 7, stopAt: 40 + 30 / 7, lastNight: false });
  assert.equal(N.nightBudget(84, reset, at, cfg).pct, 1, "не больше остатка до потолка");
  assert.equal(N.nightBudget(90, reset, at, cfg).pct, 0);
  // до сброса меньше суток + окно ночи (5 ч) — последняя ночь: весь остаток
  const last = N.nightBudget(40, Date.parse("2026-11-06T08:00:00Z"), at, cfg);
  assert.equal(last.lastNight, true);
  assert.equal(last.pct, 45);
  // окно ночи из schedule.window_hours раннера
  assert.equal(N.nightBudget(40, Date.parse("2026-11-06T06:00:00Z"), at, cfg, 1).lastNight, false);
  assert.equal(N.nightBudget(40, Date.parse("2026-11-06T06:00:00Z"), at, cfg, 2).lastNight, true);
});

test("night-runner: карточка «Бюджет ночи» по кэшу квоты хаба; квота недели в карточке-цифре", () => {
  const w = world({ ps: "no-unity" });
  try {
    const { text, parsed } = w.run();
    assert.deepEqual(parsed.warnings, []);
    // night_share_pct 30 из фикстуры раннера / 7 ≈ 4,3 п. п.; неделя 44% → стоп на 48%
    assert.match(text, /\nБюджет ночи \| gauge=4 note="доля недели" color=#BF5AF2 sfimage=moon\.stars\n--Ночь возьмёт не больше 4,3% недели\n--Ночь остановится, когда неделя дойдёт до 48%\n/);
    assert.match(text, /^44% \| stat="Квота недели" note="при ≥ 80% ночь пропустит запуск"/m);
    assert.doesNotMatch(text, /kensei-statusline/);
    // последняя ночь перед сбросом
    w.setUsage({ version: 1, fetched_at: 1793790000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent: 50, resets_at: "2026-11-05T06:00:00+00:00" }] });
    const last = w.run();
    assert.match(last.text, /--Ночь возьмёт не больше 35% недели — последняя ночь перед сбросом\n--Ночь остановится, когда неделя дойдёт до 85%/);
    // неделя ≥ порога пропуска — вместо бюджета «пропустит» (и блокер quota-skip)
    w.setUsage({ version: 1, fetched_at: 1793790000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent: 81, resets_at: "2026-11-09T04:00:00+00:00" }] });
    const hot = w.run();
    assert.match(hot.text, /Ночь пропустит запуск: неделя 81% ≥ 80%/);
    assert.ok(hot.parsed.events.includes("quota-skip"));
    // 5-часовое окно — ночь ограничит себя им
    w.setUsage({ version: 1, fetched_at: 1793790000, error: null, rows: [{ kind: "session", group: "session", percent: 10, resets_at: "2026-11-04T12:00:00+00:00" }, { kind: "weekly_all", group: "weekly", percent: 20, resets_at: "2026-11-09T04:00:00+00:00" }] });
    assert.match(w.run().text, /Есть 5-часовое окно/);
    // устаревший кэш — пометка
    w.setUsage({ version: 1, fetched_at: 1793700000, error: "token-expired", rows: [{ kind: "weekly_all", group: "weekly", percent: 20, resets_at: "2026-11-09T04:00:00+00:00" }] });
    assert.match(w.run().text, /--квота обновлялась \d+ ч назад/);
    // английский
    const en = execFileSync(process.execPath, [FILE], { env: { HOME: w.home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: w.bin, AGENTHUB_TEST_NOW: NOW, AGENTHUB_USAGE_FILE: w.usageFile, AGENTHUB_LANG: "en" }, encoding: "utf8" });
    assert.match(en, /Night budget \| gauge=4 note="share of the week"/);
  } finally {
    w.stop();
  }
});

test("night-runner: без AGENTHUB_USAGE_FILE — «квота недоступна», ни бюджета, ни блокера по квоте", () => {
  const w = world({ ps: "no-unity", usage: false });
  try {
    const { text, parsed } = w.run();
    assert.match(text, /^Квота недоступна: хаб не передал кэш квоты/m);
    assert.match(text, /^— \| stat="Квота недели" note="квота недоступна"/m);
    assert.doesNotMatch(text, /Бюджет ночи/);
    assert.ok(!parsed.events.includes("quota-skip"));
    assert.equal(parsed.status, "ok");
  } finally {
    w.stop();
  }
});

test("night-runner: метаданные — квота из кэша хаба, без kensei-statusline", () => {
  const src = readFileSync(FILE, "utf8");
  assert.doesNotMatch(src, /kensei-statusline/);
  assert.match(src, /<agenthub\.fsRead>\$AGENTHUB_USAGE_FILE — /);
  assert.match(src, /<agenthub\.version>0\.4\.0<\/agenthub\.version>/);
});

test("night-runner: идёт ночь — бюджет из квоты на её старте (сводка ночи), а не по текущей неделе; «пропустит» нет", () => {
  const w = world({ ps: "no-unity" });
  try {
    const started = "2026-11-04T03:30:02.000Z";
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: started }));
    const stamp = N.dateStamp(Date.parse(started));
    w.write(`${STATE}/${stamp}.md`, `# Ночной прогон ${stamp}\n\n04:30–… · квота: неделя 40% → 42%, бюджет ночи 4.3 п. п. недели · остановка: прогон не завершён · задач 1 · PR 0\n`);
    const row = (percent) => ({ version: 1, fetched_at: Date.parse(NOW) / 1000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent, resets_at: "2026-11-09T04:00:00+00:00" }] });
    for (const p of [40, 42, 44, 81]) {
      w.setUsage(row(p));
      const { text, parsed } = w.run();
      assert.match(parsed.header[0].title, /^Ночь идёт/);
      assert.match(text, /--Ночь возьмёт не больше 4,3% недели\n--Ночь остановится, когда неделя дойдёт до 44%\n--бюджет зафиксирован на старте ночи, при неделе 40%/, `неделя ${p}%:\n${text}`);
      assert.doesNotMatch(text, /пропустит запуск:/);
      assert.ok(!parsed.events.includes("quota-skip"), `неделя ${p}%`);
    }
    // последняя ночь перед сбросом — из сводки
    w.write(`${STATE}/${stamp}.md`, `# Ночной прогон ${stamp}\n\n04:30–… · квота: неделя 50% → 60%, бюджет ночи 35 п. п. недели — неделя сбрасывается до следующей ночи, остаток до потолка · остановка: прогон не завершён · задач 1 · PR 0\n`);
    assert.match(w.run().text, /--Ночь возьмёт не больше 35% недели — последняя ночь перед сбросом\n--Ночь остановится, когда неделя дойдёт до 85%/);
    // в сводке квоты ещё нет — честно «пока нет», без расчёта по текущей неделе
    w.write(`${STATE}/${stamp}.md`, `# Ночной прогон ${stamp}\n\n04:30–… · квота неизвестна · остановка: прогон не завершён · задач 0 · PR 0\n`);
    const unk = w.run().text;
    assert.match(unk, /^Ночь идёт: бюджет раннер считает от квоты на старте ночи — в сводке ночи его пока нет/m);
    assert.doesNotMatch(unk, /Ночь возьмёт/);
    assert.deepEqual(N.parseNightQuota("квота 5ч 10% → 30%, неделя 44%"), { startPct: null, budgetPct: null, lastNight: false, fiveHour: true });
  } finally {
    w.stop();
  }
});

test("night-runner: строка недели со сброшенным resets_at (служба оставила старые строки) — не в счёт: ни бюджета, ни блокера", () => {
  const w = world({ ps: "no-unity" });
  try {
    const now = "2026-11-09T20:00:00Z";
    const stale = (percent) => ({ version: 1, fetched_at: Date.parse("2026-11-09T02:00:00Z") / 1000, error: "token-expired", rows: [{ kind: "weekly_all", group: "weekly", percent, resets_at: "2026-11-09T04:00:00+00:00" }] });
    w.setUsage(stale(62));
    const { text, parsed } = w.run({ now });
    assert.doesNotMatch(text, /последняя ночь|Ночь возьмёт|Ночь остановится/);
    assert.match(text, /^Квота недоступна: неделя сброшена [^,]+, свежей квоты пока нет — бюджет ночи не посчитать/m);
    assert.match(text, /^— \| stat="Квота недели" note="квота недоступна"/m);
    assert.match(text, /--квота обновлялась \d+ ч назад/);
    w.setUsage(stale(85));
    const hot = w.run({ now });
    assert.ok(!hot.parsed.events.includes("quota-skip"), hot.text);
    assert.notEqual(hot.parsed.status, "block");
    assert.equal(N.weeklyRow(stale(85), Date.parse(now)), null);
    assert.equal(N.weeklyRow(stale(85)).percent, 85);
  } finally {
    w.stop();
  }
});

test("night-runner: кэш хаба без строк (нет входа, нет сети) — «квота недоступна» с причиной, а не тишина", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.setUsage({ version: 1, fetched_at: null, error: "no-token", rows: [] });
    const a = w.run().text;
    assert.match(a, /^— \| stat="Квота недели" note="квота недоступна"/m);
    assert.match(a, /^Квота недоступна: нет входа в Claude Code — бюджет ночи не посчитать/m);
    w.setUsage({ version: 1, fetched_at: null, error: "network", rows: [] });
    assert.match(w.run().text, /^Квота недоступна: нет связи с Anthropic — бюджет ночи не посчитать/m);
    w.setUsage({ version: 1, fetched_at: null, checked_at: 1, error: null, rows: [] });
    assert.match(w.run().text, /^Квота недоступна: хаб ещё не получил квоту — бюджет ночи не посчитать/m);
  } finally {
    w.stop();
  }
});
