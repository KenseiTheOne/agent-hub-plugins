#!/usr/bin/env node
// Ночной раннер: идёт ли ночь, блокеры, очередь двумя слоями, итоги ночей.
//
// <agenthub.title>Ночь</agenthub.title>
// <agenthub.title lang="en">Night</agenthub.title>
// <agenthub.version>0.4.1</agenthub.version>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.desc>Ночной раннер: запустится ли ночь, её бюджет квоты, что мешает и чем кончились прошлые ночи</agenthub.desc>
// <agenthub.desc lang="en">Night runner: will tonight start, its quota budget, what's in the way and how past nights ended</agenthub.desc>
// <agenthub.status value="ok" label="Ночь готова или идёт">Ничего не мешает ночному запуску</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Night ready">Nothing is in the way of tonight's run</agenthub.status>
// <agenthub.status value="wait" label="Ночь может не стартовать">Мягкое препятствие — например, мак не на зарядке</agenthub.status>
// <agenthub.status value="wait" lang="en" label="Night may not start">A soft obstacle — for example, the Mac isn't plugged in</agenthub.status>
// <agenthub.status value="block" label="Ночь не запустится">Блокер, маркер подмены или раннер упал — нужно вмешаться</agenthub.status>
// <agenthub.status value="block" lang="en" label="Night won't run">A blocker, a tamper marker or a crashed runner — needs you</agenthub.status>
// <agenthub.status value="unknown" label="Файлы раннера не читаются">Состояние ночи не разобрано</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Can't read runner files">The night's state couldn't be read</agenthub.status>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.watch>~/.claude/task-runs/night — замок и сводки появляются здесь</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/task-runs/night — the night's lock and summaries appear here</agenthub.watch>
// <agenthub.watch>$AGENTHUB_USAGE_FILE — служба usage записала свежую квоту: пересчитать бюджет ночи сразу</agenthub.watch>
// <agenthub.watch lang="en">$AGENTHUB_USAGE_FILE — the usage service wrote fresh quota: recompute the night budget right away</agenthub.watch>
// <agenthub.fsRead>~/Projects/IT/night-runner/config.json — настройки ночи: во сколько старт и какие проекты в работе</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Projects/IT/night-runner/config.json — night settings: start time and which projects are included</agenthub.fsRead>
// <agenthub.fsRead>~/Projects/IT/night-runner/night-run.mjs — узнать, умеет ли раннер сам сообщать своё состояние</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Projects/IT/night-runner/night-run.mjs — to check whether the runner can report its own state</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/task-runs/night — идёт ли ночь сейчас, что в плане, чем закончились прошлые ночи и какая задача в работе</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/task-runs/night — whether a night is running, what's planned, how past nights ended and which task is in progress</agenthub.fsRead>
// <agenthub.fsRead>$AGENTHUB_USAGE_FILE — кэш квоты Agent Hub (проценты недели и время сброса, без токенов): сколько ночь возьмёт и не пропустит ли запуск</agenthub.fsRead>
// <agenthub.fsRead lang="en">$AGENTHUB_USAGE_FILE — Agent Hub's quota cache (weekly percentages and reset time, no tokens): how much the night will use and whether it skips</agenthub.fsRead>
// <agenthub.fsRead>~/Library/LaunchAgents/com.kensei.night-runner.plist — на месте ли расписание ночного запуска</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Library/LaunchAgents/com.kensei.night-runner.plist — whether the night's schedule is still installed</agenthub.fsRead>
// <agenthub.exec>/bin/ps -axww -o pid=,ppid=,command= — не открыт ли Unity на проекте ночи и жива ли сама ночь</agenthub.exec>
// <agenthub.exec lang="en">/bin/ps -axww -o pid=,ppid=,command= — whether Unity is open on the night's project and the night itself is alive</agenthub.exec>
// <agenthub.exec>/usr/bin/pmset -g batt — подключён ли мак к сети: на батарее ночь по расписанию не стартует</agenthub.exec>
// <agenthub.exec lang="en">/usr/bin/pmset -g batt — whether the Mac is plugged in: on battery the scheduled night won't start</agenthub.exec>
// <agenthub.exec>node night-run.mjs status --json / queue --json — состояние и очередь от самого раннера, когда он это научится отдавать; пока не запускается</agenthub.exec>
// <agenthub.exec lang="en">node night-run.mjs status --json / queue --json — state and queue from the runner itself, once it can report them; not run yet</agenthub.exec>
// <agenthub.exec>node night-run.mjs run --task <project>:<id> --no-push — кнопка «Запустить днём»: одна задача, без отправки в git, только когда ночь не идёт</agenthub.exec>
// <agenthub.exec lang="en">node night-run.mjs run --task <project>:<id> --no-push — the Run now button: one task, nothing pushed to git, only while no night is running</agenthub.exec>
// <agenthub.fsWrite>~/.claude/task-runs/night/STOP — кнопка «Остановить»: ночь закончится после текущей задачи</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/task-runs/night/STOP — the Stop button: the night ends after the current task</agenthub.fsWrite>
// <agenthub.fsWrite>~/.claude/task-runs/night/SKIP-* — кнопка «Пропустить»: задача не пойдёт в эту ночь</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/task-runs/night/SKIP-* — the Skip button: the task is left out of tonight's run</agenthub.fsWrite>
// <agenthub.effects>open.file,open.url</agenthub.effects>
// <agenthub.action id="stop" level="confirm" title="Остановить ночь после текущей задачи" title-en="Stop the night after the current task">night-runner.30s.mjs --action stop</agenthub.action>
// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Пропустить в ночи задачу" title-en="Skip this task tonight">night-runner.30s.mjs --action skip {taskId}</agenthub.action>
// <agenthub.action id="run" level="confirm-cost" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Запустить днём без пуша задачу" title-en="Run this task now without pushing" cost="расход квоты Claude на задачу целиком" cost-en="uses Claude quota for the whole task">night-runner.30s.mjs --action run {taskId}</agenthub.action>
// <agenthub.push key="unity-open" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="launchd-missing" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="quota-skip" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="power" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="night-done">Ночь закончилась</agenthub.push>
// <agenthub.push key="runner-crashed" quiet="true">Раннер упал</agenthub.push>
// <agenthub.push key="tamper" quiet="true">Маркер подмены</agenthub.push>
// <agenthub.push key="infra-failures">Инфраструктурные провалы подряд</agenthub.push>
// <agenthub.push key="unity-open" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="launchd-missing" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="quota-skip" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="power" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="night-done" lang="en">Night finished</agenthub.push>
// <agenthub.push key="runner-crashed" lang="en">Runner crashed</agenthub.push>
// <agenthub.push key="tamper" lang="en">Tamper marker</agenthub.push>
// <agenthub.push key="infra-failures" lang="en">Infrastructure failures in a row</agenthub.push>
//
// Официальный плагин реестра agent-hub-plugins. Вывод — только чтение. Управление — только объявленными
// действиями (<agenthub.action>): ядро показывает своё подтверждение, сверяет аргумент с шаблоном и запускает
// этот же файл с `--action <id> [<taskId>]` отдельными элементами argv, без шелла. Факты (держатель замка по
// argv, жив ли он, есть ли state_dir) проверяет сам плагин в режиме действия; отказ — код выхода ≠ 0 и строка
// `reason=<код>`. Стоп-файлы STOP / SKIP-<id> пишутся только с флагом `stopFiles: true` в настройках плагина —
// его включают после патча раннера (этап 1), до того действие отвечает reason=runner-patch-required.
// События: runner-crashed:<дата> — замок ночи есть, а держателя нет (или сводка дня «прогон не завершён»);
// infra-failures:<дата> — ночь остановлена инфраструктурными провалами подряд. Пока у раннера нет `status --json` /
// `queue --json` (детект — по списку COMMANDS в night-run.mjs, сам раннер для детекта не запускается),
// всё читается из файлов. Незнакомая форма источника → status=unknown + event=source-broken.
//
// Квота — из кэша хаба (служба ядра usage): путь в AGENTHUB_USAGE_FILE, ядро даёт его встроенным и официальным
// плагинам; за этим файлом плагин и следит (<agenthub.watch>$AGENTHUB_USAGE_FILE: путь подставляет ядро, только
// доверенным) — бюджет ночи пересчитывается сразу после записи кэша, а не через 30 с. Нет переменной — «квота недоступна» (бюджета ночи нет, блокера по квоте тоже). Бюджет ночи считается
// так же, как у раннера (night-runner/lib/schedule.mjs, nightBudget): night_share_pct недели на семь ночей, не больше
// остатка до stop_seven_day_pct; последняя ночь перед сбросом недели берёт весь остаток. Идущей ночи — бюджет из её
// сводки (квота на старте), строки со сброшенным resets_at не в счёт.
//
// Необязательные настройки: $AGENTHUB_PLUGIN_DATA_PATH/config.json → {"runnerDir": "...", "stateDir": "..."}.
// Для тестов: AGENTHUB_TEST_BIN_DIR — каталог с двойниками ps/pmset/node; AGENTHUB_TEST_NOW — «сейчас» (ISO).
// Демон эти переменные плагину не передаёт (окружение очищено), так что в работе они не действуют.

import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

export const LAUNCHD_LABEL = "com.kensei.night-runner";
export const TAMPER_FILE = "git-config-changed.txt";
export const MAX_RETRIES = 3;
const DAY_MS = 86_400_000;
const PLAN_STALE_MS = 36 * 3_600_000;
const USAGE_DEFAULTS = { skip_seven_day_pct: 80, stop_seven_day_pct: 85, night_share_pct: 30 };
const HOUR_MS = 3_600_000;
const WEEK_NIGHTS = 7;
const QUOTA_STALE_MS = HOUR_MS;
const MIN_MS = 60_000;
// schedule.max_wait_for_reset_min раннера по умолчанию (night-runner/lib/config.mjs, SCHEDULE)
const MAX_WAIT_DEFAULT_MIN = 240;

// id задачи раннера — [A-Za-z0-9_-] до 64 символов, первый — буква или цифра (SAFE_ID в night-runner/lib/config.mjs).
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// id проекта раннера (PROJECT_ID в night-runner/lib/config.mjs).
export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Аргумент действия: SAFE_ID и не похож на ключ (ядро тоже отклоняет «-…»; здесь — вторая линия).
const argOk = (id) => SAFE_ID.test(String(id || "")) && !String(id).startsWith("-");

// ---------- мелочи ----------

export function expand(p, home = homedir()) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

// Текст из внешних источников — в одну строку, без управляющих символов и без префиксов формата SwiftBar.
export function clean(text, max = 120) {
  // «|» — разделитель параметров: в чужом тексте он подменил бы их, поэтому заменяется на «¦».
  let s = String(text ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\|/g, "¦").replace(/\s+/g, " ").trim();
  s = s.replace(/^[-~]+/, "").trim();
  if ([...s].length > max) s = [...s].slice(0, max - 1).join("") + "…";
  return s;
}

// Значение параметра в кавычках.
export function q(v) {
  return `"${clean(v, 400).replace(/["\\]/g, "\\$&")}"`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tryStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fmtTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fmtAgo(ms, lang = "ru") {
  const m = Math.max(0, Math.round(ms / 60_000));
  const en = lang === "en";
  if (m < 60) return en ? `${m} min ago` : `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return en ? `${h} h ago` : `${h} ч назад`;
  return en ? `${Math.round(h / 24)} d ago` : `${Math.round(h / 24)} дн назад`;
}
export function dateStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
const stampLabel = (s) => `${s.slice(6, 8)}.${s.slice(4, 6)}`;

function run(file, args, { timeoutMs = 2000, env } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env }, (err, stdout) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : -1) : 0, stdout: String(stdout || ""), error: err ? String(err.code || err.message) : null });
    });
  });
}

// Двойник для тестов или системная программа.
function bin(name, system) {
  const dir = process.env.AGENTHUB_TEST_BIN_DIR;
  if (dir && existsSync(join(dir, name))) return join(dir, name);
  return system;
}

// ---------- конфигурация раннера ----------

// → { ok, stateDir, start, usage, windowHours, maxWaitMin, projects:[{id, title, enabled, worktree, unityDir}], problem? }
// problem — код (переводит render): "not-object" | "no-projects" | "project-no-id".
export function parseRunnerConfig(raw, home = homedir()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problem: "not-object" };
  const stateDir = expand(typeof raw.state_dir === "string" ? raw.state_dir : "~/.claude/task-runs/night", home);
  const start = typeof raw.schedule?.start === "string" && /^\d{1,2}:\d{2}$/.test(raw.schedule.start) ? raw.schedule.start : "04:30";
  const usage = { ...USAGE_DEFAULTS, ...(raw.usage && typeof raw.usage === "object" ? raw.usage : {}) };
  const windowHours = Number.isFinite(raw.schedule?.window_hours) && raw.schedule.window_hours > 0 ? raw.schedule.window_hours : 5;
  // сколько раннер ждёт сброса недели, упёршейся в порог, вместо пропуска ночи (decideStart, schedule.mjs)
  const maxWaitMin = Number.isFinite(raw.schedule?.max_wait_for_reset_min) && raw.schedule.max_wait_for_reset_min >= 0 ? raw.schedule.max_wait_for_reset_min : MAX_WAIT_DEFAULT_MIN;
  let list = raw.projects;
  if (list === undefined && typeof raw.worktree === "string") {
    // конфиг v1: один проект PerfectWar (night-runner/lib/config.mjs, upgradeV1)
    list = [{ id: "perfectwar", worktree: raw.worktree, profile: { type: "unity", project_path: "Client/PerfectWar" } }];
  }
  if (!Array.isArray(list)) return { ok: false, problem: "no-projects" };
  const projects = [];
  for (const p of list) {
    if (!p || typeof p !== "object" || typeof p.id !== "string") return { ok: false, problem: "project-no-id" };
    const main = typeof p.main_checkout === "string" ? expand(p.main_checkout, home) : null;
    const worktree = typeof p.worktree === "string" ? expand(p.worktree, home) : main ? `${main}-night` : null;
    const unity = p.profile?.type === "unity" && typeof p.profile.project_path === "string";
    projects.push({
      id: p.id,
      title: typeof p.title === "string" && p.title ? p.title : p.id, // как в раннере: title ?? id
      enabled: p.enabled !== false,
      worktree,
      unityDir: unity && worktree ? join(worktree, p.profile.project_path) : null,
    });
  }
  return { ok: true, stateDir, start, usage, windowHours, maxWaitMin, projects };
}

// Поддерживает ли раннер команду: только по списку COMMANDS в night-run.mjs (запускать раннер ради детекта нельзя:
// неизвестная команда у него не ошибка разбора, а риск запустить ночь).
export function runnerCommands(source) {
  const m = /const\s+COMMANDS\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!m) return [];
  return [...m[1].matchAll(/["'`]([\w-]+)["'`]/g)].map((x) => x[1]);
}

// ---------- процессы ----------

// `ps -axww -o pid=,ppid=,command=` → [{pid, ppid, cmd}]
export function parsePs(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] });
  }
  return out;
}

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slashes = (t) => t.replaceAll("\\", "/");
const BATCH = /(?:^|\s)-batchmode(?=\s|$)/i;

// Как night-runner/lib/profiles/unity.mjs: -projectPath/-projectpath, путь и его realpath, без учёта регистра.
export function unityOnProject(procs, projectDir) {
  const paths = new Set([slashes(projectDir)]);
  try {
    paths.add(slashes(realpathSync(projectDir)));
  } catch {}
  const re = new RegExp(`(?:^|\\s)-projectpath\\s+["']?(?:${[...paths].map(escapeRe).join("|")})/?(?=["'\\s]|$)`, "i");
  return procs.filter((p) => re.test(slashes(p.cmd))).map((p) => ({ pid: p.pid, ppid: p.ppid, batch: BATCH.test(p.cmd) }));
}

// Живой GUI-редактор на night-worktree — блокер ночи (preflight профиля unity).
export function liveEditor(procs, projectDir) {
  return unityOnProject(procs, projectDir).find((p) => !p.batch)?.pid ?? null;
}

// ---------- файлы state_dir ----------

// Подкоманда раннера из командной строки держателя замка: `node …/night-run.mjs research --x` → "research".
// Нет подкоманды → null.
export function holderSubcommand(cmd) {
  const words = String(cmd || "").trim().split(/\s+/);
  const i = words.findIndex((w) => /(^|\/)night-run\.mjs$/.test(w));
  if (i < 0) return null;
  const sub = words.slice(i + 1).find((w) => !w.startsWith("-"));
  return sub && /^[a-z][\w-]{0,31}$/.test(sub) ? sub : null;
}

// Замок держит именно ночь: command в замке — null (до патча этапа 1 у ночи его нет) или "run", и подкоманда
// держателя — run (или её нет). research, setup, migrate-state, post тоже берут замок — это не ночь.
// Та же логика — в действии stop (actionStop).
export function isNightLock(command, subcommand) {
  return (command === null || command === undefined || command === "run") && (subcommand === null || subcommand === undefined || subcommand === "run");
}

// Последний сегмент ссылки задачи как её id (ClickUp …/t/<id>, GitHub …/issues/<n>), если он SAFE_ID.
export function taskIdFromUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  const seg = url.replace(/[?#].*$/, "").split("/").filter(Boolean).pop();
  return seg && SAFE_ID.test(seg) ? seg : null;
}

// night.lock → { pid, startedAt, command? } | null (нет файла) | { broken: true }
export function readLock(stateDir) {
  const path = join(stateDir, "night.lock");
  if (!existsSync(path)) return null;
  try {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    if (Number.isInteger(lock?.pid) && lock.pid > 0 && typeof lock.startedAt === "string") {
      return { pid: lock.pid, startedAt: lock.startedAt, command: typeof lock.command === "string" ? lock.command : null };
    }
  } catch {}
  return { broken: true };
}

export function readTamper(stateDir) {
  const path = join(stateDir, TAMPER_FILE);
  if (!existsSync(path)) return null;
  try {
    return { path, text: clean(readFileSync(path, "utf8").split("\n")[0], 160) };
  } catch {
    return { path, text: null };
  }
}

// Сводка YYYYMMDD.md: прогоны одной даты разделены `---`; берём последний. → {ok, date, range, stop, tasks, prs} | {ok:false}
export function parseSummary(text) {
  const blocks = String(text).split(/\n---\n\n(?=# )/);
  const last = blocks[blocks.length - 1];
  const lines = last.split("\n");
  const m = /^# Ночной прогон (\d{8})\s*$/.exec(lines[0] || "");
  if (!m) return { ok: false };
  const head = (lines[2] || "").split(" · ");
  const out = { ok: true, date: m[1], range: null, stop: null, tasks: null, prs: null, quota: null };
  for (const part of head) {
    let x;
    if ((x = /^(\d{2}:\d{2})–(\d{2}:\d{2}|…)$/.exec(part))) out.range = `${x[1]}–${x[2]}`;
    else if ((x = /^остановка: (.*)$/.exec(part))) out.stop = clean(x[1], 200);
    else if ((x = /^задач (\d+)$/.exec(part))) out.tasks = Number(x[1]);
    else if ((x = /^PR (\d+)$/.exec(part))) out.prs = Number(x[1]);
    else if (/^квота/.test(part)) {
      out.quota = clean(part, 80);
      out.nightQuota = parseNightQuota(part);
    }
  }
  if (out.tasks === null || out.stop === null) return { ok: false };
  return out;
}

// Часть «квота: …» сводки ночи (night-runner/lib/report.mjs, quotaText) → квота на старте ночи, которой раннер
// фиксирует бюджет (trackUsage: state.start). → { startPct, budgetPct, lastNight, fiveHour } | null
//   «квота: неделя 40% → 42%, бюджет ночи 4.3 п. п. недели[ — неделя сбрасывается до следующей ночи, …]»
//   «квота 5ч 10% → 30%, неделя 44%» — ночь в 5-часовом окне, бюджета недели нет
export function parseNightQuota(part) {
  const t = String(part);
  if (/^квота 5ч /.test(t)) return { startPct: null, budgetPct: null, lastNight: false, fiveHour: true };
  const m = /^квота: неделя (\d+(?:\.\d+)?)% → /.exec(t);
  if (!m) return null;
  const b = /бюджет ночи (\d+(?:\.\d+)?) п\. п\./.exec(t);
  return { startPct: Number(m[1]), budgetPct: b ? Number(b[1]) : null, lastNight: /неделя сбрасывается до следующей ночи/.test(t), fiveHour: false };
}

// План dry-run: пункты «**В плане:**» по секциям проектов. → {ok, sections:[{title, tasks:[{name,url}]}], skipped}
export function parseDryPlan(text) {
  const blocks = String(text).split(/\n---\n\n(?=# )/);
  const last = blocks[blocks.length - 1];
  if (!/^# Ночной прогон \d{8}/.test(last)) return { ok: false };
  const sections = [];
  let cur = null;
  let mode = null;
  let skipped = 0;
  for (const line of last.split("\n")) {
    if (line.startsWith("## ")) {
      cur = { title: clean(line.slice(3).split(" · ")[0], 60), tasks: [] };
      sections.push(cur);
      mode = null;
    } else if (/^\*\*В плане:\*\*/.test(line)) mode = "plan";
    else if (/^\*\*Пропущено:\*\*/.test(line)) mode = "skip";
    else if (line.startsWith("- ") && cur && mode === "plan") {
      const t = /^- \[(.*)\]\(([^)\s]*)\)/.exec(line);
      if (t) cur.tasks.push({ name: clean(t[1], 90), url: t[2] });
    } else if (line.startsWith("- ") && cur && mode === "skip") skipped++;
    else if (!line.startsWith("  ")) mode = null; // пустая строка или новый блок закрывают список
  }
  return { ok: true, sections, skipped };
}

// Последние n сводок (без .dry). → [{stamp, path, mtimeMs}]
export function listSummaries(stateDir, { dry = false, n = 7 } = {}) {
  let names = [];
  try {
    names = readdirSync(stateDir);
  } catch {
    return [];
  }
  const re = dry ? /^(\d{8})\.dry\.md$/ : /^(\d{8})\.md$/;
  return names
    .map((f) => re.exec(f))
    .filter(Boolean)
    .map((m) => ({ stamp: m[1], path: join(stateDir, m[0]) }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1))
    .slice(0, n)
    .map((s) => ({ ...s, mtimeMs: tryStat(s.path)?.mtimeMs ?? 0 }));
}

// Маркеры попыток: держатся — без retries (park/published) или retries ≥ 3; иначе повтор n/3.
export function readAttempts(stateDir, projectId) {
  const dir = join(stateDir, "projects", projectId, "attempts");
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { held: [], retry: [], newestMs: 0, broken: 0 };
  }
  const held = [];
  const retry = [];
  let newestMs = 0;
  let broken = 0;
  for (const f of names.sort()) {
    const path = join(dir, f);
    let m;
    try {
      m = readJson(path);
    } catch {
      broken++;
      continue;
    }
    if (!m || typeof m !== "object" || typeof m.outcome !== "string") {
      broken++;
      continue;
    }
    newestMs = Math.max(newestMs, tryStat(path)?.mtimeMs ?? 0);
    const item = { project: projectId, id: basename(f, ".json"), outcome: clean(m.outcome, 80), date: typeof m.date === "string" ? m.date : null, retries: Number.isInteger(m.retries) ? m.retries : null, draft: Boolean(m.questions?.draft) };
    if (item.retries === null || item.retries >= MAX_RETRIES) held.push(item);
    else retry.push(item);
  }
  return { held, retry, newestMs, broken };
}

// Последние 64 КБ файла.
function tail(path, bytes = 64 * 1024) {
  const st = tryStat(path);
  if (!st) return "";
  const size = Math.min(st.size, bytes);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, st.size - size);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

// Текущая задача идущей ночи — по night.log последнего прогона: «задача X: старт» без итоговой строки
// «проект P, задача X: …». Из лога берётся только id задачи.
export function currentTaskFromLog(text) {
  let current = null;
  for (const line of String(text).split("\n")) {
    let m;
    if ((m = /^\S+ задача (\S+): старт(?=[,\s]|$)/.exec(line))) current = m[1];
    else if ((m = /^\S+ проект \S+, задача (\S+?): /.exec(line)) && m[1] === current) current = null;
  }
  return current;
}

function latestRunLog(stateDir, nowMs) {
  for (const stamp of [dateStamp(nowMs), dateStamp(nowMs - DAY_MS)]) {
    const dir = join(stateDir, stamp);
    let runs = [];
    try {
      runs = readdirSync(dir).filter((d) => /^\d{6}/.test(d)).sort();
    } catch {
      continue;
    }
    for (const r of runs.reverse()) {
      const log = join(dir, r, "night.log");
      if (existsSync(log)) return log;
    }
  }
  return null;
}

// Есть ли каталог прогона run, заведённый перед замком: state_dir/<YYYYMMDD>/<HHMMSS>/night.log (research — с
// суффиксом «-research», setup и migrate-state каталога не заводят). Раннер заводит его до nightLock, а тот ждёт
// чужой замок до минуты — каталог не позже startedAt и не раньше чем за 5 мин до него.
export function hasRunDir(stateDir, startedAt) {
  const at = Date.parse(startedAt || "");
  if (!Number.isFinite(at)) return false;
  for (const stamp of new Set([dateStamp(at), dateStamp(at - 5 * MIN_MS)])) {
    let runs = [];
    try {
      runs = readdirSync(join(stateDir, stamp)).filter((d) => /^\d{6}$/.test(d));
    } catch {
      continue;
    }
    for (const r of runs) {
      const ms = new Date(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)), Number(r.slice(0, 2)), Number(r.slice(2, 4)), Number(r.slice(4, 6))).getTime();
      if (ms <= at + 1000 && at - ms <= 5 * MIN_MS && existsSync(join(stateDir, stamp, r, "night.log"))) return true;
    }
  }
  return false;
}

// ---------- квота и питание ----------

export function weeklyPct(usageJson) {
  return weeklyRow(usageJson)?.percent ?? null;
}

// Строка недели из кэша хаба → { percent, resetsMs } | null. С nowMs строка, чей сброс уже прошёл, не в счёт: служба
// usage при истёкшем токене или без сети оставляет прежние строки, и после сброса недели их процент ничего не значит.
export function weeklyRow(usageJson, nowMs = null) {
  const rows = Array.isArray(usageJson?.rows) ? usageJson.rows : [];
  const row = rows.find((r) => r && r.kind === "weekly_all" && typeof r.percent === "number" && Number.isFinite(r.percent));
  if (!row) return null;
  const resetsMs = typeof row.resets_at === "string" ? Date.parse(row.resets_at) : NaN;
  if (nowMs !== null && Number.isFinite(resetsMs) && resetsMs <= nowMs) return null;
  return { percent: row.percent, resetsMs: Number.isFinite(resetsMs) ? resetsMs : null };
}

// Есть ли 5-часовое окно (строка session): с ним раннер ограничивает ночь окном, а не бюджетом недели.
export function hasFiveHour(usageJson) {
  return (Array.isArray(usageJson?.rows) ? usageJson.rows : []).some((r) => r && (r.kind === "session" || r.group === "session") && typeof r.percent === "number");
}

// Бюджет ночи — формула раннера (night-runner/lib/schedule.mjs, nightBudget): доля недели на ночь
// (night_share_pct / 7), но не больше остатка до stop_seven_day_pct; ночь, после которой следующая начнётся уже
// у сброса (до сброса меньше суток и окна ночи), — последняя: берёт весь остаток до потолка.
// atMs — момент старта ночи. → { pct, stopAt, lastNight }
export function nightBudget(weekPct, resetsMs, atMs, usageCfg, windowHours = 5) {
  const room = Math.max(0, usageCfg.stop_seven_day_pct - weekPct);
  const lastNight = resetsMs !== null && resetsMs !== undefined && resetsMs - atMs < DAY_MS + windowHours * HOUR_MS;
  const pct = lastNight ? room : Math.min(usageCfg.night_share_pct / WEEK_NIGHTS, room);
  return { pct, stopAt: weekPct + pct, lastNight };
}

// Кэш квоты хаба (AGENTHUB_USAGE_FILE). → { ok:true, week:{percent, resetsMs}|null, rolled, rolledAt, fiveHour, ageMs, error }
// (week = null и rolled — неделя уже сброшена, а свежих строк нет)
// | { ok:false, why: "no-env" | "no-file" | "broken" }
export function readQuota(file, nowMs) {
  if (!file) return { ok: false, why: "no-env" };
  let j;
  try {
    j = readJson(file);
  } catch (e) {
    return { ok: false, why: e.code === "ENOENT" ? "no-file" : "broken" };
  }
  if (!j || typeof j !== "object" || Array.isArray(j) || (j.rows !== undefined && !Array.isArray(j.rows))) return { ok: false, why: "broken" };
  const fetchedMs = typeof j.fetched_at === "number" ? j.fetched_at * 1000 : null;
  const week = weeklyRow(j, nowMs);
  const any = weeklyRow(j);
  const error = typeof j.error === "string" && /^[a-z0-9-]{1,40}$/.test(j.error) ? j.error : typeof j.error === "string" ? "other" : null;
  return { ok: true, week, rolled: !week && Boolean(any), rolledAt: !week && any ? any.resetsMs : null, fiveHour: hasFiveHour(j), ageMs: fetchedMs === null ? null : nowMs - fetchedMs, error };
}

export function parsePower(text) {
  if (text.includes("AC Power")) return true;
  if (text.includes("Battery Power")) return false;
  return null;
}

// Время ближайшего старта ночи (локальное): тот же час по часам завтра, а не +24 ч — в день перехода на летнее
// или зимнее время launchd стартует по часам (StartCalendarInterval).
export function nextStart(start, nowMs) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(nowMs);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= nowMs) {
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

// Неделя, упёршаяся в порог пропуска, к старту ночи — как decideStart раннера (night-runner/lib/schedule.mjs):
// сброс не позже старта — к старту недели уже нет (раннер читает квоту заново); сброс не позже
// max_wait_for_reset_min после старта — ночь подождёт его, а не пропустится. → "reset" | "wait" | "skip" | null
// (null — неделя ниже порога или неизвестна).
export function weekAtStart(week, startMs, usageCfg, maxWaitMin = MAX_WAIT_DEFAULT_MIN) {
  if (!week || !Number.isFinite(week.percent)) return null;
  if (Number.isFinite(week.resetsMs) && week.resetsMs <= startMs) return "reset";
  if (week.percent < usageCfg.skip_seven_day_pct) return null;
  if (Number.isFinite(week.resetsMs) && week.resetsMs - startMs <= maxWaitMin * MIN_MS) return "wait";
  return "skip";
}

// ---------- режим команд (после этапа 1) ----------

// Ожидаемая форма `status --json` (этап 1): {running, lock:{pid,startedAt,command,alive?}|null, task:{id,project}|null,
// tamper: string|null, crashed?: bool, blockers:[{id,text}]} (упавший раннер — crashed=true или блокер
// с id runner-crashed). `queue --json`: {as_of, plan:{as_of, sections:[{project,
// tasks:[{id,name,url}]}]}, held:[{project,id,outcome,date,retries}]}. Другая форма → файловый режим.
export function adaptStatus(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.blockers) || typeof j.running !== "boolean") return null;
  return {
    running: j.running,
    lock: j.lock && Number.isInteger(j.lock.pid) ? { pid: j.lock.pid, startedAt: String(j.lock.startedAt || ""), command: j.lock.command || null, ...(typeof j.lock.alive === "boolean" ? { alive: j.lock.alive } : {}) } : null,
    crashed: j.crashed === true || j.blockers.some((b) => b && b.id === "runner-crashed"),
    task: j.task && j.task.id ? String(j.task.id) : null,
    tamper: typeof j.tamper === "string" && j.tamper ? clean(j.tamper, 160) : null,
    blockers: j.blockers.filter((b) => b && typeof b.text === "string").map((b) => ({ id: /^[\w.:-]{1,60}$/.test(b.id || "") ? b.id : "blocker", text: clean(b.text, 160) })),
  };
}

export function adaptQueue(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.held) || !j.plan || !Array.isArray(j.plan.sections)) return null;
  const asOf = Date.parse(j.plan.as_of || j.as_of || "");
  return {
    planAsOf: Number.isFinite(asOf) ? asOf : null,
    sections: j.plan.sections.map((s) => ({
      title: clean(s.project, 60),
      tasks: (Array.isArray(s.tasks) ? s.tasks : []).map((t) => ({
      name: clean(t.name || t.id, 90),
      url: typeof t.url === "string" ? t.url : null,
      id: typeof t.id === "string" && SAFE_ID.test(t.id) ? t.id : null,
    })),
    })),
    held: j.held.filter((h) => h && h.id).map((h) => ({ project: clean(h.project, 40), id: clean(h.id, 40), outcome: clean(h.outcome, 80), date: h.date || null, retries: Number.isInteger(h.retries) ? h.retries : null })),
  };
}

async function runnerJson(runnerDir, args) {
  const node = bin("node", process.execPath);
  const r = await run(node, [join(runnerDir, "night-run.mjs"), ...args], { timeoutMs: 3500, env: { HOME: process.env.HOME || homedir(), PATH: process.env.PATH || "/usr/bin:/bin", LANG: "en_US.UTF-8" } });
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ---------- сбор фактов ----------

function pluginSettings() {
  const dir = process.env.AGENTHUB_PLUGIN_DATA_PATH;
  if (!dir) return {};
  try {
    const j = readJson(join(dir, "config.json"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export async function collect({ home = homedir(), nowMs = Date.now(), settings = pluginSettings(), usageFile = process.env.AGENTHUB_USAGE_FILE || null } = {}) {
  const facts = { nowMs, broken: [], notes: [], blockers: [], mode: "files" };
  const runnerDir = expand(settings.runnerDir || "~/Projects/IT/night-runner", home);
  facts.runnerDir = runnerDir;
  // конфиг раннера
  let cfg = { ok: true, stateDir: expand("~/.claude/task-runs/night", home), start: "04:30", usage: { ...USAGE_DEFAULTS }, windowHours: 5, maxWaitMin: MAX_WAIT_DEFAULT_MIN, projects: [] };
  facts.usage = cfg.usage;
  const cfgPath = join(runnerDir, "config.json");
  if (existsSync(cfgPath)) {
    let raw = null;
    try {
      raw = readJson(cfgPath);
    } catch {
      facts.broken.push({ k: "cfgUnparsed" });
    }
    if (raw) {
      const c = parseRunnerConfig(raw, home);
      if (c.ok) cfg = c;
      else facts.broken.push({ k: "cfg", problem: c.problem });
    }
  } else facts.notes.push({ k: "noConfig" });
  if (settings.stateDir) cfg.stateDir = expand(settings.stateDir, home);
  facts.cfg = cfg;
  facts.usage = cfg.usage;
  const stateDir = cfg.stateDir;
  // квота — из кэша хаба (служба usage); без переменной — «недоступна»
  facts.quota = readQuota(usageFile, nowMs);
  if (facts.quota.ok && facts.quota.week) facts.week = facts.quota.week.percent;

  // команды раннера (этап 1)
  let commands = [];
  try {
    commands = runnerCommands(readFileSync(join(runnerDir, "night-run.mjs"), "utf8"));
  } catch {}
  const [psOut, power, statusJ, queueJ] = await Promise.all([
    run(bin("ps", "/bin/ps"), ["-axww", "-o", "pid=,ppid=,command="]),
    run(bin("pmset", "/usr/bin/pmset"), ["-g", "batt"]),
    commands.includes("status") ? runnerJson(runnerDir, ["status", "--json"]) : null,
    commands.includes("queue") ? runnerJson(runnerDir, ["queue", "--json"]) : null,
  ]);
  const procs = psOut.code === 0 ? parsePs(psOut.stdout) : null;
  if (!procs) facts.broken.push({ k: "ps" });
  const status = statusJ ? adaptStatus(statusJ) : null;
  const queue = queueJ ? adaptQueue(queueJ) : null;
  if (commands.includes("status") && !status) facts.notes.push({ k: "badJson", cmd: "status" });
  if (commands.includes("queue") && !queue) facts.notes.push({ k: "badJson", cmd: "queue" });
  if (status) facts.mode = "status";

  // замок и текущая задача
  if (status) {
    facts.lock = status.lock;
    facts.running = status.running;
    facts.task = status.task;
    if (status.crashed) facts.crashed = { since: status.lock?.startedAt || null };
  } else {
    const lock = readLock(stateDir);
    if (lock?.broken) {
      facts.notes.push({ k: "badLock" });
      facts.lock = null;
    } else facts.lock = lock;
    facts.running = false;
    if (facts.lock && procs) {
      const holder = procs.find((p) => p.pid === facts.lock.pid && p.cmd.includes("night-run.mjs"));
      facts.lock.alive = Boolean(holder);
      facts.lock.holder = holder ? holderSubcommand(holder.cmd) : null;
      facts.running = Boolean(holder) && isNightLock(facts.lock.command, facts.lock.holder);
      // Держателя нет, а замок ночи остался — раннер упал посреди ночи. Без command в замке (до патча этапа 1)
      // замок берут и setup, migrate-state, research, а Ctrl+C на них оставляет его: ночь — только если рядом
      // каталог прогона run (state_dir/<дата>/<HHMMSS>/night.log), заведённый перед этим замком.
      if (!holder && isNightLock(facts.lock.command, null) && (facts.lock.command === "run" || hasRunDir(stateDir, facts.lock.startedAt))) {
        facts.crashed = { since: facts.lock.startedAt };
      }
    }
    if (facts.running) {
      const log = latestRunLog(stateDir, nowMs);
      facts.task = log ? currentTaskFromLog(tail(log)) : null;
    }
  }

  // блокеры
  const tamper = status ? (status.tamper ? { text: status.tamper, path: join(stateDir, TAMPER_FILE) } : null) : readTamper(stateDir);
  if (tamper) facts.blockers.push({ id: "tamper", event: "tamper", kind: "tamper", detail: tamper.text, text: `маркер подмены: ${tamper.text}`, path: tamper.path });
  if (status) {
    for (const b of status.blockers) if (b.id !== "tamper") facts.blockers.push({ id: b.id, event: b.id, text: b.text });
  } else {
    if (procs) {
      for (const p of cfg.projects.filter((x) => x.enabled && x.unityDir)) {
        const pid = liveEditor(procs, p.unityDir);
        if (pid) facts.blockers.push({ id: `unity:${p.id}`, event: `unity-open:${p.id}`, kind: "unity", where: basename(String(p.unityDir).replace(/\/+$/, "")) || p.id, pid, text: `на night-worktree ${p.id} открыт редактор Unity (pid ${pid})` });
      }
    }
    const ac = power.code === 0 ? parsePower(power.stdout) : null;
    if (ac === false) facts.blockers.push({ id: "power", event: "power", kind: "power", text: "не на питании от сети — ночь по расписанию не стартует", soft: true });
    const plist = join(home, "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    if (!existsSync(plist)) facts.blockers.push({ id: "launchd", event: "launchd-missing", kind: "launchd", text: "задание launchd снято — ночь не запустится сама" });
    const week = facts.quota.ok ? facts.quota.week : null;
    // как decideStart раннера: сброс до старта или вскоре после него (≤ max_wait_for_reset_min) — не пропуск
    const atStart = facts.running ? null : weekAtStart(week, nextStart(cfg.start, nowMs), cfg.usage, cfg.maxWaitMin);
    if (atStart === "wait") facts.weekWait = { untilMs: week.resetsMs + MIN_MS };
    if (atStart === "skip") {
      facts.blockers.push({ id: "quota", event: "quota-skip", kind: "quota", week: Math.round(week.percent), skip: cfg.usage.skip_seven_day_pct, text: `недельная квота ${Math.round(week.percent)}% ≥ ${cfg.usage.skip_seven_day_pct}% — ночь пропустит` });
    }
  }

  // итоги ночей
  facts.summaries = [];
  for (const s of listSummaries(stateDir, { n: 7 })) {
    let parsed = { ok: false };
    try {
      parsed = parseSummary(readFileSync(s.path, "utf8"));
    } catch {}
    facts.summaries.push({ ...s, ...parsed });
  }
  if (facts.summaries.length && !facts.summaries[0].ok) facts.broken.push({ k: "summary", file: `${facts.summaries[0].stamp}.md` });
  // Идёт ночь — её бюджет раннер зафиксировал по квоте на старте (trackUsage: state.start), и он есть в сводке
  // ночи (дата — день старта по замку). Текущая неделя для бюджета идущей ночи не берётся.
  if (facts.running) {
    const startedMs = Date.parse(facts.lock?.startedAt || "");
    const stamp = Number.isFinite(startedMs) ? dateStamp(startedMs) : dateStamp(nowMs);
    const cur = facts.summaries.find((x) => x.ok && x.stamp === stamp);
    facts.nightStart = cur?.nightQuota ?? null;
  }
  // Сводка дня осталась «прогон не завершён», а живого замка нет — раннер упал (замок мог снять перезапуск).
  const today = facts.summaries.find((x) => x.ok && x.stamp === dateStamp(nowMs));
  if (!facts.crashed && today && /^прогон не завершён/.test(today.stop || "") && !(facts.lock && facts.lock.alive !== false)) {
    facts.crashed = { since: null, stamp: today.stamp };
  }

  // очередь
  if (queue) {
    facts.plan = { asOf: queue.planAsOf, sections: queue.sections, path: null };
    facts.held = queue.held.filter((h) => h.retries === null || h.retries >= MAX_RETRIES);
    facts.retry = queue.held.filter((h) => h.retries !== null && h.retries < MAX_RETRIES);
    facts.heldAsOf = queue.planAsOf;
  } else {
    const dry = listSummaries(stateDir, { dry: true, n: 1 })[0];
    facts.plan = null;
    if (dry) {
      let p = { ok: false };
      try {
        p = parseDryPlan(readFileSync(dry.path, "utf8"));
      } catch {}
      if (p.ok) {
        let stop = null;
        try {
          stop = parseSummary(readFileSync(dry.path, "utf8")).stop ?? null;
        } catch {}
        facts.plan = { asOf: dry.mtimeMs, stamp: dry.stamp, sections: p.sections, skipped: p.skipped, path: dry.path, stop };
      }
      else facts.broken.push({ k: "summary", file: `${dry.stamp}.dry.md` });
    }
    facts.held = [];
    facts.retry = [];
    facts.heldAsOf = 0;
    let broken = 0;
    for (const p of cfg.projects) {
      const a = readAttempts(stateDir, p.id);
      facts.held.push(...a.held);
      facts.retry.push(...a.retry);
      facts.heldAsOf = Math.max(facts.heldAsOf, a.newestMs);
      broken += a.broken;
    }
    if (broken) facts.notes.push({ k: "badMarkers", n: broken });
  }
  return facts;
}

// ---------- вывод ----------

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function fileEffect(path) {
  return path && !/\s/.test(path) ? ` effect=${q(`open.file ${path}`)}` : "";
}

// Язык — AGENTHUB_LANG (ru | en) от ядра; без переменной — ru.
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plEn = (n, one, other) => (n === 1 ? one : other);

export const T = {
  ru: {
    stamp: (s) => `${s.slice(6, 8)}.${s.slice(4, 6)}`,
    dt: (ms) => fmtDateTime(ms),
    blocker: (b, start) =>
      b.kind === "unity" ? `Unity открыт на ${b.where} — закройте до ${start}`
      : b.kind === "tamper" ? "Найден маркер подмены — ночь заблокирована до проверки"
      : b.kind === "power" ? "мак не на зарядке"
      : b.kind === "launchd" ? "снято задание launchd — включите его снова"
      : b.kind === "quota" ? `неделя ${b.week}% ≥ ${b.skip}% — ночь пропустит запуск`
      : b.text,
    blockerDetail: (b) => (b.kind === "unity" ? `процесс Unity ${b.pid}` : b.kind === "tamper" ? b.detail ?? "файл маркера не читается" : null),
    running: (since, task) => `Ночь идёт${since ? ` с ${since}` : ""}${task ? ` · задача ${task}` : ""}`,
    crashed: "Ночь оборвалась (раннер упал) — откройте night.log",
    wontStart: (b) => `Ночь не запустится: ${b}`,
    mayNot: (b) => `Ночь может не стартовать: ${b}`,
    ready: (t) => `Ночь готова · старт в ${t}`,
    readyWait: (t) => `Ночь готова · старт после сброса недели, в ${t}`,
    tileRunning: "идёт",
    broken: "Не получается прочитать файлы раннера",
    brokenItem: (x) =>
      x.k === "cfgUnparsed" ? "config.json раннера не разобран"
      : x.k === "cfg" ? `config.json раннера: ${({ "not-object": "не объект", "no-projects": "нет списка projects", "project-no-id": "проект без id" })[x.problem] || x.problem}`
      : x.k === "ps" ? "ps не ответил"
      : x.k === "summary" ? `сводка ${x.file}: незнакомая форма`
      : String(x.k ?? x),
    crashLine: (d) => `Раннер упал посреди ночи ${d} — разберите night.log`,
    stop: "Остановить ночь после текущей задачи",
    skipTask: (id) => `Пропустить задачу ${id}`,
    blockers: (n) => `Что мешает (${n})`,
    noBlockers: "Ничего не мешает",
    lockStale: (when) => `Ночь не идёт; остался старый замок от ${when} — раннер уберёт его сам`,
    lockHeld: (h, when) => `Раннер занят командой «${h}» с ${when}`,
    lockNight: (when, task) => `Ночь идёт с ${when}${task ? ` · задача ${task}` : ""}`,
    lockPid: (pid) => `процесс ${pid}`,
    noLock: (when) => `Следующий старт ${when}`,
    lastNight: (d, tasks, prs, stop) => `Последняя ночь ${d}: задач ${tasks}, PR ${prs} · ${stop}`,
    nightDone: (d) => `Итог ночи ${d} готов`,
    infra: (stop) => `Ночь остановлена: ${stop}`,
    history: "Последние ночи",
    stStart: "Следующий запуск",
    stNote: { running: "ночь идёт сейчас", crashed: "раннер упал", blocked: "не запустится", maybe: "может не стартовать", ready: "всё готово" },
    stPlanTitle: "План на ночь",
    stPlan: (n) => `${n} ${plural(n, "задача", "задачи", "задач")}`,
    stHeld: (n) => `отложено ${n}`,
    stNoHeld: "отложенных нет",
    stNoPlan: "плана пока нет",
    stWeek: "Квота недели",
    stWeekNote: (skip) => `при ≥ ${skip}% ночь пропустит запуск`,
    stWeekOff: "квота недоступна",
    budgetTitle: "Бюджет ночи",
    budgetNote: "доля недели",
    budget: (b, last) => `Ночь возьмёт не больше ${b} недели${last ? " — последняя ночь перед сбросом" : ""}`,
    budgetStop: (stop) => `Ночь остановится, когда неделя дойдёт до ${stop}`,
    budgetSkip: (w, n) => `Ночь пропустит запуск: неделя ${w} ≥ ${n}`,
    budgetWait: (w, n, t) => `Неделя ${w} ≥ ${n}: ночь подождёт её сброса до ${t} и возьмёт бюджет от новой недели`,
    budgetAfterReset: (when) => `Неделя сбросится до старта (${when}) — бюджет ночи раннер посчитает от новой недели`,
    budgetFive: "Есть 5-часовое окно — ночь ограничит себя им, а не бюджетом недели",
    budgetStale: (ago) => `квота обновлялась ${ago}`,
    budgetDefaults: "Пороги ночи — по умолчанию: настройки раннера не прочитаны",
    budgetFixed: (w) => `бюджет зафиксирован на старте ночи, при неделе ${w}`,
    budgetRunningUnknown: "Ночь идёт: бюджет раннер считает от квоты на старте ночи — в сводке ночи его пока нет",
    quotaNoWeek: (why) => `Квота недоступна: ${why} — бюджет ночи не посчитать`,
    quotaRolled: (when) => `неделя сброшена${when ? ` ${when}` : ""}, свежей квоты пока нет`,
    quotaWhy: (code) =>
      ({
        "no-token": "нет входа в Claude Code",
        "token-expired": "токен Claude Code истёк, хаб ждёт, пока его обновит Claude Code",
        "http-401": "Claude Code не пускает к квоте",
        "http-403": "нет доступа к квоте",
        "http-429": "Anthropic просит подождать",
        network: "нет связи с Anthropic",
        timeout: "Anthropic не ответил вовремя",
        "bad-response": "незнакомый ответ Anthropic",
      })[code] || (code ? `ошибка службы квоты ${code}` : "хаб ещё не получил квоту"),
    quotaOff: (why) => `Квота недоступна: ${why === "no-env" ? "хаб не передал кэш квоты (служба usage выключена или хаб старый)" : why === "no-file" ? "хаб ещё не загрузил квоту" : "кэш квоты хаба не разобран"} — бюджет ночи не посчитать`,
    stripNote: (tasks, prs) => `задач ${tasks} · PR ${prs}`,
    stripBad: "сводка не разобрана",
    detailsTitle: "Подробности",
    histLine: (d, range, tasks, prs, stop) => `${d}${range ? ` ${range}` : ""}: задач ${tasks}, PR ${prs} · ${stop}`,
    histBad: (d) => `${d}: сводка не разобрана`,
    plan: (n, asOf, stale, why) => `План на ночь (пробный прогон${asOf ? ` ${asOf}` : ""}): ${n} ${plural(n, "задача", "задачи", "задач")}${stale ? " — устарел" : ""}${why}`,
    planAsOf: (when, ago) => `от ${when}, ${ago}`,
    skipTonight: "Пропустить в ночи",
    runNow: "Запустить днём без пуша",
    filtered: (n) => `пропущено по фильтрам: ${n}`,
    noPlan: "Плана на ночь пока нет",
    held: (n, retry, asOf) => `Отложены: ${n}${retry ? ` · повторятся: ${retry}` : ""}${asOf ? ` (на ${asOf})` : ""}`,
    heldLine: (h, d) => `${h.id} · ${h.outcome}${d ? ` · ${d}` : ""}${h.draft ? " · вопросы не отправлены" : ""}`,
    retryLine: (h, max) => `${h.id} · повтор ${h.retries}/${max} · ${h.outcome}`,
    sourceTitle: "Откуда данные",
    source: (st) => (st ? "night-run.mjs status --json" : "файлы раннера (status --json ещё нет)"),
    pluginError: "Сбой плагина ночи",
    note: (x) =>
      x.k === "noConfig" ? "config.json раннера не найден — state_dir по умолчанию"
      : x.k === "badJson" ? `${x.cmd} --json: нет ответа или незнакомая форма — читаю файлы`
      : x.k === "badLock" ? "night.lock не разобран (раннер сочтёт его протухшим)"
      : x.k === "badMarkers" ? `маркеров попыток не разобрано: ${x.n}`
      : String(x.k ?? x),
  },
  en: {
    stamp: (s) => `${MON[Number(s.slice(4, 6)) - 1]} ${Number(s.slice(6, 8))}`,
    dt: (ms) => {
      const d = new Date(ms);
      return `${MON[d.getMonth()]} ${d.getDate()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    },
    blocker: (b, start) =>
      b.kind === "unity" ? `Unity is open on ${b.where} — close it before ${start}`
      : b.kind === "tamper" ? "Tamper marker found — night blocked until checked"
      : b.kind === "power" ? "Mac isn't plugged in"
      : b.kind === "launchd" ? "the launchd job was removed — turn it back on"
      : b.kind === "quota" ? `week at ${b.week}% ≥ ${b.skip}% — the night will skip`
      : b.text,
    blockerDetail: (b) => (b.kind === "unity" ? `Unity process ${b.pid}` : b.kind === "tamper" ? b.detail ?? "the marker file can't be read" : null),
    running: (since, task) => `Night running${since ? ` since ${since}` : ""}${task ? ` · task ${task}` : ""}`,
    crashed: "Night stopped (runner crashed) — open night.log",
    wontStart: (b) => `Night won't start: ${b}`,
    mayNot: (b) => `Night may not start: ${b}`,
    ready: (t) => `Night ready · starts at ${t}`,
    readyWait: (t) => `Night ready · starts after the weekly reset, at ${t}`,
    tileRunning: "running",
    broken: "Can't read runner files",
    brokenItem: (x) =>
      x.k === "cfgUnparsed" ? "the runner's config.json couldn't be parsed"
      : x.k === "cfg" ? `the runner's config.json: ${({ "not-object": "not an object", "no-projects": "no projects list", "project-no-id": "a project without an id" })[x.problem] || x.problem}`
      : x.k === "ps" ? "ps didn't answer"
      : x.k === "summary" ? `summary ${x.file}: unknown format`
      : String(x.k ?? x),
    crashLine: (d) => `Runner crashed during the night of ${d} — check night.log`,
    stop: "Stop the night after the current task",
    skipTask: (id) => `Skip task ${id}`,
    blockers: (n) => `In the way (${n})`,
    noBlockers: "Nothing in the way",
    lockStale: (when) => `Not running; a stale lock from ${when} is left — the runner will clear it`,
    lockHeld: (h, when) => `Runner busy with "${h}" since ${when}`,
    lockNight: (when, task) => `Night running since ${when}${task ? ` · task ${task}` : ""}`,
    lockPid: (pid) => `process ${pid}`,
    noLock: (when) => `Next start ${when}`,
    lastNight: (d, tasks, prs, stop) => `Last night ${d}: ${tasks} ${plEn(tasks, "task", "tasks")}, ${prs} PR · ${stop}`,
    nightDone: (d) => `Night of ${d} finished`,
    infra: (stop) => `Night stopped: ${stop}`,
    history: "Recent nights",
    stStart: "Next start",
    stNote: { running: "running now", crashed: "runner crashed", blocked: "won't start", maybe: "may not start", ready: "all set" },
    stPlanTitle: "Tonight's plan",
    stPlan: (n) => `${n} ${plEn(n, "task", "tasks")}`,
    stHeld: (n) => `${n} on hold`,
    stNoHeld: "nothing on hold",
    stNoPlan: "no plan yet",
    stWeek: "Weekly quota",
    stWeekNote: (skip) => `at ≥ ${skip}% the night skips`,
    stWeekOff: "quota unavailable",
    budgetTitle: "Night budget",
    budgetNote: "share of the week",
    budget: (b, last) => `The night will use at most ${b} of the week${last ? " — last night before reset" : ""}`,
    budgetStop: (stop) => `The night stops once the week reaches ${stop}`,
    budgetSkip: (w, n) => `The night will skip: week at ${w} ≥ ${n}`,
    budgetWait: (w, n, t) => `Week at ${w} ≥ ${n}: the night waits for the reset until ${t} and takes its budget from the new week`,
    budgetAfterReset: (when) => `The week resets before the start (${when}) — the runner will set the night budget from the new week`,
    budgetFive: "There's a 5-hour window — the night limits itself by it, not by a weekly budget",
    budgetStale: (ago) => `quota updated ${ago}`,
    budgetDefaults: "Night thresholds are defaults: runner settings weren't read",
    budgetFixed: (w) => `budget fixed at the night's start, with the week at ${w}`,
    budgetRunningUnknown: "Night running: the runner sets its budget from the quota at the start — not in the night's summary yet",
    quotaNoWeek: (why) => `Quota unavailable: ${why} — no night budget`,
    quotaRolled: (when) => `the week reset${when ? ` ${when}` : ""}, no fresh quota yet`,
    quotaWhy: (code) =>
      ({
        "no-token": "not signed in to Claude Code",
        "token-expired": "the Claude Code token expired; the hub waits for Claude Code to refresh it",
        "http-401": "Claude Code isn't allowed to read quota",
        "http-403": "no access to quota",
        "http-429": "Anthropic asks to wait",
        network: "can't reach Anthropic",
        timeout: "Anthropic didn't answer in time",
        "bad-response": "unexpected answer from Anthropic",
      })[code] || (code ? `quota service error ${code}` : "the hub hasn't got the quota yet"),
    quotaOff: (why) => `Quota unavailable: ${why === "no-env" ? "the hub didn't pass its quota cache (usage service off or an older hub)" : why === "no-file" ? "the hub hasn't loaded the quota yet" : "the hub's quota cache couldn't be read"} — no night budget`,
    stripNote: (tasks, prs) => `${tasks} ${plEn(tasks, "task", "tasks")} · ${prs} PR`,
    stripBad: "summary unreadable",
    detailsTitle: "Details",
    histLine: (d, range, tasks, prs, stop) => `${d}${range ? ` ${range}` : ""}: ${tasks} ${plEn(tasks, "task", "tasks")}, ${prs} PR · ${stop}`,
    histBad: (d) => `${d}: summary couldn't be read`,
    plan: (n, asOf, stale, why) => `Tonight's plan (dry run${asOf ? ` ${asOf}` : ""}): ${n} ${plEn(n, "task", "tasks")}${stale ? " — out of date" : ""}${why}`,
    planAsOf: (when, ago) => `from ${when}, ${ago}`,
    skipTonight: "Skip tonight",
    runNow: "Run now without pushing",
    filtered: (n) => `skipped by filters: ${n}`,
    noPlan: "No plan for tonight yet",
    held: (n, retry, asOf) => `On hold: ${n}${retry ? ` · will retry: ${retry}` : ""}${asOf ? ` (as of ${asOf})` : ""}`,
    heldLine: (h, d) => `${h.id} · ${h.outcome}${d ? ` · ${d}` : ""}${h.draft ? " · questions not sent" : ""}`,
    retryLine: (h, max) => `${h.id} · retry ${h.retries}/${max} · ${h.outcome}`,
    sourceTitle: "Where the data comes from",
    source: (st) => (st ? "night-run.mjs status --json" : "runner files (no status --json yet)"),
    pluginError: "Night plugin failure",
    note: (x) =>
      x.k === "noConfig" ? "runner config.json not found — using the default state_dir"
      : x.k === "badJson" ? `${x.cmd} --json: no reply or unknown format — reading files`
      : x.k === "badLock" ? "night.lock couldn't be read (the runner will treat it as stale)"
      : x.k === "badMarkers" ? `attempt markers that couldn't be read: ${x.n}`
      : String(x.k ?? x),
  },
};

const points = (v, lang) => {
  const r = String(Math.round(v * 10) / 10);
  return `${lang === "en" ? r : r.replace(".", ",")}%`;
};

// Бюджет ближайшей ночи: карточка с полосой (доля недели) и строки под ней; квоты нет — одна строка «недоступна».
// Идёт ночь — бюджет из её сводки (квота на старте, как у раннера), «пропустит запуск» не показывается.
export function budgetLines(f, startMs, L, lang) {
  const q0 = f.quota;
  if (!q0) return [];
  if (!q0.ok) return [`${clean(L.quotaOff(q0.why), 160)} | sfimage=moon.zzz color=gray`, "---"];
  const usage = f.usage || USAGE_DEFAULTS;
  const out = [];
  const card = (pct, last, stopAt) => {
    out.push(`${L.budgetTitle} | gauge=${Math.round(Math.min(100, Math.max(0, pct)))} note=${q(L.budgetNote)} color=#BF5AF2 sfimage=moon.stars`);
    out.push(`--${L.budget(points(pct, lang), last)}`);
    out.push(`--${L.budgetStop(`${Math.round(stopAt)}%`)}`);
  };
  if (f.running) {
    const ns = f.nightStart;
    if (ns && ns.fiveHour) out.push(`${L.budgetFive} | sfimage=moon.stars color=gray`);
    else if (ns && ns.startPct !== null && ns.budgetPct !== null) {
      card(ns.budgetPct, ns.lastNight, ns.startPct + ns.budgetPct);
      out.push(`--${L.budgetFixed(`${Math.round(ns.startPct)}%`)} | color=gray`);
    } else out.push(`${L.budgetRunningUnknown} | sfimage=moon.stars color=gray`);
    out.push("---");
    return out;
  }
  const week = q0.week;
  if (!week) {
    // кэш есть, а недели в нём нет: служба ещё не получила квоту, вход потерян, нет сети — или неделя уже сброшена
    const why = q0.rolled ? L.quotaRolled(q0.rolledAt ? L.dt(q0.rolledAt) : null) : L.quotaWhy(q0.error);
    out.push(`${clean(L.quotaNoWeek(why), 160)} | sfimage=moon.zzz color=gray`);
    if (q0.ageMs !== null && q0.ageMs > QUOTA_STALE_MS) out.push(`--${L.budgetStale(fmtAgo(q0.ageMs, lang))} | color=gray`);
    out.push("---");
    return out;
  }
  const atStart = weekAtStart(week, startMs, usage, f.cfg?.maxWaitMin ?? MAX_WAIT_DEFAULT_MIN);
  if (atStart === "reset") {
    out.push(`${clean(L.budgetAfterReset(L.dt(week.resetsMs)), 160)} | sfimage=moon.stars color=gray`);
  } else if (atStart === "wait") {
    out.push(`${clean(L.budgetWait(`${Math.round(week.percent)}%`, `${usage.skip_seven_day_pct}%`, fmtTime(week.resetsMs + MIN_MS)), 160)} | sfimage=moon.stars color=gray`);
  } else if (atStart === "skip") {
    out.push(`${L.budgetSkip(`${Math.round(week.percent)}%`, `${usage.skip_seven_day_pct}%`)} | sfimage=moon.zzz color=orange`);
  } else if (q0.fiveHour) {
    out.push(`${L.budgetFive} | sfimage=moon.stars color=gray`);
  } else {
    // момент старта ночи — ближайший старт по расписанию (как start.at у раннера)
    const b = nightBudget(week.percent, week.resetsMs, startMs, usage, f.cfg?.windowHours ?? 5);
    card(b.pct, b.lastNight, b.stopAt);
  }
  if (q0.ageMs !== null && q0.ageMs > QUOTA_STALE_MS) out.push(`--${L.budgetStale(fmtAgo(q0.ageMs, lang))} | color=gray`);
  if (f.notes.some((n) => n.k === "noConfig")) out.push(`--${L.budgetDefaults} | color=gray`);
  out.push("---");
  return out;
}

// Шапка отвечает на «запустится ли ночь и что сделать»: идёт → упала → блокер → мягкое → готова. tile= — плитка.
export function render(f, lang = envLang()) {
  const L = T[lang] || T.ru;
  const out = [];
  const hard = f.blockers.filter((b) => !b.soft);
  const soft = f.blockers.filter((b) => b.soft);
  const startMs = nextStart(f.cfg.start, f.nowMs);
  const startT = fmtTime(startMs);
  let status = "ok";
  let title;
  let tile = startT;
  const crashStamp = f.crashed ? f.crashed.stamp || (Number.isFinite(Date.parse(f.crashed.since || "")) ? dateStamp(Date.parse(f.crashed.since)) : dateStamp(f.nowMs)) : null;
  if (f.running) {
    const since = Date.parse(f.lock?.startedAt || "");
    title = L.running(Number.isFinite(since) ? fmtTime(since) : null, f.task ? clean(f.task, 40) : null);
    tile = L.tileRunning;
  } else if (f.crashed) {
    status = "block";
    title = L.crashed;
  } else if (hard.length) {
    status = "block";
    title = L.wontStart(clean(L.blocker(hard[0], startT), 90));
  } else if (soft.length) {
    status = "wait";
    title = L.mayNot(clean(L.blocker(soft[0], startT), 90));
  } else if (f.weekWait) {
    // неделя у порога, а сброс вскоре после старта — раннер подождёт его (decideStart: wait), а не пропустит ночь
    title = L.readyWait(fmtTime(f.weekWait.untilMs));
    tile = fmtTime(f.weekWait.untilMs);
  } else {
    title = L.ready(startT);
  }
  if (!f.running && f.blockers.some((b) => b.id === "tamper")) status = "block";
  if (f.broken.length && status === "ok") status = "unknown";
  out.push(`${title} | status=${status} tile=${q(tile)} sfimage=moon.stars`);
  out.push("---");

  // карточки-цифры страницы плагина (Panel.dc.html): следующий запуск, план, квота недели
  {
    const planN = f.plan ? f.plan.sections.reduce((a, s) => a + s.tasks.length, 0) : null;
    const key = f.running ? "running" : f.crashed ? "crashed" : hard.length ? "blocked" : soft.length ? "maybe" : "ready";
    const color = status === "block" ? "red" : status === "wait" ? "orange" : "green";
    out.push(`${f.running ? L.tileRunning : f.weekWait && !f.crashed && !hard.length ? fmtTime(f.weekWait.untilMs) : startT} | stat=${q(L.stStart)} note=${q(L.stNote[key])} color=${color}`);
    const held = (f.held || []).length;
    out.push(`${planN === null ? "—" : L.stPlan(planN)} | stat=${q(L.stPlanTitle)} note=${q(planN === null ? L.stNoPlan : held ? L.stHeld(held) : L.stNoHeld)}`);
    const skip = f.usage?.skip_seven_day_pct ?? USAGE_DEFAULTS.skip_seven_day_pct;
    if (Number.isFinite(f.week)) {
      out.push(`${Math.round(f.week)}% | stat=${q(L.stWeek)} note=${q(L.stWeekNote(skip))}${f.week >= skip ? " color=orange" : ""}`);
    } else if (f.quota) out.push(`— | stat=${q(L.stWeek)} note=${q(L.stWeekOff)} color=gray`);
    out.push("---");
    out.push(...budgetLines(f, startMs, L, lang));
  }

  if (f.broken.length) {
    out.push(`${L.broken} | status=unknown event=source-broken sfimage=exclamationmark.triangle`);
    out.push(`--${clean(f.broken.map((x) => (typeof x === "string" ? x : L.brokenItem(x))).join("; "), 160)}`);
  }
  if (f.crashed) {
    out.push(`${L.crashLine(L.stamp(crashStamp))} | status=block event=runner-crashed:${crashStamp} sfimage=exclamationmark.octagon color=red`);
    if (f.lock?.pid) {
      out.push(`--${L.detailsTitle} | details=true`);
      out.push(`----${L.lockPid(f.lock.pid)}`);
    }
  }

  // управление идущей ночью — объявленные действия (подтверждает ядро; факты действие проверит само)
  if (f.running) {
    out.push(`${L.stop} | action=stop sfimage=stop.circle`);
    if (f.task && argOk(f.task)) out.push(`${L.skipTask(f.task)} | action=skip arg=${f.task} sfimage=forward.end`);
  }

  // блокеры
  if (f.blockers.length) {
    out.push(`${L.blockers(f.blockers.length)} | sfimage=hand.raised`);
    for (const b of f.blockers) {
      out.push(`--${clean(L.blocker(b, startT), 140)} | status=${b.soft ? "wait" : "block"} event=${b.event}${fileEffect(b.path)}`);
      const d = L.blockerDetail(b);
      // номер процесса — во второй уровень; пояснение маркера подмены — на виду
      if (d && b.kind === "unity") out.push(`----${L.detailsTitle} | details=true`, `------${clean(d, 140)}`);
      else if (d) out.push(`----${clean(d, 140)}`);
    }
  } else out.push(`${L.noBlockers} | sfimage=checkmark.circle`);

  // замок
  if (f.lock) {
    const since = Date.parse(f.lock.startedAt || "");
    const when = Number.isFinite(since) ? L.dt(since) : "?";
    const holder = !f.running ? f.lock.command || f.lock.holder : null;
    if (f.lock.alive === false) out.push(`${L.lockStale(when)} | sfimage=lock.open`);
    else if (holder) out.push(`${L.lockHeld(clean(holder, 30), when)} | sfimage=lock`);
    else out.push(`${L.lockNight(when, f.task ? clean(f.task, 40) : null)} | sfimage=lock`);
    out.push(`--${L.detailsTitle} | details=true`);
    out.push(`----${L.lockPid(f.lock.pid)}`);
  } else out.push(`${L.noLock(L.dt(startMs))} | sfimage=clock`);

  // последняя ночь и итоги
  const last = f.summaries.find((s) => s.ok);
  if (last) {
    out.push(`${L.lastNight(L.stamp(last.stamp), last.tasks, last.prs ?? 0, clean(last.stop, 80))} |${fileEffect(last.path)} sfimage=doc.text`);
    const today = dateStamp(f.nowMs);
    // живость замка неизвестна (ps не ответил) — считаем, что ночь может идти: «прогон не завершён» сводки
    // раннер пишет уже на старте, и ложный night-done занял бы ключ настоящего итога
    if (!f.running && last.stamp === today && !(f.lock && f.lock.alive !== false)) {
      out.push(`--${L.nightDone(L.stamp(last.stamp))} | event=night-done:${last.stamp}`);
      if (/инфраструктурн\S* провал\S* подряд/.test(last.stop || "")) out.push(`--${L.infra(clean(last.stop, 80))} | status=block event=infra-failures:${last.stamp}`);
    }
  }
  // лента «Последние ночи» (strip=true): старые слева, ячейка — дата, итог, щелчок открывает сводку
  if (f.summaries.length) {
    out.push(`${L.history} | strip=true sfimage=calendar`);
    for (const s of [...f.summaries].slice(0, 7).reverse()) {
      if (s.ok) {
        const ok = (s.tasks || 0) > 0;
        out.push(`--${L.stamp(s.stamp)} | note=${q(L.stripNote(s.tasks, s.prs ?? 0))} tooltip=${q(L.histLine(L.stamp(s.stamp), s.range, s.tasks, s.prs ?? 0, clean(s.stop, 90)))} sfimage=${ok ? "checkmark.circle.fill" : "minus.circle.fill"} color=${ok ? "green" : "gray"}${fileEffect(s.path)}`);
      } else out.push(`--${L.stamp(s.stamp)} | note=${q(L.stripBad)} sfimage=xmark.circle.fill color=red${fileEffect(s.path)}`);
    }
  }

  out.push("---");
  // очередь: план по dry-run
  if (f.plan) {
    const n = f.plan.sections.reduce((a, s) => a + s.tasks.length, 0);
    const age = f.plan.asOf ? f.nowMs - f.plan.asOf : null;
    const stale = age !== null && age > PLAN_STALE_MS;
    const asOf = f.plan.asOf ? L.planAsOf(L.dt(f.plan.asOf), fmtAgo(age, lang)) : null;
    const why = !n && f.plan.stop ? ` · ${clean(f.plan.stop, 70)}` : "";
    out.push(`${L.plan(n, asOf, stale, why)} |${fileEffect(f.plan.path)} sfimage=list.bullet${stale ? " color=gray" : ""}`);
    const many = f.plan.sections.length > 1;
    for (const s of f.plan.sections) {
      if (many) out.push(`--${s.title} (${s.tasks.length}) | sfimage=folder`);
      for (const t of s.tasks.slice(0, 30)) {
        const href = t.url && /^https:\/\//.test(t.url) && !/\s/.test(t.url) ? ` href=${q(t.url)}` : "";
        const lvl = many ? "----" : "--";
        out.push(`${lvl}${t.name} |${href}`);
        const id = t.id || taskIdFromUrl(t.url);
        if (id && argOk(id)) {
          out.push(`${lvl}--${L.skipTonight} | action=skip arg=${id} sfimage=forward.end`);
          // днём, без замка: одна задача без пуша (подтверждение с ценой)
          if (!f.lock || f.lock.alive === false) out.push(`${lvl}--${L.runNow} | action=run arg=${id} sfimage=play.circle`);
        }
      }
    }
    if (f.plan.skipped) out.push(`--${L.filtered(f.plan.skipped)}`);
  } else out.push(`${L.noPlan} | sfimage=list.bullet color=gray`);

  // очередь: отложенные
  out.push(`${L.held(f.held.length, f.retry.length, f.heldAsOf ? L.dt(f.heldAsOf) : null)} | sfimage=pause.circle`);
  for (const h of f.held.slice(0, 30)) out.push(`--${L.heldLine(h, h.date ? L.stamp(h.date) : null)}`);
  for (const h of f.retry.slice(0, 30)) out.push(`--${L.retryLine(h, MAX_RETRIES)}`);

  out.push("---");
  out.push(`${L.sourceTitle} | color=gray size=11`);
  for (const n of f.notes) out.push(`--${clean(typeof n === "string" ? n : L.note(n), 140)} | color=gray`);
  out.push(`--${L.source(f.mode === "status")} | color=gray size=11`);
  return out.join("\n") + "\n";
}

// ---------- действия (запускает ядро после подтверждения в приложении) ----------

// Каталоги раннера и state_dir — как в collect (настройки плагина, config.json раннера).
export function resolveDirs({ home = homedir(), settings = pluginSettings() } = {}) {
  const runnerDir = expand(settings.runnerDir || "~/Projects/IT/night-runner", home);
  let stateDir = expand("~/.claude/task-runs/night", home);
  try {
    const c = parseRunnerConfig(readJson(join(runnerDir, "config.json")), home);
    if (c.ok) stateDir = c.stateDir;
  } catch {}
  if (settings.stateDir) stateDir = expand(settings.stateDir, home);
  return { runnerDir, stateDir };
}

// Держатель замка по таблице процессов. → { state: "none"|"alive"|"stale"|"unknown"|"broken", pid?, command?, holder? }
export async function lockState(stateDir) {
  const lock = readLock(stateDir);
  if (!lock) return { state: "none" };
  if (lock.broken) return { state: "broken" };
  const ps = await run(bin("ps", "/bin/ps"), ["-axww", "-o", "pid=,ppid=,command="]);
  if (ps.code !== 0) return { state: "unknown", pid: lock.pid, command: lock.command };
  const holder = parsePs(ps.stdout).find((p) => p.pid === lock.pid && p.cmd.includes("night-run.mjs"));
  if (!holder) return { state: "stale", pid: lock.pid, command: lock.command };
  return { state: "alive", pid: lock.pid, command: lock.command, holder: holderSubcommand(holder.cmd) };
}

function isDir(p) {
  return Boolean(tryStat(p)?.isDirectory());
}

// Стоп-файл: 0600, «wx» — существующий не трогаем. → { ok, reason?, created? }
function writeStopFile(path, extra) {
  try {
    writeFileSync(path, JSON.stringify({ by: "agent-hub", at: new Date().toISOString(), ...extra }) + "\n", { mode: 0o600, flag: "wx" });
    return { ok: true, created: true };
  } catch (e) {
    if (e.code === "EEXIST") return { ok: true, created: false };
    return { ok: false, reason: "write-failed" };
  }
}

// stop: STOP в state_dir, только если замок держит идущая ночь (command null|run, подкоманда держателя run|нет).
export async function actionStop({ settings = pluginSettings(), home = homedir() } = {}) {
  if (settings.stopFiles !== true) return { ok: false, reason: "runner-patch-required" };
  const { stateDir } = resolveDirs({ home, settings });
  if (!isDir(stateDir)) return { ok: false, reason: "no-state-dir" };
  const lock = await lockState(stateDir);
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  if (lock.state !== "alive" || !isNightLock(lock.command, lock.holder)) return { ok: false, reason: "night-not-running" };
  return writeStopFile(join(stateDir, "STOP"), { nightPid: lock.pid });
}

// skip <taskId>: SKIP-<taskId> в state_dir; ночь может и не идти — пропуск ставится на ближайшую.
export async function actionSkip(taskId, { settings = pluginSettings(), home = homedir() } = {}) {
  if (!argOk(taskId)) return { ok: false, reason: "bad-task" };
  if (settings.stopFiles !== true) return { ok: false, reason: "runner-patch-required" };
  const { stateDir } = resolveDirs({ home, settings });
  if (!isDir(stateDir)) return { ok: false, reason: "no-state-dir" };
  return writeStopFile(join(stateDir, `SKIP-${taskId}`), { taskId });
}

// Проект задачи для `--task <проект>:<id>`: раннер принимает голый id, только когда включён ровно один проект.
// Ищем задачу в разделах последнего плана dry-run (заголовок раздела — title или id проекта из config.json
// раннера). → { ref } | { reason }
export function taskRef(taskId, { runnerDir, stateDir, home = homedir() }) {
  let cfg = null;
  try {
    cfg = parseRunnerConfig(readJson(join(runnerDir, "config.json")), home);
  } catch {}
  if (!cfg?.ok) return { reason: "no-runner-config" };
  const hits = new Set();
  const dry = listSummaries(stateDir, { dry: true, n: 1 })[0];
  if (dry) {
    let p = { ok: false };
    try {
      p = parseDryPlan(readFileSync(dry.path, "utf8"));
    } catch {}
    for (const sec of p.ok ? p.sections : []) {
      if (!sec.tasks.some((t) => (t.id || taskIdFromUrl(t.url)) === taskId)) continue;
      const proj = cfg.projects.find((x) => x.id === sec.title) || cfg.projects.find((x) => x.title && clean(x.title, 60) === sec.title);
      hits.add(proj ? proj.id : null);
    }
  }
  if (hits.has(null)) return { reason: "unknown-project" };
  if (hits.size > 1) return { reason: "ambiguous-task" };
  if (hits.size === 1) {
    const project = [...hits][0];
    return PROJECT_ID.test(project) ? { ref: `${project}:${taskId}` } : { reason: "unknown-project" };
  }
  // в плане задачи нет: голый id раннер примет только при одном включённом проекте
  const enabled = cfg.projects.filter((x) => x.enabled);
  if (enabled.length === 1 && PROJECT_ID.test(enabled[0].id)) return { ref: `${enabled[0].id}:${taskId}` };
  return { reason: "unknown-project" };
}

// run <taskId>: `node night-run.mjs run --task <проект>:<id> --no-push` отдельным процессом (detached), вывод — в
// лог 0600 в каталоге данных плагина. Только без живого замка (ночь или другая команда раннера идёт — отказ).
export async function actionRun(taskId, { settings = pluginSettings(), home = homedir(), dataDir = process.env.AGENTHUB_PLUGIN_DATA_PATH } = {}) {
  if (!argOk(taskId)) return { ok: false, reason: "bad-task" };
  const { runnerDir, stateDir } = resolveDirs({ home, settings });
  if (!existsSync(join(runnerDir, "night-run.mjs"))) return { ok: false, reason: "no-runner" };
  const lock = await lockState(stateDir);
  if (lock.state === "alive") return { ok: false, reason: "night-lock" };
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  const t = taskRef(taskId, { runnerDir, stateDir, home });
  if (t.reason) return { ok: false, reason: t.reason };
  const node = bin("node", process.execPath);
  const env = { HOME: home, PATH: process.env.PATH || "/usr/bin:/bin" };
  for (const k of ["USER", "LOGNAME", "LANG", "TMPDIR"]) if (process.env[k]) env[k] = process.env[k];
  let fd = "ignore";
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fd = openSync(join(dataDir, `runner-${new Date().toISOString().replace(/[:.]/g, "-")}.log`), "a", 0o600);
  }
  return new Promise((resolve) => {
    let child;
    const done = (r) => {
      if (typeof fd === "number") closeSync(fd);
      resolve(r);
    };
    try {
      child = spawn(node, ["night-run.mjs", "run", "--task", t.ref, "--no-push"], { cwd: runnerDir, env, detached: true, stdio: ["ignore", fd, fd] });
    } catch {
      return done({ ok: false, reason: "spawn-failed" });
    }
    child.once("spawn", () => {
      child.unref();
      done({ ok: true, pid: child.pid });
    });
    child.once("error", () => done({ ok: false, reason: "spawn-failed" }));
  });
}

// `--action <id> [<taskId>]` → код выхода 0 / 3 и строка reason=<код> (ядро передаёт её оболочке).
export async function runAction(argv) {
  const [id, arg] = argv;
  const r = id === "stop" ? await actionStop() : id === "skip" ? await actionSkip(arg) : id === "run" ? await actionRun(arg) : { ok: false, reason: "unknown-action" };
  process.stdout.write(r.ok ? "ok\n" : `reason=${r.reason}\n`);
  process.exitCode = r.ok ? 0 : 3;
}

async function main() {
  const ai = process.argv.indexOf("--action");
  if (ai >= 2) return runAction(process.argv.slice(ai + 1));
  const now = process.env.AGENTHUB_TEST_NOW ? Date.parse(process.env.AGENTHUB_TEST_NOW) : Date.now();
  let text;
  try {
    text = render(await collect({ nowMs: now }));
  } catch (e) {
    text = `${T[envLang()].pluginError} | status=unknown\n---\n${clean(e?.message || e, 140)} | event=source-broken\n`;
  }
  process.stdout.write(text);
}

// Запуск как программы (не импорт из тестов). realpath: node отдаёт import.meta.url уже без symlink.
function isMain() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) main();
