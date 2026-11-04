// Синтетический двойник раннера после этапа 1: status --json и queue --json печатают JSON из соседних файлов.
import { readFileSync } from "node:fs";
const COMMANDS = ["run", "setup", "check", "install", "uninstall", "migrate-state", "post", "research", "status", "queue"];
const [cmd, flag] = process.argv.slice(2);
if (!COMMANDS.includes(cmd) || flag !== "--json") process.exit(2);
process.stdout.write(readFileSync(new URL(`./${cmd}.json`, import.meta.url), "utf8"));
