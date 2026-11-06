// Права плагина: сбор из метаданных, линтер (запретные пути, потолок effects для сторонних), дифф и рост.
//
// Модуль самодостаточен (только чистый JS): его же копирует реестр agent-hub-plugins (scripts/vendor/),
// чтобы CI и менеджер плагинов в демоне считали права одинаково.
//
// Право — { kind, what, why }; ключ — `${kind}:${what}` (what без лишних пробелов). Рост прав — появились
// ключи, которых не было в согласованных; смена одного `why` ростом не считается.
// У слежения (watch) what — путь, why — пояснение после « — », как у остальных видов и как читает ядро
// (host.mjs watchPaths). Записи прежнего вида (what — вся строка вместе с « — зачем», why: null; так их сохраняли
// lock и индекс до 05.11) permissionList разбирает так же: ключи старых и новых записей совпадают.

// Потолок effects для сторонних плагинов — тот же, что в ядре (core.mjs: THIRD_PARTY_EFFECTS, LOCAL_EFFECTS).
export const THIRD_PARTY_EFFECTS = ["open.*", "cmux.focus"];
export const LOCAL_EFFECTS = ["open.*"];

export const KINDS = ["fsRead", "fsWrite", "watch", "exec", "secrets", "net", "effects", "actions"];
// Виды, у которых автор обязан объяснить «зачем».
const NEED_WHY = new Set(["fsRead", "fsWrite", "exec", "secrets", "net"]);

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const RESERVED_IDS = new Set(["local", "staging", "disabled"]);
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PLATFORMS = new Set(["macos", "windows", "linux"]);

// Запретные места (дизайн §4, §7): текст переписки, ключи, окружение, токены.
const FORBIDDEN_TREES = ["~/.claude/projects", "~/.cmuxterm/workstream.jsonl"];
const FORBIDDEN_FILE_RE = [/\.key$/, /^\.env(?:\..*)?$/, /^auth\.json$/];
// [образец, отличительная часть]: маска ловит образец и сама содержит эту часть (`*.key`, `.env*`, `auth.*`);
// общие маски вроде `*.json` не считаются нацеленными на auth.json.
const FORBIDDEN_FILE_SAMPLES = [
  ["x.key", "key"],
  [".env", "env"],
  [".env.local", "env"],
  ["auth.json", "auth"],
];
// Каталоги, где рядом с нужными файлами лежат ключи: целиком или маской «всё» — нельзя.
const KEY_DIRS = ["~/.claude/sessions"];

export function splitWhy(entry) {
  const m = /^(.*?)\s+[—–-]{1,2}\s+(.*)$/.exec(String(entry));
  return m ? { what: m[1].trim(), why: m[2].trim() } : { what: String(entry).trim(), why: null };
}

const norm = (s) => String(s).trim().replace(/\s+/g, " ");

// meta — результат parseMetaText (daemon/lib/meta.mjs). → { fsRead:[{what,why}], …, effects:[…], actions:[…] }
export function permissionsFromMeta(meta) {
  const out = {};
  for (const k of ["fsRead", "fsWrite", "exec", "secrets", "net", "watch"]) {
    out[k] = (meta[k] || []).map((e) => {
      const { what, why } = splitWhy(e);
      return { what: norm(what), why };
    });
  }
  out.effects = [...new Set((meta.effects || []).map(norm))].sort();
  out.actions = (meta.actions || []).map((a) => ({ id: a.id, level: a.level, command: norm(a.command), title: a.title || null, ...(a.arg ? { arg: `${a.arg.name}:${a.arg.pattern}` } : {}) }));
  return out;
}

// Права для записи каталога (index.json): как permissionsFromMeta, но watch — в прежнем виде (what — вся строка
// метаданных вместе с « — зачем», why: null). Демоны до 05.11 берут ключ watch из всей строки и сверяют им права
// архива с записью каталога (plugins.mjs prepare → registry:archive-permissions); новый демон разбирает такую
// запись через splitWhy (permissionList), ключи совпадают. Так один индекс ставится и старым, и новым ядром.
export function indexPermissions(meta) {
  return { ...permissionsFromMeta(meta), watch: (meta.watch || []).map((w) => ({ what: norm(w), why: null })) };
}

// Плоский список прав. → [{ kind, what, why, key }]
export function permissionList(perms) {
  const list = [];
  if (!perms || typeof perms !== "object") return list;
  for (const k of ["fsRead", "fsWrite", "watch", "exec", "secrets", "net"]) {
    for (const e of perms[k] || []) {
      if (!e || typeof e.what !== "string") continue;
      let what = e.what;
      let why = e.why ?? null;
      if (k === "watch" && why == null) ({ what, why } = splitWhy(what));
      list.push({ kind: k, what: norm(what), why, key: `${k}:${norm(what)}` });
    }
  }
  for (const e of perms.effects || []) if (typeof e === "string") list.push({ kind: "effects", what: norm(e), why: null, key: `effects:${norm(e)}` });
  for (const a of perms.actions || []) {
    if (!a || typeof a.id !== "string") continue;
    // шаблон аргумента — часть права: его расширение в обновлении — рост прав
    const what = `${a.id} [${a.level}] ${norm(a.command || "")}${typeof a.arg === "string" ? ` {${a.arg}}` : ""}`;
    list.push({ kind: "actions", what, why: a.title ?? null, key: `actions:${what}` });
  }
  return list;
}

export function permissionKeys(perms) {
  return new Set(permissionList(perms).map((p) => p.key));
}

// Что прибавилось и что ушло. → { added: [...], removed: [...] }
export function diffPermissions(before, after) {
  const a = permissionList(before);
  const b = permissionList(after);
  const ka = new Set(a.map((p) => p.key));
  const kb = new Set(b.map((p) => p.key));
  return { added: b.filter((p) => !ka.has(p.key)), removed: a.filter((p) => !kb.has(p.key)) };
}

// Рост прав: ключи after, которых нет в granted.
export function permissionGrowth(granted, after) {
  return diffPermissions(granted, after).added;
}

// Хеш набора прав (для привязки согласия к конкретному набору).
export function permissionsFingerprint(perms) {
  return [...permissionKeys(perms)].sort().join("\n");
}

// ---------- запретные пути ----------

export function normalizePath(p) {
  let s = String(p).trim().replace(/\\/g, "/");
  s = s.replace(/^(?:\$HOME|\$\{HOME\}|%USERPROFILE%|%HOMEPATH%)(?=\/|$)/i, "~");
  s = s.replace(/^[A-Za-z]:\/Users\/[^/]+(?=\/|$)/i, "~");
  s = s.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
  s = s.replace(/\/{2,}/g, "/").replace(/\/\.(?=\/|$)/g, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") {
        re += "(?:/|$)?";
        i++;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{" || c === "[") re += ".*"; // грубо, но в сторону запрета
    else if (c === "}" || c === "]") continue;
    else re += c.replace(/[.+^$()|\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}

const isGlob = (s) => /[*?[{]/.test(s);
const under = (p, tree) => p === tree || p.startsWith(tree + "/");

// → null | причина
export function pathViolation(raw) {
  const p = normalizePath(raw);
  if (!p) return null;
  if (p.split("/").includes("..")) return "путь с «..»";
  const glob = isGlob(p);
  const re = glob ? globToRe(p) : null;
  for (const tree of FORBIDDEN_TREES) {
    if (under(p, tree)) return `запрещено: ${tree}`;
    if (!glob && under(tree, p)) return `охватывает ${tree}`;
    if (glob && [tree, tree + "/zz", tree + "/zz/zz.jsonl"].some((s) => re.test(s))) return `маска охватывает ${tree}`;
  }
  const last = p.split("/").pop();
  if (!isGlob(last) && FORBIDDEN_FILE_RE.some((r) => r.test(last))) return `запрещённый файл: ${last}`;
  if (isGlob(last) && last !== "*" && last !== "**") {
    const lre = globToRe(last);
    const literal = last.replace(/[*?[\]{}]/g, "");
    const hit = FORBIDDEN_FILE_SAMPLES.find(([s, mark]) => lre.test(s) && literal.includes(mark));
    if (hit) return `маска ${last} ловит запрещённые файлы (${hit[0]})`;
  }
  for (const dir of KEY_DIRS) {
    if (!glob && under(dir, p)) return `охватывает ${dir} (там *.key)`;
    if (glob && [dir + "/x.key", dir + "/zz/x.key"].some((s) => re.test(s))) return `маска в ${dir} ловит *.key`;
  }
  return null;
}

// Токены команды exec, похожие на пути.
function pathTokens(cmd) {
  return String(cmd)
    .split(/\s+/)
    .map((t) => t.replace(/^['"]|['"]$/g, ""))
    .filter((t) => /[/\\~]|^\.env|\.key$|auth\.json$/i.test(t));
}

export function effectUnderCeiling(effect, ceiling) {
  return ceiling.some((c) => (c.endsWith(".*") ? effect === c || (effect.startsWith(c.slice(0, -1)) && /^[a-z]\w*\.[a-zA-Z*][\w]*$/.test(effect)) : effect === c));
}

// Упоминания запретных мест в исходнике (необъявленный доступ).
const SOURCE_PATTERNS = [
  // «.claude/./projects», «.claude//projects» — тот же каталог (normalizePath убирает «/./» и повторные «/»)
  [/\.claude(?:[\\/]+\.)*[\\/]+projects/i, "~/.claude/projects"],
  [/workstream\.jsonl/i, "workstream.jsonl"],
  [/auth\.json/i, "auth.json"],
  [/["'`][^"'`\n]*\.key["'`]/, "*.key"],
  [/["'`](?:[^"'`\n]*[\\/])?\.env(?:\.[\w-]+)?["'`]/, ".env"],
];

export function sourceViolations(text) {
  const out = [];
  for (const [re, what] of SOURCE_PATTERNS) if (re.test(text)) out.push(what);
  return out;
}

// Линтер одного плагина.
// { id, meta, source: текст файла, official: bool, local: bool } → { errors: [...], warnings: [...], permissions }
export function lintPlugin({ id, meta, source = "", official = false, local = false }) {
  const errors = [];
  const warnings = [];
  const perms = permissionsFromMeta(meta);
  if (!ID_RE.test(id || "") || RESERVED_IDS.has(id)) errors.push(`id «${id}»: только a-z, 0-9, «-», до 64 символов; не local/staging/disabled`);
  if (!meta.title) errors.push("нет <agenthub.title>");
  if (!meta.version || !SEMVER_RE.test(meta.version)) errors.push("нет <agenthub.version> в виде 1.2.3");
  if (!meta.author?.github) errors.push("нет <agenthub.author.github>");
  if (!meta.platforms?.length) errors.push("нет <agenthub.platforms>");
  for (const pl of meta.platforms || []) if (!PLATFORMS.has(pl)) errors.push(`неизвестная платформа «${pl}»`);
  for (const k of NEED_WHY) {
    for (const e of perms[k]) if (!e.why) errors.push(`<agenthub.${k}>${e.what}: нет пояснения «— зачем»`);
  }
  for (const k of ["fsRead", "fsWrite", "watch"]) {
    for (const e of perms[k]) {
      const v = pathViolation(e.what);
      if (v) errors.push(`<agenthub.${k}>${e.what}: ${v}`);
    }
  }
  for (const e of perms.exec) {
    for (const t of pathTokens(e.what)) {
      const v = pathViolation(t);
      if (v) errors.push(`<agenthub.exec>${e.what}: ${v}`);
    }
  }
  for (const e of perms.secrets) if (!/^[a-z][\w.-]{0,63}$/.test(e.what)) errors.push(`<agenthub.secrets>${e.what}: имя ключа a-z, 0-9, «._-»`);
  for (const e of perms.effects) if (!/^[a-z]\w*\.(?:[a-zA-Z]\w*|\*)$/.test(e)) errors.push(`effects «${e}»: не имя примитива`);
  // effects — под потолком у всех плагинов реестра (официальным тоже: управление — только своими действиями)
  const ceiling = local ? LOCAL_EFFECTS : THIRD_PARTY_EFFECTS;
  for (const e of perms.effects) if (!effectUnderCeiling(e, ceiling)) errors.push(`effects «${e}»: плагину реестра доступны только ${ceiling.join(", ")}`);
  if (!official) {
    if (perms.actions.length) errors.push(`<agenthub.action>: действия есть только у официальных плагинов`);
  } else {
    // уровень официальных действий — не ниже confirm: подтверждение и его текст — от ядра
    for (const a of perms.actions) if (a.level === "immediate") errors.push(`<agenthub.action id="${a.id}">: уровень не ниже confirm`);
  }
  // Запретные места — ошибка для всех: исключений по метке official нет.
  for (const what of sourceViolations(source)) errors.push(`исходник упоминает запретное место: ${what}`);
  return { errors, warnings, permissions: perms };
}
