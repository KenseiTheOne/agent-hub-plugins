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
const LANG_RE = /^[a-z]{2}$/;
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

// Версия контракта плагинов, которую понимает это ядро (docs/extension-points.md, «Версии контракта»): 1 — до 09.11
// (неявно), 2 — чистка ядра от названий плагинов: свои переключатели уведомлений (kind="plugin"), значок
// (<agenthub.icon>), подключения (<agenthub.connection>), текст отказа действия (message=), сам тег
// <agenthub.contract>. Плагин объявляет минимальную нужную ему версию; новее этой — установка и обновление
// отказывают «нужен хаб новее» (а не ошибкой линтера).
export const CONTRACT_VERSION = 2;

// Правило push для ключа события плагина:
//   <agenthub.push key="build-blocked" hold="evening" quiet="true" macOnly="true" cooldown="7d" away="5m" kind="plugin">Ярлык</agenthub.push>
// Ядро и служба push берут такие правила только у встроенных, официальных и своих плагинов (tier из политики
// менеджера: подписанный индекс или согласие на свой); у остальных они игнорируются. kind — вид уведомления для
// выключателей в «Настройках» (PUSH_KINDS): общий вид ядра, "plugin" — свой переключатель плагина (строка с
// названием плагина в «Настройках → Уведомления»), "security" — исключение безопасности, не выключается.
// Устаревшие виды контракта 1 ("runs", "night") принимаются как "plugin" (линтер предупреждает) и запоминаются в
// legacyKind: выключенный пользователем прежний вид гасит свой переключатель плагина (lib/push/prefs.mjs). Тот же
// перенос для правила с новым видом — атрибут was="runs|night". → { key, label, hold?, quietException?, macOnly?,
// cooldownMs?, awayDelayMs?, kind?, legacyKind? } | текст ошибки
export const PUSH_KINDS = ["sessions", "updates", "problems", "other", "security", "plugin"];
export const LEGACY_PUSH_KINDS = ["runs", "night"];
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
  if (attrs.kind !== undefined) {
    if (LEGACY_PUSH_KINDS.includes(attrs.kind)) {
      out.kind = "plugin";
      out.legacyKind = attrs.kind;
    } else if (!PUSH_KINDS.includes(attrs.kind)) return `${key}: kind ждём ${PUSH_KINDS.join("|")}`;
    else out.kind = attrs.kind;
  }
  if (attrs.was !== undefined) {
    if (!LEGACY_PUSH_KINDS.includes(attrs.was)) return `${key}: was ждём ${LEGACY_PUSH_KINDS.join("|")}`;
    if (out.kind !== "plugin") return `${key}: was — только у kind="plugin"`;
    out.legacyKind = attrs.was;
    out.wasDeclared = true;
  }
  for (const [a, k] of [["cooldown", "cooldownMs"], ["away", "awayDelayMs"]]) {
    if (attrs[a] === undefined) continue;
    const ms = parseInterval(attrs[a]);
    if (ms === null) return `${key}: ${a} — число и ms|s|m|h|d`;
    out[k] = ms;
  }
  return out;
}

// Значок плагина: <agenthub.icon symbol="star" color="#FF9F0A"></agenthub.icon>. symbol — имя SF Symbol (строчные
// латинские буквы и цифры через точку), color — #RRGGBB; оболочка рисует плитку градиентом от этого цвета. Нет тега
// или он неверный — нейтральный значок по умолчанию. → { symbol, color } | текст ошибки
export const ICON_SYMBOL_RE = /^[a-z0-9]+(?:\.[a-z0-9]+){0,7}$/;
export const ICON_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
export function parseIcon(attrs) {
  const symbol = String(attrs.symbol || "").trim();
  if (!symbol || symbol.length > 64 || !ICON_SYMBOL_RE.test(symbol)) return "icon: symbol — имя SF Symbol (a-z, 0-9 через точку, до 64)";
  const out = { symbol };
  if (attrs.color !== undefined) {
    const color = String(attrs.color).trim();
    if (!ICON_COLOR_RE.test(color)) return "icon: color — #RRGGBB";
    out.color = color.toUpperCase();
  }
  return out;
}

// Подключение к внешнему сервису по OAuth, которое ведёт хаб за плагин (служба oauth, docs/api.md «Подключения»):
//   <agenthub.connection id="example.tasks" type="mcp" url="https://mcp.example.com/mcp" scope="read" title="Example"
//     tools="get_user,filter_tasks" interval="15m" budget="100">зачем</agenthub.connection>
// id — имя подключения: по умолчанию — id плагина, иначе «<id плагина>.<имя>» (имя — a-z, 0-9, «-», с буквы, до 32);
// целиком — с буквы и до 64 символов (плагин с id на цифру или длиннее 64 объявляет подключение с коротким <имя>
// не может — объявление отвергается, а не ломается потом на связке). Точки в id плагина не бывает, так что по id
// подключения всегда видно, чей он: плагин foo не может объявить подключение плагина foo-bar. Это же имя записи в
// связке (agent-hub.oauth / <id>.client|token, lib/services/secrets.mjs — то же правило). type — только mcp, url — https на имени хоста (не IP-адрес), его хост обязан быть в <agenthub.net>
// плагина (проверяют линтер и ядро), hosts — ещё хосты сервера авторизации (тоже из net), scope — что просить при
// входе, tools — белый список инструментов MCP (1–32), interval — не чаще одного одинакового вызова за столько (ядро
// держит пределы 5 мин … 24 ч), budget — вызовов за скользящие сутки (1…10000). Берётся только у доверенных
// плагинов (builtin, official, own; линтер реестра не пускает его сторонним); в окне согласия — правом вида
// connections. → { … } | текст ошибки
export const CONNECTION_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const CONNECTION_ID_RE = /^(?=.{1,64}$)[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]{0,31})?$/;
// id подключения принадлежит плагину pluginId: равен ему или «<pluginId>.<имя>».
export function connectionIdOf(pluginId, id) {
  const cid = id || pluginId;
  if (!CONNECTION_ID_RE.test(String(cid || ""))) return false;
  return cid === pluginId || (cid.startsWith(`${pluginId}.`) && CONNECTION_NAME_RE.test(cid.slice(pluginId.length + 1)));
}
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Имя хоста, а не IP-адрес: последняя метка (домен верхнего уровня) — с буквой (127.0.0.1, 169.254.169.254 — нет).
export function hostNameOk(h) {
  const s = String(h || "");
  return HOST_RE.test(s) && /[a-z]/.test(s.slice(s.lastIndexOf(".") + 1));
}
export function parseConnection(attrs, note) {
  const id = attrs.id === undefined ? null : String(attrs.id).trim();
  if (id !== null && !CONNECTION_ID_RE.test(id)) return "connection: id — id плагина или «<id плагина>.<имя>» (имя: a-z, 0-9, «-», с буквы, до 32; целиком — с буквы, до 64)";
  const type = attrs.type === undefined ? "mcp" : String(attrs.type).trim();
  if (type !== "mcp") return `connection ${id || "?"}: type — только mcp`;
  let url;
  try {
    url = new URL(String(attrs.url || ""));
  } catch {
    return `connection ${id || "?"}: url — адрес https://`;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !hostNameOk(url.hostname) || url.hash) return `connection ${id || "?"}: url — https:// на имени хоста (не IP-адрес), без порта, учётных данных и #`;
  const hosts = [];
  for (const h of String(attrs.hosts || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!hostNameOk(h)) return `connection ${id || "?"}: hosts — имена хостов (не IP-адреса) через запятую`;
    if (!hosts.includes(h)) hosts.push(h);
  }
  const scope = attrs.scope === undefined ? null : String(attrs.scope).trim();
  if (scope !== null && !/^[\w:./-]+(?: [\w:./-]+){0,15}$/.test(scope)) return `connection ${id || "?"}: scope — слова через пробел`;
  const tools = String(attrs.tools || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!tools.length || tools.length > 32 || tools.some((x) => !/^[A-Za-z0-9_.-]{1,64}$/.test(x))) return `connection ${id || "?"}: tools — 1–32 имени инструментов через запятую`;
  let intervalMs = 15 * 60_000;
  if (attrs.interval !== undefined) {
    intervalMs = parseInterval(attrs.interval);
    if (intervalMs === null) return `connection ${id || "?"}: interval — число и ms|s|m|h|d`;
  }
  let budget = 100;
  if (attrs.budget !== undefined) {
    budget = Number(attrs.budget);
    if (!Number.isInteger(budget) || budget < 1 || budget > 10_000) return `connection ${id || "?"}: budget — целое 1…10000`;
  }
  const title = attrs.title === undefined ? null : String(attrs.title).trim();
  if (title !== null && (!title || title.length > 64 || /[\p{Cc}\p{Cf}]/u.test(title))) return `connection ${id || "?"}: title — до 64 символов`;
  return { id, type, url: url.href, host: url.hostname, hosts, scope, tools: [...new Set(tools)], intervalMs, budget, title, note: note ? note.slice(0, 300) : null };
}

// Зависимость плагина: <agenthub.requires name="Tool" url="https://…" check="~/.tool">зачем</agenthub.requires>.
// name — как называть программу («Нужен Tool»), url — где её взять (только https://), check — путь, по наличию
// которого видно, что она стоит (~/… или абсолютный; без масок). → { name, url, check, note } | текст ошибки
export function parseRequires(attrs, note) {
  const name = String(attrs.name || "").trim();
  if (!name || name.length > 64 || /[\p{Cc}\p{Cf}]/u.test(name)) return "нет name (до 64 символов)";
  const url = String(attrs.url || "").trim();
  if (!/^https:\/\/[^\s"'<>]{1,500}$/.test(url)) return `${name}: url — только https://`;
  const check = String(attrs.check || "").trim();
  if (!/^(?:~\/|\/)[^\0*?[\]{}]{0,500}$/.test(check) || check.split("/").includes("..")) return `${name}: check — путь ~/… или /… без масок и «..»`;
  return { name, url, check, note: note ? note.slice(0, 300) : null };
}

const STATUS_VALUES = ["ok", "unknown", "wait", "block", "error"];
function parseStatusTag(attrs, value) {
  if (!STATUS_VALUES.includes(attrs.value)) return `status: value ждём ${STATUS_VALUES.join("|")}`;
  if (!attrs.label) return `status ${attrs.value}: нет label`;
  return { value: attrs.value, label: attrs.label.slice(0, 40), hint: value ? value.slice(0, 200) : null };
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
    // Свои ярлыки статусов: <agenthub.status value="wait" label="Квота на исходе">пояснение</agenthub.status>
    // → { wait: { label, hint } }. Оболочка показывает label на плитке и в карточке, пояснение — подсказкой;
    // статуса без ярлыка — общая таблица оболочки.
    statuses: {},
    // Зависимости — внешние программы, без которых плагин бесполезен (каталог показывает «Нужен Tool»):
    // <agenthub.requires name="Tool" url="https://…" check="~/.tool">зачем</agenthub.requires>
    // → [{ name, url, check, note }]. Это не право: ядро только проверяет, есть ли путь check.
    requires: [],
    // Минимальная версия контракта (<agenthub.contract>2</agenthub.contract>); null — не объявлена (контракт 1).
    contract: null,
    // Значок (<agenthub.icon symbol="…" color="#RRGGBB">) → { symbol, color? } | null.
    icon: null,
    // Подключения к внешним сервисам (<agenthub.connection …>) → [{ id, type, url, host, hosts, scope, tools,
    // intervalMs, budget, title, note }]; id null — по id плагина.
    connections: [],
    extra: {},
    // Переводы (AGENTHUB_LANG): { en: { title, desc, why: { <что>: <зачем> } } }. Теги с lang="xx" — вариант
    // на языке xx; без lang — язык плагина по умолчанию. Действия — атрибуты title-xx / cost-xx (action.i18n).
    i18n: {},
  };
  const loc = (lang) => (meta.i18n[lang] ||= {});
  const re = /<agenthub\.([A-Za-z][\w.]*)((?:\s+[^>]*)?)>([\s\S]*?)<\/agenthub\.\1>/g;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1];
    const attrs = parseAttrs(m[2] || "");
    const value = unescapeXml(m[3].replace(/\s*\n\s*(?:#|\/\/|--|;)?\s*/g, " ").trim());
    const lang = attrs.lang !== undefined && tag !== "action" ? attrs.lang : null;
    if (lang !== null) {
      if (!LANG_RE.test(lang)) {
        warnings.push(`${tag}: lang ждём двухбуквенный код (ru, en), а не «${lang.slice(0, 10)}»`);
        continue;
      }
      if (tag === "title" || tag === "desc") loc(lang)[tag] = value;
      else if (tag === "status") {
        const st = parseStatusTag(attrs, value);
        if (typeof st === "string") warnings.push(st);
        else (loc(lang).statuses ||= {})[st.value] = { label: st.label, hint: st.hint };
      }
      else if (tag === "push") {
        const r = meta.push.find((x) => x.key === attrs.key);
        if (r) (r.labels ||= {})[lang] = value.slice(0, 80);
        else warnings.push(`push ${attrs.key || "?"} lang=${lang}: сначала правило без lang`);
      } else if (MULTI.has(tag)) {
        const { what, why } = splitWhy(value);
        if (why) (loc(lang).why ||= {})[what] = why;
      } else if (tag === "requires") {
        // перевод пояснения (и, если дан, названия) зависимости — по name правила без lang
        const r = meta.requires.find((x) => x.name === attrs.name);
        if (!r) warnings.push(`requires ${attrs.name || "?"} lang=${lang}: сначала тег без lang с тем же name`);
        else ((loc(lang).requires ||= {})[r.name] = { ...(value ? { note: value.slice(0, 300) } : {}), ...(attrs.title ? { name: attrs.title.slice(0, 64) } : {}) });
      } else if (tag === "connection") {
        // перевод названия (title=) и пояснения подключения — по id (без id — первое подключение без id)
        const id = attrs.id === undefined ? null : String(attrs.id);
        const c = meta.connections.find((x) => x.id === id);
        if (!c) warnings.push(`connection ${id || "?"} lang=${lang}: сначала тег без lang с тем же id`);
        else ((loc(lang).connections ||= {})[id || ""] = { ...(value ? { note: value.slice(0, 300) } : {}), ...(attrs.title ? { title: String(attrs.title).slice(0, 64) } : {}) });
      } else warnings.push(`${tag}: lang у этого тега не поддерживается`);
      continue;
    }
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
      const i18n = {};
      for (const [k, v] of Object.entries(attrs)) {
        const lm = /^(title|cost)-([a-z]{2})$/.exec(k);
        if (lm && v) (i18n[lm[2]] ||= {})[lm[1]] = v;
      }
      meta.actions.push({ id, level, command: value, title: attrs.title || null, cost: attrs.cost || null, ...(arg ? { arg } : {}), ...(Object.keys(i18n).length ? { i18n } : {}) });
    } else if (tag === "push") {
      const r = parsePushRule(attrs, value);
      if (typeof r === "string") warnings.push(`push: ${r}`);
      else if (meta.push.some((x) => x.key === r.key)) warnings.push(`push ${r.key}: повтор ключа`);
      else if (meta.push.length >= 32) warnings.push("push: больше 32 правил");
      else meta.push.push(r);
    } else if (tag === "status") {
      const st = parseStatusTag(attrs, value);
      if (typeof st === "string") warnings.push(st);
      else meta.statuses[st.value] = { label: st.label, hint: st.hint };
    } else if (tag === "requires") {
      const r = parseRequires(attrs, value);
      if (typeof r === "string") warnings.push(`requires: ${r}`);
      else if (meta.requires.some((x) => x.name === r.name)) warnings.push(`requires ${r.name}: повтор name`);
      else if (meta.requires.length >= 8) warnings.push("requires: больше 8 зависимостей");
      else meta.requires.push(r);
    } else if (tag === "icon") {
      const ic = parseIcon(attrs);
      if (typeof ic === "string") warnings.push(ic);
      else if (meta.icon) warnings.push("icon: повтор тега");
      else meta.icon = ic;
    } else if (tag === "contract") {
      const n = /^\d{1,4}$/.test(value) ? Number(value) : NaN;
      if (!Number.isInteger(n) || n < 1) warnings.push(`contract: ждём целое число ≥ 1, а не «${value.slice(0, 10)}»`);
      else meta.contract = n;
    } else if (tag === "connection") {
      const c = parseConnection(attrs, value);
      if (typeof c === "string") warnings.push(c);
      else if (meta.connections.some((x) => x.id === c.id)) warnings.push(`connection ${c.id || "?"}: повтор id`);
      else if (meta.connections.length >= 4) warnings.push("connection: больше 4 подключений");
      else meta.connections.push(c);
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
