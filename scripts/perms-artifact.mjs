#!/usr/bin/env node
// Data for the "permissions" label on a PR: { pr, grew } from the check.mjs --report report.
// Called by perms-label.yml (default-branch scripts, PR files as data) right after check.mjs --perms-only.
//   node scripts/perms-artifact.mjs <report.json> <PR number> <directory>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [report, pr, dir] = process.argv.slice(2);
if (!/^\d+$/.test(pr || "")) {
  console.error("the PR number must be a number");
  process.exit(2);
}
let grew = false;
try {
  const r = JSON.parse(readFileSync(report, "utf8"));
  grew = Array.isArray(r.diff) && r.diff.some((d) => Array.isArray(d.added) && d.added.length > 0);
} catch {
  grew = true; // no report — assume permissions may have grown: an extra label is better than a missed one
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "perms.json"), JSON.stringify({ pr: Number(pr), grew }) + "\n");
console.log(`PR ${pr}: permissions ${grew ? "grew" : "did not grow"}`);
