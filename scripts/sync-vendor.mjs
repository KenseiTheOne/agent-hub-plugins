#!/usr/bin/env node
// Vendors the Agent Hub core into the registry: the parsers and a copy of the plugin contract.
//
// The registry's CI can't see the sibling agent-hub repository, so what it needs lives here as a copy:
//   scripts/vendor/ — daemon modules:
//     meta.mjs, output.mjs                — metadata and output parsing (daemon/lib/)
//     minisign.mjs, tarball.mjs, perms.mjs — signature, archive, permissions (daemon/lib/registry/)
//     messages/parse.mjs                  — parser and linter texts (daemon/lib/messages/), imported by meta and output
//     native.mjs                           — a stub (the registry needs no peercred addon; binary xattrs aren't
//                                            our case: the registry holds text plugins only)
//   docs/contract/  — the plugin contract for plugin authors (CONTRACT_DOCS below): extension-points.md and
//                     writing-plugins.md whole, plus the sections of push/README.md, plugins-registry.md and api.md
//                     an author needs, each with a "copy, don't edit" header.
// Modules are byte-for-byte copies; documents are the source sections as they are plus a header. Every sha256 goes into
// scripts/vendor/VENDOR.json. check.sh always checks the copies against that file, and against the source when
// agent-hub is next to it (AGENT_HUB_DIR or ../agent-hub).
//
//   node scripts/sync-vendor.mjs [--from <path to agent-hub>] [--check]
// --check — only compare (exit code 1 on a mismatch), write nothing.

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
  // meta.mjs and output.mjs import "./messages/parse.mjs": keep the subfolder so the copies stay byte-identical
  "messages/parse.mjs": "daemon/lib/messages/parse.mjs",
};
export const NATIVE_STUB = `// Vendoring stub (scripts/sync-vendor.mjs): the registry needs no peercred addon.
export function loadNative() {
  return null;
}
`;

// The contract copy for plugin authors. sections: null — the whole file; otherwise the sections whose heading starts
// with that string (a section runs from its heading to the next heading of the same or a higher level), in list order.
// What goes in: everything a plugin declares and prints (metadata, output, actions, push, connections, terminal), how
// it is installed and updated (tiers, permissions, own sources, catalog) and the contract versions. What doesn't:
// daemon internals (state directory, service routes, journal) — a plugin author never sees them.
export const CONTRACT_DOCS = [
  { out: "writing-plugins.md", src: "docs/writing-plugins.md", sections: null, about: "a practical guide: how to make, test and ship a plugin — start here" },
  { out: "extension-points.md", src: "docs/extension-points.md", sections: null, about: "the plugin contract: file name, metadata, output, actions, environment, contract versions" },
  { out: "push.md", src: "daemon/lib/push/README.md", sections: ["Event keys for plugins", "Switches"], about: "push rules (<agenthub.push>), kinds and a plugin's own switch, carrying over contract 1 settings" },
  { out: "plugins-registry.md", src: "docs/plugins-registry.md", sections: ["Policy for the core", "Own sources", "Dependencies in the catalog", "Index: `tier`", "Plugin contract 2"], about: "tiers and permissions, own plugins from a folder, \"Requires …\", what the registry needs" },
  { out: "api.md", src: "docs/api.md", sections: ["`POST /actions/:id`", "Connections", "Terminal"], about: "running an action and its result (reason=, message=), connections and MCP calls through the hub, the hub terminal" },
];

const sha = (b) => createHash("sha256").update(b).digest("hex");

export function agentHubDir(env = process.env) {
  const cands = [env.AGENT_HUB_DIR, join(ROOT, "..", "agent-hub")].filter(Boolean);
  return cands.find((d) => existsSync(join(d, "daemon", "lib", "meta.mjs"))) || null;
}

// The core's contract version — CONTRACT_VERSION from meta.mjs (as text: the module isn't executed). None — 1 (before 2026-11-09).
export function contractVersion(metaText) {
  const m = /export const CONTRACT_VERSION = (\d+);/.exec(String(metaText));
  return m ? Number(m[1]) : 1;
}

// Markdown sections by heading prefix; lines inside ``` aren't headings (they can hold "# <agenthub.push …>").
// → { text, missing: [prefixes with no section] }
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
  const what = doc.sections ? `\`${doc.src}\`, sections: ${doc.sections.map((s) => `"${s.replace(/`/g, "")}"`).join(", ")}` : `\`${doc.src}\`, whole`;
  return [
    `<!-- Copy from agent-hub, contract v${version}. Don't edit: node scripts/sync-vendor.mjs writes this file, --check catches drift. -->`,
    `> **Copy from agent-hub, contract v${version} — don't edit.** Source: ${what}. Updated by`,
    "> `node scripts/sync-vendor.mjs` (next to agent-hub); `node scripts/sync-vendor.mjs --check` and CI catch drift.",
    "> Paths and links in the text are relative to the agent-hub repository root. Need a capability that isn't here? Write",
    "> down what you need and hand it to the hub session (the registry's CLAUDE.md).",
    "",
    "",
  ].join("\n");
}

function readmeText(version) {
  return [
    `<!-- Copy from agent-hub, contract v${version}. Don't edit: node scripts/sync-vendor.mjs writes this file, --check catches drift. -->`,
    `# Agent Hub plugin contract (copy, contract v${version})`,
    "",
    "What the hub core understands in a plugin — a copy of the agent-hub documentation for registry plugin authors. Read it",
    "here, not in the hub repository. Don't edit these files by hand: `node scripts/sync-vendor.mjs` writes them.",
    "",
    "| File | What |",
    "|---|---|",
    ...CONTRACT_DOCS.map((d) => `| [${d.out}](${d.out}) | ${d.about} |`),
    "",
    "A plugin's contract version is the `<agenthub.contract>N</agenthub.contract>` tag (\"Contract versions\" in",
    "extension-points.md): declare the one whose capabilities you use; a hub of version 2 or newer with an older contract",
    "shows \"Requires a newer hub\". Contract 1 hubs don't know the tag and install the plugin silently — publish such a",
    "plugin only after the hub is updated (same section, rollout order).",
    "",
  ].join("\n");
}

// → { "<name in docs/contract>": Buffer } from the agent-hub sources; missing — sections the source doesn't have.
export function buildContractDocs(from) {
  const version = contractVersion(readFileSync(join(from, FILES["meta.mjs"]), "utf8"));
  const out = { "README.md": Buffer.from(readmeText(version)) };
  const missing = [];
  for (const d of CONTRACT_DOCS) {
    const src = readFileSync(join(from, d.src), "utf8").replace(/\r\n/g, "\n");
    let body = src.endsWith("\n") ? src : src + "\n";
    if (d.sections) {
      const r = pickSections(src, d.sections);
      for (const p of r.missing) missing.push(`${d.src}: no section "${p}"`);
      body = r.text;
    }
    out[d.out] = Buffer.from(header(d, version) + body);
  }
  return { version, docs: out, missing };
}

// → { ok, problems: [...], drift: [...] } — problems: a copy doesn't match VENDOR.json; drift: the source moved ahead
// A Finder file: the OS drops it on its own and .gitignore keeps it out of git — not an "extra file". Only what
// .gitignore covers: git would commit any other file (dotfiles included), and the check must catch it.
const OS_JUNK = new Set([".DS_Store"]);

// vendorDir / contractDir — for tests (a copy in a temp directory); by default the registry's directories
export function checkVendor({ from = agentHubDir(), vendorDir = VENDOR_DIR, contractDir = CONTRACT_DIR } = {}) {
  const problems = [];
  const drift = [];
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(vendorDir, "VENDOR.json"), "utf8"));
  } catch {
    problems.push("scripts/vendor/VENDOR.json is missing");
  }
  const files = manifest.files || {};
  const all = { ...FILES, "native.mjs": null };
  for (const name of Object.keys(all)) {
    const p = join(vendorDir, name);
    if (!existsSync(p)) {
      problems.push(`scripts/vendor/${name} is missing`);
      continue;
    }
    const h = sha(readFileSync(p));
    if (files[name] !== h) problems.push(`scripts/vendor/${name} doesn't match VENDOR.json (edited by hand?)`);
    if (from && all[name]) {
      const src = join(from, all[name]);
      if (existsSync(src) && sha(readFileSync(src)) !== h) drift.push(`${name} differs from ${all[name]} — run node scripts/sync-vendor.mjs`);
    }
  }
  // the contract copy: exactly the files in VENDOR.json, each with the same sha256; an extra file in docs/contract is an error too (except .DS_Store — .gitignore keeps it out)
  const docs = manifest.docs || {};
  const want = ["README.md", ...CONTRACT_DOCS.map((d) => d.out)];
  for (const name of want) {
    const p = join(contractDir, name);
    if (!existsSync(p)) problems.push(`docs/contract/${name} is missing — run node scripts/sync-vendor.mjs`);
    else if (docs[name] !== sha(readFileSync(p))) problems.push(`docs/contract/${name} doesn't match VENDOR.json (edited by hand?)`);
  }
  if (existsSync(contractDir)) for (const name of readdirSync(contractDir)) if (!want.includes(name) && !OS_JUNK.has(name)) problems.push(`docs/contract/${name}: extra file — only scripts/sync-vendor.mjs writes the copy`);
  if (from) {
    try {
      const built = buildContractDocs(from);
      for (const m of built.missing) problems.push(`contract: ${m} (fix CONTRACT_DOCS in scripts/sync-vendor.mjs)`);
      for (const [name, data] of Object.entries(built.docs)) {
        const p = join(contractDir, name);
        if (existsSync(p) && sha(readFileSync(p)) !== sha(data)) drift.push(`docs/contract/${name} is behind agent-hub — run node scripts/sync-vendor.mjs`);
      }
      if (manifest.contract !== built.version) drift.push(`contract in VENDOR.json is ${manifest.contract ?? "none"}, agent-hub has ${built.version}: run node scripts/sync-vendor.mjs`);
    } catch (e) {
      drift.push(`contract: can't read the agent-hub documents (${e.code || e.message})`);
    }
  }
  return { ok: problems.length === 0, problems, drift, contract: manifest.contract ?? null };
}

export function syncVendor(from) {
  const built = buildContractDocs(from);
  if (built.missing.length) throw new Error(`the agent-hub documents lack sections:\n${built.missing.join("\n")}\nfix CONTRACT_DOCS in scripts/sync-vendor.mjs`);
  mkdirSync(VENDOR_DIR, { recursive: true });
  const files = {};
  for (const [name, rel] of Object.entries(FILES)) {
    const data = readFileSync(join(from, rel));
    mkdirSync(dirname(join(VENDOR_DIR, name)), { recursive: true });
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
    note: "copies of the agent-hub/daemon modules and the plugin contract (docs/contract); update only with scripts/sync-vendor.mjs",
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
    console.error("agent-hub not found: pass --from <path> or set AGENT_HUB_DIR");
    process.exit(2);
  }
  try {
    const m = syncVendor(from);
    console.log(`copied from ${from}: ${Object.keys(m.files).join(", ")}; contract v${m.contract} → docs/contract: ${Object.keys(m.docs).join(", ")}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
