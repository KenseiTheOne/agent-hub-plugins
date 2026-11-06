// Режимы ночи раннера и их переключение правкой config.json раннера.
//
// Файл начинается с «_»: загрузчик плагинов его не берёт, его импортирует главный файл плагина
// (night-runner.30s.mjs). Режим выводится из config.json ровно так, как его понимает раннер:
//   - включённые проекты — `enabled !== false` (night-runner/lib/config.mjs: умолчание проекта enabled: true);
//   - исследование — `research.enabled === true` (умолчание RESEARCH.enabled: false);
//   - все проекты выключены, а исследование включено — ночь «только исследование» (night-run.mjs, nightProjects);
//   - ни проектов, ни исследования — раннер падает на старте «нет включённых проектов» (ночь ничего не делает).
// Плановая ночь зовёт исследование по конфигу (researchWanted: без флага и не вручную — cfg.research.enabled).
//
// Переключение меняет в файле только `research.enabled` и `enabled` у проектов. Правка — текстовая, по позициям
// разобранного JSON: порядок ключей, отступы и всё прочее в файле остаются байт в байт; после правки результат
// разбирается заново и сверяется с ожидаемым объектом — не сошлось, файл не пишется.

import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// Режимы, которые можно включить из хаба (id действий — mode-<режим>). "idle" — только состояние.
export const SWITCHABLE = ["tasks", "tasks-research", "research-only"];
export const MODES = [...SWITCHABLE, "idle"];

// Файл памяти режима (в каталоге данных плагина): какие проекты были включены перед «только исследование».
export const MEMORY_FILE = "night-mode.json";
export const BACKUP_DIR = "config-backups";
const BACKUPS_KEEP = 20;

// Режим по сырому config.json раннера. → { ok, mode, enabled:[id], research:bool, v1 } | { ok:false, problem }
// problem — тот же код, что у parseRunnerConfig главного файла (render переводит).
// researchSupported: false — раннер без команды research (до фичи исследования): его validateConfig отвергает
// неизвестный ключ research, так что ключ в конфиге — порча, а режимов с исследованием у него нет.
export function modeOf(raw, { researchSupported = true } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problem: "not-object" };
  let list = raw.projects;
  // конфиг v1 (без schema и projects) — один проект PerfectWar, включён; research у v1 раннер не читает (upgradeV1)
  const v1 = raw.schema === undefined && raw.projects === undefined;
  if (v1 && typeof raw.worktree === "string") list = [{ id: "perfectwar" }];
  if (!Array.isArray(list)) return { ok: false, problem: "no-projects" };
  // раннер: «projects — непустой список» (validateConfig)
  if (!list.length) return { ok: false, problem: "projects-empty" };
  const enabled = [];
  for (const p of list) {
    if (!p || typeof p !== "object" || typeof p.id !== "string") return { ok: false, problem: "project-no-id" };
    if (p.enabled !== undefined && typeof p.enabled !== "boolean") return { ok: false, problem: "project-enabled" };
    if (p.enabled !== false) enabled.push(p.id);
  }
  let research = false;
  if (!v1 && raw.research !== undefined && !researchSupported) return { ok: false, problem: "research-unsupported" };
  if (!v1 && raw.research !== undefined) {
    // `"research": true` раннер не раскладывает в выключенное — конфиг не проходит проверку
    if (!raw.research || typeof raw.research !== "object" || Array.isArray(raw.research)) return { ok: false, problem: "research-not-object" };
    if (raw.research.enabled !== undefined && typeof raw.research.enabled !== "boolean") return { ok: false, problem: "research-enabled" };
    research = raw.research.enabled === true;
  }
  const mode = enabled.length ? (research ? "tasks-research" : "tasks") : research ? "research-only" : "idle";
  return { ok: true, mode, enabled, research, v1 };
}

// ---------- текстовая правка JSON ----------

// Разбор JSON с позициями. → узел { type, start, end, members?:[{key, keyStart, value}], items?:[узел] }
// Бросает на неверном JSON (как JSON.parse).
export function parseJsonSpans(text) {
  let i = 0;
  const fail = () => {
    throw new SyntaxError(`JSON: позиция ${i}`);
  };
  const ws = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  };
  const str = () => {
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === '"') {
        i++;
        return;
      } else i++;
    }
    fail();
  };
  const value = () => {
    ws();
    const start = i;
    const c = text[i];
    if (c === "{") {
      i++;
      const members = [];
      ws();
      if (text[i] === "}") {
        i++;
        return { type: "object", start, end: i, members };
      }
      for (;;) {
        ws();
        const keyStart = i;
        str();
        const key = JSON.parse(text.slice(keyStart, i));
        ws();
        if (text[i] !== ":") fail();
        i++;
        members.push({ key, keyStart, value: value() });
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          break;
        }
        fail();
      }
      return { type: "object", start, end: i, members };
    }
    if (c === "[") {
      i++;
      const items = [];
      ws();
      if (text[i] === "]") {
        i++;
        return { type: "array", start, end: i, items };
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          break;
        }
        fail();
      }
      return { type: "array", start, end: i, items };
    }
    if (c === '"') {
      str();
      return { type: "string", start, end: i };
    }
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m) fail();
    i += m[0].length;
    return { type: "literal", start, end: i };
  };
  const root = value();
  ws();
  if (i !== text.length) fail();
  return root;
}

const member = (obj, key) => obj?.members?.find((m) => m.key === key) ?? null;

// Вставка ключа первым членом объекта — с тем же пробелом, что стоит перед прежним первым ключом.
function insertFirst(text, obj, keyJson, valueJson) {
  if (!obj.members.length) return { start: obj.start, end: obj.end, text: `{ ${keyJson}: ${valueJson} }` };
  const first = obj.members[0].keyStart;
  const gap = text.slice(obj.start + 1, first);
  return { start: first, end: first, text: `${keyJson}: ${valueJson},${gap || " "}` };
}

// Отсортированный JSON для сверки (порядок ключей не важен).
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

// Применить изменения к тексту config.json. changes: { research?: bool, projects?: { <id>: bool } }.
// → { ok, text, changed } | { ok:false, reason }
export function editConfigText(text, changes) {
  let raw;
  let root;
  try {
    raw = JSON.parse(text);
    root = parseJsonSpans(text);
  } catch {
    return { ok: false, reason: "bad-config" };
  }
  if (root.type !== "object") return { ok: false, reason: "bad-config" };
  const edits = [];
  const expected = structuredClone(raw);
  if (typeof changes.research === "boolean") {
    const r = member(root, "research");
    const want = changes.research;
    if (r && r.value.type === "object") {
      const en = member(r.value, "enabled");
      if (en) {
        if (raw.research.enabled !== want) edits.push({ start: en.value.start, end: en.value.end, text: String(want) });
      } else if (want) edits.push(insertFirst(text, r.value, '"enabled"', "true"));
      expected.research.enabled = want;
      if (!en && !want) delete expected.research.enabled;
    } else if (r) {
      return { ok: false, reason: "bad-config" };
    } else if (want) {
      // research нет — умолчание раннера enabled:false; включаем отдельным членом перед projects (как в config.example.json)
      const p = member(root, "projects");
      if (p) {
        let s = p.keyStart;
        while (s > root.start + 1 && /\s/.test(text[s - 1])) s--;
        const gap = text.slice(s, p.keyStart);
        edits.push({ start: p.keyStart, end: p.keyStart, text: `"research": { "enabled": true },${gap || " "}` });
      } else edits.push(insertFirst(text, root, '"research"', '{ "enabled": true }'));
      expected.research = { enabled: true };
    }
  }
  if (changes.projects && Object.keys(changes.projects).length) {
    const p = member(root, "projects");
    if (!p || p.value.type !== "array" || !Array.isArray(raw.projects)) return { ok: false, reason: "bad-config" };
    p.value.items.forEach((node, idx) => {
      const id = raw.projects[idx]?.id;
      if (typeof id !== "string" || !Object.hasOwn(changes.projects, id)) return;
      const want = changes.projects[id];
      const cur = raw.projects[idx].enabled !== false;
      if (cur === want) return;
      if (node.type !== "object") return;
      const en = member(node, "enabled");
      if (en) edits.push({ start: en.value.start, end: en.value.end, text: String(want) });
      else edits.push(insertFirst(text, node, '"enabled"', String(want)));
      expected.projects[idx].enabled = want;
    });
  }
  if (!edits.length) return { ok: true, text, changed: false };
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  let back;
  try {
    back = JSON.parse(out);
  } catch {
    return { ok: false, reason: "edit-failed" };
  }
  if (canon(back) !== canon(expected)) return { ok: false, reason: "edit-failed" };
  return { ok: true, text: out, changed: true };
}

// ---------- план переключения ----------

// Что поменять, чтобы ночь перешла в режим target. memory — { projects:[id] } | null (из readMemory).
// → { changes, remember: [id] | null, clearMemory, restored?: [id] } | { reason }
export function planModeChange(raw, target, memory, { researchSupported = true } = {}) {
  if (!SWITCHABLE.includes(target)) return { reason: "bad-mode" };
  if (target !== "tasks" && !researchSupported) return { reason: "runner-no-research" };
  const m = modeOf(raw, { researchSupported });
  if (!m.ok) return { reason: "bad-config" };
  // v1: раннер обернёт его сам и research не прочитает — правка ничего бы не включила
  if (m.v1) return { reason: "config-v1" };
  const ids = raw.projects.map((p) => p.id);
  if (target === "research-only") {
    const projects = Object.fromEntries(m.enabled.map((id) => [id, false]));
    return { changes: { research: true, projects }, remember: m.enabled.length ? [...m.enabled] : null, clearMemory: false };
  }
  const research = target === "tasks-research";
  // Раннер без исследования: ключ research не вписывается вовсе (его validateConfig отверг бы неизвестный ключ).
  const changes = (projects) => (researchSupported ? { research, projects } : { projects });
  // Включённые проекты есть — проекты не трогаем, а запомненный набор оставляем: он нужен лишь для возврата из
  // режима без включённых проектов, и страница заранее пишет, какие проекты он включит.
  if (m.enabled.length) return { changes: changes({}), remember: null, clearMemory: false };
  // включённых нет («только исследование» или «ничего не делает») — включаем ровно запомненные
  if (!memory || !Array.isArray(memory.projects) || !memory.projects.length) return { reason: "no-remembered-projects" };
  const back = memory.projects.filter((id) => ids.includes(id));
  if (!back.length) return { reason: "remembered-projects-gone" };
  return { changes: changes(Object.fromEntries(back.map((id) => [id, true]))), remember: null, clearMemory: true, restored: back };
}

// ---------- память режима и копии конфига (каталог данных плагина) ----------

// → { projects:[id], savedAt, config } | null. Память от другого config.json (сменили runnerDir) не в счёт.
export function readMemory(dataDir, cfgPath) {
  if (!dataDir) return null;
  try {
    const j = JSON.parse(readFileSync(join(dataDir, MEMORY_FILE), "utf8"));
    if (!j || !Array.isArray(j.projects) || !j.projects.every((x) => typeof x === "string")) return null;
    if (cfgPath && j.config && j.config !== cfgPath) return null;
    return { projects: j.projects, savedAt: typeof j.savedAt === "string" ? j.savedAt : null, config: j.config ?? null };
  } catch {
    return null;
  }
}

// Временный файл рядом с path (права mode), полностью записанный и сброшенный на диск; перед возвратом перечитан и
// сверен. Любая ошибка — временный файл удалён (в каталоге раннера он попал бы в его снимок целостности). → путь
export function writeTmp(path, text, mode) {
  const tmp = join(dirname(path), `.${basename(path)}.agenthub-${process.pid}-${Date.now()}.tmp`);
  const buf = Buffer.from(text, "utf8");
  let fd = null;
  try {
    fd = openSync(tmp, "wx", mode);
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (!(n > 0)) throw new Error("short write");
      off += n;
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    chmodSync(tmp, mode); // umask мог срезать права при создании
    if (!readFileSync(tmp).equals(buf)) throw new Error("tmp differs");
    return tmp;
  } catch (e) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function writeMemory(dataDir, projects, cfgPath) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, MEMORY_FILE);
  const tmp = writeTmp(path, JSON.stringify({ version: 1, projects, savedAt: new Date().toISOString(), config: cfgPath }, null, 2) + "\n", 0o600);
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function clearMemory(dataDir) {
  rmSync(join(dataDir, MEMORY_FILE), { force: true });
}

// Копия прежнего config.json (0600) в PluginData/<BACKUP_DIR>; хранится последние BACKUPS_KEEP. → путь копии
export function backupConfig(dataDir, text) {
  const dir = join(dataDir, BACKUP_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(path, text, { mode: 0o600, flag: "wx" });
  const old = readdirSync(dir).filter((n) => /^config-.*\.json$/.test(n)).sort();
  for (const n of old.slice(0, Math.max(0, old.length - BACKUPS_KEEP))) rmSync(join(dir, n), { force: true });
  return path;
}

// Можно ли заменить config.json раннера, ничего не испортив. Проверяется ДО побочных эффектов (копия, память) и ещё
// раз при записи. → null | reason
//   config-symlink — ссылка или не файл: rename заменил бы ссылку обычным файлом мимо объявленного пути;
//   config-hardlink — у файла несколько имён: rename отвязал бы это имя, остальные остались бы со старым текстом;
//   config-readonly — у владельца нет права записи: владелец закрыл файл от правок, rename обошёл бы это.
export function configProblem(cfgPath) {
  let st;
  try {
    st = lstatSync(cfgPath);
  } catch {
    return "no-runner-config";
  }
  if (st.isSymbolicLink() || !st.isFile()) return "config-symlink";
  if (st.nlink > 1) return "config-hardlink";
  if (!(st.mode & 0o200)) return "config-readonly";
  return null;
}

// Атомарная замена config.json, шаг 1: временный файл рядом (права — как у прежнего). → { ok, tmp } | { ok:false, reason }
export function stageConfig(cfgPath, after) {
  const bad = configProblem(cfgPath);
  if (bad) return { ok: false, reason: bad };
  try {
    return { ok: true, tmp: writeTmp(cfgPath, after, statSync(cfgPath).mode & 0o7777) };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

// Шаг 2: файл за время правки не поменяли (тот же текст, та же проверка формы) — rename. Иначе временный удаляется.
export function commitConfig(cfgPath, tmp, before) {
  try {
    const bad = configProblem(cfgPath);
    if (bad) {
      rmSync(tmp, { force: true });
      return { ok: false, reason: bad };
    }
    if (readFileSync(cfgPath, "utf8") !== before) {
      rmSync(tmp, { force: true });
      return { ok: false, reason: "config-changed" };
    }
    renameSync(tmp, cfgPath);
    return { ok: true };
  } catch {
    rmSync(tmp, { force: true });
    return { ok: false, reason: "write-failed" };
  }
}

export function dropStaged(tmp) {
  rmSync(tmp, { force: true });
}
