#!/usr/bin/env node
// Данные для метки «permissions» в PR: { pr, grew } из отчёта check.mjs --report.
// Пишется в артефакт; workflow perms-label.yml читает его как данные (код PR не исполняется).
//   node scripts/perms-artifact.mjs <report.json> <номер PR> <каталог>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [report, pr, dir] = process.argv.slice(2);
if (!/^\d+$/.test(pr || "")) {
  console.error("номер PR — число");
  process.exit(2);
}
let grew = false;
try {
  const r = JSON.parse(readFileSync(report, "utf8"));
  grew = Array.isArray(r.diff) && r.diff.some((d) => Array.isArray(d.added) && d.added.length > 0);
} catch {
  grew = true; // отчёта нет — считаем, что права могли вырасти: лишняя метка лучше пропущенной
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "perms.json"), JSON.stringify({ pr: Number(pr), grew }) + "\n");
console.log(`PR ${pr}: права ${grew ? "выросли" : "не выросли"}`);
