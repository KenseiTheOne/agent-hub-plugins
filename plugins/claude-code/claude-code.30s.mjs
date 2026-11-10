#!/usr/bin/env node
// <agenthub.title>Claude Code</agenthub.title>
// <agenthub.version>1.0.0</agenthub.version>
// <agenthub.contract>2</agenthub.contract>
// <agenthub.icon symbol="text.alignleft" color="#D97757"></agenthub.icon>
// <agenthub.desc>Настройки Claude Code для новых сессий (модель, effort, стиль ответов, ultracode) и открытые вкладки: какие не как базовые, и кнопка привести их</agenthub.desc>
// <agenthub.desc lang="en">Claude Code settings for new sessions (model, effort, output style, ultracode) and open tabs: which differ from the base, and a button to bring them in line</agenthub.desc>
// <agenthub.status value="ok" label="Настройки Claude">Базовые настройки прочитаны</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Claude settings">Base settings are read</agenthub.status>
// <agenthub.status value="wait" label="Проставляю во вкладки">Идёт «Проставить базовые»: часть вкладок ждёт конца хода или вашего ответа</agenthub.status>
// <agenthub.status value="wait" lang="en" label="Applying to tabs">Apply to tabs is running: some tabs wait for the turn to end or for your answer</agenthub.status>
// <agenthub.status value="error" label="Сбой плагина или настроек">~/.claude/settings.json — не JSON (плагин его не трогает) или сбой самого плагина</agenthub.status>
// <agenthub.status value="error" lang="en" label="Plugin or settings failure">~/.claude/settings.json isn't valid JSON (the plugin leaves it alone) or the plugin itself failed</agenthub.status>
// <agenthub.status value="unknown" label="Claude Code не найден">Claude Code не установлен</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Claude Code not found">Claude Code isn't installed</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.requires name="Claude Code" url="https://code.claude.com/docs" check="~/.claude/settings.json">агент, чьи настройки показывает и меняет плагин</agenthub.requires>
// <agenthub.requires lang="en" name="Claude Code">the agent whose settings this plugin shows and changes</agenthub.requires>
// <agenthub.fsRead>~/.claude/settings.json — базовые настройки новых сессий: model, effortLevel, modelSettings, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL (остальные ключи не показываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/settings.json — base settings for new sessions: model, effortLevel, modelSettings, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL (other keys aren't shown)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/output-styles — ваши стили ответов для списка «Стиль ответов» (только имя из заголовка файла)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/output-styles — your output styles for the Output style list (only the name from the file header)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache — стили ответов включённых плагинов Claude Code (имя плагина и имя стиля)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache — output styles of enabled Claude Code plugins (plugin name and style name)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/sessions/*.json — открытые сессии: pid, папка, имя, состояние (простаивает, работает, ждёт ответа), когда начата (ключи сессий не открываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/sessions/*.json — open sessions: pid, folder, name, state (idle, working, waiting for you), when started (session keys are never opened)</agenthub.fsRead>
// <agenthub.fsRead>~/.cmuxterm/claude-hook-sessions.json — в какой вкладке cmux идёт сессия (только идентификаторы)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.cmuxterm/claude-hook-sessions.json — which cmux tab a session runs in (identifiers only)</agenthub.fsRead>
// <agenthub.fsRead>~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude — установлен ли Claude Code</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude — whether Claude Code is installed</agenthub.fsRead>
// <agenthub.fsRead>$AGENTHUB_CLAUDE_SESSIONS_FILE — модель и effort открытых сессий от хаба (только метаданные, без текста переписки)</agenthub.fsRead>
// <agenthub.fsRead lang="en">$AGENTHUB_CLAUDE_SESSIONS_FILE — model and effort of open sessions from the hub (metadata only, no conversation text)</agenthub.fsRead>
// <agenthub.fsWrite>~/.claude/settings.json — только ключи model, effortLevel, modelSettings.*.effortLevel, outputStyle, ultracode и env.CLAUDE_CODE_EFFORT_LEVEL, по вашей кнопке; остальное не меняется</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/settings.json — only the keys model, effortLevel, modelSettings.*.effortLevel, outputStyle, ultracode and env.CLAUDE_CODE_EFFORT_LEVEL, on your click; nothing else changes</agenthub.fsWrite>
// <agenthub.fsWrite>~/.claude/backups/settings.json.*-agenthub — копия настроек до каждой правки (хранятся последние 20)</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/backups/settings.json.*-agenthub — a copy of the settings before each change (the last 20 are kept)</agenthub.fsWrite>
// <agenthub.exec>/bin/ps -o pid=,lstart=,comm= -p … — жива ли сессия и это ли Claude Code (без аргументов и окружения процесса)</agenthub.exec>
// <agenthub.exec lang="en">/bin/ps -o pid=,lstart=,comm= -p … — whether a session is alive and is Claude Code (no process arguments or environment)</agenthub.exec>
// <agenthub.exec>/usr/bin/codesign --verify --strict -R … — перед набором во вкладку: подписан ли процесс сессии Anthropic (Claude Code, Team ID Q6L2SF6YDW)</agenthub.exec>
// <agenthub.exec lang="en">/usr/bin/codesign --verify --strict -R … — before typing into a tab: whether the session's process is signed by Anthropic (Claude Code, Team ID Q6L2SF6YDW)</agenthub.exec>
// <agenthub.exec>/Applications/cmux.app/Contents/Resources/bin/cmux read-screen|send|send-key — набрать во вкладку сессии только /model и /effort; read-screen читает последние 40 строк вкладки, чтобы убедиться, что поле ввода пустое и сессия подтвердила команду (текст не сохраняется и не показывается)</agenthub.exec>
// <agenthub.exec lang="en">/Applications/cmux.app/Contents/Resources/bin/cmux read-screen|send|send-key — type only /model and /effort into a session's tab; read-screen reads the tab's last 40 lines to check the input line is empty and the session confirmed the command (the text is neither stored nor shown)</agenthub.exec>
// <agenthub.watch>~/.claude/settings.json — настройки поменяли (вы, /model, /effort или другой плагин)</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/settings.json — the settings changed (by you, /model, /effort or another plugin)</agenthub.watch>
// <agenthub.watch>~/.claude/sessions/*.json — сессия освободилась: можно набрать отложенное</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/sessions/*.json — a session became free: a deferred command can be typed</agenthub.watch>
// <agenthub.action id="set-model" level="immediate" arg="model:^claude-[a-z]+-[0-9]+(?:-[0-9]+)?$" title="Модель для новых сессий (Opus тратит лимит быстрее остальных)" title-en="Model for new sessions (Opus uses the limit faster than the others)">claude-code.30s.mjs --action set-model {model}</agenthub.action>
// <agenthub.action id="set-effort" level="immediate" arg="level:^(?:low|medium|high|xhigh)$" title="Effort для новых сессий (чем выше, тем быстрее уходит лимит)" title-en="Effort for new sessions (the higher, the faster the limit goes)">claude-code.30s.mjs --action set-effort {level}</agenthub.action>
// <agenthub.action id="effort-max" level="confirm-cost" title="Поставить effort max" title-en="Set effort to max" cost="лимит подписки уходит в разы быстрее; действует сразу во всех вкладках, включая открытые, и перебивает /effort в них" cost-en="the subscription limit runs out several times faster; it applies at once in every tab, open ones included, and overrides /effort there">claude-code.30s.mjs --action effort-max</agenthub.action>
// <agenthub.action id="set-style" level="immediate" arg="style:^[A-Za-z0-9][A-Za-z0-9 _.:()-]{0,79}$" title="Стиль ответов" title-en="Output style">claude-code.30s.mjs --action set-style {style}</agenthub.action>
// <agenthub.action id="ultracode-on" level="immediate" title="Включить ultracode для новых сессий (многоагентные воркфлоу — лимит уходит быстрее)" title-en="Turn on ultracode for new sessions (multi-agent workflows — the limit goes faster)">claude-code.30s.mjs --action ultracode-on</agenthub.action>
// <agenthub.action id="ultracode-off" level="immediate" title="Выключить ultracode для новых сессий" title-en="Turn off ultracode for new sessions">claude-code.30s.mjs --action ultracode-off</agenthub.action>
// <agenthub.action id="apply" level="confirm-cost" arg="session:^[0-9a-fA-F-]{36}$" title="Привести вкладку к базовым: набрать в неё /model и /effort" title-en="Bring the tab to the base: type /model and /effort into it" cost="из хаба не отменить: прежние модель и effort вкладки вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tab's previous model and effort">claude-code.30s.mjs --action apply {session}</agenthub.action>
// <agenthub.action id="apply-all" level="confirm-cost" title="Проставить базовые во все вкладки не как базовые: набрать в них /model и /effort — свободные сейчас, занятые после хода или вашего ответа; вкладку с текстом в поле ввода пропустить" title-en="Apply the base to every tab that differs: type /model and /effort — free tabs now, busy ones after the turn or your answer; skip a tab with text in its input line" cost="из хаба не отменить: прежние модель и effort вкладок вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tabs' previous model and effort">claude-code.30s.mjs --action apply-all</agenthub.action>
// <agenthub.action id="apply-continue" level="confirm-cost" title="Набрать отложенные /model и /effort во вкладки, которые освободились" title-en="Type the deferred /model and /effort into tabs that became free" cost="из хаба не отменить: прежние модель и effort вкладок вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tabs' previous model and effort">claude-code.30s.mjs --action apply-continue</agenthub.action>
// <agenthub.action id="apply-stop" level="immediate" title="Остановить «Проставить базовые»" title-en="Stop applying the base">claude-code.30s.mjs --action apply-stop</agenthub.action>
// <agenthub.action id="apply-done" level="immediate" title="Убрать итог «Проставить базовые»" title-en="Dismiss the apply result">claude-code.30s.mjs --action apply-done</agenthub.action>
//
// Плагин «Claude Code» (реестр agent-hub-plugins, tier official). Работу делает сам, хаб — песочница и права:
//   • читает базовые настройки новых сессий из ~/.claude/settings.json и пишет туда только белый список ключей
//     (ALLOWED_PATHS ниже): атомарно, с копией до правки и с проверкой, что файл не поменяли между чтением и записью;
//   • показывает открытые сессии (~/.claude/sessions, вкладка — по ~/.cmuxterm/claude-hook-sessions.json), их модель
//     и effort, и набирает в их вкладку /model и /effort через cmux — только эти две команды, только в простаивающую
//     сессию с проверенной подписью Claude Code (codesign — сам плагин, или хаб в своём файле) и только в пустое поле ввода.
// Модель и effort каждой сессии видны в её транскрипте, а транскрипты плагину реестра читать нельзя: эти данные даёт хаб
// файлом $AGENTHUB_CLAUDE_SESSIONS_FILE (заявка в сессию хаба, 10.11). Без него плагин показывает только то, что проставил сам.
// Отложенное («после хода», «после ответа») плагин набирает сам из обычного запуска, только если хаб сообщает, что не на
// паузе (AGENTHUB_PAUSED=0, заявка 10.11). Хаб старше — отложенное ждёт кнопки «Продолжить» (действие, которое пауза хаба
// не пускает).
// Факты Claude Code 2.1.3xx (проверены по установленной версии):
//   • effortLevel в ~/.claude/settings.json для Opus 5.5 и новее не действует — effort новых сессий берётся из
//     modelSettings["<id модели>"].effortLevel; поэтому плагин пишет оба ключа;
//   • effortLevel "max" Claude Code молча выкидывает: max держится только через env.CLAUDE_CODE_EFFORT_LEVEL=max, а
//     env из settings.json живые сессии подхватывают сразу (поэтому max — с подтверждением); удалённый ключ env живые
//     сессии не замечают — уход с max пишет "" (пусто = «не задано», не "auto"/"unset": это принудительный auto), а сам
//     ключ плагин удаляет, когда не осталось живых сессий, начатых до ухода с max;
//   • outputStyle из ~/.claude/settings.json меняет и открытые сессии — со следующего сообщения;
//   • /model и /effort, набранные во вкладку, Claude Code сам сохраняет как базовые: плагин набирает ровно базовые
//     значения в том виде, в каком они записаны (псевдоним вроде opus[1m] остаётся псевдонимом).
// Действия: `--action <id> [<аргумент>]`; отказ — код 3, строка message=<объяснение> и последней reason=<код>.

import { execFileSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Время старта процесса: ядро убивает обычный запуск через 5 с, действие — через 30 с, считая от старта
const T0 = Date.now();
const RUN_DEADLINE = () => T0 + 4000;
const ACTION_DEADLINE = () => T0 + 26_000;

// ---------- язык ----------
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
let LANG = envLang();
const tr = (ru, en) => (LANG === "en" ? en : ru);
function ruPlural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
// «3 вкладки» / «3 tabs»
export function tabsN(n, lang = LANG) {
  return lang === "en" ? `${n} ${n === 1 ? "tab" : "tabs"}` : `${n} ${ruPlural(n, "вкладка", "вкладки", "вкладок")}`;
}

// ---------- модели и effort ----------
// Модели на странице (утверждённый дизайн 10.11). Подписи остальных — для показа того, что стоит у сессии.
export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
];
const LABELS = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-fable-5": "Fable 5",
  "claude-fable-5-2": "Fable 5.2",
  "claude-mythos-5": "Mythos 5",
  "claude-mythos-5-1": "Mythos 5.1",
  "claude-mythos-5-2": "Mythos 5.2",
  ...Object.fromEntries(MODELS.map((m) => [m.id, m.label])),
};
// Псевдонимы /model → id (Claude Code 2.1.321, API Anthropic). opusplan/default — без одного id.
const ALIASES = { opus: "claude-opus-5-5", best: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5", fable: "claude-fable-5-2" };
// Модель без ключа model (по умолчанию у API Anthropic) — для effort: какой записи modelSettings она следует
export const DEFAULT_MODEL = "claude-opus-5-5";
// effort по умолчанию у модели (без modelSettings и без legacy effortLevel)
const DEFAULT_EFFORT = {
  "claude-opus-5-5": "medium",
  "claude-sonnet-5-5": "medium",
  "claude-haiku-5-5": "medium",
  "claude-fable-5-2": "medium",
  "claude-mythos-5-2": "medium",
  "claude-opus-5": "high",
  "claude-sonnet-5": "high",
  "claude-fable-5": "high",
  "claude-fable-5-1": "high",
  "claude-mythos-5-1": "high",
};
// Модели, которые effortLevel из ~/.claude/settings.json игнорируют (Opus 5.5 и новее). Остальным он ещё действует.
const NEW_EFFORT = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2", "claude-mythos-5-2"]);
export const LEVELS = ["low", "medium", "high", "xhigh"];
const ALL_LEVELS = [...LEVELS, "max"];
const MODEL_ID_RE = /^claude-[a-z]+-[0-9]+(?:-[0-9]+)?$/;
const MODEL_ARG_RE = /^(?:claude-[a-z]+-[0-9]+(?:-[0-9]+)?|opus|sonnet|haiku|fable|best)(?:\[1m\])?$/;
const SESSION_RE = /^[0-9a-fA-F-]{36}$/;
const STYLE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.:()-]{0,79}$/;

// Значение ключа model → id модели или null (нет ключа, default, opusplan, незнакомое)
export function canonModel(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/\[1m\]$/, "");
  if (ALIASES[s]) return ALIASES[s];
  return MODEL_ID_RE.test(s) ? s : null;
}
export function modelLabel(id) {
  return id ? LABELS[id] || id : tr("по умолчанию", "default");
}
const isLevel = (v) => typeof v === "string" && LEVELS.includes(v);
// env.CLAUDE_CODE_EFFORT_LEVEL так, как его понимает Claude Code (Hw): регистр не важен, пробелы не срезаются,
// med = medium; уровень или max — перебивает всё; auto/unset — у всех effort по умолчанию их модели; целое число —
// перебивает (уровень неизвестен, показывается как есть); прочее (ultracode, мусор) — Claude Code игнорирует.
// → { kind: "level"|"auto"|"number"|"none", value }
export function envEffort(raw) {
  if (typeof raw !== "string" || raw === "") return { kind: "none", value: null };
  const v = raw.toLowerCase();
  if (v === "med") return { kind: "level", value: "medium" };
  if (ALL_LEVELS.includes(v)) return { kind: "level", value: v };
  if (v === "auto" || v === "unset") return { kind: "auto", value: "auto" };
  if (/^\d+$/.test(v)) return { kind: "number", value: raw };
  return { kind: "none", value: null };
}

// ---------- базовые настройки ----------
export const BUILTIN_STYLES = ["Default", "Proactive", "Concise", "Explanatory", "Learning"];

// settings (объект) → базовые новых сессий
export function readBase(s) {
  const env = s && typeof s.env === "object" && s.env ? s.env : {};
  const envRaw = typeof env.CLAUDE_CODE_EFFORT_LEVEL === "string" ? env.CLAUDE_CODE_EFFORT_LEVEL : undefined;
  const ev = envEffort(envRaw);
  const model = canonModel(s?.model);
  const em = model || DEFAULT_MODEL; // модель, по которой считается effort
  const ms = s && typeof s.modelSettings === "object" && s.modelSettings ? s.modelSettings : {};
  let effort = null;
  let effortFrom = null;
  if (ev.kind === "level" || ev.kind === "number") [effort, effortFrom] = [ev.value, "env"];
  else if (ev.kind === "auto") [effort, effortFrom] = ["auto", "env"];
  else if (isLevel(ms[em]?.effortLevel)) [effort, effortFrom] = [ms[em].effortLevel, "modelSettings"];
  else if (!NEW_EFFORT.has(em) && isLevel(s?.effortLevel)) [effort, effortFrom] = [s.effortLevel, "effortLevel"];
  else if (DEFAULT_EFFORT[em]) [effort, effortFrom] = [DEFAULT_EFFORT[em], "default"];
  const modelRaw = typeof s?.model === "string" ? s.model.trim().toLowerCase() : null;
  return {
    model,
    // что набрать в /model: значение как оно записано (псевдоним, [1m]), если /model его примет; иначе id
    modelArg: model ? (modelRaw && MODEL_ARG_RE.test(modelRaw) ? modelRaw : model) : null,
    effort,
    effortFrom,
    maxActive: ev.kind === "level" && ev.value === "max",
    envOverride: ev.kind !== "none", // env задан и перебивает effort во всех сессиях
    envAuto: ev.kind === "auto",
    maxPendingClear: envRaw === "",
    outputStyle: typeof s?.outputStyle === "string" && s.outputStyle && s.outputStyle.toLowerCase() !== "default" ? s.outputStyle : "Default",
    ultracode: s?.ultracode === true,
  };
}

// ---------- запись настроек: белый список ----------
// Путь ключа → можно ли его менять. Всё остальное в settings.json плагин не трогает НИКОГДА.
const ALLOWED_PATHS = [
  /^model$/,
  /^effortLevel$/,
  /^modelSettings\.claude-[a-z]+-[0-9]+(?:-[0-9]+)?\.effortLevel$/,
  /^outputStyle$/,
  /^ultracode$/,
  /^env\.CLAUDE_CODE_EFFORT_LEVEL$/,
];
export function pathAllowed(path) {
  return ALLOWED_PATHS.some((r) => r.test(path.join(".")));
}

// Правка — список операций { path: [...], value } | { path: [...], delete: true }. Проверка белого списка — здесь.
export function applyOps(obj, ops) {
  for (const op of ops) {
    if (!Array.isArray(op.path) || !op.path.length || !pathAllowed(op.path)) throw new Error(`not-allowed:${op.path?.join(".")}`);
    if (op.path.some((k) => k === "__proto__" || k === "constructor" || k === "prototype")) throw new Error("not-allowed");
    let o = obj;
    for (let i = 0; i < op.path.length - 1; i++) {
      const k = op.path[i];
      if (o[k] === undefined || o[k] === null || typeof o[k] !== "object" || Array.isArray(o[k])) {
        if (op.delete) {
          o = null;
          break;
        }
        o[k] = {};
      }
      o = o[k];
    }
    if (!o) continue;
    const last = op.path.at(-1);
    if (op.delete) delete o[last];
    else o[last] = op.value;
  }
  return obj;
}

// Операции для каждой кнопки: из текущих настроек и выбора. → ops (может быть пустым — «уже так»)
export function opsFor(kind, value, s) {
  const base = readBase(s);
  const ms = s && typeof s.modelSettings === "object" && s.modelSettings ? s.modelSettings : {};
  const ops = [];
  if (kind === "model") {
    if (!MODELS.some((m) => m.id === value)) throw new Error("bad-arg");
    if (s?.model !== value) ops.push({ path: ["model"], value });
    // effort переносится на новую модель, иначе она молча начнёт со своего значения по умолчанию
    if (isLevel(base.effort) && ["modelSettings", "effortLevel"].includes(base.effortFrom) && !isLevel(ms[value]?.effortLevel)) ops.push({ path: ["modelSettings", value, "effortLevel"], value: base.effort });
  } else if (kind === "effort") {
    if (!isLevel(value)) throw new Error("bad-arg");
    // env (max или другой уровень) перебивает всё: уход с него — пустая строка
    if (base.envOverride) ops.push({ path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "" });
    if (s?.effortLevel !== value) ops.push({ path: ["effortLevel"], value });
    const em = base.model || DEFAULT_MODEL;
    if (ms[em]?.effortLevel !== value) ops.push({ path: ["modelSettings", em, "effortLevel"], value });
  } else if (kind === "max") {
    if (s?.env?.CLAUDE_CODE_EFFORT_LEVEL !== "max") ops.push({ path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], value: "max" });
  } else if (kind === "style") {
    if (value === "Default") {
      if (s?.outputStyle !== undefined) ops.push({ path: ["outputStyle"], delete: true });
    } else if (s?.outputStyle !== value) ops.push({ path: ["outputStyle"], value });
  } else if (kind === "ultracode") {
    if (value && s?.ultracode !== true) ops.push({ path: ["ultracode"], value: true });
    if (!value && s?.ultracode !== undefined) ops.push({ path: ["ultracode"], delete: true });
  } else if (kind === "clear-max-key") {
    if (s?.env?.CLAUDE_CODE_EFFORT_LEVEL === "") ops.push({ path: ["env", "CLAUDE_CODE_EFFORT_LEVEL"], delete: true });
  } else throw new Error("bad-arg");
  return ops;
}

const settingsPath = (home) => join(home, ".claude", "settings.json");
const backupsDir = (home) => join(home, ".claude", "backups");
const BACKUP_RE = /^settings\.json\..+-agenthub$/;
export const KEEP_BACKUPS = 20;

function stamp(now) {
  return new Date(now).toISOString().replace(/[:.]/g, "-");
}

// Текст настроек → объект; пустой файл — {}; не объект — null
function parseSettings(text) {
  if (text === null || !String(text).trim()) return {};
  try {
    const o = JSON.parse(text);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

// Прочитать → правка (opsFn) → копия → запись во временный файл рядом → сверка, что файл не поменяли → rename.
// Поменяли между чтением и записью — перечитать и повторить (до 3 раз), иначе отказ settings-busy.
// settings.json — ссылка (dotfiles)? Пишется файл, на который она указывает; сама ссылка остаётся.
// → { ok, changed?, reason?, ops? }
export function writeSettings(home, opsFn, { now = Date.now(), beforeRename = null } = {}) {
  const link = settingsPath(home);
  let path = link;
  let isLink = false;
  try {
    isLink = lstatSync(link).isSymbolicLink();
  } catch {}
  if (isLink) {
    try {
      path = realpathSync(link);
    } catch {
      return { ok: false, reason: "settings-link-broken" }; // ссылка в никуда: не заменять её обычным файлом
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let text = null;
    let mode = 0o600;
    try {
      text = readFileSync(path, "utf8");
      mode = statSync(path).mode & 0o777;
    } catch (e) {
      if (e.code !== "ENOENT") return { ok: false, reason: "settings-unreadable" };
    }
    const obj = parseSettings(text);
    if (!obj) return { ok: false, reason: "settings-broken" };
    let ops;
    try {
      ops = opsFn(obj);
    } catch (e) {
      return { ok: false, reason: String(e.message).startsWith("not-allowed") ? "not-allowed" : "bad-arg" };
    }
    if (!ops.length) return { ok: true, changed: false, ops };
    try {
      applyOps(obj, ops);
    } catch {
      return { ok: false, reason: "not-allowed" };
    }
    const out = `${JSON.stringify(obj, null, 2)}\n`;
    mkdirSync(dirname(path), { recursive: true });
    if (text !== null) {
      mkdirSync(backupsDir(home), { recursive: true });
      writeFileSync(join(backupsDir(home), `settings.json.${stamp(now)}-agenthub`), text, { mode: 0o600 });
      pruneBackups(home);
    }
    const tmp = `${path}.agenthub-${process.pid}.tmp`;
    writeFileSync(tmp, out, { mode });
    if (beforeRename) beforeRename(attempt);
    let now2 = null;
    try {
      now2 = readFileSync(path, "utf8");
    } catch {}
    if (now2 !== text) {
      rmSync(tmp, { force: true });
      continue;
    }
    renameSync(tmp, path);
    return { ok: true, changed: true, ops };
  }
  return { ok: false, reason: "settings-busy" };
}

export function pruneBackups(home, keep = KEEP_BACKUPS) {
  let names = [];
  try {
    names = readdirSync(backupsDir(home)).filter((n) => BACKUP_RE.test(n)).sort();
  } catch {
    return;
  }
  for (const n of names.slice(0, Math.max(0, names.length - keep))) rmSync(join(backupsDir(home), n), { force: true });
}

// ---------- стили ответов ----------
function styleName(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8").slice(0, 4096);
  } catch {
    return null;
  }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const m = fm && /^name:\s*["']?(.+?)["']?\s*$/m.exec(fm[1]);
  return (m ? m[1] : basename(file).replace(/\.md$/i, "")).trim() || null;
}
function mdFiles(dir, depth = 0, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 3) mdFiles(p, depth + 1, out);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(p);
    if (out.length >= 50) break;
  }
  return out;
}
// Внутри ли p каталога root (без выхода через .. и ссылки)
function inside(root, p) {
  try {
    const rel = relative(realpathSync(root), realpathSync(p));
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
  } catch {
    return false;
  }
}
// → [{ name, source: builtin|user|plugin }] — встроенные, ~/.claude/output-styles, стили включённых плагинов
export function listStyles(home, settings) {
  const out = BUILTIN_STYLES.map((name) => ({ name, source: "builtin" }));
  const seen = new Set(out.map((s) => s.name));
  const add = (name, source) => {
    if (name && STYLE_RE.test(name) && !seen.has(name)) {
      seen.add(name);
      out.push({ name, source });
    }
  };
  for (const f of mdFiles(join(home, ".claude", "output-styles"))) add(styleName(f), "user");
  const enabled = settings && typeof settings.enabledPlugins === "object" && settings.enabledPlugins ? settings.enabledPlugins : {};
  let installed = {};
  try {
    installed = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"))?.plugins || {};
  } catch {}
  const cache = join(home, ".claude", "plugins", "cache");
  for (const [key, on] of Object.entries(enabled)) {
    if (on !== true || !Array.isArray(installed[key])) continue;
    const entry = installed[key].find((x) => x && typeof x.installPath === "string");
    if (!entry || !inside(cache, entry.installPath)) continue;
    let manifest = {};
    try {
      manifest = JSON.parse(readFileSync(join(entry.installPath, ".claude-plugin", "plugin.json"), "utf8")) || {};
    } catch {}
    const plugin = typeof manifest.name === "string" && manifest.name ? manifest.name : key.split("@")[0];
    const paths = manifest.outputStyles === undefined ? ["output-styles"] : [].concat(manifest.outputStyles).filter((p) => typeof p === "string");
    for (const rel of paths) {
      const p = resolve(entry.installPath, rel);
      if (!inside(entry.installPath, p)) continue;
      const files = /\.md$/i.test(p) ? [p] : mdFiles(p);
      for (const f of files) add(`${plugin}:${styleName(f)}`, "plugin");
    }
  }
  return out;
}

// ---------- окружение: Claude Code, cmux, ps ----------
// Двойники в тестах: AGENTHUB_TEST_BIN_DIR/{cmux,ps}. В тестовом режиме настоящие программы не берутся вовсе:
// нет двойника — значит, программы нет (так тест «без cmux» не дотянется до настоящих вкладок).
const testMode = () => Boolean(process.env.AGENTHUB_TEST_BIN_DIR);
function bin(name, real) {
  const dir = process.env.AGENTHUB_TEST_BIN_DIR;
  return dir ? join(dir, name) : real;
}
const CMUX = () => bin("cmux", "/Applications/cmux.app/Contents/Resources/bin/cmux");
const PS = () => bin("ps", "/bin/ps");
const CODESIGN = () => bin("codesign", "/usr/bin/codesign");
// Требование к подписи Claude Code — то же, что у хаба (requirements.claudeCode)
const CLAUDE_REQUIREMENT = 'identifier "com.anthropic.claude-code" and anchor apple generic and certificate leaf[subject.OU] = "Q6L2SF6YDW"';
// Исполняемый файл подписан как Claude Code? Кэш на время запуска (путь + время изменения файла).
const signCache = new Map();
export function signedClaude(exe) {
  if (typeof exe !== "string" || !exe.startsWith("/")) return false;
  let key;
  try {
    key = `${exe}:${statSync(exe).mtimeMs}`;
  } catch {
    if (!testMode()) return false;
    key = exe;
  }
  if (signCache.has(key)) return signCache.get(key);
  let ok = false;
  try {
    execFileSync(CODESIGN(), ["--verify", "--strict", `-R=${CLAUDE_REQUIREMENT}`, exe], { env: { PATH: "/usr/bin:/bin" }, timeout: 3000, stdio: "ignore" });
    ok = true;
  } catch {}
  signCache.set(key, ok);
  return ok;
}
export function cmuxAvailable() {
  return existsSync(CMUX());
}
// Установлен ли Claude Code: родная установка, Homebrew/npm, или есть его настройки
export function claudeInstalled(home) {
  if (existsSync(join(home, ".local", "bin", "claude")) || existsSync(join(home, ".claude", "settings.json"))) return true;
  if (!testMode() && ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].some((p) => existsSync(p))) return true;
  try {
    return readdirSync(join(home, ".local", "share", "claude", "versions")).some((n) => /^\d+\.\d+\.\d+/.test(n));
  } catch {
    return false;
  }
}
// Пауза между командами во вкладку (в тестах — без неё). Ожидание замка — настоящее всегда.
function realSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function sleep(ms) {
  if (!testMode()) realSleep(ms);
}
const CLAUDE_EXE = /(?:^|\/)claude(?:-code)?$|\/claude\/versions\/[^/]+$|@anthropic-ai\/claude-code\//;
const lstartKey = (s) => String(s || "").trim().replace(/\s+/g, " ");

// pid → { lstart, comm } для живых процессов. ps в UTC: так пишет procStart сам Claude Code.
// ps не отработал (нет программы, таймаут, сигнал, код > 1) — null: «неизвестно», а не «никого нет».
export function processTable(pids) {
  const list = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  const out = new Map();
  if (!list.length) return out;
  let text = "";
  try {
    text = execFileSync(PS(), ["-o", "pid=,lstart=,comm=", "-p", list.join(",")], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", TZ: "UTC", LC_ALL: "C" }, timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    // ps выходит с 1, если части pid нет — живые всё равно напечатаны
    if (e.status !== 1 || e.signal) return null;
    text = String(e.stdout || "");
  }
  for (const l of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(.+?)\s*$/.exec(l);
    if (m) out.set(Number(m[1]), { lstart: lstartKey(m[2]), comm: m[3] });
  }
  return out;
}

// ---------- сессии ----------
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
// Только нужные поля: идентификаторы, состояние и время (текст переписки там не хранится, но и не берётся)
function sessionFiles(home) {
  const dir = join(home, ".claude", "sessions");
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => /^\d+\.json$/.test(n));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const j = readJson(join(dir, n));
    if (!j || !Number.isInteger(j.pid) || !SESSION_RE.test(String(j.sessionId || ""))) continue;
    if (j.kind && j.kind !== "interactive") continue;
    out.push({
      pid: j.pid,
      sessionId: j.sessionId,
      cwd: typeof j.cwd === "string" ? j.cwd : null,
      name: typeof j.name === "string" ? j.name : null,
      // незнакомое состояние — как «работает»: в такую вкладку ничего не набирается
      status: ["idle", "busy", "waiting"].includes(j.status) ? j.status : "busy",
      startedAt: Number.isFinite(j.startedAt) ? j.startedAt : null,
      procStart: typeof j.procStart === "string" ? j.procStart : null,
    });
  }
  return out;
}
// sessionId → { surfaceId, workspaceId, pid } из ~/.cmuxterm/claude-hook-sessions.json (только идентификаторы)
function cmuxTabs(home) {
  const j = readJson(join(home, ".cmuxterm", "claude-hook-sessions.json"));
  const out = new Map();
  const s = j && typeof j.sessions === "object" && j.sessions ? j.sessions : {};
  for (const v of Object.values(s)) {
    if (!v || !SESSION_RE.test(String(v.sessionId || ""))) continue;
    if (typeof v.surfaceId !== "string" || typeof v.workspaceId !== "string") continue;
    out.set(v.sessionId, { surfaceId: v.surfaceId, workspaceId: v.workspaceId, pid: Number.isInteger(v.pid) ? v.pid : null });
  }
  return out;
}
// Файл хаба с моделью и effort сессий (заявка 10.11): $AGENTHUB_CLAUDE_SESSIONS_FILE
export function hubSessions() {
  const p = process.env.AGENTHUB_CLAUDE_SESSIONS_FILE;
  if (!p) return null;
  const j = readJson(p);
  const out = new Map();
  for (const s of Array.isArray(j?.sessions) ? j.sessions : []) {
    if (!s || !SESSION_RE.test(String(s.sessionId || ""))) continue;
    out.set(s.sessionId, { model: canonModel(s.model), effort: ALL_LEVELS.includes(s.effort) ? s.effort : null, verified: s.verified === true ? true : s.verified === false ? false : null, at: Date.parse(s.at) || 0 });
  }
  return out;
}

// Живые сессии Claude Code: файл сессии + процесс жив, тот же (время старта) и это Claude Code.
// null — проверить не получилось (ps не отработал).
export function liveSessions(home, { procs = null } = {}) {
  const files = sessionFiles(home);
  const table = procs || processTable(files.map((f) => f.pid));
  if (!table) return null;
  const tabs = cmuxTabs(home);
  const out = [];
  for (const f of files) {
    const p = table.get(f.pid);
    if (!p || !CLAUDE_EXE.test(p.comm)) continue;
    if (f.procStart && lstartKey(f.procStart) !== p.lstart) continue;
    const tab = tabs.get(f.sessionId);
    out.push({ ...f, exe: p.comm, tab: tab && (tab.pid === null || tab.pid === f.pid) ? tab : null, label: f.name || (f.cwd ? basename(f.cwd) : f.sessionId.slice(0, 8)) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.pid - b.pid);
}

// ---------- состояние плагина (PluginData) и замок ----------
// state.json меняют и обычный запуск (очередь), и действия: всё чтение-правка-запись — под замком state.lock,
// иначе «Остановить» затирается запуском, а одна вкладка получает команду дважды.
function dataDir() {
  return process.env.AGENTHUB_PLUGIN_DATA_PATH || null;
}
export const LOCKED = Symbol("locked");
const STALE_LOCK_MS = 60_000; // запуск убит ядром (таймаут 5 с / 30 с) — замок старше минуты снимается
// Замок брошен: процесса, записавшего его, нет (ядро убило запуск), или он старше минуты
function lockStale(p) {
  try {
    const pid = Number(readFileSync(p, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0); // проверка существования своего же процесса плагина, сигнал не посылается
      } catch (e) {
        if (e.code === "ESRCH") return true;
      }
    }
    return Date.now() - statSync(p).mtimeMs > STALE_LOCK_MS;
  } catch {
    return false;
  }
}
export function withLock(fn, { waitMs = 0 } = {}) {
  const d = dataDir();
  if (!d) return fn();
  mkdirSync(d, { recursive: true });
  const p = join(d, "state.lock");
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = openSync(p, "wx", 0o600);
      writeSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (lockStale(p)) {
        // забрать брошенный замок атомарно: переименовать удаётся только одному
        const grab = `${p}.stale.${process.pid}`;
        try {
          renameSync(p, grab);
          rmSync(grab, { force: true });
        } catch {}
        continue;
      }
      if (Date.now() - t0 >= waitMs) return LOCKED;
      realSleep(100);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(p, { force: true });
  }
}
export function loadState() {
  const d = dataDir();
  const j = d ? readJson(join(d, "state.json")) : null;
  const st = { applied: {}, job: null, maxClearedAt: null, ...(j && typeof j === "object" && !Array.isArray(j) ? j : {}) };
  if (!st.applied || typeof st.applied !== "object" || Array.isArray(st.applied)) st.applied = {};
  if (st.job && (typeof st.job !== "object" || !Array.isArray(st.job.items))) st.job = null;
  if (st.job) {
    st.job.items = st.job.items.filter((i) => i && typeof i === "object" && SESSION_RE.test(String(i.sessionId || "")) && PHASES.includes(i.phase) && typeof i.label === "string");
    if (!st.job.items.length) st.job = null;
  }
  return st;
}
export function saveState(st) {
  const d = dataDir();
  if (!d) return;
  mkdirSync(d, { recursive: true });
  const p = join(d, "state.json");
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(st), { mode: 0o600 });
  renameSync(tmp, p);
}

// Модель и effort сессии сейчас: что свежее — запись хаба (время записи транскрипта) или то, что проставил сам плагин
// (после начала сессии; хаб обновит файл позже). Нет ни того, ни другого — неизвестно.
// env (max или другой уровень) перебивает effort у всех.
export function sessionNow(sess, base, hub, st) {
  const h = hub?.get(sess.sessionId);
  const own = st.applied?.[sess.sessionId];
  const ownOk = own && (!sess.startedAt || own.at >= sess.startedAt) && (!h || own.at > h.at);
  const model = (ownOk ? own.model : null) ?? h?.model ?? null;
  let effort = (ownOk ? own.effort : null) ?? h?.effort ?? null;
  if (base.envAuto) effort = model ? DEFAULT_EFFORT[model] || null : null;
  else if (base.envOverride && base.effort) effort = base.effort;
  return { model: model || null, effort: effort || null, known: Boolean(h) || Boolean(ownOk), verified: h ? h.verified : null };
}

// Строка таблицы: отличие от базовых и что можно сделать
export function rowFor(sess, base, hub, st) {
  const now = sessionNow(sess, base, hub, st);
  const modelDiffers = Boolean(base.model && now.model && now.model !== base.model);
  // effort базовых — для модели базовых (не выбрана — Opus 5.5): вкладку на другой модели по effort не сравниваем,
  // иначе /effort переписал бы сохранённый effort её модели. env auto — у каждой своя модель по умолчанию.
  const sameModel = base.model ? true : !now.model || now.model === DEFAULT_MODEL;
  const effortDiffers = Boolean(!base.envAuto && sameModel && base.effort && now.effort && now.effort !== base.effort);
  const differs = modelDiffers || effortDiffers;
  const action = !differs ? "same" : sess.status === "busy" ? "afterTurn" : sess.status === "waiting" ? "afterAnswer" : "fix";
  return { ...sess, now, modelDiffers, effortDiffers, differs, action };
}

// ---------- набор во вкладку ----------
// Поле ввода Claude Code пустое? Последняя строка-приглашение «> …»: после знака — ничего, кроме рамки «│» через пробел.
export function inputEmpty(screen) {
  const i = promptLine(screen);
  if (i < 0) return false;
  const m = PROMPT_RE.exec(String(screen).split("\n")[i]);
  // рамка «│» справа срезается, только если строка в рамке и слева; иначе «│» — набранный текст
  const rest = m[1] ? m[2].replace(/\s*│\s*$/, "") : m[2];
  return rest.trim() === "";
}
const PROMPT_RE = /^\s*(│)?\s*[>❯›](.*)$/;
// Индекс последней строки-приглашения поля ввода (−1 — нет)
function promptLine(screen) {
  const lines = String(screen || "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) if (PROMPT_RE.test(lines[i])) return i;
  return -1;
}
// Что появилось на экране после набора: всё ниже последних строк вывода, что были над полем ввода до набора.
// Не нашли этот «якорь» — null (подтвердить нельзя). Так старое «Set … to …», уехавшее за край, ничего не решает.
export function newOutput(before, after) {
  const b = String(before).split("\n");
  const pi = promptLine(before);
  const anchor = b
    .slice(0, pi < 0 ? b.length : pi)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^[\s─━═-]+$/.test(l))
    .slice(-3);
  const a = String(after).split("\n").map((l) => l.trimEnd());
  if (!anchor.length) return a.join("\n");
  for (let i = a.length - anchor.length; i >= 0; i--) if (anchor.every((l, k) => a[i + k] === l)) return a.slice(i + anchor.length).join("\n");
  return null;
}
function cmux(args, timeout) {
  return execFileSync(CMUX(), args, { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: process.env.HOME || homedir() }, timeout, stdio: ["ignore", "pipe", "ignore"] });
}
function target(tab) {
  return ["--workspace", tab.workspaceId, "--surface", tab.surfaceId];
}
// Что набрать, чтобы сессия стала как базовые (только /model и /effort). → ["/model …", "/effort …"]
export function commandsFor(now, base) {
  const cmds = [];
  if (base.model && now.model !== base.model) cmds.push(`/model ${base.modelArg}`);
  // env (max или уровень) держит effort у всех — /effort не нужен и не подействовал бы
  if (!base.envOverride && isLevel(base.effort) && now.effort !== base.effort) cmds.push(`/effort ${base.effort}`);
  return cmds;
}
const COMMAND_RE = /^\/(?:model (?:claude-[a-z]+-[0-9]+(?:-[0-9]+)?|opus|sonnet|haiku|fable|best)(?:\[1m\])?|effort (?:low|medium|high|xhigh))$/;

// Набрать команды во вкладку. Только простаивающая сессия с вкладкой, не отвергнутая хабом, пустое поле ввода.
// deadline — до какого момента можно работать (обычный запуск ядро убивает через 5 с). onTyping — перед первой
// отправкой (сохранить «набираю», чтобы убитый запуск не набрал то же второй раз).
// → { phase: done|skipped|failed|waitTurn|waitAnswer|later, reason?, result? }
export function typeInto(sess, base, now, { deadline = ACTION_DEADLINE(), onTyping = null } = {}) {
  if (sess.status === "busy") return { phase: "waitTurn" };
  if (sess.status === "waiting") return { phase: "waitAnswer" };
  if (now.verified === false) return { phase: "skipped", reason: "unverified" };
  if (!sess.tab) return { phase: "skipped", reason: "no-tab" };
  if (!cmuxAvailable()) return { phase: "skipped", reason: "no-cmux" };
  const cmds = commandsFor(now, base);
  if (!cmds.length) return { phase: "done", result: { model: now.model, effort: now.effort } };
  if (cmds.some((c) => !COMMAND_RE.test(c))) return { phase: "failed", reason: "not-allowed" };
  // подпись: хаб подтвердил (verified: true) — достаточно; иначе плагин проверяет сам (codesign)
  if (now.verified !== true && !signedClaude(sess.exe)) return { phase: "skipped", reason: "unverified" };
  // на одну вкладку: 2 чтения экрана, по 2 вызова на команду и пауза 0,7 с после каждой
  const need = 800 + cmds.length * 1200;
  if (deadline - Date.now() < need) return { phase: "later" };
  const left = () => Math.max(200, Math.min(5000, deadline - Date.now()));
  try {
    const before = cmux(["read-screen", ...target(sess.tab), "--lines", "40"], left());
    if (!inputEmpty(before)) return { phase: "skipped", reason: "input-text" };
    if (onTyping) onTyping();
    for (const c of cmds) {
      cmux(["send", ...target(sess.tab), "--", c], left());
      cmux(["send-key", ...target(sess.tab), "enter"], left());
      sleep(Math.min(700, Math.max(0, deadline - Date.now() - 400)));
    }
    const after = cmux(["read-screen", ...target(sess.tab), "--lines", "80"], left());
    // ответ Claude Code ищется только в том, что появилось после набора
    const fresh = newOutput(before, after);
    const okModel = !cmds.some((c) => c.startsWith("/model")) || (fresh !== null && fresh.includes("Set model to "));
    const okEffort = !cmds.some((c) => c.startsWith("/effort")) || (fresh !== null && fresh.includes(`Set effort level to ${base.effort}`));
    if (!okModel || !okEffort) return { phase: "failed", reason: "not-confirmed" };
    return { phase: "done", result: { model: base.model || now.model, effort: base.envOverride ? base.effort : base.effort || now.effort } };
  } catch {
    return { phase: "failed", reason: "cmux-failed" };
  }
}

const PENDING = ["queued", "waitTurn", "waitAnswer", "ready"];
const FINAL = ["done", "skipped", "failed"];
const PHASES = [...PENDING, ...FINAL, "typing"];

// Пройти очередь «Проставить»: свободные — набрать (если можно набирать: allowType), занятые — ждать, пропавшие —
// пропустить. Состояние сохраняется после каждого пункта (save). Вызывать под замком.
// «набираю» осталось от убитого запуска: второй раз не набираем — пусть человек проверит вкладку
function markInterrupted(job) {
  let ch = false;
  for (const it of job?.items || []) {
    if (it.phase === "typing") {
      Object.assign(it, { phase: "failed", reason: "interrupted" });
      ch = true;
    }
  }
  return ch;
}
export function processJob(home, st, { deadline = RUN_DEADLINE(), allowType = true, base, sessions, save = () => {} }) {
  const job = st.job;
  if (!job) return false;
  let changed = markInterrupted(job);
  if (changed) save();
  if (job.finishedAt || !sessions) return changed;
  const hub = hubSessions();
  for (const it of job.items) {
    if (!PENDING.includes(it.phase)) continue;
    const sess = sessions.find((s) => s.sessionId === it.sessionId);
    let next;
    if (!sess) next = { phase: "skipped", reason: "gone" };
    else if (sess.status === "busy") next = { phase: "waitTurn" };
    else if (sess.status === "waiting") next = { phase: "waitAnswer" };
    else if (!allowType) next = { phase: "ready" };
    else {
      next = typeInto(sess, base, sessionNow(sess, base, hub, st), {
        deadline,
        onTyping: () => {
          Object.assign(it, { phase: "typing", at: Date.now() });
          save();
        },
      });
      if (next.phase === "later") next = { phase: it.phase === "queued" ? "queued" : "ready" };
    }
    if (next.phase === "waitTurn" || next.phase === "waitAnswer") it.waited = next.phase;
    if (next.phase !== it.phase || (next.reason || null) !== (it.reason || null)) {
      Object.assign(it, { phase: next.phase, reason: next.reason || null, result: next.result || null, at: Date.now() });
      if (next.phase === "done" && next.result) st.applied[it.sessionId] = { ...next.result, at: Date.now() };
      changed = true;
      save();
    }
  }
  if (job.items.every((i) => FINAL.includes(i.phase))) {
    job.finishedAt = Date.now();
    changed = true;
    save();
  }
  return changed;
}

// После ухода с env (max) ключ env.CLAUDE_CODE_EFFORT_LEVEL = "" удаляется, когда не осталось живых сессий, начатых до
// ухода (у них удалённый ключ так и остался бы прежним). sessions = null (не проверить) — не трогать.
export function maybeClearMaxKey(home, st, base, sessions) {
  if (!sessions || !base.maxPendingClear || !st.maxClearedAt) return false;
  if (sessions.some((s) => !s.startedAt || s.startedAt <= st.maxClearedAt)) return false;
  const r = writeSettings(home, (s) => opsFor("clear-max-key", null, s));
  if (r.ok) st.maxClearedAt = null;
  return r.ok;
}

// ---------- сбор ----------
function readSettings(home) {
  let text = null;
  try {
    text = readFileSync(settingsPath(home), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") return null;
  }
  return parseSettings(text);
}

export function collect({ home = homedir() } = {}) {
  if (!claudeInstalled(home)) return { installed: false };
  let settings = readSettings(home);
  const broken = !settings;
  if (broken) settings = {};
  let base = readBase(settings);
  const sessions = liveSessions(home);
  // отложенное набирается из обычного запуска, только если хаб сообщает, что он не на паузе
  const allowType = process.env.AGENTHUB_PAUSED === "0";
  let st = loadState();
  if (!broken) {
    const r = withLock(() => {
      const s2 = loadState();
      let ch = processJob(home, s2, { deadline: RUN_DEADLINE(), allowType, base, sessions, save: () => saveState(s2) });
      // уход с env без отметки времени (замок был занят) — отметить сейчас: ключ удалится, когда закроются сессии старше
      if (base.maxPendingClear && !s2.maxClearedAt) {
        s2.maxClearedAt = Date.now();
        ch = true;
      }
      if (maybeClearMaxKey(home, s2, base, sessions)) ch = true;
      // проставленное помнится только для живых сессий
      if (sessions) {
        const live = new Set(sessions.map((x) => x.sessionId));
        for (const id of Object.keys(s2.applied)) {
          if (!live.has(id)) {
            delete s2.applied[id];
            ch = true;
          }
        }
      }
      if (ch) saveState(s2);
      return s2;
    });
    if (r !== LOCKED) st = r;
    base = readBase(readSettings(home) || {});
  }
  const hub = hubSessions();
  return {
    installed: true,
    broken,
    base: broken ? null : base,
    styles: broken ? [] : listStyles(home, settings),
    rows: (sessions || []).map((s) => rowFor(s, base, hub, st)),
    sessionsUnknown: !sessions,
    hubData: Boolean(hub),
    cmux: cmuxAvailable(),
    autoType: allowType,
    job: st.job,
  };
}

// ---------- вывод ----------
export function clean(s, max = 120) {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\|/g, "¦").replace(/^[-\s]+/, "").replace(/^~~~$/, "~").slice(0, max);
}
function q(v) {
  return `"${String(v).replace(/[\\"]/g, "\\$&")}"`;
}
function line(title, params = {}) {
  const ps = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${/^[\w.:/+#-]+$/.test(String(v)) ? v : q(v)}`);
  return ps.length ? `${clean(title, 300)} | ${ps.join(" ")}` : clean(title, 300);
}
const ORANGE = "#FFB454";
const BLUE = "#64A8FF";
const GREEN = "#5BD47A";
const GREY = "#8E8E93";
const effortLabel = (e) => e || tr("по умолчанию", "default");
const stateText = (s) => ({ idle: tr("простаивает", "idle"), busy: tr("работает", "working"), waiting: tr("ждёт ответа", "waiting for you") })[s] || s;
const noteText = (a) => ({ same: tr("как базовые", "as base"), afterTurn: tr("после хода", "after the turn"), afterAnswer: tr("после ответа", "after your answer") })[a] || "";
const REASONS = {
  "input-text": ["в поле ввода был текст", "there was text in the input line"],
  gone: ["сессия закрылась", "the session closed"],
  "no-tab": ["вкладка cmux не найдена", "cmux tab not found"],
  "no-cmux": ["нет cmux", "no cmux"],
  "not-confirmed": ["сессия не подтвердила команду", "the session didn't confirm the command"],
  "cmux-failed": ["cmux не ответил", "cmux didn't respond"],
  "not-allowed": ["команда не из белого списка", "command not on the allow list"],
  stopped: ["остановлено", "stopped"],
  unverified: ["подпись Claude Code не подтверждена", "Claude Code signature not verified"],
  interrupted: ["прервано при наборе — проверьте вкладку", "interrupted while typing — check the tab"],
};
const reasonText = (r) => (REASONS[r] ? REASONS[r][LANG === "en" ? 1 : 0] : r || "");
const phaseText = (it) =>
  ({
    queued: tr("сейчас", "now"),
    typing: tr("набираю…", "typing…"),
    waitTurn: tr("ждёт конца хода", "waits for the turn to end"),
    waitAnswer: tr("ждёт вашего ответа", "waits for your answer"),
    ready: tr("освободилась — нажмите «Продолжить»", "free now — press Continue"),
    done: it.result ? `${modelLabel(it.result.model)} · ${effortLabel(it.result.effort)}` : tr("готово", "done"),
    skipped: reasonText(it.reason),
    failed: reasonText(it.reason),
  })[it.phase] || it.phase;
const phaseIcon = { queued: ["arrow.right", BLUE], typing: ["ellipsis", BLUE], ready: ["arrow.right", BLUE], waitTurn: ["clock", ORANGE], waitAnswer: ["clock", ORANGE], done: ["checkmark", GREEN], skipped: ["minus", null], failed: ["xmark", ORANGE] };

export function render(r, { lang = envLang() } = {}) {
  LANG = lang === "en" ? "en" : "ru";
  const out = [];
  if (!r.installed) {
    out.push(line(tr("Claude Code не установлен", "Claude Code isn't installed"), { status: "unknown", tile: tr("нет", "none") }));
    out.push("---");
    out.push(line(tr("Плагин показывает настройки Claude Code, когда он установлен", "The plugin shows Claude Code settings once it is installed")));
    return `${out.join("\n")}\n`;
  }
  if (r.broken) {
    out.push(line(tr("Настройки Claude не читаются", "Claude settings unreadable"), { status: "error", tile: tr("сбой", "error") }));
    out.push("---");
    out.push(line(tr("~/.claude/settings.json — не JSON. Плагин его не меняет, пока файл не исправят", "~/.claude/settings.json isn't valid JSON. The plugin won't change it until it's fixed")));
    return `${out.join("\n")}\n`;
  }
  const b = r.base;
  const differ = r.rows.filter((x) => x.differs);
  const known = r.rows.filter((x) => x.now.known);
  const baseText = `${modelLabel(b.model)} · ${effortLabel(b.effort)}`;
  const job = r.job || null;
  const jobActive = Boolean(job && !job.finishedAt);
  const canType = r.cmux;
  let differText;
  const unknownN = r.rows.length - known.length;
  if (r.sessionsUnknown) differText = tr("вкладки: не удалось проверить", "tabs: couldn't check");
  else if (differ.length) differText = tr(`${tabsN(differ.length)} не как базовые`, `${tabsN(differ.length, "en")} ${differ.length === 1 ? "differs" : "differ"} from the base`);
  else if (r.rows.length && !known.length) differText = tr("вкладки: нет данных", "tabs: no data");
  else if (unknownN) differText = tr(`как базовые · ${unknownN} без данных`, `as base · ${unknownN} unknown`);
  else differText = tr("как базовые", "as base");

  // шапка: базовые одной строкой, отличия и кнопка
  out.push(line(tr(`Базовые: ${baseText}`, `Base: ${baseText}`), { status: jobActive ? "wait" : "ok", tile: baseText }));
  out.push(line(differText));
  if (differ.length && canType && !jobActive) out.push(line(tr("Проставить всем", "Apply to all"), { action: "apply-all" }));
  out.push("---");

  // для новых сессий
  out.push(line(tr("Для новых сессий", "For new sessions")));
  out.push(line(tr("Модель", "Model"), { strip: "true" }));
  for (const m of MODELS) {
    const sel = b.model === m.id;
    out.push(`--${line(m.label, sel ? { sfimage: "checkmark.circle.fill", note: tr("выбрана", "selected") } : { action: "set-model", arg: m.id })}`);
  }
  out.push(line(tr("Effort", "Effort"), { strip: "true" }));
  for (const l of LEVELS) {
    const sel = b.effort === l && !b.envOverride;
    out.push(`--${line(l, sel ? { sfimage: "checkmark.circle.fill", note: tr("выбран", "selected") } : { action: "set-effort", arg: l })}`);
  }
  out.push(`--${line("max", b.maxActive ? { sfimage: "exclamationmark.triangle.fill", color: ORANGE, note: tr("включён во всех вкладках", "on in every tab") } : { action: "effort-max", color: ORANGE, note: tr("лимит в разы быстрее", "limit runs out faster") })}`);
  if (b.envOverride && !b.maxActive) out.push(line(tr(`Effort ${b.effort} задан в env.CLAUDE_CODE_EFFORT_LEVEL и действует во всех вкладках; выбор уровня выше его снимет`, `Effort ${b.effort} is set in env.CLAUDE_CODE_EFFORT_LEVEL and applies in every tab; picking a level above clears it`), { color: ORANGE }));
  out.push(line(tr(`Стиль ответов: ${b.outputStyle}`, `Output style: ${b.outputStyle}`)));
  for (const s of r.styles) {
    const sel = b.outputStyle === s.name;
    const note = sel ? tr("выбран", "selected") : s.source === "user" ? tr("ваш", "yours") : s.source === "plugin" ? tr("из плагина", "from a plugin") : undefined;
    out.push(`--${line(s.name, sel ? { sfimage: "checkmark.circle.fill", note } : { action: "set-style", arg: s.name, note })}`);
  }
  out.push(
    b.ultracode
      ? line(tr("Ultracode: включён · многоагентные воркфлоу на каждую задачу", "Ultracode: on · multi-agent workflows on every task"), { action: "ultracode-off", sfimage: "bolt.fill" })
      : line(tr("Ultracode: выключен · многоагентные воркфлоу на каждую задачу", "Ultracode: off · multi-agent workflows on every task"), { action: "ultracode-on", sfimage: "bolt.slash" }),
  );
  out.push(
    line(
      tr(
        "Пишется в ~/.claude/settings.json, прежняя версия — в ~/.claude/backups. Модель и effort — для новых вкладок, открытые переключает кнопка ниже; стиль ответов открытые вкладки подхватят со следующего сообщения",
        "Written to ~/.claude/settings.json, the previous version goes to ~/.claude/backups. Model and effort are for new tabs, the button below switches open ones; open tabs pick up the output style from their next message",
      ),
      { color: GREY },
    ),
  );
  out.push("---");

  // ход и итог «Проставить»
  if (job) {
    const done = job.items.filter((i) => i.phase === "done").length;
    const M = job.items.length;
    if (jobActive) out.push(line(tr(`Проставляю… ${done} из ${M}`, `Applying… ${done} of ${M}`), { color: BLUE }));
    else out.push(line(tr(`Готово в ${done} из ${M} ${ruPlural(M, "вкладки", "вкладок", "вкладок")}`, `Done in ${done} of ${tabsN(M, "en")}`), { color: done === M ? GREEN : ORANGE }));
    for (const it of job.items) {
      const [icon, color] = phaseIcon[it.phase] || ["circle", null];
      const label = it.phase === "done" && it.waited ? (it.waited === "waitAnswer" ? tr("после ответа", "after your answer") : tr("после хода", "after the turn")) : phaseText(it);
      out.push(`--${line(`${it.label} — ${label}`, { sfimage: icon, color })}`);
    }
    if (jobActive) {
      if (job.items.some((i) => i.phase === "ready") && canType) out.push(line(tr("Продолжить", "Continue"), { action: "apply-continue" }));
      out.push(line(tr("Остановить", "Stop"), { action: "apply-stop" }));
    } else {
      // повторить — та же кнопка: она берёт вкладки, которые отличаются сейчас
      if (differ.length && canType) out.push(line(tr(`Повторить для ${differ.length}`, `Retry for ${differ.length}`), { action: "apply-all" }));
      out.push(line(tr("Убрать итог", "Dismiss"), { action: "apply-done" }));
    }
    out.push("---");
  }

  // открытые сессии
  out.push(line(r.sessionsUnknown ? tr("Открытые сессии", "Open sessions") : tr(`Открытые сессии · ${r.rows.length}`, `Open sessions · ${r.rows.length}`)));
  if (differ.length && canType && !jobActive) out.push(line(tr(`Проставить базовые всем · ${differ.length}`, `Apply base to all · ${differ.length}`), { action: "apply-all" }));
  if (r.sessionsUnknown) out.push(line(tr("Не удалось проверить, какие сессии живы (ps не ответил) — попробую в следующий раз", "Couldn't check which sessions are alive (ps didn't respond) — will retry"), { color: ORANGE }));
  if (!canType) out.push(line(tr("Без cmux только просмотр: набирать команды во вкладки не через что", "Without cmux it's view-only: there's no way to type into tabs"), { color: GREY }));
  if (!r.hubData) out.push(line(tr("Модель и effort вкладок покажет хаб новее; пока видно то, что проставил плагин", "A newer hub will show each tab's model and effort; for now you see what the plugin set"), { color: GREY }));
  if (!r.rows.length && !r.sessionsUnknown) out.push(line(tr("Открытых сессий нет", "No open sessions")));
  const queued = new Set(jobActive ? job.items.filter((i) => !FINAL.includes(i.phase)).map((i) => i.sessionId) : []);
  for (const x of r.rows) {
    out.push(line(x.label, { strip: "true" }));
    out.push(`--${line(stateText(x.status), { sfimage: x.status === "busy" ? "circle.fill" : x.status === "waiting" ? "questionmark.circle.fill" : "circle", color: x.status === "busy" ? BLUE : x.status === "waiting" ? ORANGE : null })}`);
    out.push(`--${line(x.now.model ? modelLabel(x.now.model) : "—", x.modelDiffers ? { color: ORANGE } : {})}`);
    out.push(`--${line(x.now.effort || "—", x.effortDiffers ? { color: ORANGE } : {})}`);
    let note = null;
    if (queued.has(x.sessionId)) note = tr("в очереди", "queued");
    else if (x.action === "fix") {
      if (!x.tab) note = tr("нет вкладки cmux", "no cmux tab");
      else if (x.now.verified === false) note = tr("подпись не подтверждена", "signature not verified");
      else if (canType && !jobActive) {
        out.push(`--${line(tr("Привести", "Fix"), { action: "apply", arg: x.sessionId })}`);
        continue;
      }
    } else if (x.differs || x.now.known) note = noteText(x.action);
    if (note) out.push(`--${line(note)}`);
  }
  if (r.rows.length) {
    out.push(line(tr("Подробности", "Details"), { details: "true" }));
    for (const x of r.rows) out.push(`--${line(`${x.label}: pid ${x.pid}${x.tab ? ` · ${x.tab.surfaceId}` : ""}`)}`);
  }
  return `${out.join("\n")}\n`;
}

// ---------- действия ----------
export const REFUSALS = {
  "bad-arg": ["Такого значения нет.", "No such value."],
  "no-claude": ["Claude Code не установлен.", "Claude Code isn't installed."],
  "settings-broken": ["~/.claude/settings.json — не JSON: исправьте файл, плагин его не трогает.", "~/.claude/settings.json isn't valid JSON: fix it, the plugin won't touch it."],
  "settings-unreadable": ["Не получается прочитать ~/.claude/settings.json.", "Can't read ~/.claude/settings.json."],
  "settings-link-broken": ["~/.claude/settings.json — ссылка в никуда: плагин не заменяет её файлом.", "~/.claude/settings.json is a dangling link: the plugin won't replace it with a file."],
  "plugin-failed": ["Сбой плагина — подробности в журнале хаба.", "Plugin failure — see the hub journal."],
  "settings-busy": ["Настройки менялись одновременно с плагином — попробуйте ещё раз.", "The settings changed at the same time — try again."],
  "not-allowed": ["Этот ключ настроек плагин не меняет.", "The plugin doesn't change this settings key."],
  "unknown-style": ["Такого стиля ответов нет среди установленных.", "No installed output style has this name."],
  "no-cmux": ["Нет cmux — набирать во вкладки не через что.", "No cmux — there's no way to type into tabs."],
  "no-session": ["Такой открытой сессии нет.", "No such open session."],
  "no-tab": ["Вкладка cmux этой сессии не найдена.", "This session's cmux tab wasn't found."],
  "session-busy": ["Сессия сейчас занята — наберу, когда освободится, через «Проставить всем».", "The session is busy — use Apply to all to type once it's free."],
  unverified: ["Подпись Claude Code у этой сессии не подтверждена — набирать не буду.", "This session's Claude Code signature isn't verified — not typing."],
  "input-text": ["В поле ввода есть текст — вкладку не трогаю.", "There's text in the input line — leaving the tab alone."],
  "not-confirmed": ["Сессия не подтвердила команду — проверьте вкладку.", "The session didn't confirm the command — check the tab."],
  "cmux-failed": ["cmux не ответил.", "cmux didn't respond."],
  "no-ps": ["Не удалось проверить, жива ли сессия (ps не ответил).", "Couldn't check whether the session is alive (ps didn't respond)."],
  "nothing-to-do": ["Все вкладки уже как базовые.", "Every tab already matches the base."],
  "job-running": ["Уже проставляю — дождитесь или остановите.", "Already applying — wait or stop it."],
  "plugin-busy": ["Плагин занят другой командой — попробуйте через несколько секунд.", "The plugin is busy with another command — try again in a few seconds."],
  "unknown-action": ["Плагин не знает такого действия.", "The plugin doesn't know this action."],
};
export function refusalMessage(reason, lang = envLang()) {
  const t = REFUSALS[reason];
  return t ? t[lang === "en" ? 1 : 0] : null;
}

function settingsAction(home, kind, value) {
  const r = writeSettings(home, (s) => opsFor(kind, value, s));
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

// Действия с вкладками и очередью — под замком состояния
function tabAction(id, arg, home) {
  if (!cmuxAvailable() && id !== "apply-stop" && id !== "apply-done") return { ok: false, reason: "no-cmux" };
  const settings = readSettings(home);
  if (!settings) return { ok: false, reason: "settings-broken" };
  const base = readBase(settings);
  const r = withLock(
    () => {
      const st = loadState();
      const save = () => saveState(st);
      if (id === "apply-stop" || id === "apply-done") {
        if (st.job) {
          if (id === "apply-stop" && !st.job.finishedAt) {
            markInterrupted(st.job);
            for (const it of st.job.items) if (PENDING.includes(it.phase)) Object.assign(it, { phase: "skipped", reason: "stopped" });
            st.job.finishedAt = Date.now();
          } else if (id === "apply-done") st.job = null;
          save();
        }
        return { ok: true };
      }
      const sessions = liveSessions(home);
      if (!sessions) return { ok: false, reason: "no-ps" };
      const hub = hubSessions();
      const deadline = ACTION_DEADLINE(); // от старта процесса: ожидание замка и ps уже в счёте
      if (id === "apply") {
        if (!SESSION_RE.test(String(arg || ""))) return { ok: false, reason: "bad-arg" };
        const sess = sessions.find((s) => s.sessionId === arg);
        if (!sess) return { ok: false, reason: "no-session" };
        const t = typeInto(sess, base, sessionNow(sess, base, hub, st), { deadline });
        if (t.phase === "waitTurn" || t.phase === "waitAnswer") return { ok: false, reason: "session-busy" };
        if (t.phase !== "done") return { ok: false, reason: t.reason || "cmux-failed" };
        st.applied[sess.sessionId] = { ...t.result, at: Date.now() };
        save();
        return { ok: true };
      }
      if (id === "apply-continue") {
        if (!st.job || st.job.finishedAt) return { ok: true };
        processJob(home, st, { deadline, allowType: true, base, sessions, save });
        save();
        return { ok: true };
      }
      // apply-all («Проставить базовые всем», «Повторить для K»): вкладки, которые отличаются сейчас
      if (st.job && !st.job.finishedAt) return { ok: false, reason: "job-running" };
      const todo = sessions.map((s) => rowFor(s, base, hub, st)).filter((x) => x.differs);
      if (!todo.length) return { ok: false, reason: "nothing-to-do" };
      st.job = { startedAt: Date.now(), target: { model: base.model, effort: base.effort }, items: todo.map((x) => ({ sessionId: x.sessionId, label: x.label, phase: "queued", reason: null, result: null })) };
      save();
      processJob(home, st, { deadline, allowType: true, base, sessions, save });
      save();
      return { ok: true };
    },
    { waitMs: 4000 },
  );
  return r === LOCKED ? { ok: false, reason: "plugin-busy" } : r;
}

// → { ok, reason? }
export function runAction([id, arg], { home = homedir() } = {}) {
  if (!claudeInstalled(home)) return { ok: false, reason: "no-claude" };
  if (id === "set-model") return MODELS.some((m) => m.id === arg) ? settingsAction(home, "model", arg) : { ok: false, reason: "bad-arg" };
  if (id === "set-effort") {
    if (!isLevel(arg)) return { ok: false, reason: "bad-arg" };
    const before = readBase(readSettings(home) || {});
    const r = settingsAction(home, "effort", arg);
    if (r.ok && before.envOverride) {
      // время ухода с env — для удаления ключа, когда закроются сессии, начатые раньше
      withLock(
        () => {
          const st = loadState();
          st.maxClearedAt = Date.now();
          saveState(st);
        },
        { waitMs: 4000 },
      );
    }
    return r;
  }
  if (id === "effort-max") return settingsAction(home, "max", null);
  if (id === "set-style") {
    if (typeof arg !== "string" || !STYLE_RE.test(arg)) return { ok: false, reason: "bad-arg" };
    const styles = listStyles(home, readSettings(home) || {});
    if (!styles.some((s) => s.name === arg)) return { ok: false, reason: "unknown-style" };
    return settingsAction(home, "style", arg);
  }
  if (id === "ultracode-on" || id === "ultracode-off") return settingsAction(home, "ultracode", id === "ultracode-on");
  if (["apply", "apply-all", "apply-continue", "apply-stop", "apply-done"].includes(id)) return tabAction(id, arg, home);
  return { ok: false, reason: "unknown-action" };
}

function main() {
  const ai = process.argv.indexOf("--action");
  if (ai >= 2) {
    let r;
    try {
      r = runAction(process.argv.slice(ai + 1));
    } catch {
      r = { ok: false, reason: "plugin-failed" };
    }
    const msg = r.ok ? null : refusalMessage(r.reason, envLang());
    process.stdout.write(r.ok ? "ok\n" : `${msg ? `message=${msg}\n` : ""}reason=${r.reason}\n`);
    process.exitCode = r.ok ? 0 : 3;
    return;
  }
  try {
    process.stdout.write(render(collect(), { lang: envLang() }));
  } catch (e) {
    LANG = envLang();
    process.stdout.write(`${line(tr("Claude Code: сбой плагина", "Claude Code: plugin failure"), { status: "error", event: "source-broken" })}\n---\n${clean(e?.message || e)}\n`);
  }
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
