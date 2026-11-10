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
export const THIRD_PARTY_EFFECTS = ["open.*", "cmux.focus", "session.focus"];
export const LOCAL_EFFECTS = ["open.*"];

export const KINDS = ["fsRead", "fsWrite", "watch", "exec", "secrets", "net", "effects", "actions", "connections", "terminal"];
// Виды, у которых автор обязан объяснить «зачем».
const NEED_WHY = new Set(["fsRead", "fsWrite", "exec", "secrets", "net", "terminal"]);

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
  // Подключения (<agenthub.connection>, контракт 2): вход в сервис ведёт хаб, плагин зовёт инструменты MCP через
  // него. Пустой список в права не пишется — записи индекса и lock до контракта 2 сверяются как прежде.
  const conns = (meta.connections || []).map((c) => ({ what: connectionWhat(c), why: c.note || null }));
  if (conns.length) out.connections = conns;
  // Терминал (<agenthub.terminal>, контракт 3): прочитать экран вкладки и набрать строку во вкладку сессии Claude Code.
  // Как и подключения, пустой список в права не пишется.
  const term = (meta.terminal || []).map((e) => {
    const { what, why } = splitWhy(e);
    return { what: norm(what), why };
  });
  if (term.length) out.terminal = term;
  return out;
}

// ---------- терминал (контракт 3) ----------
//
//   <agenthub.terminal>read-screen — зачем</agenthub.terminal>        узнать, пусто ли поле ввода и свободна ли сессия
//                                                                    (текст экрана плагин не получает)
//   <agenthub.terminal>send /model /effort — зачем</agenthub.terminal> набрать slash-команду и Enter: первое слово строки —
//                                                                    одна из перечисленных команд (до 16), дальше не больше
//                                                                    3 аргументов из [A-Za-z0-9._:[]-] (до 64 знаков)
//   <agenthub.terminal>send * — зачем</agenthub.terminal>             любую строку, кроме начинающихся с «!» (команда
//                                                                    оболочки в режиме bash), «#» (запись в память) и «&»
//                                                                    (фоновая задача); громче в окне согласия
//   <agenthub.terminal>send ! — зачем</agenthub.terminal>             строку, начинающуюся с этого знака режима («!», «#»,
//                                                                    «&»; можно несколько: «send ! #»): отдельное право
//                                                                    (10.11), «*» его не даёт; самое громкое в окне согласия
// Слово — «/», затем a-z, 0-9, «-» с буквы, до 32 знаков: право по слову — только на slash-команду (слово без «/» было бы
// правом на произвольный запрос, начинающийся с этого слова). Расширение списка слов — рост прав (ключ — вся запись).
export const TERMINAL_WORD_RE = /^\/[a-z][a-z0-9-]{0,31}$/;
const TERMINAL_WORDS_MAX = 16;
// Аргументы slash-команды по праву-слову: не больше 3, каждый — из этого набора (модель, уровень, id с [1m]).
export const TERMINAL_ARG_RE = /^[A-Za-z0-9._:[\]-]{1,64}$/;
const TERMINAL_ARGS_MAX = 3;
// Первые знаки, которые Claude Code понимает как режим, а не запрос: «!» — команда оболочки сразу, без разрешений
// Claude Code; «#» — запись в память (CLAUDE.md); «&» — фоновая задача. По праву «*» такие строки не набираются.
export const TERMINAL_MODE_CHARS = ["!", "#", "&"];

// what → { op: "read-screen" } | { op: "send", any, words, modes } | null (не запись права терминала).
// Слова права — slash-команды или знаки режимов; «*» — только одно, без других слов.
export function parseTerminalPerm(what) {
  const parts = norm(what || "").split(" ").filter(Boolean);
  if (parts.length === 1 && parts[0] === "read-screen") return { op: "read-screen" };
  if (parts[0] !== "send" || parts.length < 2) return null;
  const words = parts.slice(1);
  if (words.length === 1 && words[0] === "*") return { op: "send", any: true, words: [], modes: [] };
  if (words.length > TERMINAL_WORDS_MAX || !words.every((w) => TERMINAL_WORD_RE.test(w) || TERMINAL_MODE_CHARS.includes(w))) return null;
  const modes = [...new Set(words.filter((w) => TERMINAL_MODE_CHARS.includes(w)))];
  return { op: "send", any: false, words: [...new Set(words.filter((w) => !TERMINAL_MODE_CHARS.includes(w)))], modes };
}

// Записи <agenthub.terminal> плагина (строки метаданных «что — зачем» или что) → { read, send, any, words: Set, modes: Set }.
export function terminalGrants(entries) {
  const out = { read: false, send: false, any: false, words: new Set(), modes: new Set() };
  for (const e of Array.isArray(entries) ? entries : []) {
    const p = parseTerminalPerm(splitWhy(String(e)).what);
    if (!p) continue;
    if (p.op === "read-screen") out.read = true;
    else {
      out.send = true;
      if (p.any) out.any = true;
      for (const w of p.words) out.words.add(w);
      for (const m of p.modes) out.modes.add(m);
    }
  }
  return out;
}

// Можно ли набрать эту строку по правам. → объявленная slash-команда в начале строки (её аргументы — по
// TERMINAL_ARG_RE, не больше 3), "*" (любая строка разрешена правом «*» и не начинается с TERMINAL_MODE_CHARS),
// знак режима (строка начинается с «!», «#» или «&» и этот знак объявлен отдельным правом) или null — нельзя.
export function terminalTextAllowed(grants, text) {
  if (!grants?.send || typeof text !== "string" || !text) return null;
  if (TERMINAL_MODE_CHARS.includes(text[0])) return grants.modes?.has(text[0]) ? text[0] : null;
  const [head, ...args] = text.split(" ");
  if (grants.words.has(head) && args.length <= TERMINAL_ARGS_MAX && args.every((a) => TERMINAL_ARG_RE.test(a))) return head;
  return grants.any && !TERMINAL_MODE_CHARS.includes(text[0]) ? "*" : null;
}

// id подключения принадлежит плагину pluginId: равен ему или «<pluginId>.<имя>» (та же грамматика, что
// lib/meta.mjs connectionIdOf; модуль самодостаточен — копию берёт реестр).
const CONNECTION_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
const CONNECTION_ID_RE = /^(?=.{1,64}$)[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]{0,31})?$/;
export function connectionIdOk(pluginId, id) {
  const cid = id || pluginId;
  if (!ID_RE.test(pluginId || "") || !CONNECTION_ID_RE.test(String(cid))) return false;
  return cid === pluginId || (String(cid).startsWith(`${pluginId}.`) && CONNECTION_NAME_RE.test(String(cid).slice(pluginId.length + 1)));
}

// Строка права подключения: адрес, scope и белый список — то, на что человек соглашается. Интервал и бюджет — не
// доступ, в ключ не входят.
export function connectionWhat(c) {
  const hosts = Array.isArray(c?.hosts) && c.hosts.length ? ` +${c.hosts.join(",")}` : "";
  return norm(`${c?.id ? `${c.id}: ` : ""}${c?.url || "?"}${hosts} scope=${c?.scope || "-"} tools=${(c?.tools || []).join(",")}`);
}

// Права для записи каталога (index.json): как permissionsFromMeta, но watch — в прежнем виде (what — вся строка
// метаданных вместе с « — зачем», why: null). Демоны до 05.11 берут ключ watch из всей строки и сверяют им права
// архива с записью каталога (plugins.mjs prepare → registry:archive-permissions); новый демон разбирает такую
// запись через splitWhy (permissionList), ключи совпадают. Так один индекс ставится и старым, и новым ядром.
export function indexPermissions(meta) {
  return { ...permissionsFromMeta(meta), watch: (meta.watch || []).map((w) => ({ what: norm(w), why: null })) };
}

// Плоский список прав. → [{ kind, what, why, key }]
// opts.pluginId — чей это набор: его PluginData/<id> и Cache/<id> в каталоге хаба не громкие (writeRisk).
export function permissionList(perms, { pluginId = null } = {}) {
  const list = [];
  if (!perms || typeof perms !== "object") return list;
  for (const k of ["fsRead", "fsWrite", "watch", "exec", "secrets", "net", "connections", "terminal"]) {
    for (const e of perms[k] || []) {
      if (!e || typeof e.what !== "string") continue;
      let what = e.what;
      let why = e.why ?? null;
      if (k === "watch" && why == null) ({ what, why } = splitWhy(what));
      // запись туда, откуда перехватывают Claude Code или систему (контракт 3): право допустимо, но окно согласия
      // показывает его громкой строкой с объяснением (risk — вид места, writeRisk); в ключ права не входит.
      // Набор во вкладку Claude Code (terminal send) — тоже перехват: risk "terminal"; право на знаки режимов
      // («!» — команда оболочки мимо разрешений Claude Code) — громче всего: risk "terminal-mode".
      const tp = k === "terminal" ? parseTerminalPerm(what) : null;
      const risk = k === "fsWrite" ? writeRisk(what, { pluginId }) : tp?.op === "send" ? (tp.modes.length ? "terminal-mode" : "terminal") : null;
      list.push({ kind: k, what: norm(what), why, key: `${k}:${norm(what)}`, ...(risk ? { risk } : {}) });
    }
  }
  for (const e of perms.effects || []) if (typeof e === "string") list.push({ kind: "effects", what: norm(e), why: null, key: `effects:${norm(e)}` });
  for (const a of perms.actions || []) {
    if (!a || typeof a.id !== "string") continue;
    // шаблон аргумента — часть права: его расширение в обновлении — рост прав
    const what = `${a.id} [${a.level}] ${norm(a.command || "")}${typeof a.arg === "string" ? ` {${a.arg}}` : ""}`;
    list.push({ kind: "actions", what, why: a.title ?? null, key: `actions:${what}` });
  }
  // Громкие правила push (только у своего плагина: менеджер кладёт их в права из loudPushRules; у реестра этого
  // вида нет — ревьюер видит их предупреждением pushWarnings): исключение безопасности и тихие часы.
  for (const e of perms.push || []) {
    if (!e || typeof e.what !== "string") continue;
    list.push({ kind: "push", what: norm(e.what), why: e.why ?? null, key: `push:${norm(e.what)}` });
  }
  return list;
}

// Ключи событий, которые ядро хаба поднимает само (daemon/lib/push/rules.mjs: правила с kind "security" и события
// @hub): плагину их брать нельзя — исключением безопасности его событие с таким ключом всё равно не станет, а
// ревьюер должен увидеть попытку. Общий список для CI реестра (scripts/lib/registry.mjs) и проверки своей папки.
export const CORE_PUSH_KEYS = Object.freeze(["app-pin-changed", "app-pin-path-changed", "app-restart-stopped", "hub-update-tag-moved", "hub-update-suspect", "hub-update-failed", "hub-update", "plugin-update", "plugin-own-unexpected", "approvals-paused"]);

// Предупреждения о правилах push: kind="security" (приходит при выключенных уведомлениях — ревьюер проверяет, что это
// сигнал подмены, а не обычное событие) и ключи, зарезервированные ядром. lang — язык текста (ru по умолчанию).
export function pushWarnings(meta, { lang = "ru" } = {}) {
  const out = [];
  for (const r of Array.isArray(meta?.push) ? meta.push : []) {
    const key = String(r?.key || "");
    if (r?.kind === "security") out.push(L(lang, `<agenthub.push key="${key}" kind="security">: исключение безопасности — приходит при любых выключателях уведомлений; ревьюер проверяет, что это сигнал подмены`, `<agenthub.push key="${key}" kind="security">: security exception — delivered whatever the notification switches say; the reviewer checks it signals tampering`));
    if (CORE_PUSH_KEYS.some((k) => key === k || key.startsWith(`${k}:`) || key.startsWith(`${k}-`))) out.push(L(lang, `<agenthub.push key="${key}">: ключ зарезервирован ядром хаба — возьмите другой`, `<agenthub.push key="${key}">: the key is reserved by the hub core — pick another`));
  }
  return out;
}

// Громкие правила push плагина как права (вид push): kind="security" (приходит при любых выключателях) и
// quiet="true" (приходит в тихие часы). У своего плагина ревьюер — сам человек: такие правила видны в окне
// согласия, а их появление — рост прав (новое окно, а не тихое обновление из папки). → [{what, why}]
export function loudPushRules(meta) {
  const out = [];
  for (const r of Array.isArray(meta?.push) ? meta.push : []) {
    const key = norm(r?.key || "");
    if (!key) continue;
    const marks = [r?.kind === "security" ? "security" : null, r?.quietException === true ? "quiet" : null].filter(Boolean);
    if (marks.length) out.push({ what: `${key} [${marks.join(", ")}]`, why: typeof r.label === "string" && r.label ? r.label : null });
  }
  return out;
}

export function permissionKeys(perms) {
  return new Set(permissionList(perms).map((p) => p.key));
}

// Что прибавилось и что ушло. → { added: [...], removed: [...] }
export function diffPermissions(before, after, opts = {}) {
  const a = permissionList(before, opts);
  const b = permissionList(after, opts);
  const ka = new Set(a.map((p) => p.key));
  const kb = new Set(b.map((p) => p.key));
  return { added: b.filter((p) => !ka.has(p.key)), removed: a.filter((p) => !kb.has(p.key)) };
}

// Рост прав: ключи after, которых нет в granted.
export function permissionGrowth(granted, after, opts = {}) {
  return diffPermissions(granted, after, opts).added;
}

// Хеш набора прав (для привязки согласия к конкретному набору).
export function permissionsFingerprint(perms) {
  return [...permissionKeys(perms)].sort().join("\n");
}

// ---------- запретные пути ----------

export function normalizePath(p) {
  let s = String(p).trim().replace(/\\/g, "/");
  s = s.replace(/^(?:\$HOME|\$\{HOME\}|%USERPROFILE%|%HOMEPATH%)(?=\/|$)/i, "~");
  // firmlink macOS: /System/Volumes/Data/Users/<u>/… — тот же файл, что /Users/<u>/…
  s = s.replace(/^\/System\/Volumes\/Data(?=\/)/i, "");
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
// «/» охватывает всё (иначе префикс был бы «//»)
const under = (p, tree) => p === tree || tree === "/" || p.startsWith(tree + "/");

// Сегменты нормализованного пути: «/» → [""], «/a/b» → ["", "a", "b"], «~/x» → ["~", "x"].
const segsOf = (p) => (p === "/" ? [""] : p.split("/"));
// Любой каталог пользователя (/Users/<кто угодно>): литеральное имя normalizePath уже свёл к «~».
const HOME_ANY = "\u0000";
// Место в домашнем каталоге — ещё и в абсолютном виде (/Users/*/…, /home/*/…, c:/users/*/…): так маска
// «/Users/*/.zshrc» и предки «/», «/Users» тоже охватывают «~/.zshrc».
function placeSegs(place) {
  const s = segsOf(place);
  if (s[0] !== "~") return [s];
  const rest = s.slice(1);
  return [s, ["", "users", HOME_ANY, ...rest], ["", "home", HOME_ANY, ...rest], ["c:", "users", HOME_ANY, ...rest]];
}
// Сегмент пути или маски против сегмента места: true | false | "rest" («**» — дальше что угодно).
function segHit(m, p) {
  if (m.includes("**")) return "rest";
  if (p === HOME_ANY) return m !== "" && isGlob(m);
  if (!isGlob(m)) return m === p;
  if (/[[{]/.test(m)) return true; // грубо, но в сторону охвата
  return globToRe(m).test(p);
}
// Путь или маска доходит до места: лежит внутри него или им и является — "inside"; охватывает его как предок (в том
// числе «/», «/Users», маска «~/Library/*») — "ancestor"; иначе null. Сравнение по сегментам: маска внутри опасного
// каталога («~/Library/LaunchAgents/*.plist») и маска с подстановкой в середине («~/Library/*/*.plist») ловятся так же,
// как буквальный путь.
function reach(p, place) {
  const ms = segsOf(p);
  for (const ps of placeSegs(place)) {
    const n = Math.min(ms.length, ps.length);
    let ok = true;
    let rest = false;
    for (let i = 0; i < n; i++) {
      const h = segHit(ms[i], ps[i]);
      if (h === "rest") {
        rest = true;
        break;
      }
      if (!h) {
        ok = false;
        break;
      }
    }
    if (ok) return rest || ms.length >= ps.length ? "inside" : "ancestor";
  }
  return null;
}
// Буквальная часть пути: у маски — каталоги до первого сегмента с подстановкой («~/.claude/backups/x.*» →
// «~/.claude/backups»), у пути — он сам.
function literalDir(p) {
  if (!isGlob(p)) return p;
  const s = segsOf(p);
  const i = s.findIndex((x) => isGlob(x));
  return s.slice(0, i).join("/") || (p.startsWith("/") ? "/" : "");
}

// → null | причина
export function pathViolation(raw) {
  const p = normalizePath(raw);
  if (!p) return null;
  if (p.split("/").includes("..")) return "путь с «..»";
  const glob = isGlob(p);
  const re = glob ? globToRe(p) : null;
  for (const tree of FORBIDDEN_TREES) {
    const r = reach(p, tree);
    if (!glob && r === "inside") return `запрещено: ${tree}`;
    // предок места, в том числе «/», «/Users» и «/System/Volumes/Data/Users/<u>»
    if (!glob && r === "ancestor") return `охватывает ${tree}`;
    // маска внутри запретного места (по сегментам) или ловит его образцы; маска короче места («~/*») — по образцам
    if (glob && (r === "inside" || [tree, tree + "/zz", tree + "/zz/zz.jsonl"].some((s) => re.test(s)))) return `маска охватывает ${tree}`;
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
    if (!glob && (p === dir || reach(p, dir) === "ancestor")) return `охватывает ${dir} (там *.key)`;
    if (glob && [dir + "/x.key", dir + "/zz/x.key"].some((s) => re.test(s))) return `маска в ${dir} ловит *.key`;
  }
  return null;
}

// ---------- места перехвата (контракт 3) ----------
//
// Запись сюда не запрещена (плагину настроек Claude Code она и нужна), но через эти места плагин может перехватить
// Claude Code или систему: хуки, env, apiKeyHelper, права и MCP-серверы в настройках Claude; автозапуск; файлы запуска
// оболочки; каталоги программ из PATH (подложить свой «claude»); ssh и git; каталог самого хаба. Окно согласия
// показывает такое право громкой строкой с объяснением (по виду места), линтер реестра — предупреждением ревьюеру.
// Вид → места (нормализованные, как normalizePath: ~/…, строчными). Место — файл или каталог (тогда и всё внутри).
export const WRITE_RISKS = Object.freeze({
  // весь ~/.claude (кроме WRITE_SAFE): кроме настроек и хуков там statusline-скрипты, ide/*.lock (подложный IDE и его
  // MCP), local/claude (старая установка, её запускает псевдоним), shell-snapshots (их читает инструмент Bash) и т. п.
  "claude-code": ["~/.claude", "~/.claude.json", "/library/application support/claudecode", "/etc/claude-code"],
  autostart: ["~/library/launchagents", "~/library/launchdaemons", "/library/launchagents", "/library/launchdaemons", "/library/startupitems", "~/library/application support/com.apple.backgroundtaskmanagementagent", "/etc/crontab", "/etc/periodic", "/usr/lib/cron", "/var/at", "~/.config/autostart", "~/library/scripts", "~/library/workflows", "~/.hammerspoon", "~/.config/systemd/user", "~/appdata/roaming/microsoft/windows/start menu/programs/startup"],
  shell: ["~/.zshrc", "~/.zshenv", "~/.zprofile", "~/.zlogin", "~/.zlogout", "~/.bashrc", "~/.bash_profile", "~/.bash_login", "~/.bash_logout", "~/.profile", "~/.config/fish", "~/.oh-my-zsh", "~/.zsh", "~/.config/zsh", "/etc/zshrc", "/etc/zshenv", "/etc/zprofile", "/etc/profile", "/etc/bashrc", "/etc/paths", "/etc/paths.d", "/etc/launchd.conf", "/etc/sudoers", "/etc/sudoers.d", "~/documents/powershell", "~/documents/windowspowershell"],
  bin: ["~/.local/bin", "~/bin", "/usr/local/bin", "/opt/homebrew/bin", "~/.local/share/claude", "~/.npm-global", "~/.bun/bin", "~/.cargo/bin", "/opt/homebrew/lib/node_modules", "/usr/local/lib/node_modules"],
  // терминалы: команда запуска вкладки (ghostty command=, kitty, WezTerm, tmux) и привязка сессий к вкладкам, которой
  // верит набор хаба во вкладки (~/.cmuxterm/claude-hook-sessions.json)
  terminals: ["~/.cmuxterm", "~/.config/cmux", "~/.config/ghostty", "~/library/application support/com.mitchellh.ghostty", "~/.config/kitty", "~/.config/wezterm", "~/.wezterm.lua", "~/.tmux.conf", "~/.config/tmux"],
  ssh: ["~/.ssh"],
  git: ["~/.gitconfig", "~/.config/git", "~/.git-templates"],
  hub: ["~/library/application support/agenthub"],
});
// Внутри опасного места, но не перехват: Claude Code этого не читает (метки прогонов агентов, копии настроек).
const WRITE_SAFE = ["~/.claude/task-runs", "~/.claude/backups"];
const HUB_DIR = "~/library/application support/agenthub";
// Каталог настроек Claude Code в проекте (.claude целиком — хуки, команды, агенты, настройки) и .mcp.json: путь или
// маска, нацеленные на них, где бы ни был проект.
const PROJECT_CLAUDE_RE = /(?:^|\/)\.claude(?:\/|$)|(?:^|\/)\.mcp\.json$/;
// Места этой машины, найденные по настоящим путям (setLocalWritePlaces): ~/.zshrc — ссылка в dotfiles и т. п.
let localPlaces = [];

// Демон на машине человека: настоящие пути опасных мест, если это ссылки ([{ place, kind }], place — как normalizePath).
// Модуль сам к диску не ходит (его копирует реестр) — список собирает демон.
export function setLocalWritePlaces(list) {
  localPlaces = Array.isArray(list) ? list.filter((e) => e && typeof e.place === "string" && WRITE_RISKS[e.kind]).map((e) => ({ place: normalizePath(e.place), kind: e.kind })) : [];
}

// → вид места (ключ WRITE_RISKS) или null. Путь внутри места, путь-предок места («/», «/Users», «~», «~/.claude») и
// маска, которая может дойти до места (по сегментам или по образцам), — всё перехват.
// pluginId — свой плагин: его PluginData/<id> и Cache/<id> в каталоге хаба — не перехват. Без pluginId (или чужой
// id, весь PluginData, файлы служб прямо в Cache — claude-sessions.json, usage.json) — перехват «hub».
export function writeRisk(raw, { pluginId = null } = {}) {
  const p = normalizePath(raw);
  if (!p) return null;
  const glob = isGlob(p);
  const re = glob ? globToRe(p) : null;
  const lit = literalDir(p);
  // «..» уводит из безопасного подкаталога — исключения не действуют
  const dotdot = p.split("/").includes("..");
  const hits = (place) => Boolean(reach(p, place)) || (glob && [place, place + "/zz", place + "/zz/zz.json"].some((x) => re.test(x)));
  const own = pluginId && ID_RE.test(pluginId) ? [`${HUB_DIR}/plugindata/${pluginId}`, `${HUB_DIR}/cache/${pluginId}`] : [];
  const places = [...Object.entries(WRITE_RISKS).flatMap(([kind, list]) => list.map((place) => ({ place, kind }))), ...localPlaces];
  for (const { place, kind } of places) {
    if (!hits(place)) continue;
    // безопасное внутри ~/.claude и своё в каталоге хаба — не перехват, если запись (буквальная часть маски) лежит в нём
    if (!dotdot && kind === "claude-code" && WRITE_SAFE.some((safe) => under(lit, safe))) continue;
    if (!dotdot && kind === "hub" && own.some((o) => under(lit, o))) continue;
    return kind;
  }
  // .claude проекта (домашний ~/.claude — выше, с WRITE_SAFE)
  if ((dotdot || !under(p, "~/.claude")) && PROJECT_CLAUDE_RE.test(glob ? p.replace(/[*?[\]{}]/g, "") : p)) return "claude-code";
  return null;
}

// Тексты для линтера реестра (ревьюер) и окна в терминале — что даёт запись в такое место.
export const WRITE_RISK_TEXT = Object.freeze({
  "claude-code": ["настройки Claude Code: через хуки, env, apiKeyHelper, права, MCP-серверы, statusLine и команды плагин сможет запускать свои команды в каждой сессии, читать переписку и выдать себе разрешения", "Claude Code settings: through hooks, env, apiKeyHelper, permissions, MCP servers, statusLine and commands the plugin can run its own commands in every session, read conversations and grant itself permissions"],
  autostart: ["автозапуск: плагин сможет поставить программу, которая будет запускаться при каждом входе — мимо хаба и окна согласия", "autostart: the plugin can install a program that runs at every login — bypassing the hub and the consent window"],
  shell: ["файлы запуска оболочки: их команды выполняются в каждом новом терминале и в сессиях Claude Code (окружение, PATH, псевдонимы)", "shell startup files: their commands run in every new terminal and in Claude Code sessions (environment, PATH, aliases)"],
  bin: ["каталог программ из PATH или глобальных пакетов npm: можно подложить свою программу под именем claude, git или node (или подменить сам Claude Code) — она запустится вместо настоящей", "a program folder on PATH or the global npm packages: a program named claude, git or node placed here (or a replaced Claude Code) runs instead of the real one"],
  terminals: ["настройки терминала и привязка вкладок: команда, которую терминал запускает в каждой новой вкладке, и сведения, в какой вкладке какая сессия Claude Code (по ним хаб набирает во вкладки)", "terminal settings and tab bindings: the command a terminal runs in every new tab, and which tab holds which Claude Code session (the hub types into tabs by it)"],
  ssh: ["SSH: можно добавить свой ключ доступа или перенаправить подключения", "SSH: the plugin can add its own access key or redirect connections"],
  git: ["настройки git: хуки и псевдонимы git выполняют команды в каждом репозитории", "git settings: git hooks and aliases run commands in every repository"],
  hub: ["каталог самого Agent Hub: настройки хаба, установленные плагины и закрепление приложения — так обходят проверки хаба", "Agent Hub's own folder: hub settings, installed plugins and the app pin — a way around the hub's checks"],
  // не место на диске, а право <agenthub.terminal>send (контракт 3): тот же громкий показ
  terminal: ["набор во вкладки Claude Code: плагин сможет вводить строки в ваши сессии от вашего имени — команды и запросы, которые Claude Code исполнит с вашими правами", "typing into Claude Code tabs: the plugin can enter lines into your sessions on your behalf — commands and prompts Claude Code will run with your permissions"],
  "terminal-mode": ["режимы Claude Code во вкладках: строка с «!» — команда оболочки, которую Claude Code выполнит сразу, без своих разрешений; с «#» — запись в память, которую Claude Code будет читать в каждой сессии; с «&» — фоновая задача", "Claude Code modes in tabs: a line starting with \"!\" is a shell command Claude Code runs at once, without its own permissions; \"#\" writes to memory Claude Code reads in every session; \"&\" starts a background task"],
});
export function writeRiskText(kind, lang = "ru") {
  const t = WRITE_RISK_TEXT[kind];
  return t ? (lang === "en" ? t[1] : t[0]) : null;
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

// Текст на языке lang: ru (по умолчанию — CI реестра) или en (проверка своей папки в английском интерфейсе хаба).
const L = (lang, ru, en) => (lang === "en" ? en : ru);

// Линтер одного плагина.
// { id, meta, source: текст файла, official: bool, local: bool, lang } → { errors: [...], warnings: [...], permissions }
export function lintPlugin({ id, meta, source = "", official = false, local = false, lang = "ru" }) {
  const errors = [];
  const warnings = [];
  const perms = permissionsFromMeta(meta);
  if (!ID_RE.test(id || "") || RESERVED_IDS.has(id)) errors.push(L(lang, `id «${id}»: только a-z, 0-9, «-», до 64 символов; не local/staging/disabled`, `id "${id}": only a-z, 0-9, "-", up to 64 characters; not local/staging/disabled`));
  if (!meta.title) errors.push(L(lang, "нет <agenthub.title>", "no <agenthub.title>"));
  if (!meta.version || !SEMVER_RE.test(meta.version)) errors.push(L(lang, "нет <agenthub.version> в виде 1.2.3", "no <agenthub.version> like 1.2.3"));
  if (!meta.author?.github) errors.push(L(lang, "нет <agenthub.author.github>", "no <agenthub.author.github>"));
  if (!meta.platforms?.length) errors.push(L(lang, "нет <agenthub.platforms>", "no <agenthub.platforms>"));
  for (const pl of meta.platforms || []) if (!PLATFORMS.has(pl)) errors.push(L(lang, `неизвестная платформа «${pl}»`, `unknown platform "${pl}"`));
  for (const k of NEED_WHY) {
    for (const e of perms[k] || []) if (!e.why) errors.push(L(lang, `<agenthub.${k}>${e.what}: нет пояснения «— зачем»`, `<agenthub.${k}>${e.what}: no "— why" explanation`));
  }
  for (const k of ["fsRead", "fsWrite", "watch"]) {
    for (const e of perms[k]) {
      const v = pathViolation(e.what);
      if (v) errors.push(`<agenthub.${k}>${e.what}: ${v}`);
    }
  }
  // зависимость (<agenthub.requires>): ядро проверяет, есть ли путь check, — и он не должен вести в запретные места
  for (const r of meta.requires || []) {
    const v = pathViolation(r.check);
    if (v) errors.push(`<agenthub.requires name="${r.name}">: check ${r.check}: ${v}`);
  }
  for (const e of perms.exec) {
    for (const t of pathTokens(e.what)) {
      const v = pathViolation(t);
      if (v) errors.push(`<agenthub.exec>${e.what}: ${v}`);
    }
  }
  for (const e of perms.secrets) if (!/^[a-z][\w.-]{0,63}$/.test(e.what)) errors.push(L(lang, `<agenthub.secrets>${e.what}: имя ключа a-z, 0-9, «._-»`, `<agenthub.secrets>${e.what}: key name a-z, 0-9, "._-"`));
  for (const e of perms.effects) if (!/^[a-z]\w*\.(?:[a-zA-Z]\w*|\*)$/.test(e)) errors.push(L(lang, `effects «${e}»: не имя примитива`, `effects "${e}": not a primitive name`));
  // effects — под потолком у всех плагинов реестра (официальным тоже: управление — только своими действиями)
  const ceiling = local ? LOCAL_EFFECTS : THIRD_PARTY_EFFECTS;
  for (const e of perms.effects) if (!effectUnderCeiling(e, ceiling)) errors.push(L(lang, `effects «${e}»: плагину реестра доступны только ${ceiling.join(", ")}`, `effects "${e}": a registry plugin may use only ${ceiling.join(", ")}`));
  if (!official) {
    if (perms.actions.length) errors.push(L(lang, `<agenthub.action>: действия есть только у официальных плагинов`, `<agenthub.action>: only official plugins have actions`));
  } else {
    // официальное действие может быть immediate (без окна подтверждения, только из приложения; решение 09.11) —
    // если плагин не объявляет сеть, а действие — цену: иначе ядро подняло бы его до confirm-cost (core.actionLevel),
    // пусть автор видит это здесь. «Без сети и без cost=» не значит «бесплатно» — каждое immediate-действие
    // помечается предупреждением: ревьюер реестра проверяет, что оно ничего не тратит сверх сказанного в title.
    for (const a of meta.actions || []) {
      if (a.level !== "immediate") continue;
      if ((perms.net || []).length) errors.push(L(lang, `<agenthub.action id="${a.id}">: immediate — только у плагина без сети (с сетью ядро спросит подтверждения)`, `<agenthub.action id="${a.id}">: immediate only for a plugin without network (with network the core asks for confirmation)`));
      else if (a.cost || Object.values(a.i18n || {}).some((x) => x?.cost)) errors.push(L(lang, `<agenthub.action id="${a.id}">: immediate с ценой (cost=) — ядро спросит подтверждения с ценой; цену без окна — только словами в title`, `<agenthub.action id="${a.id}">: immediate with a cost (cost=) — the core asks for confirmation with the cost; a cost without a window — only in words in title`));
      else warnings.push(L(lang, `<agenthub.action id="${a.id}">: immediate — запуск одним щелчком, без окна: ревьюер проверяет, что действие ничего не тратит (квота, деньги, запуск агентов) сверх сказанного в title`, `<agenthub.action id="${a.id}">: immediate — runs in one click, no window: the reviewer checks it spends nothing (quota, money, starting agents) beyond what the title says`));
    }
  }
  // Подключения: только у официальных и своих (ядро берёт их только у builtin/official/own — стороннему плагину
  // право в окне согласия обещало бы то, чего не будет); хост адреса (и hosts сервера авторизации) — только из
  // объявленной сети плагина; id — свой: id плагина или «<id плагина>.<имя>» (точки в id плагина не бывает).
  const netHosts = new Set(perms.net.map((e) => e.what.toLowerCase()));
  if (!official && (meta.connections || []).length) errors.push(L(lang, "<agenthub.connection>: подключения есть только у официальных и своих плагинов", "<agenthub.connection>: only official and your own plugins have connections"));
  for (const c of meta.connections || []) {
    const name = c.id || id;
    for (const h of [c.host, ...(c.hosts || [])]) {
      if (h && !netHosts.has(String(h).toLowerCase())) errors.push(L(lang, `<agenthub.connection id="${name}">: хост ${h} не объявлен в <agenthub.net>`, `<agenthub.connection id="${name}">: host ${h} isn't declared in <agenthub.net>`));
    }
    if (id && !connectionIdOk(id, c.id)) errors.push(L(lang, `<agenthub.connection id="${name}">: id подключения — id плагина или «${id}.<имя>» (имя: a-z, 0-9, «-», с буквы, до 32; целиком — с буквы, до 64)`, `<agenthub.connection id="${name}">: the connection id must be the plugin id or "${id}.<name>" (name: a-z, 0-9, "-", starting with a letter, up to 32; the whole id starts with a letter, up to 64)`));
  }
  // Терминал (контракт 3): только у официальных и своих (маршрут /terminal/* ядро даёт только builtin/official/own);
  // запись — read-screen или send <слова>|*; набор во вкладку — предупреждение ревьюеру.
  if (!official && (perms.terminal || []).length) errors.push(L(lang, "<agenthub.terminal>: терминал есть только у официальных и своих плагинов", "<agenthub.terminal>: only official and your own plugins may use the terminal"));
  for (const e of perms.terminal || []) {
    const t = parseTerminalPerm(e.what);
    if (!t) errors.push(L(lang, `<agenthub.terminal>${e.what}: ждём «read-screen», «send /команда …» (slash-команда: «/», затем a-z, 0-9, «-»; до ${TERMINAL_WORDS_MAX}), «send ! # &» (знаки режимов) или «send *»`, `<agenthub.terminal>${e.what}: expected "read-screen", "send /command …" (a slash command: "/" then a-z, 0-9, "-"; up to ${TERMINAL_WORDS_MAX}), "send ! # &" (mode characters) or "send *"`));
    else if (t.op === "send" && t.modes.length) warnings.push(L(lang, `<agenthub.terminal>${e.what}: ${writeRiskText("terminal-mode", "ru")}. Право нужно только плагину, который без этого не может; проверьте, что плагин набирает такие строки только по явному действию человека и показывает их текст в окне подтверждения`, `<agenthub.terminal>${e.what}: ${writeRiskText("terminal-mode", "en")}. Only a plugin that cannot do without it needs this; check the plugin types such lines only on an explicit action of the person and shows their text in the confirmation`));
    else if (t.op === "send") warnings.push(L(lang, `<agenthub.terminal>${e.what}: ${writeRiskText("terminal", "ru")}. Проверьте, что плагин набирает только обещанное и только по действию человека или его настройке${t.any ? "; «send *» — любой запрос и любая slash-команда (кроме строк с «!», «#», «&» в начале — на них отдельное право «send !»)" : ""}`, `<agenthub.terminal>${e.what}: ${writeRiskText("terminal", "en")}. Check the plugin types only what it promises and only on the person's action or setting${t.any ? '; "send *" — any prompt and any slash command (except lines starting with "!", "#", "&" — those need the separate "send !" right)' : ""}`));
  }
  // Запись в места перехвата Claude Code и системы (контракт 3): допустимо, но ревьюер проверяет, что плагин пишет
  // туда ровно то, что обещает (белый список ключей, копия до правки), — окно согласия покажет это громко.
  for (const e of perms.fsWrite) {
    const risk = writeRisk(e.what, { pluginId: id });
    if (risk) warnings.push(L(lang, `<agenthub.fsWrite>${e.what}: место перехвата (${risk}) — ${writeRiskText(risk, "ru")}. Проверьте, что плагин пишет туда только обещанное; окно согласия показывает это право громкой строкой`, `<agenthub.fsWrite>${e.what}: a takeover location (${risk}) — ${writeRiskText(risk, "en")}. Check the plugin writes only what it promises there; the consent window shows this permission as a loud line`));
  }
  // Устаревшие виды push контракта 1: работают как свой переключатель плагина, но пора перейти на kind="plugin".
  for (const r of meta.push || []) {
    if (r?.legacyKind && r.kind === "plugin" && !r.wasDeclared) {
      // was= объявлен явно — это не устаревшая запись, а перенос выключателя (parsePushRule помечает wasDeclared)
      warnings.push(L(lang, `<agenthub.push key="${r.key}" kind="${r.legacyKind}">: вид устарел (контракт 1) — пишите kind="plugin" was="${r.legacyKind}"`, `<agenthub.push key="${r.key}" kind="${r.legacyKind}">: the kind is deprecated (contract 1) — write kind="plugin" was="${r.legacyKind}"`));
    }
  }
  // Значок: имя символа и цвет проверяет разбор метаданных; неверный тег — предупреждение разбора (не здесь).
  // Запретные места — ошибка для всех: исключений по метке official нет.
  for (const what of sourceViolations(source)) errors.push(L(lang, `исходник упоминает запретное место: ${what}`, `the source mentions a forbidden location: ${what}`));
  return { errors, warnings, permissions: perms };
}
