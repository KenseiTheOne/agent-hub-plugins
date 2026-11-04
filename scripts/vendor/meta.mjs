// Метаданные плагина: имя файла и теги <agenthub.*> из комментариев (у бинарников — xattr).
//
// Имя файла: {name}.{interval}.{ext} или {name}.{ext}; интервал — число + ms|s|m|h|d.
// Плагин-папка: <dir>/ с файлом <dir>.{interval}.{ext} или <dir>.{ext} внутри.

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { loadNative } from "./native.mjs";

export const XATTR_NAME = "com.kensei.agenthub.meta";
export const LEVELS = ["immediate", "confirm", "confirm-cost"];
const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const IGNORED_EXT = new Set(["md", "txt", "json", "lock", "log", "orig", "bak", "swp"]);

// Многозначные теги (повторяются → массив).
const MULTI = new Set(["watch", "fsRead", "fsWrite", "exec", "secrets", "net"]);
// Теги со списком через запятую.
const CSV = new Set(["effects", "platforms"]);

export function parseInterval(text) {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(String(text));
  if (!m) return null;
  return Number(m[1]) * UNIT_MS[m[2]];
}

// → { id, interval, intervalMs, ext } | null
export function parseFileName(fileName) {
  const name = basename(fileName);
  if (!name || name.startsWith(".") || name.startsWith("_")) return null;
  let m = /^(.+)\.(\d+(?:ms|s|m|h|d))\.([A-Za-z0-9]+)$/.exec(name);
  if (m) return { id: m[1], interval: m[2], intervalMs: parseInterval(m[2]), ext: m[3].toLowerCase() };
  m = /^(.+)\.([A-Za-z0-9]+)$/.exec(name);
  if (m) {
    const ext = m[2].toLowerCase();
    if (IGNORED_EXT.has(ext)) return null;
    return { id: m[1], interval: null, intervalMs: null, ext };
  }
  // без расширения (бинарник)
  if (/^[A-Za-z0-9][\w-]*$/.test(name)) return { id: name, interval: null, intervalMs: null, ext: "" };
  return null;
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function parseAttrs(text) {
  const out = {};
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = unescapeXml(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

// Аргумент параметризованного действия: arg="taskId:^[A-Za-z0-9_-]{1,64}$" → { name, pattern } | null.
// Шаблон обязан быть привязан к началу и концу (^…$): иначе «совпадение» по подстроке пропустило бы что угодно.
// Значение аргумента ядро сверяет с шаблоном и передаёт отдельным элементом argv, без шелла (lib/core.mjs).
export const ACTION_ARG_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
export function parseActionArg(text) {
  const m = /^([^:]+):(.+)$/.exec(String(text ?? ""));
  if (!m || !ACTION_ARG_NAME_RE.test(m[1])) return null;
  const pattern = m[2];
  if (pattern.length > 200 || !pattern.startsWith("^") || !pattern.endsWith("$") || pattern.endsWith("\\$")) return null;
  try {
    new RegExp(pattern, "u");
  } catch {
    return null;
  }
  return { name: m[1], pattern };
}

// Правило push для ключа события плагина:
//   <agenthub.push key="unity-open" hold="evening" quiet="true" macOnly="true" cooldown="7d" away="5m">Ярлык</agenthub.push>
// Ядро и служба push берут такие правила только у встроенных и официальных плагинов (tier из подписанного
// индекса); у остальных они игнорируются. → { key, label, hold?, quietException?, macOnly?, cooldownMs?, awayDelayMs? } | текст ошибки
export function parsePushRule(attrs, label) {
  const key = attrs.key;
  if (!key || !/^[\w.-]{1,64}$/.test(key)) return "нет корректного key";
  const out = { key, label: label ? label.slice(0, 80) : null };
  if (attrs.hold !== undefined) {
    if (attrs.hold !== "evening") return `${key}: hold только evening`;
    out.hold = "evening";
  }
  const bool = (v) => (v === "true" ? true : v === "false" ? false : undefined);
  if (attrs.quiet !== undefined) out.quietException = bool(attrs.quiet) ?? false;
  if (attrs.macOnly !== undefined) out.macOnly = bool(attrs.macOnly) ?? false;
  for (const [a, k] of [["cooldown", "cooldownMs"], ["away", "awayDelayMs"]]) {
    if (attrs[a] === undefined) continue;
    const ms = parseInterval(attrs[a]);
    if (ms === null) return `${key}: ${a} — число и ms|s|m|h|d`;
    out[k] = ms;
  }
  return out;
}

// Разбор тегов из текста. Возвращает { meta, warnings }.
export function parseMetaText(text) {
  const warnings = [];
  const meta = {
    title: null,
    version: null,
    author: {},
    desc: null,
    type: "standard",
    schedule: null,
    platforms: [],
    watch: [],
    fsRead: [],
    fsWrite: [],
    exec: [],
    secrets: [],
    net: [],
    effects: [],
    actions: [],
    push: [],
    extra: {},
  };
  const re = /<agenthub\.([A-Za-z][\w.]*)((?:\s+[^>]*)?)>([\s\S]*?)<\/agenthub\.\1>/g;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1];
    const attrs = parseAttrs(m[2] || "");
    const value = unescapeXml(m[3].replace(/\s*\n\s*(?:#|\/\/|--|;)?\s*/g, " ").trim());
    if (tag === "action") {
      const id = attrs.id;
      const level = attrs.level || "confirm";
      if (!id || !/^[A-Za-z0-9][\w.-]{0,63}$/.test(id)) {
        warnings.push(`action без корректного id: «${value.slice(0, 40)}»`);
        continue;
      }
      if (!LEVELS.includes(level)) {
        warnings.push(`action ${id}: неизвестный level «${level}»`);
        continue;
      }
      if (!value) {
        warnings.push(`action ${id}: пустая команда`);
        continue;
      }
      if (meta.actions.some((a) => a.id === id)) {
        warnings.push(`action ${id}: повтор id`);
        continue;
      }
      let arg = null;
      if (attrs.arg !== undefined) {
        arg = parseActionArg(attrs.arg);
        if (!arg) {
          warnings.push(`action ${id}: arg ждём «имя:^шаблон$» (имя [A-Za-z][A-Za-z0-9_]{0,31}, шаблон с ^ и $, до 200 символов)`);
          continue;
        }
      }
      meta.actions.push({ id, level, command: value, title: attrs.title || null, cost: attrs.cost || null, ...(arg ? { arg } : {}) });
    } else if (tag === "push") {
      const r = parsePushRule(attrs, value);
      if (typeof r === "string") warnings.push(`push: ${r}`);
      else if (meta.push.some((x) => x.key === r.key)) warnings.push(`push ${r.key}: повтор ключа`);
      else if (meta.push.length >= 32) warnings.push("push: больше 32 правил");
      else meta.push.push(r);
    } else if (tag.startsWith("author.")) {
      meta.author[tag.slice(7)] = value;
    } else if (tag === "type") {
      if (value === "standard" || value === "streamable") meta.type = value;
      else warnings.push(`неизвестный type «${value}»`);
    } else if (MULTI.has(tag)) {
      meta[tag].push(value);
    } else if (CSV.has(tag)) {
      meta[tag].push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (tag === "title" || tag === "version" || tag === "desc" || tag === "schedule") {
      meta[tag] = value;
    } else {
      meta.extra[tag] = value;
    }
  }
  return { meta, warnings };
}

// Записи вида «что — зачем»: отделяем объект от пояснения.
export function splitWhy(entry) {
  const m = /^(.*?)\s+[—–-]{1,2}\s+(.*)$/.exec(entry);
  return m ? { what: m[1].trim(), why: m[2].trim() } : { what: entry.trim(), why: null };
}

const HEAD_BYTES = 64 * 1024;

function readHead(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

function readXattr(path) {
  const native = loadNative();
  if (native) return native.getXattr(path, XATTR_NAME);
  try {
    return execFileSync("/usr/bin/xattr", ["-p", XATTR_NAME, path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function decodeXattr(raw) {
  if (!raw) return "";
  if (raw.includes("<agenthub.")) return raw;
  try {
    const t = Buffer.from(raw.trim(), "base64").toString("utf8");
    if (t.includes("<agenthub.")) return t;
  } catch {}
  return "";
}

// Полные метаданные файла плагина. → { file, id, interval, intervalMs, ext, binary, meta, warnings }
export function readPluginMeta(path) {
  const fn = parseFileName(path);
  if (!fn) return null;
  const st = statSync(path);
  if (!st.isFile()) return null;
  const head = readHead(path);
  const binary = head.subarray(0, 8192).includes(0);
  const text = binary ? decodeXattr(readXattr(path)) : head.toString("utf8");
  const { meta, warnings } = parseMetaText(text);
  return { file: path, ...fn, binary, executable: (st.mode & 0o111) !== 0, meta, warnings };
}
