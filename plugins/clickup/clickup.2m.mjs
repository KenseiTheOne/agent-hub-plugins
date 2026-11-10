#!/usr/bin/env node
// <agenthub.title>ClickUp</agenthub.title>
// <agenthub.version>1.4.0</agenthub.version>
// <agenthub.contract>2</agenthub.contract>
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
// <agenthub.fsRead>~/.cmuxterm/claude-hook-sessions.json — вкладка cmux сессии — для кнопки «Перейти»</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.cmuxterm/claude-hook-sessions.json — the session's cmux tab — for the Switch to tab button</agenthub.fsRead>
// <agenthub.effects>open.url,cmux.focus</agenthub.effects>
// <agenthub.connection id="clickup" type="mcp" url="https://mcp.clickup.com/mcp" scope="read" title="ClickUp" tools="clickup_filter_tasks" interval="15m" budget="100">ваши открытые тикеты ClickUp: только чтение, один инструмент — список тикетов</agenthub.connection>
// <agenthub.connection lang="en" id="clickup" title="ClickUp">your open ClickUp tickets: read-only, one tool — the ticket list</agenthub.connection>
// <agenthub.push key="auth-failed" kind="problems">ClickUp: токен не принят</agenthub.push>
// <agenthub.push key="auth-failed" kind="problems" lang="en">ClickUp: token rejected</agenthub.push>
// <agenthub.push key="login-expired" kind="problems">ClickUp: вход истёк — подключите снова</agenthub.push>
// <agenthub.push key="login-expired" kind="problems" lang="en">ClickUp: sign-in expired — reconnect</agenthub.push>
//
// Два пути к данным (с 1.2.0). Основной — вход в ClickUp через хаб: кнопка «Подключить ClickUp» (страница плагина,
// «Настройки → Подключения»), официальный MCP-сервер mcp.clickup.com, OAuth делает ядро (служба oauth). Плагин зовёт
// инструмент clickup_filter_tasks через сокет хаба (POST /connections/clickup/mcp, переменная AGENTHUB_HUB_SOCKET —
// её ядро даёт только доверенным плагинам); токен остаётся в ядре. С 1.3.0 (контракт 2) подключение объявляет сам
// плагин — тег <agenthub.connection> выше: адрес, scope, белый список из одного инструмента, интервал 15 мин и бюджет
// 100 вызовов в сутки (ClickUp Free даёт около 100 вызовов MCP в сутки); ядро о ClickUp больше ничего не знает, а
// частоту держит по объявлению (бэкофф по лимиту — тоже ядро); плагин показывает, когда следующее обновление и почему
// реже. Запасной путь — личный токен (REST v2), как раньше: если входа нет.
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
// События: auth-failed (401/403 на /user — токен не принят), source-broken (незнакомая форма ответа).
// 401/403 на тикеты одного рабочего пространства или списка при принятом токене (/user отвечает) — отказ по нему:
// его тикеты пропускаются, остальные собираются, список рабочих пространств перезапрашивается в следующий раз.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_BASE = "https://api.clickup.com";
// Команда для секрета clickup.token (служба секретов ядра: -s agent-hub.<служба> -a <запись>).
export const SECRET_CMD = "security add-generic-password -s agent-hub.clickup -a token -T /usr/bin/security -w";
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
const MCP_WAIT_MS = 3600; // ответ хаба на вызов MCP (служба ждёт ClickUp до 3 с, затем отвечает «загружаю»)
// Поля задачи, которые просим у clickup_filter_tasks (кроме id, name, url) — меньше ответ и меньше разбора.
export const MCP_FIELDS = ["custom_id", "status", "due_date", "date_updated", "list", "priority"];

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
    this.kind = kind; // auth | rate | http | net | shape | denied | scope
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
        throw new ApiError("shape", res.status, { reason: "not-json" });
      }
    },
  };
}

// ---------- ClickUp → тикеты ----------
// reason — код (переводит render, SHAPE_TEXT), а не готовая строка.
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

// Приоритет ClickUp: объект {priority: "urgent"|"high"|"normal"|"low"}, строка или число 1…4 (1 — urgent) → код или null.
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

// info.denied — [{ scope: "team"|"list", id, status }]: рабочие пространства и списки, отказавшие в доступе при
// принятом токене. Все отказали — ApiError("scope").
export async function fetchTasks(client, cfg, state, now, info = {}, { retried = false } = {}) {
  // пользователь и рабочие пространства — раз в сутки
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
  // отказы, уже подтверждённые при проверенном токене (не старше суток), — без повторной проверки каждый запуск
  const known = new Set(state.denied && now - state.denied.at <= META_TTL_MS && Array.isArray(state.denied.ids) ? state.denied.ids : []);
  for (const sc of scopes) {
    try {
      add(await client.get(sc.path, base));
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== "auth") throw e;
      // Токен проверен в этом запуске (/user ответил) — это отказ по рабочему пространству или списку. Пользователь
      // из кэша — перепроверить токен заново: /user на 401 даст auth, а на другой аккаунт — новый id и новые команды.
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
  // рабочее пространство могло уйти из /team (пользователя убрали) — список команд перезапросить в следующий раз
  if (fresh.some((d) => d.scope === "team") && state.teams && !(Array.isArray(cfg.teamIds) && cfg.teamIds.length)) state.teams = null;
  if (scopes.length && denied.length === scopes.length) throw new ApiError("scope", denied[0].status, { denied });
  return [...tasks.values()];
}

// ---------- вход ClickUp через хаб (MCP) ----------
// Запрос к хабу по его сокету: POST /connections/clickup/mcp. Токена у плагина нет — его подставляет ядро.
// → { status, body } или { status: 0, error } (хаб не ответил).
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

// Аргументы clickup_filter_tasks: один вызов на опрос. Исполнитель «me» сервер понимает сам (без clickup_get_user).
// Через вход берётся одно рабочее пространство — первое из teamIds (остальные — только по личному токену, README).
export function mcpArgs(cfg) {
  const a = { include_closed: false, subtasks: true, order_by: "updated", fields: MCP_FIELDS };
  if (cfg.assignee !== null) a.assignees = ["me"];
  const lists = (cfg.listIds || []).map(String).filter((x) => /^\d+$/.test(x)).slice(0, 5);
  if (lists.length) a.list_ids = lists;
  // несколько рабочих пространств — сервер требует workspace_id; берём первое из настроек (один вызов на опрос)
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

// Задача из ответа инструмента: поля как у REST, но форма может отличаться (status — строка или объект, list — строка
// или объект, даты — мс, секунды или ISO). Без id/name — незнакомая форма.
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

// Ошибка инструмента ClickUp (isError или error=mcp:tool-error от ядра) → { kind: "tool", reason: текст ClickUp,
// workspace: сервер требует workspace_id — несколько рабочих пространств без teamIds }.
export function toolError(text) {
  const t = clean(text || "", 120);
  return { kind: "tool", status: null, reason: t || null, workspace: /workspace[_ ]?id/i.test(String(text || "")) };
}
function resultText(result) {
  return (Array.isArray(result?.content) ? result.content : []).map((c) => (c && typeof c.text === "string" ? c.text : "")).join(" ");
}

// Результат инструмента → задачи. structuredContent или текст с JSON: массив, {tasks}, {data: {tasks}}.
export function tasksFromMcp(result) {
  if (!result || typeof result !== "object") throw shapeError("mcp-no-result");
  // ошибка инструмента — не «незнакомая форма»: текст ClickUp идёт в вывод (хаб старше 09.11 отдаёт её как результат)
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
      links.push({ kind: "session", confidence: "certain", sessionId: exact.sessionId, surface: exact.surface, label: sessionLabel(exact), text: tr(`сессия ${sessionLabel(exact)} (из RUN.md)`, `session ${sessionLabel(exact)} (from RUN.md)`) });
      seenSessions.add(exact.sessionId);
    }
    const root = day.worktree && isAbsolute(day.worktree.split(/\s/)[0]) ? day.worktree.split(/\s/)[0] : day.repo_root;
    for (const s of work.sessions) {
      if (seenSessions.has(s.sessionId) || !within(s.cwd, root)) continue;
      if (day.branch && s.branch && s.branch === day.branch.split(/\s/)[0]) {
        links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, surface: s.surface, label: sessionLabel(s), text: tr(`сессия ${sessionLabel(s)}: ветка ${clean(s.branch, 60)} как в RUN.md`, `session ${sessionLabel(s)}: branch ${clean(s.branch, 60)} as in RUN.md`) });
        seenSessions.add(s.sessionId);
      }
    }
  }
  // сессии по ветке/каталогу с id тикета
  for (const s of work.sessions) {
    if (seenSessions.has(s.sessionId)) continue;
    const hit = ids.find((id) => (s.branch && idRe(id).test(s.branch)) || idRe(id).test(s.cwd));
    if (hit) {
      links.push({ kind: "session", confidence: "likely", sessionId: s.sessionId, surface: s.surface, label: sessionLabel(s), text: `${tr("сессия", "session")} ${sessionLabel(s)}: ${s.branch && idRe(hit).test(s.branch) ? tr(`ветка ${clean(s.branch, 60)}`, `branch ${clean(s.branch, 60)}`) : tr("каталог", "folder")}` });
      seenSessions.add(s.sessionId);
    }
  }
  if (day && !links.some((l) => l.kind === "session")) {
    const root = day.repo_root;
    const s = work.sessions.find((x) => within(x.cwd, root));
    if (s && now() - day.mtimeMs < 6 * 3600_000) links.push({ kind: "session", confidence: "possible", sessionId: s.sessionId, surface: s.surface, label: sessionLabel(s), text: tr(`сессия ${sessionLabel(s)} в том же репо`, `session ${sessionLabel(s)} in the same repo`) });
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
export async function collect({ env = process.env, home = homedir(), nowMs = Date.now(), fetchImpl = globalThis.fetch, alive = pidsAlive, hubCall = hubMcp } = {}) {
  const token = env.AGENTHUB_SECRET_CLICKUP_TOKEN;
  // сокет хаба: переменную ядро даёт только доверенным плагинам и только при включённой службе oauth
  const sock = typeof env.AGENTHUB_HUB_SOCKET === "string" && env.AGENTHUB_HUB_SOCKET.startsWith("/") ? env.AGENTHUB_HUB_SOCKET : null;
  const dataDir = env.AGENTHUB_PLUGIN_DATA_PATH || null;
  const cacheDir = env.AGENTHUB_PLUGIN_CACHE_PATH || null;
  const cfg = dataDir ? loadJson(join(dataDir, "config.json"), {}) : {};
  const statePath = cacheDir ? join(cacheDir, "state.json") : null;
  const state = statePath ? loadJson(statePath, {}) : {};
  const r = { tokenMissing: false, mode: null, oauth: null, connectInHub: Boolean(sock), tasks: state.last?.tasks || [], fetchedAt: state.last?.at || null, error: null, pausedUntil: null, rate: state.rate || null, requests: 0, links: new Map(), limit: Math.min(50, Math.max(1, Number(cfg.limit) || 15)) };
  let dirty = false;
  // 1. вход в ClickUp через хаб (MCP): частоту, лимит и токен держит ядро
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
      // ошибка инструмента и «нет доступа» — даже при прошлом результате из памяти ядра: данные не обновляются
      const hard = r.oauth.error === "mcp:tool-error" || r.oauth.error === "mcp:forbidden";
      if (!r.error && r.oauth.error && r.oauth.error !== "mcp:rate-limited" && (hard || !(b.ok && b.result))) r.error = mcpError(r.oauth.error, r.oauth.errorText);
    } else if (res.status === 409 && b.error === "oauth:expired") {
      r.oauth = { expired: true };
    } else if (res.status === 403 || res.status === 400 || res.status === 413) {
      // хаб не пустил вызов (политика ядра: не доверенный, нет права net, инструмент не из списка)
      r.oauth = { denied: typeof b.error === "string" ? b.error : `http-${res.status}` };
    }
    // 409 not-connected / unavailable, 404 (хаб без службы oauth), нет ответа — входа нет: дальше личный токен
  }
  // 2. запасной путь — личный токен (REST v2), если входа через хаб нет
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
        // токен не принят: и пользователь, и рабочие пространства из кэша могли быть от прежнего токена
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
  // ни входа, ни токена: «не подключён» (истёкший вход — отдельная плашка «подключите снова»)
  if (!r.mode && !r.oauth?.expired) r.tokenMissing = true;
  if (r.tokenMissing) r.tasks = [];
  if (r.tasks.length) {
    const work = scanWork({ home, alive });
    for (const t of r.tasks) r.links.set(t.id, linksFor(t, work));
  }
  return r;
}

// Код ошибки ядра в ответе на вызов MCP → r.error.
function mcpError(code, text) {
  if (code === "mcp:tool-error") return toolError(text);
  if (code === "mcp:forbidden") return { kind: "forbidden", status: null, reason: null };
  if (code === "oauth:keychain-read") return { kind: "keychain", status: null, reason: null };
  return { kind: "net", status: null, reason: code.replace(/^(mcp|oauth):/, "") };
}

// Суточный лимит вызовов MCP по бюджету ядра: 100 — тариф Free, 300 — Unlimited; иначе тариф не называем.
function budgetText(budget) {
  const n = Number(budget) || 100;
  const plan = n === 100 ? "Free" : n === 300 ? "Unlimited" : null;
  return plan ? tr(`на тарифе ${plan} ClickUp даёт около ${n} запросов в сутки`, `on the ${plan} plan ClickUp allows about ${n} requests a day`) : tr(`хаб тратит не больше ${n} запросов в сутки`, `the hub uses at most ${n} requests a day`);
}

// «рабочему пространству 111» / «списку 222» / «рабочим пространствам 111, 333»
function deniedText(list) {
  const items = Array.isArray(list) ? list : [];
  const teams = items.filter((d) => d.scope === "team").map((d) => clean(d.id, 20));
  const lists = items.filter((d) => d.scope === "list").map((d) => clean(d.id, 20));
  const parts = [];
  if (teams.length) parts.push(tr(`${teams.length > 1 ? "рабочим пространствам" : "рабочему пространству"} ${teams.join(", ")}`, `${teams.length > 1 ? "workspaces" : "workspace"} ${teams.join(", ")}`));
  if (lists.length) parts.push(tr(`${lists.length > 1 ? "спискам" : "списку"} ${lists.join(", ")}`, `${lists.length > 1 ? "lists" : "list"} ${lists.join(", ")}`));
  return parts.join(tr(" и ", " and ")) || tr("тикетам", "the tickets");
}

// ---------- страница: группы тикетов (1.4.0) ----------
const DAY_MS = 24 * 3600_000;
const DUE_SOON_DAYS = 3; // «Срок горит»: просрочен или срок в ближайшие 3 дня
const WEEK_DAYS = 7;
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const prioRank = (t) => PRIORITY_RANK[t.priority] ?? 2;
// Статус как значок: open — пустой круг, custom (в работе, ревью…) — наполовину, done/closed — галочка.
export function statusSymbol(t) {
  if (t.statusType === "open") return "circle";
  if (t.statusType === "custom") return "circle.lefthalf.filled";
  if (t.statusType === "done" || t.statusType === "closed") return "checkmark.circle";
  return "circle.dashed";
}
// Разница в календарных днях (по местному времени): 0 — сегодня, 1 — завтра, -1 — вчера.
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

// → { agents, due, rest, overdueCount, weekCount, nearestDue }. agents — тикеты, с которыми связана работа агентов
// (ночь, /ticket, сессия); due — остальные с просроченным или близким сроком; rest — всё прочее.
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

// Остальные по статусам: в работе (custom) → открытые (open) → прочие; внутри — порядок, в котором пришли.
export function byStatus(tasks) {
  const rank = (t) => (t.statusType === "custom" ? 0 : t.statusType === "open" ? 1 : 2);
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
// Плитка — число, которое требует внимания: у агентов, затем просроченные, иначе всего открытых.
export function tileText(n, working, overdue) {
  if (working) return tr(`${working} у агентов`, `${working} with agents`);
  if (overdue) return tr(overdue === 1 ? "1 просрочен" : `${overdue} просрочено`, `${overdue} overdue`);
  return String(n);
}

// Ряд карточек-цифр: у агентов, просрочено, срок на неделе, открытых.
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

// Тикет: название (значок статуса, статус пометкой), строка «номер · список · приоритет · срок», что делает агент,
// кнопки «Открыть в ClickUp» и «Перейти во вкладку».
function taskBlock(t, links, nowMs, { due = false } = {}) {
  const ref = clean(t.customId || t.id, 30);
  const out = [line(clean(t.name, 80), { sfimage: statusSymbol(t), badge: clean(t.status, 24) })];
  const meta = [ref, t.list ? clean(t.list, 40) : null, priorityText(t.priority)];
  // срок: просроченный или в «Срок горит» — своей цветной строкой, иначе — в строке номера
  const loud = t.dueMs && (due || t.dueMs < nowMs);
  if (t.dueMs && !loud) meta.push(`${tr("срок", "due")} ${dueWord(t.dueMs, nowMs)}`);
  out.push(line(`--${meta.filter(Boolean).join(" · ")}`, {}));
  if (loud) {
    const late = t.dueMs < nowMs;
    out.push(line(`--${late ? tr(`просрочен: срок ${dueWord(t.dueMs, nowMs)}`, `overdue: was due ${dueWord(t.dueMs, nowMs)}`) : tr(`срок ${dueWord(t.dueMs, nowMs)}`, `due ${dueWord(t.dueMs, nowMs)}`)}`, { color: late ? "red" : "orange" }));
  }
  for (const l of links) out.push(line(`--→ ${l.text} · ${confText(l.confidence)}`, l.confidence === "possible" ? { color: "gray" } : {}));
  out.push(line(`--${tr("Открыть в ClickUp", "Open in ClickUp")}`, { href: t.url, sfimage: "arrow.up.right.square" }));
  // переход во вкладку сессии (cmux.focus; ядро сверит вкладку со своими фактами) — по кнопке на сессию
  const seen = new Set();
  for (const l of links) {
    if (!l.surface || seen.has(l.surface.surfaceId)) continue;
    seen.add(l.surface.surfaceId);
    out.push(line(`--${tr(`Перейти: сессия ${l.label || ""}`, `Switch to session ${l.label || ""}`).trim()}`, { effect: `cmux.focus ${l.surface.surfaceId} workspaceId=${l.surface.workspaceId}`, sfimage: "arrow.right.square" }));
  }
  return out;
}

// Шапка отвечает на «нужно ли что-то делать»: сколько у агентов и сколько просрочено. tile= — то, что требует внимания.
export function render(r, { nowMs = Date.now(), limit = r.limit || 15, lang = LANG } = {}) {
  setLang(lang);
  const out = [];
  if (r.tokenMissing) {
    if (r.connectInHub) {
      // вход через хаб: кнопку «Подключить ClickUp» рисует оболочка (страница плагина и «Настройки → Подключения»)
      out.push(line(tr("ClickUp не подключён", "ClickUp isn't connected"), { status: "unknown", tile: "—", sfimage: "link.badge.plus" }));
      out.push("---");
      out.push(line(tr("Нажмите «Подключить ClickUp» — вход и подтверждение на сайте ClickUp, токен вводить не нужно", "Click Connect ClickUp — you sign in and approve on the ClickUp site, no token to paste"), { color: "gray" }));
      out.push(line(tr(`--Кнопка — на этой странице и в «Настройках → Подключения». Тикеты обновляются раз в 15 мин: ${budgetText(100)}`, `--The button is on this page and in Settings → Connections. Tickets refresh every 15 min: ${budgetText(100)}`), { color: "gray" }));
      if (r.oauth?.denied) out.push(line(tr(`--Хаб не пустил запрос через вход: ${clean(r.oauth.denied, 40)}`, `--The hub blocked the sign-in request: ${clean(r.oauth.denied, 40)}`), { color: "orange" }));
    } else {
      out.push(line(tr("ClickUp не подключён — нужен токен", "ClickUp isn't connected — a token is needed"), { status: "unknown", tile: "—", sfimage: "key.slash" }));
      out.push("---");
    }
    // есть вход через хаб — запасной путь свёрнут в «Подробности», чтобы не заслонять кнопку оболочки
    out.push(line(r.connectInHub ? tr("Запасной путь — личный токен (обновление раз в 2 мин)", "Fallback — a personal token (refreshes every 2 min)") : tr("Как подключить", "How to connect"), r.connectInHub ? { details: "true" } : { color: "gray" }));
    // Служба секретов хаба ищет запись связки ключей: сервис agent-hub.clickup, учётная запись ровно «token»
    // (find-generic-password -s agent-hub.clickup -a token) — запись с другим именем учётной записи не найдётся.
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
    // вход истёк или отозван (401 от сервера, refresh нет или не вышел): плашка и push «подключите снова»
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
      // ClickUp ответил ошибкой на запрос: текст ClickUp — в вывод; несколько рабочих пространств — подсказка
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
      // токен принят (/user ответил), а все рабочие пространства и списки отказали
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
  // вход через хаб: данные старше трёх интервалов, а ядро ждёт (лимит, ошибка) — или их ещё нет вовсе
  if (r.mode === "oauth" && status === "ok") {
    const old = !r.fetchedAt || nowMs - r.fetchedAt > Math.max(STALE_MS, 3 * (r.oauth.intervalMs || 0));
    if (!r.fetchedAt || (old && r.oauth.why && r.oauth.why !== "interval")) status = "unknown";
  }

  // Группы страницы (дизайн 1.4.0): «Сейчас у агентов» → «Срок горит» → «Остальные» по статусам.
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
      out.push(line(tr(`У агентов · ${g.agents.length}`, `With agents · ${g.agents.length}`), { sfimage: "person.2.fill", color: "#7CC4FF" }));
      for (const t of g.agents) out.push(...taskBlock(t, r.links.get(t.id) || [], nowMs, { agents: true })), shown++;
      out.push("---");
    }
    if (g.due.length) {
      out.push(line(tr(`Срок горит · ${g.due.length}`, `Due soon · ${g.due.length}`), { sfimage: "clock.badge.exclamationmark", color: "#FF8A65" }));
      for (const t of g.due) out.push(...taskBlock(t, [], nowMs, { due: true })), shown++;
      out.push("---");
    }
    if (g.rest.length) {
      // остальные — коротко: строка статуса и по капсуле-ссылке на тикет (название целиком, без номера и статуса)
      const room = Math.max(0, limit - shown);
      const visible = g.rest.slice(0, room);
      out.push(line(tr(`Остальные · ${g.rest.length}`, `Others · ${g.rest.length}`), { sfimage: "tray.full" }));
      for (const [st, list] of byStatus(visible)) {
        out.push(line(`${clean(st, 40)} · ${list.length}`, { sfimage: statusSymbol(list[0]), color: "gray" }));
        for (const t of list) out.push(line(clean(t.name, 80), { href: t.url }));
      }
      if (g.rest.length > visible.length) out.push(line(tr(`…и ещё ${g.rest.length - visible.length} — в ClickUp`, `…and ${g.rest.length - visible.length} more — in ClickUp`), { color: "gray" }));
      out.push("---");
    }
  }
  const parts = [];
  if (r.fetchedAt) parts.push(tr(`обновлено ${fmtTime(r.fetchedAt, nowMs)}`, `updated ${fmtTime(r.fetchedAt, nowMs)}`));
  if (r.mode === "oauth" && r.oauth.nextAt) parts.push(tr(`следующее в ${fmtTime(r.oauth.nextAt, nowMs)}`, `next at ${fmtTime(r.oauth.nextAt, nowMs)}`));
  if (r.mode !== "oauth" && r.rate && r.rate.remaining !== null) parts.push(tr(`лимит API: осталось ${r.rate.remaining}`, `API limit: ${r.rate.remaining} left`));
  if (parts.length) out.push(line(parts.join(" · "), { color: "gray" }));
  if (r.mode === "oauth") {
    // откуда данные и почему реже, чем раньше (раз в 2 мин по личному токену)
    const min = Math.max(1, Math.round((r.oauth.intervalMs || 15 * 60_000) / 60_000));
    out.push(line(tr(`Через вход в ClickUp: раз в ${min} мин — ${budgetText(r.oauth.dailyBudget)}`, `Via the ClickUp sign-in: every ${min} min — ${budgetText(r.oauth.dailyBudget)}`), { color: "gray" }));
  } else if (r.mode === "token") out.push(line(tr("По личному токену ClickUp", "Using the personal ClickUp token"), { color: "gray" }));
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
