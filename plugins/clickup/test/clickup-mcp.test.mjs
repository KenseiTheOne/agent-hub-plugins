// clickup 1.2.0+: tickets via the ClickUp sign-in (MCP) — the hub makes the requests, the plugin calls it over the socket
// (POST /connections/clickup/mcp). The hub here is a double on a Unix socket in a temp folder; no network.
// Run: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/clickup/test/*.test.mjs

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

// The plugin calls the hub only over an absolute Unix socket (AGENTHUB_HUB_SOCKET starting with "/"): on Windows there
// is no hub socket and the plugin works with a personal token there — other tests cover those cases.
const HUB = { skip: process.platform === "win32" ? "hub socket — macOS/Linux only" : false };

// Hub double: the test sets the reply to POST /connections/clickup/mcp; requests go to log (path and body only).
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

// REST double for the personal token: every request is logged (the hub sign-in path must never reach it).
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
      for (const m of ["СИНТЕТИЧЕСКОЕ-ОПИСАНИЕ", TOKEN, "synthetic@example"]) assert.ok(!stdout.includes(m), `output does not contain "${m}"`);
      resolve({ text: stdout, parsed });
    });
  });
}

const titles = (p) => [...p.header, ...p.body].map((i) => i.title);

test("metadata 1.5.0 (contract 3): net mcp.clickup.com and api.clickup.com, the plugin declares the connection itself, icon, sign-in failures use the shared problems kind (no own toggle)", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.meta.version, "1.5.0");
  assert.equal(pm.meta.contract, 3);
  assert.deepEqual(pm.meta.icon, { symbol: "checklist", color: "#FF375F" });
  const nets = pm.meta.net.map((x) => x.split(" — ")[0]);
  assert.deepEqual(nets.sort(), ["api.clickup.com", "mcp.clickup.com"]);
  assert.ok(pm.meta.secrets.some((s) => s.startsWith("clickup.token")), "the personal token is the fallback");
  // everything the core knew about ClickUp before contract 2 is now in the plugin's declaration; the only tool is the one the plugin calls
  assert.equal(pm.meta.connections.length, 1);
  const c = pm.meta.connections[0];
  assert.deepEqual(
    { id: c.id, type: c.type, url: c.url, scope: c.scope, tools: c.tools, intervalMs: c.intervalMs, budget: c.budget, title: c.title },
    { id: "clickup", type: "mcp", url: "https://mcp.clickup.com/mcp", scope: "read", tools: ["clickup_filter_tasks"], intervalMs: 900_000, budget: 100, title: "ClickUp" },
  );
  assert.ok(nets.includes(c.host), "the connection host is declared in <agenthub.net>");
  assert.ok(c.note && pm.meta.i18n.en.connections.clickup.note, "the \"why\" is in both languages");
  const src = readFileSync(PLUGIN, "utf8");
  assert.equal((src.match(/tool: "([a-z_]+)"/g) || []).every((m) => c.tools.includes(m.slice(7, -1))), true, "the plugin calls only allowlisted tools");
  // a sign-in failure uses the core's shared "Problems and warnings" kind (kind="problems"), as before 1.3.0: turning off
  // "Problems" silences these events too; ClickUp has no toggle of its own and no legacy kinds
  assert.deepEqual(pm.meta.push.map((r) => [r.key, r.kind, r.legacyKind ?? null]), [["auth-failed", "problems", null], ["login-expired", "problems", null]]);
  assert.deepEqual(pm.meta.push.map((r) => Boolean(r.labels?.en)), [true, true]);
});

test("hub sign-in: one clickup_filter_tasks call (assignees me), the plugin needs no ClickUp token; REST is not touched", HUB, async () => {
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
    assert.ok(!JSON.stringify(hub.log[0].body).includes(TOKEN), "the token is not sent to the hub");
    assert.deepEqual(rest.log, [], "with a sign-in the personal token is not used");
    assert.equal(parsed.status, "ok");
    assert.match(parsed.header[0].title, /^ClickUp: 4 тикета/);
    const all = titles(parsed).join("\n");
    assert.match(all, /обновлено (?:\d\d\.\d\d )?\d\d:\d\d · следующее в (?:\d\d\.\d\d )?\d\d:\d\d/);
    assert.match(all, /Через вход в ClickUp: раз в 15 мин — на тарифе Free ClickUp даёт около 100 запросов в сутки/);
    assert.ok(parsed.body.some((i) => /Синтетика: починить экран загрузки/.test(i.title) && i.offer?.primitive === "open.url") || /href=/.test(text));
  } finally {
    await hub.close();
    await rest.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("why less often: ClickUp limit, daily budget, loading — in the header and notes (ru and en)", HUB, async () => {
  const cases = [
    { body: ok({ why: "rate-limit", fresh: false, error: "mcp:rate-limited" }).body, ru: /ClickUp сообщил, что лимит запросов исчерпан — следующее обновление в (?:\d\d\.\d\d )?\d\d:\d\d/, en: /ClickUp says the request limit is used up — next refresh at (?:[A-Z][a-z]{2} \d{1,2} )?\d\d:\d\d/ },
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

test("sign-in expired (409 oauth:expired): \"reconnect\", error + login-expired, previous tickets remain; with a personal token — use it", HUB, async () => {
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
    assert.ok(titles(parsed).some((t) => /Синтетика/.test(t)), "previous tickets are still there");
    const en = await run({ ...env, AGENTHUB_HUB_SOCKET: hub.sock, AGENTHUB_LANG: "en" });
    assert.equal(en.parsed.header[0].title, "ClickUp: reconnect");
    // with a personal token — data from it and an orange note, no event
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

test("not connected (409 not-connected): without a token — \"Connect ClickUp\" and the fallback; with a token — the personal token", HUB, async () => {
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

test("hub without the oauth service or not answering — as before: personal token, without it \"token needed\"", HUB, async () => {
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

test("unfamiliar tool response shape → unknown + source-broken; a tool error too", HUB, async () => {
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

test("response parsing: structuredContent, array, status as a string, ISO and seconds dates; arguments from settings", () => {
  const t = mod.tasksFromMcp({ structuredContent: { tasks: [{ id: 42, name: "A", status: "open", list: "Бэклог", date_updated: "2026-11-09T10:00:00Z", due_date: 1_800_000_000 }] } });
  assert.deepEqual(t[0], { id: "42", customId: null, name: "A", status: "open", statusColor: null, statusType: null, url: "https://app.clickup.com/t/42", list: "Бэклог", updatedMs: Date.parse("2026-11-09T10:00:00Z"), dueMs: 1_800_000_000_000, priority: null });
  assert.equal(mod.tasksFromMcp({ content: [{ type: "text", text: JSON.stringify([{ id: "x", name: "B", url: "https://evil.example/" }]) }] })[0].url, "https://app.clickup.com/t/x");
  assert.throws(() => mod.tasksFromMcp({ content: [{ type: "text", text: JSON.stringify({ tasks: [{ name: "без id" }] }) }] }), (e) => e.reason === "task-no-id");
  assert.deepEqual(mod.mcpArgs({ assignee: null, listIds: ["12", "x"], teamIds: ["900", "901"] }), { include_closed: false, subtasks: true, order_by: "updated", fields: mod.MCP_FIELDS, list_ids: ["12"], workspace_id: "900" });
});

// review of Nov 9: tool error text, the workspace_id requirement, "no access" (403), plan from the core budget
test("tool error: ClickUp's text and a teamIds hint; also with a previous result in the core's memory", HUB, async () => {
  const cases = [
    // core Nov 9+: ok:false, error mcp:tool-error, errorText
    { ...ok().body, ok: false, result: null, error: "mcp:tool-error", errorText: "Error: workspace_id required when you belong to several workspaces", why: "tool-error" },
    // a previous result in the core's memory, but the new call returned an error
    { ...ok().body, error: "mcp:tool-error", errorText: "Error: workspace_id required", why: "tool-error" },
    // older hub: the tool error arrived as a result
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
      assert.match(all, /workspace_id required/, "ClickUp's text is not dropped");
      assert.doesNotMatch(all, /незнакомая форма|не разобран/);
      assert.deepEqual(parsed.events, ["source-broken"]);
    } finally {
      await hub.close();
      rmSync(home, { recursive: true, force: true });
    }
  }
  // another tool error — the generic header and ClickUp's text
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

test("403 in the core (mcp:forbidden) — \"no access\", not \"reconnect\"; the plan in the caption follows the core budget", HUB, async () => {
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
