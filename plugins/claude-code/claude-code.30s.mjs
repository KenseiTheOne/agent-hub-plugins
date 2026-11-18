#!/usr/bin/env node
// <agenthub.title>Claude Code Настройки</agenthub.title>
// <agenthub.title lang="en">Claude Code Settings</agenthub.title>
// <agenthub.version>1.4.1</agenthub.version>
// <agenthub.contract>3</agenthub.contract>
// <agenthub.icon symbol="text.alignleft" color="#D97757"></agenthub.icon>
// <agenthub.desc>Настройки Claude Code для новых сессий (модель, контекст 1 млн, effort, стиль ответов, ultracode) и открытые вкладки: какие не как базовые, и кнопка привести их</agenthub.desc>
// <agenthub.desc lang="en">Claude Code settings for new sessions (model, 1M context, effort, output style, ultracode) and open tabs: which differ from the base, and a button to bring them in line</agenthub.desc>
// <agenthub.status value="ok" label="Настройки Claude">Базовые настройки прочитаны</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Claude settings">Base settings are read</agenthub.status>
// <agenthub.status value="wait" label="Проставляю во вкладки">Идёт «Проставить базовые»: часть вкладок ждёт конца хода или вашего ответа</agenthub.status>
// <agenthub.status value="wait" lang="en" label="Applying to tabs">Apply base is running: some tabs wait for the turn to end or for your answer</agenthub.status>
// <agenthub.status value="error" label="Сбой плагина или настроек">~/.claude/settings.json — не JSON (плагин его не трогает) или сбой самого плагина</agenthub.status>
// <agenthub.status value="error" lang="en" label="Plugin or settings failure">~/.claude/settings.json isn't valid JSON (the plugin leaves it alone) or the plugin itself failed</agenthub.status>
// <agenthub.status value="unknown" label="Claude Code не найден">Claude Code не установлен</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Claude Code not found">Claude Code isn't installed</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.requires name="Claude Code" url="https://code.claude.com/docs" check="~/.claude/settings.json">агент, чьи настройки показывает и меняет плагин</agenthub.requires>
// <agenthub.requires lang="en" name="Claude Code">the agent whose settings this plugin shows and changes</agenthub.requires>
// <agenthub.fsRead>~/.claude/settings.json — базовые настройки новых сессий: model, effortLevel, modelSettings, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL, env.CLAUDE_CODE_DISABLE_1M_CONTEXT (остальные ключи не показываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/settings.json — base settings for new sessions: model, effortLevel, modelSettings, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL, env.CLAUDE_CODE_DISABLE_1M_CONTEXT (other keys aren't shown)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/output-styles — ваши стили ответов для списка «Стиль ответов» (только имя из заголовка файла)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/output-styles — your output styles for the Output style list (only the name from the file header)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache — стили ответов включённых плагинов Claude Code (имя плагина и имя стиля)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache — output styles of enabled Claude Code plugins (plugin name and style name)</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/sessions/*.json — открытые сессии: pid, папка, имя, состояние (простаивает, работает, ждёт ответа), когда начата (ключи сессий не открываются)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/sessions/*.json — open sessions: pid, folder, name, state (idle, working, waiting for you), when started (session keys are never opened)</agenthub.fsRead>
// <agenthub.fsRead>~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude — установлен ли Claude Code</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude — whether Claude Code is installed</agenthub.fsRead>
// <agenthub.fsRead>$AGENTHUB_CLAUDE_SESSIONS_FILE — модель и effort открытых сессий от хаба (только метаданные, без текста переписки)</agenthub.fsRead>
// <agenthub.fsRead lang="en">$AGENTHUB_CLAUDE_SESSIONS_FILE — model and effort of open sessions from the hub (metadata only, no conversation text)</agenthub.fsRead>
// <agenthub.fsWrite>~/.claude/settings.json — только ключи model, effortLevel, modelSettings.*.effortLevel, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL и env.CLAUDE_CODE_DISABLE_1M_CONTEXT, по вашей кнопке; остальное не меняется</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/settings.json — only the keys model, effortLevel, modelSettings.*.effortLevel, outputStyle, ultracode, env.CLAUDE_CODE_EFFORT_LEVEL and env.CLAUDE_CODE_DISABLE_1M_CONTEXT, on your click; nothing else changes</agenthub.fsWrite>
// <agenthub.fsWrite>~/.claude/backups/settings.json.*-agenthub — копия настроек до каждой правки (хранятся последние 20)</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/backups/settings.json.*-agenthub — a copy of the settings before each change (the last 20 are kept)</agenthub.fsWrite>
// <agenthub.exec>/bin/ps -o pid=,lstart=,comm= -p … — жива ли сессия и это ли Claude Code (без аргументов и окружения процесса)</agenthub.exec>
// <agenthub.exec lang="en">/bin/ps -o pid=,lstart=,comm= -p … — whether a session is alive and is Claude Code (no process arguments or environment)</agenthub.exec>
// <agenthub.terminal>send /model /effort — набрать во вкладку открытой сессии только /model и /effort с базовыми значениями — по вашей кнопке «Привести» или «Проставить базовые»; хаб сам проверяет, что сессия свободна, поле ввода пустое и это подписанный Claude Code, и жмёт Enter</agenthub.terminal>
// <agenthub.terminal lang="en">send /model /effort — type only /model and /effort with the base values into an open session's tab — on your Fix or Apply base click; the hub checks the session is free, the input line is empty and it's signed Claude Code, and presses Enter</agenthub.terminal>
// <agenthub.effects>session.focus</agenthub.effects>
// <agenthub.fsRead>$AGENTHUB_CLAUDE_MODELS_FILE — список моделей Claude, доступных вашему входу, от хаба: из него строятся кнопки «Модель», новая модель появляется сама</agenthub.fsRead>
// <agenthub.fsRead lang="en">$AGENTHUB_CLAUDE_MODELS_FILE — the Claude models your sign-in can use, from the hub: the Model buttons are built from it, a new model shows up by itself</agenthub.fsRead>
// <agenthub.watch>~/.claude/settings.json — настройки поменяли (вы, /model, /effort или другой плагин)</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/settings.json — the settings changed (by you, /model, /effort or another plugin)</agenthub.watch>
// <agenthub.watch>~/.claude/sessions/*.json — сессия освободилась: можно набрать отложенное</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/sessions/*.json — a session became free: a deferred command can be typed</agenthub.watch>
// <agenthub.watch>$AGENTHUB_CLAUDE_SESSIONS_FILE — у вкладки сменились модель или effort</agenthub.watch>
// <agenthub.watch lang="en">$AGENTHUB_CLAUDE_SESSIONS_FILE — a tab's model or effort changed</agenthub.watch>
// <agenthub.watch>$AGENTHUB_CLAUDE_MODELS_FILE — хаб обновил список моделей</agenthub.watch>
// <agenthub.watch lang="en">$AGENTHUB_CLAUDE_MODELS_FILE — the hub refreshed the model list</agenthub.watch>
// <agenthub.action id="set-model" level="immediate" arg="model:^(?:default|claude-[a-z]+-[0-9]+(?:-[0-9]+)?)$" title="Модель для новых сессий — из списка на странице (Opus тратит лимит быстрее остальных; default — модель Claude Code по умолчанию)" title-en="Model for new sessions — one from the page's list (Opus uses the limit faster than the others; default — Claude Code's default model)">claude-code.30s.mjs --action set-model {model}</agenthub.action>
// <agenthub.action id="set-model-id" level="immediate" arg="model:^claude-[a-z]+-[0-9]{1,2}(?:-[0-9]{1,2})?$" input="claude-fable-5-2" maxLength="40" title="Другая модель для новых сессий — по идентификатору, который вы вводите сами (как в /model; для модели, которой ещё нет в списке; существует ли такая модель, плагин проверить не может)" title-en="Another model for new sessions — by the id you type yourself (as in /model; for a model the list doesn't have yet; the plugin can't check that such a model exists)">claude-code.30s.mjs --action set-model-id</agenthub.action>
// <agenthub.action id="set-effort" level="immediate" arg="level:^(?:low|medium|high|xhigh)$" title="Effort для новых сессий (чем выше, тем быстрее уходит лимит)" title-en="Effort for new sessions (the higher, the faster the limit goes)">claude-code.30s.mjs --action set-effort {level}</agenthub.action>
// <agenthub.action id="effort-max" level="confirm-cost" title="Поставить effort max" title-en="Set effort to max" cost="лимит подписки уходит в разы быстрее; действует сразу во всех вкладках, включая открытые, и перебивает /effort в них" cost-en="the subscription limit runs out several times faster; it applies at once in every tab, open ones included, and overrides /effort there">claude-code.30s.mjs --action effort-max</agenthub.action>
// <agenthub.action id="set-style" level="immediate" arg="style:^[A-Za-z0-9][A-Za-z0-9 _.:()-]{0,79}$" title="Стиль ответов" title-en="Output style">claude-code.30s.mjs --action set-style {style}</agenthub.action>
// <agenthub.action id="ultracode-on" level="immediate" title="Включить ultracode для новых сессий (многоагентные воркфлоу — лимит уходит быстрее)" title-en="Turn on ultracode for new sessions (multi-agent workflows — the limit goes faster)">claude-code.30s.mjs --action ultracode-on</agenthub.action>
// <agenthub.action id="ultracode-off" level="immediate" title="Выключить ultracode для новых сессий" title-en="Turn off ultracode for new sessions">claude-code.30s.mjs --action ultracode-off</agenthub.action>
// <agenthub.action id="context-1m-on" level="immediate" title="Включить контекст 1 млн токенов для новых сессий (длинные сессии тратят лимит быстрее)" title-en="Turn on the 1M-token context for new sessions (long sessions use the limit faster)">claude-code.30s.mjs --action context-1m-on</agenthub.action>
// <agenthub.action id="context-1m-off" level="immediate" title="Выключить контекст 1 млн токенов для новых сессий: окно 200 тыс." title-en="Turn off the 1M-token context for new sessions: a 200K window">claude-code.30s.mjs --action context-1m-off</agenthub.action>
// <agenthub.action id="apply" level="confirm-cost" arg="session:^[0-9a-fA-F-]{36}$" title="Привести вкладку к базовым: набрать в неё /model и /effort" title-en="Bring the tab to the base: type /model and /effort into it" cost="из хаба не отменить: прежние модель и effort вкладки вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tab's previous model and effort">claude-code.30s.mjs --action apply {session}</agenthub.action>
// <agenthub.action id="apply-all" level="confirm-cost" title="Проставить базовые во все вкладки не как базовые: набрать в них /model и /effort — свободные сейчас, занятые после хода или вашего ответа; вкладку с текстом в поле ввода пропустить" title-en="Apply base to every tab that differs: type /model and /effort — free tabs now, busy ones after the turn or your answer; skip a tab with text in its input line" cost="из хаба не отменить: прежние модель и effort вкладок вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tabs' previous model and effort">claude-code.30s.mjs --action apply-all</agenthub.action>
// <agenthub.action id="apply-continue" level="confirm-cost" title="Набрать отложенные /model и /effort во вкладки, которые освободились" title-en="Type the deferred /model and /effort into tabs that became free" cost="из хаба не отменить: прежние модель и effort вкладок вернёте только сами" cost-en="can't be undone from the hub: only you can bring back the tabs' previous model and effort">claude-code.30s.mjs --action apply-continue</agenthub.action>
// <agenthub.action id="apply-stop" level="immediate" title="Остановить «Проставить базовые»" title-en="Stop Apply base">claude-code.30s.mjs --action apply-stop</agenthub.action>
// <agenthub.action id="apply-done" level="immediate" title="Убрать итог «Проставить базовые»" title-en="Dismiss the Apply base result">claude-code.30s.mjs --action apply-done</agenthub.action>
//
// The "Claude Code" plugin (agent-hub-plugins registry, tier official). It does the work itself; the hub is the sandbox
// and the permissions:
//   • reads the base settings for new sessions from ~/.claude/settings.json and writes only an allow list of keys there
//     (ALLOWED_PATHS below): atomically, with a copy before the change and a check that the file didn't change between
//     the read and the write;
//   • shows open sessions (~/.claude/sessions), their model and effort, and types /model and /effort into their tab
//     through the hub's terminal (contract 3: POST /terminal/send-text on $AGENTHUB_HUB_SOCKET, permission
//     <agenthub.terminal>) — only these two commands and only into an idle session; the hub finds the tab, checks the
//     Claude Code signature, the pid and the empty input line, and presses Enter. The plugin knows nothing about the
//     specific terminal; switching to the tab is the hub effect session.focus <sessionId>.
// Each session's model and effort are visible in its transcript, but a registry plugin may not read transcripts: the
// hub provides this data in the file $AGENTHUB_CLAUDE_SESSIONS_FILE (modelId — the model id, at — when it was written).
// The plugin remembers what it set together with the time typing started: a newer hub record is already the session's
// answer, and that is what is shown.
// The model list isn't a table in the code: the hub asks Anthropic which models the sign-in can use and gives the list
// in the file $AGENTHUB_CLAUDE_MODELS_FILE (hub 0.1.5+); the buttons are built from it — see knownModels below.
// Deferred typing ("after the turn", "after your answer") is done by the plugin itself from a regular run, only when the
// hub isn't paused (AGENTHUB_PAUSED=0); otherwise deferred typing waits for the Continue button (an action the hub's
// pause blocks).
// Claude Code 2.1.3xx facts (checked against the installed version):
//   • effortLevel in ~/.claude/settings.json has no effect for Opus 5.5 and newer — new sessions take effort from
//     modelSettings["<model id>"].effortLevel; that's why the plugin writes both keys;
//   • Claude Code silently drops effortLevel "max": max holds only via env.CLAUDE_CODE_EFFORT_LEVEL=max, and live
//     sessions pick up env from settings.json at once (hence max needs confirmation); live sessions don't notice a
//     removed env key — leaving max writes "" (empty = "not set", not "auto"/"unset": that would be a forced auto), and
//     the plugin deletes the key itself once no live sessions started before leaving max remain;
//   • outputStyle from ~/.claude/settings.json changes open sessions too — from their next message;
//   • Claude Code itself saves /model and /effort typed into a tab as the base: the plugin types exactly the base
//     values as they are written (an alias like opus[1m] stays an alias).
// Actions: `--action <id> [<argument>]`; a refusal is exit code 3, a line message=<explanation> and last reason=<code>.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { closeSync, copyFileSync, existsSync, fchmodSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Process start time: the core kills a regular run and an action after the hub's timeouts (standardTimeoutMs and
// actionTimeoutMs — hub settings; the contract doesn't pass their values to a plugin), counted from the start. The
// plugin keeps its own budgets below the hub's defaults.
const T0 = Date.now();
const RUN_DEADLINE = () => T0 + 4000;
const ACTION_DEADLINE = () => T0 + 26_000;

// ---------- language ----------
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
let LANG = envLang();
const tr = (ru, en) => (LANG === "en" ? en : ru);
// The popover tile caption: "Claude Code Settings" does not fit the tile (~110 pt, one line)
const TILE_LABEL = () => tr("Настройки", "Settings");
function ruPlural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
// "N tabs" in the current language (Russian plural forms included)
export function tabsN(n, lang = LANG) {
  return lang === "en" ? `${n} ${n === 1 ? "tab" : "tabs"}` : `${n} ${ruPlural(n, "вкладка", "вкладки", "вкладок")}`;
}

// ---------- models and effort ----------
// The "Model" segment isn't a fixed table: it is built on every run from the hub's model list, and without it — from
// the models this machine has met (knownModels below). SEED is only the floor for that second case.
const SEED = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"];
const FAMILY_ORDER = ["opus", "sonnet", "haiku", "fable"];
// A model id the list can compare: claude-<family>-<major>[-<minor>], one or two digits each. A longer number is a date
// (claude-opus-5-20261001), not a version — it must not become "the newest Opus".
const MODEL_PARTS_RE = /^claude-([a-z]+)-([0-9]{1,2})(?:-([0-9]{1,2}))?$/;
export function parseModel(id) {
  const m = typeof id === "string" ? MODEL_PARTS_RE.exec(id) : null;
  return m ? { id, family: m[1], major: Number(m[2]), minor: m[3] === undefined ? -1 : Number(m[3]) } : null;
}
const cmpVersion = (a, b) => a.major - b.major || a.minor - b.minor;
// The 1M-token context window (Claude Code docs, "Extended context"): Fable, Sonnet 5+, Haiku 5.5+ and Opus 4.7+ have
// it without asking — only env.CLAUDE_CODE_DISABLE_1M_CONTEXT=1 takes it away; Opus 4.6 and Sonnet 4.6 get it with the
// [1m] suffix on the model; older models don't have it. A family the plugin has never met is taken as a new one.
const atLeast = (p, major, minor) => p.major > major || (p.major === major && p.minor >= minor);
export function wideContext(id) {
  const p = parseModel(id);
  if (!p) return "none";
  if (p.family === "opus") return atLeast(p, 4, 7) ? "default" : atLeast(p, 4, 6) ? "suffix" : "none";
  if (p.family === "sonnet") return p.major >= 5 ? "default" : atLeast(p, 4, 6) ? "suffix" : "none";
  if (p.family === "haiku") return atLeast(p, 5, 5) ? "default" : "none";
  return "default";
}
const WIDE = "[1m]";
const envOn = (v) => typeof v === "string" && v !== "" && !["0", "false", "no", "off"].includes(v.toLowerCase());
const familyRank = (f) => (FAMILY_ORDER.includes(f) ? FAMILY_ORDER.indexOf(f) : FAMILY_ORDER.length);
const newestPerFamily = (ids) => {
  const newest = new Map();
  for (const id of ids) {
    const p = parseModel(id);
    if (!p) continue;
    const cur = newest.get(p.family);
    if (!cur || cmpVersion(p, cur) > 0) newest.set(p.family, p);
  }
  return [...newest.values()];
};
// The models of the "Model" segment → { page: [{ id, label }], remember: [id] }.
//   listed     — the hub's model list (hubModels): what Anthropic offers this sign-in right now; null — no such data;
//   seen       — ids known to exist without it: an open session runs on it;
//   remembered — the same from earlier runs (state.json): a model doesn't vanish when its last tab closes;
//   base       — the model from settings.json.
// With the hub's list the page is the newest version of each family in it, and nothing else: a model the account no
// longer has isn't offered. Without it (an older hub, the service is off, never fetched) — the newest of each family
// among SEED, seen and remembered. The base model is added as it is — older, or never met — but only as one more item:
// a value typed into settings.json by hand never hides the newest model that is known to exist. remember — what to keep
// in state.json for the case without the hub's list (the newest met ones that aren't in SEED).
export function knownModels({ listed = null, seen = [], remembered = [], base = null } = {}) {
  const met = newestPerFamily([...SEED, ...remembered, ...seen]);
  const remember = met.map((p) => p.id).filter((id) => !SEED.includes(id)).sort();
  const offered = listed ? newestPerFamily(listed) : [];
  const list = offered.length ? offered : met;
  const b = parseModel(base);
  if (b && !list.some((p) => p.id === b.id)) list.push(b);
  list.sort((x, y) => familyRank(x.family) - familyRank(y.family) || (x.family < y.family ? -1 : x.family > y.family ? 1 : 0) || cmpVersion(x, y));
  return { page: list.map((p) => ({ id: p.id, label: modelLabel(p.id) })), remember };
}
// /model aliases → id, as Claude Code resolves them (2.1.323: /model fable gives Fable 5.1, not the newest Fable).
// Only for a settings.json written by hand: the plugin itself always writes and types full ids. opusplan/default have
// no single id.
const ALIASES = { opus: "claude-opus-5-5", best: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5", fable: "claude-fable-5-1" };
// The model when there's no model key (the Anthropic API default) — for effort: which modelSettings entry it follows
export const DEFAULT_MODEL = "claude-opus-5-5";
// Effort by model generation. From these versions on a model ignores effortLevel in ~/.claude/settings.json (only its
// modelSettings entry works) and starts at medium; older ones follow effortLevel and start at high. A family that isn't
// listed appeared after this table was written — the new scheme.
const NEW_EFFORT_FROM = { opus: [5, 5], sonnet: [5, 5], haiku: [5, 5], fable: [5, 2], mythos: [5, 2] };
export function newEffort(id) {
  const p = parseModel(id);
  if (!p) return false;
  const from = NEW_EFFORT_FROM[p.family];
  return !from || p.major > from[0] || (p.major === from[0] && p.minor >= from[1]);
}
// The model's default effort (without modelSettings and without the legacy effortLevel); null — not a model id
const defaultEffort = (id) => (parseModel(id) ? (newEffort(id) ? "medium" : "high") : null);
export const LEVELS = ["low", "medium", "high", "xhigh"];
const ALL_LEVELS = [...LEVELS, "max"];
const MODEL_ID_RE = /^claude-[a-z]+-[0-9]+(?:-[0-9]+)?$/;
const MODEL_ARG_RE = /^(?:claude-[a-z]+-[0-9]+(?:-[0-9]+)?|opus|sonnet|haiku|fable|best)(?:\[1m\])?$/;
const SESSION_RE = /^[0-9a-fA-F-]{36}$/;
const STYLE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.:()-]{0,79}$/;

// Value of the model key → model id or null (no key, default, opusplan, unknown)
export function canonModel(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/\[1m\]$/, "");
  if (ALIASES[s]) return ALIASES[s];
  return MODEL_ID_RE.test(s) ? s : null;
}
// "claude-fable-5-2" → "Fable 5.2"; not an id the list understands — as is
export function modelLabel(id) {
  if (!id) return tr("по умолчанию", "default");
  const p = parseModel(id);
  return p ? `${p.family[0].toUpperCase()}${p.family.slice(1)} ${p.major}${p.minor < 0 ? "" : `.${p.minor}`}` : id;
}
const isLevel = (v) => typeof v === "string" && LEVELS.includes(v);
// env.CLAUDE_CODE_EFFORT_LEVEL as Claude Code understands it (Hw): case doesn't matter, spaces aren't trimmed,
// med = medium; a level or max overrides everything; auto/unset — everyone gets their model's default effort; an
// integer overrides (the level is unknown, shown as is); anything else (ultracode, junk) Claude Code ignores.
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

// ---------- base settings ----------
export const BUILTIN_STYLES = ["Default", "Proactive", "Concise", "Explanatory", "Learning"];

// settings (object) → the base for new sessions
export function readBase(s) {
  const env = s && typeof s.env === "object" && s.env ? s.env : {};
  const envRaw = typeof env.CLAUDE_CODE_EFFORT_LEVEL === "string" ? env.CLAUDE_CODE_EFFORT_LEVEL : undefined;
  const ev = envEffort(envRaw);
  const model = canonModel(s?.model);
  const em = model || DEFAULT_MODEL; // the model effort is computed for
  const ms = s && typeof s.modelSettings === "object" && s.modelSettings ? s.modelSettings : {};
  let effort = null;
  let effortFrom = null;
  if (ev.kind === "level" || ev.kind === "number") [effort, effortFrom] = [ev.value, "env"];
  else if (ev.kind === "auto") [effort, effortFrom] = ["auto", "env"];
  else if (isLevel(ms[em]?.effortLevel)) [effort, effortFrom] = [ms[em].effortLevel, "modelSettings"];
  else if (!newEffort(em) && isLevel(s?.effortLevel)) [effort, effortFrom] = [s.effortLevel, "effortLevel"];
  else if (defaultEffort(em)) [effort, effortFrom] = [defaultEffort(em), "default"];
  const modelRaw = typeof s?.model === "string" ? s.model.trim().toLowerCase() : null;
  const wideOff = envOn(env.CLAUDE_CODE_DISABLE_1M_CONTEXT);
  const wideKind = wideContext(em);
  return {
    // the 1M-token window for new sessions: not switched off, and the model has it by itself or the [1m] suffix asks for it
    context1m: !wideOff && (wideKind === "default" || (wideKind === "suffix" && Boolean(modelRaw?.endsWith(WIDE)))),
    context1mKind: wideKind,
    model,
    // what to type in /model: the value as written (alias, [1m]) if /model accepts it; otherwise the id
    modelArg: model ? (modelRaw && MODEL_ARG_RE.test(modelRaw) ? modelRaw : model) : null,
    effort,
    effortFrom,
    maxActive: ev.kind === "level" && ev.value === "max",
    envOverride: ev.kind !== "none", // env is set and overrides effort in every session
    envAuto: ev.kind === "auto",
    maxPendingClear: envRaw === "",
    outputStyle: typeof s?.outputStyle === "string" && s.outputStyle && s.outputStyle.toLowerCase() !== "default" ? s.outputStyle : "Default",
    ultracode: s?.ultracode === true,
  };
}

// ---------- writing settings: the allow list ----------
// Key path → whether it may be changed. The plugin NEVER touches anything else in settings.json.
const ALLOWED_PATHS = [
  /^model$/,
  /^effortLevel$/,
  /^modelSettings\.claude-[a-z]+-[0-9]+(?:-[0-9]+)?\.effortLevel$/,
  /^outputStyle$/,
  /^ultracode$/,
  /^env\.CLAUDE_CODE_EFFORT_LEVEL$/,
  /^env\.CLAUDE_CODE_DISABLE_1M_CONTEXT$/,
];
export function pathAllowed(path) {
  return ALLOWED_PATHS.some((r) => r.test(path.join(".")));
}

// A change is a list of operations { path: [...], value } | { path: [...], delete: true }. The allow list is checked here.
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

// Operations for each button, from the current settings and the choice. → ops (may be empty — "already so")
export function opsFor(kind, value, s) {
  const base = readBase(s);
  const ms = s && typeof s.modelSettings === "object" && s.modelSettings ? s.modelSettings : {};
  const ops = [];
  if (kind === "model") {
    // only the shape is checked here; that the model is one from the page's list — in runAction (set-model)
    if (value !== "default" && !parseModel(value)) throw new Error("bad-arg");
    // "default": no model key — Claude Code takes its own default model (DEFAULT_MODEL)
    if (value === "default") {
      if (s?.model !== undefined) ops.push({ path: ["model"], delete: true });
      value = DEFAULT_MODEL;
    } else {
      // the 1M window stays on across a model change: a model that needs the [1m] suffix for it gets the suffix
      const written = base.context1m && wideContext(value) === "suffix" ? value + WIDE : value;
      if (s?.model !== written) ops.push({ path: ["model"], value: written });
    }
    // effort carries over to the new model, otherwise it would silently start from its own default
    if (isLevel(base.effort) && ["modelSettings", "effortLevel"].includes(base.effortFrom) && !isLevel(ms[value]?.effortLevel)) ops.push({ path: ["modelSettings", value, "effortLevel"], value: base.effort });
  } else if (kind === "effort") {
    if (!isLevel(value)) throw new Error("bad-arg");
    // env (max or another level) overrides everything: leaving it writes an empty string
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
  } else if (kind === "context1m") {
    // on: nothing switches it off, and a model that needs the suffix has it; off: no suffix, and a model that has the
    // window by itself is held at 200K by the env key (it applies to every model, so it is written only then)
    const em = base.model || DEFAULT_MODEL;
    const raw = typeof s?.model === "string" ? s.model.trim() : null;
    const bare = raw && raw.toLowerCase().endsWith(WIDE) ? raw.slice(0, -WIDE.length) : raw;
    if (value) {
      if (base.context1mKind === "none") throw new Error("no-1m");
      if (s?.env?.CLAUDE_CODE_DISABLE_1M_CONTEXT !== undefined) ops.push({ path: ["env", "CLAUDE_CODE_DISABLE_1M_CONTEXT"], delete: true });
      if (base.context1mKind === "suffix" && raw === bare) ops.push({ path: ["model"], value: em + WIDE });
    } else {
      if (raw !== bare) ops.push({ path: ["model"], value: bare });
      if (base.context1mKind === "default" && !envOn(s?.env?.CLAUDE_CODE_DISABLE_1M_CONTEXT)) ops.push({ path: ["env", "CLAUDE_CODE_DISABLE_1M_CONTEXT"], value: "1" });
    }
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

// Settings text → object; an empty file → {}; not an object → null
function parseSettings(text) {
  if (text === null || !String(text).trim()) return {};
  try {
    const o = JSON.parse(text);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

// A new temp file next to `path` (the rename has to stay on one volume): a random name, created exclusively — a file
// or a link planted under a guessable name is never written through — and owner-only while it is being written (the
// settings hold your env). → { tmp, fd }
function openTemp(path) {
  for (let i = 0; ; i++) {
    const tmp = `${path}.agenthub-${randomBytes(8).toString("hex")}.tmp`;
    try {
      return { tmp, fd: openSync(tmp, "wx", 0o600) };
    } catch (e) {
      if (e.code !== "EEXIST" || i >= 4) throw e;
    }
  }
}

// Read → change (opsFn) → backup → write to a temp file next to it → check the file didn't change → rename.
// The temp file is removed on every path that doesn't end in the rename (a concurrent change, a failed write).
// Changed between the read and the write — re-read and retry (up to 3 times), otherwise refuse with settings-busy.
// settings.json is a symlink (dotfiles)? The file it points to is written; the link itself stays.
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
      return { ok: false, reason: "settings-link-broken" }; // dangling link: don't replace it with a regular file
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
      return { ok: false, reason: String(e.message).startsWith("not-allowed") ? "not-allowed" : e.message === "no-1m" ? "no-1m" : "bad-arg" };
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
    const { tmp, fd } = openTemp(path);
    let renamed = false;
    try {
      try {
        writeFileSync(fd, out);
        fchmodSync(fd, mode); // the target's previous permissions, set only once the text is in
      } finally {
        closeSync(fd);
      }
      if (beforeRename) beforeRename(attempt);
      let now2 = null;
      try {
        now2 = readFileSync(path, "utf8");
      } catch {}
      if (now2 !== text) continue;
      renameSync(tmp, path);
      renamed = true;
      return { ok: true, changed: true, ops };
    } finally {
      if (!renamed) rmSync(tmp, { force: true });
    }
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

// ---------- output styles ----------
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
// Whether p is inside the root directory (no escape via .. or links)
function inside(root, p) {
  try {
    const rel = relative(realpathSync(root), realpathSync(p));
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
  } catch {
    return false;
  }
}
// → [{ name, source: builtin|user|plugin }] — built-in, ~/.claude/output-styles, styles of enabled plugins
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

// ---------- environment: Claude Code, ps, the hub ----------
// Test doubles: AGENTHUB_TEST_BIN_DIR/ps. In test mode the real programs are never used.
const testMode = () => Boolean(process.env.AGENTHUB_TEST_BIN_DIR);
function bin(name, real) {
  const dir = process.env.AGENTHUB_TEST_BIN_DIR;
  return dir ? join(dir, name) : real;
}
const PS = () => bin("ps", "/bin/ps");

// The hub's terminal (contract 3): POST to the $AGENTHUB_HUB_SOCKET socket from the plugin's own process (a child such
// as curl would get 403 terminal:not-a-plugin). No socket (Windows, a hub without it) — no way to type, view only.
export function hubSocket() {
  const p = process.env.AGENTHUB_HUB_SOCKET;
  return typeof p === "string" && p.startsWith("/") ? p : null;
}
// → { status, body } | { status: 0, error }. timeoutMs — how long to wait for the answer (after it the typing outcome is unknown).
export function hubPost(path, payload, { timeoutMs = 20_000 } = {}) {
  const socketPath = hubSocket();
  if (!socketPath) return Promise.resolve({ status: 0, error: "no-socket" });
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const rq = request({ socketPath, path, method: "POST", timeout: Math.max(200, timeoutMs), headers: { Host: "hub", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      let t = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        t += c;
        if (t.length > 64 * 1024) rq.destroy();
      });
      res.on("end", () => {
        let body = null;
        try {
          body = JSON.parse(t);
        } catch {}
        finish({ status: res.statusCode, body });
      });
    });
    rq.on("timeout", () => {
      rq.destroy();
      finish({ status: 0, error: "timeout" });
    });
    rq.on("error", (e) => finish({ status: 0, error: e?.code || "error" }));
    rq.end(data);
  });
}
const sleepAsync = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// Whether Claude Code is installed: native install, Homebrew/npm, or its settings exist
export function claudeInstalled(home) {
  if (existsSync(join(home, ".local", "bin", "claude")) || existsSync(join(home, ".claude", "settings.json"))) return true;
  if (!testMode() && ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].some((p) => existsSync(p))) return true;
  try {
    return readdirSync(join(home, ".local", "share", "claude", "versions")).some((n) => /^\d+\.\d+\.\d+/.test(n));
  } catch {
    return false;
  }
}
// Waiting for the state lock
function realSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
const CLAUDE_EXE = /(?:^|\/)claude(?:-code)?$|\/claude\/versions\/[^/]+$|@anthropic-ai\/claude-code\//;
const lstartKey = (s) => String(s || "").trim().replace(/\s+/g, " ");

// pid → { lstart, comm } for live processes. ps in UTC: that's how Claude Code itself writes procStart.
// ps failed (no program, timeout, signal, code > 1) — null: "unknown", not "nobody there".
export function processTable(pids) {
  const list = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  const out = new Map();
  if (!list.length) return out;
  let text = "";
  try {
    text = execFileSync(PS(), ["-o", "pid=,lstart=,comm=", "-p", list.join(",")], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", TZ: "UTC", LC_ALL: "C" }, timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    // ps exits with 1 if some pids are missing — the live ones are printed anyway
    if (e.status !== 1 || e.signal) return null;
    text = String(e.stdout || "");
  }
  for (const l of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(.+?)\s*$/.exec(l);
    if (m) out.set(Number(m[1]), { lstart: lstartKey(m[2]), comm: m[3] });
  }
  return out;
}

// ---------- sessions ----------
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
// Only the needed fields: ids, state and time (conversation text isn't stored there, and isn't taken either)
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
      // an unknown state counts as "working": nothing is typed into such a tab
      status: ["idle", "busy", "waiting"].includes(j.status) ? j.status : "busy",
      startedAt: Number.isFinite(j.startedAt) ? j.startedAt : null,
      procStart: typeof j.procStart === "string" ? j.procStart : null,
    });
  }
  return out;
}
// The hub's file with the sessions' model and effort (contract 3): $AGENTHUB_CLAUDE_SESSIONS_FILE. modelId is always
// the id (model holds the display name after /model); the plugin doesn't take the tabs (surfaceId/workspaceId are
// terminal fields).
export function hubSessions() {
  const p = process.env.AGENTHUB_CLAUDE_SESSIONS_FILE;
  if (!p) return null;
  const j = readJson(p);
  const out = new Map();
  for (const s of Array.isArray(j?.sessions) ? j.sessions : []) {
    if (!s || !SESSION_RE.test(String(s.sessionId || ""))) continue;
    out.set(s.sessionId, { model: canonModel(s.modelId) ?? canonModel(s.model), effort: ALL_LEVELS.includes(s.effort) ? s.effort : null, verified: s.verified === true ? true : s.verified === false ? false : null, at: Date.parse(s.at) || 0 });
  }
  return out;
}
// The hub's model list (hub 0.1.5+): $AGENTHUB_CLAUDE_MODELS_FILE — { error, models: [{ id, name?, created_at? }] },
// what Anthropic offers the Claude Code sign-in, refreshed by the hub. Only the ids the list can compare are taken (a
// dated id isn't a version). On an error the hub keeps the previous list, so `error` isn't looked at. null — no
// variable (an older hub or the service is off), no file yet, another shape or nothing usable: the plugin falls back
// to the models it has met.
export function hubModels() {
  const p = process.env.AGENTHUB_CLAUDE_MODELS_FILE;
  if (!p) return null;
  const j = readJson(p);
  const out = [];
  for (const m of Array.isArray(j?.models) ? j.models.slice(0, 200) : []) {
    if (parseModel(m?.id)) out.push(m.id);
  }
  return out.length ? out : null;
}
// Models known to exist without the hub's list: the ones open sessions run on (the hub's sessions file)
export function seenModels(hub = hubSessions()) {
  return [...(hub?.values() ?? [])].map((x) => x.model).filter(Boolean);
}

// Live Claude Code sessions: a session file + the process is alive, the same one (start time) and it is Claude Code.
// null — couldn't check (ps failed).
export function liveSessions(home, { procs = null } = {}) {
  const files = sessionFiles(home);
  const table = procs || processTable(files.map((f) => f.pid));
  if (!table) return null;
  const out = [];
  for (const f of files) {
    const p = table.get(f.pid);
    if (!p || !CLAUDE_EXE.test(p.comm)) continue;
    if (f.procStart && lstartKey(f.procStart) !== p.lstart) continue;
    out.push({ ...f, label: f.name || (f.cwd ? basename(f.cwd) : f.sessionId.slice(0, 8)) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.pid - b.pid);
}

// ---------- plugin state (PluginData) and the lock ----------
// state.json is changed by both the regular run (the queue) and actions: every read-modify-write is under the
// state.lock lock, otherwise a run overwrites Stop and one tab gets the command twice.
function dataDir() {
  return process.env.AGENTHUB_PLUGIN_DATA_PATH || null;
}
export const LOCKED = Symbol("locked");
const STALE_LOCK_MS = 60_000; // a run killed by the core (its timeout) — a lock older than a minute is removed
// The lock is abandoned: the process that wrote it is gone (the core killed the run), or it's older than a minute
function lockStale(p) {
  try {
    const pid = Number(readFileSync(p, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0); // checks that the plugin's own process exists, no signal is sent
      } catch (e) {
        if (e.code === "ESRCH") return true;
      }
    }
    return Date.now() - statSync(p).mtimeMs > STALE_LOCK_MS;
  } catch {
    return false;
  }
}
// Acquire the lock: → lock path | null (no PluginData — no lock) | LOCKED (held longer than waitMs)
function acquireLock(waitMs) {
  const d = dataDir();
  if (!d) return null;
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
        // take an abandoned lock atomically: only one process can rename it
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
  return p;
}
export function withLock(fn, { waitMs = 0 } = {}) {
  const p = acquireLock(waitMs);
  if (p === LOCKED) return LOCKED;
  try {
    return fn();
  } finally {
    if (p) rmSync(p, { force: true });
  }
}
// The same for work that waits for the hub's answer: the lock is held until typing ends
export async function withLockAsync(fn, { waitMs = 0 } = {}) {
  const p = acquireLock(waitMs);
  if (p === LOCKED) return LOCKED;
  try {
    return await fn();
  } finally {
    if (p) rmSync(p, { force: true });
  }
}
export function loadState() {
  const d = dataDir();
  const j = d ? readJson(join(d, "state.json")) : null;
  const st = { applied: {}, job: null, maxClearedAt: null, models: [], ...(j && typeof j === "object" && !Array.isArray(j) ? j : {}) };
  if (!st.applied || typeof st.applied !== "object" || Array.isArray(st.applied)) st.applied = {};
  // models met in earlier runs (knownModels.remember)
  st.models = Array.isArray(st.models) ? st.models.filter((id) => parseModel(id)).slice(0, 16) : [];
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

// The session's model and effort now: whichever is fresher — the hub's record (transcript write time) or what the
// plugin itself set (after the session started; the hub updates the file later). Neither — unknown.
// env (max or another level) overrides everyone's effort.
export function sessionNow(sess, base, hub, st) {
  const h = hub?.get(sess.sessionId);
  const own = st.applied?.[sess.sessionId];
  const ownOk = own && (!sess.startedAt || own.at >= sess.startedAt) && (!h || own.at > h.at);
  const model = (ownOk ? own.model : null) ?? h?.model ?? null;
  let effort = (ownOk ? own.effort : null) ?? h?.effort ?? null;
  if (base.envAuto) effort = model ? defaultEffort(model) : null;
  else if (base.envOverride && base.effort) effort = base.effort;
  return { model: model || null, effort: effort || null, known: Boolean(h) || Boolean(ownOk), verified: h ? h.verified : null };
}

// A table row: how it differs from the base and what can be done
export function rowFor(sess, base, hub, st) {
  const now = sessionNow(sess, base, hub, st);
  const modelDiffers = Boolean(base.model && now.model && now.model !== base.model);
  // The base effort is for the base model (none chosen — Opus 5.5): a tab on another model isn't compared by effort,
  // otherwise /effort would overwrite its model's saved effort. env auto — each has its own model default.
  const sameModel = base.model ? true : !now.model || now.model === DEFAULT_MODEL;
  const effortDiffers = Boolean(!base.envAuto && sameModel && base.effort && now.effort && now.effort !== base.effort);
  const differs = modelDiffers || effortDiffers;
  const action = !differs ? "same" : sess.status === "busy" ? "afterTurn" : sess.status === "waiting" ? "afterAnswer" : "fix";
  return { ...sess, now, modelDiffers, effortDiffers, differs, action };
}

// ---------- typing into a tab (the hub's terminal) ----------
// What to type so the session matches the base (only /model and /effort). → ["/model …", "/effort …"]
export function commandsFor(now, base) {
  const cmds = [];
  if (base.model && now.model !== base.model) cmds.push(`/model ${base.modelArg}`);
  // env (max or a level) holds everyone's effort — /effort isn't needed and wouldn't work
  if (!base.envOverride && isLevel(base.effort) && now.effort !== base.effort) cmds.push(`/effort ${base.effort}`);
  return cmds;
}
const COMMAND_RE = /^\/(?:model (?:claude-[a-z]+-[0-9]+(?:-[0-9]+)?|opus|sonnet|haiku|fable|best)(?:\[1m\])?|effort (?:low|medium|high|xhigh))$/;

// A hub refusal (body { error: "terminal:<code>" }) → what the plugin does:
//   wait    — wait for the next frame (session busy, input not found, rate limit): nothing was typed;
//   unknown — outcome unknown (the bridge or terminal didn't answer in time): don't type again, let the person check;
//   else    — skip the tab with a reason (the plugin's code for the text).
const TERM_WAIT = new Set(["session-busy", "not-foreground", "prompt-not-found", "rate-limited"]);
// outcome unknown: the hub's deadline and any *-timeout of the bridge or terminal
const termUnknown = (code) => code === "deadline" || /(?:^|-)timeout$/.test(code);
const TERM_REASON = {
  "prompt-not-empty": "input-text",
  "prompt-mismatch": "input-mixed",
  "no-tab": "no-tab",
  "unknown-session": "no-tab",
  unverified: "unverified",
  "pid-mismatch": "unverified",
  "process-unknown": "unverified",
  disabled: "no-terminal",
  "no-socket": "no-terminal",
  "bridge-offline": "terminal-offline",
  "bridge-outdated": "terminal-offline",
  estop: "paused",
};
export function termOutcome(r) {
  if (r.status === 200 && r.body?.ok) return { ok: true };
  const code = r.status === 0 ? r.error : String(r.body?.error || "").replace(/^terminal:/, "") || `http-${r.status}`;
  if (TERM_WAIT.has(code)) return { ok: false, kind: "wait", code };
  if (termUnknown(code)) return { ok: false, kind: "unknown", code };
  return { ok: false, kind: "refused", code, reason: TERM_REASON[code] || "terminal-failed" };
}

// Type the commands into the tab through the hub. Only an idle session not rejected by the hub; the other checks
// (signature, pid, tab, empty input line, Enter) are in the hub. deadline — until when the answer may be awaited (the
// core kills a regular run after 5 s). onTyping — before the first send (save "typing" so a killed run doesn't type
// the same thing twice). → { phase: done|skipped|failed|waitTurn|waitAnswer|later, reason?, result? }
export async function typeInto(sess, base, now, { deadline = ACTION_DEADLINE(), onTyping = null } = {}) {
  if (sess.status === "busy") return { phase: "waitTurn" };
  if (sess.status === "waiting") return { phase: "waitAnswer" };
  if (now.verified === false) return { phase: "skipped", reason: "unverified" };
  if (!hubSocket()) return { phase: "skipped", reason: "no-terminal" };
  const cmds = commandsFor(now, base);
  if (!cmds.length) return { phase: "done", result: { model: now.model, effort: now.effort, at: Date.now() } };
  if (cmds.some((c) => !COMMAND_RE.test(c))) return { phase: "failed", reason: "not-allowed" };
  if (deadline - Date.now() < 1500) return { phase: "later" };
  const sentAt = Date.now();
  if (onTyping) onTyping();
  for (let i = 0; i < cmds.length; i++) {
    let o;
    for (let attempt = 0; ; attempt++) {
      // second command: the session is still answering the first — wait and retry (while there's time)
      if (i > 0) await sleepAsync(attempt ? 600 : 400);
      o = termOutcome(await hubPost("/terminal/send-text", { sessionId: sess.sessionId, text: cmds[i] }, { timeoutMs: deadline - Date.now() - 100 }));
      if (o.ok || !(i > 0 && o.kind === "wait" && attempt < 4 && deadline - Date.now() > 1500)) break;
    }
    if (o.ok) continue;
    if (o.kind === "unknown") return { phase: "failed", reason: "unknown-outcome" };
    // first command not typed — nothing changed: wait or skip; second one — the first already went through
    if (i === 0 && o.kind === "wait") return { phase: "later", reason: o.code === "rate-limited" ? "rate" : "busy" };
    if (i === 0) return { phase: o.reason === "input-mixed" ? "failed" : "skipped", reason: o.reason };
    return { phase: "failed", reason: o.reason || "partial" };
  }
  return { phase: "done", result: { model: base.model || now.model, effort: base.envOverride ? base.effort : base.effort || now.effort, at: sentAt } };
}

const PENDING = ["queued", "waitTurn", "waitAnswer", "ready"];
const FINAL = ["done", "skipped", "failed"];
const PHASES = [...PENDING, ...FINAL, "typing"];

// Walk the "Apply base" queue: free tabs — type (if typing is allowed: allowType), busy ones — wait, vanished ones — skip.
// The state is saved after each item (save). Call under the lock.
// "typing" left over from a killed run: don't type a second time — let the person check the tab
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
export async function processJob(home, st, { deadline = RUN_DEADLINE(), allowType = true, base, sessions, save = () => {} }) {
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
      next = await typeInto(sess, base, sessionNow(sess, base, hub, st), {
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
      // the time of what was set is when typing started: a newer hub record is already the session's answer, and it's shown
      if (next.phase === "done" && next.result) st.applied[it.sessionId] = { model: next.result.model, effort: next.result.effort, at: next.result.at || Date.now() };
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

// After leaving env (max) the key env.CLAUDE_CODE_EFFORT_LEVEL = "" is deleted once no live sessions started before
// leaving remain (for them a deleted key would stay at the old value). sessions = null (can't check) — leave it.
export function maybeClearMaxKey(home, st, base, sessions) {
  if (!sessions || !base.maxPendingClear || !st.maxClearedAt) return false;
  if (sessions.some((s) => !s.startedAt || s.startedAt <= st.maxClearedAt)) return false;
  const r = writeSettings(home, (s) => opsFor("clear-max-key", null, s));
  if (r.ok) st.maxClearedAt = null;
  return r.ok;
}

// ---------- collecting ----------
function readSettings(home) {
  let text = null;
  try {
    text = readFileSync(settingsPath(home), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") return null;
  }
  return parseSettings(text);
}

export async function collect({ home = homedir() } = {}) {
  if (!claudeInstalled(home)) return { installed: false };
  let settings = readSettings(home);
  const broken = !settings;
  if (broken) settings = {};
  let base = readBase(settings);
  const sessions = liveSessions(home);
  // deferred typing is done from a regular run only if the hub reports it isn't paused
  const allowType = process.env.AGENTHUB_PAUSED === "0";
  let st = loadState();
  const seen = seenModels();
  if (!broken) {
    const r = await withLockAsync(async () => {
      const s2 = loadState();
      let ch = await processJob(home, s2, { deadline: RUN_DEADLINE(), allowType, base, sessions, save: () => saveState(s2) });
      // left env without a timestamp (the lock was busy) — mark it now: the key is deleted once older sessions close
      if (base.maxPendingClear && !s2.maxClearedAt) {
        s2.maxClearedAt = Date.now();
        ch = true;
      }
      if (maybeClearMaxKey(home, s2, base, sessions)) ch = true;
      // what was set is remembered only for live sessions
      if (sessions) {
        const live = new Set(sessions.map((x) => x.sessionId));
        for (const id of Object.keys(s2.applied)) {
          if (!live.has(id)) {
            delete s2.applied[id];
            ch = true;
          }
        }
      }
      // a model met now stays in the list after its last tab closes
      const remember = knownModels({ seen, remembered: s2.models }).remember;
      if (remember.join() !== s2.models.join()) {
        s2.models = remember;
        ch = true;
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
    models: knownModels({ listed: hubModels(), seen, remembered: st.models, base: broken ? null : base.model }).page,
    styles: broken ? [] : listStyles(home, settings),
    rows: (sessions || []).map((s) => rowFor(s, base, hub, st)),
    sessionsUnknown: !sessions,
    hubData: Boolean(hub),
    terminal: Boolean(hubSocket()),
    autoType: allowType,
    job: st.job,
  };
}

// ---------- output ----------
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
  "no-tab": ["хаб не нашёл вкладку сессии", "the hub didn't find the session's tab"],
  "no-terminal": ["набирать во вкладки не через что", "no way to type into tabs"],
  "terminal-offline": ["мост терминала хаба не запущен", "the hub's terminal bridge isn't running"],
  "terminal-failed": ["терминал не набрал команду", "the terminal didn't type the command"],
  "input-mixed": ["в поле ввода осталась набранная строка — проверьте вкладку", "the typed line was left in the input — check the tab"],
  "unknown-outcome": ["терминал не ответил вовремя — проверьте вкладку", "the terminal didn't answer in time — check the tab"],
  partial: ["набрана только часть — проверьте вкладку", "only part was typed — check the tab"],
  paused: ["хаб на паузе", "the hub is paused"],
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
    out.push(line(tr("Claude Code не установлен", "Claude Code isn't installed"), { status: "unknown", tile: tr("нет", "none"), tileLabel: TILE_LABEL() }));
    out.push("---");
    out.push(line(tr("Плагин показывает настройки Claude Code, когда он установлен", "The plugin shows Claude Code settings once it is installed")));
    return `${out.join("\n")}\n`;
  }
  if (r.broken) {
    out.push(line(tr("Настройки Claude не читаются", "Claude settings unreadable"), { status: "error", tile: tr("сбой", "error"), tileLabel: TILE_LABEL() }));
    out.push("---");
    out.push(line(tr("~/.claude/settings.json — не JSON. Плагин его не меняет, пока файл не исправят", "~/.claude/settings.json isn't valid JSON. The plugin won't change it until it's fixed")));
    return `${out.join("\n")}\n`;
  }
  const b = r.base;
  const differ = r.rows.filter((x) => x.differs);
  const known = r.rows.filter((x) => x.now.known);
  // tile: the model itself ("Opus 5.5 · high"); header: "default (Opus 5.5) · high" when settings have no model
  const baseText = `${modelLabel(b.model || DEFAULT_MODEL)} · ${effortLabel(b.effort)}`;
  const baseLong = b.model ? baseText : `${tr(`по умолчанию (${modelLabel(DEFAULT_MODEL)})`, `default (${modelLabel(DEFAULT_MODEL)})`)} · ${effortLabel(b.effort)}`;
  const job = r.job || null;
  const jobActive = Boolean(job && !job.finishedAt);
  const canType = r.terminal;
  let differText;
  const unknownN = r.rows.length - known.length;
  if (r.sessionsUnknown) differText = tr("вкладки: не удалось проверить", "tabs: couldn't check");
  else if (differ.length) differText = tr(`${tabsN(differ.length)} не как базовые`, `${tabsN(differ.length, "en")} ${differ.length === 1 ? "differs" : "differ"} from the base`);
  else if (r.rows.length && !known.length) differText = tr("вкладки: нет данных", "tabs: no data");
  else if (unknownN) differText = tr(`как базовые · ${unknownN} без данных`, `as base · ${unknownN} unknown`);
  else differText = tr("как базовые", "as base");

  // header: the base on one line and the differences (the "Apply base" button lives in the sessions table)
  out.push(line(tr(`Базовые: ${baseLong}`, `Base: ${baseLong}`), { status: jobActive ? "wait" : "ok", tile: baseText, tileLabel: TILE_LABEL() }));
  out.push(line(differText));
  out.push("---");

  // for new sessions (design v2: segments, a dropdown and a switch — hub 0.1.0+ draws them; an older hub shows the
  // children as lines and buttons)
  out.push(line(tr("Для новых сессий", "For new sessions")));
  out.push(line(tr("Модель", "Model"), { segment: "true" }));
  const defLabel = tr(`По умолчанию (${modelLabel(DEFAULT_MODEL)})`, `Default (${modelLabel(DEFAULT_MODEL)})`);
  out.push(`--${line(defLabel, !b.model ? { selected: "true" } : { action: "set-model", arg: "default" })}`);
  for (const m of r.models) out.push(`--${line(m.label, b.model === m.id ? { selected: "true" } : { action: "set-model", arg: m.id })}`);
  {
    const wideNote =
      b.context1mKind === "none"
        ? tr("эта модель работает только с окном 200 тыс.", "this model works with a 200K window only")
        : b.context1m
          ? tr("новые сессии; длинные сессии тратят лимит быстрее", "new sessions; long sessions use the limit faster")
          : tr("новые сессии: окно 200 тыс., сжатие истории раньше", "new sessions: a 200K window, history is compacted sooner");
    out.push(line(tr("Контекст 1 млн токенов", "1M-token context"), b.context1mKind === "none" ? { note: wideNote } : { toggle: b.context1m ? "on" : "off", action: b.context1m ? "context-1m-off" : "context-1m-on", note: wideNote }));
  }
  out.push(line("Effort", { segment: "true" }));
  for (const l of LEVELS) out.push(`--${line(l, b.effort === l && !b.envOverride ? { selected: "true" } : { action: "set-effort", arg: l })}`);
  // max is the segment's last option, orange (a separate line would split the settings into separate cards)
  out.push(`--${line("max", b.maxActive ? { selected: "true", color: ORANGE } : { action: "effort-max", color: ORANGE, tooltip: tr("во всех вкладках, лимит в разы быстрее", "in every tab, the limit runs out faster") })}`);
  if (b.maxActive) out.push(line(tr("max — во всех вкладках: лимит уходит в разы быстрее; выбор уровня выше его снимет", "max — in every tab: the limit runs out several times faster; picking a level above clears it"), { sfimage: "exclamationmark.triangle.fill", color: ORANGE }));
  else if (b.envOverride) out.push(line(tr(`Effort ${b.effort} задан в env.CLAUDE_CODE_EFFORT_LEVEL и действует во всех вкладках; выбор уровня выше его снимет`, `Effort ${b.effort} is set in env.CLAUDE_CODE_EFFORT_LEVEL and applies in every tab; picking a level above clears it`), { color: ORANGE }));
  out.push(line(tr("Стиль ответов", "Output style"), { select: "true", note: tr("открытые вкладки подхватят со следующего сообщения", "open tabs pick it up from their next message") }));
  for (const st of r.styles) {
    const note = st.source === "user" ? tr("ваш", "yours") : st.source === "plugin" ? tr("из плагина", "from a plugin") : undefined;
    out.push(`--${line(st.name, b.outputStyle === st.name ? { selected: "true", note } : { action: "set-style", arg: st.name, note })}`);
  }
  // the spare way: a model the list doesn't have (a hub without the model list, or an id the list can't compare) —
  // the human types its id
  out.push(line(tr("Другая модель…", "Another model…"), { action: "set-model-id", note: tr(`идентификатор, например ${r.models.at(-1)?.id ?? DEFAULT_MODEL}`, `an id, e.g. ${r.models.at(-1)?.id ?? DEFAULT_MODEL}`) }));
  out.push(line("Ultracode", { toggle: b.ultracode ? "on" : "off", action: b.ultracode ? "ultracode-off" : "ultracode-on", note: tr("многоагентные воркфлоу на каждую задачу", "multi-agent workflows on every task") }));
  out.push(
    line(
      tr(
        "Пишется в ~/.claude/settings.json, прежняя версия — в ~/.claude/backups. Открытые вкладки модель и effort не меняют — для них «Проставить базовые» ниже",
        "Written to ~/.claude/settings.json, the previous version goes to ~/.claude/backups. Open tabs keep their model and effort — use Apply base below",
      ),
      { color: GREY },
    ),
  );
  out.push("---");

  // progress and result of "Apply base"
  if (job) {
    const done = job.items.filter((i) => i.phase === "done").length;
    const M = job.items.length;
    if (jobActive) out.push(line(tr(`Проставляю… ${done} из ${M}`, `Applying… ${done} of ${M}`), { color: BLUE }));
    else out.push(line(tr(`Готово в ${done} из ${M} ${ruPlural(M, "вкладки", "вкладок", "вкладок")}`, `Done in ${done} of ${tabsN(M, "en")}`), { color: done === M ? GREEN : ORANGE }));
    for (const it of job.items) {
      const [icon, color] = phaseIcon[it.phase] || ["circle", null];
      const label = it.phase === "done" && it.waited ? (it.waited === "waitAnswer" ? tr("после ответа", "after your answer") : tr("после хода", "after the turn")) : phaseText(it);
      out.push(`--${line(`${it.label} — ${label}`, { sfimage: icon, iconColor: color })}`);
    }
    if (jobActive) {
      if (job.items.some((i) => i.phase === "ready") && canType) out.push(line(tr("Продолжить", "Continue"), { action: "apply-continue" }));
      out.push(line(tr("Остановить", "Stop"), { action: "apply-stop" }));
    } else {
      // retry is the same button: it takes the tabs that differ now
      if (differ.length && canType) out.push(line(tr(`Повторить для ${differ.length}`, `Retry for ${differ.length}`), { action: "apply-all" }));
      out.push(line(tr("Убрать итог", "Dismiss"), { action: "apply-done" }));
    }
    out.push("---");
  }

  // open sessions: a table (design v2) — the rows that need attention first, the ones as the base in a group
  if (r.sessionsUnknown) out.push(line(tr("Не удалось проверить, какие сессии живы (ps не ответил) — попробую в следующий раз", "Couldn't check which sessions are alive (ps didn't respond) — will retry"), { color: ORANGE }));
  if (!canType) out.push(line(tr("Только просмотр: хаб не дал плагину терминал, набирать во вкладки не через что", "View-only: the hub gave the plugin no terminal, there's no way to type into tabs"), { color: GREY }));
  if (!r.hubData) out.push(line(tr("Модель и effort вкладок покажет хаб новее; пока видно то, что проставил плагин", "A newer hub will show each tab's model and effort; for now you see what the plugin set"), { color: GREY }));
  const title = r.sessionsUnknown ? tr("Открытые сессии", "Open sessions") : tr(`Открытые сессии · ${r.rows.length}`, `Open sessions · ${r.rows.length}`);
  if (!r.rows.length) {
    out.push(line(title));
    if (!r.sessionsUnknown) out.push(`--${line(tr("Открытых сессий нет", "No open sessions"), { color: GREY })}`);
  } else {
    out.push(line(title, { table: "true", columns: tr("Вкладка¦Состояние¦Модель¦Effort", "Tab¦State¦Model¦Effort") }));
    // the table's header button
    if (differ.length && canType && !jobActive) out.push(`--${line(tr(`Проставить базовые · ${differ.length}`, `Apply base · ${differ.length}`), { action: "apply-all", header: "true" })}`);
    const queued = new Set(jobActive ? job.items.filter((i) => !FINAL.includes(i.phase)).map((i) => i.sessionId) : []);
    const attention = r.rows.filter((x) => x.differs || !x.now.known || queued.has(x.sessionId));
    const same = r.rows.filter((x) => !attention.includes(x));
    const row = (x, pre) => {
      const unknown = !x.now.known;
      const stColor = x.status === "busy" ? BLUE : x.status === "waiting" ? ORANGE : GREY;
      const cells = [stateText(x.status) || "—", x.now.model ? modelLabel(x.now.model) : "—", x.now.effort || "—"].map((c) => clean(String(c), 40).replace(/¦/g, "|")).join("¦");
      const colors = ["", unknown ? GREY : x.modelDiffers ? ORANGE : "", unknown ? GREY : x.effortDiffers ? ORANGE : ""].join("¦");
      out.push(`${pre}${line(x.label, { cells, cellColors: colors.replace(/¦/g, "") ? colors : null, sfimage: "circle.fill", iconColor: stColor })}`);
      let note = null;
      if (queued.has(x.sessionId)) note = tr("в очереди", "queued");
      else if (unknown) note = tr("нет данных", "no data");
      else if (x.action === "fix") {
        if (x.now.verified === false) note = tr("подпись не подтверждена", "signature not verified");
      } else if (x.differs) note = noteText(x.action);
      if (x.action === "fix" && !note && canType && !jobActive) out.push(`${pre}--${line(tr("Привести", "Fix"), { action: "apply", arg: x.sessionId })}`);
      else if (note) out.push(`${pre}--${line(note, { color: GREY })}`);
      // switching to the tab is a hub effect: the hub finds the tab (the plugin knows nothing about the terminal)
      out.push(`${pre}--${line(tr("Перейти", "Switch"), { effect: `session.focus ${x.sessionId}`, sfimage: "arrow.up.forward.app", icon: "true" })}`);
    };
    for (const x of attention) row(x, "--");
    if (attention.length && same.length) {
      out.push(`--${line(tr(`Как базовые · ${same.length}`, `As base · ${same.length}`), { group: "true" })}`);
      for (const x of same) row(x, "----");
    } else for (const x of same) row(x, "--");
  }
  if (r.rows.length) {
    out.push(line(tr("Подробности", "Details"), { details: "true" }));
    for (const x of r.rows) out.push(`--${line(`${x.label}: pid ${x.pid} · ${x.sessionId}`)}`);
  }
  return `${out.join("\n")}\n`;
}

// ---------- actions ----------
export const REFUSALS = {
  "bad-arg": ["Такого значения нет.", "No such value."],
  "no-claude": ["Claude Code не установлен.", "Claude Code isn't installed."],
  "settings-broken": ["~/.claude/settings.json — не JSON: исправьте файл, плагин его не трогает.", "~/.claude/settings.json isn't valid JSON: fix it, the plugin won't touch it."],
  "settings-unreadable": ["Не получается прочитать ~/.claude/settings.json.", "Can't read ~/.claude/settings.json."],
  "settings-link-broken": ["~/.claude/settings.json — ссылка в никуда: плагин не заменяет её файлом.", "~/.claude/settings.json is a dangling link: the plugin won't replace it with a file."],
  "plugin-failed": ["Сбой плагина — подробности в журнале хаба.", "Plugin failure — see the hub journal."],
  "settings-busy": ["Настройки менялись одновременно с плагином — попробуйте ещё раз.", "The settings changed at the same time — try again."],
  "not-allowed": ["Этот ключ настроек плагин не меняет.", "The plugin doesn't change this settings key."],
  "no-1m": ["У этой модели нет окна в 1 млн токенов — выберите другую модель.", "This model has no 1M-token window — pick another model."],
  "unknown-style": ["Такого стиля ответов нет среди установленных.", "No installed output style has this name."],
  "no-terminal": ["Хаб не дал плагину терминал — набирать во вкладки не через что.", "The hub gave the plugin no terminal — no way to type into tabs."],
  "terminal-offline": ["Мост терминала хаба не запущен или устарел — запустите его заново: команда в настройках хаба, «Терминал».", "The hub's terminal bridge is down or outdated — start it again: the command is in the hub's Settings, Terminal."],
  "terminal-failed": ["Терминал не набрал команду.", "The terminal didn't type the command."],
  "input-mixed": ["Строку набрали, но в поле оказался и ваш текст: Enter не нажат — проверьте вкладку.", "The line was typed but your text got mixed in: Enter wasn't pressed — check the tab."],
  "unknown-outcome": ["Терминал не ответил вовремя — проверьте вкладку, прежде чем повторять.", "The terminal didn't answer in time — check the tab before retrying."],
  partial: ["Набрана только первая команда — проверьте вкладку.", "Only the first command was typed — check the tab."],
  paused: ["Хаб на паузе.", "The hub is paused."],
  rate: ["Слишком часто — попробуйте через минуту.", "Too often — try again in a minute."],
  "no-session": ["Такой открытой сессии нет.", "No such open session."],
  "no-tab": ["Хаб не нашёл вкладку этой сессии.", "The hub didn't find this session's tab."],
  "session-busy": ["Сессия сейчас занята — наберу, когда освободится, через «Проставить базовые».", "The session is busy — use Apply base to type once it's free."],
  unverified: ["Подпись Claude Code у этой сессии не подтверждена — набирать не буду.", "This session's Claude Code signature isn't verified — not typing."],
  "input-text": ["В поле ввода есть текст — вкладку не трогаю.", "There's text in the input line — leaving the tab alone."],
  "no-ps": ["Не удалось проверить, жива ли сессия (ps не ответил).", "Couldn't check whether the session is alive (ps didn't respond)."],
  "nothing-to-do": ["Все вкладки уже как базовые.", "Every tab already matches the base."],
  "job-running": ["Уже проставляю — дождитесь или остановите.", "Already applying — wait or stop it."],
  "plugin-busy": ["Плагин занят другой командой — попробуйте через несколько секунд.", "The plugin is busy with another command — try again in a few seconds."],
  "unknown-action": ["Плагин не знает такого действия.", "The plugin doesn't know this action."],
};
// What the human can do about a refusal — the advice line of the hub's refusal window (hint=, hub 0.1.6)
const HINTS = {
  "input-text": ["Сотрите или отправьте текст во вкладке и нажмите «Повторить».", "Clear or send the text in the tab and press Try again."],
  "input-mixed": ["Откройте вкладку и сотрите лишнее в поле ввода: Enter не нажат.", "Open the tab and clear the input line: Enter wasn't pressed."],
  "session-busy": ["Дождитесь конца хода и повторите — или нажмите «Проставить базовые».", "Wait for the turn to end and try again — or use Apply base."],
  "unknown-outcome": ["Откройте вкладку и посмотрите, набрана ли команда.", "Open the tab and see whether the command was typed."],
  partial: ["Откройте вкладку: вторую команду можно набрать самому.", "Open the tab: you can type the second command yourself."],
  "terminal-offline": ["Запустите мост заново и повторите.", "Start the bridge again and retry."],
  rate: ["Подождите минуту и повторите.", "Wait a minute and try again."],
  paused: ["Снимите паузу хаба и повторите.", "Resume the hub and try again."],
};
// The lines of a refused action, as the hub reads them: the window's rows first (fact=, hint=, session= — a hub before
// 0.1.6 ignores them), then message= and reason= — message= must stay within the last 5 lines for those hubs.
export function refusalLines(r, lang = envLang()) {
  const en = lang === "en";
  const out = [];
  if (Array.isArray(r.want) && r.want.length) out.push(`fact=${en ? "Wanted to type" : "Хотел набрать"}: ${r.want.join(", ")}`);
  const hint = HINTS[r.reason];
  if (hint) out.push(`hint=${hint[en ? 1 : 0]}`);
  if (typeof r.session === "string" && SESSION_RE.test(r.session)) out.push(`session=${r.session}`);
  const msg = refusalMessage(r.reason, lang);
  if (msg) out.push(`message=${msg}`);
  out.push(`reason=${r.reason}`);
  return out;
}
export function refusalMessage(reason, lang = envLang()) {
  const t = REFUSALS[reason];
  return t ? t[lang === "en" ? 1 : 0] : null;
}

function settingsAction(home, kind, value) {
  const r = writeSettings(home, (s) => opsFor(kind, value, s));
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

// Actions on tabs and the queue run under the state lock
async function tabAction(id, arg, home) {
  if (!hubSocket() && id !== "apply-stop" && id !== "apply-done") return { ok: false, reason: "no-terminal" };
  const settings = readSettings(home);
  if (!settings) return { ok: false, reason: "settings-broken" };
  const base = readBase(settings);
  const r = await withLockAsync(
    async () => {
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
      const deadline = ACTION_DEADLINE(); // from the process start: waiting for the lock and ps are already counted
      if (id === "apply") {
        if (!SESSION_RE.test(String(arg || ""))) return { ok: false, reason: "bad-arg" };
        const sess = sessions.find((s) => s.sessionId === arg);
        if (!sess) return { ok: false, reason: "no-session" };
        const now = sessionNow(sess, base, hub, st);
        // for the hub's refusal window (hub 0.1.6): which tab it was about and what the plugin was going to type
        const about = { session: sess.sessionId, want: commandsFor(now, base) };
        const t = await typeInto(sess, base, now, { deadline });
        if (t.phase === "waitTurn" || t.phase === "waitAnswer" || (t.phase === "later" && t.reason !== "rate")) return { ok: false, reason: "session-busy", ...about };
        if (t.phase !== "done") return { ok: false, reason: t.reason || "terminal-failed", ...about };
        st.applied[sess.sessionId] = { model: t.result.model, effort: t.result.effort, at: t.result.at || Date.now() };
        save();
        return { ok: true };
      }
      if (id === "apply-continue") {
        if (!st.job || st.job.finishedAt) return { ok: true };
        await processJob(home, st, { deadline, allowType: true, base, sessions, save });
        save();
        return { ok: true };
      }
      // apply-all ("Apply base", "Retry for K"): the tabs that differ now
      if (st.job && !st.job.finishedAt) return { ok: false, reason: "job-running" };
      const todo = sessions.map((s) => rowFor(s, base, hub, st)).filter((x) => x.differs);
      if (!todo.length) return { ok: false, reason: "nothing-to-do" };
      st.job = { startedAt: Date.now(), target: { model: base.model, effort: base.effort }, items: todo.map((x) => ({ sessionId: x.sessionId, label: x.label, phase: "queued", reason: null, result: null })) };
      save();
      await processJob(home, st, { deadline, allowType: true, base, sessions, save });
      save();
      return { ok: true };
    },
    { waitMs: 4000 },
  );
  return r === LOCKED ? { ok: false, reason: "plugin-busy" } : r;
}

// → { ok, reason? }
// The text of an input action: the hub writes it to stdin (the text, "\n", end of input). → string or null
function typedInput() {
  try {
    return readFileSync(0, "utf8").slice(0, 256).split("\n")[0];
  } catch {
    return null;
  }
}
export async function runAction([id, arg], { home = homedir(), input = null } = {}) {
  if (!claudeInstalled(home)) return { ok: false, reason: "no-claude" };
  if (id === "set-model-id") {
    // typed by the human in the hub, so it needn't be on the page — that is the point: a model nobody here has used
    // yet. Only the shape is checked (the hub checked the same pattern); it is written as a full id, like any other.
    const typed = input ?? typedInput();
    return parseModel(typed) ? settingsAction(home, "model", typed) : { ok: false, reason: "bad-arg" };
  }
  if (id === "set-model") {
    // only a model from the page's list (the same sources as the page) or "default"
    const page = knownModels({ listed: hubModels(), seen: seenModels(), remembered: loadState().models, base: readBase(readSettings(home) || {}).model }).page;
    return arg === "default" || page.some((m) => m.id === arg) ? settingsAction(home, "model", arg) : { ok: false, reason: "bad-arg" };
  }
  if (id === "set-effort") {
    if (!isLevel(arg)) return { ok: false, reason: "bad-arg" };
    const before = readBase(readSettings(home) || {});
    const r = settingsAction(home, "effort", arg);
    if (r.ok && before.envOverride) {
      // when env was left — to delete the key once sessions started earlier close
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
  if (id === "context-1m-on" || id === "context-1m-off") return settingsAction(home, "context1m", id === "context-1m-on");
  if (id === "ultracode-on" || id === "ultracode-off") return settingsAction(home, "ultracode", id === "ultracode-on");
  if (["apply", "apply-all", "apply-continue", "apply-stop", "apply-done"].includes(id)) return tabAction(id, arg, home);
  return { ok: false, reason: "unknown-action" };
}

async function main() {
  const ai = process.argv.indexOf("--action");
  if (ai >= 2) {
    let r;
    try {
      r = await runAction(process.argv.slice(ai + 1));
    } catch {
      r = { ok: false, reason: "plugin-failed" };
    }
    process.stdout.write(r.ok ? "ok\n" : `${refusalLines(r, envLang()).join("\n")}\n`);
    process.exitCode = r.ok ? 0 : 3;
    return;
  }
  try {
    process.stdout.write(render(await collect(), { lang: envLang() }));
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
