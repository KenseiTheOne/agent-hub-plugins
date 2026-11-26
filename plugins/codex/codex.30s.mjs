#!/usr/bin/env node
// <agenthub.title>Codex Настройки</agenthub.title>
// <agenthub.title lang="en">Codex Settings</agenthub.title>
// <agenthub.version>1.0.1</agenthub.version>
// <agenthub.contract>3</agenthub.contract>
// <agenthub.icon symbol="slider.horizontal.3" color="#10A37F"></agenthub.icon>
// <agenthub.desc>Настройки Codex CLI для новых сессий: модель и effort (уровень рассуждений) из ~/.codex/config.toml, с выбором из списка моделей Codex</agenthub.desc>
// <agenthub.desc lang="en">Codex CLI settings for new sessions: the model and effort (reasoning level) from ~/.codex/config.toml, picked from Codex's own model list</agenthub.desc>
// <agenthub.status value="ok" label="Настройки Codex">Настройки прочитаны</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Codex settings">The settings are read</agenthub.status>
// <agenthub.status value="error" label="Сбой плагина или настроек">Начало ~/.codex/config.toml не читается (плагин его не трогает) или сбой самого плагина</agenthub.status>
// <agenthub.status value="error" lang="en" label="Plugin or settings failure">The top of ~/.codex/config.toml can't be read (the plugin leaves it alone) or the plugin itself failed</agenthub.status>
// <agenthub.status value="unknown" label="Codex не найден">Codex не установлен</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Codex not found">Codex isn't installed</agenthub.status>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.requires name="Codex CLI" url="https://github.com/openai/codex" check="~/.codex/installation_id">агент, чьи настройки показывает и меняет плагин</agenthub.requires>
// <agenthub.requires lang="en" name="Codex CLI">the agent whose settings this plugin shows and changes</agenthub.requires>
// <agenthub.fsRead>~/.codex/config.toml — значения model и model_reasoning_effort верхнего уровня; есть ли там profile, model_provider, model_catalog_json — для предупреждений (остальное не показывается)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.codex/config.toml — the top-level model and model_reasoning_effort; whether profile, model_provider, model_catalog_json are set — for warnings (nothing else is shown)</agenthub.fsRead>
// <agenthub.fsRead>~/.codex/models_cache.json — список моделей Codex: идентификатор, имя, видимость в списке, порядок, уровни effort, доступность по API, версия Codex, скачавшего список (остальные поля не берутся)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.codex/models_cache.json — Codex's model list: id, name, whether it is listed, order, effort levels, API availability, the Codex version that fetched it (other fields aren't used)</agenthub.fsRead>
// <agenthub.fsRead>~/.codex/version.json — только latest_version: самая новая версия Codex, о которой знает сам Codex, — чтобы сказать, что список моделей мог устареть</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.codex/version.json — only latest_version: the newest Codex version Codex itself knows of — to say the model list may be stale</agenthub.fsRead>
// <agenthub.fsWrite>~/.codex/config.toml — только ключи верхнего уровня model и model_reasoning_effort, по вашей кнопке; остальные строки, комментарии и таблицы не меняются</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.codex/config.toml — only the top-level keys model and model_reasoning_effort, on your click; other lines, comments and tables stay byte for byte</agenthub.fsWrite>
// <agenthub.watch>~/.codex/config.toml — настройки поменяли (вы, Codex или другой плагин)</agenthub.watch>
// <agenthub.watch lang="en">~/.codex/config.toml — the settings changed (by you, Codex or another plugin)</agenthub.watch>
// <agenthub.watch>~/.codex/models_cache.json — Codex обновил список моделей</agenthub.watch>
// <agenthub.watch lang="en">~/.codex/models_cache.json — Codex refreshed its model list</agenthub.watch>
// <agenthub.action id="set-model" level="immediate" arg="model:^(?:default|[a-z0-9][a-z0-9._-]{0,63})$" title="Модель для новых сессий Codex — из списка на странице (default — модель Codex по умолчанию)" title-en="Model for new Codex sessions — one from the page's list (default — Codex's default model)">codex.30s.mjs --action set-model {model}</agenthub.action>
// <agenthub.action id="set-effort" level="immediate" arg="level:^(?:default|[a-z][a-z0-9_-]{0,31})$" title="Effort для новых сессий Codex — из уровней модели (чем выше, тем быстрее уходит лимит; default — уровень модели по умолчанию)" title-en="Effort for new Codex sessions — one of the model's levels (the higher, the faster the limit goes; default — the model's own level)">codex.30s.mjs --action set-effort {level}</agenthub.action>
//
// The "Codex" plugin (agent-hub-plugins registry, tier official): the Codex CLI analogue of the claude-code plugin's
// "For new sessions" block. It does the work itself; the hub is the sandbox and the permissions.
//   • Reads the default model and effort of new Codex sessions — the top-level keys `model` and
//     `model_reasoning_effort` of ~/.codex/config.toml — and writes only these two keys there (on a click).
//   • Takes the model list and each model's effort levels from ~/.codex/models_cache.json, the catalog Codex itself
//     fetches and keeps; a new model shows up by itself.
// The hub doesn't pass CODEX_HOME to plugins, so the plugin always uses ~/.codex.
// The plugin never opens Codex's sign-in file, its sessions, history or state databases — only the two files above.
//
// Codex rust-v0.159.3 facts (checked against its source):
//   • config_toml.rs: `model: Option<String>` and `model_reasoning_effort: Option<ReasoningEffort>` are top-level keys;
//   • profiles are `--profile <name>` + ~/.codex/<name>.config.toml layered over config.toml (config/src/loader/mod.rs);
//     [profiles.*] tables are no longer applied, and a top-level `profile = "<name>"` makes config loading fail
//     ("legacy `profile = …` config is no longer supported", core/src/config/mod.rs) — the page warns about that line;
//     `--profile`, `-c` and a project's .codex/config.toml can still override the defaults for a run;
//   • a top-level `model_provider` other than openai or a `model_catalog_json` makes Codex take its models elsewhere —
//     the page warns that the list may not match;
//   • without a ChatGPT sign-in Codex keeps only `supported_in_api` models (ModelPreset::filter_by_auth); the plugin
//     doesn't read the sign-in file, so it marks the others "ChatGPT sign-in only";
//   • Codex refetches models_cache.json when its `client_version` isn't the running Codex's; no file names the
//     installed version, so the page only notes a newer `latest_version` in version.json (Codex's update check);
//   • ReasoningEffort parses none|minimal|low|medium|high|xhigh|max|ultra|persistent, and any other non-empty string
//     as a model-defined custom level — so the plugin offers exactly the levels the model lists
//     (models_cache.json → models[].supported_reasoning_levels[].effort), not a fixed table;
//   • the picker lists models with visibility "list", sorted by priority; with no `model` key the default is the
//     first listed one (ModelPreset::mark_default_by_picker_visibility);
//   • with no `model_reasoning_effort` key a model uses its default_reasoning_level.
// Writing: no TOML library — a small line-based editor of the part before the first [table] (see "config.toml editor"
// below). It changes one key's value in place or inserts/removes one line; every other byte stays. A key written in a
// form it can't edit unambiguously (a multi-line value, a dotted key, a repeat) is a refusal, not a guess.
// Actions: `--action <id> [<argument>]`; a refusal is exit code 3, a line message=<explanation> and last reason=<code>.

import { randomBytes } from "node:crypto";
import { closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- language ----------
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
let LANG = envLang();
const tr = (ru, en) => (LANG === "en" ? en : ru);
const TILE_LABEL = () => tr("Codex модель", "Codex model");

// ---------- paths ----------
const codexDir = (home) => join(home, ".codex");
const configPath = (home) => join(codexDir(home), "config.toml");
const cachePath = (home) => join(codexDir(home), "models_cache.json");
const versionPath = (home) => join(codexDir(home), "version.json");
export const KEYS = { model: "model", effort: "model_reasoning_effort", profile: "profile", provider: "model_provider", catalog: "model_catalog_json" };
// What the actions may write: everything else in config.toml is never written
const WRITABLE = new Set([KEYS.model, KEYS.effort]);

// Values the plugin writes are checked against these (the same as the action patterns): safe inside a TOML basic
// string without escapes
export const MODEL_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const EFFORT_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export function codexInstalled(home) {
  try {
    return statSync(codexDir(home)).isDirectory();
  } catch {
    return false;
  }
}

// ---------- config.toml editor ----------
// TOML here is read only as far as the plugin needs: the lines before the first [table] header (the root table).
// Each root line is blank, a comment, or `key = value` (+ an optional comment). A value is scanned, not interpreted:
// strings of all four kinds, arrays and inline tables (which may span lines) are skipped as a whole, so a "[" inside
// a string or a nested array never looks like a header. Anything else in the root is "unparsed" and the plugin
// doesn't write. → { entries: [{ path, start, valueStart, valueEnd, end, multiline }], headerAt } or { error }
const isNl = (t, i) => t[i] === "\n" || (t[i] === "\r" && t[i + 1] === "\n");
const nlLen = (t, i) => (t[i] === "\r" ? 2 : 1);
const skipSp = (t, i) => {
  while (t[i] === " " || t[i] === "\t") i++;
  return i;
};
function lineEnd(t, i) {
  while (i < t.length && !isNl(t, i)) i++;
  return i;
}
// A single-line string from t[i] (the opening quote) → index after the closing quote, or -1
function scanShortString(t, i) {
  const q = t[i];
  for (let j = i + 1; j < t.length; j++) {
    const c = t[j];
    if (c === "\n" || c === "\r") return -1;
    if (q === '"' && c === "\\") {
      j++;
      continue;
    }
    if (c === q) return j + 1;
  }
  return -1;
}
// A multi-line string from t[i] (""" or ''') → index after the closing delimiter, or -1
function scanLongString(t, i) {
  const q = t[i];
  for (let j = i + 3; j < t.length; j++) {
    if (q === '"' && t[j] === "\\") {
      j++;
      continue;
    }
    if (t[j] === q && t[j + 1] === q && t[j + 2] === q) {
      let e = j + 3;
      // up to two quotes right before the closing delimiter belong to the string
      for (let k = 0; k < 2 && t[e] === q; k++) e++;
      return e;
    }
  }
  return -1;
}
function scanString(t, i) {
  const q = t[i];
  return t[i + 1] === q && t[i + 2] === q ? scanLongString(t, i) : scanShortString(t, i);
}
// A value from t[i] → { end, multiline } or null. A scalar (number, bool, date) runs to a comment or the line end.
export function scanValue(t, i) {
  const c = t[i];
  if (c === '"' || c === "'") {
    const end = scanString(t, i);
    return end < 0 ? null : { end, multiline: /[\r\n]/.test(t.slice(i, end)) };
  }
  if (c === "[" || c === "{") {
    let depth = 0;
    for (let j = i; j < t.length; ) {
      const d = t[j];
      if (d === '"' || d === "'") {
        const e = scanString(t, j);
        if (e < 0) return null;
        j = e;
      } else if (d === "#") j = lineEnd(t, j);
      else {
        if (d === "[" || d === "{") depth++;
        else if (d === "]" || d === "}") depth--;
        j++;
        if (depth === 0) return { end: j, multiline: /[\r\n]/.test(t.slice(i, j)) };
      }
    }
    return null;
  }
  let j = i;
  while (j < t.length && !isNl(t, j) && t[j] !== "#") j++;
  while (j > i && (t[j - 1] === " " || t[j - 1] === "\t")) j--;
  return j > i ? { end: j, multiline: false } : null;
}
// The text of a single-line TOML string body (between the quotes) → string, or null when TOML wouldn't accept it.
// Basic strings ("…"): TOML 1.1 escapes (Codex's parser is toml 0.9 / spec 1.1): \b \t \n \f \r \e \" \\ \xHH \uXXXX
// \UXXXXXXXX (a Unicode scalar value); literal strings ('…') are taken as they are. Both: no control characters but tab.
const ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\x1b", '"': '"', "\\": "\\" };
const HEX_LEN = { x: 2, u: 4, U: 8 };
const isCtl = (code) => (code < 0x20 && code !== 0x09) || code === 0x7f;
export function decodeString(body, basic) {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (isCtl(c.charCodeAt(0))) return null;
    if (!basic || c !== "\\") {
      out += c;
      continue;
    }
    const k = body[++i];
    if (Object.hasOwn(ESCAPES, k)) {
      out += ESCAPES[k];
      continue;
    }
    const n = HEX_LEN[k];
    const hex = n ? body.slice(i + 1, i + 1 + n) : "";
    if (!n || !/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== n) return null;
    const cp = parseInt(hex, 16);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += n;
  }
  return out;
}
// A key (bare, "basic" or 'literal' parts joined by dots) from t[i] → { path, end } or null.
// Quoted parts are decoded (so "model" is model); one that doesn't decode is left unparsed (refused).
function scanKey(t, i) {
  const path = [];
  let j = i;
  for (;;) {
    j = skipSp(t, j);
    const c = t[j];
    if (c === '"' || c === "'") {
      if (t[j + 1] === c && t[j + 2] === c) return null; // a multi-line string isn't a key
      const e = scanShortString(t, j);
      if (e < 0) return null;
      const part = decodeString(t.slice(j + 1, e - 1), c === '"');
      if (part === null) return null;
      path.push(part);
      j = e;
    } else {
      const m = /^[A-Za-z0-9_-]+/.exec(t.slice(j, j + 256));
      if (!m) return null;
      path.push(m[0]);
      j += m[0].length;
    }
    const k = skipSp(t, j);
    if (t[k] !== ".") return { path, end: j };
    j = k + 1;
  }
}
export function parseRoot(text) {
  const t = String(text ?? "");
  const entries = [];
  let i = t.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < t.length) {
    const start = i;
    let j = skipSp(t, i);
    if (j >= t.length) break;
    if (isNl(t, j)) {
      i = j + nlLen(t, j);
      continue;
    }
    if (t[j] === "#") {
      const e = lineEnd(t, j);
      i = e < t.length ? e + nlLen(t, e) : e;
      continue;
    }
    if (t[j] === "[") return { entries, headerAt: start, headers: tableHeaders(t, start) };
    const k = scanKey(t, j);
    if (!k) return { error: "unparsed", line: lineNo(t, start) };
    j = skipSp(t, k.end);
    if (t[j] !== "=") return { error: "unparsed", line: lineNo(t, start) };
    const valueStart = skipSp(t, j + 1);
    const v = scanValue(t, valueStart);
    if (!v) return { error: "unparsed", line: lineNo(t, start) };
    let e = skipSp(t, v.end);
    if (t[e] === "#") e = lineEnd(t, e);
    if (e < t.length && !isNl(t, e)) return { error: "unparsed", line: lineNo(t, start) };
    const end = e < t.length ? e + nlLen(t, e) : e;
    entries.push({ path: k.path, start, valueStart, valueEnd: v.end, end, multiline: v.multiline });
    i = end;
  }
  return { entries, headerAt: null, headers: [] };
}
function lineNo(t, i) {
  return t.slice(0, i).split("\n").length;
}
// The table headers from the first one on (`from` — its line start) → [path], keys decoded like root keys, so
// ["mod\u0065l"] is [model]. Walks the lines the way parseRoot does, skipping whole values, so a "[" line inside a
// multi-line string or array is never taken for a header. A header that doesn't parse is null (it might name any key);
// another line that doesn't parse is skipped to its end (Codex can't load such a file anyway).
export function tableHeaders(t, from) {
  const out = [];
  let i = from;
  while (i < t.length) {
    const j = skipSp(t, i);
    if (j >= t.length) break;
    if (isNl(t, j)) {
      i = j + nlLen(t, j);
      continue;
    }
    let e = lineEnd(t, j);
    if (t[j] === "[") {
      const aot = t[j + 1] === "[";
      const k = scanKey(t, j + (aot ? 2 : 1));
      const close = k ? skipSp(t, k.end) : -1;
      out.push(k && t.startsWith(aot ? "]]" : "]", close) ? k.path : null);
    } else if (t[j] !== "#") {
      const k = scanKey(t, j);
      const eq = k ? skipSp(t, k.end) : -1;
      const v = k && t[eq] === "=" ? scanValue(t, skipSp(t, eq + 1)) : null;
      if (v) e = lineEnd(t, v.end);
    }
    i = e < t.length ? e + nlLen(t, e) : e;
  }
  return out;
}
// A table whose first key part is `key` ([model], [model.x], [[model]], ["model"]) or a header that doesn't parse:
// `key` may then be a table, not a root string — refused rather than guessed.
const tableNamed = (parsed, key) => parsed.headers.some((p) => p === null || p[0] === key);
// The string value of a root entry → string, or null when it isn't a single-line string TOML would accept
function stringValue(t, e) {
  const raw = t.slice(e.valueStart, e.valueEnd);
  if (e.multiline || raw.length < 2) return null;
  const q = raw[0];
  if ((q !== '"' && q !== "'") || (raw[1] === q && raw[2] === q) || raw.at(-1) !== q) return null;
  return decodeString(raw.slice(1, -1), q === '"');
}
// One root key, as the page sees it → { state: "absent" | "ok" | "odd", value }
// odd — written in a form the plugin neither shows nor edits (not a string, multi-line, dotted, repeated, a table)
export function rootKey(text, parsed, key) {
  const exact = parsed.entries.filter((e) => e.path.length === 1 && e.path[0] === key);
  const dotted = parsed.entries.some((e) => e.path.length > 1 && e.path[0] === key);
  if (dotted || exact.length > 1 || tableNamed(parsed, key)) return { state: "odd", value: null };
  if (!exact.length) return { state: "absent", value: null };
  const v = stringValue(text, exact[0]);
  return v === null ? { state: "odd", value: null } : { state: "ok", value: v };
}
export function readRoot(text) {
  const parsed = parseRoot(text);
  if (parsed.error) return { error: parsed.error, line: parsed.line };
  const out = {};
  for (const [name, key] of Object.entries(KEYS)) out[name] = rootKey(text, parsed, key);
  return out;
}

class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};
// Set (value — a string) or remove (null) one root key; → the new text. Only the key's value (set) or its line
// (remove, insert) changes. A new key goes right after the last root entry; with none — before the first table and the
// comments sitting right above it, then a blank line; with no tables — at the end.
export function setRootKey(text, key, value) {
  if (!WRITABLE.has(key)) refuse("not-allowed");
  if (value !== null && !(key === KEYS.model ? MODEL_RE : EFFORT_RE).test(value)) refuse("bad-arg");
  const t = String(text ?? "");
  const parsed = parseRoot(t);
  if (parsed.error) refuse("config-unparsed");
  const exact = parsed.entries.filter((e) => e.path.length === 1 && e.path[0] === key);
  if (parsed.entries.some((e) => e.path.length > 1 && e.path[0] === key) || exact.length > 1 || tableNamed(parsed, key)) refuse("config-odd");
  const e = exact[0];
  if (e && (e.multiline || stringValue(t, e) === null)) refuse("config-odd");
  const bom = t.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (value === null) {
    if (!e) return t;
    // a line between the file start (or a blank line) and a blank line takes that blank line along: what an insertion
    // above the first table added goes away as a whole, and two blank lines don't pile up
    let end = e.end;
    const prevBlank = e.start <= bom || /^[ \t]*\r?$/.test(t.slice(Math.max(bom, t.lastIndexOf("\n", e.start - 2) + 1), e.start - 1));
    const next = skipSp(t, end);
    if (prevBlank && next < t.length && isNl(t, next)) end = next + nlLen(t, next);
    return t.slice(0, e.start) + t.slice(end);
  }
  const lit = `"${value}"`;
  if (e) return t.slice(0, e.valueStart) + lit + t.slice(e.valueEnd);
  const entry = `${key} = ${lit}`;
  if (parsed.entries.length) {
    const at = parsed.entries.at(-1).end;
    const eol = eolNear(t, at);
    const lead = at > bom && t[at - 1] !== "\n" ? eol : "";
    return t.slice(0, at) + lead + entry + eol + t.slice(at);
  }
  if (parsed.headerAt !== null) {
    // step back over the comment lines right above the first header: they describe that table
    let at = parsed.headerAt;
    for (;;) {
      if (at <= bom) break;
      const prevEnd = at - 1 - (t[at - 2] === "\r" ? 1 : 0); // the previous line's newline
      let ps = prevEnd;
      while (ps > bom && t[ps - 1] !== "\n") ps--;
      if (!/^[ \t]*#/.test(t.slice(ps, prevEnd))) break;
      at = ps;
    }
    const eol = eolNear(t, at);
    const blank = isNl(t, skipSp(t, at)) ? "" : eol;
    return t.slice(0, at) + entry + eol + blank + t.slice(at);
  }
  const eol = eolNear(t, t.length);
  const lead = t.length > bom && !t.endsWith("\n") ? eol : "";
  return t + lead + entry + eol;
}
// The line ending for a line inserted at `at` (a line start or the end of the text): the newline right above it, else
// the next one, else the file's most common one (LF for a file without newlines)
export function eolNear(t, at) {
  const kind = (nl) => (t[nl - 1] === "\r" ? "\r\n" : "\n");
  if (at > 0 && t[at - 1] === "\n") return kind(at - 1);
  const next = t.indexOf("\n", at);
  if (next >= 0) return kind(next);
  const crlf = (t.match(/\r\n/g) || []).length;
  return crlf * 2 > (t.match(/\n/g) || []).length ? "\r\n" : "\n";
}

// ---------- writing config.toml ----------
const BACKUP_RE = /^config\.toml\..+-agenthub$/;
export const KEEP_BACKUPS = 20;
const dataDir = () => process.env.AGENTHUB_PLUGIN_DATA_PATH || null;
const backupsDir = () => (dataDir() ? join(dataDir(), "backups") : null);
function stamp(now) {
  return new Date(now).toISOString().replace(/[:.]/g, "-");
}
export function pruneBackups(keep = KEEP_BACKUPS) {
  const dir = backupsDir();
  if (!dir) return;
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => BACKUP_RE.test(n)).sort();
  } catch {
    return;
  }
  for (const n of names.slice(0, Math.max(0, names.length - keep))) rmSync(join(dir, n), { force: true });
}

// A new temp file next to `path` (the rename has to stay on one volume): a random name, created exclusively — a file
// or a link planted under a guessable name is never written through — and owner-only while it is being written
// (config.toml may hold tokens in env tables). → { tmp, fd }
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

// Read → edit (editFn: text → new text, may throw a Refusal) → backup → temp file → check the file didn't change →
// rename. The temp file is removed on every path that doesn't end in the rename. Changed between the read and the
// write — re-read and retry (up to 3 times), otherwise config-busy. config.toml is a symlink (dotfiles)? The file it
// points to is written; the link stays. → { ok, changed?, reason? }
export function writeConfig(home, editFn, { now = Date.now(), beforeRename = null } = {}) {
  const link = configPath(home);
  let path = link;
  let isLink = false;
  try {
    isLink = lstatSync(link).isSymbolicLink();
  } catch {}
  if (isLink) {
    try {
      path = realpathSync(link);
    } catch {
      return { ok: false, reason: "config-link-broken" }; // dangling link: don't replace it with a regular file
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let text = null;
    let mode = 0o600;
    try {
      text = readFileSync(path, "utf8");
      mode = statSync(path).mode & 0o777;
    } catch (e) {
      if (e.code !== "ENOENT") return { ok: false, reason: "config-unreadable" };
    }
    let out;
    try {
      out = editFn(text ?? "");
    } catch (e) {
      if (e instanceof Refusal) return { ok: false, reason: e.message };
      throw e;
    }
    if (out === (text ?? "")) return { ok: true, changed: false };
    mkdirSync(dirname(path), { recursive: true });
    if (text !== null && backupsDir()) {
      mkdirSync(backupsDir(), { recursive: true });
      writeFileSync(join(backupsDir(), `config.toml.${stamp(now)}-agenthub`), text, { mode: 0o600 });
      pruneBackups();
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
      return { ok: true, changed: true };
    } finally {
      if (!renamed) rmSync(tmp, { force: true });
    }
  }
  return { ok: false, reason: "config-busy" };
}

// ---------- Codex's model list ----------
// models_cache.json → { models: [{ slug, label, listed, priority, levels, defaultLevel, chatgptOnly }], fetchedAt,
// version } or null. chatgptOnly — `supported_in_api: false`: Codex lists the model only with a ChatGPT sign-in.
// Only these fields are taken; a model with an id the actions couldn't write is skipped.
export function loadModels(home) {
  let j;
  try {
    j = JSON.parse(readFileSync(cachePath(home), "utf8"));
  } catch {
    return null;
  }
  if (!j || !Array.isArray(j.models)) return null;
  const models = [];
  for (const m of j.models) {
    if (!m || typeof m.slug !== "string" || !MODEL_RE.test(m.slug)) continue;
    const levels = [];
    for (const l of Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : []) {
      const e = typeof l === "string" ? l : l?.effort;
      if (typeof e === "string" && EFFORT_RE.test(e) && !levels.includes(e)) levels.push(e);
    }
    models.push({
      slug: m.slug,
      label: typeof m.display_name === "string" && m.display_name.trim() ? clean(m.display_name, 40) : m.slug,
      listed: m.visibility === "list",
      priority: Number.isFinite(m.priority) ? m.priority : Number.MAX_SAFE_INTEGER,
      levels,
      defaultLevel: typeof m.default_reasoning_level === "string" && EFFORT_RE.test(m.default_reasoning_level) ? m.default_reasoning_level : null,
      chatgptOnly: m.supported_in_api === false,
    });
  }
  models.sort((a, b) => a.priority - b.priority);
  return {
    models,
    fetchedAt: typeof j.fetched_at === "string" ? clean(j.fetched_at, 40) : null,
    version: typeof j.client_version === "string" ? clean(j.client_version, 20) : null,
  };
}
// version.json (Codex's update check) → its latest_version "x.y.z", or null. Not the installed version — no file in
// ~/.codex names that — only the newest one Codex has seen.
export function latestCodexVersion(home) {
  try {
    const v = JSON.parse(readFileSync(versionPath(home), "utf8"))?.latest_version;
    return typeof v === "string" && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
// a newer than b ("x.y.z"; anything else isn't compared)
export function newerVersion(a, b) {
  const pa = /^(\d+)\.(\d+)\.(\d+)$/.exec(a || "");
  const pb = /^(\d+)\.(\d+)\.(\d+)$/.exec(b || "");
  if (!pa || !pb) return false;
  for (let i = 1; i <= 3; i++) if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) > Number(pb[i]);
  return false;
}
// The picker list: models with visibility "list" in priority order. The default (no `model` key) is the first of them.
export const pickerModels = (cache) => (cache ? cache.models.filter((m) => m.listed) : []);
export const defaultModel = (cache) => pickerModels(cache)[0] || cache?.models[0] || null;
const findModel = (cache, slug) => (cache && slug ? cache.models.find((m) => m.slug === slug) || null : null);
// The model new sessions get: the configured one, or Codex's default → the cache entry or null (unknown)
function effectiveModel(cache, root) {
  return root.model.state === "ok" ? findModel(cache, root.model.value) : defaultModel(cache);
}

// ---------- collect ----------
export function collect({ home = homedir() } = {}) {
  if (!codexInstalled(home)) return { installed: false };
  let text = "";
  try {
    text = readFileSync(configPath(home), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") return { installed: true, broken: "unreadable" };
  }
  const root = readRoot(text);
  if (root.error) return { installed: true, broken: "unparsed", line: root.line };
  const cache = loadModels(home);
  return { installed: true, root, cache, model: effectiveModel(cache, root), latest: latestCodexVersion(home) };
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
const GREY = "#8E8E93";

export function render(r, { lang = envLang() } = {}) {
  LANG = lang === "en" ? "en" : "ru";
  const out = [];
  if (!r.installed) {
    out.push(line(tr("Codex не установлен", "Codex isn't installed"), { status: "unknown", tile: tr("нет", "none"), tileLabel: TILE_LABEL() }));
    out.push("---");
    out.push(line(tr("Плагин показывает настройки Codex CLI, когда он установлен (папка ~/.codex)", "The plugin shows Codex CLI settings once it is installed (the ~/.codex folder)")));
    return `${out.join("\n")}\n`;
  }
  if (r.broken) {
    out.push(line(tr("Настройки Codex не читаются", "Codex settings unreadable"), { status: "error", tile: tr("сбой", "error"), tileLabel: TILE_LABEL() }));
    out.push("---");
    if (r.broken === "unreadable") out.push(line(tr("Не получается прочитать ~/.codex/config.toml", "Can't read ~/.codex/config.toml")));
    else
      out.push(
        line(
          tr(
            `~/.codex/config.toml: строку ${r.line} до первой таблицы плагин не разобрал. Он не меняет файл, пока её не исправят`,
            `~/.codex/config.toml: the plugin couldn't parse line ${r.line} before the first table. It won't change the file until it's fixed`,
          ),
        ),
      );
    return `${out.join("\n")}\n`;
  }
  const { root, cache, model: eff } = r;
  const def = defaultModel(cache);
  const labelOf = (slug) => findModel(cache, slug)?.label || slug;
  const defModelText = def ? def.label : tr("модель Codex", "Codex's model");
  const modelSet = root.model.state === "ok";
  const effortSet = root.effort.state === "ok";
  const modelShort = modelSet ? labelOf(root.model.value) : root.model.state === "odd" ? "?" : defModelText;
  const modelLong = modelSet ? modelShort : root.model.state === "odd" ? "?" : tr(`по умолчанию (${defModelText})`, `default (${defModelText})`);
  const effDefault = eff?.defaultLevel || null;
  const effortShort = effortSet ? root.effort.value : root.effort.state === "odd" ? "?" : effDefault || tr("по умолч.", "default");
  const effortLong = effortSet ? root.effort.value : root.effort.state === "odd" ? "?" : effDefault ? tr(`по умолчанию (${effDefault})`, `default (${effDefault})`) : tr("по умолчанию", "default");

  out.push(line(tr(`Базовые: ${modelLong} · ${effortLong}`, `Base: ${modelLong} · ${effortLong}`), { status: "ok", tile: `${modelShort} · ${effortShort}`, tileLabel: TILE_LABEL() }));
  out.push("---");
  out.push(line(tr("Для новых сессий", "For new sessions")));

  // Model: a dropdown (the list is Codex's own and can be long)
  out.push(line(tr("Модель", "Model"), { select: "true" }));
  const defLabel = tr(`По умолчанию (${defModelText})`, `Default (${defModelText})`);
  out.push(`--${line(defLabel, root.model.state === "absent" ? { selected: "true" } : { action: "set-model", arg: "default" })}`);
  const picker = pickerModels(cache);
  // Codex hides a model that isn't supported_in_api from a sign-in other than ChatGPT; the plugin can't tell the sign-in
  const chatgptNote = (m) => (m.chatgptOnly ? tr("только со входом через ChatGPT", "ChatGPT sign-in only") : undefined);
  for (const m of picker) out.push(`--${line(m.label, { ...(modelSet && root.model.value === m.slug ? { selected: "true" } : { action: "set-model", arg: m.slug }), note: chatgptNote(m) })}`);
  if (modelSet && !picker.some((m) => m.slug === root.model.value)) {
    // a model typed by hand or hidden from Codex's picker: shown as it is, one more item
    out.push(`--${line(labelOf(root.model.value), { selected: "true", note: tr("нет в списке Codex", "not in Codex's list") })}`);
  }

  // Effort: the levels the model new sessions get lists, as a segment; "default" removes the key
  out.push(line("Effort", { segment: "true" }));
  const levels = eff ? eff.levels : [];
  out.push(
    `--${line(tr("по умолч.", "default"), {
      ...(root.effort.state === "absent" ? { selected: "true" } : { action: "set-effort", arg: "default" }),
      tooltip: effDefault ? tr(`уровень модели по умолчанию — ${effDefault}`, `the model's default level — ${effDefault}`) : undefined,
    })}`,
  );
  for (const l of levels) out.push(`--${line(l, effortSet && root.effort.value === l ? { selected: "true" } : { action: "set-effort", arg: l })}`);
  if (effortSet && !levels.includes(root.effort.value)) out.push(`--${line(root.effort.value, { selected: "true", color: ORANGE })}`);

  // warnings
  if (root.model.state === "odd" || root.effort.state === "odd") {
    const keys = [root.model.state === "odd" ? KEYS.model : null, root.effort.state === "odd" ? KEYS.effort : null].filter(Boolean).join(", ");
    out.push(line(tr(`${keys} в config.toml записан так, что плагин его не меняет (не строка, в несколько строк, с точкой или дважды) — поправьте вручную`, `${keys} in config.toml is written in a form the plugin doesn't edit (not a string, multi-line, dotted or repeated) — fix it by hand`), { color: ORANGE }));
  }
  if (!cache) out.push(line(tr("Список моделей появится, когда Codex его скачает (~/.codex/models_cache.json): запустите Codex", "The model list appears once Codex fetches it (~/.codex/models_cache.json): start Codex"), { color: ORANGE }));
  else if (modelSet && !eff) out.push(line(tr(`Модели ${root.model.value} нет в списке Codex — её уровни effort неизвестны`, `Codex's list has no ${root.model.value} — its effort levels are unknown`), { color: ORANGE }));
  if (effortSet && eff && !levels.includes(root.effort.value)) out.push(line(tr(`У ${eff.label} нет уровня ${root.effort.value}`, `${eff.label} has no ${root.effort.value} level`), { color: ORANGE }));
  // Codex 0.159 refuses to load a config with a top-level profile (profiles are --profile <name> + <name>.config.toml)
  if (root.profile.state !== "absent") {
    const p = root.profile.state === "ok" ? ` = "${clean(root.profile.value, 40)}"` : "";
    out.push(line(tr(`В config.toml есть строка profile${p}: с ней Codex не запускается — удалите её, профиль выбирается флагом --profile`, `config.toml has a profile${p} line: Codex refuses to start with it — remove it and pick a profile with --profile`), { color: ORANGE }));
  }
  // models from another provider or a catalog file: models_cache.json may not be the list Codex uses
  const provider = root.provider.state === "ok" ? root.provider.value : null;
  const otherProvider = root.provider.state === "odd" || (provider !== null && provider !== "openai");
  if (otherProvider || root.catalog.state !== "absent") {
    const what = [otherProvider ? `model_provider${provider ? ` = "${clean(provider, 40)}"` : ""}` : null, root.catalog.state !== "absent" ? "model_catalog_json" : null].filter(Boolean).join(", ");
    out.push(line(tr(`В config.toml задан ${what}: Codex берёт модели оттуда, и этот список может не совпадать`, `config.toml sets ${what}: Codex takes its models from there, so this list may not match`), { color: ORANGE }));
  }
  // Codex refetches the list when its own version differs from the cache's; a newer Codex is out — maybe installed
  if (cache?.version && newerVersion(r.latest, cache.version)) {
    out.push(line(tr(`Список моделей скачан Codex ${cache.version}, а вышел ${r.latest}: если вы обновились, запустите Codex — список обновится`, `The model list was fetched by Codex ${cache.version} and ${r.latest} is out: if you've updated, start Codex to refresh the list`), { color: GREY }));
  }
  out.push(
    line(
      tr(
        "Пишется в ~/.codex/config.toml, только model и model_reasoning_effort. Открытые сессии Codex не меняются — для них /model",
        "Written to ~/.codex/config.toml, only model and model_reasoning_effort. Open Codex sessions keep theirs — use /model there",
      ),
      { color: GREY },
    ),
  );
  out.push(line(tr("Для отдельного запуска их перекрывают --profile, -c и .codex/config.toml проекта", "For a single run they are overridden by --profile, -c and a project's .codex/config.toml"), { color: GREY }));
  if (cache) {
    out.push(line(tr("Подробности", "Details"), { details: "true" }));
    const when = cache.fetchedAt ? cache.fetchedAt.replace("T", " ").replace(/\..*$|Z$/, "") : "?";
    out.push(`--${line(tr(`Список моделей: ~/.codex/models_cache.json, Codex ${cache.version || "?"}, обновлён ${when}`, `Model list: ~/.codex/models_cache.json, Codex ${cache.version || "?"}, fetched ${when}`), { color: GREY })}`);
    if (eff) out.push(`--${line(`${eff.label}: ${eff.slug}`, { color: GREY })}`);
  }
  return `${out.join("\n")}\n`;
}

// ---------- actions ----------
export const REFUSALS = {
  "bad-arg": ["Такого значения нет.", "No such value."],
  "no-codex": ["Codex не установлен: нет папки ~/.codex.", "Codex isn't installed: there's no ~/.codex folder."],
  "no-models": ["Codex ещё не скачал список моделей — запустите Codex и повторите.", "Codex hasn't fetched its model list yet — start Codex and try again."],
  "unknown-model": ["Такой модели нет в списке Codex.", "Codex's list has no such model."],
  "unsupported-effort": ["У этой модели нет такого уровня effort.", "This model has no such effort level."],
  "config-unreadable": ["Не получается прочитать ~/.codex/config.toml.", "Can't read ~/.codex/config.toml."],
  "config-unparsed": ["Начало ~/.codex/config.toml не разобрано — плагин его не трогает.", "The top of ~/.codex/config.toml couldn't be parsed — the plugin leaves it alone."],
  "config-odd": ["Ключ в config.toml записан так, что плагин его не меняет — поправьте вручную.", "The key in config.toml is in a form the plugin doesn't edit — change it by hand."],
  "config-link-broken": ["~/.codex/config.toml — ссылка в никуда: плагин не заменяет её файлом.", "~/.codex/config.toml is a dangling link: the plugin won't replace it with a file."],
  "config-busy": ["Настройки менялись одновременно с плагином — попробуйте ещё раз.", "The settings changed at the same time — try again."],
  "not-allowed": ["Этот ключ настроек плагин не меняет.", "The plugin doesn't change this settings key."],
  "plugin-failed": ["Сбой плагина — подробности в журнале хаба.", "Plugin failure — see the hub journal."],
  "unknown-action": ["Плагин не знает такого действия.", "The plugin doesn't know this action."],
};
export function refusalMessage(reason, lang = envLang()) {
  const t = REFUSALS[reason];
  return t ? t[lang === "en" ? 1 : 0] : null;
}
export function refusalLines(r, lang = envLang()) {
  const msg = refusalMessage(r.reason, lang);
  return [...(msg ? [`message=${msg}`] : []), `reason=${r.reason}`];
}

// The current root as the action sees it (read again under writeConfig for the write itself) → root or a refusal
function rootNow(home) {
  let text = "";
  try {
    text = readFileSync(configPath(home), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") return { reason: "config-unreadable" };
  }
  const root = readRoot(text);
  return root.error ? { reason: "config-unparsed" } : { root };
}

// → { ok, reason? }
export function runAction([id, arg], { home = homedir(), now = Date.now(), beforeRename = null } = {}) {
  if (!codexInstalled(home)) return { ok: false, reason: "no-codex" };
  const write = (fn) => {
    const r = writeConfig(home, fn, { now, beforeRename });
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  };
  if (id === "set-model") {
    if (typeof arg !== "string" || (arg !== "default" && !MODEL_RE.test(arg))) return { ok: false, reason: "bad-arg" };
    const cache = loadModels(home);
    if (arg !== "default") {
      if (!cache) return { ok: false, reason: "no-models" };
      // only a model from the page's list (or the one already set — a no-op)
      const now0 = rootNow(home);
      const already = now0.root?.model.state === "ok" && now0.root.model.value === arg;
      if (!pickerModels(cache).some((m) => m.slug === arg) && !already) return { ok: false, reason: "unknown-model" };
    }
    return write((t) => {
      let out = setRootKey(t, KEYS.model, arg === "default" ? null : arg);
      // an effort the new model doesn't list goes away: the model's own default rather than a level it lacks
      const root = readRoot(out);
      const m = effectiveModel(cache, root);
      if (m && root.effort.state === "ok" && !m.levels.includes(root.effort.value)) out = setRootKey(out, KEYS.effort, null);
      return out;
    });
  }
  if (id === "set-effort") {
    if (typeof arg !== "string" || (arg !== "default" && !EFFORT_RE.test(arg))) return { ok: false, reason: "bad-arg" };
    if (arg === "default") return write((t) => setRootKey(t, KEYS.effort, null));
    const cache = loadModels(home);
    if (!cache) return { ok: false, reason: "no-models" };
    return write((t) => {
      const root = readRoot(t);
      if (root.error) refuse("config-unparsed");
      if (root.model.state === "odd") refuse("config-odd");
      const m = effectiveModel(cache, root);
      if (!m) refuse("unknown-model");
      if (!m.levels.includes(arg)) refuse("unsupported-effort");
      return setRootKey(t, KEYS.effort, arg);
    });
  }
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
    process.stdout.write(r.ok ? "ok\n" : `${refusalLines(r, envLang()).join("\n")}\n`);
    process.exitCode = r.ok ? 0 : 3;
    return;
  }
  try {
    process.stdout.write(render(collect(), { lang: envLang() }));
  } catch (e) {
    LANG = envLang();
    process.stdout.write(`${line(tr("Codex: сбой плагина", "Codex: plugin failure"), { status: "error", event: "source-broken" })}\n---\n${clean(e?.message || e)}\n`);
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
