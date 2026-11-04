#!/usr/bin/env node
// Ночной раннер: идёт ли ночь, блокеры, очередь двумя слоями, итоги ночей.
//
// <agenthub.title>Ночной раннер</agenthub.title>
// <agenthub.version>0.2.1</agenthub.version>
// <agenthub.author.github>kensei</agenthub.author.github>
// <agenthub.desc>Ночь: замок, блокеры (Unity на night-worktree, маркер подмены, питание, квота, задание launchd), очередь по dry-run и «держатся», итоги ночей</agenthub.desc>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.watch>~/.claude/task-runs/night — замок и сводки появляются здесь</agenthub.watch>
// <agenthub.fsRead>~/Projects/IT/night-runner/config.json — state_dir, время старта, проекты и их night-worktree</agenthub.fsRead>
// <agenthub.fsRead>~/Projects/IT/night-runner/night-run.mjs — только список команд: есть ли уже status/queue --json</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/task-runs/night — night.lock, маркер подмены, сводки YYYYMMDD.md, планы .dry.md, маркеры попыток, хвост night.log (id текущей задачи)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/cache/kensei-statusline/usage.json — недельная квота: ночь пропустит при ≥ skip_seven_day_pct</agenthub.fsRead>
// <agenthub.fsRead>~/Library/LaunchAgents/com.kensei.night-runner.plist — не снято ли задание launchd</agenthub.fsRead>
// <agenthub.exec>/bin/ps -axww -o pid=,ppid=,command= — Unity на night-worktree и жив ли держатель замка</agenthub.exec>
// <agenthub.exec>/usr/bin/pmset -g batt — питание от сети (ночь по расписанию на батарее не стартует)</agenthub.exec>
// <agenthub.exec>node night-run.mjs status --json / queue --json — когда раннер их получит (этап 1); до тех пор не запускается</agenthub.exec>
// <agenthub.exec>node night-run.mjs run --task <проект>:<id> --no-push — действие run: одна задача днём без пуша, только без живого замка</agenthub.exec>
// <agenthub.fsWrite>~/.claude/task-runs/night/STOP — действие stop: мягкая остановка ночи между задачами (после патча раннера)</agenthub.fsWrite>
// <agenthub.fsWrite>~/.claude/task-runs/night/SKIP-* — действие skip: пропустить задачу в ночи (после патча раннера)</agenthub.fsWrite>
// <agenthub.effects>open.file,open.url</agenthub.effects>
// <agenthub.action id="stop" level="confirm" title="Остановить ночь после текущей задачи">night-runner.30s.mjs --action stop</agenthub.action>
// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Пропустить в ночи задачу">night-runner.30s.mjs --action skip {taskId}</agenthub.action>
// <agenthub.action id="run" level="confirm-cost" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Запустить днём без пуша задачу" cost="расход квоты Claude на задачу целиком">night-runner.30s.mjs --action run {taskId}</agenthub.action>
// <agenthub.push key="unity-open" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="launchd-missing" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="quota-skip" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="power" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="night-done">Ночь закончилась</agenthub.push>
// <agenthub.push key="runner-crashed" quiet="true">Раннер упал</agenthub.push>
// <agenthub.push key="tamper" quiet="true">Маркер подмены</agenthub.push>
// <agenthub.push key="infra-failures">Инфраструктурные провалы подряд</agenthub.push>
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
export function fmtAgo(ms) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
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

// → { ok, stateDir, start, usage, projects:[{id, title, enabled, worktree, unityDir}], problem? }
export function parseRunnerConfig(raw, home = homedir()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problem: "config.json раннера: не объект" };
  const stateDir = expand(typeof raw.state_dir === "string" ? raw.state_dir : "~/.claude/task-runs/night", home);
  const start = typeof raw.schedule?.start === "string" && /^\d{1,2}:\d{2}$/.test(raw.schedule.start) ? raw.schedule.start : "04:30";
  const usage = { ...USAGE_DEFAULTS, ...(raw.usage && typeof raw.usage === "object" ? raw.usage : {}) };
  let list = raw.projects;
  if (list === undefined && typeof raw.worktree === "string") {
    // конфиг v1: один проект PerfectWar (night-runner/lib/config.mjs, upgradeV1)
    list = [{ id: "perfectwar", worktree: raw.worktree, profile: { type: "unity", project_path: "Client/PerfectWar" } }];
  }
  if (!Array.isArray(list)) return { ok: false, problem: "config.json раннера: нет списка projects" };
  const projects = [];
  for (const p of list) {
    if (!p || typeof p !== "object" || typeof p.id !== "string") return { ok: false, problem: "config.json раннера: проект без id" };
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
  return { ok: true, stateDir, start, usage, projects };
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
    return { path, text: "не читается" };
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
    else if (/^квота/.test(part)) out.quota = clean(part, 80);
  }
  if (out.tasks === null || out.stop === null) return { ok: false };
  return out;
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

// ---------- квота и питание ----------

export function weeklyPct(usageJson) {
  const rows = Array.isArray(usageJson?.rows) ? usageJson.rows : [];
  const row = rows.find((r) => r && r.kind === "weekly_all" && typeof r.percent === "number");
  return row ? row.percent : null;
}

export function parsePower(text) {
  if (text.includes("AC Power")) return true;
  if (text.includes("Battery Power")) return false;
  return null;
}

// Время ближайшего старта ночи (локальное).
export function nextStart(start, nowMs) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(nowMs);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= nowMs) d.setTime(d.getTime() + DAY_MS);
  return d.getTime();
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

export async function collect({ home = homedir(), nowMs = Date.now(), settings = pluginSettings() } = {}) {
  const facts = { nowMs, broken: [], notes: [], blockers: [], mode: "files" };
  const runnerDir = expand(settings.runnerDir || "~/Projects/IT/night-runner", home);
  facts.runnerDir = runnerDir;
  // конфиг раннера
  let cfg = { ok: true, stateDir: expand("~/.claude/task-runs/night", home), start: "04:30", usage: { ...USAGE_DEFAULTS }, projects: [] };
  const cfgPath = join(runnerDir, "config.json");
  if (existsSync(cfgPath)) {
    let raw = null;
    try {
      raw = readJson(cfgPath);
    } catch {
      facts.broken.push("config.json раннера не разобран");
    }
    if (raw) {
      const c = parseRunnerConfig(raw, home);
      if (c.ok) cfg = c;
      else facts.broken.push(c.problem);
    }
  } else facts.notes.push("config.json раннера не найден — state_dir по умолчанию");
  if (settings.stateDir) cfg.stateDir = expand(settings.stateDir, home);
  facts.cfg = cfg;
  const stateDir = cfg.stateDir;

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
  if (!procs) facts.broken.push("ps не ответил");
  const status = statusJ ? adaptStatus(statusJ) : null;
  const queue = queueJ ? adaptQueue(queueJ) : null;
  if (commands.includes("status") && !status) facts.notes.push("status --json: нет ответа или незнакомая форма — читаю файлы");
  if (commands.includes("queue") && !queue) facts.notes.push("queue --json: нет ответа или незнакомая форма — читаю файлы");
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
      facts.notes.push("night.lock не разобран (раннер сочтёт его протухшим)");
      facts.lock = null;
    } else facts.lock = lock;
    facts.running = false;
    if (facts.lock && procs) {
      const holder = procs.find((p) => p.pid === facts.lock.pid && p.cmd.includes("night-run.mjs"));
      facts.lock.alive = Boolean(holder);
      facts.lock.holder = holder ? holderSubcommand(holder.cmd) : null;
      facts.running = Boolean(holder) && isNightLock(facts.lock.command, facts.lock.holder);
      // держателя нет, а замок ночи остался — раннер упал посреди ночи
      if (!holder && isNightLock(facts.lock.command, null)) facts.crashed = { since: facts.lock.startedAt };
    }
    if (facts.running) {
      const log = latestRunLog(stateDir, nowMs);
      facts.task = log ? currentTaskFromLog(tail(log)) : null;
    }
  }

  // блокеры
  const tamper = status ? (status.tamper ? { text: status.tamper, path: join(stateDir, TAMPER_FILE) } : null) : readTamper(stateDir);
  if (tamper) facts.blockers.push({ id: "tamper", event: "tamper", text: `маркер подмены: ${tamper.text}`, path: tamper.path });
  if (status) {
    for (const b of status.blockers) if (b.id !== "tamper") facts.blockers.push({ id: b.id, event: b.id, text: b.text });
  } else {
    if (procs) {
      for (const p of cfg.projects.filter((x) => x.enabled && x.unityDir)) {
        const pid = liveEditor(procs, p.unityDir);
        if (pid) facts.blockers.push({ id: `unity:${p.id}`, event: `unity-open:${p.id}`, text: `на night-worktree ${p.id} открыт редактор Unity (pid ${pid})` });
      }
    }
    const ac = power.code === 0 ? parsePower(power.stdout) : null;
    if (ac === false) facts.blockers.push({ id: "power", event: "power", text: "не на питании от сети — ночь по расписанию не стартует", soft: true });
    const plist = join(home, "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    if (!existsSync(plist)) facts.blockers.push({ id: "launchd", event: "launchd-missing", text: "задание launchd снято — ночь не запустится сама" });
    const usagePath = join(home, ".claude/cache/kensei-statusline/usage.json");
    try {
      const week = weeklyPct(readJson(usagePath));
      if (week !== null && week >= cfg.usage.skip_seven_day_pct) {
        facts.blockers.push({ id: "quota", event: "quota-skip", text: `недельная квота ${Math.round(week)}% ≥ ${cfg.usage.skip_seven_day_pct}% — ночь пропустит` });
      }
    } catch {}
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
  if (facts.summaries.length && !facts.summaries[0].ok) facts.broken.push(`сводка ${facts.summaries[0].stamp}.md: незнакомая форма`);
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
      else facts.broken.push(`${dry.stamp}.dry.md: незнакомая форма`);
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
    if (broken) facts.notes.push(`маркеров попыток не разобрано: ${broken}`);
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

export function render(f) {
  const out = [];
  const hard = f.blockers.filter((b) => !b.soft);
  const soft = f.blockers.filter((b) => b.soft);
  const startMs = nextStart(f.cfg.start, f.nowMs);
  let status = "ok";
  let title;
  const crashStamp = f.crashed ? f.crashed.stamp || (Number.isFinite(Date.parse(f.crashed.since || "")) ? dateStamp(Date.parse(f.crashed.since)) : dateStamp(f.nowMs)) : null;
  if (f.running) {
    const since = Date.parse(f.lock?.startedAt || "");
    title = `Ночь идёт${Number.isFinite(since) ? ` с ${fmtTime(since)}` : ""}${f.task ? ` · задача ${clean(f.task, 40)}` : ""}`;
  } else if (f.crashed) {
    status = "block";
    title = `Ночь: раннер упал${f.lock?.pid ? ` (pid ${f.lock.pid})` : ""}`;
  } else if (hard.length) {
    status = "block";
    title = `Ночь: ${hard.length} ${plural(hard.length, "блокер", "блокера", "блокеров")} · ${clean(hard[0].text, 70)}`;
  } else if (soft.length) {
    status = "wait";
    title = `Ночь: ${clean(soft[0].text, 80)}`;
  } else {
    title = `Ночь: готова · старт ${fmtTime(startMs)}`;
  }
  if (!f.running && f.blockers.some((b) => b.id === "tamper")) status = "block";
  if (f.broken.length && status === "ok") status = "unknown";
  out.push(`${title} | status=${status} sfimage=moon.stars`);
  out.push("---");

  if (f.broken.length) {
    out.push(`Источник сломался: ${clean(f.broken.join("; "), 160)} | status=unknown event=source-broken sfimage=exclamationmark.triangle`);
  }
  if (f.crashed) {
    out.push(`Раннер упал посреди ночи ${stampLabel(crashStamp)} — разберите night.log | status=block event=runner-crashed:${crashStamp} sfimage=exclamationmark.octagon color=red`);
  }

  // управление идущей ночью — объявленные действия (подтверждает ядро; факты действие проверит само)
  if (f.running) {
    out.push(`Остановить ночь после текущей задачи | action=stop sfimage=stop.circle`);
    if (f.task && argOk(f.task)) out.push(`Пропустить задачу ${f.task} | action=skip arg=${f.task} sfimage=forward.end`);
  }

  // блокеры
  if (f.blockers.length) {
    out.push(`Блокеры (${f.blockers.length}) | sfimage=hand.raised`);
    for (const b of f.blockers) out.push(`--${clean(b.text, 140)} | status=${b.soft ? "wait" : "block"} event=${b.event}${fileEffect(b.path)}`);
  } else out.push("Блокеров нет | sfimage=checkmark.circle");

  // замок
  if (f.lock) {
    const since = Date.parse(f.lock.startedAt || "");
    const when = Number.isFinite(since) ? fmtDateTime(since) : "?";
    const holder = !f.running ? f.lock.command || f.lock.holder : null;
    if (f.lock.alive === false) out.push(`Замок протух: pid ${f.lock.pid} от ${when} (раннер снимет сам) | sfimage=lock.open`);
    else if (holder) out.push(`Замок держит «${clean(holder, 30)}», pid ${f.lock.pid} с ${when} | sfimage=lock`);
    else out.push(`Замок ночи: pid ${f.lock.pid} с ${when}${f.task ? ` · задача ${clean(f.task, 40)}` : ""} | sfimage=lock`);
  } else out.push(`Замка нет · следующий старт ${fmtDateTime(startMs)} | sfimage=clock`);

  // последняя ночь и итоги
  const last = f.summaries.find((s) => s.ok);
  if (last) {
    out.push(`Последняя ночь ${stampLabel(last.stamp)}: задач ${last.tasks}, PR ${last.prs ?? 0} · ${clean(last.stop, 80)} |${fileEffect(last.path)} sfimage=doc.text`);
    const today = dateStamp(f.nowMs);
    if (!f.running && last.stamp === today && !(f.lock && f.lock.alive)) {
      out.push(`--Итог ночи ${stampLabel(last.stamp)} готов | event=night-done:${last.stamp}`);
      if (/инфраструктурн\S* провал\S* подряд/.test(last.stop || "")) out.push(`--Ночь остановлена: ${clean(last.stop, 80)} | status=block event=infra-failures:${last.stamp}`);
    }
  }
  if (f.summaries.length) {
    out.push("Итоги ночей | sfimage=calendar");
    for (const s of f.summaries) {
      if (s.ok) out.push(`--${stampLabel(s.stamp)}${s.range ? ` ${s.range}` : ""}: задач ${s.tasks}, PR ${s.prs ?? 0} · ${clean(s.stop, 90)} |${fileEffect(s.path)}`);
      else out.push(`--${stampLabel(s.stamp)}: сводка не разобрана |${fileEffect(s.path)}`);
    }
  }

  out.push("---");
  // очередь: план по dry-run
  if (f.plan) {
    const n = f.plan.sections.reduce((a, s) => a + s.tasks.length, 0);
    const age = f.plan.asOf ? f.nowMs - f.plan.asOf : null;
    const stale = age !== null && age > PLAN_STALE_MS;
    const asOf = f.plan.asOf ? `от ${fmtDateTime(f.plan.asOf)}, ${fmtAgo(age)}` : "время неизвестно";
    const why = !n && f.plan.stop ? ` · ${clean(f.plan.stop, 70)}` : "";
    out.push(`План по dry-run: ${n} ${plural(n, "задача", "задачи", "задач")} (${asOf}${stale ? ", устарел" : ""})${why} |${fileEffect(f.plan.path)} sfimage=list.bullet${stale ? " color=gray" : ""}`);
    const many = f.plan.sections.length > 1;
    for (const s of f.plan.sections) {
      if (many) out.push(`--${s.title} (${s.tasks.length}) | sfimage=folder`);
      for (const t of s.tasks.slice(0, 30)) {
        const href = t.url && /^https:\/\//.test(t.url) && !/\s/.test(t.url) ? ` href=${q(t.url)}` : "";
        const lvl = many ? "----" : "--";
        out.push(`${lvl}${t.name} |${href}`);
        const id = t.id || taskIdFromUrl(t.url);
        if (id && argOk(id)) {
          out.push(`${lvl}--Пропустить в ночи | action=skip arg=${id} sfimage=forward.end`);
          // днём, без замка: одна задача без пуша (подтверждение с ценой)
          if (!f.lock || f.lock.alive === false) out.push(`${lvl}--Запустить днём без пуша | action=run arg=${id} sfimage=play.circle`);
        }
      }
    }
    if (f.plan.skipped) out.push(`--пропущено по фильтрам: ${f.plan.skipped}`);
  } else out.push("План по dry-run: нет | sfimage=list.bullet color=gray");

  // очередь: держатся
  const heldAge = f.heldAsOf ? ` (маркеры на ${fmtDateTime(f.heldAsOf)})` : "";
  out.push(`Держатся: ${f.held.length}${f.retry.length ? ` · на повторе ${f.retry.length}` : ""}${heldAge} | sfimage=pause.circle`);
  for (const h of f.held.slice(0, 30)) out.push(`--${h.id} · ${h.outcome}${h.date ? ` · ${stampLabel(h.date)}` : ""}${h.draft ? " · вопросы не отправлены" : ""}`);
  for (const h of f.retry.slice(0, 30)) out.push(`--${h.id} · повтор ${h.retries}/${MAX_RETRIES} · ${h.outcome}`);

  if (f.notes.length) {
    out.push("---");
    for (const n of f.notes) out.push(`${clean(n, 140)} | color=gray`);
  }
  out.push(`Источник: ${f.mode === "status" ? "night-run.mjs status --json" : "файлы раннера (status --json ещё нет)"} | color=gray size=11`);
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
    text = `Ночь: ошибка плагина | status=unknown\n---\n${clean(e?.message || e, 140)} | event=source-broken\n`;
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
