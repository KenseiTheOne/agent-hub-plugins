// scripts/check.mjs: линтер прав, запретные пути, потолок effects для сторонних, запуск на синтетическом HOME,
// дифф прав между ревизиями, сверка вендоринга.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "../scripts/check.mjs";
import { permissionsAtDir, permissionsDiff } from "../scripts/lib/registry.mjs";
import { checkVendor } from "../scripts/sync-vendor.mjs";
import { pathViolation } from "../scripts/vendor/perms.mjs";
import { cleanup, makeRegistry, pluginSource, README } from "./helpers.mjs";

const run = (root, extra = {}) => runCheck({ root, base: null, baseDir: null, report: null, skipTests: false, only: null, ...extra });
const errorsOf = (r, id) => r.plugins.find((p) => p.id === id)?.errors || [];

test("хороший сторонний плагин проходит, в том числе пробный запуск на синтетическом HOME", async () => {
  const root = makeRegistry({
    hello: {
      "hello.5m.mjs": pluginSource(),
      "README.md": README,
      "fixtures/home/.config/hello/state.json": "зелёный\n",
    },
  });
  try {
    const r = await run(root);
    assert.deepEqual(errorsOf(r, "hello"), []);
    assert.equal(r.plugins[0].smoke, "ok");
    assert.equal(r.ok, true, JSON.stringify(r, null, 1));
  } finally {
    cleanup(root);
  }
});

test("сторонний плагин с effects=session.stop отвергается", async () => {
  const root = makeRegistry({ bad: { "bad.1m.mjs": pluginSource({ effects: "open.url,session.stop" }), "README.md": README } });
  try {
    const r = await run(root);
    assert.equal(r.ok, false);
    assert.ok(errorsOf(r, "bad").some((e) => e.includes("session.stop") && e.includes("плагину реестра")), errorsOf(r, "bad").join("\n"));
  } finally {
    cleanup(root);
  }
});

test("вывод с effect вне потолка и вне объявленных — ошибка пробного запуска", async () => {
  const body = `console.log("X | status=ok");\nconsole.log("---");\nconsole.log('Стоп | effect="session.stop pid=1"');\nconsole.log('Фокус | effect="cmux.focus surface=a"');\n`;
  const root = makeRegistry({ sneaky: { "sneaky.1m.mjs": pluginSource({ body }), "README.md": README } });
  try {
    const errs = errorsOf(await run(root), "sneaky");
    assert.ok(errs.some((e) => e.includes("session.stop плагину реестра недоступен")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("cmux.focus не объявлен")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("<agenthub.action> у стороннего — ошибка, у official — можно", async () => {
  const src = pluginSource({ extra: ['// <agenthub.action id="go" level="confirm">/bin/echo go</agenthub.action>'] });
  const root = makeRegistry({ act: { "act.1m.mjs": src, "README.md": README } });
  try {
    assert.ok(errorsOf(await run(root, { skipTests: true }), "act").some((e) => e.includes("<agenthub.action>")));
  } finally {
    cleanup(root);
  }
  const root2 = makeRegistry({ act: { "act.1m.mjs": src, "README.md": README } }, { official: ["act"] });
  try {
    assert.deepEqual(errorsOf(await run(root2, { skipTests: true }), "act"), []);
  } finally {
    cleanup(root2);
  }
});

test("запретные пути в правах и в исходнике", async () => {
  for (const p of [
    "~/.claude/projects",
    "~/.claude/projects/x/y.jsonl",
    "~/.claude",
    "~/.claude/*",
    "~/.claude/**/*.jsonl",
    "~",
    "/Users/someone/.claude/projects",
    "$HOME/.claude/projects",
    "%USERPROFILE%\\.claude\\projects",
    "~/.claude/sessions",
    "~/.claude/sessions/*",
    "~/.claude/sessions/1.key",
    "~/x/*.key",
    "~/proj/.env",
    "~/proj/.env.local",
    "~/.codex/auth.json",
    "~/.cmuxterm/workstream.jsonl",
    "~/.cmuxterm/*.jsonl",
    "~/a/../.claude/projects",
  ]) {
    assert.ok(pathViolation(p), `должно быть запрещено: ${p}`);
  }
  for (const p of ["~/.claude/sessions/*.json", "~/.claude/cache/kensei-statusline", "~/.cmuxterm/claude-hook-sessions.json", "~/.config/tool/*", "~/Library/Logs/x.log"]) {
    assert.equal(pathViolation(p), null, `должно быть можно: ${p}`);
  }
  const root = makeRegistry({
    reader: {
      "reader.1m.mjs": pluginSource({ extra: ["// <agenthub.fsRead>~/.claude/projects — посмотреть</agenthub.fsRead>", "// <agenthub.exec>cat ~/.codex/auth.json — токен</agenthub.exec>"] }),
      "README.md": README,
    },
    sneak: {
      "sneak.1m.mjs": pluginSource({ body: `import { readFileSync } from "node:fs";\nconst p = "/x/auth.json";\nconsole.log("x | status=ok");\n` }),
      "README.md": README,
    },
    nowhy: { "nowhy.1m.mjs": pluginSource({ extra: ["// <agenthub.net>api.example.com</agenthub.net>"] }), "README.md": README },
  });
  try {
    const r = await run(root, { skipTests: true });
    assert.ok(errorsOf(r, "reader").some((e) => e.includes("~/.claude/projects")));
    assert.ok(errorsOf(r, "reader").some((e) => e.includes("auth.json")));
    assert.ok(errorsOf(r, "sneak").some((e) => e.includes("исходник упоминает запретное место: auth.json")));
    assert.ok(errorsOf(r, "nowhy").some((e) => e.includes("нет пояснения")));
  } finally {
    cleanup(root);
  }
});

test("структура: бинарник, ссылка, нет README, лишний исполняемый файл, плохой id", async () => {
  const root = makeRegistry({
    bin: { "bin.1m.mjs": "\0\0binary", "README.md": README },
    norm: { "norm.1m.mjs": pluginSource() },
    two: { "two.1m.mjs": pluginSource(), "two.5m.sh": "#!/bin/sh\n", "README.md": README },
    Bad_Id: { "Bad_Id.1m.mjs": pluginSource(), "README.md": README },
  });
  try {
    const r = await run(root, { skipTests: true });
    assert.ok(errorsOf(r, "bin").some((e) => e.includes("двоичный")));
    assert.ok(errorsOf(r, "norm").some((e) => e.includes("README")));
    assert.ok(errorsOf(r, "two").some((e) => e.includes("несколько")));
    assert.ok(errorsOf(r, "Bad_Id").some((e) => e.includes("имя папки")));
  } finally {
    cleanup(root);
  }
});

test("streamable: пробный запуск ждёт первый кадр ~~~", async () => {
  const body = `console.log("S | status=ok");\nconsole.log("~~~");\nsetInterval(() => {}, 1000);\n`;
  const root = makeRegistry({ live: { "live.mjs": pluginSource({ body, extra: ["// <agenthub.type>streamable</agenthub.type>"] }), "README.md": README } });
  try {
    const r = await run(root);
    assert.deepEqual(errorsOf(r, "live"), []);
    assert.equal(r.plugins[0].smoke, "ok");
  } finally {
    cleanup(root);
  }
});

test("тесты плагина идут на синтетическом HOME без лишнего окружения", async () => {
  const t = `import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
test("HOME синтетический", () => {
  assert.equal(readFileSync(join(process.env.HOME, ".config", "hello", "state.json"), "utf8").trim(), "ok");
  assert.ok(process.env.AGENTHUB_PLUGIN_FILE.endsWith("hello.5m.mjs"));
  assert.equal(process.env.GITHUB_TOKEN, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
});
`;
  const root = makeRegistry({
    hello: { "hello.5m.mjs": pluginSource(), "README.md": README, "fixtures/home/.config/hello/state.json": "ok\n", "test/hello.test.mjs": t },
  });
  try {
    const r = await run(root);
    assert.equal(r.plugins[0].tests, "ok", errorsOf(r, "hello").join("\n"));
  } finally {
    cleanup(root);
  }
});

test("дифф прав между ревизиями: рост виден, смена «зачем» — не рост", () => {
  const before = makeRegistry({ a: { "a.1m.mjs": pluginSource(), "README.md": README }, gone: { "gone.1m.mjs": pluginSource(), "README.md": README } });
  const after = makeRegistry({
    a: {
      "a.1m.mjs": pluginSource({ effects: "open.url,cmux.focus", extra: ["// <agenthub.net>api.example.com — статус</agenthub.net>"] }).replace("показать состояние", "другое пояснение"),
      "README.md": README,
    },
    fresh: { "fresh.1m.mjs": pluginSource(), "README.md": README },
  });
  try {
    const d = permissionsDiff(permissionsAtDir(before), permissionsAtDir(after));
    const a = d.find((x) => x.id === "a");
    assert.equal(a.change, "changed");
    assert.deepEqual(a.added.map((p) => p.key).sort(), ["effects:cmux.focus", "net:api.example.com"]);
    assert.deepEqual(a.removed, []);
    assert.equal(d.find((x) => x.id === "fresh").change, "new");
    assert.equal(d.find((x) => x.id === "gone").change, "removed");
  } finally {
    cleanup(before);
    cleanup(after);
  }
});

test("check с --base-dir кладёт дифф в отчёт", async () => {
  const before = makeRegistry({ a: { "a.1m.mjs": pluginSource(), "README.md": README } });
  const after = makeRegistry({ a: { "a.1m.mjs": pluginSource({ effects: "open.url,open.file" }), "README.md": README } });
  try {
    const r = await run(after, { baseDir: before, skipTests: true });
    assert.equal(r.permissionsGrew, true);
    assert.equal(r.diff[0].added[0].key, "effects:open.file");
  } finally {
    cleanup(before);
    cleanup(after);
  }
});

test("--perms-only: дифф прав без запуска плагина и его тестов (код PR не исполняется)", async () => {
  const before = makeRegistry({ a: { "a.1m.mjs": pluginSource(), "README.md": README } });
  const marker = join(before, "pwned");
  const evil = `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "x");\n`;
  const after = makeRegistry({
    a: {
      "a.1m.mjs": pluginSource({ effects: "open.url,open.file", body: evil }),
      "README.md": README,
      "test/x.test.mjs": evil,
    },
  });
  try {
    const r = await run(after, { baseDir: before, permsOnly: true });
    assert.equal(r.permissionsGrew, true);
    assert.equal(r.diff[0].added[0].key, "effects:open.file");
    assert.equal(r.plugins.length, 0, "плагины не проверялись и не запускались");
    assert.equal(existsSync(marker), false, "ни плагин, ни его тест не исполнялись");
    await assert.rejects(() => run(after, { permsOnly: true }), /нужна база/);
  } finally {
    cleanup(before);
    cleanup(after);
  }
});

test("ci.yml: метку прав даёт отдельный job perms без кода PR, а не job с тестами плагинов", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const jobs = {};
  let cur = null;
  for (const line of ci.split("\n")) {
    const m = /^  ([a-z][\w-]*):\s*$/.exec(line);
    if (m) cur = m[1];
    else if (/^\S/.test(line)) cur = null;
    if (cur) jobs[cur] = (jobs[cur] || "") + line + "\n";
  }
  assert.ok(jobs.check && jobs.perms, "есть jobs check и perms");
  assert.doesNotMatch(jobs.check, /perms-artifact|name: perms\b/, "job check артефакт perms не делает");
  assert.match(jobs.perms, /perms-artifact\.mjs/);
  assert.match(jobs.perms, /--perms-only/);
  assert.match(jobs.perms, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(jobs.perms, /check\.sh|node --test|working-directory: pr/, "в job perms код PR не исполняется");
  assert.doesNotMatch(ci, /^\s*pull_request_target:/m);
});

test("blocklist.json и official.json: форма проверяется", async () => {
  const root = makeRegistry({}, { blocklist: [{ id: "x" }, { id: "Bad!" , reason: "r" }], official: [] });
  try {
    const r = await run(root);
    assert.equal(r.ok, false);
    assert.ok(r.registry.some((e) => e.includes("нет reason")));
    assert.ok(r.registry.some((e) => e.includes("[1]: id")));
  } finally {
    cleanup(root);
  }
});

test("вендоринг: копии совпадают с VENDOR.json и с agent-hub, если он рядом", () => {
  const v = checkVendor();
  assert.deepEqual(v.problems, []);
  assert.deepEqual(v.drift, []);
});

test("official: effects тоже под потолком, действия не ниже confirm, запретные места — ошибка (исключения нет)", async () => {
  const src = pluginSource({
    effects: "open.url,session.stop",
    extra: ['// <agenthub.action id="go" level="immediate">/bin/echo go</agenthub.action>'],
    body: 'console.log("X | status=ok");\nconsole.log("---");\nconsole.log("// ~/.claude/projects | color=gray");\n',
  });
  const root = makeRegistry({ off: { "off.1m.mjs": src, "README.md": README + "\nЧитает `auth.json`.\n" } }, { official: ["off"] });
  try {
    const errs = errorsOf(await run(root, { skipTests: true }), "off");
    assert.ok(errs.some((e) => e.includes("session.stop") && e.includes("плагину реестра")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes('id="go"') && e.includes("не ниже confirm")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("~/.claude/projects")), errs.join("\n"));
    assert.ok(errs.some((e) => e.startsWith("README.md") && e.includes("auth.json")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("official: action= в выводе — только объявленные и с arg по шаблону", async () => {
  const body = [
    'console.log("X | status=ok");',
    'console.log("---");',
    'console.log("Ок | action=skip arg=T-1");',
    'console.log("Плохо | action=skip arg=-rf");',
    'console.log("Нет | action=nope");',
    'console.log("Лишний | action=stop arg=x");',
  ].join("\n") + "\n";
  const src = pluginSource({
    body,
    extra: [
      '// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9_-]{1,64}$">act.1m.mjs --action skip {taskId}</agenthub.action>',
      '// <agenthub.action id="stop" level="confirm">act.1m.mjs --action stop</agenthub.action>',
    ],
  });
  const root = makeRegistry({ act: { "act.1m.mjs": src, "README.md": README } }, { official: ["act"] });
  try {
    const errs = errorsOf(await run(root), "act");
    assert.equal(errs.filter((e) => e.includes("arg=T-1")).length, 0, errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("arg=-rf")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("action=nope не объявлено")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("action=stop: arg не объявлен")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});
