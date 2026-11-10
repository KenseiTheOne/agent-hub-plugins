#!/usr/bin/env node
// Вендоринг ядра Agent Hub в реестр: разборщики и копия контракта плагинов.
//
// CI реестра не видит соседнюю репу agent-hub, поэтому нужное лежит здесь копией:
//   scripts/vendor/ — модули демона:
//     meta.mjs, output.mjs                — разбор метаданных и вывода (daemon/lib/)
//     minisign.mjs, tarball.mjs, perms.mjs — подпись, архив, права (daemon/lib/registry/)
//     native.mjs                           — заглушка (аддон peercred реестру не нужен; xattr бинарников —
//                                            не наш случай: в реестре только текстовые плагины)
//   docs/contract/  — контракт плагинов для автора плагина (CONTRACT_DOCS ниже): extension-points.md целиком и
//                     нужные автору разделы push/README.md, plugins-registry.md, api.md, с шапкой «копия, не править».
// Модули — побайтные копии; документы — разделы исходника как есть плюс шапка. sha256 всего записывается в
// scripts/vendor/VENDOR.json. check.sh сверяет копии с этим файлом всегда, а с исходником — если рядом есть
// agent-hub (AGENT_HUB_DIR или ../agent-hub).
//
//   node scripts/sync-vendor.mjs [--from <путь к agent-hub>] [--check]
// --check — только сверить (код 1 при расхождении), ничего не писать.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./lib/is-main.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_DIR = join(ROOT, "scripts", "vendor");
export const CONTRACT_DIR = join(ROOT, "docs", "contract");
export const FILES = {
  "meta.mjs": "daemon/lib/meta.mjs",
  "output.mjs": "daemon/lib/output.mjs",
  "minisign.mjs": "daemon/lib/registry/minisign.mjs",
  "tarball.mjs": "daemon/lib/registry/tarball.mjs",
  "perms.mjs": "daemon/lib/registry/perms.mjs",
};
export const NATIVE_STUB = `// Заглушка вендоринга (scripts/sync-vendor.mjs): реестру аддон peercred не нужен.
export function loadNative() {
  return null;
}
`;

// Копия контракта для автора плагина. sections: null — файл целиком; иначе — разделы, чей заголовок начинается с
// этой строки (раздел — от заголовка до следующего заголовка того же или старшего уровня), в порядке списка.
// Что сюда входит: всё, что плагин объявляет и печатает (метаданные, вывод, действия, push, подключения), как его
// ставят и обновляют (уровни, права, свои источники, каталог) и версии контракта. Что нет: внутренности демона
// (каталог состояния, служебные маршруты, журнал) — их автор плагина не видит.
export const CONTRACT_DOCS = [
  { out: "extension-points.md", src: "docs/extension-points.md", sections: null, about: "контракт плагина: имя файла, метаданные, вывод, действия, окружение, версии контракта" },
  { out: "push.md", src: "daemon/lib/push/README.md", sections: ["Ключи событий для плагинов", "Выключатели"], about: "правила push (<agenthub.push>), виды и свой переключатель плагина, перенос настроек контракта 1" },
  { out: "plugins-registry.md", src: "docs/plugins-registry.md", sections: ["Политика для ядра", "Свои источники", "Зависимости в каталоге", "Индекс: `tier`", "Контракт плагинов 2"], about: "уровни и права, свои плагины из папки, «Нужен …», что нужно от реестра" },
  { out: "api.md", src: "docs/api.md", sections: ["`POST /actions/:id`", "Подключения"], about: "запуск действия и его результат (reason=, message=), подключения и вызов MCP через хаб" },
];

const sha = (b) => createHash("sha256").update(b).digest("hex");

export function agentHubDir(env = process.env) {
  const cands = [env.AGENT_HUB_DIR, join(ROOT, "..", "agent-hub")].filter(Boolean);
  return cands.find((d) => existsSync(join(d, "daemon", "lib", "meta.mjs"))) || null;
}

// Версия контракта ядра — CONTRACT_VERSION из meta.mjs (текстом: модуль не исполняем). Нет — 1 (до 09.11).
export function contractVersion(metaText) {
  const m = /export const CONTRACT_VERSION = (\d+);/.exec(String(metaText));
  return m ? Number(m[1]) : 1;
}

// Разделы markdown по началу заголовка; строки внутри ``` — не заголовки (там бывают «# <agenthub.push …>»).
// → { text, missing: [префиксы без раздела] }
export function pickSections(md, prefixes) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*)$/.exec(l);
    if (m) heads.push({ i, level: m[1].length, text: m[2].trim() });
  });
  const parts = [];
  const missing = [];
  for (const p of prefixes) {
    const h = heads.find((x) => x.text.startsWith(p));
    if (!h) {
      missing.push(p);
      continue;
    }
    const next = heads.find((x) => x.i > h.i && x.level <= h.level);
    parts.push(lines.slice(h.i, next ? next.i : lines.length).join("\n").replace(/\s+$/, ""));
  }
  return { text: parts.join("\n\n") + "\n", missing };
}

function header(doc, version) {
  const what = doc.sections ? `\`${doc.src}\`, разделы: ${doc.sections.map((s) => `«${s.replace(/`/g, "")}»`).join(", ")}` : `\`${doc.src}\` целиком`;
  return [
    `<!-- Копия из agent-hub, контракт v${version}. Не править: файл пишет node scripts/sync-vendor.mjs, --check ловит расхождение. -->`,
    `> **Копия из agent-hub, контракт v${version} — не править.** Источник: ${what}. Обновляет`,
    "> `node scripts/sync-vendor.mjs` (рядом с agent-hub); `node scripts/sync-vendor.mjs --check` и CI ловят расхождение.",
    "> Пути и ссылки в тексте — от корня репозитория agent-hub. Нужна возможность, которой здесь нет, — запишите, что",
    "> нужно, и отдайте в сессию хаба (CLAUDE.md реестра).",
    "",
    "",
  ].join("\n");
}

function readmeText(version) {
  return [
    `<!-- Копия из agent-hub, контракт v${version}. Не править: файл пишет node scripts/sync-vendor.mjs, --check ловит расхождение. -->`,
    `# Контракт плагинов Agent Hub (копия, контракт v${version})`,
    "",
    "Что ядро хаба понимает в плагине — копия документации agent-hub для авторов плагинов реестра. Читать здесь, а не в",
    "репозитории хаба. Файлы не править руками: их пишет `node scripts/sync-vendor.mjs`.",
    "",
    "| Файл | Что |",
    "|---|---|",
    ...CONTRACT_DOCS.map((d) => `| [${d.out}](${d.out}) | ${d.about} |`),
    "",
    "Версия контракта плагина — тег `<agenthub.contract>N</agenthub.contract>` (раздел «Версии контракта» в",
    "extension-points.md): объявляйте ту, чьими возможностями пользуетесь; хаб версии 2 и новее с контрактом старше покажет",
    "«Нужен хаб новее». Хабы контракта 1 тег не знают и поставят плагин молча — публиковать такой плагин только после",
    "обновления хаба (там же, «Порядок выкатки»).",
    "",
  ].join("\n");
}

// → { "<имя в docs/contract>": Buffer } из исходников agent-hub; missing — разделы, которых в источнике нет.
export function buildContractDocs(from) {
  const version = contractVersion(readFileSync(join(from, FILES["meta.mjs"]), "utf8"));
  const out = { "README.md": Buffer.from(readmeText(version)) };
  const missing = [];
  for (const d of CONTRACT_DOCS) {
    const src = readFileSync(join(from, d.src), "utf8").replace(/\r\n/g, "\n");
    let body = src.endsWith("\n") ? src : src + "\n";
    if (d.sections) {
      const r = pickSections(src, d.sections);
      for (const p of r.missing) missing.push(`${d.src}: нет раздела «${p}»`);
      body = r.text;
    }
    out[d.out] = Buffer.from(header(d, version) + body);
  }
  return { version, docs: out, missing };
}

// → { ok, problems: [...], drift: [...] } — problems: копия не совпала с VENDOR.json; drift: исходник ушёл вперёд
// Файл Finder: ОС кладёт его сама, а .gitignore не пускает в git — не «лишний файл». Только то, что закрыто
// .gitignore: любой другой файл (в том числе с точкой в начале) git возьмёт в коммит, и проверка обязана его поймать.
const OS_JUNK = new Set([".DS_Store"]);

// vendorDir / contractDir — для тестов (копия во временном каталоге); по умолчанию — каталоги реестра
export function checkVendor({ from = agentHubDir(), vendorDir = VENDOR_DIR, contractDir = CONTRACT_DIR } = {}) {
  const problems = [];
  const drift = [];
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(vendorDir, "VENDOR.json"), "utf8"));
  } catch {
    problems.push("нет scripts/vendor/VENDOR.json");
  }
  const files = manifest.files || {};
  const all = { ...FILES, "native.mjs": null };
  for (const name of Object.keys(all)) {
    const p = join(vendorDir, name);
    if (!existsSync(p)) {
      problems.push(`нет scripts/vendor/${name}`);
      continue;
    }
    const h = sha(readFileSync(p));
    if (files[name] !== h) problems.push(`scripts/vendor/${name} не совпадает с VENDOR.json (правка руками?)`);
    if (from && all[name]) {
      const src = join(from, all[name]);
      if (existsSync(src) && sha(readFileSync(src)) !== h) drift.push(`${name} отличается от ${all[name]} — запустите node scripts/sync-vendor.mjs`);
    }
  }
  // копия контракта: ровно файлы из VENDOR.json, каждый — с тем же sha256; лишний файл в docs/contract — тоже ошибка (кроме .DS_Store — его не пускает .gitignore)
  const docs = manifest.docs || {};
  const want = ["README.md", ...CONTRACT_DOCS.map((d) => d.out)];
  for (const name of want) {
    const p = join(contractDir, name);
    if (!existsSync(p)) problems.push(`нет docs/contract/${name} — запустите node scripts/sync-vendor.mjs`);
    else if (docs[name] !== sha(readFileSync(p))) problems.push(`docs/contract/${name} не совпадает с VENDOR.json (правка руками?)`);
  }
  if (existsSync(contractDir)) for (const name of readdirSync(contractDir)) if (!want.includes(name) && !OS_JUNK.has(name)) problems.push(`docs/contract/${name}: лишний файл — копию пишет только scripts/sync-vendor.mjs`);
  if (from) {
    try {
      const built = buildContractDocs(from);
      for (const m of built.missing) problems.push(`контракт: ${m} (поправьте CONTRACT_DOCS в scripts/sync-vendor.mjs)`);
      for (const [name, data] of Object.entries(built.docs)) {
        const p = join(contractDir, name);
        if (existsSync(p) && sha(readFileSync(p)) !== sha(data)) drift.push(`docs/contract/${name} отстал от agent-hub — запустите node scripts/sync-vendor.mjs`);
      }
      if (manifest.contract !== built.version) drift.push(`контракт в VENDOR.json — ${manifest.contract ?? "нет"}, у agent-hub — ${built.version}: запустите node scripts/sync-vendor.mjs`);
    } catch (e) {
      drift.push(`контракт: не прочитать документы agent-hub (${e.code || e.message})`);
    }
  }
  return { ok: problems.length === 0, problems, drift, contract: manifest.contract ?? null };
}

export function syncVendor(from) {
  const built = buildContractDocs(from);
  if (built.missing.length) throw new Error(`в документах agent-hub нет разделов:\n${built.missing.join("\n")}\nпоправьте CONTRACT_DOCS в scripts/sync-vendor.mjs`);
  mkdirSync(VENDOR_DIR, { recursive: true });
  const files = {};
  for (const [name, rel] of Object.entries(FILES)) {
    const data = readFileSync(join(from, rel));
    writeFileSync(join(VENDOR_DIR, name), data);
    files[name] = sha(data);
  }
  writeFileSync(join(VENDOR_DIR, "native.mjs"), NATIVE_STUB);
  files["native.mjs"] = sha(Buffer.from(NATIVE_STUB));
  rmSync(CONTRACT_DIR, { recursive: true, force: true });
  mkdirSync(CONTRACT_DIR, { recursive: true });
  const docs = {};
  for (const [name, data] of Object.entries(built.docs)) {
    writeFileSync(join(CONTRACT_DIR, name), data);
    docs[name] = sha(data);
  }
  const manifest = {
    note: "копии модулей agent-hub/daemon и контракта плагинов (docs/contract); обновлять только scripts/sync-vendor.mjs",
    contract: built.version,
    source: FILES,
    files,
    docsSource: Object.fromEntries(CONTRACT_DOCS.map((d) => [d.out, d.sections ? `${d.src} (${d.sections.join("; ")})` : d.src])),
    docs,
  };
  writeFileSync(join(VENDOR_DIR, "VENDOR.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--from");
  const from = i >= 0 ? resolve(args[i + 1]) : agentHubDir();
  if (args.includes("--check")) {
    const r = checkVendor({ from });
    for (const p of [...r.problems, ...r.drift]) console.error(p);
    process.exit(r.ok && !r.drift.length ? 0 : 1);
  }
  if (!from) {
    console.error("не найден agent-hub: укажите --from <путь> или AGENT_HUB_DIR");
    process.exit(2);
  }
  try {
    const m = syncVendor(from);
    console.log(`скопировано из ${from}: ${Object.keys(m.files).join(", ")}; контракт v${m.contract} → docs/contract: ${Object.keys(m.docs).join(", ")}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
