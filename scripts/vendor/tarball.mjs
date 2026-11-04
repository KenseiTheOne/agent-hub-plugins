// Архив плагина: tar (ustar) + gzip, только node:*. Писатель детерминирован (сортировка, mtime 0, uid/gid 0,
// права 0644/0755), читатель строгий: только обычные файлы и каталоги внутри <id>/, без ссылок, `..`,
// абсолютных путей и обратных слешей, с пределами на размер и число файлов.
//
// Модуль самодостаточен: его же копирует реестр agent-hub-plugins (scripts/vendor/) для сборки архивов.

import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;
export const LIMITS = Object.freeze({ maxFiles: 200, maxFileBytes: 2 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 });

function writeStr(buf, off, len, s) {
  const b = Buffer.from(s, "utf8");
  if (b.length > len) throw new Error(`поле tar длиннее ${len}: ${s}`);
  b.copy(buf, off);
}

function writeOctal(buf, off, len, n) {
  const s = n.toString(8).padStart(len - 1, "0");
  if (s.length > len - 1) throw new Error("число не влезает в поле tar");
  writeStr(buf, off, len, s + "\0");
}

function splitName(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  const i = path.lastIndexOf("/", 155);
  for (let j = i; j > 0; j = path.lastIndexOf("/", j - 1)) {
    const prefix = path.slice(0, j);
    const name = path.slice(j + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`путь слишком длинный для ustar: ${path}`);
}

function header(path, { size, mode, type }) {
  const h = Buffer.alloc(BLOCK, 0);
  const { name, prefix } = splitName(path);
  writeStr(h, 0, 100, name);
  writeOctal(h, 100, 8, mode);
  writeOctal(h, 108, 8, 0);
  writeOctal(h, 116, 8, 0);
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, 0);
  h.fill(0x20, 148, 156);
  h[156] = type.charCodeAt(0);
  writeStr(h, 257, 6, "ustar\0");
  writeStr(h, 263, 2, "00");
  writeStr(h, 345, 155, prefix);
  let sum = 0;
  for (const b of h) sum += b;
  writeStr(h, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
  return h;
}

// Безопасный относительный путь архива: a/b/c, без пустых сегментов, `.`/`..`, `\`, NUL, двоеточий.
export function safeRelPath(p) {
  if (typeof p !== "string" || !p || p.length > 255) return false;
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0") || p.includes(":")) return false;
  return p.split("/").every((seg) => seg && seg !== "." && seg !== "..");
}

// entries: [{ path: "id/file", data: Buffer|string, mode?: 0o644|0o755 }] → Buffer (.tar.gz)
export function packTarGz(entries) {
  const files = entries.map((e) => ({ path: e.path, data: Buffer.from(e.data), mode: e.mode & 0o111 ? 0o755 : 0o644 }));
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const dirs = new Set();
  for (const f of files) {
    if (!safeRelPath(f.path)) throw new Error(`недопустимый путь: ${f.path}`);
    const segs = f.path.split("/");
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join("/") + "/");
  }
  const parts = [];
  const sortedDirs = [...dirs].sort();
  for (const d of sortedDirs) parts.push(header(d, { size: 0, mode: 0o755, type: "5" }));
  for (const f of files) {
    parts.push(header(f.path, { size: f.data.length, mode: f.mode, type: "0" }));
    parts.push(f.data);
    const pad = (BLOCK - (f.data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  const gz = gzipSync(Buffer.concat(parts), { level: 9 });
  gz[9] = 3; // байт ОС в заголовке gzip: всегда «Unix», чтобы архив не зависел от платформы сборки
  return gz;
}

function readStr(buf, off, len) {
  const end = buf.indexOf(0, off);
  return buf.toString("utf8", off, end >= 0 && end < off + len ? end : off + len);
}

function readOctal(buf, off, len) {
  const s = readStr(buf, off, len).trim();
  if (!/^[0-7]*$/.test(s)) throw new Error("tar: число не восьмеричное");
  return s ? parseInt(s, 8) : 0;
}

// → [{ path, data: Buffer, mode }] — только файлы; бросает Error при любой странности.
// root — обязательный первый сегмент всех путей (id плагина).
export function readTarGz(gz, { root, limits = LIMITS } = {}) {
  let tar;
  try {
    tar = gunzipSync(gz, { maxOutputLength: limits.maxTotalBytes + 64 * 1024 + limits.maxFiles * 2 * BLOCK });
  } catch (e) {
    throw new Error(`gzip: ${e.code === "ERR_BUFFER_TOO_LARGE" ? "слишком большой" : "битый"}`);
  }
  const out = [];
  const seen = new Set();
  let total = 0;
  let off = 0;
  while (off + BLOCK <= tar.length) {
    const h = tar.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    const stored = readOctal(h, 148, 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    if (sum !== stored) throw new Error("tar: контрольная сумма заголовка");
    if (readStr(h, 257, 6) !== "ustar") throw new Error("tar: не ustar");
    const type = String.fromCharCode(h[156] || 0x30);
    const prefix = readStr(h, 345, 155);
    const name = readStr(h, 0, 100);
    const full = prefix ? `${prefix}/${name}` : name;
    const size = readOctal(h, 124, 12);
    const mode = readOctal(h, 100, 8);
    off += BLOCK;
    if (type === "5") {
      const d = full.replace(/\/$/, "");
      if (!safeRelPath(d) || (root && d.split("/")[0] !== root)) throw new Error(`tar: каталог вне ${root}: ${full}`);
      if (size !== 0) throw new Error("tar: каталог с размером");
      continue;
    }
    if (type !== "0") throw new Error(`tar: тип записи «${type}» запрещён (только файлы и каталоги): ${full}`);
    if (!safeRelPath(full)) throw new Error(`tar: недопустимый путь ${full}`);
    if (root && (full.split("/")[0] !== root || !full.includes("/"))) throw new Error(`tar: путь вне ${root}/: ${full}`);
    if (seen.has(full)) throw new Error(`tar: повтор ${full}`);
    if (size > limits.maxFileBytes) throw new Error(`tar: файл больше предела: ${full}`);
    total += size;
    if (total > limits.maxTotalBytes) throw new Error("tar: архив больше предела");
    if (off + size > tar.length) throw new Error("tar: обрезан");
    seen.add(full);
    if (seen.size > limits.maxFiles) throw new Error("tar: слишком много файлов");
    out.push({ path: full, data: Buffer.from(tar.subarray(off, off + size)), mode: mode & 0o111 ? 0o755 : 0o644 });
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}
