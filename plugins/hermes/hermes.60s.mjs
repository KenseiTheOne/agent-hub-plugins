#!/usr/bin/env node
// <agenthub.title>Hermes</agenthub.title>
// <agenthub.version>1.3.2</agenthub.version>
// <agenthub.contract>2</agenthub.contract>
// <agenthub.icon symbol="alarm" color="#30D158"></agenthub.icon>
// <agenthub.desc>Задачи Hermes по расписанию: что упало, что подорожало, отвечает ли служба Hermes и не на паузе ли он</agenthub.desc>
// <agenthub.desc lang="en">Hermes scheduled jobs: what failed, what got costly, whether the Hermes service responds and whether it is paused</agenthub.desc>
// <agenthub.status value="ok" label="Задачи по расписанию">Hermes работает, задачи идут по расписанию</agenthub.status>
// <agenthub.status value="ok" lang="en" label="On schedule">Hermes is up and jobs run on schedule</agenthub.status>
// <agenthub.status value="wait" label="Пауза или дорогая задача">Hermes на паузе или задача потратила вдвое больше обычного</agenthub.status>
// <agenthub.status value="wait" lang="en" label="Paused or costly run">Hermes is paused or a job used twice the usual</agenthub.status>
// <agenthub.status value="error" label="Задача упала или Hermes не отвечает">Задача упала, расписание встало или служба Hermes молчит</agenthub.status>
// <agenthub.status value="error" lang="en" label="Job failed / not responding">A job failed, the schedule stopped or the Hermes service is silent</agenthub.status>
// <agenthub.status value="unknown" label="Нет данных Hermes">Hermes не установлен или его файлы не читаются</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="No Hermes data">Hermes isn't installed or its files can't be read</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.requires name="Hermes" url="https://github.com/NousResearch/hermes-agent" check="~/.hermes">агент с задачами по расписанию, которые показывает плагин: без него плагину нечего показывать</agenthub.requires>
// <agenthub.requires lang="en" name="Hermes">the agent whose scheduled jobs this plugin shows: without it there is nothing to show</agenthub.requires>
// <agenthub.fsRead>~/.hermes/gateway_state.json — запущена ли служба Hermes</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.hermes/gateway_state.json — whether the Hermes service is running</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/state/gateway.heartbeat — отвечает ли служба Hermes</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.hermes/state/gateway.heartbeat — whether the Hermes service is responding</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/cron, ~/.hermes/profiles/*/cron — задачи по расписанию: когда запускаются, чем закончились и сколько потратили</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.hermes/cron, ~/.hermes/profiles/*/cron — scheduled jobs: when they run, how they ended and what they spent</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/ESTOP, ~/.hermes/profiles/*/ESTOP — не поставлен ли на паузу весь Hermes или один его профиль</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.hermes/ESTOP, ~/.hermes/profiles/*/ESTOP — whether all of Hermes or one of its profiles is paused</agenthub.fsRead>
// <agenthub.exec>/usr/bin/sqlite3 -readonly -json …/executions.db — прочитать, чем закончились запуски задач (только чтение: база Hermes — без блокировок; пока рядом журнал WAL — копия базы с ним во временном каталоге плагина)</agenthub.exec>
// <agenthub.exec lang="en">/usr/bin/sqlite3 -readonly -json …/executions.db — read how job runs ended (read-only: Hermes's database without locks; while its WAL journal is there — a copy of both in the plugin's temp folder)</agenthub.exec>
// <agenthub.exec>/bin/ps -p <pid> — жив ли процесс службы Hermes</agenthub.exec>
// <agenthub.exec lang="en">/bin/ps -p <pid> — whether the Hermes service process is alive</agenthub.exec>
// <agenthub.exec>~/.local/bin/hermes [-p <profile>] cron pause|resume|run <job> — кнопки задачи «Пауза», «Возобновить», «Запустить сейчас»</agenthub.exec>
// <agenthub.exec lang="en">~/.local/bin/hermes [-p <profile>] cron pause|resume|run <job> — the job's Pause, Resume and Run now buttons</agenthub.exec>
// <agenthub.exec>~/.local/bin/hermes pause — кнопка «Поставить Hermes на паузу»</agenthub.exec>
// <agenthub.exec lang="en">~/.local/bin/hermes pause — the Pause Hermes button</agenthub.exec>
// <agenthub.effects>open.file</agenthub.effects>
// <agenthub.action id="cron-pause" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: поставить на паузу задачу" title-en="Hermes: pause job" cost="задача не запустится по расписанию до возобновления" cost-en="the job won't run on schedule until resumed">hermes.60s.mjs --action cron-pause {job}</agenthub.action>
// <agenthub.action id="cron-resume" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: возобновить задачу" title-en="Hermes: resume job" cost="задача снова будет запускаться по расписанию (расход квоты)" cost-en="the job runs on schedule again (uses quota)">hermes.60s.mjs --action cron-resume {job}</agenthub.action>
// <agenthub.action id="cron-run" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: запустить вне расписания задачу" title-en="Hermes: run job now" cost="внеочередной запуск задачи — расход квоты" cost-en="an extra run of the job — uses quota">hermes.60s.mjs --action cron-run {job}</agenthub.action>
// <agenthub.action id="pause" level="confirm" title="Поставить Hermes на паузу" title-en="Pause Hermes">hermes.60s.mjs --action pause</agenthub.action>
// <agenthub.push key="job-failed" kind="plugin" was="runs">Hermes: задача упала</agenthub.push>
// <agenthub.push key="job-costly" kind="plugin" was="runs">Hermes: задача потратила вдвое больше обычного</agenthub.push>
// <agenthub.push key="ticker-silent" kind="plugin" was="runs">Hermes: расписание остановилось</agenthub.push>
// <agenthub.push key="gateway-silent" kind="plugin" was="runs">Hermes: служба молчит</agenthub.push>
// <agenthub.push key="estop" kind="plugin" was="runs">Hermes на паузе</agenthub.push>
// <agenthub.push key="job-failed" lang="en">Hermes: job failed</agenthub.push>
// <agenthub.push key="job-costly" lang="en">Hermes: job used twice the usual</agenthub.push>
// <agenthub.push key="ticker-silent" lang="en">Hermes: schedule stopped</agenthub.push>
// <agenthub.push key="gateway-silent" lang="en">Hermes: service silent</agenthub.push>
// <agenthub.push key="estop" lang="en">Hermes is paused</agenthub.push>
//
// Official plugin of the agent-hub-plugins registry. Output is read-only. Pausing, resuming and running a job
// outside its schedule are declared actions: the confirmation and its text come from the core; the core checks
// the argument (the job id) against the pattern and passes it as a separate argv. The plugin checks the facts
// itself in `--action` mode (the job is in its profile's jobs.json, cron pause only when not paused, cron resume
// only when paused, pausing all of Hermes only without ESTOP in ~/.hermes); a refusal is exit code 3, a line
// `message=<explanation in the hub's language>` and, last, `reason=<code>` (contract 2: the plugin writes the
// explanation and the shell shows it as is — REFUSALS below). The "Pause Hermes" button is in the frame
// while there is no ~/.hermes/ESTOP; to lift the pause run `hermes resume` in a terminal (there is no action for it).
//
// ESTOP (Hermes agent/estop.py): `hermes pause` writes $HERMES_HOME/ESTOP. A profile's process checks its own
// HERMES_HOME and the root, so ~/.hermes/ESTOP pauses all of Hermes and profiles/<n>/ESTOP only profile <n>
// (lift it with `hermes -p <n> resume`). A profile's pause does not silence other profiles' scheduler alerts.
//
// What we read and what we don't:
//   jobs.json        — only id, name, schedule, enabled/state, last_status, failure_streak, run times.
//                      The prompt, origin, last_error/last_failure.detail fields are NOT read and not shown.
//   executions.db    — `-readonly` and `?immutable=1` (no locks and no writes to the Hermes folder), only job_id,
//                      status and times; the error column only as a has-error flag. Token columns are taken if
//                      they exist in the schema. The Hermes database is in WAL mode: with immutable the -wal file
//                      isn't read, and while Hermes holds a connection open, fresh runs (a failure included) live
//                      only there. So with a non-empty -wal a copy of the database together with -wal is read in a
//                      temp folder (the plugin's data folder or the system tmp), and the copy is deleted right after.
//   usage_audit.jsonl— only token counts, job_id, ts, duration_ms (that is where each run's usage is recorded).
//   Hermes secret and settings files, state.db, sessions/ — never (only the files listed above are read).
//
// Events (event=): job-failed-<id> (the last run failed), job-costly-<id> (the last run used
// twice the usual), gateway-silent (gateway declared running, but the heartbeat is old or there is no process),
// ticker-silent-<profile> (the cron scheduler isn't ticking), estop (Hermes is paused), source-broken.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GATEWAY_STALE_S = 180; // the heartbeat is written every 30 s
export const TICKER_STALE_S = 200; // as in Hermes: TICKER_INTERVAL_SECONDS * 3 + 20
export const COSTLY_FACTOR = 2;
export const COSTLY_MIN_SAMPLES = 3;
const AUDIT_TAIL_BYTES = 256 * 1024;

// ---------- output formatting ----------
export function clean(s) {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\|/g, "¦")
    .replace(/^[-\s]+/, "") // a leading `--` means nesting
    .replace(/^~~~$/, "~")
    .slice(0, 200);
}
export function q(v) {
  return `"${String(v).replace(/[\\"]/g, "\\$&")}"`;
}
function line(title, params = {}) {
  const ps = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${/^[\w.:/+-]+$/.test(String(v)) ? v : q(v)}`);
  return ps.length ? `${title} | ${ps.join(" ")}` : title;
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
}
// Language: AGENTHUB_LANG (ru | en) from the core; without the variable, ru.
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
let LANG = "ru";
const EN = () => LANG === "en";
export function fmtTokens(n) {
  if (EN()) return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} тыс`;
  return fmtInt(n);
}
function fmtAge(sec) {
  if (EN()) return sec < 90 ? `${Math.round(sec)} s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : sec < 172800 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} d ago`;
  if (sec < 90) return `${Math.round(sec)} с назад`;
  if (sec < 5400) return `${Math.round(sec / 60)} мин назад`;
  if (sec < 172800) return `${Math.round(sec / 3600)} ч назад`;
  return `${Math.round(sec / 86400)} дн назад`;
}
function fmtFor(sec) {
  const m = Math.max(1, Math.round(sec / 60));
  if (EN()) return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
  return m < 90 ? `${m} мин` : `${Math.round(m / 60)} ч`;
}
function fmtTime(iso, now) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const loc = EN() ? "en-US" : "ru-RU";
  const hm = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = d.toDateString() === new Date(now).toDateString();
  if (sameDay) return hm;
  return `${d.toLocaleDateString(loc, EN() ? { month: "short", day: "numeric" } : { day: "2-digit", month: "2-digit" })} ${hm}`;
}
const plEn = (n, one, other) => (n === 1 ? one : other);
const tr = (ru, en) => (EN() ? en : ru);

// Cron schedule → human wording for common forms; anything else → null (the raw string goes to "Details").
export function humanCron(expr) {
  const e = String(expr || "").trim();
  const p2 = (n) => String(n).padStart(2, "0");
  const DAYS = { ru: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
  let m;
  if ((m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(e)) && +m[1] < 60 && +m[2] < 24) return tr(`каждый день в ${p2(m[2])}:${p2(m[1])}`, `every day at ${p2(m[2])}:${p2(m[1])}`);
  if ((m = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/.exec(e)) && +m[1] < 60 && +m[2] < 24) return tr(`по будням в ${p2(m[2])}:${p2(m[1])}`, `on weekdays at ${p2(m[2])}:${p2(m[1])}`);
  if ((m = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6](?:,[0-6])*)$/.exec(e)) && +m[1] < 60 && +m[2] < 24) {
    const d = m[3].split(",").map((x) => DAYS[EN() ? "en" : "ru"][+x]).join(", ");
    return tr(`${d} в ${p2(m[2])}:${p2(m[1])}`, `${d} at ${p2(m[2])}:${p2(m[1])}`);
  }
  if ((m = /^\*\/(\d{1,2}) \* \* \* \*$/.exec(e))) return tr(`каждые ${+m[1]} мин`, `every ${+m[1]} min`);
  if ((m = /^(\d{1,2}) \* \* \* \*$/.exec(e)) && +m[1] < 60) return tr(`каждый час в :${p2(m[1])}`, `every hour at :${p2(m[1])}`);
  if ((m = /^every (\d+)\s*([mh])$/i.exec(e))) return tr(`каждые ${m[1]} ${m[2].toLowerCase() === "h" ? "ч" : "мин"}`, `every ${m[1]} ${m[2].toLowerCase() === "h" ? "h" : "min"}`);
  return null;
}

// ---------- reading sources ----------
// A broken source is reported as a code (render translates it via BROKEN_TEXT), not as a ready-made Russian string.
class Broken extends Error {
  constructor(kind, arg = "") {
    super(arg ? `${kind} ${arg}` : kind);
    this.kind = kind;
    this.arg = arg;
  }
}
const BROKEN_TEXT = {
  ru: { "not-json": "не JSON", "no-jobs": "нет массива jobs", "job-no-id": "задача без id", "no-column": (c) => `нет колонки ${c}`, "bad-row": "строка без job_id/status", "not-time": "не время", "no-gateway-state": "нет gateway_state" },
  en: { "not-json": "not JSON", "no-jobs": "no jobs array", "job-no-id": "a job without an id", "no-column": (c) => `no ${c} column`, "bad-row": "a row without job_id/status", "not-time": "not a timestamp", "no-gateway-state": "no gateway_state" },
};
export function brokenText(b, lang = "ru") {
  if (!b || typeof b !== "object") return String(b ?? "");
  const t = (BROKEN_TEXT[lang] || BROKEN_TEXT.ru)[b.kind];
  const text = typeof t === "function" ? t(b.arg) : t ?? b.kind;
  return `${b.what}: ${text}`;
}

function readJson(path) {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Broken("not-json");
  }
}

// Hermes folders: the root and the profiles. → [{ name, home }]
export function hermesHomes(root) {
  const out = [{ name: "default", home: root }];
  const pdir = join(root, "profiles");
  if (existsSync(pdir)) {
    for (const n of readdirSync(pdir).sort()) {
      if (n.startsWith(".")) continue;
      try {
        if (statSync(join(pdir, n)).isDirectory()) out.push({ name: n, home: join(pdir, n) });
      } catch {}
    }
  }
  return out;
}

const JOB_FIELDS = ["id", "name", "schedule_display", "enabled", "state", "paused_at", "last_status", "failure_streak", "last_run_at", "next_run_at"];

// jobs.json → only the needed fields. Unknown shape → Broken.
export function readJobs(path) {
  const j = readJson(path);
  const list = Array.isArray(j) ? j : j && Array.isArray(j.jobs) ? j.jobs : null;
  if (!list) throw new Broken("no-jobs");
  return list.map((x) => {
    if (!x || typeof x !== "object" || typeof x.id !== "string") throw new Broken("job-no-id");
    const o = {};
    for (const k of JOB_FIELDS) o[k] = x[k] ?? null;
    if (!o.schedule_display && x.schedule && typeof x.schedule === "object") o.schedule_display = x.schedule.display || x.schedule.expr || null;
    o.has_error = x.last_error != null;
    return o;
  });
}

const fileUri = (path, query = "") => `file:${path.split("/").map(encodeURIComponent).join("/")}${query}`;

export function sqlite(dbPath, sql, { bin = "/usr/bin/sqlite3", uri = fileUri(dbPath, "?immutable=1") } = {}) {
  const out = execFileSync(bin, ["-readonly", "-json", uri, sql], { encoding: "utf8", timeout: 2500, stdio: ["ignore", "pipe", "ignore"] });
  return out.trim() ? JSON.parse(out) : [];
}

const walSize = (dbPath) => {
  try {
    return statSync(`${dbPath}-wal`).size;
  } catch {
    return 0;
  }
};

// Reads the Hermes database without writing to its folder. No WAL journal → immutable (no locks; everything is in the database).
// Non-empty -wal → a copy of the database and -wal in a temp folder: the copy is opened with a plain read-only connection,
// and SQLite sees the journal's rows. If the immutable read fails because a -wal appeared meanwhile (a checkpoint during
// the read), it is retried on a copy. tmpBase is the plugin's data folder (AGENTHUB_PLUGIN_DATA_PATH) or the system tmp.
export function withDb(dbPath, fn, { tmpBase = process.env.AGENTHUB_PLUGIN_DATA_PATH || tmpdir() } = {}) {
  const viaCopy = () => {
    mkdirSync(tmpBase, { recursive: true, mode: 0o700 });
    const dir = mkdtempSync(join(tmpBase, "hermes-db-"));
    try {
      const copy = join(dir, "executions.db");
      copyFileSync(dbPath, copy);
      if (existsSync(`${dbPath}-wal`)) copyFileSync(`${dbPath}-wal`, `${copy}-wal`);
      return fn(fileUri(copy, "?mode=ro"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  if (walSize(dbPath) > 0) return viaCopy();
  try {
    return fn(fileUri(dbPath, "?immutable=1"));
  } catch (e) {
    if (!(e instanceof Broken) && walSize(dbPath) > 0) return viaCopy();
    throw e;
  }
}

// executions.db: the latest runs per job. → Map(jobId → [{status, claimed_at, started_at, finished_at, has_error, tokens?}])
export function readExecutions(dbPath, opts = {}) {
  if (!opts.uri) return withDb(dbPath, (uri) => readExecutions(dbPath, { ...opts, uri }), opts);
  const cols = sqlite(dbPath, "PRAGMA table_info(executions)", opts).map((r) => r.name);
  for (const need of ["job_id", "status", "claimed_at"]) if (!cols.includes(need)) throw new Broken("no-column", need);
  const ident = (c) => `"${c.replace(/"/g, '""')}"`;
  const select = ["job_id", "status", "claimed_at"];
  for (const c of ["started_at", "finished_at"]) if (cols.includes(c)) select.push(c);
  const tokenCols = cols.filter((c) => /token/i.test(c) && /^[\w]+$/.test(c));
  select.push(...tokenCols);
  const errExpr = cols.includes("error") ? ", (error IS NOT NULL AND error <> '') AS has_error" : "";
  const rows = sqlite(dbPath, `SELECT ${select.map(ident).join(", ")}${errExpr} FROM executions ORDER BY claimed_at DESC LIMIT 400`, opts);
  const by = new Map();
  for (const r of rows) {
    if (typeof r.job_id !== "string" || typeof r.status !== "string") throw new Broken("bad-row");
    const e = { status: r.status, claimed_at: r.claimed_at, started_at: r.started_at ?? null, finished_at: r.finished_at ?? null, has_error: Boolean(r.has_error) };
    let tokens = 0;
    let anyTok = false;
    for (const c of tokenCols) if (typeof r[c] === "number") {
      if (/total/i.test(c)) {
        tokens = r[c];
        anyTok = true;
        break;
      }
      tokens += r[c];
      anyTok = true;
    }
    if (anyTok) e.tokens = tokens;
    if (!by.has(r.job_id)) by.set(r.job_id, []);
    by.get(r.job_id).push(e);
  }
  return by;
}

function readTail(path, bytes) {
  const st = statSync(path);
  const start = Math.max(0, st.size - bytes);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(st.size - start);
    readSync(fd, buf, 0, buf.length, start);
    let s = buf.toString("utf8");
    if (start > 0) s = s.slice(s.indexOf("\n") + 1); // the first line is cut off
    return s;
  } finally {
    closeSync(fd);
  }
}

// usage_audit.jsonl → Map(jobId → [{ts, tokens, durationMs}]) in ascending time order. Numbers only.
export function readUsageAudit(path) {
  const by = new Map();
  for (const l of readTail(path, AUDIT_TAIL_BYTES).split("\n")) {
    if (!l.trim()) continue;
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue; // a partially written line
    }
    if (!o || typeof o.job_id !== "string") continue;
    let tokens = null;
    if (typeof o.total_tokens === "number") tokens = o.total_tokens;
    else if (typeof o.prompt_tokens === "number" || typeof o.completion_tokens === "number") tokens = (o.prompt_tokens || 0) + (o.completion_tokens || 0);
    if (tokens === null) continue;
    if (!by.has(o.job_id)) by.set(o.job_id, []);
    by.get(o.job_id).push({ ts: typeof o.ts === "string" ? o.ts : null, tokens, durationMs: typeof o.duration_ms === "number" ? o.duration_ms : null });
  }
  for (const arr of by.values()) arr.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return by;
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The last run's usage against the usual (the median of up to 10 previous runs). → {last, usual, costly} | null
export function costCheck(samples) {
  if (!samples || samples.length < COSTLY_MIN_SAMPLES + 1) return samples?.length ? { last: samples.at(-1).tokens, usual: null, costly: false } : null;
  const last = samples.at(-1).tokens;
  const usual = median(samples.slice(-11, -1).map((s) => s.tokens));
  return { last, usual, costly: usual > 0 && last >= COSTLY_FACTOR * usual };
}

// A Hermes heartbeat file: "<epoch> [pid]". → {ageSec, pid} | null
export function readEpochMarker(path, nowMs) {
  if (!existsSync(path)) return null;
  const parts = readFileSync(path, "utf8").trim().split(/\s+/);
  const epoch = Number(parts[0]);
  if (!Number.isFinite(epoch) || epoch <= 0) throw new Broken("not-time");
  return { ageSec: Math.max(0, nowMs / 1000 - epoch), pid: parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : null };
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    const out = execFileSync("/bin/ps", ["-p", String(pid), "-o", "pid="], { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() === String(pid);
  } catch {
    return false;
  }
}

// Gateway: gateway_state.json + state/gateway.heartbeat.
export function readGateway(root, nowMs, { alive = pidAlive } = {}) {
  const statePath = join(root, "gateway_state.json");
  if (!existsSync(statePath)) return { present: false };
  const s = readJson(statePath);
  if (!s || typeof s !== "object" || typeof s.gateway_state !== "string") throw new Broken("no-gateway-state");
  const g = {
    present: true,
    state: s.gateway_state,
    pid: Number.isInteger(s.pid) ? s.pid : null,
    platforms: s.platforms && typeof s.platforms === "object" ? Object.keys(s.platforms).length : 0,
    activeAgents: typeof s.active_agents === "number" ? s.active_agents : null,
    heartbeatAgeSec: null,
    alive: null,
  };
  const hbPath = join(root, "state", "gateway.heartbeat");
  let hbTime = null;
  if (existsSync(hbPath)) {
    try {
      const hb = JSON.parse(readFileSync(hbPath, "utf8"));
      const t = Date.parse(hb.updated_at);
      if (!Number.isNaN(t)) hbTime = t;
    } catch {}
    if (hbTime === null) hbTime = statSync(hbPath).mtimeMs;
  } else {
    const t = Date.parse(s.updated_at);
    if (!Number.isNaN(t)) hbTime = t;
  }
  if (hbTime !== null) g.heartbeatAgeSec = Math.max(0, (nowMs - hbTime) / 1000);
  if (g.pid) g.alive = alive(g.pid);
  g.silent = g.state === "running" && (g.alive === false || g.heartbeatAgeSec === null || g.heartbeatAgeSec > GATEWAY_STALE_S);
  return g;
}

// ---------- building the frame ----------
export function collect({ home = homedir(), now = Date.now(), sqliteBin = "/usr/bin/sqlite3", alive = pidAlive } = {}) {
  const root = join(home, ".hermes");
  const r = { root, present: existsSync(root), broken: [], estop: [], gateway: null, profiles: [] };
  if (!r.present) return r;
  const guard = (what, fn) => {
    try {
      return fn();
    } catch (e) {
      // a system error: its code (ENOENT, EACCES …) or the sqlite3 message — language-neutral
      r.broken.push(e instanceof Broken ? { what, kind: e.kind, arg: e.arg } : { what, kind: String(e.code || e.message).slice(0, 120) });
      return null;
    }
  };
  r.gateway = guard("gateway", () => readGateway(root, now, { alive }));
  for (const h of hermesHomes(root)) {
    if (existsSync(join(h.home, "ESTOP"))) r.estop.push(h.name);
    const cron = join(h.home, "cron");
    const jobsPath = join(cron, "jobs.json");
    if (!existsSync(jobsPath)) continue;
    const p = { name: h.name, cron, jobs: [], ticker: null };
    const jobs = guard(`${h.name}/jobs.json`, () => readJobs(jobsPath));
    if (!jobs) continue;
    const dbPath = join(cron, "executions.db");
    const execs = existsSync(dbPath) ? guard(`${h.name}/executions.db`, () => readExecutions(dbPath, { bin: sqliteBin })) || new Map() : new Map();
    const auditPath = join(cron, "usage_audit.jsonl");
    const audit = existsSync(auditPath) ? guard(`${h.name}/usage_audit.jsonl`, () => readUsageAudit(auditPath)) || new Map() : new Map();
    p.ticker = guard(`${h.name}/ticker_heartbeat`, () => readEpochMarker(join(cron, "ticker_heartbeat"), now));
    for (const j of jobs) {
      const runs = execs.get(j.id) || [];
      const lastRun = runs[0] || null;
      let samples = audit.get(j.id) || [];
      if (!samples.length && runs.some((x) => typeof x.tokens === "number"))
        samples = runs.filter((x) => typeof x.tokens === "number").reverse().map((x) => ({ ts: x.claimed_at, tokens: x.tokens }));
      const cost = costCheck(samples);
      const lastDur =
        lastRun && lastRun.started_at && lastRun.finished_at ? (Date.parse(lastRun.finished_at) - Date.parse(lastRun.started_at)) / 1000 : null;
      const lastStatus = lastRun ? lastRun.status : j.last_status;
      const failed = lastRun ? lastRun.status === "failed" : /^(error|failed|failure)$/i.test(String(j.last_status || ""));
      const paused = j.enabled === false || j.state === "paused" || Boolean(j.paused_at);
      const running = lastRun ? lastRun.status === "running" || lastRun.status === "claimed" : j.state === "running";
      p.jobs.push({ ...j, lastRun, lastStatus, lastDur: Number.isFinite(lastDur) ? lastDur : null, cost, failed, paused, running });
    }
    r.profiles.push(p);
  }
  return r;
}

// The header answers "does Hermes need attention": not responding → failed → stopped → paused → costly → all OK.
export function render(r, { now = Date.now(), lang = envLang() } = {}) {
  LANG = lang === "en" ? "en" : "ru";
  const out = [];
  const body = [];
  const events = [];
  if (!r.present) {
    out.push(line(tr("Hermes не установлен", "Hermes isn't installed"), { status: "unknown", tile: "—", sfimage: "moon.zzz" }));
    out.push("---");
    out.push(line(tr(`Нет каталога ${r.root}`, `No ${r.root} folder`), { color: "gray" }));
    return out.join("\n");
  }
  let status = "ok";
  const bump = (s) => {
    const sev = { ok: 0, unknown: 1, wait: 2, block: 3, error: 4 };
    if (sev[s] > sev[status]) status = s;
  };
  const problems = []; // [{ rank, text }]: the header shows the most important one

  // gateway
  const g = r.gateway;
  if (g && g.present) {
    const hb = g.heartbeatAgeSec === null ? tr("отклика нет", "no heartbeat") : tr(`отклик ${fmtAge(g.heartbeatAgeSec)}`, `last beat ${fmtAge(g.heartbeatAgeSec)}`);
    if (g.silent) {
      bump("error");
      const why = g.alive === false ? tr("служба не запущена", "its service isn't running") : g.heartbeatAgeSec !== null ? tr(`служба молчит ${fmtFor(g.heartbeatAgeSec)}`, `its service has been silent for ${fmtFor(g.heartbeatAgeSec)}`) : tr("служба молчит", "its service is silent");
      problems.push({ rank: 0, text: tr(`Hermes не отвечает: ${why}`, `Hermes isn't responding: ${why}`) });
      events.push("gateway-silent");
      body.push(line(tr(`Служба Hermes не отвечает: ${g.alive === false ? "она не запущена" : hb}`, `Hermes service not responding: ${g.alive === false ? "it isn't running" : hb}`), { color: "red", sfimage: "antenna.radiowaves.left.and.right.slash", event: "gateway-silent" }));
    } else if (g.state === "running") {
      body.push(line(tr(`Служба Hermes работает (${hb})`, `Hermes service running (${hb})`), { sfimage: "antenna.radiowaves.left.and.right" }));
    } else {
      body.push(line(tr(`Служба Hermes: ${clean(g.state)}`, `Hermes service: ${clean(g.state)}`), { color: "gray", sfimage: "antenna.radiowaves.left.and.right.slash" }));
    }
    body.push(line(tr(`--Подключено платформ: ${g.platforms}${g.platforms === 0 ? " (мессенджеры в Hermes не подключены)" : ""}`, `--Connected platforms: ${g.platforms}${g.platforms === 0 ? " (no messengers connected in Hermes)" : ""}`)));
    if (g.activeAgents !== null) body.push(line(tr(`--Активных агентов: ${g.activeAgents}`, `--Active agents: ${g.activeAgents}`)));
    if (g.pid) {
      body.push(line(tr("--Подробности", "--Details"), { details: "true" }));
      body.push(line(tr(`----служба gateway, процесс ${g.pid}`, `----gateway service, process ${g.pid}`), { color: "gray" }));
    }
  } else if (g && !g.present) {
    body.push(line(tr("Gateway: нет gateway_state.json", "Gateway: no gateway_state.json"), { color: "gray" }));
  }

  // Hermes's own pause (ESTOP is its own mechanism, not the hub's pause). ~/.hermes/ESTOP pauses all of Hermes;
  // profiles/<n>/ESTOP (`hermes -p <n> pause`) only profile <n>: the other profiles keep running.
  const rootPaused = r.estop.includes("default");
  const pausedProfiles = new Set(rootPaused ? r.profiles.map((p) => p.name).concat(r.estop) : r.estop);
  if (rootPaused) {
    bump("wait");
    problems.push({ rank: 3, text: tr("Hermes на паузе — задачи не запускаются", "Hermes is paused — jobs won't run") });
    events.push("estop");
    body.push(line(tr("Hermes на паузе — задачи не запускаются", "Hermes is paused — jobs won't run"), { color: "orange", sfimage: "pause.circle", event: "estop" }));
    body.push(line(tr("--Снять: hermes resume в терминале", "--To resume: run hermes resume in a terminal"), { color: "gray" }));
  } else if (r.present) {
    for (const name of r.estop) {
      const pn = clean(name);
      const key = `estop-${name.replace(/[^\w-]/g, "_")}`;
      bump("wait");
      problems.push({ rank: 3, text: tr(`Профиль ${pn} Hermes на паузе — его задачи не запускаются`, `Hermes profile ${pn} is paused — its jobs won't run`) });
      events.push(key);
      body.push(line(tr(`Профиль ${pn} на паузе — его задачи не запускаются`, `Profile ${pn} is paused — its jobs won't run`), { color: "orange", sfimage: "pause.circle", event: key }));
      // the profile name only when it is safe for a command
      if (/^[\w.-]{1,64}$/.test(name)) body.push(line(tr(`--Снять: hermes -p ${name} resume в терминале`, `--To resume: run hermes -p ${name} resume in a terminal`), { color: "gray" }));
    }
    // the stop ladder (design §5): all of Hermes is one declared action; the confirmation comes from the core
    body.push(line(tr("Поставить Hermes на паузу", "Pause Hermes"), { action: "pause", sfimage: "pause.circle", color: "gray" }));
  }

  // jobs
  for (const p of r.profiles) {
    body.push("---");
    const tickerSilent = p.ticker && p.ticker.ageSec > TICKER_STALE_S;
    const pn = clean(p.name);
    // while paused (all of Hermes or this profile) a silent scheduler is expected
    if (tickerSilent && !pausedProfiles.has(p.name)) {
      bump("error");
      problems.push({ rank: 2, text: tr(`Расписание профиля ${pn} остановилось`, `Profile ${pn}'s schedule has stopped`) });
      const key = `ticker-silent-${p.name.replace(/[^\w-]/g, "_")}`;
      events.push(key);
      body.push(line(tr(`Профиль ${pn}: расписание остановилось (отклик ${fmtAge(p.ticker.ageSec)})`, `Profile ${pn}: schedule stopped (last beat ${fmtAge(p.ticker.ageSec)})`), { color: "red", event: key }));
    } else body.push(line(p.ticker ? tr(`Профиль ${pn}: расписание работает (отклик ${fmtAge(p.ticker.ageSec)})`, `Profile ${pn}: schedule running (last beat ${fmtAge(p.ticker.ageSec)})`) : tr(`Профиль ${pn}: расписание не отзывалось`, `Profile ${pn}: no schedule heartbeat`), { color: "gray" }));
    if (!p.jobs.length) body.push(line(tr("Задач нет", "No jobs"), { color: "gray" }));
    for (const j of p.jobs) {
      const name = clean(j.name || j.id);
      let state;
      const params = {};
      if (j.paused) {
        state = tr("на паузе", "paused");
        params.color = "gray";
        params.sfimage = "pause.circle";
      } else if (j.running) {
        state = tr("идёт", "running");
        params.sfimage = "play.circle";
      } else if (j.failed) {
        state = tr("упала", "failed");
        params.color = "red";
        params.sfimage = "xmark.octagon";
      } else {
        state = statusRu(j.lastStatus) || tr("ещё не запускалась", "hasn't run yet");
        params.sfimage = "checkmark.circle";
      }
      const next = j.next_run_at && !j.paused ? tr(`, следующая ${fmtTime(j.next_run_at, now)}`, `, next ${fmtTime(j.next_run_at, now)}`) : "";
      if (j.failed && !j.paused) {
        bump("error");
        problems.push({ rank: 1, text: tr(`Задача «${name}» упала`, `Job "${name}" failed`) });
        events.push(`job-failed-${j.id}`);
        params.event = `job-failed-${j.id}`;
      }
      body.push(line(`${name} — ${state}${next}`, params));
      if (j.cost && j.cost.costly && !j.paused) {
        bump("wait");
        problems.push({ rank: 4, text: tr(`«${name}» потратила вдвое больше обычного`, `"${name}" used twice the usual`) });
        events.push(`job-costly-${j.id}`);
        body.push(line(tr(`--Последний запуск: ${fmtTokens(j.cost.last)} токенов — вдвое больше обычного (${fmtTokens(j.cost.usual)})`, `--Last run: ${fmtTokens(j.cost.last)} tokens — twice the usual (${fmtTokens(j.cost.usual)})`), { color: "orange", event: `job-costly-${j.id}` }));
      } else if (j.cost) {
        body.push(line(tr(`--Последний запуск: ${fmtTokens(j.cost.last)} токенов${j.cost.usual ? ` (обычно ${fmtTokens(j.cost.usual)})` : ""}`, `--Last run: ${fmtTokens(j.cost.last)} tokens${j.cost.usual ? ` (usually ${fmtTokens(j.cost.usual)})` : ""}`)));
      }
      if (j.lastRun) {
        const dur = j.lastDur !== null ? tr(`, ${Math.round(j.lastDur)} с`, `, ${Math.round(j.lastDur)} s`) : "";
        body.push(line(tr(`--Запуск ${fmtTime(j.lastRun.started_at || j.lastRun.claimed_at, now)}: ${statusRu(j.lastRun.status)}${dur}${j.lastRun.has_error ? ", есть ошибка" : ""}`, `--Run at ${fmtTime(j.lastRun.started_at || j.lastRun.claimed_at, now)}: ${statusRu(j.lastRun.status)}${dur}${j.lastRun.has_error ? ", with an error" : ""}`)));
      } else if (j.last_run_at) body.push(line(tr(`--Запуск ${fmtTime(j.last_run_at, now)}: ${statusRu(j.lastStatus) || "?"}`, `--Run at ${fmtTime(j.last_run_at, now)}: ${statusRu(j.lastStatus) || "?"}`)));
      if (Number(j.failure_streak) > 0) body.push(line(tr(`--Падений подряд: ${Number(j.failure_streak)}`, `--Failures in a row: ${Number(j.failure_streak)}`), { color: "red" }));
      if (j.schedule_display) {
        const human = humanCron(j.schedule_display);
        if (human) body.push(line(tr(`--Запускается ${human}`, `--Runs ${human}`), { color: "gray" }));
        body.push(line(tr("--Подробности", "--Details"), { details: "true" }));
        body.push(line(tr(`----расписание cron: ${clean(j.schedule_display)} · id ${clean(j.id)}`, `----cron schedule: ${clean(j.schedule_display)} · id ${clean(j.id)}`), { color: "gray" }));
      }
      // pause/resume/run are declared actions (the confirmation with its cost comes from the core, only from the app)
      if (/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(j.id)) {
        if (j.paused) body.push(line(tr("--Возобновить по расписанию", "--Resume on schedule"), { action: "cron-resume", arg: j.id }));
        else {
          body.push(line(tr("--Поставить на паузу", "--Pause"), { action: "cron-pause", arg: j.id }));
          if (!j.running) body.push(line(tr("--Запустить вне расписания", "--Run now"), { action: "cron-run", arg: j.id }));
        }
      }
      const outDir = join(p.cron, "output", j.id);
      if (/^[\w-]+$/.test(j.id) && existsSync(outDir)) body.push(line(tr("--Открыть выводы задачи", "--Open job output"), { effect: `open.file path=${q(outDir)}` }));
    }
  }

  if (r.broken.length) {
    bump("unknown");
    events.push("source-broken");
    body.push("---");
    body.push(line(tr("Не получается прочитать данные Hermes", "Can't read Hermes data"), { color: "orange", event: "source-broken" }));
    for (const b of r.broken.slice(0, 5)) body.push(line(`--${clean(brokenText(b, LANG))}`, { color: "gray" }));
  }

  const jobsCount = r.profiles.reduce((a, p) => a + p.jobs.length, 0);
  problems.sort((a, b) => a.rank - b.rank);
  const title = problems.length ? clean(problems[0].text) : tr(`Hermes: ${jobsCount} ${plural(jobsCount, "задача", "задачи", "задач")} по расписанию`, `Hermes: ${jobsCount} ${plEn(jobsCount, "job", "jobs")} on schedule`);
  const sf = status === "ok" ? "bolt.horizontal.circle" : status === "wait" ? "pause.circle" : status === "unknown" ? "questionmark.circle" : "exclamationmark.triangle";
  // the tile says what is going on: how many issues, otherwise how many jobs (not "!" — the icon already shows that)
  const tile = problems.length ? tr(`${problems.length} ${plural(problems.length, "проблема", "проблемы", "проблем")}`, `${problems.length} ${plEn(problems.length, "issue", "issues")}`) : tr(`${jobsCount} ${plural(jobsCount, "задача", "задачи", "задач")}`, `${jobsCount} ${plEn(jobsCount, "job", "jobs")}`);
  // activity= feeds the hub's "OK to shut down" verdict (core ≥ 07.11): jobs running now; empty means quiet
  const runningN = r.profiles.reduce((a, p) => a + p.jobs.filter((j) => j.running).length, 0);
  const activity = runningN ? tr(`Hermes: ${runningN} ${plural(runningN, "задача", "задачи", "задач")} в работе`, `Hermes: ${runningN} ${plEn(runningN, "job", "jobs")} running`) : "";
  // the service is silent or the data can't be read — what Hermes is running is unknown: we don't say "quiet", the key is
  // omitted (the plugin takes no part in the verdict), otherwise the shutdown card would tick it next to a red tile
  const blind = events.some((e) => e === "gateway-silent" || e === "source-broken" || e.startsWith("ticker-silent"));
  const head = line(title, { status, tile, sfimage: sf, activity });
  out.push(activity || blind ? head : `${head} activity=""`);
  out.push("---");
  if (problems.length > 1) for (const p of problems.slice(1, 3)) out.push(line(clean(p.text), { color: "gray" }));
  out.push(...body);
  return out.join("\n");
}

const STATUS_RU = { completed: "готово", ok: "готово", success: "готово", failed: "упала", error: "упала", running: "идёт", claimed: "в очереди", unknown: "неизвестно" };
const STATUS_EN = { completed: "done", ok: "done", success: "done", failed: "failed", error: "failed", running: "running", claimed: "queued", unknown: "unknown" };
export function statusRu(s) {
  if (s == null || s === "") return "";
  return (EN() ? STATUS_EN : STATUS_RU)[String(s).toLowerCase()] || clean(s);
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- actions (the core runs them after confirmation in the app) ----------

export const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

// The profile that holds the job. → { profile, job } | { reason }
export function findJob(jobId, { home = homedir() } = {}) {
  if (!JOB_ID.test(String(jobId || "")) || String(jobId).startsWith("-")) return { reason: "bad-job" };
  const root = join(home, ".hermes");
  if (!existsSync(root)) return { reason: "no-hermes-home" };
  const hits = [];
  for (const h of hermesHomes(root)) {
    const path = join(h.home, "cron", "jobs.json");
    if (!existsSync(path)) continue;
    let jobs;
    try {
      jobs = readJobs(path);
    } catch {
      return { reason: "no-jobs-file" };
    }
    const j = jobs.find((x) => x.id === jobId);
    if (j) hits.push({ profile: h.name, job: { ...j, paused: j.enabled === false || j.state === "paused" || Boolean(j.paused_at) } });
  }
  if (!hits.length) return { reason: "unknown-job" };
  if (hits.length > 1) return { reason: "ambiguous-job" };
  return hits[0];
}

function hermesBin(home) {
  const dir = process.env.AGENTHUB_TEST_BIN_DIR;
  if (dir && existsSync(join(dir, "hermes"))) return join(dir, "hermes");
  return join(home, ".local", "bin", "hermes");
}

function cleanEnv(home) {
  const env = { HOME: home, PATH: process.env.PATH || "/usr/bin:/bin" };
  for (const k of ["USER", "LOGNAME", "LANG", "TMPDIR"]) if (process.env[k]) env[k] = process.env[k];
  return env;
}

// A human-readable explanation of an action refusal (contract 2, the message= line): the shell shows it after the button
// name ("Pause": The job is already paused.), so the text doesn't repeat the button name. Up to 120 graphemes.
export const REFUSALS = {
  "no-hermes": ["Hermes не найден: нет ~/.local/bin/hermes.", "Hermes isn't installed: no ~/.local/bin/hermes."],
  "no-hermes-home": ["Нет папки ~/.hermes — данных Hermes нет.", "No ~/.hermes folder — no Hermes data."],
  "bad-job": ["Такой задачи нет.", "No such task."],
  "unknown-job": ["Задачи с таким id нет ни в одном профиле Hermes.", "No Hermes profile has a job with this id."],
  "ambiguous-job": ["Задача с таким id есть в нескольких профилях — сделайте это в терминале.", "Several profiles have a job with this id — do it in the terminal."],
  "no-jobs-file": ["Не получается прочитать список задач Hermes.", "Can't read the Hermes job list."],
  "already-paused": ["Задача уже на паузе.", "The job is already paused."],
  "not-paused": ["Задача не на паузе.", "The job isn't paused."],
  "hermes-paused": ["Hermes уже на паузе.", "Hermes is already paused."],
  "unknown-action": ["Плагин не знает такого действия.", "The plugin doesn't know this action."],
  timeout: ["Hermes не ответил за 25 с.", "Hermes didn't respond within 25 s."],
  "hermes-failed": ["Команда hermes завершилась с ошибкой.", "The hermes command failed."],
};
export function refusalMessage(reason, lang = envLang(), code = null) {
  const t = REFUSALS[reason];
  if (!t) return null;
  const text = t[lang === "en" ? 1 : 0];
  return reason === "hermes-failed" && Number.isInteger(code) ? text.replace(/\.$/, lang === "en" ? ` (exit code ${code}).` : ` (код ${code}).`) : text;
}

// → { ok, reason?, code? }
export function runAction([id, arg], { home = homedir() } = {}) {
  const bin = hermesBin(home);
  if (!existsSync(bin)) return { ok: false, reason: "no-hermes" };
  let args;
  if (id === "pause") {
    if (existsSync(join(home, ".hermes", "ESTOP"))) return { ok: false, reason: "hermes-paused" };
    args = ["pause"];
  }
  else {
    const op = { "cron-pause": "pause", "cron-resume": "resume", "cron-run": "run" }[id];
    if (!op) return { ok: false, reason: "unknown-action" };
    const f = findJob(arg, { home });
    if (f.reason) return { ok: false, reason: f.reason };
    if (op === "pause" && f.job.paused) return { ok: false, reason: "already-paused" };
    if (op === "resume" && !f.job.paused) return { ok: false, reason: "not-paused" };
    args = [...(f.profile === "default" ? [] : ["-p", f.profile]), "cron", op, arg];
  }
  try {
    execFileSync(bin, args, { env: cleanEnv(home), timeout: 25_000, stdio: ["ignore", "ignore", "ignore"] });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.code === "ETIMEDOUT" ? "timeout" : "hermes-failed", code: typeof e.status === "number" ? e.status : null };
  }
}

function main() {
  const ai = process.argv.indexOf("--action");
  if (ai >= 2) {
    const r = runAction(process.argv.slice(ai + 1));
    const msg = r.ok ? null : refusalMessage(r.reason, envLang(), r.code);
    process.stdout.write(r.ok ? "ok\n" : `${msg ? `message=${msg}\n` : ""}reason=${r.reason}\n`);
    process.exitCode = r.ok ? 0 : 3;
    return;
  }
  let text;
  try {
    text = render(collect());
  } catch (e) {
    text = [line(envLang() === "en" ? "Can't read Hermes data" : "Не получается прочитать данные Hermes", { status: "unknown", event: "source-broken" }), "---", line(clean(e.message), { color: "gray" })].join("\n");
  }
  process.stdout.write(text + "\n");
}

// Run as a program (not imported by tests). Paths are compared by realpath: /tmp → /private/tmp.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
