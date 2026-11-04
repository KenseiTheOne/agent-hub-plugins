#!/usr/bin/env node
// <agenthub.title>Hermes</agenthub.title>
// <agenthub.version>1.1.1</agenthub.version>
// <agenthub.desc>Задачи cron Hermes, их падения и расход, жив ли gateway, ESTOP. Пауза задач — действиями с подтверждением ядра.</agenthub.desc>
// <agenthub.author.github>kensei</agenthub.author.github>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.fsRead>~/.hermes/gateway_state.json — состояние gateway</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/state/gateway.heartbeat — пульс gateway</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/cron, ~/.hermes/profiles/*/cron — jobs.json, executions.db, usage_audit.jsonl, ticker_heartbeat</agenthub.fsRead>
// <agenthub.fsRead>~/.hermes/ESTOP, ~/.hermes/profiles/*/ESTOP — пауза Hermes</agenthub.fsRead>
// <agenthub.exec>/usr/bin/sqlite3 file:…/executions.db?immutable=1 — статусы запусков (только чтение)</agenthub.exec>
// <agenthub.exec>/bin/ps -p <pid> — жив ли процесс gateway</agenthub.exec>
// <agenthub.exec>~/.local/bin/hermes [-p <профиль>] cron pause|resume|run <job> — действия cron-pause, cron-resume, cron-run</agenthub.exec>
// <agenthub.exec>~/.local/bin/hermes pause — действие pause: поставить Hermes на паузу</agenthub.exec>
// <agenthub.effects>open.file</agenthub.effects>
// <agenthub.action id="cron-pause" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: поставить на паузу задачу" cost="задача не запустится по расписанию до возобновления">hermes.60s.mjs --action cron-pause {job}</agenthub.action>
// <agenthub.action id="cron-resume" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: возобновить задачу" cost="задача снова будет запускаться по расписанию (расход квоты)">hermes.60s.mjs --action cron-resume {job}</agenthub.action>
// <agenthub.action id="cron-run" level="confirm-cost" arg="job:^[A-Za-z0-9_-]{1,64}$" title="Hermes: запустить вне расписания задачу" cost="внеочередной запуск задачи — расход квоты">hermes.60s.mjs --action cron-run {job}</agenthub.action>
// <agenthub.action id="pause" level="confirm" title="Hermes: поставить всё на паузу (ESTOP)">hermes.60s.mjs --action pause</agenthub.action>
// <agenthub.push key="job-failed">Hermes: задача упала</agenthub.push>
// <agenthub.push key="job-costly">Hermes: задача потратила вдвое больше обычного</agenthub.push>
// <agenthub.push key="ticker-silent">Hermes: планировщик cron не тикает</agenthub.push>
// <agenthub.push key="gateway-silent" macOnly="true">Hermes: gateway молчит</agenthub.push>
// <agenthub.push key="estop">Hermes: ESTOP</agenthub.push>
//
// Официальный плагин реестра agent-hub-plugins. Вывод — только чтение. Пауза, возобновление и внеочередной
// запуск задач — объявленные действия: подтверждение и его текст — от ядра, аргумент (id задачи) ядро сверяет
// с шаблоном и передаёт отдельным argv. Факты (задача есть в jobs.json своего профиля, cron pause — только не
// на паузе, cron resume — только на паузе, pause всего Hermes — только без ESTOP в ~/.hermes) проверяет сам
// плагин в режиме `--action`; отказ — код 3 и `reason=<код>`. Кнопка «Поставить Hermes на паузу» есть в кадре,
// пока ESTOP нет; снять паузу — `hermes resume` в терминале (действия для этого нет).
//
// Что читаем и чего не читаем:
//   jobs.json        — только id, name, расписание, enabled/state, last_status, failure_streak, время запусков.
//                      Поля prompt, origin, last_error/last_failure.detail НЕ читаются и не выводятся.
//   executions.db    — `?immutable=1` (без блокировок и без записи), только job_id, status и времена;
//                      колонка error — только факт наличия. Колонки с токенами берём, если они есть в схеме.
//   usage_audit.jsonl— только числа токенов, job_id, ts, duration_ms (там же лежит расход каждого запуска).
//   Файлы секретов и настроек Hermes, state.db, sessions/ — никогда (читаются только перечисленные выше файлы).
//
// События (event=): job-failed-<id> (последний запуск упал), job-costly-<id> (последний запуск потратил
// вдвое больше обычного), gateway-silent (gateway объявлен работающим, но пульс старый или процесса нет),
// ticker-silent-<профиль> (планировщик cron не тикает), estop (Hermes на паузе), source-broken.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GATEWAY_STALE_S = 180; // пульс пишется раз в 30 с
export const TICKER_STALE_S = 200; // как в Hermes: TICKER_INTERVAL_SECONDS * 3 + 20
export const COSTLY_FACTOR = 2;
export const COSTLY_MIN_SAMPLES = 3;
const AUDIT_TAIL_BYTES = 256 * 1024;

// ---------- форматирование вывода ----------
export function clean(s) {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\|/g, "¦")
    .replace(/^[-\s]+/, "") // `--` в начале — вложенность
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
export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} тыс`;
  return fmtInt(n);
}
function fmtAge(sec) {
  if (sec < 90) return `${Math.round(sec)} с назад`;
  if (sec < 5400) return `${Math.round(sec / 60)} мин назад`;
  if (sec < 172800) return `${Math.round(sec / 3600)} ч назад`;
  return `${Math.round(sec / 86400)} дн назад`;
}
function fmtTime(iso, now) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date(now).toDateString();
  if (sameDay) return hm;
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${hm}`;
}

// ---------- чтение источников ----------
class Broken extends Error {}

function readJson(path) {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Broken(`${path}: не JSON`);
  }
}

// Каталоги Hermes: корень и профили. → [{ name, home }]
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

// jobs.json → только нужные поля. Незнакомая форма → Broken.
export function readJobs(path) {
  const j = readJson(path);
  const list = Array.isArray(j) ? j : j && Array.isArray(j.jobs) ? j.jobs : null;
  if (!list) throw new Broken("jobs.json: нет массива jobs");
  return list.map((x) => {
    if (!x || typeof x !== "object" || typeof x.id !== "string") throw new Broken("jobs.json: задача без id");
    const o = {};
    for (const k of JOB_FIELDS) o[k] = x[k] ?? null;
    if (!o.schedule_display && x.schedule && typeof x.schedule === "object") o.schedule_display = x.schedule.display || x.schedule.expr || null;
    o.has_error = x.last_error != null;
    return o;
  });
}

export function sqlite(dbPath, sql, { bin = "/usr/bin/sqlite3" } = {}) {
  const uri = `file:${dbPath.split("/").map(encodeURIComponent).join("/")}?immutable=1`;
  const out = execFileSync(bin, ["-readonly", "-json", uri, sql], { encoding: "utf8", timeout: 2500, stdio: ["ignore", "pipe", "ignore"] });
  return out.trim() ? JSON.parse(out) : [];
}

// executions.db: последние запуски по задачам. → Map(jobId → [{status, claimed_at, started_at, finished_at, has_error, tokens?}])
export function readExecutions(dbPath, opts = {}) {
  const cols = sqlite(dbPath, "PRAGMA table_info(executions)", opts).map((r) => r.name);
  for (const need of ["job_id", "status", "claimed_at"]) if (!cols.includes(need)) throw new Broken(`executions.db: нет колонки ${need}`);
  const ident = (c) => `"${c.replace(/"/g, '""')}"`;
  const select = ["job_id", "status", "claimed_at"];
  for (const c of ["started_at", "finished_at"]) if (cols.includes(c)) select.push(c);
  const tokenCols = cols.filter((c) => /token/i.test(c) && /^[\w]+$/.test(c));
  select.push(...tokenCols);
  const errExpr = cols.includes("error") ? ", (error IS NOT NULL AND error <> '') AS has_error" : "";
  const rows = sqlite(dbPath, `SELECT ${select.map(ident).join(", ")}${errExpr} FROM executions ORDER BY claimed_at DESC LIMIT 400`, opts);
  const by = new Map();
  for (const r of rows) {
    if (typeof r.job_id !== "string" || typeof r.status !== "string") throw new Broken("executions.db: строка без job_id/status");
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
    if (start > 0) s = s.slice(s.indexOf("\n") + 1); // первая строка обрезана
    return s;
  } finally {
    closeSync(fd);
  }
}

// usage_audit.jsonl → Map(jobId → [{ts, tokens, durationMs}]) по возрастанию времени. Только числа.
export function readUsageAudit(path) {
  const by = new Map();
  for (const l of readTail(path, AUDIT_TAIL_BYTES).split("\n")) {
    if (!l.trim()) continue;
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue; // недописанная строка
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

// Расход последнего запуска против обычного (медиана до 10 предыдущих). → {last, usual, costly} | null
export function costCheck(samples) {
  if (!samples || samples.length < COSTLY_MIN_SAMPLES + 1) return samples?.length ? { last: samples.at(-1).tokens, usual: null, costly: false } : null;
  const last = samples.at(-1).tokens;
  const usual = median(samples.slice(-11, -1).map((s) => s.tokens));
  return { last, usual, costly: usual > 0 && last >= COSTLY_FACTOR * usual };
}

// Файл-пульс Hermes: «<epoch> [pid]». → {ageSec, pid} | null
export function readEpochMarker(path, nowMs) {
  if (!existsSync(path)) return null;
  const parts = readFileSync(path, "utf8").trim().split(/\s+/);
  const epoch = Number(parts[0]);
  if (!Number.isFinite(epoch) || epoch <= 0) throw new Broken(`${path}: не время`);
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
  if (!s || typeof s !== "object" || typeof s.gateway_state !== "string") throw new Broken("gateway_state.json: нет gateway_state");
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

// ---------- сборка кадра ----------
export function collect({ home = homedir(), now = Date.now(), sqliteBin = "/usr/bin/sqlite3", alive = pidAlive } = {}) {
  const root = join(home, ".hermes");
  const r = { root, present: existsSync(root), broken: [], estop: [], gateway: null, profiles: [] };
  if (!r.present) return r;
  const guard = (what, fn) => {
    try {
      return fn();
    } catch (e) {
      r.broken.push(`${what}: ${e instanceof Broken ? e.message : e.code || e.message}`.slice(0, 160));
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

export function render(r, { now = Date.now() } = {}) {
  const out = [];
  const body = [];
  const events = [];
  if (!r.present) {
    out.push(line("Hermes: не установлен", { status: "ok", sfimage: "moon.zzz" }));
    out.push("---");
    out.push(line(`Нет каталога ${r.root}`, { color: "gray" }));
    return out.join("\n");
  }
  let status = "ok";
  const bump = (s) => {
    const sev = { ok: 0, unknown: 1, wait: 2, block: 3, error: 4 };
    if (sev[s] > sev[status]) status = s;
  };
  const problems = [];

  // gateway
  const g = r.gateway;
  if (g && g.present) {
    const hb = g.heartbeatAgeSec === null ? "пульса нет" : `пульс ${fmtAge(g.heartbeatAgeSec)}`;
    const who = g.pid ? `pid ${g.pid}` : "pid ?";
    if (g.silent) {
      bump("error");
      problems.push("gateway молчит");
      events.push("gateway-silent");
      body.push(line(`Gateway молчит: ${g.alive === false ? "процесса нет" : hb} (${who})`, { color: "red", sfimage: "antenna.radiowaves.left.and.right.slash", event: "gateway-silent" }));
    } else if (g.state === "running") {
      body.push(line(`Gateway работает: ${hb} (${who})`, { sfimage: "antenna.radiowaves.left.and.right" }));
    } else {
      body.push(line(`Gateway: ${clean(g.state)}`, { color: "gray", sfimage: "antenna.radiowaves.left.and.right.slash" }));
    }
    body.push(line(`--Платформ подключено: ${g.platforms}${g.platforms === 0 ? " (мессенджеры в Hermes не подключены)" : ""}`));
    if (g.activeAgents !== null) body.push(line(`--Активных агентов: ${g.activeAgents}`));
  } else if (g && !g.present) {
    body.push(line("Gateway: нет gateway_state.json", { color: "gray" }));
  }

  // ESTOP
  if (r.estop.length) {
    bump("wait");
    problems.push("пауза (ESTOP)");
    events.push("estop");
    body.push(line(`Hermes на паузе (ESTOP): ${r.estop.join(", ")}`, { color: "orange", sfimage: "pause.circle", event: "estop" }));
    body.push(line("--Снять: hermes resume (в терминале)", { color: "gray" }));
  } else if (r.present) {
    // лестница остановки (дизайн §5): весь Hermes — одно объявленное действие, подтверждение — от ядра
    body.push(line("Поставить Hermes на паузу (ESTOP)", { action: "pause", sfimage: "pause.circle", color: "gray" }));
  }

  // задачи
  for (const p of r.profiles) {
    body.push("---");
    const tickerSilent = p.ticker && p.ticker.ageSec > TICKER_STALE_S;
    const tickerText = p.ticker ? `планировщик: пульс ${fmtAge(p.ticker.ageSec)}` : "планировщик: пульса нет";
    if (tickerSilent && !r.estop.length) {
      bump("error");
      problems.push(`cron ${p.name} не тикает`);
      const key = `ticker-silent-${p.name.replace(/[^\w-]/g, "_")}`;
      events.push(key);
      body.push(line(`Профиль ${clean(p.name)} — ${tickerText}`, { color: "red", event: key }));
    } else body.push(line(`Профиль ${clean(p.name)} — ${tickerText}`, { color: "gray" }));
    if (!p.jobs.length) body.push(line("Задач нет", { color: "gray" }));
    for (const j of p.jobs) {
      const name = clean(j.name || j.id);
      let state;
      const params = {};
      if (j.paused) {
        state = "на паузе";
        params.color = "gray";
        params.sfimage = "pause.circle";
      } else if (j.running) {
        state = "идёт";
        params.sfimage = "play.circle";
      } else if (j.failed) {
        state = "упала";
        params.color = "red";
        params.sfimage = "xmark.octagon";
      } else {
        state = statusRu(j.lastStatus) || "ещё не запускалась";
        params.sfimage = "checkmark.circle";
      }
      const next = j.next_run_at && !j.paused ? `, следующая ${fmtTime(j.next_run_at, now)}` : "";
      if (j.failed && !j.paused) {
        bump("error");
        problems.push(`упала «${name}»`);
        events.push(`job-failed-${j.id}`);
        params.event = `job-failed-${j.id}`;
      }
      body.push(line(`${name} — ${state}${next}`, params));
      if (j.cost && j.cost.costly && !j.paused) {
        bump("wait");
        problems.push(`«${name}» вдвое дороже обычного`);
        events.push(`job-costly-${j.id}`);
        body.push(line(`--Последний запуск: ${fmtTokens(j.cost.last)} токенов — вдвое больше обычного (${fmtTokens(j.cost.usual)})`, { color: "orange", event: `job-costly-${j.id}` }));
      } else if (j.cost) {
        body.push(line(`--Последний запуск: ${fmtTokens(j.cost.last)} токенов${j.cost.usual ? ` (обычно ${fmtTokens(j.cost.usual)})` : ""}`));
      }
      if (j.lastRun) {
        const dur = j.lastDur !== null ? `, ${Math.round(j.lastDur)} с` : "";
        body.push(line(`--Запуск ${fmtTime(j.lastRun.started_at || j.lastRun.claimed_at, now)}: ${statusRu(j.lastRun.status)}${dur}${j.lastRun.has_error ? ", есть ошибка" : ""}`));
      } else if (j.last_run_at) body.push(line(`--Запуск ${fmtTime(j.last_run_at, now)}: ${statusRu(j.lastStatus) || "?"}`));
      if (Number(j.failure_streak) > 0) body.push(line(`--Падений подряд: ${Number(j.failure_streak)}`, { color: "red" }));
      if (j.schedule_display) body.push(line(`--Расписание: ${clean(j.schedule_display)}`, { color: "gray" }));
      // пауза/возобновление/запуск — объявленные действия (подтверждение с ценой — от ядра, только из приложения)
      if (/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(j.id)) {
        if (j.paused) body.push(line("--Возобновить по расписанию", { action: "cron-resume", arg: j.id }));
        else {
          body.push(line("--Поставить на паузу", { action: "cron-pause", arg: j.id }));
          if (!j.running) body.push(line("--Запустить вне расписания", { action: "cron-run", arg: j.id }));
        }
      }
      const outDir = join(p.cron, "output", j.id);
      if (/^[\w-]+$/.test(j.id) && existsSync(outDir)) body.push(line("--Открыть выводы задачи", { effect: `open.file path=${q(outDir)}` }));
    }
  }

  if (r.broken.length) {
    bump("unknown");
    events.push("source-broken");
    body.push("---");
    body.push(line("Источник не разобран", { color: "orange", event: "source-broken" }));
    for (const b of r.broken.slice(0, 5)) body.push(line(`--${clean(b)}`, { color: "gray" }));
  }

  const jobsCount = r.profiles.reduce((a, p) => a + p.jobs.length, 0);
  const title = problems.length ? `Hermes: ${clean(problems.slice(0, 2).join(", "))}` : `Hermes: ${jobsCount} ${plural(jobsCount, "задача", "задачи", "задач")}`;
  const sf = status === "ok" ? "bolt.horizontal.circle" : status === "wait" ? "pause.circle" : status === "unknown" ? "questionmark.circle" : "exclamationmark.triangle";
  out.push(line(title, { status, sfimage: sf }));
  out.push("---");
  out.push(...body);
  return out.join("\n");
}

const STATUS_RU = { completed: "готово", ok: "готово", success: "готово", failed: "упала", error: "упала", running: "идёт", claimed: "в очереди", unknown: "неизвестно" };
export function statusRu(s) {
  if (s == null || s === "") return "";
  return STATUS_RU[String(s).toLowerCase()] || clean(s);
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- действия (запускает ядро после подтверждения в приложении) ----------

export const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Профиль, где лежит задача. → { profile, job } | { reason }
export function findJob(jobId, { home = homedir() } = {}) {
  if (!JOB_ID.test(String(jobId || "")) || String(jobId).startsWith("-")) return { reason: "bad-job" };
  const root = join(home, ".hermes");
  if (!existsSync(root)) return { reason: "no-hermes" };
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

// → { ok, reason?, code? }
export function runAction([id, arg], { home = homedir() } = {}) {
  const bin = hermesBin(home);
  if (!existsSync(bin)) return { ok: false, reason: "no-hermes" };
  let args;
  if (id === "pause") {
    if (existsSync(join(home, ".hermes", "ESTOP"))) return { ok: false, reason: "already-paused" };
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
    process.stdout.write(r.ok ? "ok\n" : `reason=${r.reason}\n`);
    process.exitCode = r.ok ? 0 : 3;
    return;
  }
  let text;
  try {
    text = render(collect());
  } catch (e) {
    text = [line("Hermes: ошибка разбора", { status: "unknown", event: "source-broken" }), "---", line(clean(e.message), { color: "gray" })].join("\n");
  }
  process.stdout.write(text + "\n");
}

// Запуск как программа (а не импорт из тестов). Пути сравниваются по realpath: /tmp → /private/tmp.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
