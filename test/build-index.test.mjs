// scripts/build-index.mjs: index.json с sha256 архивов, детерминизм, подпись minisign через node:crypto.
// Ключи генерируются только здесь, в памяти/временном каталоге, и удаляются.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex } from "../scripts/build-index.mjs";
import { keygen } from "../scripts/keygen.mjs";
import { generateKeyPair, verify } from "../scripts/vendor/minisign.mjs";
import { readTarGz } from "../scripts/vendor/tarball.mjs";
import { parseMetaText } from "../scripts/vendor/meta.mjs";
import { permissionsFingerprint, permissionsFromMeta } from "../scripts/vendor/perms.mjs";
import { cleanup, makeRegistry, pluginSource, README, tempDir } from "./helpers.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");

function registry() {
  return makeRegistry(
    {
      hello: { "hello.5m.mjs": pluginSource(), "README.md": README, "fixtures/home/.config/hello/state.json": "x", "test/hello.test.mjs": "// тест" },
      quota: { "quota.30s.mjs": pluginSource({ title: "Quota", version: "2.1.0" }), "README.md": README, "lib/util.mjs": "export const x = 1;\n" },
    },
    { official: ["quota"], blocklist: [{ id: "evil", reason: "крадёт токены" }] },
  );
}

test("index.json: записи с sha256 и размером архивов, права с «зачем», official, blocklist", () => {
  const root = registry();
  const out = tempDir("ahp-out-");
  try {
    const { index, signed } = buildIndex({ root, out, generatedAt: "2026-11-04T10:00:00.000Z" });
    assert.equal(signed, false);
    assert.equal(index.version, 1);
    assert.deepEqual(index.plugins.map((p) => p.id), ["hello", "quota"]);
    for (const p of index.plugins) {
      const gz = readFileSync(join(out, p.archive));
      assert.equal(p.sha256, sha(gz));
      assert.equal(p.size, gz.length);
      const files = readTarGz(gz, { root: p.id }).map((f) => f.path);
      assert.ok(!files.some((f) => f.includes("/test/") || f.includes("/fixtures/")), files.join(","));
    }
    const hello = index.plugins[0];
    assert.equal(hello.interval, "5m");
    assert.deepEqual(hello.permissions.fsRead, [{ what: "~/.config/hello/state.json", why: "показать состояние" }]);
    assert.equal(index.plugins[1].official, true);
    assert.deepEqual(readTarGz(readFileSync(join(out, index.plugins[1].archive)), { root: "quota" }).map((f) => f.path), ["quota/README.md", "quota/lib/util.mjs", "quota/quota.30s.mjs"]);
    assert.deepEqual(index.blocklist, [{ id: "evil", reason: "крадёт токены" }]);
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("watch в индексе — в прежнем виде записи: права архива сверяются и ядром до 05.11, и новым (ревью регрессий)", () => {
  const root = makeRegistry({
    w: { "w.5m.mjs": pluginSource({ title: "W", extra: ["// <agenthub.watch>~/.config/w/state  --  менять кадр сразу</agenthub.watch>"] }), "README.md": README },
  });
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ root, out, generatedAt: "2026-11-04T10:00:00.000Z" });
    const entry = JSON.parse(JSON.stringify(index.plugins[0].permissions));
    // прежний вид: вся строка (пробелы схлопнуты), why: null — так ключ считало ядро до 05.11
    assert.deepEqual(entry.watch, [{ what: "~/.config/w/state -- менять кадр сразу", why: null }]);
    const gz = readFileSync(join(out, index.plugins[0].archive));
    const main = readTarGz(gz, { root: "w" }).find((f) => f.path === "w/w.5m.mjs");
    const { meta } = parseMetaText(main.data.toString("utf8"));
    // новое ядро: права архива (what — путь) сверяются с записью (permissionList разбирает прежний вид)
    assert.equal(permissionsFingerprint(permissionsFromMeta(meta)), permissionsFingerprint(entry));
    // ядро до 05.11: ключ watch — вся строка метаданных
    const oldKeys = (m) => (m.watch || []).map((w) => `watch:${String(w).trim().replace(/\s+/g, " ")}`);
    assert.deepEqual(oldKeys(meta), entry.watch.map((e) => `watch:${e.what}`));
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("архивы детерминированы: две сборки — одинаковые sha256", () => {
  const root = registry();
  const a = tempDir("ahp-a-");
  const b = tempDir("ahp-b-");
  try {
    const i1 = buildIndex({ root, out: a, generatedAt: "2026-11-04T10:00:00.000Z" }).index;
    const i2 = buildIndex({ root, out: b, generatedAt: "2026-11-04T10:00:00.000Z" }).index;
    assert.deepEqual(i1.plugins.map((p) => p.sha256), i2.plugins.map((p) => p.sha256));
    assert.equal(readFileSync(join(a, "index.json"), "utf8"), readFileSync(join(b, "index.json"), "utf8"));
  } finally {
    cleanup(root);
    cleanup(a);
    cleanup(b);
  }
});

test("подпись: свой ключ проходит, чужой ключ и правка индекса — нет", () => {
  const root = registry();
  const out = tempDir("ahp-out-");
  const mine = generateKeyPair();
  const alien = generateKeyPair();
  try {
    buildIndex({ root, out, secretKey: mine.secretKey });
    const text = readFileSync(join(out, "index.json"));
    const sig = readFileSync(join(out, "index.json.minisig"), "utf8");
    const ok = verify(text, sig, mine.publicKey);
    assert.equal(ok.ok, true);
    assert.match(ok.trustedComment, /generatedAt=.* plugins=2/);
    assert.equal(verify(text, sig, alien.publicKey).reason, "key-mismatch");
    // чужой ключ с тем же keyId (подделка заголовка) — подпись не сходится
    const forged = alien.publicKey.replace(/\n(.+)\n$/, (_, b64) => {
      const raw = Buffer.from(b64, "base64");
      Buffer.from(mine.publicKey.split("\n")[1], "base64").copy(raw, 2, 2, 10);
      return "\n" + raw.toString("base64") + "\n";
    });
    assert.equal(verify(text, sig, forged).reason, "signature");
    assert.equal(verify(Buffer.concat([text, Buffer.from(" ")]), sig, mine.publicKey).reason, "signature");
    const badComment = sig.replace(/^trusted comment: .*$/m, "trusted comment: подменено");
    assert.equal(verify(text, badComment, mine.publicKey).reason, "global-signature");
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("плагин с ошибками линтера валит сборку целиком", () => {
  const root = makeRegistry({ bad: { "bad.1m.mjs": pluginSource({ effects: "session.stop" }), "README.md": README } });
  const out = tempDir("ahp-out-");
  try {
    assert.throws(() => buildIndex({ root, out }), /session\.stop/);
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("--flat-archives: архивы рядом с index.json", () => {
  const root = registry();
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ root, out, flat: true });
    assert.equal(index.plugins[0].archive, "hello-1.0.0.tar.gz");
    assert.ok(statSync(join(out, "hello-1.0.0.tar.gz")).size > 0);
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("keygen: пишет ключ 0600 во временный каталог и отказывается писать в репу", () => {
  const dir = tempDir("ahp-key-");
  try {
    const r = keygen(join(dir, "keys"));
    if (process.platform !== "win32") assert.equal(statSync(r.keyFile).mode & 0o777, 0o600);
    const pub = readFileSync(r.pubFile, "utf8");
    assert.match(pub, /^untrusted comment: minisign public key [0-9A-F]{16}\n/);
    assert.throws(() => keygen(join(dir, "keys")), /уже есть/);
    assert.throws(() => keygen(join(dirname(fileURLToPath(import.meta.url)), "..", "tmp-keys")), /внутри репы/);
  } finally {
    cleanup(dir);
  }
});

test("переводы в индексе: название, описание и «зачем» у прав (lang=\"en\"); права (ключи) от перевода не зависят", () => {
  const root = makeRegistry({
    hello: {
      "hello.5m.mjs": pluginSource({
        extra: ['// <agenthub.title lang="en">Hi</agenthub.title>', '// <agenthub.fsRead lang="en">~/.config/hello/state.json — show the state</agenthub.fsRead>'],
      }),
      "README.md": README,
    },
  });
  const out = tempDir("ahp-out-");
  try {
    const hello = buildIndex({ root, out, generatedAt: "2026-11-04T10:00:00.000Z" }).index.plugins[0];
    assert.deepEqual(hello.i18n, { en: { title: "Hi", why: { "~/.config/hello/state.json": "show the state" } } });
    assert.deepEqual(hello.permissions.fsRead, [{ what: "~/.config/hello/state.json", why: "показать состояние" }]);
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("официальные плагины: у каждого права есть английское «зачем», у каждого действия — title-en", () => {
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ out, generatedAt: "2026-11-04T10:00:00.000Z" });
    for (const p of index.plugins) {
      const en = p.i18n?.en || {};
      for (const k of ["fsRead", "fsWrite", "exec", "secrets", "net"]) {
        for (const e of p.permissions[k] || []) assert.ok(en.why?.[e.what], `${p.id}: ${k} ${e.what} — нет lang="en"`);
      }
      for (const a of p.permissions.actions || []) assert.ok(en.actions?.[a.id], `${p.id}: действие ${a.id} без title-en`);
    }
  } finally {
    cleanup(out);
  }
});

test("официальные плагины: автор — имя Kensei и логин KenseiTheOne (в индексе — оба)", () => {
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ out, generatedAt: "2026-11-04T10:00:00.000Z" });
    // hermes и clickup; night-runner из реестра ушёл (09.11) — приватный, ставится своим источником
    assert.ok(index.plugins.length >= 2);
    for (const p of index.plugins) assert.deepEqual(p.author, { name: "Kensei", github: "KenseiTheOne" }, p.id);
  } finally {
    cleanup(out);
  }
});

test("зависимость <agenthub.requires>: в индексе — name, url, check, note и перевод; у hermes — «Нужен Hermes»; night-runner в реестре нет", () => {
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ out, generatedAt: "2026-11-04T10:00:00.000Z" });
    assert.equal(index.plugins.some((p) => p.id === "night-runner"), false);
    const h = index.plugins.find((p) => p.id === "hermes");
    assert.equal(h.requires.length, 1);
    assert.deepEqual(Object.keys(h.requires[0]).sort(), ["check", "name", "note", "url"]);
    assert.equal(h.requires[0].name, "Hermes");
    assert.equal(h.requires[0].check, "~/.hermes");
    assert.match(h.requires[0].url, /^https:\/\//);
    assert.ok(h.i18n.en.requires.Hermes.note);
    // плагин без зависимостей — без поля
    assert.equal("requires" in index.plugins.find((p) => p.id === "clickup"), false);
  } finally {
    cleanup(out);
  }
});

test("--published: версия, уже опубликованная с другим архивом, — ошибка сборки (архив не перезаписывается); та же — ок", () => {
  const root = registry();
  const a = tempDir("ahp-pub-a-");
  const b = tempDir("ahp-pub-b-");
  try {
    const published = buildIndex({ root, out: a, generatedAt: "2026-11-04T10:00:00.000Z" }).index;
    // пересборка того же содержимого — те же sha256, сборка проходит
    assert.doesNotThrow(() => buildIndex({ root, out: b, generatedAt: "2026-11-05T10:00:00.000Z", published }));
    // README поменяли, а версию нет
    writeFileSync(join(root, "plugins", "hello", "README.md"), README + "\nещё строка\n");
    assert.throws(() => buildIndex({ root, out: b, published }), /hello: версия 1\.0\.0 уже опубликована с другим архивом/);
    // версию подняли — ок
    writeFileSync(join(root, "plugins", "hello", "hello.5m.mjs"), pluginSource({ version: "1.0.1" }));
    assert.doesNotThrow(() => buildIndex({ root, out: b, published }));
  } finally {
    cleanup(root);
    cleanup(a);
    cleanup(b);
  }
});
