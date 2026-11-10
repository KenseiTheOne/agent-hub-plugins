#!/usr/bin/env node
// <agenthub.title>ClickUp</agenthub.title>
// <agenthub.version>1.5.0</agenthub.version>
// <agenthub.contract>3</agenthub.contract>
// <agenthub.icon symbol="checklist" color="#FF375F"></agenthub.icon>
// <agenthub.desc>Ваши тикеты ClickUp и какие из них сейчас в работе у агентов (ночь, /ticket, сессии). Только чтение</agenthub.desc>
// <agenthub.desc lang="en">Your ClickUp tickets and which ones agents are working on (night, /ticket, sessions). Read-only</agenthub.desc>
// <agenthub.status value="ok" label="Тикеты загружены">Список тикетов свежий</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Tickets loaded">The ticket list is up to date</agenthub.status>
// <agenthub.status value="error" label="Подключите снова или нет доступа">Вход в ClickUp истёк или отозван, ClickUp отклонил токен или закрыл доступ к рабочему пространству, или хаб не пустил запрос</agenthub.status>
// <agenthub.status value="error" lang="en" label="Reconnect / no access">The ClickUp sign-in expired or was revoked, ClickUp rejected the token or closed access to the workspace, or the hub blocked a request</agenthub.status>
// <agenthub.status value="unknown" label="Не подключён или нет связи">ClickUp не подключён (ни входа, ни токена) или не отвечает</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Not connected / offline">ClickUp isn't connected (no sign-in, no token), or isn't responding</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos,windows</agenthub.platforms>
// <agenthub.secrets>clickup.token — запасной путь: ваш личный токен ClickUp, только чтобы читать тикеты</agenthub.secrets>
// <agenthub.secrets lang="en">clickup.token — fallback: your personal ClickUp token, only to read tickets</agenthub.secrets>
// <agenthub.net>mcp.clickup.com — тикеты через вход в ClickUp («Подключить ClickUp»): запросы делает хаб, плагин токена не видит; только чтение, раз в 15 мин</agenthub.net>
// <agenthub.net lang="en">mcp.clickup.com — tickets via the ClickUp sign-in (Connect ClickUp): the hub makes the requests, the plugin never sees the token; read-only, every 15 min</agenthub.net>
// <agenthub.net>api.clickup.com — запасной путь по личному токену: запросы к ClickUp только на чтение и только по заранее заданному списку адресов</agenthub.net>
// <agenthub.net lang="en">api.clickup.com — fallback with a personal token: read-only requests to ClickUp, only to a fixed list of addresses</agenthub.net>
// <agenthub.fsRead>~/.claude/task-runs — какие тикеты сейчас делают агенты (ночь и /ticket)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/task-runs — which tickets agents are working on (night runs and /ticket)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/sessions/*.json — в каких папках идут сессии, чтобы связать их с тикетами (ключи сессий не открываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/sessions/*.json — which folders sessions run in, to link them to tickets (session keys are never opened)</agenthub.fsRead>
// <agenthub.fsRead><session cwd>/.git/HEAD — ветка сессии: по ней видно номер тикета</agenthub.fsRead>
// <agenthub.fsRead lang="en"><session cwd>/.git/HEAD — the session's branch: it shows the ticket number</agenthub.fsRead>
// <agenthub.effects>open.url,session.focus</agenthub.effects>
// <agenthub.connection id="clickup" type="mcp" url="https://mcp.clickup.com/mcp" scope="read" title="ClickUp" tools="clickup_filter_tasks" interval="15m" budget="100">ваши открытые тикеты ClickUp: только чтение, один инструмент — список тикетов</agenthub.connection>
// <agenthub.connection lang="en" id="clickup" title="ClickUp">your open ClickUp tickets: read-only, one tool — the ticket list</agenthub.connection>
// <agenthub.push key="auth-failed" kind="problems">ClickUp: токен не принят</agenthub.push>
// <agenthub.push key="auth-failed" kind="problems" lang="en">ClickUp: token rejected</agenthub.push>
// <agenthub.push key="login-expired" kind="problems">ClickUp: вход истёк — подключите снова</agenthub.push>
// <agenthub.push key="login-expired" kind="problems" lang="en">ClickUp: sign-in expired — reconnect</agenthub.push>
//
// Two paths to the data (since 1.2.0). The main one is the ClickUp sign-in through the hub: the Connect ClickUp button
// (the plugin page, Settings → Connections), the official MCP server mcp.clickup.com, OAuth done by the core (the oauth
// service). The plugin calls the clickup_filter_tasks tool through the hub socket (POST /connections/clickup/mcp, the
// AGENTHUB_HUB_SOCKET variable — the core gives it to trusted plugins only); the token stays in the core. Since 1.3.0
// (contract 2) the plugin declares the connection itself — the <agenthub.connection> tag above: address, scope, an
// allowlist of one tool, a 15-min interval and a budget of 100 calls a day (ClickUp Free allows about 100 MCP calls a
// day); the core knows nothing else about ClickUp and keeps the rate per the declaration (backoff on the limit is the
// core's too); the plugin shows when the next refresh is and why it is less frequent. The fallback is a personal token
// (REST v2), as before: used when there is no sign-in.
//
// GET only and only paths from the allowlist (ALLOWED_PATHS); there are no writes to ClickUp and there cannot be any.
// The token comes from the clickup.token secret (the core puts it in AGENTHUB_SECRET_CLICKUP_TOKEN); it never reaches
// the output, cache or log. X-RateLimit-Remaining / X-RateLimit-Reset are honoured; on 429 — exponential backoff.
//
// Settings (optional): <AGENTHUB_PLUGIN_DATA_PATH>/config.json
//   { "teamIds": ["123"], "listIds": ["456"], "assignee": "me" | null, "limit": 15 }
//   by default — open tickets assigned to the token's user in all of their workspaces (up to 3).
//
// Ticket ↔ work link (design, section 4), by decreasing confidence:
//   night   — certain: ~/.claude/task-runs/night/projects/*/attempts/<id>.json, night/<date>/<id>/agent.json,
//                      RUN.md of a night run (branch night/…, folder *-night, unattended);
//   /ticket — certain: ~/.claude/task-runs/<repo>/<id>/RUN.md;
//   session — certain if RUN.md names session_id; strong — the session branch contains the ticket id or matches
//             the RUN.md branch in the same repo; possible — the session folder matches the RUN.md repo, the branch doesn't.
//
// Events: auth-failed (401/403 on /user — token rejected), source-broken (unfamiliar response shape).
// 401/403 on the tickets of one workspace or list while the token is accepted (/user answers) — a denial for that scope:
// its tickets are skipped, the rest are collected, and the workspace list is re-requested next time.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_BASE = "https://api.clickup.com";
// Command for the clickup.token secret (the core's secrets service: -s agent-hub.<service> -a <entry>).
export const SECRET_CMD = "security add-generic-password -s agent-hub.clickup -a token -T /usr/bin/security -w";
export const ALLOWED_PATHS = [
  /^\/api\/v2\/user$/,
  /^\/api\/v2\/team$/,
  /^\/api\/v2\/team\/\d{1,20}\/task$/,
  /^\/api\/v2\/list\/\d{1,20}\/task$/,
  /^\/api\/v2\/task\/[A-Za-z0-9_-]{1,40}$/,
];
const ALLOWED_QUERY = new Set(["assignees[]", "include_closed", "subtasks", "order_by", "reverse", "page", "statuses[]", "custom_task_ids", "team_id"]);
const DEADLINE_MS = 4000; // a standard plugin lives 5 s
const META_TTL_MS = 24 * 3600_000; // user and team
const RATE_FLOOR = 3; // this many requests left — wait for the window to reset
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
const STALE_MS = 30 * 60_000;
const MCP_WAIT_MS = 3600; // hub reply to an MCP call (the service waits for ClickUp up to 3 s, then answers "loading")
// Task fields requested from clickup_filter_tasks (besides id, name, url) — a smaller response, less parsing.
export const MCP_FIELDS = ["custom_id", "status", "due_date", "date_updated", "list", "priority"];

// ---------- formatting ----------
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
// Language — AGENTHUB_LANG (ru | en) from the core; without the variable — ru.
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
// How strongly a ticket is linked to work — a code; the label is per language.
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

// ---------- HTTP: GET only, allowlist only ----------
export class ApiError extends Error {
  constructor(kind, status, extra = {}) {
    super(`${kind}${status ? ` ${status}` : ""}`);
    this.kind = kind; // auth | rate | http | net | shape | denied | scope
    this.status = status;
    Object.assign(this, extra);
  }
}

// The base address can be overridden only with loopback (the test double). Otherwise — the real API.
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
        throw new ApiError("shape", res.status, { reason: "not-json" });
      }
    },
  };
}

// ---------- ClickUp → tickets ----------
// reason is a code (render translates it via SHAPE_TEXT), not a ready string.
function shapeError(what) {
  return new ApiError("shape", null, { reason: what });
}
const SHAPE_TEXT = {
  "not-json": ["ответ не JSON", "the response isn't JSON"],
  "task-no-id": ["задача без id/name", "a task without id/name"],
  "user-no-id": ["/user без user.id", "/user without user.id"],
  "team-no-teams": ["/team без teams", "/team without teams"],
  "no-tasks": ["ответ без tasks", "a response without tasks"],
  "mcp-no-result": ["хаб вернул пустой ответ", "the hub returned an empty response"],
  "mcp-not-json": ["ответ инструмента не JSON", "the tool response isn't JSON"],
};
const shapeText = (code) => (SHAPE_TEXT[code] ? SHAPE_TEXT[code][EN() ? 1 : 0] : code);

// ClickUp priority: an object {priority: "urgent"|"high"|"normal"|"low"}, a string or a number 1…4 (1 — urgent) → code or null.
const PRIORITIES = ["urgent", "high", "normal", "low"];
export function pickPriority(v) {
  const x = v && typeof v === "object" ? (v.priority ?? v.id) : v;
  if (typeof x === "string" && PRIORITIES.includes(x.toLowerCase())) return x.toLowerCase();
  const n = Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? PRIORITIES[n - 1] : null;
}

export function pickTask(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string" || typeof t.name !== "string") throw shapeError("task-no-id");
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
    priority: pickPriority(t.priority),
  };
}

// info.denied — [{ scope: "team"|"list", id, status }]: workspaces and lists that denied access while the token
// was accepted. All denied — ApiError("scope").
export async function fetchTasks(client, cfg, state, now, info = {}, { retried = false } = {}) {
  // user and workspaces — once a day
  let userFresh = false;
  if (!state.user || now - state.user.at > META_TTL_MS) {
    const u = await client.get("/api/v2/user");
    if (!u || !u.user || u.user.id == null) throw shapeError("user-no-id");
    state.user = { id: String(u.user.id), name: typeof u.user.username === "string" ? u.user.username : null, at: now };
    userFresh = true;
  }
  let teamIds = Array.isArray(cfg.teamIds) && cfg.teamIds.length ? cfg.teamIds.map(String) : null;
  if (!teamIds && !(Array.isArray(cfg.listIds) && cfg.listIds.length)) {
    if (!state.teams || now - state.teams.at > META_TTL_MS) {
      const t = await client.get("/api/v2/team");
      if (!t || !Array.isArray(t.teams)) throw shapeError("team-no-teams");
      state.teams = { ids: t.teams.map((x) => String(x.id)).filter((x) => /^\d+$/.test(x)).slice(0, 3), at: now };
    }
    teamIds = state.teams.ids;
  }
  const assignee = cfg.assignee === null ? null : state.user.id;
  const base = { include_closed: "false", subtasks: "true", order_by: "updated", page: "0" };
  if (assignee) base["assignees[]"] = [assignee];
  const tasks = new Map();
  const add = (list) => {
    if (!list || !Array.isArray(list.tasks)) throw shapeError("no-tasks");
    for (const t of list.tasks) {
      const p = pickTask(t);
      tasks.set(p.id, p);
    }
  };
  const scopes = [
    ...(cfg.listIds || []).map(String).filter((x) => /^\d+$/.test(x)).slice(0, 5).map((id) => ({ scope: "list", id, path: `/api/v2/list/${id}/task` })),
    ...(teamIds || []).filter((x) => /^\d+$/.test(x)).map((id) => ({ scope: "team", id, path: `/api/v2/team/${id}/task` })),
  ];
  const denied = [];
  const keyOf = (d) => `${d.scope}:${d.id}`;
  // denials already confirmed with a verified token (no older than a day) — not re-checked on every run
  const known = new Set(state.denied && now - state.denied.at <= META_TTL_MS && Array.isArray(state.denied.ids) ? state.denied.ids : []);
  for (const sc of scopes) {
    try {
      add(await client.get(sc.path, base));
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== "auth") throw e;
      // The token was verified in this run (/user answered) — this is a denial for the workspace or list. The user
      // came from the cache — re-verify the token: /user gives auth on 401, and a new id and new teams for another account.
      if (!userFresh && !retried && !known.has(keyOf(sc))) {
        state.user = null;
        state.teams = null;
        return fetchTasks(client, cfg, state, now, info, { retried: true });
      }
      denied.push({ scope: sc.scope, id: sc.id, status: e.status });
    }
  }
  info.denied = denied;
  const fresh = denied.filter((d) => !known.has(keyOf(d)));
  state.denied = denied.length ? { ids: denied.map(keyOf), at: fresh.length || !state.denied ? now : state.denied.at } : null;
  // the workspace may have left /team (the user was removed) — re-request the team list next time
  if (fresh.some((d) => d.scope === "team") && state.teams && !(Array.isArray(cfg.teamIds) && cfg.teamIds.length)) state.teams = null;
  if (scopes.length && denied.length === scopes.length) throw new ApiError("scope", denied[0].status, { denied });
  return [...tasks.values()];
}

// ---------- ClickUp sign-in through the hub (MCP) ----------
// Request to the hub over its socket: POST /connections/clickup/mcp. The plugin has no token — the core adds it.
// → { status, body } or { status: 0, error } (the hub didn't answer).
export function hubMcp(socketPath, payload, { timeoutMs = MCP_WAIT_MS, requestImpl = null } = {}) {
  return new Promise(async (resolve) => {
    const { request } = requestImpl || (await import("node:http"));
    const data = JSON.stringify(payload);
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const rq = request(
      { socketPath, path: "/connections/clickup/mcp", method: "POST", timeout: timeoutMs, headers: { Host: "hub", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let s = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          s += c;
          if (s.length > 4 * 1024 * 1024) rq.destroy();
        });
        res.on("end", () => {
          let body = null;
          try {
            body = JSON.parse(s);
          } catch {}
          finish({ status: res.statusCode, body });
        });
      },
    );
    rq.on("timeout", () => {
      rq.destroy();
      finish({ status: 0, error: "timeout" });
    });
    rq.on("error", (e) => finish({ status: 0, error: e?.code || "error" }));
    rq.end(data);
  });
}

// clickup_filter_tasks arguments: one call per poll. The server understands the assignee "me" itself (no clickup_get_user).
// The sign-in path takes one workspace — the first of teamIds (the others only with a personal token, see README).
export function mcpArgs(cfg) {
  const a = { include_closed: false, subtasks: true, order_by: "updated", fields: MCP_FIELDS };
  if (cfg.assignee !== null) a.assignees = ["me"];
  const lists = (cfg.listIds || []).map(String).filter((x) => /^\d+$/.test(x)).slice(0, 5);
  if (lists.length) a.list_ids = lists;
  // several workspaces — the server requires workspace_id; take the first from the settings (one call per poll)
  const team = (cfg.teamIds || []).map(String).find((x) => /^\d+$/.test(x));
  if (team) a.workspace_id = team;
  return a;
}

const msOf = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n < 1e11 ? n * 1000 : n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

// A task from the tool response: the fields are as in REST, but the shape may differ (status — a string or an object,
// list — a string or an object, dates — ms, seconds or ISO). Without id/name — an unfamiliar shape.
export function pickMcpTask(t) {
  if (!t || typeof t !== "object" || (typeof t.id !== "string" && typeof t.id !== "number") || typeof t.name !== "string") throw shapeError("task-no-id");
  const id = String(t.id);
  const st = t.status && typeof t.status === "object" ? t.status : { status: typeof t.status === "string" ? t.status : null };
  const url = typeof t.url === "string" && t.url.startsWith("https://app.clickup.com/") ? t.url : `https://app.clickup.com/t/${encodeURIComponent(id)}`;
  const list = t.list && typeof t.list === "object" ? t.list.name : typeof t.list === "string" ? t.list : typeof t.list_name === "string" ? t.list_name : null;
  return {
    id,
    customId: typeof t.custom_id === "string" && t.custom_id ? t.custom_id : null,
    name: t.name,
    status: typeof st.status === "string" ? st.status : "?",
    statusColor: typeof st.color === "string" && /^#[0-9a-f]{3,8}$/i.test(st.color) ? st.color : null,
    statusType: typeof st.type === "string" ? st.type : null,
    url,
    list: typeof list === "string" ? list : null,
    updatedMs: msOf(t.date_updated),
    dueMs: msOf(t.due_date),
    priority: pickPriority(t.priority),
  };
}

// A ClickUp tool error (isError or error=mcp:tool-error from the core) → { kind: "tool", reason: ClickUp's text,
// workspace: the server requires workspace_id — several workspaces without teamIds }.
export function toolError(text) {
  const t = clean(text || "", 120);
  return { kind: "tool", status: null, reason: t || null, workspace: /workspace[_ ]?id/i.test(String(text || "")) };
}
function resultText(result) {
  return (Array.isArray(result?.content) ? result.content : []).map((c) => (c && typeof c.text === "string" ? c.text : "")).join(" ");
}

// Tool result → tasks. structuredContent or text with JSON: an array, {tasks}, {data: {tasks}}.
export function tasksFromMcp(result) {
  if (!result || typeof result !== "object") throw shapeError("mcp-no-result");
  // a tool error is not an "unfamiliar shape": ClickUp's text goes to the output (hubs older than Nov 9 return it as a result)
  if (result.isError) {
    const e = toolError(resultText(result));
    throw new ApiError("tool", null, { reason: e.reason, workspace: e.workspace });
  }
  let data = result.structuredContent && typeof result.structuredContent === "object" ? result.structuredContent : null;
  if (!data) {
    const text = (Array.isArray(result.content) ? result.content : []).find((c) => c && c.type === "text" && typeof c.text === "string")?.text;
    try {
      data = JSON.parse(text);
    } catch {
      throw shapeError("mcp-not-json");
    }
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data?.data?.tasks) ? data.data.tasks : null;
  if (!list) throw shapeError("no-tasks");
  return list.map(pickMcpTask);
}

// ---------- link to work ----------
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

// /ticket RUN.md: only top-level "key: value" lines from the list; of the steps — only the last one's name.
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
  // Signal 0: only an existence check, nothing is delivered to the process. Works on Windows too (no ps).
  // EPERM — the process exists but belongs to someone else: count it as alive.
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

// Work info on disk. → { runs: Map(id → [run]), attempts: Map(id → {outcome,date}), nightDirs: Map(id → date), sessions: [...] }
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
    if (!/^\d+\.json$/.test(f)) continue; // *.key files are never read
    try {
      const o = JSON.parse(readFileSync(join(sdir, f), "utf8"));
      if (o && typeof o.sessionId === "string" && Number.isInteger(o.pid) && typeof o.cwd === "string") sessions.push({ pid: o.pid, sessionId: o.sessionId, cwd: o.cwd, name: typeof o.name === "string" ? o.name : null });
    } catch {}
  }
  const live = alive(sessions.map((s) => s.pid));
  const liveSessions = sessions.filter((s) => live.has(s.pid)).map((s) => ({ ...s, branch: gitBranch(s.cwd) }));
  return { runs, attempts, nightDirs, sessions: liveSessions };
}

// sessionId for session.focus — UUID only (the hub effect accepts only that; the hub finds the tab).
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

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
  // night
  const att = ids.map((id) => work.attempts.get(id)).find(Boolean);
  const nightDay = ids.map((id) => work.nightDirs.get(id)).find(Boolean);
  const nightRun = uniqRuns.find((r) => r.night);
  if (att) links.push({ kind: "night", confidence: "certain", text: `${tr("ночь", "night")}: ${clean(att.outcome || tr("попытка", "attempt"), 60)}${att.date ? `, ${nightDate(att.date)}` : ""}` });
  else if (nightRun) links.push({ kind: "night", confidence: "certain", text: `${tr("ночь", "night")}: ${clean(nightRun.outcome || nightRun.lastStep || tr("прогон", "run"), 60)}${nightRun.branch ? tr(`, ветка ${clean(nightRun.branch, 60)}`, `, branch ${clean(nightRun.branch, 60)}`) : ""}` });
  else if (nightDay) links.push({ kind: "night", confidence: "certain", text: tr(`ночь: прогон ${nightDate(nightDay)}`, `night: run ${nightDate(nightDay)}`) });
  // daytime /ticket
  const day = uniqRuns.find((r) => !r.night);
  if (day) {
    const what = day.outcome || (day.lastStep ? tr(`шаг ${day.lastStep}`, `step ${day.lastStep}`) : day.status || tr("прогон", "run"));
    links.push({ kind: "ticket", confidence: "certain", text: `/ticket: ${clean(what, 60)}${day.mode ? ` (${clean(day.mode, 20)})` : ""}` });
    const sid = day.session_id && /^[\w-]{8,64}$/.test(day.session_id) ? day.session_id : null;
    const exact = sid && work.sessions.find((s) => s.sessionId === sid);
    if (exact) {
      links.push({ kind: "session", confidence: "certain", sessionId: exact.sessionId, label: sessionLabel(exact), text: tr(`сессия ${sessionLabel(exact)} (из RUN.md)`, `session ${sessionLabel(exact)} (from RUN.md)`) });
      seenSessions.add(exact.sessionId);
    }
    const root = day.worktree && isAbsolute(day.worktree.split(/\s/)[0]) ? day.worktree.split(/\s/)[0] : day.repo_root;
    for (const s of work.sessions) {
      if (seenSessions.has(s.sessionId) || !within(s.cwd, root)) continue;
      if (day.branch && s.branch && s.branch === day.branch.split(/\s/)[0]) {
        links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, label: sessionLabel(s), text: tr(`сессия ${sessionLabel(s)}: ветка ${clean(s.branch, 60)} как в RUN.md`, `session ${sessionLabel(s)}: branch ${clean(s.branch, 60)} as in RUN.md`) });
        seenSessions.add(s.sessionId);
      }
    }
  }
  // sessions by a branch/folder with the ticket id
  for (const s of work.sessions) {
    if (seenSessions.has(s.sessionId)) continue;
    const hit = ids.find((id) => (s.branch && idRe(id).test(s.branch)) || idRe(id).test(s.cwd));
    if (hit) {
      links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, label: sessionLabel(s), text: `${tr("сессия", "session")} ${sessionLabel(s)}: ${s.branch && idRe(hit).test(s.branch) ? tr(`ветка ${clean(s.branch, 60)}`, `branch ${clean(s.branch, 60)}`) : tr("каталог", "folder")}` });
      seenSessions.add(s.sessionId);
    }
  }
  if (day && !links.some((l) => l.kind === "session")) {
    const root = day.repo_root;
    const s = work.sessions.find((x) => within(x.cwd, root));
    if (s && now() - day.mtimeMs < 6 * 3600_000) links.push({ kind: "session", confidence: "possible", sessionId: s.sessionId, label: sessionLabel(s), text: tr(`сессия ${sessionLabel(s)} в том же репо`, `session ${sessionLabel(s)} in the same repo`) });
  }
  return links;
}
function now() {
  return Date.now();
}

// ---------- state between runs ----------
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

// ---------- run ----------
export async function collect({ env = process.env, home = homedir(), nowMs = Date.now(), fetchImpl = globalThis.fetch, alive = pidsAlive, hubCall = hubMcp } = {}) {
  const token = env.AGENTHUB_SECRET_CLICKUP_TOKEN;
  // hub socket: the core gives this variable only to trusted plugins and only with the oauth service enabled
  const sock = typeof env.AGENTHUB_HUB_SOCKET === "string" && env.AGENTHUB_HUB_SOCKET.startsWith("/") ? env.AGENTHUB_HUB_SOCKET : null;
  const dataDir = env.AGENTHUB_PLUGIN_DATA_PATH || null;
  const cacheDir = env.AGENTHUB_PLUGIN_CACHE_PATH || null;
  const cfg = dataDir ? loadJson(join(dataDir, "config.json"), {}) : {};
  const statePath = cacheDir ? join(cacheDir, "state.json") : null;
  const state = statePath ? loadJson(statePath, {}) : {};
  const r = { tokenMissing: false, mode: null, oauth: null, connectInHub: Boolean(sock), tasks: state.last?.tasks || [], fetchedAt: state.last?.at || null, error: null, pausedUntil: null, rate: state.rate || null, requests: 0, links: new Map(), limit: Math.min(50, Math.max(1, Number(cfg.limit) || 15)) };
  let dirty = false;
  // 1. ClickUp sign-in through the hub (MCP): the core keeps the rate, the limit and the token
  if (sock) {
    const res = await hubCall(sock, { tool: "clickup_filter_tasks", args: mcpArgs(cfg) });
    const b = res.body && typeof res.body === "object" ? res.body : {};
    if (res.status === 200) {
      r.mode = "oauth";
      r.oauth = {
        fetchedAt: msOf(b.fetchedAt),
        nextAt: msOf(b.nextAt),
        why: typeof b.why === "string" ? b.why : null,
        intervalMs: Number(b.intervalMs) || null,
        calls24h: Number.isFinite(b.calls24h) ? b.calls24h : null,
        dailyBudget: Number(b.dailyBudget) || null,
        pending: b.pending === true,
        error: typeof b.error === "string" ? b.error : null,
        errorText: typeof b.errorText === "string" ? b.errorText : null,
      };
      r.rate = null;
      if (b.ok && b.result) {
        try {
          const tasks = tasksFromMcp(b.result);
          r.tasks = tasks;
          r.fetchedAt = r.oauth.fetchedAt || nowMs;
          state.last = { at: r.fetchedAt, tasks };
          state.mode = "oauth";
          dirty = true;
        } catch (e) {
          r.error = { kind: e instanceof ApiError ? e.kind : "shape", status: null, reason: e.reason || null, ...(e.workspace ? { workspace: true } : {}) };
        }
      }
      // a tool error and "no access" — even with a previous result from the core's memory: the data isn't refreshing
      const hard = r.oauth.error === "mcp:tool-error" || r.oauth.error === "mcp:forbidden";
      if (!r.error && r.oauth.error && r.oauth.error !== "mcp:rate-limited" && (hard || !(b.ok && b.result))) r.error = mcpError(r.oauth.error, r.oauth.errorText);
    } else if (res.status === 409 && b.error === "oauth:expired") {
      r.oauth = { expired: true };
    } else if (res.status === 403 || res.status === 400 || res.status === 413) {
      // the hub blocked the call (core policy: not trusted, no net permission, tool not on the list)
      r.oauth = { denied: typeof b.error === "string" ? b.error : `http-${res.status}` };
    }
    // 409 not-connected / unavailable, 404 (hub without the oauth service), no answer — no sign-in: fall through to the personal token
  }
  // 2. fallback — a personal token (REST v2), if there is no sign-in through the hub
  if (!r.mode && token) {
    r.mode = "token";
    dirty = true;
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
        const info = {};
        const tasks = await fetchTasks(client, cfg, state, nowMs, info);
        state.last = { at: nowMs, tasks };
        state.mode = "token";
        state.backoff = null;
        r.tasks = tasks;
        r.fetchedAt = nowMs;
        r.denied = info.denied || [];
      } catch (e) {
        const kind = e instanceof ApiError ? e.kind : "net";
        r.error = { kind, status: e.status ?? null, reason: e.reason || null, denied: e.denied || null };
        if (kind === "rate") {
          const n = (state.backoff?.n || 0) + 1;
          const wait = Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
          const resetMs = state.rate?.resetMs && state.rate.resetMs > nowMs ? state.rate.resetMs : 0;
          state.backoff = { n, until: Math.max(nowMs + wait, resetMs) };
          r.pausedUntil = state.backoff.until;
        }
        // token rejected: both the cached user and the cached workspaces may belong to the previous token
        if (kind === "auth") {
          state.user = null;
          state.teams = null;
          state.denied = null;
        }
      }
      r.requests = client.requests;
      r.rate = state.rate || null;
    }
  }
  if (statePath && dirty) saveJson(statePath, state);
  // neither sign-in nor token: "not connected" (an expired sign-in gets its own "reconnect" banner)
  if (!r.mode && !r.oauth?.expired) r.tokenMissing = true;
  if (r.tokenMissing) r.tasks = [];
  if (r.tasks.length) {
    const work = scanWork({ home, alive });
    for (const t of r.tasks) r.links.set(t.id, linksFor(t, work));
  }
  return r;
}

// The core's error code in the MCP call reply → r.error.
function mcpError(code, text) {
  if (code === "mcp:tool-error") return toolError(text);
  if (code === "mcp:forbidden") return { kind: "forbidden", status: null, reason: null };
  if (code === "oauth:keychain-read") return { kind: "keychain", status: null, reason: null };
  return { kind: "net", status: null, reason: code.replace(/^(mcp|oauth):/, "") };
}

// Daily MCP call limit from the core budget: 100 — the Free plan, 300 — Unlimited; otherwise no plan is named.
function budgetText(budget) {
  const n = Number(budget) || 100;
  const plan = n === 100 ? "Free" : n === 300 ? "Unlimited" : null;
  return plan ? tr(`на тарифе ${plan} ClickUp даёт около ${n} запросов в сутки`, `on the ${plan} plan ClickUp allows about ${n} requests a day`) : tr(`хаб тратит не больше ${n} запросов в сутки`, `the hub uses at most ${n} requests a day`);
}

// "workspace 111" / "list 222" / "workspaces 111, 333" (Russian dative forms in ru)
function deniedText(list) {
  const items = Array.isArray(list) ? list : [];
  const teams = items.filter((d) => d.scope === "team").map((d) => clean(d.id, 20));
  const lists = items.filter((d) => d.scope === "list").map((d) => clean(d.id, 20));
  const parts = [];
  if (teams.length) parts.push(tr(`${teams.length > 1 ? "рабочим пространствам" : "рабочему пространству"} ${teams.join(", ")}`, `${teams.length > 1 ? "workspaces" : "workspace"} ${teams.join(", ")}`));
  if (lists.length) parts.push(tr(`${lists.length > 1 ? "спискам" : "списку"} ${lists.join(", ")}`, `${lists.length > 1 ? "lists" : "list"} ${lists.join(", ")}`));
  return parts.join(tr(" и ", " and ")) || tr("тикетам", "the tickets");
}

// ---------- page: ticket groups (1.4.0) ----------
const DAY_MS = 24 * 3600_000;
const DUE_SOON_DAYS = 3; // "Due soon": overdue or due within the next 3 days
const WEEK_DAYS = 7;
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const prioRank = (t) => PRIORITY_RANK[t.priority] ?? 2;
// The kind of a status: work, review, block, todo, done. The REST API gives status.type; the sign-in (MCP) gives only
// the status name — then the kind comes from the name (English and Russian ClickUp defaults).
export function statusKind(t) {
  const s = String(t.status || "").toLowerCase();
  if (/block|hold|stuck|блок|пауз/.test(s)) return "block";
  if (/review|\bqa\b|testing|ревью|провер/.test(s)) return "review";
  if (t.statusType === "done" || t.statusType === "closed" || /\bdone\b|complete|closed|resolved|готов|закрыт/.test(s)) return "done";
  if (t.statusType === "open" || /to ?do|\bopen\b|backlog|\bnew\b|planned|сделать|бэклог|нов/.test(s)) return "todo";
  if (t.statusType === "custom" || /progress|doing|\bdev\b|работ/.test(s)) return "work";
  return null;
}
const STATUS_HUE = { work: "#5B8DEF", review: "#B07CFF", block: "#F06A6A", todo: "#9AA3AF", done: "#3DD68C" };
// The status color: ClickUp's own (REST), otherwise by kind as in the design.
export function statusHue(t) {
  return t.statusColor || STATUS_HUE[statusKind(t)] || "#9AA3AF";
}
// Status as a symbol: todo — an empty circle, work/review/block — half-filled, done — a checkmark.
export function statusSymbol(t) {
  const k = statusKind(t);
  if (k === "todo") return "circle";
  if (k === "work" || k === "review" || k === "block") return "circle.lefthalf.filled";
  if (k === "done") return "checkmark.circle";
  return "circle.dashed";
}
// Difference in calendar days (local time): 0 — today, 1 — tomorrow, -1 — yesterday.
function dayDiff(ms, nowMs) {
  const a = new Date(ms);
  const b = new Date(nowMs);
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / DAY_MS);
}
export function dueWord(ms, nowMs) {
  const d = dayDiff(ms, nowMs);
  if (d === 0) return tr("сегодня", "today");
  if (d === 1) return tr("завтра", "tomorrow");
  if (d === -1) return tr("вчера", "yesterday");
  return fmtDate(ms, nowMs);
}
const priorityText = (p) => (p === "urgent" ? tr("срочно", "urgent") : p === "high" ? tr("высокий приоритет", "high priority") : null);

// → { agents, due, rest, overdueCount, weekCount, nearestDue }. agents — tickets linked to agent work
// (night, /ticket, session); due — the others with an overdue or near due date; rest — everything else.
export function groupTasks(r, nowMs) {
  const links = (t) => r.links.get(t.id) || [];
  const byPrio = (a, b) => prioRank(a) - prioRank(b) || (b.updatedMs || 0) - (a.updatedMs || 0);
  const agents = r.tasks.filter((t) => links(t).length).sort(byPrio);
  const taken = new Set(agents.map((t) => t.id));
  const due = r.tasks.filter((t) => !taken.has(t.id) && t.dueMs && t.dueMs - nowMs <= DUE_SOON_DAYS * DAY_MS).sort((a, b) => a.dueMs - b.dueMs || prioRank(a) - prioRank(b));
  for (const t of due) taken.add(t.id);
  const rest = r.tasks.filter((t) => !taken.has(t.id)).sort(byPrio);
  const overdue = r.tasks.filter((t) => t.dueMs && t.dueMs < nowMs).sort((a, b) => a.dueMs - b.dueMs);
  const week = r.tasks.filter((t) => t.dueMs && t.dueMs >= nowMs && t.dueMs - nowMs <= WEEK_DAYS * DAY_MS).sort((a, b) => a.dueMs - b.dueMs);
  return { agents, due, rest, overdueCount: overdue.length, oldestOverdue: overdue[0] || null, weekCount: week.length, nearestDue: week[0] || null };
}

// The others by status: in progress → review → blocked → to do → the rest → done; within a group — the order they arrived in.
const KIND_RANK = { work: 0, review: 1, block: 2, todo: 3, done: 5 };
export function byStatus(tasks) {
  const rank = (t) => KIND_RANK[statusKind(t)] ?? 4;
  const groups = new Map();
  for (const t of tasks) {
    const k = t.status || "?";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  return [...groups.entries()].sort((a, b) => rank(a[1][0]) - rank(b[1][0]));
}

export function headerText(n, working, overdue) {
  if (EN()) return [`ClickUp: ${n} ${plEn(n, "ticket", "tickets")}`, working ? `${working} with agents` : null, overdue ? `${overdue} overdue` : null].filter(Boolean).join(" · ");
  return [`ClickUp: ${n} ${plural(n, "тикет", "тикета", "тикетов")}`, working ? `у агентов ${working}` : null, overdue ? `просрочено ${overdue}` : null].filter(Boolean).join(" · ");
}
// The tile is the number that needs attention: with agents, then overdue, otherwise the total open.
export function tileText(n, working, overdue) {
  if (working) return tr(`${working} у агентов`, `${working} with agents`);
  if (overdue) return tr(overdue === 1 ? "1 просрочен" : `${overdue} просрочено`, `${overdue} overdue`);
  return String(n);
}

// A row of stat cards: with agents, overdue, due this week, open.
const KIND_TEXT = { night: ["ночь", "night"], ticket: ["/ticket", "/ticket"], session: ["сессия", "session"] };
function statCards(g, n, nowMs, links) {
  const kinds = new Set();
  for (const t of g.agents) for (const l of links.get(t.id) || []) kinds.add(l.kind);
  const kindText = ["night", "ticket", "session"].filter((k) => kinds.has(k)).map((k) => KIND_TEXT[k][EN() ? 1 : 0]).join(", ");
  const out = [];
  out.push(line(String(g.agents.length), { stat: tr("У агентов", "With agents"), note: kindText || tr("никто не взял", "none taken") }));
  const o = g.oldestOverdue;
  out.push(line(String(g.overdueCount), o ? { stat: tr("Просрочено", "Overdue"), note: `${clean(o.customId || o.id, 20)}, ${tr("срок", "due")} ${dueWord(o.dueMs, nowMs)}`, color: "red" } : { stat: tr("Просрочено", "Overdue"), note: tr("всё в срок", "all on time") }));
  const w = g.nearestDue;
  out.push(line(String(g.weekCount), { stat: tr("Срок на неделе", "Due this week"), note: w ? tr(`ближайший — ${dueWord(w.dueMs, nowMs)}`, `next — ${dueWord(w.dueMs, nowMs)}`) : tr("сроков нет", "no due dates"), ...(w && w.dueMs - nowMs <= DUE_SOON_DAYS * DAY_MS ? { color: "orange" } : {}) }));
  out.push(line(String(n), { stat: tr("Открытых", "Open"), note: tr("без закрытых", "closed excluded") }));
  return out;
}

// A ticket: the name (status symbol, status as a badge), a "number · list · priority · due" line, what the agent is
// doing, and the "Open in ClickUp" and "Switch to tab" buttons.
function taskBlock(t, links, nowMs, { due = false } = {}) {
  const ref = clean(t.customId || t.id, 30);
  const hue = statusHue(t);
  const out = [line(clean(t.name, 80), { sfimage: statusSymbol(t), iconColor: hue, badge: clean(t.status, 24), badgeColor: hue })];
  const meta = [ref, t.list ? clean(t.list, 40) : null, priorityText(t.priority)];
  // due date: overdue or in "Due soon" — on its own colored line, otherwise — in the number line
  const loud = t.dueMs && (due || t.dueMs < nowMs);
  if (t.dueMs && !loud) meta.push(`${tr("срок", "due")} ${dueWord(t.dueMs, nowMs)}`);
  out.push(line(`--${meta.filter(Boolean).join(" · ")}`, {}));
  if (loud) {
    const late = t.dueMs < nowMs;
    out.push(line(`--${late ? tr(`просрочен: срок ${dueWord(t.dueMs, nowMs)}`, `overdue: was due ${dueWord(t.dueMs, nowMs)}`) : tr(`срок ${dueWord(t.dueMs, nowMs)}`, `due ${dueWord(t.dueMs, nowMs)}`)}`, { color: late ? "red" : "orange" }));
  }
  for (const l of links) out.push(line(`--→ ${l.text} · ${confText(l.confidence)}`, l.confidence === "possible" ? { color: "gray" } : {}));
  out.push(line(`--${tr("Открыть в ClickUp", "Open in ClickUp")}`, { href: t.url, sfimage: "arrow.up.right.square" }));
  // switching to the session tab — session.focus <sessionId>: the hub finds the tab (the terminals layer), the plugin
  // knows nothing about the terminal; no tab — the hub refuses (no-terminal). One button per live session.
  const seen = new Set();
  for (const l of links) {
    if (l.kind !== "session" || !UUID_RE.test(l.sessionId || "") || seen.has(l.sessionId)) continue;
    seen.add(l.sessionId);
    out.push(line(`--${tr(`Перейти: сессия ${l.label || ""}`, `Switch to session ${l.label || ""}`).trim()}`, { effect: `session.focus ${l.sessionId}`, sfimage: "arrow.right.square" }));
  }
  return out;
}

// The header answers "is there anything to do": how many are with agents and how many are overdue. tile= — what needs attention.
export function render(r, { nowMs = Date.now(), limit = r.limit || 15, lang = LANG } = {}) {
  setLang(lang);
  const out = [];
  if (r.tokenMissing) {
    if (r.connectInHub) {
      // sign-in through the hub: the shell draws the Connect ClickUp button (the plugin page and Settings → Connections)
      out.push(line(tr("ClickUp не подключён", "ClickUp isn't connected"), { status: "unknown", tile: "—", sfimage: "link.badge.plus" }));
      out.push("---");
      out.push(line(tr("Нажмите «Подключить ClickUp» — вход и подтверждение на сайте ClickUp, токен вводить не нужно", "Click Connect ClickUp — you sign in and approve on the ClickUp site, no token to paste"), { color: "gray" }));
      out.push(line(tr(`--Кнопка — на этой странице и в «Настройках → Подключения». Тикеты обновляются раз в 15 мин: ${budgetText(100)}`, `--The button is on this page and in Settings → Connections. Tickets refresh every 15 min: ${budgetText(100)}`), { color: "gray" }));
      if (r.oauth?.denied) out.push(line(tr(`--Хаб не пустил запрос через вход: ${clean(r.oauth.denied, 40)}`, `--The hub blocked the sign-in request: ${clean(r.oauth.denied, 40)}`), { color: "orange" }));
    } else {
      out.push(line(tr("ClickUp не подключён — нужен токен", "ClickUp isn't connected — a token is needed"), { status: "unknown", tile: "—", sfimage: "key.slash" }));
      out.push("---");
    }
    // the hub sign-in is available — the fallback is collapsed into "Details" so it doesn't hide the shell's button
    out.push(line(r.connectInHub ? tr("Запасной путь — личный токен (обновление раз в 2 мин)", "Fallback — a personal token (refreshes every 2 min)") : tr("Как подключить", "How to connect"), r.connectInHub ? { details: "true" } : { color: "gray" }));
    // The hub's secrets service looks up the keychain entry: service agent-hub.clickup, account exactly "token"
    // (find-generic-password -s agent-hub.clickup -a token) — an entry with any other account name won't be found.
    out.push(line(tr("--1. Заведите персональный токен ClickUp: Settings → Apps → API Token", "--1. Create a personal ClickUp token: Settings → Apps → API Token"), { color: "gray" }));
    out.push(line(tr("--2. Сохраните его в связке ключей macOS командой в Терминале (она спросит токен):", "--2. Save it in the macOS keychain with this Terminal command (it asks for the token):"), { color: "gray" }));
    out.push(line(`--${SECRET_CMD}`, { color: "gray" }));
    out.push(line(tr("--Сервис — agent-hub.clickup, учётная запись — ровно token: с другим именем хаб запись не найдёт", "--Service agent-hub.clickup, account exactly token: under any other name the hub won't find it"), { color: "gray" }));
    return out.join("\n");
  }
  let status = "ok";
  const notes = [];
  let problem = null;
  if (r.oauth?.expired) {
    // the sign-in expired or was revoked (401 from the server, no refresh or it failed): a "reconnect" banner and push
    if (r.mode === "token") notes.push(line(tr("Вход в ClickUp истёк — пока работаю по личному токену. Нажмите «Подключить ClickUp»", "The ClickUp sign-in expired — using the personal token for now. Click Connect ClickUp"), { color: "orange" }));
    else {
      status = "error";
      problem = tr("ClickUp: подключите снова", "ClickUp: reconnect");
      notes.push(line(tr("Вход в ClickUp истёк или доступ отозван — нажмите «Подключить ClickUp»", "The ClickUp sign-in expired or access was revoked — click Connect ClickUp"), { color: "red", event: "login-expired", sfimage: "link.badge.plus" }));
    }
  } else if (r.oauth?.denied && r.mode === "token") {
    notes.push(line(tr(`Хаб не пустил запрос через вход (${clean(r.oauth.denied, 40)}) — работаю по личному токену`, `The hub blocked the sign-in request (${clean(r.oauth.denied, 40)}) — using the personal token`), { color: "orange" }));
  }
  if (r.mode === "oauth") {
    const o = r.oauth;
    const at = o.nextAt ? fmtTime(o.nextAt, nowMs) : null;
    if (o.pending && !r.fetchedAt) notes.push(line(tr("Загружаю тикеты из ClickUp…", "Loading tickets from ClickUp…"), { color: "gray" }));
    if (o.why === "rate-limit" && at) notes.push(line(tr(`ClickUp сообщил, что лимит запросов исчерпан — следующее обновление в ${at}`, `ClickUp says the request limit is used up — next refresh at ${at}`), { color: "orange" }));
    else if (o.why === "budget" && at) notes.push(line(tr(`Бережём суточный лимит ClickUp: ${o.calls24h ?? "?"} из ${o.dailyBudget ?? "?"} запросов за 24 ч — следующее обновление в ${at}`, `Saving the ClickUp daily limit: ${o.calls24h ?? "?"} of ${o.dailyBudget ?? "?"} requests in 24 h — next refresh at ${at}`), { color: "orange" }));
    else if (o.why === "http-limit" && at) notes.push(line(tr(`ClickUp просит сбавить темп — следующее обновление в ${at}`, `ClickUp asks to slow down — next refresh at ${at}`), { color: "orange" }));
    else if (o.why === "error" && at) notes.push(line(tr(`ClickUp не ответил — повтор в ${at}`, `ClickUp didn't respond — retrying at ${at}`), { color: "orange" }));
  }
  if (r.error) {
    if (r.error.kind === "auth") {
      status = "error";
      problem = tr("ClickUp не принял токен — обновите его", "ClickUp rejected the token — update it");
      notes.push(line(tr(`Токен не принят (HTTP ${r.error.status})`, `Token rejected (HTTP ${r.error.status})`), { color: "red", event: "auth-failed" }));
    } else if (r.error.kind === "shape") {
      status = "unknown";
      problem = tr("ClickUp: не получилось загрузить тикеты", "ClickUp: couldn't load tickets");
      notes.push(line(tr("Ответ ClickUp не разобран", "Couldn't parse ClickUp's response"), { color: "orange", event: "source-broken" }));
      if (r.error.reason) notes.push(line(`--${clean(shapeText(r.error.reason), 80)}`, { color: "gray" }));
    } else if (r.error.kind === "tool") {
      // ClickUp answered the request with an error: ClickUp's text goes to the output; several workspaces — a hint
      status = "unknown";
      problem = r.error.workspace ? tr("ClickUp: укажите рабочее пространство", "ClickUp: set the workspace") : tr("ClickUp: запрос вернул ошибку", "ClickUp: the request returned an error");
      const what = r.error.workspace
        ? tr("У вас несколько рабочих пространств ClickUp — укажите teamIds в config.json плагина (через вход берётся одно)", "You have several ClickUp workspaces — set teamIds in the plugin's config.json (the sign-in uses one)")
        : tr("ClickUp вернул ошибку на запрос тикетов", "ClickUp returned an error for the ticket request");
      notes.push(line(what, { color: "orange", event: "source-broken" }));
      if (r.error.reason) notes.push(line(`--${clean(r.error.reason, 120)}`, { color: "gray" }));
    } else if (r.error.kind === "forbidden") {
      status = "error";
      problem = tr("ClickUp: нет доступа к тикетам через вход", "ClickUp: no access to tickets via the sign-in");
      notes.push(line(tr("ClickUp не даёт этому входу доступ к задачам — проверьте права аккаунта в ClickUp; хаб повторит через час", "ClickUp doesn't give this sign-in access to the tasks — check the account's permissions in ClickUp; the hub retries in an hour"), { color: "red" }));
    } else if (r.error.kind === "keychain") {
      notes.push(line(tr("Хаб не смог прочитать вход из связки ключей — повтор через минуту", "The hub couldn't read the sign-in from the keychain — retrying in a minute"), { color: "orange" }));
    } else if (r.error.kind === "rate") {
      notes.push(line(tr(`Лимит запросов ClickUp (429), пауза до ${fmtTime(r.pausedUntil, nowMs)}`, `ClickUp rate limit (429), pausing until ${fmtTime(r.pausedUntil, nowMs)}`), { color: "orange" }));
    } else if (r.error.kind === "scope") {
      // the token is accepted (/user answered), but all workspaces and lists denied access
      status = "error";
      problem = tr(`ClickUp: нет доступа к ${deniedText(r.error.denied)}`, `ClickUp: no access to ${deniedText(r.error.denied)}`);
      notes.push(line(tr(`Токен принят, но ClickUp не пускает к тикетам (HTTP ${r.error.status}): проверьте, что вы ещё участник`, `The token works, but ClickUp won't show the tickets (HTTP ${r.error.status}): check you're still a member`), { color: "red" }));
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
  if (!r.error && r.denied && r.denied.length) {
    notes.push(line(tr(`Нет доступа к ${deniedText(r.denied)} — его тикеты пропущены`, `No access to ${deniedText(r.denied)} — its tickets are skipped`), { color: "orange" }));
  }
  const stale = !r.fetchedAt || nowMs - r.fetchedAt > STALE_MS;
  if (stale && status === "ok" && (r.error || r.pausedUntil)) status = "unknown";
  // sign-in through the hub: the data is older than three intervals and the core is waiting (limit, error) — or there is no data yet
  if (r.mode === "oauth" && status === "ok") {
    const old = !r.fetchedAt || nowMs - r.fetchedAt > Math.max(STALE_MS, 3 * (r.oauth.intervalMs || 0));
    if (!r.fetchedAt || (old && r.oauth.why && r.oauth.why !== "interval")) status = "unknown";
  }

  // Page groups (design 1.4.0): "With agents now" → "Due soon" → "Others" by status.
  const g = groupTasks(r, nowMs);
  const n = r.tasks.length;
  const working = g.agents.length;
  const overdue = g.overdueCount;
  const title = problem || headerText(n, working, overdue);
  out.push(line(title, { status, tile: tileText(n, working, overdue), sfimage: "checklist" }));
  out.push("---");
  out.push(...notes);
  if (notes.length) out.push("---");
  if (!n) out.push(line(r.fetchedAt ? tr("Открытых тикетов нет", "No open tickets") : tr("Тикеты ещё не загружены", "Tickets not loaded yet"), { color: "gray" }));
  else {
    out.push(...statCards(g, n, nowMs, r.links));
    out.push("---");
    let shown = 0;
    if (g.agents.length) {
      out.push(line(tr(`У агентов · ${g.agents.length}`, `With agents · ${g.agents.length}`), { sfimage: "person.2.fill", iconColor: "#7CC4FF" }));
      for (const t of g.agents) out.push(...taskBlock(t, r.links.get(t.id) || [], nowMs, { agents: true })), shown++;
      out.push("---");
    }
    if (g.due.length) {
      out.push(line(tr(`Срок горит · ${g.due.length}`, `Due soon · ${g.due.length}`), { sfimage: "clock.badge.exclamationmark", iconColor: "#FF8A65" }));
      for (const t of g.due) out.push(...taskBlock(t, [], nowMs, { due: true })), shown++;
      out.push("---");
    }
    if (g.rest.length) {
      // the others — briefly, per the design: a status group (gray title, colored dot), then each ticket as a text link
      // (link=true — not a capsule) with a gray "number · list · due" line under it.
      const room = Math.max(0, limit - shown);
      const visible = g.rest.slice(0, room);
      const alone = !g.agents.length && !g.due.length;
      out.push(line(alone ? tr(`Тикеты · ${g.rest.length}`, `Tickets · ${g.rest.length}`) : tr(`Остальные · ${g.rest.length}`, `Others · ${g.rest.length}`), { sfimage: "tray.full" }));
      for (const [st, list] of byStatus(visible)) {
        out.push(line(`${clean(st, 40)} · ${list.length}`, { sfimage: "circle.fill", iconColor: statusHue(list[0]), color: "gray" }));
        for (const t of list) {
          out.push(line(`--${clean(t.name, 100)}`, { href: t.url, link: "true", tooltip: tr("Открыть в ClickUp", "Open in ClickUp") }));
          const meta = [t.customId ? clean(t.customId, 30) : null, t.list ? clean(t.list, 40) : null, priorityText(t.priority), t.dueMs ? `${tr("срок", "due")} ${dueWord(t.dueMs, nowMs)}` : null].filter(Boolean);
          if (meta.length) out.push(line(`----${meta.join(" · ")}`, { color: "gray" }));
        }
      }
      if (g.rest.length > visible.length) out.push(line(tr(`…и ещё ${g.rest.length - visible.length} — в ClickUp`, `…and ${g.rest.length - visible.length} more — in ClickUp`), { color: "gray" }));
      out.push("---");
    }
  }
  const parts = [];
  if (r.fetchedAt) parts.push(tr(`обновлено ${fmtTime(r.fetchedAt, nowMs)}`, `updated ${fmtTime(r.fetchedAt, nowMs)}`));
  if (r.mode === "oauth" && r.oauth.nextAt) parts.push(tr(`следующее в ${fmtTime(r.oauth.nextAt, nowMs)}`, `next at ${fmtTime(r.oauth.nextAt, nowMs)}`));
  if (r.mode !== "oauth" && r.rate && r.rate.remaining !== null) parts.push(tr(`лимит API: осталось ${r.rate.remaining}`, `API limit: ${r.rate.remaining} left`));
  if (r.mode === "oauth") {
    // the shell's connection card already shows "updated · next · requests in 24 h" — here only under "Details"
    const min = Math.max(1, Math.round((r.oauth.intervalMs || 15 * 60_000) / 60_000));
    out.push(line(tr("Обновление", "Refresh"), { details: "true" }));
    if (parts.length) out.push(line(`--${parts.join(" · ")}`, { color: "gray" }));
    out.push(line(tr(`--Через вход в ClickUp: раз в ${min} мин — ${budgetText(r.oauth.dailyBudget)}`, `--Via the ClickUp sign-in: every ${min} min — ${budgetText(r.oauth.dailyBudget)}`), { color: "gray" }));
  } else {
    if (parts.length) out.push(line(parts.join(" · "), { color: "gray" }));
    if (r.mode === "token") out.push(line(tr("По личному токену ClickUp", "Using the personal ClickUp token"), { color: "gray" }));
  }
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

// Run as a program (not imported from tests). Paths are compared by realpath: /tmp → /private/tmp.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
