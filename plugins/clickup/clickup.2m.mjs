#!/usr/bin/env node
// <agenthub.title>ClickUp</agenthub.title>
// <agenthub.version>1.1.0</agenthub.version>
// <agenthub.desc>Ваши тикеты ClickUp и какие из них сейчас в работе у агентов (ночь, /ticket, сессии). Только чтение</agenthub.desc>
// <agenthub.desc lang="en">Your ClickUp tickets and which ones agents are working on (night, /ticket, sessions). Read-only</agenthub.desc>
// <agenthub.status value="ok" label="Тикеты загружены">Список тикетов свежий</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Tickets loaded">The ticket list is up to date</agenthub.status>
// <agenthub.status value="error" label="Токен не принят">ClickUp отклонил токен или хаб не пустил запрос</agenthub.status>
// <agenthub.status value="error" lang="en" label="Token rejected">ClickUp rejected the token or the hub blocked a request</agenthub.status>
// <agenthub.status value="unknown" label="Не подключён или нет связи">Нет токена ClickUp или ClickUp не отвечает</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Not connected / offline">No ClickUp token, or ClickUp isn't responding</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos,windows</agenthub.platforms>
// <agenthub.secrets>clickup.token — ваш личный токен ClickUp: только чтобы читать тикеты</agenthub.secrets>
// <agenthub.secrets lang="en">clickup.token — your personal ClickUp token: only to read tickets</agenthub.secrets>
// <agenthub.net>api.clickup.com — запросы к ClickUp только на чтение и только по заранее заданному списку адресов</agenthub.net>
// <agenthub.net lang="en">api.clickup.com — read-only requests to ClickUp, only to a fixed list of addresses</agenthub.net>
// <agenthub.fsRead>~/.claude/task-runs — какие тикеты сейчас делают агенты (ночь и /ticket)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/task-runs — which tickets agents are working on (night runs and /ticket)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/sessions/*.json — в каких папках идут сессии, чтобы связать их с тикетами (ключи сессий не открываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/sessions/*.json — which folders sessions run in, to link them to tickets (session keys are never opened)</agenthub.fsRead>
// <agenthub.fsRead>.git/HEAD каталогов сессий — ветка сессии: по ней видно номер тикета</agenthub.fsRead>
// <agenthub.fsRead lang="en">.git/HEAD каталогов сессий — the session's branch: it shows the ticket number</agenthub.fsRead>
// <agenthub.fsRead>~/.cmuxterm/claude-hook-sessions.json — вкладка cmux сессии — для кнопки «Перейти»</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.cmuxterm/claude-hook-sessions.json — the session's cmux tab — for the Switch to tab button</agenthub.fsRead>
// <agenthub.effects>open.url,cmux.focus</agenthub.effects>
// <agenthub.push key="auth-failed">ClickUp: токен не принят</agenthub.push>
// <agenthub.push key="auth-failed" lang="en">ClickUp: token rejected</agenthub.push>
//
// Только GET и только пути из белого списка (ALLOWED_PATHS); записей в ClickUp нет и быть не может.
// Токен — из секрета clickup.token (ядро кладёт его в AGENTHUB_SECRET_CLICKUP_TOKEN); в вывод, кэш и журнал
// не попадает. Учёт X-RateLimit-Remaining / X-RateLimit-Reset; на 429 — экспоненциальный бэкофф.
//
// Настройки (необязательно): <AGENTHUB_PLUGIN_DATA_PATH>/config.json
//   { "teamIds": ["123"], "listIds": ["456"], "assignee": "me" | null, "limit": 15 }
//   по умолчанию — открытые тикеты на пользователя токена во всех его рабочих пространствах (до 3).
//
// Связь тикет ↔ работа (дизайн, раздел 4), по убыванию уверенности:
//   ночь    — точно:  ~/.claude/task-runs/night/projects/*/attempts/<id>.json, night/<дата>/<id>/agent.json,
//                     RUN.md ночного прогона (ветка night/…, каталог *-night, unattended);
//   /ticket — точно:  ~/.claude/task-runs/<repo>/<id>/RUN.md;
//   сессия  — точно, если RUN.md назвал session_id; сильно — ветка сессии содержит id тикета или совпала
//             с веткой RUN.md в том же репо; возможно — каталог сессии совпал с репо RUN.md, ветка не совпала.
//
// События: auth-failed (401/403), source-broken (незнакомая форма ответа).

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_BASE = "https://api.clickup.com";
export const ALLOWED_PATHS = [
  /^\/api\/v2\/user$/,
  /^\/api\/v2\/team$/,
  /^\/api\/v2\/team\/\d{1,20}\/task$/,
  /^\/api\/v2\/list\/\d{1,20}\/task$/,
  /^\/api\/v2\/task\/[A-Za-z0-9_-]{1,40}$/,
];
const ALLOWED_QUERY = new Set(["assignees[]", "include_closed", "subtasks", "order_by", "reverse", "page", "statuses[]", "custom_task_ids", "team_id"]);
const DEADLINE_MS = 4000; // standard-плагин живёт 5 с
const META_TTL_MS = 24 * 3600_000; // user и team
const RATE_FLOOR = 3; // осталось столько запросов — ждём сброса окна
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
const STALE_MS = 30 * 60_000;

// ---------- форматирование ----------
export function clean(s, max = 120) {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\|/g, "¦")
    .replace(/^[-\s]+/, "")
    .replace(/^~~~$/, "~")
    .slice(0, max);
}
function q(v) {
  return `"${String(v).replace(/[\\"]/g, "\\$&")}"`;
}
function line(title, params = {}) {
  const ps = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${/^[\w.:/+#-]+$/.test(String(v)) ? v : q(v)}`);
  return ps.length ? `${title} | ${ps.join(" ")}` : title;
}
// Язык — AGENTHUB_LANG (ru | en) от ядра; без переменной — ru.
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
let LANG = envLang();
export function setLang(l) {
  LANG = l === "en" ? "en" : "ru";
}
const EN = () => LANG === "en";
const tr = (ru, en) => (EN() ? en : ru);
const LOC = () => (EN() ? "en-US" : "ru-RU");
// Степень связи тикета с работой — код; подпись на языке.
export const CONFIDENCE = { certain: ["точно", "certain"], likely: ["вероятно", "likely"], possible: ["возможно", "possible"] };
const confText = (c) => (CONFIDENCE[c] ? CONFIDENCE[c][EN() ? 1 : 0] : c);
function fmtTime(ms, now) {
  const d = new Date(ms);
  const hm = d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date(now).toDateString() ? hm : `${d.toLocaleDateString(LOC(), EN() ? { month: "short", day: "numeric" } : { day: "2-digit", month: "2-digit" })} ${hm}`;
}
function fmtDate(ms, nowMs = Date.now()) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  if (EN()) return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return d.toLocaleDateString("ru-RU", sameYear ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" });
}
const plEn = (n, one, other) => (n === 1 ? one : other);
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- HTTP: только GET, только белый список ----------
export class ApiError extends Error {
  constructor(kind, status, extra = {}) {
    super(`${kind}${status ? ` ${status}` : ""}`);
    this.kind = kind; // auth | rate | http | net | shape | denied
    this.status = status;
    Object.assign(this, extra);
  }
}

// Подмена адреса — только на loopback (двойник в тестах). Иначе — настоящий API.
export function resolveBase(override) {
  if (typeof override === "string" && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(override)) return override;
  return API_BASE;
}

export function checkRequest(path, query = {}) {
  if (!ALLOWED_PATHS.some((re) => re.test(path))) throw new ApiError("denied", null, { path });
  for (const k of Object.keys(query)) if (!ALLOWED_QUERY.has(k)) throw new ApiError("denied", null, { path: `${path}?${k}` });
}

export function makeClient({ token, base = API_BASE, fetchImpl = globalThis.fetch, deadlineAt = Date.now() + DEADLINE_MS, onRate = () => {} }) {
  let requests = 0;
  return {
    get requests() {
      return requests;
    },
    async get(path, query = {}) {
      checkRequest(path, query);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, String(x));
      const url = `${base}${path}${qs.size ? `?${qs}` : ""}`;
      const left = deadlineAt - Date.now();
      if (left < 200) throw new ApiError("net", null, { reason: "deadline" });
      requests++;
      let res;
      try {
        res = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: token, Accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(left),
        });
      } catch (e) {
        throw new ApiError("net", null, { reason: e?.name === "TimeoutError" ? "timeout" : "network" });
      }
      const remaining = Number(res.headers.get("x-ratelimit-remaining"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      onRate({
        remaining: res.headers.has("x-ratelimit-remaining") && Number.isFinite(remaining) ? remaining : null,
        resetMs: res.headers.has("x-ratelimit-reset") && Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
      });
      if (res.status === 429) throw new ApiError("rate", 429);
      if (res.status === 401 || res.status === 403) throw new ApiError("auth", res.status);
      if (res.status < 200 || res.status >= 300) throw new ApiError("http", res.status);
      try {
        return await res.json();
      } catch {
        throw new ApiError("shape", res.status, { reason: "не JSON" });
      }
    },
  };
}

// ---------- ClickUp → тикеты ----------
function shapeError(what) {
  return new ApiError("shape", null, { reason: what });
}

export function pickTask(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string" || typeof t.name !== "string") throw shapeError("задача без id/name");
  const st = t.status && typeof t.status === "object" ? t.status : {};
  const url = typeof t.url === "string" && t.url.startsWith("https://app.clickup.com/") ? t.url : `https://app.clickup.com/t/${encodeURIComponent(t.id)}`;
  return {
    id: t.id,
    customId: typeof t.custom_id === "string" && t.custom_id ? t.custom_id : null,
    name: t.name,
    status: typeof st.status === "string" ? st.status : "?",
    statusColor: typeof st.color === "string" && /^#[0-9a-f]{3,8}$/i.test(st.color) ? st.color : null,
    statusType: typeof st.type === "string" ? st.type : null,
    url,
    list: t.list && typeof t.list.name === "string" ? t.list.name : null,
    updatedMs: Number(t.date_updated) || null,
    dueMs: Number(t.due_date) || null,
  };
}

export async function fetchTasks(client, cfg, state, now) {
  // пользователь и рабочие пространства — раз в сутки
  if (!state.user || now - state.user.at > META_TTL_MS) {
    const u = await client.get("/api/v2/user");
    if (!u || !u.user || u.user.id == null) throw shapeError("/user без user.id");
    state.user = { id: String(u.user.id), name: typeof u.user.username === "string" ? u.user.username : null, at: now };
  }
  let teamIds = Array.isArray(cfg.teamIds) && cfg.teamIds.length ? cfg.teamIds.map(String) : null;
  if (!teamIds && !(Array.isArray(cfg.listIds) && cfg.listIds.length)) {
    if (!state.teams || now - state.teams.at > META_TTL_MS) {
      const t = await client.get("/api/v2/team");
      if (!t || !Array.isArray(t.teams)) throw shapeError("/team без teams");
      state.teams = { ids: t.teams.map((x) => String(x.id)).filter((x) => /^\d+$/.test(x)).slice(0, 3), at: now };
    }
    teamIds = state.teams.ids;
  }
  const assignee = cfg.assignee === null ? null : state.user.id;
  const base = { include_closed: "false", subtasks: "true", order_by: "updated", page: "0" };
  if (assignee) base["assignees[]"] = [assignee];
  const tasks = new Map();
  const add = (list) => {
    if (!list || !Array.isArray(list.tasks)) throw shapeError("ответ без tasks");
    for (const t of list.tasks) {
      const p = pickTask(t);
      tasks.set(p.id, p);
    }
  };
  for (const id of (cfg.listIds || []).map(String).filter((x) => /^\d+$/.test(x)).slice(0, 5)) add(await client.get(`/api/v2/list/${id}/task`, base));
  for (const id of (teamIds || []).filter((x) => /^\d+$/.test(x))) add(await client.get(`/api/v2/team/${id}/task`, base));
  return [...tasks.values()];
}

// ---------- связь с работой ----------
function safeReaddir(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
function safeStat(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

const RUN_KEYS = new Set(["task_id", "task_ref", "branch", "repo_root", "worktree", "status", "outcome", "session_id", "unattended", "mode"]);

// RUN.md /ticket: только строки «ключ: значение» верхнего уровня из списка; шаги — только имя последнего.
export function parseRunMd(text) {
  const o = {};
  for (const raw of text.split("\n").slice(0, 400)) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(raw);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "step") {
      const s = /^([\w-]+)/.exec(v);
      if (s) o.lastStep = s[1];
    } else if (RUN_KEYS.has(k) && !(k in o)) o[k] = v.trim().slice(0, 200);
  }
  return o;
}

export function gitBranch(cwd) {
  let d = cwd;
  for (let i = 0; i < 12 && d && isAbsolute(d); i++) {
    const g = join(d, ".git");
    const st = safeStat(g);
    if (st) {
      let gitDir = g;
      if (st.isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(g, "utf8"));
        if (!m) return null;
        gitDir = resolve(d, m[1].trim());
      }
      try {
        const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
        const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
        return m ? m[1] : null;
      } catch {
        return null;
      }
    }
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

export function pidsAlive(pids) {
  const list = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  const out = new Set();
  if (!list.length) return out;
  // Сигнал 0: только проверка существования, процессу ничего не приходит. Работает и на Windows (без ps).
  // EPERM — процесс есть, но чужой: считаем живым.
  for (const pid of list) {
    try {
      process.kill(pid, 0);
      out.add(pid);
    } catch (e) {
      if (e && e.code === "EPERM") out.add(pid);
    }
  }
  return out;
}

// Сведения о работе на диске. → { runs: Map(id → [run]), attempts: Map(id → {outcome,date}), nightDirs: Map(id → date), sessions: [...] }
export function scanWork({ home = homedir(), alive = pidsAlive } = {}) {
  const tr = join(home, ".claude", "task-runs");
  const runs = new Map();
  const attempts = new Map();
  const nightDirs = new Map();
  const push = (m, k, v) => (m.has(k) ? m.get(k).push(v) : m.set(k, [v]));
  for (const repo of safeReaddir(tr)) {
    if (repo.startsWith(".") || repo === "night") continue;
    for (const d of safeReaddir(join(tr, repo))) {
      const p = join(tr, repo, d, "RUN.md");
      const st = safeStat(p);
      if (!st) continue;
      const id = d.split(".")[0].toLowerCase();
      let info;
      try {
        info = parseRunMd(readFileSync(p, "utf8"));
      } catch {
        continue;
      }
      const night = /-night$/.test(repo) || /^night\//.test(info.branch || "") || /^(true|yes|да)$/i.test(info.unattended || "");
      const r = { repo, dir: join(tr, repo, d), mtimeMs: st.mtimeMs, night, ...info };
      push(runs, id, r);
      for (const alt of [info.task_id, info.task_ref]) if (alt && alt.toLowerCase() !== id && /^[\w-]{3,40}$/.test(alt)) push(runs, alt.toLowerCase(), r);
    }
  }
  const nightRoot = join(tr, "night");
  for (const proj of safeReaddir(join(nightRoot, "projects"))) {
    for (const f of safeReaddir(join(nightRoot, "projects", proj, "attempts"))) {
      if (!f.endsWith(".json")) continue;
      try {
        const o = JSON.parse(readFileSync(join(nightRoot, "projects", proj, "attempts", f), "utf8"));
        attempts.set(f.slice(0, -5).toLowerCase(), { outcome: typeof o.outcome === "string" ? o.outcome : null, date: typeof o.date === "string" ? o.date : null, updatedMs: Number(o.updated_ms) || null });
      } catch {}
    }
  }
  for (const day of safeReaddir(nightRoot)) {
    if (!/^\d{8}$/.test(day)) continue;
    for (const d of safeReaddir(join(nightRoot, day))) if (existsSync(join(nightRoot, day, d, "agent.json"))) {
      const id = d.toLowerCase();
      if (!nightDirs.has(id) || nightDirs.get(id) < day) nightDirs.set(id, day);
    }
  }
  const sessions = [];
  const sdir = join(home, ".claude", "sessions");
  for (const f of safeReaddir(sdir)) {
    if (!/^\d+\.json$/.test(f)) continue; // *.key не читаем
    try {
      const o = JSON.parse(readFileSync(join(sdir, f), "utf8"));
      if (o && typeof o.sessionId === "string" && Number.isInteger(o.pid) && typeof o.cwd === "string") sessions.push({ pid: o.pid, sessionId: o.sessionId, cwd: o.cwd, name: typeof o.name === "string" ? o.name : null });
    } catch {}
  }
  const live = alive(sessions.map((s) => s.pid));
  const surfaces = readSurfaces(home);
  const liveSessions = sessions.filter((s) => live.has(s.pid)).map((s) => ({ ...s, branch: gitBranch(s.cwd), surface: surfaces.get(s.sessionId) || null }));
  return { runs, attempts, nightDirs, sessions: liveSessions };
}

// Вкладки cmux: только sessionId, surfaceId, workspaceId (lastBody и прочий текст не читаются).
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
export function readSurfaces(home) {
  const map = new Map();
  try {
    const o = JSON.parse(readFileSync(join(home, ".cmuxterm", "claude-hook-sessions.json"), "utf8"));
    for (const s of o && o.sessions && typeof o.sessions === "object" ? Object.values(o.sessions) : []) {
      if (s && typeof s.sessionId === "string" && UUID_RE.test(s.surfaceId || "") && UUID_RE.test(s.workspaceId || "")) map.set(s.sessionId, { surfaceId: s.surfaceId, workspaceId: s.workspaceId });
    }
  } catch {}
  return map;
}

function idRe(id) {
  return new RegExp(`(^|[^a-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
}
function within(dir, root) {
  if (!dir || !root || !isAbsolute(root)) return false;
  const r = root.replace(/\/+$/, "");
  return dir === r || dir.startsWith(r + "/");
}
function nightDate(s) {
  if (!/^\d{8}$/.test(s || "")) return s || "";
  return EN() ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(s.slice(4, 6)) - 1]} ${Number(s.slice(6, 8))}` : `${s.slice(6, 8)}.${s.slice(4, 6)}`;
}
function sessionLabel(s) {
  return s.name ? tr(`«${clean(s.name, 40)}»`, `"${clean(s.name, 40)}"`) : s.sessionId.slice(0, 8);
}

// → [{ kind: night|ticket|session, confidence: certain|likely|possible, text, sessionId? }]
export function linksFor(task, work) {
  const ids = [task.id, task.customId].filter(Boolean).map((x) => x.toLowerCase());
  const links = [];
  const seenSessions = new Set();
  const runs = ids.flatMap((id) => work.runs.get(id) || []).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const uniqRuns = [...new Map(runs.map((r) => [r.dir, r])).values()];
  // ночь
  const att = ids.map((id) => work.attempts.get(id)).find(Boolean);
  const nightDay = ids.map((id) => work.nightDirs.get(id)).find(Boolean);
  const nightRun = uniqRuns.find((r) => r.night);
  if (att) links.push({ kind: "night", confidence: "certain", text: `${tr("ночь", "night")}: ${clean(att.outcome || tr("попытка", "attempt"), 60)}${att.date ? `, ${nightDate(att.date)}` : ""}` });
  else if (nightRun) links.push({ kind: "night", confidence: "certain", text: `${tr("ночь", "night")}: ${clean(nightRun.outcome || nightRun.lastStep || tr("прогон", "run"), 60)}${nightRun.branch ? tr(`, ветка ${clean(nightRun.branch, 60)}`, `, branch ${clean(nightRun.branch, 60)}`) : ""}` });
  else if (nightDay) links.push({ kind: "night", confidence: "certain", text: tr(`ночь: прогон ${nightDate(nightDay)}`, `night: run ${nightDate(nightDay)}`) });
  // дневной /ticket
  const day = uniqRuns.find((r) => !r.night);
  if (day) {
    const what = day.outcome || (day.lastStep ? tr(`шаг ${day.lastStep}`, `step ${day.lastStep}`) : day.status || tr("прогон", "run"));
    links.push({ kind: "ticket", confidence: "certain", text: `/ticket: ${clean(what, 60)}${day.mode ? ` (${clean(day.mode, 20)})` : ""}` });
    const sid = day.session_id && /^[\w-]{8,64}$/.test(day.session_id) ? day.session_id : null;
    const exact = sid && work.sessions.find((s) => s.sessionId === sid);
    if (exact) {
      links.push({ kind: "session", confidence: "certain", sessionId: exact.sessionId, surface: exact.surface, text: tr(`сессия ${sessionLabel(exact)} (из RUN.md)`, `session ${sessionLabel(exact)} (from RUN.md)`) });
      seenSessions.add(exact.sessionId);
    }
    const root = day.worktree && isAbsolute(day.worktree.split(/\s/)[0]) ? day.worktree.split(/\s/)[0] : day.repo_root;
    for (const s of work.sessions) {
      if (seenSessions.has(s.sessionId) || !within(s.cwd, root)) continue;
      if (day.branch && s.branch && s.branch === day.branch.split(/\s/)[0]) {
        links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, surface: s.surface, text: tr(`сессия ${sessionLabel(s)}: ветка ${clean(s.branch, 60)} как в RUN.md`, `session ${sessionLabel(s)}: branch ${clean(s.branch, 60)} as in RUN.md`) });
        seenSessions.add(s.sessionId);
      }
    }
  }
  // сессии по ветке/каталогу с id тикета
  for (const s of work.sessions) {
    if (seenSessions.has(s.sessionId)) continue;
    const hit = ids.find((id) => (s.branch && idRe(id).test(s.branch)) || idRe(id).test(s.cwd));
    if (hit) {
      links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, surface: s.surface, text: `${tr("сессия", "session")} ${sessionLabel(s)}: ${s.branch && idRe(hit).test(s.branch) ? tr(`ветка ${clean(s.branch, 60)}`, `branch ${clean(s.branch, 60)}`) : tr("каталог", "folder")}` });
      seenSessions.add(s.sessionId);
    }
  }
  if (day && !links.some((l) => l.kind === "session")) {
    const root = day.repo_root;
    const s = work.sessions.find((x) => within(x.cwd, root));
    if (s && now() - day.mtimeMs < 6 * 3600_000) links.push({ kind: "session", confidence: "possible", sessionId: s.sessionId, surface: s.surface, text: tr(`сессия ${sessionLabel(s)} в том же репо`, `session ${sessionLabel(s)} in the same repo`) });
  }
  return links;
}
function now() {
  return Date.now();
}

// ---------- состояние между запусками ----------
function loadJson(p, fallback) {
  try {
    const o = JSON.parse(readFileSync(p, "utf8"));
    return o && typeof o === "object" ? o : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(p, o) {
  try {
    mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
    writeFileSync(p, JSON.stringify(o), { mode: 0o600 });
  } catch {}
}

// ---------- запуск ----------
export async function collect({ env = process.env, home = homedir(), nowMs = Date.now(), fetchImpl = globalThis.fetch, alive = pidsAlive } = {}) {
  const token = env.AGENTHUB_SECRET_CLICKUP_TOKEN;
  const dataDir = env.AGENTHUB_PLUGIN_DATA_PATH || null;
  const cacheDir = env.AGENTHUB_PLUGIN_CACHE_PATH || null;
  const cfg = dataDir ? loadJson(join(dataDir, "config.json"), {}) : {};
  const statePath = cacheDir ? join(cacheDir, "state.json") : null;
  const state = statePath ? loadJson(statePath, {}) : {};
  const r = { tokenMissing: !token, tasks: state.last?.tasks || [], fetchedAt: state.last?.at || null, error: null, pausedUntil: null, rate: state.rate || null, requests: 0, links: new Map(), limit: Math.min(50, Math.max(1, Number(cfg.limit) || 15)) };
  if (token) {
    const backoffUntil = state.backoff?.until || 0;
    const rateUntil = state.rate && state.rate.remaining !== null && state.rate.remaining <= RATE_FLOOR && state.rate.resetMs > nowMs ? state.rate.resetMs : 0;
    const until = Math.max(backoffUntil, rateUntil);
    if (until > nowMs) r.pausedUntil = until;
    else {
      const client = makeClient({
        token,
        base: resolveBase(env.AGENTHUB_CLICKUP_API_BASE),
        fetchImpl,
        deadlineAt: nowMs + DEADLINE_MS,
        onRate: (x) => {
          if (x.remaining !== null || x.resetMs !== null) state.rate = { remaining: x.remaining, resetMs: x.resetMs, at: nowMs };
        },
      });
      try {
        const tasks = await fetchTasks(client, cfg, state, nowMs);
        state.last = { at: nowMs, tasks };
        state.backoff = null;
        r.tasks = tasks;
        r.fetchedAt = nowMs;
      } catch (e) {
        const kind = e instanceof ApiError ? e.kind : "net";
        r.error = { kind, status: e.status ?? null, reason: e.reason || null };
        if (kind === "rate") {
          const n = (state.backoff?.n || 0) + 1;
          const wait = Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
          const resetMs = state.rate?.resetMs && state.rate.resetMs > nowMs ? state.rate.resetMs : 0;
          state.backoff = { n, until: Math.max(nowMs + wait, resetMs) };
          r.pausedUntil = state.backoff.until;
        }
        if (kind === "auth") state.user = null;
      }
      r.requests = client.requests;
      r.rate = state.rate || null;
    }
    if (statePath) saveJson(statePath, state);
  }
  if (r.tasks.length) {
    const work = scanWork({ home, alive });
    for (const t of r.tasks) r.links.set(t.id, linksFor(t, work));
  }
  return r;
}

// Шапка отвечает на «подключён ли ClickUp и что в работе». tile= — число тикетов для плитки.
export function render(r, { nowMs = Date.now(), limit = r.limit || 15, lang = LANG } = {}) {
  setLang(lang);
  const out = [];
  if (r.tokenMissing) {
    out.push(line(tr("ClickUp не подключён — нужен токен", "ClickUp isn't connected — a token is needed"), { status: "unknown", tile: "—", sfimage: "key.slash" }));
    out.push("---");
    out.push(line(tr("Как подключить", "How to connect"), { color: "gray" }));
    out.push(line(tr("--Заведите персональный токен ClickUp (Settings → Apps) и сохраните его в связке ключей как секрет clickup.token (сервис agent-hub.clickup)", "--Create a personal ClickUp token (Settings → Apps) and save it in the keychain as the clickup.token secret (service agent-hub.clickup)"), { color: "gray" }));
    return out.join("\n");
  }
  let status = "ok";
  const notes = [];
  let problem = null;
  if (r.error) {
    if (r.error.kind === "auth") {
      status = "error";
      problem = tr("ClickUp не принял токен — обновите его", "ClickUp rejected the token — update it");
      notes.push(line(tr(`Токен не принят (HTTP ${r.error.status})`, `Token rejected (HTTP ${r.error.status})`), { color: "red", event: "auth-failed" }));
    } else if (r.error.kind === "shape") {
      status = "unknown";
      problem = tr("ClickUp: не получилось загрузить тикеты", "ClickUp: couldn't load tickets");
      notes.push(line(tr("Ответ ClickUp не разобран", "Couldn't parse ClickUp's response"), { color: "orange", event: "source-broken" }));
      if (r.error.reason) notes.push(line(`--${clean(r.error.reason, 80)}`, { color: "gray" }));
    } else if (r.error.kind === "rate") {
      notes.push(line(tr(`Лимит запросов ClickUp (429), пауза до ${fmtTime(r.pausedUntil, nowMs)}`, `ClickUp rate limit (429), pausing until ${fmtTime(r.pausedUntil, nowMs)}`), { color: "orange" }));
    } else if (r.error.kind === "denied") {
      status = "error";
      problem = tr("Хаб не пустил запрос к ClickUp: адрес не в списке разрешённых", "The hub blocked a ClickUp request: address not allowed");
      notes.push(line(problem, { color: "red" }));
    } else {
      notes.push(line(tr(`Нет связи с ClickUp${r.error.status ? ` (HTTP ${r.error.status})` : r.error.reason ? ` (${clean(r.error.reason, 20)})` : ""}`, `Can't reach ClickUp${r.error.status ? ` (HTTP ${r.error.status})` : r.error.reason ? ` (${clean(r.error.reason, 20)})` : ""}`), { color: "orange" }));
    }
  } else if (r.pausedUntil) {
    notes.push(line(tr(`Пауза до ${fmtTime(r.pausedUntil, nowMs)}: бережём лимит запросов`, `Paused until ${fmtTime(r.pausedUntil, nowMs)} to save the rate limit`), { color: "gray" }));
  }
  const stale = !r.fetchedAt || nowMs - r.fetchedAt > STALE_MS;
  if (stale && status === "ok" && (r.error || r.pausedUntil)) status = "unknown";

  const tasks = [...r.tasks];
  const linked = (t) => (r.links.get(t.id) || []).length;
  tasks.sort((a, b) => (linked(b) > 0) - (linked(a) > 0) || (b.updatedMs || 0) - (a.updatedMs || 0));
  const working = tasks.filter((t) => (r.links.get(t.id) || []).some((l) => l.kind === "session" || l.kind === "ticket")).length;
  const n = tasks.length;
  const title = problem || (EN() ? `ClickUp: ${n} ${plEn(n, "ticket", "tickets")}${working ? `, ${working} in progress` : ""}` : `ClickUp: ${n} ${plural(n, "тикет", "тикета", "тикетов")}${working ? `, в работе ${working}` : ""}`);
  out.push(line(title, { status, tile: String(n), sfimage: "checklist" }));
  out.push("---");
  out.push(...notes);
  if (notes.length) out.push("---");
  if (!tasks.length) out.push(line(r.fetchedAt ? tr("Открытых тикетов нет", "No open tickets") : tr("Тикеты ещё не загружены", "Tickets not loaded yet"), { color: "gray" }));
  for (const t of tasks.slice(0, limit)) {
    const ref = t.customId || t.id;
    out.push(line(`${clean(ref, 30)} ${clean(t.name, 80)} — ${clean(t.status, 30)}`, { href: t.url, color: t.statusColor }));
    for (const l of r.links.get(t.id) || []) {
      const params = l.confidence === "possible" ? { color: "gray" } : {};
      // строка связи с сессией — сразу переход во вкладку (cmux.focus; ядро сверит вкладку со своими фактами)
      if (l.surface) params.effect = `cmux.focus ${l.surface.surfaceId} workspaceId=${l.surface.workspaceId}`;
      out.push(line(`--${l.text} · ${confText(l.confidence)}`, params));
    }
    if (t.list) out.push(line(tr(`--Список: ${clean(t.list, 60)}`, `--List: ${clean(t.list, 60)}`), { color: "gray" }));
    if (t.dueMs) out.push(line(tr(`--Срок: ${fmtDate(t.dueMs, nowMs)}`, `--Due: ${fmtDate(t.dueMs, nowMs)}`), t.dueMs < nowMs ? { color: "red" } : { color: "gray" }));
  }
  if (tasks.length > limit) out.push(line(tr(`…и ещё ${tasks.length - limit}`, `…and ${tasks.length - limit} more`), { color: "gray" }));
  out.push("---");
  const parts = [];
  if (r.fetchedAt) parts.push(tr(`обновлено ${fmtTime(r.fetchedAt, nowMs)}`, `updated ${fmtTime(r.fetchedAt, nowMs)}`));
  if (r.rate && r.rate.remaining !== null) parts.push(tr(`лимит API: осталось ${r.rate.remaining}`, `API limit: ${r.rate.remaining} left`));
  if (parts.length) out.push(line(parts.join(" · "), { color: "gray" }));
  return out.join("\n");
}

async function main() {
  let text;
  try {
    const nowMs = Date.now();
    const r = await collect({ nowMs });
    text = render(r, { nowMs });
  } catch (e) {
    text = [line(tr("ClickUp: не получилось загрузить тикеты", "ClickUp: couldn't load tickets"), { status: "unknown", event: "source-broken" }), "---", line(clean(e.message), { color: "gray" })].join("\n");
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
