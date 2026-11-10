// Плагин claude-code (agent-hub-plugins/plugins/claude-code/claude-code.30s.mjs) на синтетическом HOME.
// ps и cmux — двойники-скрипты в AGENTHUB_TEST_BIN_DIR: настоящие вкладки и процессы не трогаются.
// Двойник cmux ведёт «экран» вкладки: history.txt (вывод сессии) + prompt.txt (поле ввода); на send команды /model или
// /effort дописывает в историю ответ, как Claude Code (если не лежит файл mute — тогда команда «теряется»).
// Запуск: cd agent-hub-plugins && env -u NODE_OPTIONS node --test plugins/claude-code/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOutput, pluginDir, readPluginMeta, tempHome, testEnv } from "../../../scripts/lib/plugin-test.mjs";

const DIR = pluginDir(import.meta.url);
const PLUGIN = join(DIR, "claude-code.30s.mjs");
const FIX = join(DIR, "fixtures");
const HUB = join(FIX, "hub-sessions.json");
const mod = await import(pathToFileURL(PLUGIN).href);
const POSIX = { skip: process.platform === "win32" ? "двойники ps и cmux — /bin/sh" : false };
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const MARKERS = ["fixture-secret-do-not-print", "fixture-transcript-text-do-not-print"];

const CMUX_DOUBLE = (home) => `#!/bin/sh
H='${home}'
echo "$*" >> "$H/cmux.log"
case "$1" in
  read-screen)
    n=40; prev=""; for a; do [ "$prev" = "--lines" ] && n="$a"; prev="$a"; done
    cat "$H/history.txt" "$H/prompt.txt" | tail -n "$n" ;;
  send)
    for last; do :; done
    [ -f "$H/slow" ] && sleep "$(cat "$H/slow")"
    if [ ! -f "$H/mute" ]; then
      case "$last" in
        /model*) echo "Set model to \\\`\${last#/model }\\\` and saved as your default for new sessions" >> "$H/history.txt" ;;
        /effort*) echo "Set effort level to \${last#/effort } (saved as your default for new sessions): ok" >> "$H/history.txt" ;;
      esac
    fi ;;
esac
`;

// HOME из фикстуры + двойники ps (все три сессии живы и это Claude Code) и cmux
function makeHome({ prompt = "────\n> \n────\n" } = {}) {
  const home = tempHome("ah-cc-");
  cpSync(join(FIX, "home"), home, { recursive: true });
  const ip = join(home, ".claude", "plugins", "installed_plugins.json");
  writeFileSync(ip, readFileSync(ip, "utf8").replace("HOME_PLACEHOLDER", home));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const exe = "/Users/demo/.local/share/claude/versions/2.1.321";
  writeFileSync(join(bin, "ps"), `#!/bin/sh\nfor p in 101 202 303; do echo "  $p Mon Nov 10 08:00:00 2026 ${exe}"; done\n`, { mode: 0o755 });
  writeFileSync(join(bin, "cmux"), CMUX_DOUBLE(home), { mode: 0o755 });
  // двойник codesign: подпись верна, пока нет файла unsigned
  writeFileSync(join(bin, "codesign"), `#!/bin/sh\n[ -f '${join(home, "unsigned")}' ] && exit 1\nexit 0\n`, { mode: 0o755 });
  writeFileSync(join(home, "history.txt"), "старый вывод сессии\n");
  writeFileSync(join(home, "prompt.txt"), prompt);
  return home;
}
const env = (home, extra = {}) => testEnv(home, { AGENTHUB_TEST_BIN_DIR: join(home, "bin"), AGENTHUB_PLUGIN_DATA_PATH: join(home, "data"), ...extra });
const WITH_HUB = { AGENTHUB_CLAUDE_SESSIONS_FILE: HUB };
const AUTO = { ...WITH_HUB, AGENTHUB_PAUSED: "0" };
function run(home, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  const parsed = parseOutput(r.stdout);
  assert.deepEqual(parsed.warnings, []);
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m), `в выводе маркер ${m}`);
  return { text: r.stdout, parsed };
}
function act(home, args, extra = {}) {
  const r = spawnSync(process.execPath, [PLUGIN, "--action", ...args], { env: env(home, extra), encoding: "utf8", timeout: 10_000 });
  for (const m of MARKERS) assert.ok(!r.stdout.includes(m));
  const lines = r.stdout.trim().split("\n");
  const message = lines.find((l) => l.startsWith("message="))?.slice(8) ?? null;
  return { out: lines.at(-1), code: r.status, ...(message ? { message } : {}) };
}
const settings = (home) => JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
const writeSettingsFile = (home, obj) => writeFileSync(join(home, ".claude", "settings.json"), `${JSON.stringify(obj, null, 2)}\n`);
const cmuxLog = (home) => (existsSync(join(home, "cmux.log")) ? readFileSync(join(home, "cmux.log"), "utf8").trim().split("\n") : []);
const sent = (home) => cmuxLog(home).filter((l) => l.startsWith("send ")).map((l) => l.replace(/^send --workspace \S+ --surface (\S+) -- /, "$1 "));
const state = (home) => JSON.parse(readFileSync(join(home, "data", "state.json"), "utf8"));
const setStatus = (home, pid, from, to) => {
  const f = join(home, ".claude", "sessions", `${pid}.json`);
  writeFileSync(f, readFileSync(f, "utf8").replace(`"${from}"`, `"${to}"`));
};
function hubWith(home, patch) {
  const j = JSON.parse(readFileSync(HUB, "utf8"));
  for (const s of j.sessions) Object.assign(s, patch[s.sessionId] || {});
  const p = join(home, "hub.json");
  writeFileSync(p, JSON.stringify(j));
  return { AGENTHUB_CLAUDE_SESSIONS_FILE: p };
}

test("метаданные: контракт 2, значок, права с «зачем» без кириллицы в «что», действия и их уровни", () => {
  const pm = readPluginMeta(PLUGIN);
  assert.deepEqual(pm.warnings, []);
  assert.equal(pm.id, "claude-code");
  assert.equal(pm.meta.contract, 2);
  assert.deepEqual(
    pm.meta.actions.map((a) => [a.id, a.level, a.arg?.name ?? null]),
    [
      ["set-model", "immediate", "model"],
      ["set-effort", "immediate", "level"],
      ["effort-max", "confirm-cost", null],
      ["set-style", "immediate", "style"],
      ["ultracode-on", "immediate", null],
      ["ultracode-off", "immediate", null],
      ["apply", "confirm-cost", "session"],
      ["apply-all", "confirm-cost", null],
      ["apply-continue", "confirm-cost", null],
      ["apply-stop", "immediate", null],
      ["apply-done", "immediate", null],
    ],
  );
  const src = readFileSync(PLUGIN, "utf8");
  for (const w of src.match(/^\/\/ <agenthub\.(?:exec|fsRead|fsWrite|watch)[^>]*>[^—]*/gm)) assert.doesNotMatch(w, /[А-Яа-яЁё]/, w);
  // транскрипты — запретное место: плагин их не упоминает и не читает
  assert.doesNotMatch(src, /\.claude[\\/]+projects/);
});

test("Claude Code не установлен — кадр «не установлен», status=unknown", () => {
  const home = tempHome("ah-cc-");
  try {
    const { parsed } = run(home);
    assert.equal(parsed.status, "unknown");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("базовые: modelSettings важнее effortLevel у Opus 5.5; legacy effortLevel у старых; модель по умолчанию = Opus 5.5", () => {
  assert.deepEqual(mod.readBase({ effortLevel: "high", model: "claude-opus-5-5" }), {
    model: "claude-opus-5-5",
    modelArg: "claude-opus-5-5",
    effort: "medium",
    effortFrom: "default",
    maxActive: false,
    envOverride: false,
    envAuto: false,
    maxPendingClear: false,
    outputStyle: "Default",
    ultracode: false,
  });
  assert.equal(mod.readBase({ effortLevel: "high", model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "low" } } }).effort, "low");
  assert.equal(mod.readBase({ effortLevel: "xhigh", model: "claude-fable-5-1" }).effort, "xhigh");
  assert.equal(mod.readBase({ effortLevel: "high", model: "claude-sonnet-4-6" }).effort, "high", "3.x/4.x — legacy effortLevel действует");
  // модель по умолчанию: effort — запись Opus 5.5, чужие записи и legacy effortLevel не в счёт
  assert.equal(mod.readBase({ modelSettings: { "claude-sonnet-5-5": { effortLevel: "xhigh" } } }).effort, "medium");
  assert.equal(mod.readBase({ effortLevel: "low", modelSettings: { "claude-opus-5-5": { effortLevel: "high" } } }).effort, "high");
  assert.equal(mod.readBase({ model: "opus[1m]" }).model, "claude-opus-5-5");
  assert.equal(mod.readBase({ model: "Opus[1m]" }).modelArg, "opus[1m]", "в /model — как записано");
  assert.equal(mod.readBase({ model: "opusplan" }).model, null);
  const mx = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "max" } });
  assert.deepEqual([mx.effort, mx.maxActive, mx.envOverride], ["max", true, true]);
  // env с уровнем ниже max тоже перебивает всё
  const eh = mod.readBase({ model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "medium" } }, env: { CLAUDE_CODE_EFFORT_LEVEL: "High" } });
  assert.deepEqual([eh.effort, eh.maxActive, eh.envOverride], ["high", false, true]);
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "" } }).maxPendingClear, true);
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "" } }).envOverride, false);
  // как Claude Code: ultracode и мусор — не перебивают; auto — у каждой модели свой по умолчанию; число — как есть
  assert.equal(mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "ultracode" } }).envOverride, false);
  assert.equal(mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: " high" } }).envOverride, false, "пробелы не срезаются");
  const au = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "AUTO" } });
  assert.deepEqual([au.effort, au.envOverride, au.envAuto], ["auto", true, true]);
  assert.deepEqual(mod.sessionNow({ sessionId: S1 }, au, new Map([[S1, { model: "claude-fable-5-1", effort: "low", at: 0 }]]), { applied: {} }).effort, "high");
  assert.equal(mod.readBase({ env: { CLAUDE_CODE_EFFORT_LEVEL: "32000" } }).effort, "32000");
  assert.equal(mod.readBase({ outputStyle: "default", ultracode: true }).outputStyle, "Default");
});

test("белый список: опасные ключи (env, hooks, permissions, apiKeyHelper, __proto__) не пишутся никогда", () => {
  for (const path of [["env", "ANTHROPIC_BASE_URL"], ["hooks"], ["permissions", "allow"], ["apiKeyHelper"], ["env"], ["modelSettings", "__proto__", "effortLevel"], ["statusLine"], ["modelSettings", "claude-opus-5-5", "maxEffortLevel"]]) {
    assert.throws(() => mod.applyOps({}, [{ path, value: "x" }]), /not-allowed/, path.join("."));
  }
  const o = mod.applyOps({ a: 1, env: { KEEP: "1" } }, [
    { path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "max" },
    { path: ["modelSettings", "claude-opus-5-5", "effortLevel"], value: "high" },
  ]);
  assert.deepEqual(o, { a: 1, env: { KEEP: "1", CLAUDE_CODE_EFFORT_LEVEL: "max" }, modelSettings: { "claude-opus-5-5": { effortLevel: "high" } } });
});

test("effort без выбранной модели — в запись Opus 5.5; env с уровнем снимается так же, как max", () => {
  assert.deepEqual(mod.opsFor("effort", "high", {}), [
    { path: ["effortLevel"], value: "high" },
    { path: ["modelSettings", "claude-opus-5-5", "effortLevel"], value: "high" },
  ]);
  assert.deepEqual(mod.opsFor("effort", "low", { env: { CLAUDE_CODE_EFFORT_LEVEL: "high" }, model: "claude-opus-5-5" })[0], { path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "" });
});

test("запись: остальные ключи и их порядок сохраняются, копия до правки, права файла, хранится 20 копий", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    const before = settings(home);
    chmodSync(p, 0o640);
    const r = mod.writeSettings(home, (s) => mod.opsFor("effort", "high", s), { now: Date.UTC(2026, 10, 10) });
    assert.equal(r.ok, true);
    const after = settings(home);
    assert.deepEqual(Object.keys(after), Object.keys(before));
    assert.deepEqual(after.permissions, before.permissions);
    assert.deepEqual(after.env, before.env);
    assert.equal(after.effortLevel, "high");
    assert.equal(after.modelSettings["claude-opus-5-5"].effortLevel, "high");
    assert.equal(statSync(p).mode & 0o777, 0o640);
    const backups = readdirSync(join(home, ".claude", "backups"));
    assert.deepEqual(backups, ["settings.json.2026-11-10T00-00-00-000Z-agenthub"]);
    assert.deepEqual(JSON.parse(readFileSync(join(home, ".claude", "backups", backups[0]), "utf8")), before);
    assert.equal(statSync(join(home, ".claude", "backups", backups[0])).mode & 0o777, 0o600, "в копии — ваш env: только вам");
    for (let i = 0; i < 25; i++) mod.writeSettings(home, (s) => mod.opsFor("ultracode", i % 2 === 0, s), { now: Date.UTC(2026, 10, 10, 1, i) });
    assert.equal(readdirSync(join(home, ".claude", "backups")).filter((n) => n.endsWith("-agenthub")).length, mod.KEEP_BACKUPS);
    writeFileSync(join(home, ".claude", "backups", "settings.json.manual"), "{}");
    mod.pruneBackups(home);
    assert.ok(existsSync(join(home, ".claude", "backups", "settings.json.manual")), "чужой файл в backups не удаляется");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("запись: settings.json — ссылка (dotfiles): меняется файл по ссылке, ссылка остаётся", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    const dot = join(home, "dotfiles-settings.json");
    cpSync(p, dot);
    rmSync(p);
    symlinkSync(dot, p);
    assert.deepEqual(act(home, ["set-effort", "high"]), { out: "ok", code: 0 });
    assert.ok(lstatSync(p).isSymbolicLink());
    assert.equal(JSON.parse(readFileSync(dot, "utf8")).effortLevel, "high");
    // ссылка в никуда — отказ, ссылка не заменяется файлом
    rmSync(p);
    symlinkSync(join(home, "nowhere", "settings.json"), p);
    assert.equal(act(home, ["set-effort", "low"]).out, "reason=settings-link-broken");
    assert.ok(lstatSync(p).isSymbolicLink());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("запись: файл поменяли между чтением и записью — перечитать и повторить; меняют всё время — settings-busy; не JSON — не трогать; пустой — как {}", POSIX, () => {
  const home = makeHome();
  try {
    const p = join(home, ".claude", "settings.json");
    let n = 0;
    const r = mod.writeSettings(home, (s) => mod.opsFor("style", "Learning", s), {
      beforeRename: () => {
        if (n++ === 0) writeSettingsFile(home, { ...settings(home), theme: "light" });
      },
    });
    assert.equal(r.ok, true);
    assert.equal(settings(home).theme, "light", "правка, сделанная одновременно, не потеряна");
    assert.equal(settings(home).outputStyle, "Learning");
    const busy = mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s), { beforeRename: (i) => writeSettingsFile(home, { ...settings(home), theme: `t${i}` }) });
    assert.deepEqual(busy, { ok: false, reason: "settings-busy" });
    assert.equal(settings(home).outputStyle, "Learning");
    writeFileSync(p, "{ not json");
    assert.deepEqual(mod.writeSettings(home, (s) => mod.opsFor("style", "Concise", s)), { ok: false, reason: "settings-broken" });
    assert.equal(readFileSync(p, "utf8"), "{ not json");
    assert.equal(run(home).parsed.status, "error");
    writeFileSync(p, "  \n");
    assert.equal(run(home).parsed.status, "ok", "пустой файл — пустые настройки, а не «не JSON»");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("действия настроек: модель (effort переезжает), effort, стиль (только из списка), ultracode", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["set-model", "claude-sonnet-5-5"]), { out: "ok", code: 0 });
    assert.equal(settings(home).model, "claude-sonnet-5-5");
    assert.equal(settings(home).modelSettings["claude-sonnet-5-5"].effortLevel, "medium", "effort остался тем же на новой модели");
    assert.deepEqual(act(home, ["set-effort", "xhigh"]), { out: "ok", code: 0 });
    assert.equal(settings(home).modelSettings["claude-sonnet-5-5"].effortLevel, "xhigh");
    assert.equal(settings(home).effortLevel, "xhigh");
    assert.deepEqual(act(home, ["set-style", "demo-plugin:Diagrams"]), { out: "ok", code: 0 });
    assert.equal(settings(home).outputStyle, "demo-plugin:Diagrams");
    assert.deepEqual(act(home, ["set-style", "Default"]), { out: "ok", code: 0 });
    assert.equal(settings(home).outputStyle, undefined);
    assert.deepEqual(act(home, ["set-style", "Nope"]), { out: "reason=unknown-style", code: 3, message: "Такого стиля ответов нет среди установленных." });
    assert.deepEqual(act(home, ["ultracode-on"]), { out: "ok", code: 0 });
    assert.equal(settings(home).ultracode, true);
    assert.deepEqual(act(home, ["set-model", "claude-mythos-5"]), { out: "reason=bad-arg", code: 3, message: "Такого значения нет." });
    assert.equal(act(home, ["set-effort", "max"]).out, "reason=bad-arg", "max — только через effort-max с подтверждением");
    assert.equal(act(home, ["bogus"]).out, "reason=unknown-action");
    assert.deepEqual(settings(home).env, { FIXTURE_SECRET_MARKER: "fixture-secret-do-not-print" }, "чужой env не тронут");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("max: env.CLAUDE_CODE_EFFORT_LEVEL=max; уход — пустая строка, ключ удаляется, когда не осталось сессий старше ухода", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["effort-max"]), { out: "ok", code: 0 });
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "max");
    const { text } = run(home, WITH_HUB);
    assert.match(text, /^Базовые: Opus 5\.5 · max/m);
    assert.match(text, /^--max \| sfimage=exclamationmark\.triangle\.fill/m);
    assert.deepEqual(act(home, ["set-effort", "high"]), { out: "ok", code: 0 });
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "", "пусто = «не задано», не auto/unset");
    assert.equal(settings(home).modelSettings["claude-opus-5-5"].effortLevel, "high");
    assert.ok(state(home).maxClearedAt);
    // сессии фикстуры начаты раньше ухода с max — ключ остаётся
    run(home, WITH_HUB);
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "");
    // ps не ответил — неизвестно, кто жив: ключ не трогается
    writeFileSync(join(home, "bin", "ps"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
    run(home, WITH_HUB);
    assert.equal(settings(home).env.CLAUDE_CODE_EFFORT_LEVEL, "");
    // старых сессий не осталось — ключ удаляется, остальной env на месте
    rmSync(join(home, ".claude", "sessions"), { recursive: true });
    run(home);
    assert.deepEqual(settings(home).env, { FIXTURE_SECRET_MARKER: "fixture-secret-do-not-print" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("открытые сессии: модель и effort из файла хаба, отличия оранжевым, «Привести» у свободной, заметки у занятых", POSIX, () => {
  const home = makeHome();
  try {
    const { text, parsed } = run(home, WITH_HUB);
    assert.match(text, /^2 вкладки не как базовые$/m);
    assert.match(text, /^Проставить всем \| action=apply-all$/m);
    assert.match(text, /^Открытые сессии · 3$/m);
    assert.match(text, /^alpha \| strip=true\n--простаивает \| sfimage=circle\n--Opus 5\.5\n--high \| color=#FFB454\n--Привести \| action=apply arg=11111111-1111-4111-8111-111111111111$/m);
    assert.match(text, /^beta \| strip=true\n--работает \| sfimage=circle\.fill color=#64A8FF\n--Sonnet 5\.5 \| color=#FFB454\n--medium\n--после хода$/m);
    assert.match(text, /^gamma \| strip=true\n--ждёт ответа[^\n]*\n--Opus 5\.5\n--medium\n--как базовые$/m);
    assert.equal(parsed.status, "ok");
    // без файла хаба модель и effort неизвестны — не «как базовые», а «нет данных»
    const bare = run(home).text;
    assert.match(bare, /^вкладки: нет данных$/m);
    assert.match(bare, /хаб новее/);
    const en = run(home, { ...WITH_HUB, AGENTHUB_LANG: "en" }).text;
    assert.match(en, /^2 tabs differ from the base$/m);
    assert.match(en, /^--after the turn$/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Привести: в пустое поле ввода набирается только /effort (модель уже та), ответ сессии проверен", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["apply", S1], WITH_HUB), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["surface-a /effort medium"]);
    assert.ok(cmuxLog(home).includes("send-key --workspace workspace-1 --surface surface-a enter"));
    assert.equal(state(home).applied[S1].effort, "medium");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Привести: занятая и неподтверждённая сессия — отказ без набора; текст в поле ввода — не трогать", POSIX, () => {
  const home = makeHome();
  try {
    // beta работает: «Привести» с устаревшей страницы — отказ, а не набор в идущий ход
    assert.deepEqual(act(home, ["apply", S2], WITH_HUB), { out: "reason=session-busy", code: 3, message: "Сессия сейчас занята — наберу, когда освободится, через «Проставить всем»." });
    // хаб не подтвердил подпись alpha
    assert.equal(act(home, ["apply", S1], hubWith(home, { [S1]: { verified: false } })).out, "reason=unverified");
    assert.match(run(home, hubWith(home, { [S1]: { verified: false } })).text, /^--подпись не подтверждена$/m);
    // хаба нет (или он сессию не знает) — плагин проверяет подпись сам: не подписано — не набирает
    writeFileSync(join(home, "unsigned"), "");
    assert.equal(act(home, ["apply", S1], hubWith(home, { [S1]: { verified: undefined } })).out, "reason=unverified");
    rmSync(join(home, "unsigned"));
    for (const prompt of ["> недописанный вопрос\n", "❯ |\n", "❯ │\n", "❯  │\n"]) {
      writeFileSync(join(home, "prompt.txt"), prompt);
      assert.equal(act(home, ["apply", S1], WITH_HUB).out, "reason=input-text", JSON.stringify(prompt));
    }
    assert.deepEqual(sent(home), []);
    assert.equal(act(home, ["apply", "99999999-9999-4999-8999-999999999999"]).out, "reason=no-session");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Привести: подтверждение ищется только в новом выводе — старое на экране не в счёт, уехавшее за край не мешает", POSIX, () => {
  const home = makeHome();
  try {
    // команда «потерялась»: на экране только старый такой же ответ
    writeFileSync(join(home, "history.txt"), "Set effort level to medium (saved as your default for new sessions): ok\nSet model to claude-opus-5-5\n/effort high\nSet effort level to high\n");
    writeFileSync(join(home, "mute"), "");
    assert.equal(act(home, ["apply", S1], WITH_HUB).out, "reason=not-confirmed");
    assert.equal(act(home, ["apply", S1], hubWith(home, { [S1]: { model: "claude-sonnet-5-5", effort: "medium" } })).out, "reason=not-confirmed", "/model тоже");
    assert.equal(existsSync(join(home, "data", "state.json")) ? state(home).applied[S1] : undefined, undefined);
    rmSync(join(home, "mute"));
    // старый такой же ответ уезжает за край 40 строк — новая команда всё равно подтверждена
    const filler = Array.from({ length: 36 }, (_, i) => `вывод ${i}`).join("\n");
    writeFileSync(join(home, "history.txt"), `> /effort medium\nSet effort level to medium (saved): ok\n${filler}\n> /effort high\nSet effort level to high (saved): ok\n`);
    assert.deepEqual(act(home, ["apply", S1], WITH_HUB), { out: "ok", code: 0 });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Привести: модель набирается так, как записана в настройках (псевдоним opus[1m] не превращается в id)", POSIX, () => {
  const home = makeHome();
  try {
    writeSettingsFile(home, { ...settings(home), model: "opus[1m]" });
    const hub = hubWith(home, { [S1]: { model: "claude-sonnet-5-5", effort: "medium" } });
    assert.deepEqual(act(home, ["apply", S1], hub), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["surface-a /model opus[1m]"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Проставить всем: свободная — сразу, занятая — после хода (хаб не на паузе), итог и «Убрать итог»", POSIX, () => {
  const home = makeHome();
  try {
    assert.deepEqual(act(home, ["apply-all"], AUTO), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["surface-a /effort medium"]);
    assert.deepEqual(state(home).job.items.map((i) => [i.label, i.phase]), [["alpha", "done"], ["beta", "waitTurn"]]);
    let { text, parsed } = run(home, AUTO);
    assert.equal(parsed.status, "wait");
    assert.match(text, /^Проставляю… 1 из 2/m);
    assert.match(text, /^--beta — ждёт конца хода/m);
    assert.match(text, /^Остановить \| action=apply-stop$/m);
    assert.match(text, /^beta \| strip=true\n(?:--[^\n]*\n){3}--в очереди$/m);
    assert.equal(act(home, ["apply-all"], AUTO).out, "reason=job-running");
    setStatus(home, 202, "busy", "idle");
    ({ text } = run(home, AUTO));
    assert.deepEqual(sent(home), ["surface-a /effort medium", "surface-b /model claude-opus-5-5"]);
    assert.match(text, /^Готово в 2 из 2 вкладок/m);
    assert.match(text, /^--beta — после хода/m);
    assert.doesNotMatch(text, /Повторить для/);
    assert.deepEqual(act(home, ["apply-done"]), { out: "ok", code: 0 });
    assert.equal(state(home).job, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Проставить всем: хаб не сообщает «не на паузе» — отложенное ждёт «Продолжить»; на паузе — тоже", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], WITH_HUB);
    setStatus(home, 202, "busy", "idle");
    for (const extra of [WITH_HUB, { ...WITH_HUB, AGENTHUB_PAUSED: "1" }]) {
      const { text } = run(home, extra);
      assert.deepEqual(sent(home), ["surface-a /effort medium"], "фоновый запуск ничего не набрал");
      assert.match(text, /^--beta — освободилась — нажмите «Продолжить»/m);
      assert.match(text, /^Продолжить \| action=apply-continue$/m);
    }
    assert.deepEqual(act(home, ["apply-continue"], WITH_HUB), { out: "ok", code: 0 });
    assert.deepEqual(sent(home), ["surface-a /effort medium", "surface-b /model claude-opus-5-5"]);
    assert.ok(state(home).job.finishedAt);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Проставить всем: «Остановить» снимает отложенные; ps не ответил — очередь не теряется", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    const ps = readFileSync(join(home, "bin", "ps"), "utf8");
    writeFileSync(join(home, "bin", "ps"), "#!/bin/sh\nexit 2\n", { mode: 0o755 });
    const { text } = run(home, AUTO);
    assert.match(text, /не удалось проверить/i);
    assert.deepEqual(state(home).job.items.map((i) => i.phase), ["done", "waitTurn"], "beta не «закрылась» из-за сбоя ps");
    writeFileSync(join(home, "bin", "ps"), ps, { mode: 0o755 });
    assert.deepEqual(act(home, ["apply-stop"]), { out: "ok", code: 0 });
    setStatus(home, 202, "busy", "idle");
    run(home, AUTO);
    assert.deepEqual(sent(home), ["surface-a /effort medium"]);
    assert.deepEqual(state(home).job.items.map((i) => [i.phase, i.reason]), [["done", null], ["skipped", "stopped"]]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("замок состояния: занят — обычный запуск очередь не трогает, действие отвечает plugin-busy; «набираю» от убитого запуска второй раз не набирается", POSIX, () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    setStatus(home, 202, "busy", "idle");
    mkdirSync(join(home, "data"), { recursive: true });
    // замок живого процесса (этот тест) — занят
    writeFileSync(join(home, "data", "state.lock"), String(process.pid));
    run(home, AUTO);
    assert.deepEqual(sent(home), ["surface-a /effort medium"], "под чужим замком ничего не набрано");
    assert.equal(act(home, ["apply-stop"]).out, "reason=plugin-busy");
    rmSync(join(home, "data", "state.lock"));
    // запуск убит ядром посреди набора: пункт остался «typing»
    const st = state(home);
    st.job.items[1].phase = "typing";
    writeFileSync(join(home, "data", "state.json"), JSON.stringify(st));
    run(home, AUTO);
    assert.deepEqual(sent(home), ["surface-a /effort medium"], "второй раз не набрано");
    assert.deepEqual(state(home).job.items[1].phase, "failed");
    assert.equal(state(home).job.items[1].reason, "interrupted");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// Запуск плагина в фоне (чтобы во время него сделать что-то ещё); → Promise<{code, signal}>
function runAsync(home, extra = {}) {
  const c = spawn(process.execPath, [PLUGIN], { env: env(home, extra), stdio: "ignore" });
  return { child: c, done: new Promise((res) => c.on("exit", (code, signal) => res({ code, signal }))) };
}
const waitFor = async (cond, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("не дождался");
    await new Promise((r) => setTimeout(r, 50));
  }
};

test("убитый посреди набора запуск: замок мёртвого процесса снимается, «набираю» второй раз не набирается", POSIX, async () => {
  const home = makeHome();
  try {
    act(home, ["apply-all"], AUTO);
    setStatus(home, 202, "busy", "idle");
    writeFileSync(join(home, "slow"), "3");
    const r = runAsync(home, AUTO);
    await waitFor(() => existsSync(join(home, "data", "state.json")) && state(home).job.items[1].phase === "typing");
    r.child.kill("SIGKILL");
    await r.done;
    assert.ok(existsSync(join(home, "data", "state.lock")), "замок остался от убитого запуска");
    rmSync(join(home, "slow"));
    run(home, AUTO);
    assert.deepEqual(sent(home).filter((x) => x.startsWith("surface-b")).length, 1, "в beta набрано один раз");
    assert.deepEqual([state(home).job.items[1].phase, state(home).job.items[1].reason], ["failed", "interrupted"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("«Остановить» во время запуска не затирается: запуск сохраняет своё, остановка — своё", POSIX, async () => {
  const home = makeHome();
  try {
    const hub = hubWith(home, { "33333333-3333-4333-8333-333333333333": { model: "claude-sonnet-5-5" } });
    act(home, ["apply-all"], { ...hub, AGENTHUB_PAUSED: "0" });
    assert.deepEqual(state(home).job.items.map((i) => i.phase), ["done", "waitTurn", "waitAnswer"]);
    setStatus(home, 202, "busy", "idle");
    writeFileSync(join(home, "slow"), "1");
    const r = runAsync(home, { ...hub, AGENTHUB_PAUSED: "0" });
    await waitFor(() => existsSync(join(home, "data", "state.json")) && state(home).job.items[1].phase === "typing");
    assert.deepEqual(act(home, ["apply-stop"]), { out: "ok", code: 0 });
    await r.done;
    const items = state(home).job.items.map((i) => [i.label, i.phase, i.reason]);
    assert.deepEqual(items, [["alpha", "done", null], ["beta", "done", null], ["gamma", "skipped", "stopped"]]);
    assert.ok(state(home).job.finishedAt);
    setStatus(home, 303, "waiting", "idle");
    run(home, { ...hub, AGENTHUB_PAUSED: "0" });
    assert.ok(!sent(home).some((x) => x.startsWith("surface-c")), "в gamma после «Остановить» ничего не набрано");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("сессия жива, только если тот же процесс (время старта в UTC) и это Claude Code; без cmux — только просмотр", POSIX, () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, "bin", "ps"), `#!/bin/sh\necho "  101 Mon Nov 10 09:00:00 2026 /Users/demo/.local/share/claude/versions/2.1.321"\necho "  202 Mon Nov 10 08:00:00 2026 /usr/bin/python3"\necho "  303 Mon Nov 10 08:00:00 2026 /Users/demo/.local/bin/claude"\n`, { mode: 0o755 });
    const { text } = run(home, WITH_HUB);
    assert.match(text, /^Открытые сессии · 1$/m, "101 — другой процесс с тем же pid, 202 — не Claude Code");
    rmSync(join(home, "bin", "cmux"));
    const r = run(home, WITH_HUB);
    assert.match(r.text, /Без cmux только просмотр/);
    assert.doesNotMatch(r.text, /action=apply/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("стили: встроенные, свои, включённых плагинов; путь плагина вне кэша и выход через .. — не читаются", POSIX, () => {
  const home = makeHome();
  try {
    const s = settings(home);
    assert.deepEqual(mod.listStyles(home, s).map((x) => `${x.source}:${x.name}`), ["builtin:Default", "builtin:Proactive", "builtin:Concise", "builtin:Explanatory", "builtin:Learning", "user:Terse", "plugin:demo-plugin:Diagrams"]);
    const ip = join(home, ".claude", "plugins", "installed_plugins.json");
    writeFileSync(ip, JSON.stringify({ version: 2, plugins: { "demo-plugin@demo-market": [{ installPath: join(home, ".claude", "output-styles") }] } }));
    assert.ok(!mod.listStyles(home, s).some((x) => x.source === "plugin"));
    const pj = join(home, ".claude", "plugins", "cache", "demo-market", "demo-plugin", "1.0.0", ".claude-plugin", "plugin.json");
    writeFileSync(ip, readFileSync(join(FIX, "home", ".claude", "plugins", "installed_plugins.json"), "utf8").replace("HOME_PLACEHOLDER", home));
    writeFileSync(pj, JSON.stringify({ name: "demo-plugin", outputStyles: "../../../../../output-styles" }));
    assert.ok(!mod.listStyles(home, s).some((x) => x.source === "plugin"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("поле ввода: пустое приглашение — можно; любой текст (даже «|» или «│») или нет приглашения — нельзя", () => {
  assert.equal(mod.inputEmpty("старый вывод\n────\n> \n────\n  ? for shortcuts"), true);
  assert.equal(mod.inputEmpty("│ >      │"), true);
  assert.equal(mod.inputEmpty(">"), true);
  assert.equal(mod.inputEmpty("> привет"), false);
  assert.equal(mod.inputEmpty("❯ ls"), false);
  assert.equal(mod.inputEmpty("❯ |"), false);
  assert.equal(mod.inputEmpty("❯ │"), false);
  assert.equal(mod.inputEmpty("❯  │"), false);
  assert.equal(mod.inputEmpty("│ > │"), true);
  assert.equal(mod.inputEmpty("нет приглашения"), false);
});

test("команды во вкладку — только /model и /effort базовых значений; при env (max или уровень) — только /model", () => {
  const base = mod.readBase({ model: "claude-opus-5-5", modelSettings: { "claude-opus-5-5": { effortLevel: "medium" } } });
  assert.deepEqual(mod.commandsFor({ model: "claude-sonnet-5-5", effort: "high" }, base), ["/model claude-opus-5-5", "/effort medium"]);
  const mx = mod.readBase({ model: "claude-opus-5-5", env: { CLAUDE_CODE_EFFORT_LEVEL: "max" } });
  assert.deepEqual(mod.commandsFor({ model: "claude-sonnet-5-5", effort: "max" }, mx), ["/model claude-opus-5-5"]);
});

test("у каждого кода отказа — текст на ru и en, до 120 знаков, без перевода строки и «|»", () => {
  const src = readFileSync(PLUGIN, "utf8");
  const codes = new Set([...src.matchAll(/reason: "([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const c of codes) {
    if (["gone", "stopped", "interrupted"].includes(c)) continue; // причины пункта очереди, не отказ действия
    for (const lang of ["ru", "en"]) {
      const m = mod.refusalMessage(c, lang);
      assert.ok(m, `${c} ${lang}`);
      assert.ok([...m].length <= 120 && !/[\n|]/.test(m), `${c} ${lang}`);
    }
  }
});

test("склонения: вкладка / вкладки / вкладок", () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map((n) => mod.tabsN(n, "ru")), ["1 вкладка", "2 вкладки", "5 вкладок", "11 вкладок", "21 вкладка", "22 вкладки", "25 вкладок"]);
  assert.equal(mod.tabsN(1, "en"), "1 tab");
});
