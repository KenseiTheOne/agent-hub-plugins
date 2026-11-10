// scripts/build-index.mjs: index.json with archive sha256s, determinism, minisign signing via node:crypto.
// Keys are generated only here, in memory or a temp directory, and deleted.

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
      hello: { "hello.5m.mjs": pluginSource(), "README.md": README, "fixtures/home/.config/hello/state.json": "x", "test/hello.test.mjs": "// test" },
      quota: { "quota.30s.mjs": pluginSource({ title: "Quota", version: "2.1.0" }), "README.md": README, "lib/util.mjs": "export const x = 1;\n" },
    },
    { official: ["quota"], blocklist: [{ id: "evil", reason: "крадёт токены" }] },
  );
}

test("index.json: entries with archive sha256 and size, permissions with \"why\", official, blocklist", () => {
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

test("watch in the index uses the older entry form: archive permissions match for both the pre-05.11 core and the new one (regression review)", () => {
  const root = makeRegistry({
    w: { "w.5m.mjs": pluginSource({ title: "W", extra: ["// <agenthub.watch>~/.config/w/state  --  менять кадр сразу</agenthub.watch>"] }), "README.md": README },
  });
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ root, out, generatedAt: "2026-11-04T10:00:00.000Z" });
    const entry = JSON.parse(JSON.stringify(index.plugins[0].permissions));
    // the older form: the whole line (whitespace collapsed), why: null — that's how the pre-05.11 core computed the key
    assert.deepEqual(entry.watch, [{ what: "~/.config/w/state -- менять кадр сразу", why: null }]);
    const gz = readFileSync(join(out, index.plugins[0].archive));
    const main = readTarGz(gz, { root: "w" }).find((f) => f.path === "w/w.5m.mjs");
    const { meta } = parseMetaText(main.data.toString("utf8"));
    // the new core: archive permissions (what is the path) match the entry (permissionList parses the older form)
    assert.equal(permissionsFingerprint(permissionsFromMeta(meta)), permissionsFingerprint(entry));
    // the pre-05.11 core: the watch key is the whole metadata line
    const oldKeys = (m) => (m.watch || []).map((w) => `watch:${String(w).trim().replace(/\s+/g, " ")}`);
    assert.deepEqual(oldKeys(meta), entry.watch.map((e) => `watch:${e.what}`));
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("archives are deterministic: two builds give the same sha256", () => {
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

test("signature: our key verifies, a foreign key or an edited index does not", () => {
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
    // a foreign key with the same keyId (forged header) — the signature doesn't match
    const forged = alien.publicKey.replace(/\n(.+)\n$/, (_, b64) => {
      const raw = Buffer.from(b64, "base64");
      Buffer.from(mine.publicKey.split("\n")[1], "base64").copy(raw, 2, 2, 10);
      return "\n" + raw.toString("base64") + "\n";
    });
    assert.equal(verify(text, sig, forged).reason, "signature");
    assert.equal(verify(Buffer.concat([text, Buffer.from(" ")]), sig, mine.publicKey).reason, "signature");
    const badComment = sig.replace(/^trusted comment: .*$/m, "trusted comment: tampered");
    assert.equal(verify(text, badComment, mine.publicKey).reason, "global-signature");
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("a plugin with linter errors fails the whole build", () => {
  const root = makeRegistry({ bad: { "bad.1m.mjs": pluginSource({ effects: "session.stop" }), "README.md": README } });
  const out = tempDir("ahp-out-");
  try {
    assert.throws(() => buildIndex({ root, out }), /session\.stop/);
  } finally {
    cleanup(root);
    cleanup(out);
  }
});

test("--flat-archives: archives next to index.json", () => {
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

test("keygen: writes a 0600 key to a temp directory and refuses to write into the repo", () => {
  const dir = tempDir("ahp-key-");
  try {
    const r = keygen(join(dir, "keys"));
    if (process.platform !== "win32") assert.equal(statSync(r.keyFile).mode & 0o777, 0o600);
    const pub = readFileSync(r.pubFile, "utf8");
    assert.match(pub, /^untrusted comment: minisign public key [0-9A-F]{16}\n/);
    assert.throws(() => keygen(join(dir, "keys")), /already exists/);
    assert.throws(() => keygen(join(dirname(fileURLToPath(import.meta.url)), "..", "tmp-keys")), /inside the registry repo/);
  } finally {
    cleanup(dir);
  }
});

test("translations in the index: title, description and permission \"why\" (lang=\"en\"); permissions (keys) don't depend on the translation", () => {
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

test("official plugins: every permission has an English \"why\", every action has title-en", () => {
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ out, generatedAt: "2026-11-04T10:00:00.000Z" });
    for (const p of index.plugins) {
      const en = p.i18n?.en || {};
      for (const k of ["fsRead", "fsWrite", "exec", "secrets", "net"]) {
        for (const e of p.permissions[k] || []) assert.ok(en.why?.[e.what], `${p.id}: ${k} ${e.what} — no lang="en"`);
      }
      for (const a of p.permissions.actions || []) assert.ok(en.actions?.[a.id], `${p.id}: action ${a.id} has no title-en`);
    }
  } finally {
    cleanup(out);
  }
});

test("official plugins: author is the name Kensei and the login KenseiTheOne (both in the index)", () => {
  const out = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ out, generatedAt: "2026-11-04T10:00:00.000Z" });
    // hermes and clickup; night-runner left the registry (09.11) — it's private and installs from its own source
    assert.ok(index.plugins.length >= 2);
    for (const p of index.plugins) assert.deepEqual(p.author, { name: "Kensei", github: "KenseiTheOne" }, p.id);
  } finally {
    cleanup(out);
  }
});

test("<agenthub.requires> dependency: the index has name, url, check, note and the translation; hermes has \"Needs Hermes\"; night-runner is not in the registry", () => {
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
    // a plugin without dependencies has no field
    assert.equal("requires" in index.plugins.find((p) => p.id === "clickup"), false);
  } finally {
    cleanup(out);
  }
});

test("--published: a version already published with a different archive is a build error (the archive isn't overwritten); the same one is fine", () => {
  const root = registry();
  const a = tempDir("ahp-pub-a-");
  const b = tempDir("ahp-pub-b-");
  try {
    const published = buildIndex({ root, out: a, generatedAt: "2026-11-04T10:00:00.000Z" }).index;
    // rebuilding the same content gives the same sha256s, the build passes
    assert.doesNotThrow(() => buildIndex({ root, out: b, generatedAt: "2026-11-05T10:00:00.000Z", published }));
    // README changed, version didn't
    writeFileSync(join(root, "plugins", "hello", "README.md"), README + "\none more line\n");
    assert.throws(() => buildIndex({ root, out: b, published }), /hello: version 1\.0\.0 is already published with a different archive/);
    // version bumped — fine
    writeFileSync(join(root, "plugins", "hello", "hello.5m.mjs"), pluginSource({ version: "1.0.1" }));
    assert.doesNotThrow(() => buildIndex({ root, out: b, published }));
  } finally {
    cleanup(root);
    cleanup(a);
    cleanup(b);
  }
});

test("contract in the index — contract and icon from metadata; no tags, no fields; official plugins have contract 2+ and an icon, clickup has a connection and session.focus, claude-code has terminal in its permissions", () => {
  const root = makeRegistry({
    v2: { "v2.5m.mjs": pluginSource({ title: "V2", extra: ["// <agenthub.contract>2</agenthub.contract>", '// <agenthub.icon symbol="moon.stars" color="#5e5ce6"></agenthub.icon>'] }), "README.md": README },
    old: { "old.5m.mjs": pluginSource({ title: "Old" }), "README.md": README },
  });
  const out = tempDir("ahp-out-");
  const out2 = tempDir("ahp-out-");
  try {
    const { index } = buildIndex({ root, out, generatedAt: "2026-11-04T10:00:00.000Z" });
    const v2 = index.plugins.find((p) => p.id === "v2");
    assert.equal(v2.contract, 2);
    assert.deepEqual(v2.icon, { symbol: "moon.stars", color: "#5E5CE6" });
    const old = index.plugins.find((p) => p.id === "old");
    assert.equal("contract" in old, false);
    assert.equal("icon" in old, false);
    // this repo's official plugins
    const real = buildIndex({ out: out2, generatedAt: "2026-11-04T10:00:00.000Z" }).index;
    for (const [id, contract] of [["clickup", 3], ["hermes", 2], ["claude-code", 3]]) {
      const p = real.plugins.find((x) => x.id === id);
      assert.equal(p.contract, contract, id);
      assert.match(p.icon?.symbol || "", /^[a-z0-9.]+$/, id);
      assert.match(p.icon?.color || "", /^#[0-9A-F]{6}$/, id);
    }
    const cu = real.plugins.find((x) => x.id === "clickup");
    assert.equal(cu.permissions.connections.length, 1);
    assert.match(cu.permissions.connections[0].what, /^clickup: https:\/\/mcp\.clickup\.com\/mcp scope=read tools=clickup_filter_tasks$/);
    assert.equal("connections" in real.plugins.find((x) => x.id === "hermes").permissions, false);
    // focusing and typing go through the hub: no official plugin declares cmux
    assert.deepEqual(cu.permissions.effects, ["open.url", "session.focus"]);
    const cc = real.plugins.find((x) => x.id === "claude-code");
    assert.deepEqual(cc.permissions.terminal.map((t) => t.what), ["send /model /effort"]);
    for (const p of real.plugins) assert.doesNotMatch(JSON.stringify(p.permissions), /cmux/i, p.id);
  } finally {
    cleanup(root);
    cleanup(out);
    cleanup(out2);
  }
});
