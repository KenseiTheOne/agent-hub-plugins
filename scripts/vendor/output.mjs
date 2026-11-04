// Разбор вывода плагина в формате SwiftBar.
//
//   Шапка (строки до первого `---`)  → строка в меню
//   ---
//   Тело: `Заголовок | ключ=значение ключ2="значение с пробелами"`, вложенность префиксом `--`
//
// Наши параметры: status, effect, action, event. Оформление (color, sfimage, …) — как есть.
// `bash=`/`shell=`/`terminal=`/`paramN=` запрещены: выбрасываются с предупреждением.
// Для streamable кадры разделяются строкой `~~~` (splitFrames / FrameSplitter).

export const STATUSES = ["ok", "unknown", "wait", "block", "error"];
// Тяжесть для «худшего статуса»: чем больше, тем хуже.
export const SEVERITY = { ok: 0, unknown: 1, wait: 2, block: 3, error: 4 };

const FORBIDDEN = /^(bash|shell|terminal|param\d+)$/i;
const MAX_LINES = 2000;
const MAX_VALUE = 2000;

export function worstStatus(list) {
  let worst = "ok";
  for (const s of list) if (s in SEVERITY && SEVERITY[s] > SEVERITY[worst]) worst = s;
  return worst;
}

// Параметры `k=v k2="v 2" k3='v 3'`. → { params, ok } (ok=false, если в строке есть мусор, а не параметры)
export function parseParams(text) {
  const params = {};
  const re = /\s*([A-Za-z_][\w.-]*)=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S*))/y;
  let pos = 0;
  let any = false;
  text = text.trimEnd();
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) return { params, ok: false };
    const raw = m[2] ?? m[3] ?? m[4] ?? "";
    params[m[1]] = m[2] !== undefined || m[3] !== undefined ? raw.replace(/\\(.)/g, "$1") : raw;
    pos = re.lastIndex;
    any = true;
  }
  return { params, ok: any };
}

// Одна строка → { title, params } (разделитель — последний `|`, справа от которого только параметры).
export function parseLine(line) {
  let idx = line.lastIndexOf("|");
  while (idx >= 0) {
    const { params, ok } = parseParams(line.slice(idx + 1));
    if (ok) return { title: line.slice(0, idx).trimEnd(), params };
    idx = line.lastIndexOf("|", idx - 1);
  }
  return { title: line, params: {} };
}

// Значение effect: `<примитив> [арг...]`; аргумент `ключ=значение` или позиционный.
export function parseEffectSpec(spec) {
  const s = String(spec).trim();
  const m = /^([a-z][\w]*(?:\.[a-zA-Z][\w]*)+)(?:\s+([\s\S]*))?$/.exec(s);
  if (!m) return null;
  const tokens = tokenize(m[2] || "");
  if (!tokens) return null;
  return { primitive: m[1], tokens };
}

// Токены через пробел; кавычки "…" и '…' могут стоять внутри токена (key="a b"). null — незакрытая кавычка.
export function tokenize(text) {
  const out = [];
  let cur = "";
  let has = false;
  let q = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === "\\" && i + 1 < text.length) cur += text[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (q) return null;
  if (has) out.push(cur);
  return out;
}

function cap(v) {
  return typeof v === "string" && v.length > MAX_VALUE ? v.slice(0, MAX_VALUE) : v;
}

// Разбор одного кадра. → { header: Item[], body: Item[], status, events: string[], warnings: string[] }
// Item: { title, level, separator?, params, status?, effect?, action?, event?, href? }
export function parseOutput(text) {
  const warnings = [];
  const header = [];
  const body = [];
  const events = [];
  let status = null;
  let inBody = false;
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > MAX_LINES) warnings.push(`вывод обрезан до ${MAX_LINES} строк`);
  for (const rawLine of lines.slice(0, MAX_LINES)) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "---") {
      if (!inBody) inBody = true;
      else body.push({ title: "", level: 0, separator: true, params: {} });
      continue;
    }
    if (line.trim() === "" && !inBody) continue;
    if (line.trim() === "") continue;
    let level = 0;
    let rest = line;
    if (inBody) {
      // `--` — уровень вложенности; оставшееся `---` после уровней — разделитель в подменю
      while (rest.startsWith("--") && !/^---\s*$/.test(rest)) {
        rest = rest.slice(2);
        level++;
      }
      if (level > 0 && /^-{3}\s*$/.test(rest)) {
        body.push({ title: "", level, separator: true, params: {} });
        continue;
      }
      rest = rest.replace(/^\s+/, "");
    }
    const { title, params } = parseLine(rest);
    const item = { title: cap(title), level, params: {} };
    for (const [k, v] of Object.entries(params)) {
      const key = k.toLowerCase();
      if (FORBIDDEN.test(key)) {
        warnings.push(`параметр ${key}= запрещён и проигнорирован`);
        continue;
      }
      if (key === "status") {
        if (STATUSES.includes(v)) item.status = v;
        else warnings.push(`неизвестный status «${v}»`);
      } else if (key === "effect") {
        item.effect = cap(v);
      } else if (key === "action") {
        item.action = cap(v);
      } else if (key === "event") {
        if (/^[\w.:/-]{1,128}$/.test(v)) item.event = v;
        else warnings.push(`некорректный ключ event «${String(v).slice(0, 40)}»`);
      } else if (key === "href") {
        item.href = cap(v);
      } else {
        item.params[k] = cap(v);
      }
    }
    if (item.event) events.push(item.event);
    if (!inBody) {
      if (item.status && status === null) status = item.status;
      else if (item.status) status = worstStatus([status, item.status]);
      header.push(item);
    } else body.push(item);
  }
  if (header.length === 0 && body.length === 0) return { header, body, status: "unknown", events, warnings, empty: true };
  return { header, body, status: status ?? "ok", events: [...new Set(events)], warnings, empty: false };
}

// Делитель потока streamable на кадры по строке `~~~`.
// Кадры streamable-плагина. Работают оба стиля SwiftBar:
//   «кадр, затем ~~~» — кадр отдаётся по ~~~;
//   «~~~, затем кадр» (SwiftBar показывает кадр сразу) — кадр отдаётся после короткой тишины в потоке
//   (idleMs без новых строк), не дожидаясь следующего ~~~.
// После выдачи по тишине кадр не сбрасывается: новые строки дописываются к нему и выдаются снова; ~~~
// закрывает кадр (повторно не выдаётся, если с прошлой выдачи ничего не прибавилось).
export const FRAME_IDLE_MS = 150;

export class FrameSplitter {
  constructor(onFrame, maxBytes = 1024 * 1024, { idleMs = FRAME_IDLE_MS } = {}) {
    this.onFrame = onFrame;
    this.maxBytes = maxBytes;
    this.idleMs = idleMs;
    this.buf = "";
    this.cur = [];
    this.size = 0;
    this.overflow = false;
    this.dirty = false;
    this.timer = null;
  }
  emit() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.onFrame(this.cur.join("\n"), this.overflow);
  }
  push(chunk) {
    this.buf += chunk;
    let nl;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.replace(/\r$/, "").trim() === "~~~") {
        // кадр может быть пустым, если ~~~ стоит в начале
        if (this.cur.length || this.size) this.emit();
        clearTimeout(this.timer);
        this.timer = null;
        this.cur = [];
        this.size = 0;
        this.overflow = false;
        this.dirty = false;
      } else if (this.size + line.length <= this.maxBytes) {
        this.cur.push(line);
        this.size += line.length + 1;
        this.dirty = true;
      } else {
        this.overflow = true;
        this.dirty = true;
      }
    }
    if (this.buf.length > this.maxBytes) {
      this.buf = "";
      this.overflow = true;
    }
    if (this.dirty && this.idleMs > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.emit(), this.idleMs);
      this.timer.unref?.();
    }
  }
  // конец потока: недописанный кадр отдаём как есть
  end() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.buf) {
      this.cur.push(this.buf);
      this.dirty = true;
    }
    this.buf = "";
    if (this.cur.length && this.dirty) this.onFrame(this.cur.join("\n"), this.overflow);
    this.dirty = false;
    this.cur = [];
  }
}

export function splitFrames(text) {
  const frames = [];
  const s = new FrameSplitter((f) => frames.push(f));
  s.push(String(text));
  s.end();
  return frames;
}
