// Плагин night-runner: файловый режим (замок, блокеры, сводки, очередь), режим команд раннера после этапа 1,
// порча источников → unknown + source-broken, только чтение.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, realpathSync, symlinkSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, utimesSync } from "node:fs";
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
    run({ now = NOW, env = {} } = {}) {
      const text = execFileSync(process.execPath, [FILE], {
        env: { HOME: home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: bin, AGENTHUB_TEST_NOW: now, ...(w.usage ? { AGENTHUB_USAGE_FILE: usageFile } : {}), ...env },
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

// Каталог прогона run раннера: state_dir/<YYYYMMDD>/<HHMMSS>/night.log по местному времени (night-run.mjs, run).
function runDirRel(iso, offsetMs = 0) {
  const d = new Date(Date.parse(iso) + offsetMs);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${STATE}/${N.dateStamp(d.getTime())}/${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

test("night-runner: протухший замок ночи → «раннер упал» и событие runner-crashed:<дата>", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-04T04:30:00.000Z" }));
    // run заводит каталог прогона до замка (nightLock ждёт чужой замок до минуты)
    w.write(`${runDirRel("2026-11-04T04:30:00.000Z", -20_000)}/night.log`, "2026-11-04T04:29:40.000Z старт\n");
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

test("night-runner: протухший замок без command от setup / migrate-state / research (Ctrl+C) — не «раннер упал»", () => {
  const w = world({ ps: "no-unity" });
  try {
    // setup днём, прерван Ctrl+C: замок без command, каталога прогона нет
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-04T09:00:00.000Z" }));
    let r = w.run();
    assert.equal(r.parsed.events.some((e) => e.startsWith("runner-crashed")), false, r.text);
    assert.notEqual(r.parsed.status, "block");
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("Ночь не идёт; остался старый замок")));
    // research заводит каталог с суффиксом -research — тоже не ночь
    w.write(`${runDirRel("2026-11-04T09:00:00.000Z", -2000)}-research/night.log`, "x\n");
    assert.equal(w.run().parsed.events.some((e) => e.startsWith("runner-crashed")), false);
    // каталог прогона run, но заведён давно (другой прогон того дня) — не этот замок
    w.write(`${runDirRel("2026-11-04T09:00:00.000Z", -3_600_000)}/night.log`, "x\n");
    assert.equal(w.run().parsed.events.some((e) => e.startsWith("runner-crashed")), false);
    // каталог прогона run перед замком — это ночь, она упала
    w.write(`${runDirRel("2026-11-04T09:00:00.000Z", -30_000)}/night.log`, "x\n");
    assert.ok(w.run().parsed.events.includes("runner-crashed:20261104"));
    // после патча этапа 1 command: "run" — ночь и без каталога
    w.rm(`${STATE}/20261104`);
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 777, startedAt: "2026-11-04T09:00:00.000Z", command: "run" }));
    assert.ok(w.run().parsed.events.includes("runner-crashed:20261104"));
    assert.equal(N.hasRunDir(join(w.home, STATE), "не дата"), false);
  } finally {
    w.stop();
  }
});

test("night-runner: ps не ответил при живой ночи (сводка «прогон не завершён») — ни night-done, ни «раннер упал»", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    w.write(`${STATE}/20261104.md`, "# Ночной прогон 20261104\n\n04:30–… · квота неизвестна · остановка: прогон не завершён · задач 1 · PR 0\n");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    const { parsed } = w.run();
    assert.ok(parsed.events.includes("source-broken"));
    assert.equal(parsed.events.some((e) => e.startsWith("night-done") || e.startsWith("runner-crashed")), false, JSON.stringify(parsed.events));
  } finally {
    w.stop();
  }
});

test("night-runner: неделя ≥ порога, а сброс до старта или вскоре после него — не quota-skip (как decideStart раннера)", () => {
  const w = world({ ps: "no-unity" });
  try {
    // старт 04:30 местного; «сейчас» — вечер накануне, по местному времени
    const local = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
    const nowMs = local(2026, 11, 8, 21, 0);
    const startMs = local(2026, 11, 9, 4, 30);
    const now = new Date(nowMs).toISOString();
    const usage = (percent, resetsMs) => ({ version: 1, fetched_at: nowMs / 1000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent, resets_at: new Date(resetsMs).toISOString() }] });
    // сброс через 2,5 ч после старта (≤ max_wait_for_reset_min 240) — ночь подождёт
    w.setUsage(usage(82, startMs + 150 * 60_000));
    let r = w.run({ now });
    assert.ok(!r.parsed.events.includes("quota-skip"), r.text);
    assert.equal(r.parsed.status, "ok");
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт после сброса недели, в 07:01");
    assert.match(r.text, /^Неделя 82% ≥ 80%: ночь подождёт её сброса до 07:01 и возьмёт бюджет от новой недели/m);
    assert.doesNotMatch(r.text, /пропустит запуск:/);
    // сброс за полчаса до старта — к старту неделя новая
    w.setUsage(usage(82, startMs - 30 * 60_000));
    r = w.run({ now });
    assert.ok(!r.parsed.events.includes("quota-skip"), r.text);
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт в 04:30");
    assert.match(r.text, /^Неделя сбросится до старта \(\d\d\.\d\d 04:00\) — бюджет ночи раннер посчитает от новой недели/m);
    // ниже порога, но сброс до старта — бюджет не «весь остаток» по старой неделе
    w.setUsage(usage(50, startMs - 30 * 60_000));
    r = w.run({ now });
    assert.doesNotMatch(r.text, /последняя ночь перед сбросом/);
    assert.match(r.text, /^Неделя сбросится до старта/m);
    // сброс дальше max_wait — пропуск, как раньше
    w.setUsage(usage(82, startMs + 300 * 60_000));
    r = w.run({ now });
    assert.ok(r.parsed.events.includes("quota-skip"));
    assert.match(r.parsed.header[0].title, /^Ночь не запустится: неделя 82% ≥ 80% — ночь пропустит запуск$/);
    // max_wait_for_reset_min из config.json раннера: 0 — раннер не ждёт
    const cfgRel = "Projects/IT/night-runner/config.json";
    const cfg = JSON.parse(readFileSync(join(w.home, cfgRel), "utf8"));
    cfg.schedule.max_wait_for_reset_min = 0;
    w.write(cfgRel, JSON.stringify(cfg));
    w.setUsage(usage(82, startMs + 150 * 60_000));
    assert.ok(w.run({ now }).parsed.events.includes("quota-skip"));
    // чистая функция
    const u = { skip_seven_day_pct: 80 };
    assert.equal(N.weekAtStart({ percent: 82, resetsMs: startMs + 240 * 60_000 }, startMs, u, 240), "wait");
    assert.equal(N.weekAtStart({ percent: 82, resetsMs: startMs + 241 * 60_000 }, startMs, u, 240), "skip");
    assert.equal(N.weekAtStart({ percent: 82, resetsMs: null }, startMs, u, 240), "skip");
    assert.equal(N.weekAtStart({ percent: 82, resetsMs: startMs }, startMs, u, 240), "reset");
    assert.equal(N.weekAtStart({ percent: 50, resetsMs: startMs + 86_400_000 }, startMs, u, 240), null);
  } finally {
    w.stop();
  }
});

test("night-runner: следующий старт — тот же час по часам, и в день перехода на летнее или зимнее время", () => {
  const code = `const N = await import(${JSON.stringify(pathToFileURL(FILE).href)}); const d = new Date(N.nextStart("04:30", Date.parse(process.argv[1]))); console.log(d.getDate() + " " + d.getHours() + ":" + d.getMinutes());`;
  const at = (iso) => execFileSync(process.execPath, ["--input-type=module", "-e", code, iso], { env: { PATH: "/usr/bin:/bin", TZ: "Europe/Berlin" }, encoding: "utf8" }).trim();
  assert.equal(at("2026-10-24T03:00:00Z"), "25 4:30", "переход на зимнее время 25.10");
  assert.equal(at("2026-03-28T04:00:00Z"), "29 4:30", "переход на летнее время 29.03");
  assert.equal(at("2026-11-04T01:00:00Z"), "4 4:30", "до старта — сегодня");
});

test("night-runner: диагностика по-английски при AGENTHUB_LANG=en", () => {
  const w = world({ ps: "no-unity" });
  try {
    w.write("Projects/IT/night-runner/config.json", JSON.stringify({ schema: 2, projects: "все" }));
    w.write(`${STATE}/20261103.md`, "что-то другое\n");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    const en = execFileSync(process.execPath, [FILE], { env: { HOME: w.home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: w.bin, AGENTHUB_TEST_NOW: NOW, AGENTHUB_USAGE_FILE: w.usageFile, AGENTHUB_LANG: "en" }, encoding: "utf8" });
    assert.match(en, /^--the runner's config\.json: no projects list; ps didn't answer; summary 20261103\.md: unknown format$/m);
    assert.match(en, /^Can't read runner files \| status=unknown event=source-broken/m);
    // «что» у прав — язык-нейтральное (ключ перевода, сам не переводится)
    assert.doesNotMatch(readFileSync(FILE, "utf8").match(/^\/\/ <agenthub\.(?:exec|fsRead|fsWrite|watch)[^>]*>[^—]*/gm).join("\n"), /[А-Яа-яЁё]/);
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
    // 0.5.0: замок исследования — не «раннер занят командой», а нормальное состояние «идёт исследование» (осознанная
    // смена: исследование стало режимом плагина); блокеры ночи по-прежнему видны и главнее
    assert.ok(titles(parsed.body).some((t) => t.startsWith("Идёт исследование рынка (вручную) с ")), titles(parsed.body).join("\n"));
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
    // 0.5.0: + переключатель режима ночи (три фиксированных действия) и «Исследовать сейчас»
    assert.deepEqual(Object.keys(byId).sort(), ["mode-research-only", "mode-tasks", "mode-tasks-research", "research", "run", "skip", "stop"]);
    assert.equal(byId.stop.level, "confirm");
    assert.equal(byId.stop.arg, undefined);
    assert.deepEqual(byId.skip.arg, { name: "taskId", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" });
    assert.equal(byId.run.level, "confirm-cost");
    assert.match(byId.skip.command, /^night-runner\.30s\.mjs --action skip \{taskId\}$/);
    assert.ok(meta.push.some((r) => r.key === "unity-open" && r.hold === "evening"));
    assert.ok(meta.push.some((r) => r.key === "runner-crashed" && r.quietException === true));
    // 0.4.1: пересчёт сразу после записи кэша квоты (путь подставляет ядро), каталог ночи — как раньше
    assert.deepEqual(meta.watch.map((w) => w.split(" — ")[0]), ["~/.claude/task-runs/night", "$AGENTHUB_USAGE_FILE"]);
    assert.equal(meta.version, "0.5.0");
  } finally {
    w.stop();
  }
});

// Режим действия: тот же файл с `--action <id> [<taskId>]`, как его запускает ядро.
function act(w, args, { stopFiles = true, nodeLog = null, env = {} } = {}) {
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
      env: { HOME: w.home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: w.bin, AGENTHUB_PLUGIN_DATA_PATH: data, ...env },
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
  assert.match(src, /<agenthub\.watch>\$AGENTHUB_USAGE_FILE — /);
  assert.match(src, /<agenthub\.version>0\.5\.0<\/agenthub\.version>/);
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

// ---------- 0.5.0: режимы ночи, исследование рынка, переключатель режима, «Исследовать сейчас» ----------

const CFG = "Projects/IT/night-runner/config.json";
const readCfg = (w) => JSON.parse(readFileSync(join(w.home, CFG), "utf8"));
// config.json раннера по образцу фикстуры с правкой проектов и research
function setCfg(w, fn) {
  const c = readCfg(w);
  fn(c);
  w.write(CFG, JSON.stringify(c, null, 2) + "\n");
}
const modeLine = (parsed) => parsed.header.find((i) => /^Режим ночи: /.test(i.title))?.title;
const local = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const p2 = (n) => String(n).padStart(2, "0");
// каталог прогона по местному времени: <YYYYMMDD>/<HHMMSS>[суффикс]
const runRel = (ms, suffix = "") => {
  const d = new Date(ms);
  return `${STATE}/${N.dateStamp(ms)}/${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${suffix}`;
};
const iso = (ms) => new Date(ms).toISOString();

test("night-runner 0.5.0: режим ночи — как его понимает раннер (четыре режима, v1, порча research)", () => {
  const cfg = (projects, research) => ({ schema: 2, projects, ...(research === undefined ? {} : { research }) });
  const on = { id: "a" };
  const off = { id: "b", enabled: false };
  assert.equal(N.modeOf(cfg([on, off])).mode, "tasks", "enabled по умолчанию true, research по умолчанию выключено");
  assert.equal(N.modeOf(cfg([on], { enabled: true })).mode, "tasks-research");
  assert.equal(N.modeOf(cfg([off], { enabled: true, focus: "x" })).mode, "research-only");
  assert.equal(N.modeOf(cfg([off], { enabled: false })).mode, "idle");
  // ревью: раннер не принимает пустой projects («projects — непустой список») — это порча, а не «ничего не делает»
  assert.equal(N.modeOf(cfg([], {})).problem, "projects-empty");
  assert.equal(N.modeOf(cfg([on], {})).mode, "tasks", "research без enabled — выключено (умолчание раннера)");
  assert.deepEqual(N.modeOf(cfg([on, off])).enabled, ["a"]);
  // v1 — PerfectWar включён, research v1 раннер не читает (upgradeV1)
  const v1 = N.modeOf({ worktree: "~/PW-night", research: { enabled: true } });
  assert.deepEqual([v1.mode, v1.v1], ["tasks", true]);
  // порча: раннер такой конфиг не примет — это не режим, а «файлы не читаются»
  assert.equal(N.modeOf(cfg([on], true)).problem, "research-not-object");
  assert.equal(N.modeOf(cfg([on], { enabled: "да" })).problem, "research-enabled");
  assert.equal(N.modeOf(cfg([{ id: "a", enabled: 1 }])).problem, "project-enabled");
  const w = world({ ps: "no-unity" });
  try {
    setCfg(w, (c) => (c.research = true));
    const r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.ok(r.parsed.events.includes("source-broken"));
    assert.match(r.text, /config\.json раннера: research — не объект/);
    assert.match(r.text, /^Режим ночи не определён — config\.json раннера не прочитан/m);
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: шапка и страница в каждом из четырёх режимов", () => {
  const w = world(); // Unity открыт на night-worktree проекта game
  try {
    // «Задачи»: как раньше + строка режима в шапке
    let r = w.run();
    assert.equal(modeLine(r.parsed), "Режим ночи: Задачи");
    assert.equal(r.parsed.status, "block", "Unity на night-worktree включённого проекта — блокер");
    // «Задачи + исследование в остаток окна»
    setCfg(w, (c) => (c.research = { enabled: true }));
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8").split("\n").filter((l) => !/Game-night/.test(l)).join("\n"));
    r = w.run();
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт в 04:30 · задачи + исследование");
    assert.equal(modeLine(r.parsed), "Режим ночи: Задачи + исследование в остаток окна");
    assert.ok(titles(r.parsed.body).includes("Ночью — в остаток окна после задач"));
    assert.ok(r.parsed.body.some((i) => i.title.startsWith("План на ночь (пробный прогон")), "план задач на месте");
    // «Только исследование»: все проекты выключены. Unity на night-worktree выключенного проекта ночи не мешает.
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8"));
    setCfg(w, (c) => c.projects.forEach((p) => (p.enabled = false)));
    r = w.run();
    assert.deepEqual(r.parsed.warnings, []);
    assert.equal(r.parsed.status, "ok", r.text);
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт в 04:30 · только исследование");
    assert.equal(modeLine(r.parsed), "Режим ночи: Только исследование");
    assert.ok(!r.parsed.events.includes("source-broken"));
    const t = titles(r.parsed.body);
    assert.ok(t.includes("Задачи ночью не берутся: все проекты выключены — режим «Только исследование»"));
    assert.ok(!t.some((x) => x.startsWith("План на ночь (") || x === "Плана на ночь пока нет"), "ни плана, ни «плана нет» — задач нет по режиму");
    assert.ok(!r.parsed.body.some((i) => i.action === "run" || i.action === "skip"), "ни «запустить», ни «пропустить» задач");
    assert.ok(t.includes("Ночью — всё окно"));
    const plan = r.parsed.body.find((i) => i.params.stat === "План на ночь");
    assert.deepEqual([plan.title, plan.params.note], ["исследование", "задачи не берутся"]);
    assert.ok(t.some((x) => x.startsWith("Отложены: 3")), "отложенные с прошлых ночей видны");
    assert.match(r.text, /^Бюджет ночи \| gauge=/m, "бюджет ночи — и для ночи только исследования");
    // «Ночь ничего не делает»: ни проектов, ни исследования; батарея и снятое задание — не push
    setCfg(w, (c) => (c.research = { enabled: false }));
    w.setPower("battery");
    w.rm("Library/LaunchAgents/com.kensei.night-runner.plist");
    r = w.run();
    assert.equal(r.parsed.status, "wait");
    assert.equal(r.parsed.header[0].title, "Ночь ничего не делает: нет включённых проектов, исследование выключено");
    assert.equal(r.parsed.header[0].params.tile, "выкл");
    assert.equal(modeLine(r.parsed), "Режим ночи: Ночь ничего не делает");
    assert.deepEqual(r.parsed.events.filter((e) => !e.startsWith("night-done")), [], "условия запуска ночи без дела — не события");
    assert.ok(titles(r.parsed.body).includes("Задачи ночью не берутся: нет включённых проектов"));
    assert.match(r.text, /раннер в 04:30 остановится с ошибкой «нет включённых проектов»/);
    // маркер подмены остаётся блокером и в этом режиме
    w.write(`${STATE}/git-config-changed.txt`, "подмена\n");
    assert.ok(w.run().parsed.events.includes("tamper"));
    // английский
    const en = w.run({ env: { AGENTHUB_LANG: "en" } });
    assert.equal(en.parsed.header.find((i) => /^Night mode: /.test(i.title)).title, "Night mode: Night does nothing");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: ручное исследование идёт — состояние, а не «раннер занят»; агенты по night.log", () => {
  const w = world({ ps: "no-unity" });
  try {
    const now = local(2026, 11, 4, 14, 0);
    const started = local(2026, 11, 4, 13, 30, 5);
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8").replace(/night-run\.mjs\s*$/m, "night-run.mjs research --minutes 120").split("\n").filter((l) => !/Game-night/.test(l)).join("\n"));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: iso(started) }));
    // ревью №4: openLog раннера лишь создаёт каталог, первая строка лога — после сбора чартов: каталог без night.log
    mkdirSync(join(w.home, runRel(started + 1000, "-research")), { recursive: true });
    let r = w.run({ now: iso(now) });
    // ревью №2: «до ≈» — окно 120 мин + хвост отчёта (картинки и HTML после дедлайна) 10 мин
    assert.equal(r.parsed.header[0].title, "Идёт исследование рынка (вручную) с 13:30 до ≈15:40");
    assert.equal(r.parsed.header[0].params.tile, "рынок", "короткое: бейдж панели узкий");
    assert.equal(r.parsed.status, "ok");
    let t = titles(r.parsed.body);
    assert.ok(t.includes("Идёт исследование (вручную) с 13:30, окно до ≈15:40"), t.join("\n"));
    assert.ok(t.includes("собирает чарты App Store"));
    assert.ok(!t.some((x) => x.startsWith("Раннер занят командой")));
    // агенты: двое стартовали, один отработал с находкой; чужая строка «… — …» не в счёт
    const at = (min) => iso(started + min * 60_000);
    w.write(`${runRel(started + 1000, "-research")}/night.log`, [
      `${at(1)} исследование: чартов 2, игр 180`,
      `${at(1)} исследование: агент 1 — Хиты и тренды (до 25 мин)`,
      `${at(1)} исследование: агент 2 — Монетизация — сейчас (до 25 мин)`,
      `${at(9)} исследование: Хиты и тренды — находка`,
      `${at(9)} исследование: Посторонняя тема — таймаут`,
    ].join("\n") + "\n");
    r = w.run({ now: iso(now) });
    t = titles(r.parsed.body);
    assert.ok(t.includes("агентов отработало 1, в работе 1, находок 1"), t.join("\n"));
    assert.ok(!r.parsed.body.some((i) => i.action === "research" || /^mode-/.test(i.action || "")), "раннер занят — ни «исследовать», ни смены режима");
    assert.ok(t.includes("раннер занят — запуск, когда освободится"));
    assert.ok(t.includes("сменить режим можно, когда раннер свободен (замок ночи не занят)"));
    assert.ok(t.some((x) => x.startsWith("Идёт исследование рынка (вручную) с 04.11 13:30")), "строка замка");
    // night.log исследования нет — честно «не видно», без выдуманных чисел
    w.rm(`${STATE}/${N.dateStamp(started)}`);
    r = w.run({ now: iso(now) });
    assert.ok(titles(r.parsed.body).includes("night.log исследования не найден — сколько агентов отработало, не видно"));
    // ps не ответил — исследование не утверждаем
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    r = w.run({ now: iso(now) });
    assert.doesNotMatch(r.text, /Идёт исследование/);
    // чистые функции
    assert.equal(N.holderMinutes("/n/node /x/night-run.mjs research --minutes 30"), 30);
    assert.equal(N.holderMinutes("/n/node /x/night-run.mjs research"), 60);
    assert.deepEqual(N.parseResearchLog("t исследование: не запускалось — изменена среда раннера\n"), { started: false, firstAt: null, skipped: "изменена среда раннера", charts: false, agentsStarted: 0, agentsDone: 0, findings: 0, report: null });
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: ручное исследование до старта ночи — мягкий блокер без push (ночь пропустит запуск)", () => {
  const w = world({ ps: "no-unity" });
  try {
    const now = local(2026, 11, 5, 3, 40);
    const started = local(2026, 11, 5, 3, 30);
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8").replace(/night-run\.mjs\s*$/m, "night-run.mjs research --minutes 120").split("\n").filter((l) => !/Game-night/.test(l)).join("\n"));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: iso(started) }));
    const r = w.run({ now: iso(now) });
    assert.equal(r.parsed.status, "wait");
    assert.equal(r.parsed.header[0].title, "Ночь может не стартовать: исследование при тебе идёт до ≈05:40 — ночь пропустит запуск: замок занят");
    assert.deepEqual(r.parsed.events, [], "у этого блокера нет push");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: исследование в остатке ночи — шапка и число агентов из night.log ночи", () => {
  const w = world({ ps: "no-unity" });
  try {
    setCfg(w, (c) => (c.research = { enabled: true }));
    const started = local(2026, 11, 4, 4, 30, 2);
    const now = local(2026, 11, 4, 7, 50);
    w.rm(`${STATE}/20261104`);
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: iso(started) }));
    const at = (min) => iso(started + min * 60_000);
    const log = `${runRel(started)}/night.log`;
    // задачи идут — исследование «после задач»
    w.write(log, `${at(1)} задача aaa111: старт, бюджет 120 мин\n`);
    let r = w.run({ now: iso(now) });
    assert.equal(r.parsed.header[0].title, "Ночь идёт с 04:30 · задача aaa111");
    assert.ok(titles(r.parsed.body).includes("Исследование — после задач, в остаток окна ночи"));
    // задачи кончились, исследование идёт
    w.write(log, [
      `${at(1)} задача aaa111: старт, бюджет 120 мин`,
      `${at(50)} проект game, задача aaa111: accepted — published — PR открыт`,
      `${at(190)} исследование: чартов 2, игр 150`,
      `${at(190)} исследование: агент 1 — Хиты (до 25 мин)`,
      `${at(190)} исследование: агент 2 — LiveOps (до 25 мин)`,
      `${at(205)} исследование: Хиты — находка`,
      `${at(210)} исследование: LiveOps — нет ответа по схеме (exit 1)`,
      `${at(210)} исследование: агент 3 — Разбор игры: Синтетика (до 25 мин)`,
    ].join("\n") + "\n");
    r = w.run({ now: iso(now) });
    assert.equal(r.parsed.header[0].title, "Ночь идёт с 04:30 · исследует рынок");
    const t = titles(r.parsed.body);
    assert.ok(t.includes(`Ночь исследует рынок с ${N.fmtTime(started + 190 * 60_000)}`), t.join("\n"));
    assert.ok(t.includes("агентов отработало 2, в работе 1, находок 1"));
    assert.ok(r.parsed.body.some((i) => i.action === "stop"), "ночь можно остановить, как раньше");
    // отчёт готов — фаза закончилась (ночь доживает finish)
    w.write(log, readFileSync(join(w.home, log), "utf8") + `${at(280)} исследование: отчёт /x/report.html\n`);
    assert.equal(w.run({ now: iso(now) }).parsed.header[0].title, "Ночь идёт с 04:30");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: последний отчёт — дата и число находок, open.file отчёта и ленты; нет отчёта — нет кнопки", () => {
  const w = world({ ps: "no-unity" });
  try {
    const R = `${STATE}/research`;
    let r = w.run();
    const line = r.parsed.body.find((i) => i.title.startsWith("Последний отчёт"));
    assert.equal(line.title, "Последний отчёт 03.11: находок 3");
    const kids = r.parsed.body.slice(r.parsed.body.indexOf(line) + 1).filter((i) => i.level === 1).slice(0, 2);
    assert.equal(kids[0].effect, `open.file ${join(w.home, R, "latest.html")}`);
    assert.equal(kids[1].effect, `open.file ${join(w.home, R, "index.html")}`);
    assert.doesNotMatch(r.text, /Синтетическая находка/, "идей и находок в хабе нет — только число");
    // нет latest.html — открывается report.html прогона; ручной прогон помечен
    w.rm(`${R}/latest.html`);
    w.write(`${R}/20261104-120000-research/report.html`, "<p>x</p>");
    w.write(`${R}/20261104-120000-research/findings.json`, JSON.stringify({ meta: { date: "20261104" }, findings: [{}, {}, {}, {}, {}, {}, {}], synthesis: null }));
    r = w.run();
    assert.ok(titles(r.parsed.body).includes("Последний отчёт 04.11 (вручную): находок 7"));
    assert.ok(r.parsed.body.some((i) => i.effect === `open.file ${join(w.home, R, "20261104-120000-research/report.html")}`));
    // findings.json ещё дописывается (report.html свежий, секунды) — не порча: «находок —» и «дописывается»
    w.write(`${R}/20261104-120000-research/findings.json`, "{oop");
    const rep = join(w.home, R, "20261104-120000-research/report.html");
    utimesSync(rep, new Date(Date.parse(NOW) - 10_000), new Date(Date.parse(NOW) - 10_000));
    r = w.run();
    assert.ok(titles(r.parsed.body).includes("findings.json ещё дописывается — число находок появится через минуту"), titles(r.parsed.body).join("\n"));
    assert.ok(!titles(r.parsed.body).includes("findings.json не разобран — число находок неизвестно"));
    // битый findings.json при давнем report.html — «находок —» и пояснение, но не «файлы не читаются»
    utimesSync(rep, new Date("2026-11-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    r = w.run();
    assert.ok(titles(r.parsed.body).includes("Последний отчёт 04.11 (вручную): находок —"));
    assert.ok(titles(r.parsed.body).includes("findings.json не разобран — число находок неизвестно"));
    assert.notEqual(r.parsed.status, "unknown");
    // прогон без report.html (исследование не собрало отчёт) не в счёт; отчётов нет совсем — нет и кнопок
    w.rm(R);
    w.write(`${R}/20261105-043000/findings.json`, JSON.stringify({ findings: [] }));
    r = w.run();
    assert.ok(titles(r.parsed.body).includes("Отчётов исследования пока нет"));
    assert.ok(!r.parsed.body.some((i) => /research\//.test(i.effect || "")), "кнопок «Открыть отчёт» и ленты нет");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: правка config.json — только нужные значения, остальной текст байт в байт", () => {
  const text = '{\n  "schema": 2,\n  "usage": { "x": 1 },\n  "projects": [\n    { "id": "a", "title": "A \\"q\\"", "enabled": true },\n    {\n      "id": "b",\n      "repo": "o/b"\n    }\n  ]\n}\n';
  // research нет — вставляется перед projects тем же отступом; у b нет enabled — вставляется первым ключом
  const e = N.editConfigText(text, { research: true, projects: { a: false, b: false } });
  assert.equal(e.ok, true);
  assert.equal(e.text, '{\n  "schema": 2,\n  "usage": { "x": 1 },\n  "research": { "enabled": true },\n  "projects": [\n    { "id": "a", "title": "A \\"q\\"", "enabled": false },\n    {\n      "enabled": false,\n      "id": "b",\n      "repo": "o/b"\n    }\n  ]\n}\n');
  // обратно: значения меняются на месте, вставленные ключи остаются (enabled: true — то же, что умолчание)
  const back = N.editConfigText(e.text, { research: false, projects: { a: true, b: true } });
  assert.equal(back.text, '{\n  "schema": 2,\n  "usage": { "x": 1 },\n  "research": { "enabled": false },\n  "projects": [\n    { "id": "a", "title": "A \\"q\\"", "enabled": true },\n    {\n      "enabled": true,\n      "id": "b",\n      "repo": "o/b"\n    }\n  ]\n}\n');
  // уже так — без изменений
  assert.deepEqual(N.editConfigText(text, { research: false, projects: { a: true } }), { ok: true, text, changed: false });
  // research {} без enabled; компактный JSON в одну строку
  assert.equal(N.editConfigText('{"research":{},"projects":[]}', { research: true }).text, '{"research":{ "enabled": true },"projects":[]}');
  assert.equal(N.editConfigText('{"research":{"focus":"x"},"projects":[]}', { research: true }).text, '{"research":{"enabled": true, "focus":"x"},"projects":[]}');
  assert.equal(N.editConfigText("{нет", { research: true }).reason, "bad-config");
  assert.throws(() => N.parseJsonSpans('{"a":1,}'));
  assert.equal(N.parseJsonSpans('{"a":[1,{"b":"\\u0041"}]}').members[0].value.items.length, 2);
});

// Действие режима: тот же файл с `--action mode <режим>`, каталог данных плагина — PluginData.
const modeAct = (w, target, opts) => act(w, ["mode", ...(target === undefined ? [] : [target])], opts);

test("night-runner 0.5.0, действие mode: туда и обратно — проекты возвращаются ровно те, прочие ключи и права файла целы", () => {
  const w = world({ ps: "no-unity" });
  try {
    const path = join(w.home, CFG);
    // web выключен владельцем: «вернуть задачи» не должно включить его
    setCfg(w, (c) => (c.projects[1].enabled = false));
    chmodSync(path, 0o640);
    const before = readFileSync(path, "utf8");
    // tasks → research-only
    let r = modeAct(w, "research-only");
    assert.deepEqual([r.out, r.code], ["ok", 0]);
    let c = readCfg(w);
    assert.deepEqual([c.research, c.projects.map((p) => p.enabled)], [{ enabled: true }, [false, false]]);
    assert.equal(statSync(path).mode & 0o777, 0o640, "права файла сохранены");
    // прочие ключи и порядок — как были: снимаем правку и сравниваем текст
    const now1 = readFileSync(path, "utf8");
    assert.equal(now1.replace('  "research": { "enabled": true },\n', "").replace('"enabled": false,\n      "repo": "owner/game"', '"enabled": true,\n      "repo": "owner/game"'), before);
    // копия прежнего — в данных плагина (0600), память включённых — тоже
    const backups = readdirSync(join(r.data, "config-backups"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(r.data, "config-backups", backups[0]), "utf8"), before);
    assert.equal(statSync(join(r.data, "config-backups", backups[0])).mode & 0o777, 0o600);
    const mem = JSON.parse(readFileSync(join(r.data, "night-mode.json"), "utf8"));
    assert.deepEqual(mem.projects, ["game"]);
    assert.equal(statSync(join(r.data, "night-mode.json")).mode & 0o777, 0o600);
    // страница видит, что вернуть задачи можно и какие проекты включатся
    const page = w.run({ env: { AGENTHUB_PLUGIN_DATA_PATH: r.data } });
    assert.ok(titles(page.parsed.body).includes("вернуть задачи — снова включатся проекты: game"));
    assert.deepEqual(page.parsed.body.filter((i) => /^mode-/.test(i.action || "")).map((i) => i.action), ["mode-tasks", "mode-tasks-research"]);
    // повтор — уже в режиме: ok без записи и без новой копии
    assert.equal(modeAct(w, "research-only").out, "ok");
    assert.equal(readdirSync(join(r.data, "config-backups")).length, 1);
    // research-only → tasks-research: включается только game, research остаётся включённым
    r = modeAct(w, "tasks-research");
    assert.equal(r.out, "ok");
    c = readCfg(w);
    assert.deepEqual([c.research.enabled, c.projects.map((p) => p.enabled)], [true, [true, false]]);
    assert.ok(!existsSync(join(r.data, "night-mode.json")), "память израсходована");
    // tasks-research → tasks: только research.enabled
    assert.equal(modeAct(w, "tasks").out, "ok");
    c = readCfg(w);
    assert.deepEqual([c.research.enabled, c.projects.map((p) => p.enabled)], [false, [true, false]]);
    const after = readFileSync(path, "utf8");
    assert.equal(after, before.replace('  "projects": [', '  "research": { "enabled": false },\n  "projects": ['), "обратно — тот же файл плюс research.enabled: false");
    assert.equal(readdirSync(join(r.data, "config-backups")).length, 3);
    assert.deepEqual(readdirSync(dirname(path)).filter((n) => n.includes(".tmp")), [], "временных файлов не осталось");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0, действие mode: отказы — замок, ps, нет памяти, проекты исчезли, битый конфиг, v1, нет каталога данных", () => {
  const w = world({ ps: "no-unity" });
  try {
    const path = join(w.home, CFG);
    const keep = () => readFileSync(path, "utf8");
    let before = keep();
    // замок держит любая команда раннера (post) — отказ, файл не тронут
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:59:00.000Z", command: "post" }));
    assert.equal(modeAct(w, "research-only").out, "reason=night-lock");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    assert.equal(modeAct(w, "research-only").out, "reason=lock-unknown");
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8"));
    w.rm(`${STATE}/night.lock`);
    assert.equal(keep(), before);
    // неизвестный режим и без аргумента
    assert.equal(modeAct(w, "all").out, "reason=bad-mode");
    assert.equal(modeAct(w).out, "reason=bad-mode");
    // без каталога данных — копию прежнего положить некуда
    let noData = "";
    try {
      execFileSync(process.execPath, [FILE, "--action", "mode", "research-only"], { env: { HOME: w.home, PATH: "/usr/bin:/bin", AGENTHUB_TEST_BIN_DIR: w.bin }, encoding: "utf8" });
    } catch (e) {
      noData = String(e.stdout).trim();
    }
    assert.equal(noData, "reason=no-data-dir");
    // все проекты выключены вручную, памяти нет — «вернуть задачи» отказывает, а не включает всё
    setCfg(w, (c) => {
      c.projects.forEach((p) => (p.enabled = false));
      c.research = { enabled: true };
    });
    before = keep();
    let r = modeAct(w, "tasks");
    assert.deepEqual([r.out, r.code], ["reason=no-remembered-projects", 3]);
    assert.equal(modeAct(w, "tasks-research").out, "reason=no-remembered-projects");
    assert.equal(keep(), before);
    // страница: кнопок возврата к задачам нет, причина — словами
    const page = w.run({ env: { AGENTHUB_PLUGIN_DATA_PATH: r.data } });
    assert.ok(titles(page.parsed.body).includes("вернуть задачи из хаба нельзя: не запомнено, какие проекты были включены, — включите их в config.json раннера"));
    assert.ok(!page.parsed.body.some((i) => i.action === "mode-tasks" || i.action === "mode-tasks-research"));
    // запомненные проекты исчезли из конфига
    writeFileSync(join(r.data, "night-mode.json"), JSON.stringify({ version: 1, projects: ["gone"], config: path }));
    assert.equal(modeAct(w, "tasks").out, "reason=remembered-projects-gone");
    // память от другого config.json не в счёт
    writeFileSync(join(r.data, "night-mode.json"), JSON.stringify({ version: 1, projects: ["game"], config: "/elsewhere/config.json" }));
    assert.equal(modeAct(w, "tasks").out, "reason=no-remembered-projects");
    assert.equal(keep(), before);
    // битый конфиг, research не объект, v1, нет файла
    for (const [bad, reason] of [["{не json", "bad-config"], [JSON.stringify({ schema: 2, research: true, projects: [] }), "bad-config"], [JSON.stringify({ worktree: "~/PW-night" }), "config-v1"]]) {
      w.write(CFG, bad);
      assert.equal(modeAct(w, "research-only").out, `reason=${reason}`, bad);
      assert.equal(keep(), bad);
    }
    w.rm(CFG);
    assert.equal(modeAct(w, "research-only").out, "reason=no-runner-config");
    assert.ok(!existsSync(join(r.data, "config-backups")), "ни одной копии: при отказе файл не трогается вовсе");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0, действие research: «Исследовать сейчас» через двойник раннера; отказы до запуска", async () => {
  const w = world({ ps: "no-unity" });
  const log = join(w.home, "..", "node.log");
  // «сейчас» — полдень: окно с хвостом отчёта до ночи в 04:30 успевает (иначе overlaps-night)
  const env = { AGENTHUB_TEST_NOW: iso(local(2026, 11, 4, 12, 0)) };
  try {
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:59:00.000Z" }));
    assert.equal(act(w, ["research", "60"], { nodeLog: log, env }).out, "reason=night-lock");
    writeFileSync(join(w.bin, "ps"), "#!/bin/sh\nexit 1\n");
    assert.equal(act(w, ["research", "60"], { nodeLog: log, env }).out, "reason=lock-unknown");
    w.setPs(readFileSync(join(FIX, "ps.txt"), "utf8"));
    w.rm(`${STATE}/night.lock`);
    for (const bad of ["45", "-1", "600", "abc", "060"]) assert.equal(act(w, ["research", bad], { nodeLog: log, env }).out, "reason=bad-minutes", bad);
    assert.equal(act(w, ["research"], { nodeLog: log, env }).out, "reason=bad-minutes");
    // окно короче резерва синтеза + одного агента раннер не примет
    setCfg(w, (c) => (c.research = { enabled: false, synthesis_reserve_min: 25, min_agent_min: 8 }));
    assert.equal(act(w, ["research", "30"], { nodeLog: log, env }).out, "reason=too-short");
    // маркер подмены — раннер откажет первым делом, плагин тоже
    w.write(`${STATE}/git-config-changed.txt`, "x\n");
    assert.equal(act(w, ["research", "60"], { nodeLog: log, env }).out, "reason=tamper");
    w.rm(`${STATE}/git-config-changed.txt`);
    assert.ok(!existsSync(log), "раннер не запускался");
    const r = act(w, ["research", "60"], { nodeLog: log, env });
    assert.deepEqual([r.out, r.code], ["ok", 0]);
    for (let i = 0; i < 50 && !existsSync(log); i++) await new Promise((res) => setTimeout(res, 50));
    assert.equal(readFileSync(log, "utf8").trim(), `${realpathSync(join(w.home, "Projects/IT/night-runner"))} night-run.mjs research --minutes 60`);
    const logs = readdirSync(r.data).filter((n) => /^research-.*\.log$/.test(n));
    assert.equal(logs.length, 1);
    assert.equal(statSync(join(r.data, logs[0])).mode & 0o777, 0o600);
    // раннера нет
    w.rm("Projects/IT/night-runner/night-run.mjs");
    assert.equal(act(w, ["research", "60"], { nodeLog: log, env }).out, "reason=no-runner");
  } finally {
    w.stop();
  }
});

test("night-runner 0.5.0: метаданные — право записи config.json, переключатель и «Исследовать сейчас»; кнопки — под шаблон", async () => {
  const { readPluginMeta } = await import("../../../scripts/lib/plugin-test.mjs");
  const pm = readPluginMeta(FILE);
  assert.deepEqual(pm.warnings ?? [], []);
  const meta = pm.meta;
  const byId = Object.fromEntries(meta.actions.map((a) => [a.id, a]));
  for (const m of ["tasks", "tasks-research", "research-only"]) {
    // ревью №12: режимы с исследованием тратят квоту каждую ночь — confirm-cost с ценой; «Задачи» — confirm
    assert.equal(byId[`mode-${m}`].level, m === "tasks" ? "confirm" : "confirm-cost");
    if (m !== "tasks") assert.match(byId[`mode-${m}`].cost, /квоту Claude/);
    assert.equal(byId[`mode-${m}`].arg, undefined);
    assert.equal(byId[`mode-${m}`].command, `night-runner.30s.mjs --action mode ${m}`);
    assert.match(byId[`mode-${m}`].title, /config\.json раннера/);
  }
  assert.equal(byId.research.level, "confirm-cost");
  assert.deepEqual(byId.research.arg, { name: "minutes", pattern: "^(?:30|60|120)$" });
  assert.ok(meta.fsWrite.some((e) => e.startsWith("~/Projects/IT/night-runner/config.json — ")));
  assert.ok(meta.exec.some((e) => e.startsWith("node night-run.mjs research --minutes <30|60|120> — ")));
  // предложенные в выводе аргументы проходят шаблоны действий
  const w = world({ ps: "no-unity" });
  try {
    const { parsed } = w.run();
    const research = parsed.body.filter((i) => i.action === "research").map((i) => i.params.arg);
    assert.deepEqual(research, ["30", "60", "120"]);
    for (const a of research) assert.match(a, new RegExp(byId.research.arg.pattern));
    for (const i of parsed.body.filter((x) => x.action)) assert.ok(byId[i.action], `объявлено: ${i.action}`);
  } finally {
    w.stop();
  }
});

// ---------- 0.5.0, находки ревью (номера — по списку ревью) ----------

const week = (percent, resets = "2026-11-09T04:00:00+00:00") => ({ version: 1, fetched_at: Date.parse(NOW) / 1000, error: null, rows: [{ kind: "weekly_all", group: "weekly", percent, resets_at: resets }] });
const noUnityPs = () => readFileSync(join(FIX, "ps.txt"), "utf8").split("\n").filter((l) => !/Game-night/.test(l)).join("\n");
const offAll = (c) => c.projects.forEach((p) => (p.enabled = false));

test("ревью №1: research.stop_seven_day_pct — «Только исследование» при неделе ≥ порога: wait без push; потолок — минимум из двух", () => {
  const w = world({ ps: "no-unity" });
  try {
    setCfg(w, (c) => {
      offAll(c);
      c.research = { enabled: true };
    });
    w.setUsage(week(72)); // ниже порога пропуска ночи (80), но выше порога исследования (70 по умолчанию)
    let r = w.run();
    assert.equal(r.parsed.status, "wait");
    assert.equal(r.parsed.header[0].title, "Ночь может не стартовать: исследование не начнётся: неделя 72% ≥ 70% (research.stop_seven_day_pct)");
    assert.deepEqual(r.parsed.events, [], "мягкий блокер без push");
    // свой порог из конфига
    setCfg(w, (c) => (c.research.stop_seven_day_pct = 75));
    r = w.run();
    assert.equal(r.parsed.status, "ok");
    assert.ok(titles(r.parsed.body).includes("Агенты исследования не стартуют после недели 75%"), titles(r.parsed.body).join("\n"));
    // «Задачи + исследование»: не блокер, а пометка в разделе «Исследование»
    setCfg(w, (c) => {
      c.projects[0].enabled = true;
      c.research = { enabled: true };
    });
    r = w.run();
    assert.equal(r.parsed.status, "ok");
    assert.ok(titles(r.parsed.body).includes("Исследование не начнётся: неделя 72% ≥ 70% (research.stop_seven_day_pct)"));
    // неделя 44%: бюджет ночи остановит её на 48% — раньше порога исследования 70%
    w.setUsage(week(44));
    r = w.run();
    assert.ok(titles(r.parsed.body).includes("Агенты исследования не стартуют после недели 48%"));
    assert.ok(titles(r.parsed.body).includes("порог исследования 70%, остановка ночи по бюджету — 48%: что раньше"));
    // неделя сбросится до старта — к старту она новая, порог не мешает
    w.setUsage(week(72, iso(local(2026, 11, 5, 2, 0))));
    r = w.run({ now: iso(local(2026, 11, 4, 22, 0)) });
    assert.ok(!titles(r.parsed.body).some((t) => t.startsWith("Исследование не начнётся")));
  } finally {
    w.stop();
  }
});

test("ревью №2: «Исследовать сейчас» не срывает ночь — окна, что не успеют (с хвостом отчёта), скрыты, действие отказывает", () => {
  const w = world({ ps: "no-unity" });
  const log = join(w.home, "..", "node.log");
  try {
    // до старта 04:30 — 50 мин: успевает только 30 (+10 хвост)
    let r = w.run({ now: iso(local(2026, 11, 5, 3, 40)) });
    assert.deepEqual(r.parsed.body.filter((i) => i.action === "research").map((i) => i.params.arg), ["30"]);
    assert.ok(titles(r.parsed.body).includes("окна, что не успеют до старта ночи в 04:30, скрыты: ночь не ждёт занятый замок"));
    // 30 мин до старта — ни одно
    r = w.run({ now: iso(local(2026, 11, 5, 4, 0)) });
    assert.equal(r.parsed.body.filter((i) => i.action === "research").length, 0);
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("до старта ночи в 04:30 ни одно окно не успеет")));
    const at = (h, m) => ({ AGENTHUB_TEST_NOW: iso(local(2026, 11, 5, h, m)) });
    assert.equal(act(w, ["research", "60"], { nodeLog: log, env: at(3, 40) }).out, "reason=overlaps-night");
    assert.equal(act(w, ["research", "30"], { nodeLog: log, env: at(3, 50) }).out, "reason=overlaps-night", "30 + 10 мин хвоста = 04:30 — впритык не пускаем");
    assert.ok(!existsSync(log), "раннер не запускался");
    // ночи нечего делать — мешать нечему
    setCfg(w, offAll);
    r = w.run({ now: iso(local(2026, 11, 5, 4, 0)) });
    assert.deepEqual(r.parsed.body.filter((i) => i.action === "research").map((i) => i.params.arg), ["30", "60", "120"]);
    assert.equal(act(w, ["research", "120"], { nodeLog: log, env: at(4, 0) }).out, "ok");
    assert.equal(N.researchFits(0, 30, 40 * 60_000 + 1, "tasks"), true);
    assert.equal(N.researchFits(0, 30, 40 * 60_000, "tasks"), false);
  } finally {
    w.stop();
  }
});

// Двойник night-run.mjs раннера из git HEAD: без команды research.
const OLD_RUNNER = '// двойник раннера без исследования\nconst COMMANDS = ["run", "setup", "check", "install", "uninstall", "migrate-state", "post"];\nprocess.exit(3);\n';

test("ревью №3: раннер без research в COMMANDS — ни переключателей с исследованием, ни «Исследовать сейчас»; mode-tasks не вписывает research", () => {
  const w = world({ ps: "no-unity" });
  const log = join(w.home, "..", "node.log");
  try {
    w.write("Projects/IT/night-runner/night-run.mjs", OLD_RUNNER);
    const before = readFileSync(join(w.home, CFG), "utf8");
    let r = w.run();
    assert.ok(titles(r.parsed.body).includes("Этот раннер не умеет исследование рынка: в night-run.mjs нет команды research"));
    assert.ok(!r.parsed.body.some((i) => i.action === "research" || i.action === "mode-tasks-research" || i.action === "mode-research-only"), r.text);
    assert.ok(titles(r.parsed.body).includes("этот раннер не умеет исследование (в night-run.mjs нет команды research) — режимы с исследованием недоступны"));
    assert.equal(r.parsed.status, "ok");
    assert.equal(act(w, ["research", "60"], { nodeLog: log }).out, "reason=runner-no-research");
    assert.equal(act(w, ["mode", "research-only"]).out, "reason=runner-no-research");
    assert.equal(act(w, ["mode", "tasks-research"]).out, "reason=runner-no-research");
    assert.equal(act(w, ["mode", "tasks"]).out, "ok");
    assert.equal(readFileSync(join(w.home, CFG), "utf8"), before, "уже «Задачи»: ключ research не вписан");
    // возврат запомненных проектов — тоже без ключа research (validateConfig HEAD отверг бы неизвестный ключ)
    setCfg(w, offAll);
    const data = join(w.home, "..", "data");
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, "night-mode.json"), JSON.stringify({ version: 1, projects: ["game"], config: join(w.home, CFG) }));
    assert.equal(act(w, ["mode", "tasks"]).out, "ok");
    const c = readCfg(w);
    assert.deepEqual([c.research, c.projects.map((p) => p.enabled)], [undefined, [true, false]]);
    // ключ research у такого раннера — порча (его проверка отвергнет конфиг)
    setCfg(w, (x) => (x.research = { enabled: false }));
    r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.match(r.text, /ключ research, а этот раннер исследования не знает/);
    assert.ok(!existsSync(log));
  } finally {
    w.stop();
  }
});

test("ревью №5: порча режима не теряет state_dir — идущая ночь видна, «Остановить» есть и пишет STOP туда", () => {
  const w = world({ ps: "no-unity" });
  try {
    // state_dir не по умолчанию: откат на умолчание потерял бы ночь
    cpSync(join(w.home, STATE), join(w.home, "night-state"), { recursive: true });
    w.rm(STATE);
    setCfg(w, (c) => {
      c.state_dir = "~/night-state";
      c.projects[0].enabled = "да";
    });
    w.write("night-state/night.lock", JSON.stringify({ pid: 5000, startedAt: "2026-11-04T03:30:02.000Z" }));
    const r = w.run();
    assert.equal(r.parsed.status, "unknown");
    assert.match(r.text, /enabled проекта — не true\/false/);
    assert.match(r.parsed.header[0].title, /^Ночь идёт с \d\d:30 · задача ccc333$/);
    assert.ok(r.parsed.body.some((i) => i.action === "stop"));
    const s = act(w, ["stop"]);
    assert.equal(s.out, "ok");
    assert.ok(existsSync(join(w.home, "night-state", "STOP")));
    // пустой projects — тоже порча, а не «ничего не делает» (раннер его не примет)
    setCfg(w, (c) => (c.projects = []));
    const e = w.run();
    assert.match(e.text, /projects пуст — раннер требует непустой список/);
    assert.equal(modeLine(e.parsed), undefined);
  } finally {
    w.stop();
  }
});

test("ревью №6, №11: только для чтения, жёсткая ссылка, симлинк — отказ до побочных эффектов; переключатели скрыты с причиной", () => {
  const w = world({ ps: "no-unity" });
  try {
    const path = join(w.home, CFG);
    const data = join(w.home, "..", "data");
    const clean = () => !existsSync(join(data, "config-backups")) && !existsSync(join(data, "night-mode.json"));
    const before = readFileSync(path, "utf8");
    chmodSync(path, 0o440);
    assert.equal(act(w, ["mode", "research-only"]).out, "reason=config-readonly");
    assert.ok(clean(), "ни копии, ни памяти");
    let page = w.run({ env: { AGENTHUB_PLUGIN_DATA_PATH: data } });
    assert.ok(titles(page.parsed.body).includes("config.json раннера закрыт от записи — переключение не будет его менять"));
    assert.ok(!page.parsed.body.some((i) => /^mode-/.test(i.action || "")));
    chmodSync(path, 0o644);
    linkSync(path, join(w.home, "config-copy.json"));
    assert.equal(act(w, ["mode", "research-only"]).out, "reason=config-hardlink");
    assert.ok(clean());
    rmSync(join(w.home, "config-copy.json"));
    // симлинк: rename заменил бы его файлом
    const real = join(w.home, "real-config.json");
    writeFileSync(real, before);
    rmSync(path);
    symlinkSync(real, path);
    assert.equal(act(w, ["mode", "research-only"]).out, "reason=config-symlink");
    assert.ok(clean());
    assert.equal(readFileSync(real, "utf8"), before);
    page = w.run({ env: { AGENTHUB_PLUGIN_DATA_PATH: data } });
    assert.ok(titles(page.parsed.body).includes("config.json раннера — ссылка: переключение заменило бы её файлом, правьте его сами"));
  } finally {
    w.stop();
  }
});

test("ревью №7, №8, мелочи: config-changed, замок ожил перед rename, edit-failed, CRLF — без следов временного файла", () => {
  const w = world({ ps: "no-unity" });
  try {
    const path = join(w.home, CFG);
    const dir = dirname(path);
    const tmps = () => readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    const before = readFileSync(path, "utf8");
    // config-changed: файл поменяли между подготовкой и rename
    const st = N.stageConfig(path, before.replace('"enabled": true', '"enabled": false'));
    assert.equal(st.ok, true);
    writeFileSync(path, before + " ");
    assert.deepEqual(N.commitConfig(path, st.tmp, before), { ok: false, reason: "config-changed" });
    assert.deepEqual(tmps(), []);
    writeFileSync(path, before);
    // №8: замок ожил между первой проверкой и rename — ps отвечает «держателя нет», затем «держатель жив»
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:59:00.000Z" }));
    const n = join(w.home, "..", "ps-count");
    const alive = readFileSync(join(FIX, "ps.txt"), "utf8").replaceAll("{{HOME}}", w.home);
    const dead = alive.split("\n").filter((l) => !/night-run\.mjs/.test(l)).join("\n");
    writeFileSync(join(w.home, "..", "ps-dead.txt"), dead);
    writeFileSync(join(w.home, "..", "ps-alive.txt"), alive);
    writeFileSync(join(w.bin, "ps"), `#!/bin/sh\nif [ -f '${n}' ]; then cat '${join(w.home, "..", "ps-alive.txt")}'; else touch '${n}'; cat '${join(w.home, "..", "ps-dead.txt")}'; fi\n`);
    chmodSync(join(w.bin, "ps"), 0o755);
    assert.equal(act(w, ["mode", "research-only"]).out, "reason=night-lock");
    assert.equal(readFileSync(path, "utf8"), before, "файл не тронут");
    assert.deepEqual(tmps(), []);
    w.setPs(noUnityPs());
    w.rm(`${STATE}/night.lock`);
    // edit-failed: повтор ключа enabled — JSON.parse берёт последний, правка по позиции — первый: сверка ловит
    const dup = '{"schema":2,"projects":[{"id":"game","enabled":true,"enabled":false}]}';
    assert.equal(N.editConfigText(dup, { projects: { game: true } }).reason, "edit-failed");
    w.write(CFG, dup);
    assert.equal(act(w, ["mode", "tasks"]).out, "reason=edit-failed");
    assert.equal(readFileSync(path, "utf8"), dup);
    // CRLF: переводы строк и отступы сохраняются
    const crlf = before.replace(/\n/g, "\r\n");
    w.write(CFG, crlf);
    assert.equal(act(w, ["mode", "research-only"]).out, "ok");
    const out = readFileSync(path, "utf8");
    assert.ok(!/[^\r]\n/.test(out), "только CRLF");
    assert.match(out, /\r\n {2}"research": \{ "enabled": true \},\r\n {2}"projects": \[/);
    assert.deepEqual(tmps(), []);
  } finally {
    w.stop();
  }
});

test("ревью №9: `night-run.mjs --minutes 90 research` — исследование, а не ночь (значения флагов пропускаются)", () => {
  assert.equal(N.holderSubcommand("/n/node /x/night-run.mjs --minutes 90 research"), "research");
  assert.equal(N.holderSubcommand("/n/node /x/night-run.mjs --config /c.json --no-push run"), "run");
  assert.equal(N.holderSubcommand("/n/node /x/night-run.mjs --task game:abc --no-push"), null);
  const w = world({ ps: "no-unity" });
  try {
    w.setPs(noUnityPs().replace(/night-run\.mjs\s*$/m, "night-run.mjs --minutes 90 research"));
    w.write(`${STATE}/night.lock`, JSON.stringify({ pid: 5000, startedAt: "2026-11-04T09:30:00.000Z" }));
    const r = w.run();
    assert.match(r.parsed.header[0].title, /^Идёт исследование рынка \(вручную\)/);
    assert.ok(!r.parsed.body.some((i) => i.action === "stop"), "не ночь — «Остановить» не предлагается");
  } finally {
    w.stop();
  }
});

test("ревью №10: Unity при включённом исследовании — пометка о задачах проекта, не «не запустится» и не вечерний push", () => {
  const w = world(); // Unity открыт на night-worktree game
  try {
    setCfg(w, (c) => {
      c.research = { enabled: true };
      c.projects[1].enabled = false;
    });
    let r = w.run();
    assert.equal(r.parsed.status, "wait");
    assert.equal(r.parsed.header[0].title, "Ночь готова · старт в 04:30 · Unity открыт на Game — задачи проекта game не пойдут, ночь займётся исследованием");
    assert.ok(!r.parsed.events.includes("unity-open:game"), JSON.stringify(r.parsed.events));
    // включён и web — его задачи пойдут
    setCfg(w, (c) => (c.projects[1].enabled = true));
    r = w.run();
    assert.match(r.parsed.header[0].title, /задачи проекта game не пойдут, остальное — как обычно$/);
    // без исследования — как раньше: блокер и push
    setCfg(w, (c) => (c.research.enabled = false));
    r = w.run();
    assert.equal(r.parsed.status, "block");
    assert.ok(r.parsed.events.includes("unity-open:game"));
  } finally {
    w.stop();
  }
});

test("ревью, мелочи: дробные минуты research, память при частичных проектах, latest.html старше отчёта, «ничего не делает» без бюджета, --config в launchd", () => {
  const w = world({ ps: "no-unity" });
  try {
    // минуты как у раннера: дробные — тоже; 22.5 + 8 = 30.5 — окна 30 нет, действие отказывает
    setCfg(w, (c) => (c.research = { enabled: false, synthesis_reserve_min: 22.5, min_agent_min: 8 }));
    let r = w.run();
    assert.deepEqual(r.parsed.body.filter((i) => i.action === "research").map((i) => i.params.arg), ["60", "120"]);
    assert.equal(act(w, ["research", "30"], { env: { AGENTHUB_TEST_NOW: iso(local(2026, 11, 4, 12, 0)) } }).out, "reason=too-short");
    // память: «только исследование» запомнила game и web; владелец включил web руками → «Задачи» её не стирает
    setCfg(w, (c) => (c.research = { enabled: false }));
    assert.equal(act(w, ["mode", "research-only"]).out, "ok");
    const data = join(w.home, "..", "data");
    setCfg(w, (c) => (c.projects[1].enabled = true));
    assert.equal(act(w, ["mode", "tasks"]).out, "ok");
    assert.deepEqual(JSON.parse(readFileSync(join(data, "night-mode.json"), "utf8")).projects, ["game", "web"]);
    // latest.html старше report.html прогона — открывается report.html прогона
    const R = join(w.home, STATE, "research");
    utimesSync(join(R, "latest.html"), new Date("2026-10-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));
    r = w.run();
    assert.ok(r.parsed.body.some((i) => i.effect === `open.file ${join(R, "20261103-043005", "report.html")}`), r.text);
    // «ничего не делает»: ни карточки бюджета, ни «пропустит запуск»
    setCfg(w, (c) => {
      offAll(c);
      c.research = { enabled: false };
    });
    w.setUsage(week(85));
    r = w.run();
    assert.doesNotMatch(r.text, /Бюджет ночи|пропустит запуск/);
    // launchd запускает раннер с другим --config — режим отсюда не определить, переключение отказывает
    const plist = (cfg) => `<?xml version="1.0"?>\n<plist version="1.0"><dict><key>Label</key><string>com.kensei.night-runner</string><key>ProgramArguments</key><array><string>/n/node</string><string>/x/bootstrap.mjs</string><string>--scheduled</string><string>04:30</string><string>--config</string><string>${cfg}</string></array></dict></plist>\n`;
    w.write("Library/LaunchAgents/com.kensei.night-runner.plist", plist("/elsewhere/config.json"));
    r = w.run();
    assert.ok(titles(r.parsed.body).some((t) => t.startsWith("Задание launchd запускает раннер с --config /elsewhere/config.json")));
    assert.equal(modeLine(r.parsed), undefined);
    assert.ok(!r.parsed.body.some((i) => /^mode-/.test(i.action || "")));
    assert.equal(act(w, ["mode", "tasks"]).out, "reason=config-elsewhere");
    // тот же файл через --config — как обычно
    w.write("Library/LaunchAgents/com.kensei.night-runner.plist", plist(join(w.home, CFG)));
    assert.equal(modeLine(w.run().parsed), "Режим ночи: Ночь ничего не делает");
    assert.equal(N.launchdConfigArg(w.home), join(w.home, CFG));
    // плагин настроен на другой каталог раннера — путь вне объявленного права
    assert.equal(N.configWhere(join(w.home, "Other/config.json"), w.home).elsewhere, true);
    assert.equal(N.configWhere(join(w.home, CFG), w.home).elsewhere, false);
  } finally {
    w.stop();
  }
});
