// scripts/check.mjs: the permission linter, forbidden paths, the effects ceiling for third-party plugins, runs on a
// synthetic HOME, the permission diff between revisions, the vendoring check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCheck } from "../scripts/check.mjs";
import { permissionsAtDir, permissionsDiff } from "../scripts/lib/registry.mjs";
import { checkVendor } from "../scripts/sync-vendor.mjs";
import { pathViolation } from "../scripts/vendor/perms.mjs";
import { cleanup, makeRegistry, pluginSource, README } from "./helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (root, extra = {}) => runCheck({ root, base: null, baseDir: null, report: null, skipTests: false, only: null, ...extra });
const errorsOf = (r, id) => r.plugins.find((p) => p.id === id)?.errors || [];

test("a good third-party plugin passes, including the smoke run on a synthetic HOME", async () => {
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

test("a third-party plugin with effects=session.stop is rejected", async () => {
  const root = makeRegistry({ bad: { "bad.1m.mjs": pluginSource({ effects: "open.url,session.stop" }), "README.md": README } });
  try {
    const r = await run(root);
    assert.equal(r.ok, false);
    assert.ok(errorsOf(r, "bad").some((e) => e.includes("session.stop") && e.includes("плагину реестра")), errorsOf(r, "bad").join("\n"));
  } finally {
    cleanup(root);
  }
});

test("output with an effect above the ceiling or not declared is a smoke-run error", async () => {
  const body = `console.log("X | status=ok");\nconsole.log("---");\nconsole.log('Стоп | effect="session.stop pid=1"');\nconsole.log('Фокус | effect="cmux.focus surface=a"');\n`;
  const root = makeRegistry({ sneaky: { "sneaky.1m.mjs": pluginSource({ body }), "README.md": README } });
  try {
    const errs = errorsOf(await run(root), "sneaky");
    assert.ok(errs.some((e) => e.includes("session.stop is not available to a registry plugin")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("cmux.focus is not declared")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("<agenthub.action> is an error for a third-party plugin and allowed for an official one", async () => {
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

test("forbidden paths in permissions and in the source", async () => {
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
    assert.ok(pathViolation(p), `should be forbidden: ${p}`);
  }
  for (const p of ["~/.claude/sessions/*.json", "~/.claude/cache/kensei-statusline", "~/.cmuxterm/claude-hook-sessions.json", "~/.config/tool/*", "~/Library/Logs/x.log"]) {
    assert.equal(pathViolation(p), null, `should be allowed: ${p}`);
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

test("structure: binary, link, no README, extra executable file, bad id", async () => {
  const root = makeRegistry({
    bin: { "bin.1m.mjs": "\0\0binary", "README.md": README },
    norm: { "norm.1m.mjs": pluginSource() },
    two: { "two.1m.mjs": pluginSource(), "two.5m.sh": "#!/bin/sh\n", "README.md": README },
    Bad_Id: { "Bad_Id.1m.mjs": pluginSource(), "README.md": README },
  });
  try {
    const r = await run(root, { skipTests: true });
    assert.ok(errorsOf(r, "bin").some((e) => e.includes("binary")));
    assert.ok(errorsOf(r, "norm").some((e) => e.includes("README")));
    assert.ok(errorsOf(r, "two").some((e) => e.includes("several")));
    assert.ok(errorsOf(r, "Bad_Id").some((e) => e.includes("folder name")));
  } finally {
    cleanup(root);
  }
});

test("streamable: the smoke run waits for the first ~~~ frame", async () => {
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

test("plugin tests run on a synthetic HOME without extra environment", async () => {
  const t = `import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
test("HOME is synthetic", () => {
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

test("permission diff between revisions: growth shows, a changed \"why\" is not growth", () => {
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

test("check with --base-dir puts the diff in the report", async () => {
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

test("--perms-only: the permission diff without running the plugin or its tests (PR code is not executed)", async () => {
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
    assert.equal(r.plugins.length, 0, "plugins were not checked or run");
    assert.equal(existsSync(marker), false, "neither the plugin nor its test ran");
    await assert.rejects(() => run(after, { permsOnly: true }), /needs a base/);
  } finally {
    cleanup(before);
    cleanup(after);
  }
});

test("ci.yml: the perms job runs no PR code and makes no label artifact; main runs are not cancelled mid-signing", () => {
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
  assert.ok(jobs.check && jobs.perms && jobs.sign, "jobs check, perms and sign exist");
  // for pull_request, ci.yml comes from the PR: nothing from this run goes into the label
  assert.doesNotMatch(ci, /perms-artifact|upload-artifact/, "ci makes no artifact for the label");
  assert.match(jobs.perms, /--perms-only/);
  assert.match(jobs.perms, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(jobs.perms, /check\.sh|node --test|working-directory: pr/, "the perms job does not execute PR code");
  assert.doesNotMatch(ci, /^\s*pull_request_target:/m);
  // cancellation only for PRs; sign has its own queue without cancellation; archives before the index, the pair is verified after upload
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(jobs.sign, /group: sign-index\n\s+cancel-in-progress: false/);
  assert.match(jobs.sign, /--published published\/index\.json/);
  const up = jobs.sign.indexOf('"${archives[@]}"');
  assert.ok(up > 0 && up < jobs.sign.indexOf("dist/index.json.minisig dist/index.json"), "archives are uploaded before the index");
  assert.match(jobs.sign, /cmp -s verify\/index\.json dist\/index\.json/);
});

test("perms-label.yml: computes permission growth itself with default-branch scripts over PR files, doesn't trust a run artifact", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const y = readFileSync(join(root, ".github", "workflows", "perms-label.yml"), "utf8");
  // the run doesn't depend on the PR's ci.yml (whose name and triggers the PR can change): pull_request_target, not workflow_run
  assert.match(y, /^\s+pull_request_target:\n\s+branches: \[main\]/m);
  assert.doesNotMatch(y, /^\s+workflow_run:/m);
  assert.doesNotMatch(y, /secrets\./, "no secrets");
  assert.doesNotMatch(y, /^\s+(contents|actions|issues|checks|statuses): write/m, "write access only for pull-requests");
  assert.equal((y.match(/persist-credentials: false/g) || []).length, 2, "both checkouts without a token");
  assert.doesNotMatch(y, /gh run download|download-artifact/, "no artifact from the PR run is read");
  assert.match(y, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n\s+path: base/);
  assert.match(y, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}\n\s+path: pr/);
  assert.match(y, /working-directory: base/);
  assert.match(y, /node scripts\/check\.mjs --perms-only --root \.\.\/pr --base-dir \./);
  assert.doesNotMatch(y, /working-directory: pr|check\.sh|node --test|npm /, "PR code is not executed");
  assert.match(y, /\^\(\\\.github\/\|scripts\/\|official\\\.json\$\|blocklist\\\.json\$\|CODEOWNERS\$\)/, "changing trusted paths also gets the label");
  assert.doesNotMatch(y, /^\s*actions: read/m);
});

test("blocklist.json and official.json: shape is checked", async () => {
  const root = makeRegistry({}, { blocklist: [{ id: "x" }, { id: "Bad!" , reason: "r" }], official: [] });
  try {
    const r = await run(root);
    assert.equal(r.ok, false);
    assert.ok(r.registry.some((e) => e.includes("no reason")));
    assert.ok(r.registry.some((e) => e.includes("[1]: id")));
  } finally {
    cleanup(root);
  }
});

test("vendoring: copies match VENDOR.json and agent-hub, if it's next door", () => {
  const v = checkVendor();
  assert.deepEqual(v.problems, []);
  assert.deepEqual(v.drift, []);
});

test("vendoring: contract copy — .DS_Store is not an error; an extra file (dot files too), a hand-edited one and a missing one are errors", () => {
  // a copy of scripts/vendor and docs/contract in a temp directory: the registry's shared docs/contract stays untouched
  const tmp = mkdtempSync(join(tmpdir(), "vendor-"));
  try {
    const vendorDir = join(tmp, "vendor");
    const contractDir = join(tmp, "contract");
    cpSync(join(ROOT, "scripts", "vendor"), vendorDir, { recursive: true });
    cpSync(join(ROOT, "docs", "contract"), contractDir, { recursive: true });
    const check = () => checkVendor({ from: null, vendorDir, contractDir });
    assert.deepEqual(check().problems, []);
    // Finder drops .DS_Store, .gitignore keeps it out — it doesn't fail the check
    writeFileSync(join(contractDir, ".DS_Store"), "x");
    assert.deepEqual(check().problems, []);
    // git would commit any other dot file — so it's an extra file like any other
    writeFileSync(join(contractDir, ".notes.md"), "x");
    assert.deepEqual(check().problems, ["docs/contract/.notes.md: extra file — only scripts/sync-vendor.mjs writes the copy"]);
    rmSync(join(contractDir, ".notes.md"));
    writeFileSync(join(contractDir, "notes.md"), "x");
    assert.deepEqual(check().problems, ["docs/contract/notes.md: extra file — only scripts/sync-vendor.mjs writes the copy"]);
    rmSync(join(contractDir, "notes.md"));
    writeFileSync(join(contractDir, "push.md"), readFileSync(join(contractDir, "push.md"), "utf8") + "\nedit\n");
    assert.deepEqual(check().problems, ["docs/contract/push.md doesn't match VENDOR.json (edited by hand?)"]);
    rmSync(join(contractDir, "push.md"));
    assert.deepEqual(check().problems, ["docs/contract/push.md is missing — run node scripts/sync-vendor.mjs"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("official: effects are also under the ceiling, an immediate action only without network, forbidden locations are an error (no exception)", async () => {
  // 09.11: an official plugin without network may use immediate (the core runs it without a window, only from the app); with network it may not
  const src = pluginSource({
    effects: "open.url,session.stop",
    extra: ['// <agenthub.net>api.example.com — данные</agenthub.net>', '// <agenthub.action id="go" level="immediate">/bin/echo go</agenthub.action>'],
    body: 'console.log("X | status=ok");\nconsole.log("---");\nconsole.log("// ~/.claude/projects | color=gray");\n',
  });
  const root = makeRegistry({ off: { "off.1m.mjs": src, "README.md": README + "\nЧитает `auth.json`.\n" } }, { official: ["off"] });
  try {
    const errs = errorsOf(await run(root, { skipTests: true }), "off");
    assert.ok(errs.some((e) => e.includes("session.stop") && e.includes("плагину реестра")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes('id="go"') && e.includes("immediate — только у плагина без сети")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("~/.claude/projects")), errs.join("\n"));
    assert.ok(errs.some((e) => e.startsWith("README.md") && e.includes("auth.json")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});

// Review 09.11 (low): "no network" doesn't mean "free" — immediate with a cost (cost=) is an error, without a cost it's a
// "!" note for the reviewer in the check.sh report (the check still passes).
test("official: immediate with cost= is an error; immediate without a cost is a warning for the reviewer, the check passes", async () => {
  const priced = pluginSource({ extra: ['// <agenthub.action id="go" level="immediate" cost-en="quota">/bin/echo go</agenthub.action>'] });
  const plain = pluginSource({ extra: ['// <agenthub.action id="flip" level="immediate" title="Переключить">/bin/echo flip</agenthub.action>'] });
  const root = makeRegistry({ pay: { "pay.1m.mjs": priced, "README.md": README }, flip: { "flip.1m.mjs": plain, "README.md": README } }, { official: ["pay", "flip"] });
  try {
    const r = await run(root, { skipTests: true });
    const errs = errorsOf(r, "pay");
    assert.ok(errs.some((e) => e.includes('id="go"') && e.includes("immediate с ценой")), errs.join("\n"));
    const rec = r.plugins.find((p) => p.id === "flip");
    assert.deepEqual(rec.errors, []);
    assert.ok(rec.warnings.some((w) => w.includes('id="flip"') && w.includes("ревьюер проверяет")), rec.warnings.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("official: action= in output — declared ones only, with arg matching the pattern", async () => {
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
    assert.ok(errs.some((e) => e.includes("action=nope is not declared")), errs.join("\n"));
    assert.ok(errs.some((e) => e.includes("action=stop: arg is not declared")), errs.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("registry scripts run via a symlinked path (/tmp → /private/tmp) — they work instead of silently exiting 0", async () => {
  const { mkdtempSync, rmSync, symlinkSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const { isMain } = await import("../scripts/lib/is-main.mjs");
  const scripts = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
  const dir = mkdtempSync(join(tmpdir(), "ahp-link-"));
  try {
    const link = join(dir, "scripts");
    symlinkSync(scripts, link, process.platform === "win32" ? "junction" : "dir");
    const node = (args) => spawnSync(process.execPath, args, { encoding: "utf8", env: { PATH: process.env.PATH || "/usr/bin:/bin" } });
    const bad = node([join(link, "check.mjs"), "--bogus"]);
    assert.equal(bad.status, 2, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /--bogus/);
    assert.equal(node([join(link, "keygen.mjs")]).status, 2, "keygen without a directory refuses instead of staying silent");
    assert.equal(isMain(pathToFileURL(join(scripts, "check.mjs")).href, join(link, "check.mjs")), true);
    assert.equal(isMain(pathToFileURL(join(scripts, "check.mjs")).href, join(link, "keygen.mjs")), false);
    assert.equal(isMain(pathToFileURL(join(scripts, "check.mjs")).href, undefined), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--base: plugin files changed but the version is the same — error; version bumped or only test/ changed — no error", async () => {
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");
  const { writePluginFiles } = await import("./helpers.mjs");
  const root = makeRegistry({ a: { "a.1m.mjs": pluginSource(), "README.md": README, "test/a.test.mjs": "// test\n" } });
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  // without the system and global git config (commit signing, hooks etc. from the developer's machine don't interfere).
  // The global one is an empty file, not os.devNull: git for Windows can't open "\\.\nul" as a config.
  const cfgDir = mkdtempSync(join(tmpdir(), "ahp-gitcfg-"));
  const emptyCfg = join(cfgDir, "gitconfig");
  writeFileSync(emptyCfg, "");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyCfg } });
  try {
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "base");
    // only the test — the archive is the same, the version may stay
    writePluginFiles(root, "a", { "test/a.test.mjs": "// another test\n" });
    let r = await run(root, { base: "HEAD", skipTests: true });
    assert.deepEqual(errorsOf(r, "a"), []);
    // README and a new file — the archive differs
    writePluginFiles(root, "a", { "README.md": README + "\nedit\n", "lib/x.mjs": "export const x = 1;\n" });
    r = await run(root, { base: "HEAD", skipTests: true });
    assert.equal(r.ok, false);
    assert.match(errorsOf(r, "a").join("\n"), /files changed since HEAD \(README\.md, lib\/x\.mjs\), but the version is the same \(1\.0\.0\) — bump the version/);
    writeFileSync(join(root, "plugins", "a", "a.1m.mjs"), pluginSource({ version: "1.0.1" }));
    r = await run(root, { base: "HEAD", skipTests: true });
    assert.deepEqual(errorsOf(r, "a"), []);
  } finally {
    cleanup(root);
    rmSync(cfgDir, { recursive: true, force: true });
  }
});

test("push: kind=\"security\" and hub core keys are a warning for the reviewer (the check doesn't fail)", async () => {
  const root = makeRegistry({
    hello: {
      "hello.5m.mjs": pluginSource({ extra: ['// <agenthub.push key="tamper" kind="security">Маркер подмены</agenthub.push>', '// <agenthub.push key="app-restart-stopped">Agent Hub падает</agenthub.push>', '// <agenthub.push key="job-failed" kind="plugin" was="runs">Задача упала</agenthub.push>', '// <agenthub.push key="job-costly" kind="runs">Дорого</agenthub.push>'] }),
      "README.md": README,
      "fixtures/home/.config/hello/state.json": "зелёный\n",
    },
  });
  try {
    const r = await run(root);
    const w = r.plugins[0].warnings;
    assert.ok(w.some((x) => x.includes('key="tamper" kind="security"')), w.join("\n"));
    assert.ok(w.some((x) => x.includes('key="app-restart-stopped"') && x.includes("зарезервирован ядром")), w.join("\n"));
    assert.ok(!w.some((x) => x.includes("job-failed")), "an ordinary rule (kind=\"plugin\" was=…) gets no warning");
    // contract 2: the deprecated contract 1 form works, but the linter asks for kind="plugin" was="…"
    assert.ok(w.some((x) => x.includes('key="job-costly" kind="runs"') && x.includes('kind="plugin" was="runs"')), w.join("\n"));
    assert.deepEqual(errorsOf(r, "hello"), []);
  } finally {
    cleanup(root);
  }
});

test("<agenthub.requires>: a dependency with an https link and a check path passes; http, a mask and a forbidden location are errors", async () => {
  const good = '// <agenthub.requires name="Tool" url="https://example.com/tool" check="~/.tool">программа, чьё состояние показывает плагин</agenthub.requires>';
  const root = makeRegistry({
    ok: { "ok.5m.mjs": pluginSource({ extra: [good] }), "README.md": README },
    http: { "http.5m.mjs": pluginSource({ extra: ['// <agenthub.requires name="T" url="http://example.com" check="~/.t">x</agenthub.requires>'] }), "README.md": README },
    mask: { "mask.5m.mjs": pluginSource({ extra: ['// <agenthub.requires name="T" url="https://example.com" check="~/.t/*">x</agenthub.requires>'] }), "README.md": README },
    secret: { "secret.5m.mjs": pluginSource({ extra: ['// <agenthub.requires name="T" url="https://example.com" check="~/.claude/projects">x</agenthub.requires>'] }), "README.md": README },
  });
  try {
    const r = await run(root, { skipTests: true });
    assert.deepEqual(errorsOf(r, "ok"), []);
    assert.match(errorsOf(r, "http").join("\n"), /url must be https/);
    assert.match(errorsOf(r, "mask").join("\n"), /without wildcards/);
    assert.match(errorsOf(r, "secret").join("\n"), /requires name="T".*~\/\.claude\/projects/);
  } finally {
    cleanup(root);
  }
});

test("contract copy (docs/contract): sections by heading, a heading inside ``` is not a section; \"don't edit\" header", async () => {
  const { pickSections, CONTRACT_DOCS, CONTRACT_DIR } = await import("../scripts/sync-vendor.mjs");
  const md = "# Док\n\nвступление\n\n## Раз\n\nтекст раз\n\n```\n# не заголовок\n```\n\n### Раз.1\n\nвнутри\n\n## Два\n\nтекст два\n\n## Три\n\nтри\n";
  const r = pickSections(md, ["Три", "Раз", "Нет"]);
  assert.deepEqual(r.missing, ["Нет"]);
  assert.equal(r.text, "## Три\n\nтри\n\n## Раз\n\nтекст раз\n\n```\n# не заголовок\n```\n\n### Раз.1\n\nвнутри\n");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const name of ["README.md", ...CONTRACT_DOCS.map((d) => d.out)]) {
    const text = readFileSync(join(CONTRACT_DIR, name), "utf8");
    assert.match(text.split("\n")[0], /^<!-- Copy from agent-hub, contract v\d+\. Don't edit/, name);
  }
});

test("contract 2: a contract 2 feature without <agenthub.contract>2 is a warning; a contract newer than the vendored copy is an error", async () => {
  const { contractCheck } = await import("../scripts/lib/registry.mjs");
  const { CONTRACT_VERSION, parseMetaText } = await import("../scripts/vendor/meta.mjs");
  const meta = (tags) => parseMetaText(tags.join("\n")).meta;
  const icon = '// <agenthub.icon symbol="moon" color="#5E5CE6"></agenthub.icon>';
  assert.match(contractCheck(meta([icon])).warnings.join("\n"), /<agenthub\.icon>.*is not declared/);
  assert.match(contractCheck(meta(['// <agenthub.push key="x" kind="plugin">X</agenthub.push>'])).warnings.join("\n"), /kind="plugin"/);
  assert.match(contractCheck(meta([]), 'console.log("message=Нельзя");').warnings.join("\n"), /message=/);
  // the deprecated kind="runs" is contract 1 (the permission linter warns about it), not "uses contract 2"
  assert.deepEqual(contractCheck(meta(['// <agenthub.push key="x" kind="runs">X</agenthub.push>'])).warnings, []);
  assert.deepEqual(contractCheck(meta([icon, "// <agenthub.contract>2</agenthub.contract>"])), { errors: [], warnings: [] });
  assert.match(contractCheck(meta([`// <agenthub.contract>${CONTRACT_VERSION + 1}</agenthub.contract>`])).errors.join("\n"), /vendored copy knows contract/);
});
