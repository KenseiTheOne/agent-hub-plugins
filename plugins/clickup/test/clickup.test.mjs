// Плагин clickup (agent-hub-plugins/plugins/clickup/clickup.2m.mjs) с двойником HTTP на 127.0.0.1 — в сеть не ходим.
// Запуск: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/clickup/test/*.test.mjs (или scripts/check.sh --only clickup)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseOutput, pluginDir, readPluginMeta, tempHome, testEnv } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "clickup.2m.mjs");
const FIX = join(DIR, "fixtures");
const mod = await import(PLUGIN);
const TOKEN = "pk_synthetic_test_token_0001";
const fix = (n) => JSON.parse(readFileSync(join(FIX, n), "utf8"));

// Двойник ClickUp: маршруты → (req) => {status, body, headers}
async function double(routes) {
  const log = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    log.push({ method: req.method, path: u.pathname, query: u.search, auth: req.headers.authorization });
    const h = routes[u.pathname];
    const r = h ? h(req, u) : { status: 404, body: { err: "Route not found", ECODE: "APP_001" } };
    res.writeHead(r.status ?? 200, { "content-type": "application/json", ...(r.headers || {}) });
    res.end(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, log, close: () => new Promise((r) => srv.close(r)) };
}

const okRoutes = (extraHeaders = {}) => ({
  "/api/v2/user": () => ({ body: fix("user.json"), headers: { "x-ratelimit-remaining": "98", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60), ...extraHeaders } }),
  "/api/v2/team": () => ({ body: fix("team.json"), headers: { "x-ratelimit-remaining": "97" } }),
  "/api/v2/team/9000001/task": () => ({ body: fix("tasks.json"), headers: { "x-ratelimit-remaining": "96", ...extraHeaders } }),
});

function setupHome() {
  const home = tempHome("ah-cu-");
  const env = testEnv(home, { AGENTHUB_PLUGIN_DATA_PATH: join(home, "data"), AGENTHUB_PLUGIN_CACHE_PATH: join(home, "cache") });
  mkdirSync(env.AGENTHUB_PLUGIN_DATA_PATH, { recursive: true });
  return { home, env };
}

// Связи: /ticket + сессия на той же ветке; ночь по attempts; вторая сессия в worktree с id в ветке.
function setupWork(home) {
  const repo = join(home, "repo");
  mkdirSync(join(repo, ".git", "worktrees", "wt"), { recursive: true });
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/fix/86aaa0001-loading\n");
  const wt = join(home, "wt-feature");
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "wt")}\n`);
  writeFileSync(join(repo, ".git", "worktrees", "wt", "HEAD"), "ref: refs/heads/feature/86aaa0003-session\n");
  const tr = join(home, ".claude", "task-runs");
  mkdirSync(join(tr, "Synth", "86aaa0001"), { recursive: true });
  writeFileSync(
    join(tr, "Synth", "86aaa0001", "RUN.md"),
    ["# Синтетический прогон", "", "task_id: 86aaa0001", "tracker: ClickUp", "task_ref: 86aaa0001", `repo_root: ${repo}`, "mode: fix", "branch: fix/86aaa0001-loading", "step: implement СИНТЕТИЧЕСКИЙ-ТЕКСТ-ШАГА", "step: review СИНТЕТИЧЕСКИЙ-ТЕКСТ-ШАГА", ""].join("\n"),
  );
  mkdirSync(join(tr, "night", "projects", "synth", "attempts"), { recursive: true });
  writeFileSync(join(tr, "night", "projects", "synth", "attempts", "86aaa0002.json"), JSON.stringify({ updated_ms: Date.now(), outcome: "PR открыт", date: "20261103", noted: {} }));
  const sess = join(home, ".claude", "sessions");
  mkdirSync(sess, { recursive: true });
  writeFileSync(join(sess, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "00000000-0000-4000-8000-00000000000a", cwd: repo, name: "синт-тикет", status: "busy" }));
  writeFileSync(join(sess, `${process.ppid}.json`), JSON.stringify({ pid: process.ppid, sessionId: "00000000-0000-4000-8000-00000000000b", cwd: join(wt, "sub"), status: "idle" }));
  mkdirSync(join(wt, "sub"), { recursive: true });
  writeFileSync(join(sess, "999999.json"), JSON.stringify({ pid: 999999, sessionId: "00000000-0000-4000-8000-00000000000c", cwd: join(home, "dead-86aaa0004"), status: "idle" }));
  writeFileSync(join(sess, `${process.pid}.key`), "НЕ-ЧИТАТЬ");
  mkdirSync(join(home, ".cmuxterm"), { recursive: true });
  writeFileSync(
    join(home, ".cmuxterm", "claude-hook-sessions.json"),
    JSON.stringify({ version: 1, sessions: { "00000000-0000-4000-8000-00000000000a": { sessionId: "00000000-0000-4000-8000-00000000000a", surfaceId: SURF, workspaceId: WS, lastBody: "НЕ-ЧИТАТЬ" } } }),
  );
}
const SURF = "11111111-2222-4333-8444-555555555555";
const WS = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function run(env) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [PLUGIN], { env, timeout: 10_000, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }));
      const parsed = parseOutput(stdout);
      assert.deepEqual(parsed.warnings, []);
      for (const m of ["СИНТЕТИЧЕСКОЕ-ОПИСАНИЕ", "СИНТЕТИЧЕСКИЙ-ТЕКСТ", TOKEN, "synthetic@example", "НЕ-ЧИТАТЬ"]) assert.ok(!stdout.includes(m), `в выводе нет «${m}»`);
      resolve({ text: stdout, parsed });
    });
  });
}

test("метаданные: secrets clickup.token, effects open.url и cmux.focus, net", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.equal(pm.id, "clickup");
  assert.equal(pm.intervalMs, 120_000);
  assert.equal(pm.meta.type, "standard");
  assert.deepEqual(pm.meta.effects, ["open.url", "cmux.focus"]);
  assert.equal(pm.meta.secrets.length, 1);
  assert.match(pm.meta.secrets[0], /^clickup\.token/);
  assert.ok(pm.meta.net.length);
});

test("белый список: только GET и только разрешённые пути и параметры; подмена адреса — только loopback", async () => {
  for (const ok of ["/api/v2/user", "/api/v2/team", "/api/v2/team/1/task", "/api/v2/list/2/task", "/api/v2/task/86abc"]) mod.checkRequest(ok);
  for (const bad of ["/api/v2/task/86abc/comment", "/api/v2/team/1/task/x", "/api/v2/user/../team", "/api/v3/user", "/api/v2/webhook", "/api/v2/team/abc/task"])
    assert.throws(() => mod.checkRequest(bad), (e) => e.kind === "denied", bad);
  assert.throws(() => mod.checkRequest("/api/v2/user", { archived: "true" }), (e) => e.kind === "denied");
  assert.equal(mod.resolveBase("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  for (const b of ["https://evil.example", "http://127.0.0.1.evil.example:80", "http://10.0.0.1:80", undefined]) assert.equal(mod.resolveBase(b), mod.API_BASE);
  // клиент сам по себе шлёт только GET с токеном в Authorization и не идёт по редиректам
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ user: { id: 1 } }), { status: 200, headers: { "x-ratelimit-remaining": "5" } });
  };
  const rates = [];
  const c = mod.makeClient({ token: TOKEN, base: "http://127.0.0.1:1", fetchImpl: fake, onRate: (r) => rates.push(r) });
  await c.get("/api/v2/user");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.Authorization, TOKEN);
  assert.equal(rates[0].remaining, 5);
  await assert.rejects(() => c.get("/api/v2/task/1/comment"), (e) => e.kind === "denied");
  assert.equal(calls.length, 1, "запрещённый путь не дошёл до сети");
});

test("нет токена → unknown, ни одного запроса", async () => {
  const d = await double(okRoutes());
  const { home, env } = setupHome();
  try {
    const { parsed } = await run({ ...env, AGENTHUB_CLICKUP_API_BASE: d.base });
    assert.equal(parsed.status, "unknown");
    assert.match(parsed.header[0].title, /нет токена/);
    assert.equal(d.log.length, 0);
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("тикеты на пользователя, ссылки open.url, связь с работой и уверенность; user/team кэшируются", async () => {
  const d = await double(okRoutes());
  const { home, env } = setupHome();
  setupWork(home);
  try {
    const e = { ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base };
    const { parsed, text } = await run(e);
    assert.deepEqual(
      d.log.map((x) => x.path),
      ["/api/v2/user", "/api/v2/team", "/api/v2/team/9000001/task"],
    );
    assert.ok(d.log.every((x) => x.method === "GET" && x.auth === TOKEN));
    const q = new URLSearchParams(d.log[2].query);
    assert.deepEqual(q.getAll("assignees[]"), ["1000001"]);
    assert.equal(q.get("include_closed"), "false");
    assert.equal(parsed.status, "ok");
    assert.match(parsed.header[0].title, /ClickUp: 4 тикета, в работе 2/);
    const items = parsed.body;
    const t1 = items.findIndex((i) => i.title.startsWith("86aaa0001 "));
    assert.ok(t1 >= 0);
    assert.equal(items[t1].href, "https://app.clickup.com/t/86aaa0001");
    assert.match(text, /\/ticket: шаг review \(fix\) · точно/);
    assert.match(text, /сессия «синт-тикет»: ветка fix\/86aaa0001-loading как в RUN\.md · сильно/);
    const focus = items.find((i) => i.effect && i.effect.startsWith("cmux.focus"));
    assert.equal(focus.effect, `cmux.focus ${SURF} workspaceId=${WS}`, "связь с сессией ведёт во вкладку");
    assert.match(text, /SYN-42 Синтетика: ночная задача — review/);
    assert.match(text, /ночь: PR открыт, 03\.11 · точно/);
    assert.match(text, /сессия 00000000: ветка feature\/86aaa0003-session · сильно/);
    assert.ok(!text.includes("dead-86aaa0004"), "мёртвая сессия не связывается");
    assert.ok(text.includes("в сессии ¦ с чертой"), "черта в названии не ломает разбор");
    const t4 = items.find((i) => i.title.startsWith("86aaa0004 "));
    assert.equal(t4.href, "https://app.clickup.com/t/86aaa0004", "небезопасный url заменён");
    assert.match(text, /лимит API: осталось 96/);
    // второй запуск: user/team из кэша — один запрос
    d.log.length = 0;
    await run(e);
    assert.deepEqual(d.log.map((x) => x.path), ["/api/v2/team/9000001/task"]);
    const cache = readFileSync(join(env.AGENTHUB_PLUGIN_CACHE_PATH, "state.json"), "utf8");
    assert.ok(!cache.includes(TOKEN), "токена нет в кэше");
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("RUN.md с session_id → связь с сессией «точно»", async () => {
  const d = await double(okRoutes());
  const { home, env } = setupHome();
  setupWork(home);
  const p = join(home, ".claude", "task-runs", "Synth", "86aaa0001", "RUN.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("mode: fix", "mode: fix\nsession_id: 00000000-0000-4000-8000-00000000000a"));
  try {
    const { text } = await run({ ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base });
    assert.match(text, /сессия «синт-тикет» \(из RUN\.md\) · точно/);
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("429 → бэкофф: следующий запуск не ходит в сеть и показывает прошлые тикеты", async () => {
  let limited = false;
  const routes = okRoutes();
  const inner = routes["/api/v2/team/9000001/task"];
  routes["/api/v2/team/9000001/task"] = (req, u) => (limited ? { status: 429, body: { err: "Rate limit", ECODE: "APP_002" }, headers: { "x-ratelimit-remaining": "0" } } : inner(req, u));
  const d = await double(routes);
  const { home, env } = setupHome();
  try {
    const e = { ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base };
    await run(e);
    limited = true;
    const r2 = await run(e);
    assert.match(r2.text, /Лимит запросов ClickUp \(429\), пауза до/);
    assert.match(r2.parsed.header[0].title, /4 тикета/, "прошлые тикеты остаются");
    const st = JSON.parse(readFileSync(join(env.AGENTHUB_PLUGIN_CACHE_PATH, "state.json"), "utf8"));
    assert.equal(st.backoff.n, 1);
    assert.ok(st.backoff.until >= Date.now() + 50_000);
    d.log.length = 0;
    const r3 = await run(e);
    assert.equal(d.log.length, 0, "во время бэкоффа запросов нет");
    assert.match(r3.text, /Пауза до/);
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("X-RateLimit-Remaining на исходе → ждём X-RateLimit-Reset без запросов", async () => {
  const reset = Math.floor(Date.now() / 1000) + 300;
  const routes = okRoutes({ "x-ratelimit-remaining": "1", "x-ratelimit-reset": String(reset) });
  const d = await double(routes);
  const { home, env } = setupHome();
  try {
    const e = { ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base };
    await run(e);
    d.log.length = 0;
    const r = await run(e);
    assert.equal(d.log.length, 0);
    assert.match(r.text, /бережём лимит/);
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("401 → error + auth-failed; незнакомая форма → unknown + source-broken; 500 — без событий", async () => {
  const cases = [
    [{ status: 401, body: { err: "Token invalid", ECODE: "OAUTH_025" } }, "error", "auth-failed"],
    [{ status: 200, body: { items: [] } }, "unknown", "source-broken"],
    [{ status: 200, body: { tasks: [{ id: 5 }] } }, "unknown", "source-broken"],
    [{ status: 200, body: "<html>не json" }, "unknown", "source-broken"],
    [{ status: 500, body: {} }, "unknown", null],
  ];
  for (const [resp, status, event] of cases) {
    const routes = okRoutes();
    routes["/api/v2/team/9000001/task"] = () => resp;
    const d = await double(routes);
    const { home, env } = setupHome();
    try {
      const { parsed } = await run({ ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base });
      assert.equal(parsed.status, status, JSON.stringify(resp));
      if (event) assert.ok(parsed.events.includes(event), JSON.stringify(resp));
      else assert.deepEqual(parsed.events, []);
    } finally {
      await d.close();
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("настройки: listIds без teams, assignee: null — без фильтра по пользователю", async () => {
  const routes = okRoutes();
  routes["/api/v2/list/8000001/task"] = () => ({ body: fix("tasks.json") });
  const d = await double(routes);
  const { home, env } = setupHome();
  writeFileSync(join(env.AGENTHUB_PLUGIN_DATA_PATH, "config.json"), JSON.stringify({ listIds: ["8000001"], assignee: null, limit: 2 }));
  try {
    const { text } = await run({ ...env, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: d.base });
    assert.deepEqual(d.log.map((x) => x.path), ["/api/v2/user", "/api/v2/list/8000001/task"]);
    assert.equal(new URLSearchParams(d.log[1].query).getAll("assignees[]").length, 0);
    assert.match(text, /…и ещё 2/);
  } finally {
    await d.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("parseRunMd: только ключи верхнего уровня из списка, у шагов — только имя", () => {
  const o = mod.parseRunMd("task_id: X1\nstep: implement длинный текст\n  caveat: вложенное\nprompt: нельзя\nstep: gate ещё текст\nbranch: night/x1-a\n");
  assert.deepEqual(o, { task_id: "X1", lastStep: "gate", branch: "night/x1-a" });
  assert.ok(!existsSync("/nonexistent"));
});

test("живость pid без /bin/ps (kill(pid, 0) — работает и на Windows)", () => {
  assert.deepEqual([...mod.pidsAlive([process.pid, 99_999_999, 0, -1])], [process.pid]);
  assert.doesNotMatch(readFileSync(PLUGIN, "utf8"), /\/bin\/ps/);
});
