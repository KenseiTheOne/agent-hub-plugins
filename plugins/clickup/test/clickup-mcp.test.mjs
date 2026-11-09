// clickup 1.2.0: тикеты через вход в ClickUp (MCP) — запросы делает хаб, плагин зовёт его по сокету
// (POST /connections/clickup/mcp). Хаб здесь — двойник на Unix-сокете во временном каталоге; в сеть не ходим.
// Запуск: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/clickup/test/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOutput, pluginDir, readPluginMeta, tempHome, testEnv } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "clickup.2m.mjs");
const mod = await import(pathToFileURL(PLUGIN).href);
const TOKEN = "pk_synthetic_test_token_0002";
const fixTasks = () => JSON.parse(readFileSync(join(DIR, "fixtures", "tasks.json"), "utf8")).tasks;

// Двойник хаба: ответ на POST /connections/clickup/mcp задаёт тест; запросы — в log (только путь и тело).
async function hubDouble(reply) {
  const dir = tempHome("ahp-hub-");
  const sock = join(dir, "hub.sock");
  const log = [];
  const srv = createServer((req, res) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      let body = null;
      try {
        body = JSON.parse(s);
      } catch {}
      log.push({ method: req.method, path: req.url, body });
      const r = reply(body, log.length);
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise((r) => srv.listen(sock, r));
  return { sock, log, close: () => new Promise((r) => srv.close(() => (rmSync(dir, { recursive: true, force: true }), r()))) };
}

// REST-двойник личного токена: любое обращение записывается (вход через хаб не должен до него доходить).
async function restDouble() {
  const log = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    log.push(u.pathname);
    const body = u.pathname === "/api/v2/user" ? { user: { id: 1001, username: "synthetic" } } : u.pathname === "/api/v2/team" ? { teams: [{ id: "9000001" }] } : { tasks: fixTasks().slice(0, 2) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, log, close: () => new Promise((r) => srv.close(r)) };
}

const mcpResult = (tasks) => ({ content: [{ type: "text", text: JSON.stringify({ tasks, has_more: false }) }] });
const ok = (extra = {}) => ({
  status: 200,
  body: { ok: true, result: mcpResult(fixTasks()), fetchedAt: new Date(Date.now() - 60_000).toISOString(), nextAt: new Date(Date.now() + 14 * 60_000).toISOString(), why: "interval", intervalMs: 900_000, calls24h: 12, dailyBudget: 100, fresh: true, ...extra },
});

function setupHome() {
  const home = tempHome("ah-cum-");
  const env = testEnv(home, { AGENTHUB_PLUGIN_DATA_PATH: join(home, "data"), AGENTHUB_PLUGIN_CACHE_PATH: join(home, "cache") });
  mkdirSync(env.AGENTHUB_PLUGIN_DATA_PATH, { recursive: true });
  return { home, env };
}

function run(env) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [PLUGIN], { env, timeout: 10_000, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }));
      const parsed = parseOutput(stdout);
      assert.deepEqual(parsed.warnings, []);
      for (const m of ["СИНТЕТИЧЕСКОЕ-ОПИСАНИЕ", TOKEN, "synthetic@example"]) assert.ok(!stdout.includes(m), `в выводе нет «${m}»`);
      resolve({ text: stdout, parsed });
    });
  });
}

const titles = (p) => [...p.header, ...p.body].map((i) => i.title);

test("метаданные 1.2.0: net mcp.clickup.com и api.clickup.com, push login-expired (вид problems)", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.equal(pm.meta.version, "1.2.0");
  const nets = pm.meta.net.map((x) => x.split(" — ")[0]);
  assert.deepEqual(nets.sort(), ["api.clickup.com", "mcp.clickup.com"]);
  assert.ok(pm.meta.secrets.some((s) => s.startsWith("clickup.token")), "личный токен — запасной путь");
  const src = readFileSync(PLUGIN, "utf8");
  assert.match(src, /<agenthub\.push key="login-expired" kind="problems">/);
  assert.match(src, /<agenthub\.push key="login-expired" kind="problems" lang="en">/);
});

test("вход через хаб: один вызов clickup_filter_tasks (assignees me), токен ClickUp плагину не нужен; REST не трогается", async () => {
  const hub = await hubDouble(() => ok());
  const rest = await restDouble();
  const { home, env } = setupHome();
  try {
    const { parsed, text } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: rest.base });
    assert.equal(hub.log.length, 1);
    assert.equal(hub.log[0].method, "POST");
    assert.equal(hub.log[0].path, "/connections/clickup/mcp");
    assert.equal(hub.log[0].body.tool, "clickup_filter_tasks");
    assert.deepEqual(hub.log[0].body.args.assignees, ["me"]);
    assert.equal(hub.log[0].body.args.include_closed, false);
    assert.deepEqual(hub.log[0].body.args.fields, mod.MCP_FIELDS);
    assert.ok(!JSON.stringify(hub.log[0].body).includes(TOKEN), "токен в хаб не уходит");
    assert.deepEqual(rest.log, [], "есть вход — личный токен не используется");
    assert.equal(parsed.status, "ok");
    assert.match(parsed.header[0].title, /^ClickUp: 4 тикета/);
    const all = titles(parsed).join("\n");
    assert.match(all, /обновлено \d\d:\d\d · следующее в \d\d:\d\d/);
    assert.match(all, /Через вход в ClickUp: раз в 15 мин — на тарифе Free ClickUp даёт около 100 запросов в сутки/);
    assert.ok(parsed.body.some((i) => /Синтетика: починить экран загрузки/.test(i.title) && i.offer?.primitive === "open.url") || /href=/.test(text));
  } finally {
    await hub.close();
    await rest.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("почему реже: лимит ClickUp, бюджет суток, загрузка — в шапке и пояснениях (ru и en)", async () => {
  const cases = [
    { body: ok({ why: "rate-limit", fresh: false, error: "mcp:rate-limited" }).body, ru: /ClickUp сообщил, что лимит запросов исчерпан — следующее обновление в \d\d:\d\d/, en: /ClickUp says the request limit is used up — next refresh at \d\d:\d\d/ },
    { body: ok({ why: "budget", calls24h: 96, fresh: false }).body, ru: /Бережём суточный лимит ClickUp: 96 из 100 запросов за 24 ч/, en: /Saving the ClickUp daily limit: 96 of 100 requests in 24 h/ },
    { body: { ok: false, pending: true, result: null, fetchedAt: null, nextAt: null, why: "interval", intervalMs: 900_000 }, ru: /Загружаю тикеты из ClickUp…/, en: /Loading tickets from ClickUp…/, status: "unknown" },
  ];
  for (const c of cases) {
    for (const lang of ["ru", "en"]) {
      const hub = await hubDouble(() => ({ status: 200, body: c.body }));
      const { home, env } = setupHome();
      try {
        const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_LANG: lang });
        assert.match(titles(parsed).join("\n"), c[lang]);
        if (c.status) assert.equal(parsed.status, c.status);
      } finally {
        await hub.close();
        rmSync(home, { recursive: true, force: true });
      }
    }
  }
});

test("вход истёк (409 oauth:expired): «подключите снова», error + login-expired, прошлые тикеты остаются; с личным токеном — работаем по нему", async () => {
  const { home, env } = setupHome();
  const hubOk = await hubDouble(() => ok());
  await run({ ...env, AGENTHUB_HUB_SOCKET: hubOk.sock });
  await hubOk.close();
  const hub = await hubDouble(() => ({ status: 409, body: { error: "oauth:expired", connection: { state: "expired" } } }));
  const rest = await restDouble();
  try {
    const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
    assert.equal(parsed.status, "error");
    assert.equal(parsed.header[0].title, "ClickUp: подключите снова");
    assert.deepEqual(parsed.events, ["login-expired"]);
    assert.ok(titles(parsed).some((t) => /Синтетика/.test(t)), "прошлые тикеты на месте");
    const en = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_LANG: "en" });
    assert.equal(en.parsed.header[0].title, "ClickUp: reconnect");
    // с личным токеном — данные по нему и оранжевая заметка, без события
    const withPat = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: rest.base });
    assert.deepEqual(rest.log, ["/api/v2/user", "/api/v2/team", "/api/v2/team/9000001/task"]);
    assert.equal(withPat.parsed.status, "ok");
    assert.deepEqual(withPat.parsed.events, []);
    assert.match(titles(withPat.parsed).join("\n"), /Вход в ClickUp истёк — пока работаю по личному токену/);
  } finally {
    await hub.close();
    await rest.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("не подключён (409 not-connected): без токена — «Подключить ClickUp» и запасной путь; с токеном — личный токен", async () => {
  const hub = await hubDouble(() => ({ status: 409, body: { error: "oauth:not-connected" } }));
  const rest = await restDouble();
  const { home, env } = setupHome();
  try {
    const ru = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
    assert.equal(ru.parsed.status, "unknown");
    assert.equal(ru.parsed.header[0].title, "ClickUp не подключён");
    const all = titles(ru.parsed).join("\n");
    assert.match(all, /Нажмите «Подключить ClickUp» — вход и подтверждение на сайте ClickUp/);
    assert.match(all, /Запасной путь — личный токен/);
    assert.match(all, /security add-generic-password -s agent-hub\.clickup -a token/);
    const en = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_LANG: "en" });
    assert.equal(en.parsed.header[0].title, "ClickUp isn't connected");
    assert.match(titles(en.parsed).join("\n"), /Click Connect ClickUp/);
    const pat = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_SECRET_CLICKUP_TOKEN: TOKEN, AGENTHUB_CLICKUP_API_BASE: rest.base });
    assert.equal(pat.parsed.status, "ok");
    assert.match(titles(pat.parsed).join("\n"), /По личному токену ClickUp/);
    assert.ok(rest.log.length > 0);
  } finally {
    await hub.close();
    await rest.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("хаб без службы oauth или не отвечает — как раньше: личный токен, без него «нужен токен»", async () => {
  const { home, env } = setupHome();
  try {
    const gone = await run({ ...env, AGENTHUB_HUB_SOCKET: join(home, "nope.sock") });
    assert.equal(gone.parsed.status, "unknown");
    const hub404 = await hubDouble(() => ({ status: 404, body: { error: "not-found" } }));
    const r = await run({ ...env, AGENTHUB_HUB_SOCKET: hub404.sock });
    await hub404.close();
    assert.equal(r.parsed.header[0].title, "ClickUp не подключён");
    const noHub = await run(env);
    assert.match(noHub.parsed.header[0].title, /не подключён — нужен токен/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("незнакомая форма ответа инструмента → unknown + source-broken; ошибка инструмента — тоже", async () => {
  for (const result of [{ content: [{ type: "text", text: "Task summary: 3 tasks" }] }, { content: [{ type: "text", text: "{\"items\":[]}" }] }, { isError: true, content: [{ type: "text", text: "boom" }] }]) {
    const hub = await hubDouble(() => ({ status: 200, body: { ...ok().body, result } }));
    const { home, env } = setupHome();
    try {
      const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
      assert.equal(parsed.status, "unknown");
      assert.deepEqual(parsed.events, ["source-broken"]);
    } finally {
      await hub.close();
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("разбор ответа: structuredContent, массив, статус строкой, даты ISO и секунды; аргументы из настроек", () => {
  const t = mod.tasksFromMcp({ structuredContent: { tasks: [{ id: 42, name: "A", status: "open", list: "Бэклог", date_updated: "2026-11-09T10:00:00Z", due_date: 1_800_000_000 }] } });
  assert.deepEqual(t[0], { id: "42", customId: null, name: "A", status: "open", statusColor: null, statusType: null, url: "https://app.clickup.com/t/42", list: "Бэклог", updatedMs: Date.parse("2026-11-09T10:00:00Z"), dueMs: 1_800_000_000_000 });
  assert.equal(mod.tasksFromMcp({ content: [{ type: "text", text: JSON.stringify([{ id: "x", name: "B", url: "https://evil.example/" }]) }] })[0].url, "https://app.clickup.com/t/x");
  assert.throws(() => mod.tasksFromMcp({ content: [{ type: "text", text: JSON.stringify({ tasks: [{ name: "без id" }] }) }] }), (e) => e.reason === "task-no-id");
  assert.deepEqual(mod.mcpArgs({ assignee: null, listIds: ["12", "x"], teamIds: ["900", "901"] }), { include_closed: false, subtasks: true, order_by: "updated", fields: mod.MCP_FIELDS, list_ids: ["12"], workspace_id: "900" });
});

// ревью 09.11: текст ошибки инструмента, требование workspace_id, «нет доступа» (403), тариф по бюджету ядра
test("ошибка инструмента: текст ClickUp и подсказка про teamIds; при прошлом результате из памяти ядра — тоже", async () => {
  const cases = [
    // ядро 09.11+: ok:false, error mcp:tool-error, errorText
    { ...ok().body, ok: false, result: null, error: "mcp:tool-error", errorText: "Error: workspace_id required when you belong to several workspaces", why: "tool-error" },
    // прошлый результат в памяти ядра, но новый вызов вернул ошибку
    { ...ok().body, error: "mcp:tool-error", errorText: "Error: workspace_id required", why: "tool-error" },
    // хаб старше: ошибка инструмента пришла как результат
    { ...ok().body, result: { isError: true, content: [{ type: "text", text: "Error: workspace_id required" }] } },
  ];
  for (const body of cases) {
    const hub = await hubDouble(() => ({ status: 200, body }));
    const { home, env } = setupHome();
    try {
      const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
      assert.equal(parsed.status, "unknown");
      assert.equal(parsed.header[0].title, "ClickUp: укажите рабочее пространство");
      const all = titles(parsed).join("\n");
      assert.match(all, /укажите teamIds в config\.json плагина/);
      assert.match(all, /workspace_id required/, "текст ClickUp не выброшен");
      assert.doesNotMatch(all, /незнакомая форма|не разобран/);
      assert.deepEqual(parsed.events, ["source-broken"]);
    } finally {
      await hub.close();
      rmSync(home, { recursive: true, force: true });
    }
  }
  // другая ошибка инструмента — общий заголовок и текст ClickUp
  const hub = await hubDouble(() => ({ status: 200, body: { ...ok().body, ok: false, result: null, error: "mcp:tool-error", errorText: "Internal tool failure 42" } }));
  const { home, env } = setupHome();
  try {
    const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
    assert.equal(parsed.header[0].title, "ClickUp: запрос вернул ошибку");
    assert.match(titles(parsed).join("\n"), /Internal tool failure 42/);
  } finally {
    await hub.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("403 у ядра (mcp:forbidden) — «нет доступа», не «подключите снова»; тариф в подписи — по бюджету ядра", async () => {
  const hub = await hubDouble(() => ({ status: 200, body: { ...ok().body, error: "mcp:forbidden", why: "forbidden" } }));
  const { home, env } = setupHome();
  try {
    const { parsed } = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock });
    assert.equal(parsed.status, "error");
    assert.equal(parsed.header[0].title, "ClickUp: нет доступа к тикетам через вход");
    assert.doesNotMatch(titles(parsed).join("\n"), /подключите снова/);
    assert.ok(!parsed.events.includes("login-expired"));
  } finally {
    await hub.close();
    rmSync(home, { recursive: true, force: true });
  }
  for (const [budget, re] of [[300, /на тарифе Unlimited ClickUp даёт около 300 запросов/], [250, /хаб тратит не больше 250 запросов в сутки/]]) {
    const h2 = await hubDouble(() => ok({ dailyBudget: budget }));
    const s2 = setupHome();
    try {
      const { parsed } = await run({ ...s2.env, AGENTHUB_HUB_SOCKET: h2.sock });
      const all = titles(parsed).join("\n");
      assert.match(all, re);
      assert.doesNotMatch(all, /тарифе Free/);
    } finally {
      await h2.close();
      rmSync(s2.home, { recursive: true, force: true });
    }
  }
});
