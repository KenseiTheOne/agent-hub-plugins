// Registry test helpers: a temporary registry with synthetic plugins.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function tempDir(prefix = "ahp-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

// plugins: { id: { "<file>": "text", ... } }
export function makeRegistry(plugins = {}, { official = [], blocklist = [] } = {}) {
  const root = tempDir("ahp-reg-");
  writeFileSync(join(root, "official.json"), JSON.stringify({ official }));
  writeFileSync(join(root, "blocklist.json"), JSON.stringify({ version: 1, entries: blocklist }));
  mkdirSync(join(root, "plugins"), { recursive: true });
  for (const [id, files] of Object.entries(plugins)) writePluginFiles(root, id, files);
  return root;
}

export function writePluginFiles(root, id, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, "plugins", id, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

export function cleanup(p) {
  rmSync(p, { recursive: true, force: true });
}

// Metadata of an .mjs plugin. extra — additional tag lines.
export function pluginSource({ title = "Hello", version = "1.0.0", effects = "open.url", extra = [], body = null } = {}) {
  const tags = [
    `// <agenthub.title>${title}</agenthub.title>`,
    `// <agenthub.version>${version}</agenthub.version>`,
    "// <agenthub.author.github>someone</agenthub.author.github>",
    "// <agenthub.platforms>macos,windows,linux</agenthub.platforms>",
    "// <agenthub.fsRead>~/.config/hello/state.json — показать состояние</agenthub.fsRead>",
    effects ? `// <agenthub.effects>${effects}</agenthub.effects>` : null,
    ...extra,
  ].filter(Boolean);
  const code =
    body ??
    `import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
let s = "no file";
try {
  s = readFileSync(join(homedir(), ".config", "hello", "state.json"), "utf8").trim();
} catch {}
console.log("Hello " + s + " | status=ok");
console.log("---");
console.log('Site | effect="open.url https://example.com"');
`;
  return `#!/usr/bin/env node\n${tags.join("\n")}\n${code}`;
}

export const README = "# Plugin\n\nA synthetic plugin for registry tests.\n";
