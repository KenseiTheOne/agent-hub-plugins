// Синтетический двойник night-run.mjs: плагин читает только список COMMANDS. Ничего не делает при запуске.
const COMMANDS = ["run", "setup", "check", "install", "uninstall", "migrate-state", "post", "research"];
process.exit(COMMANDS.length ? 3 : 3);
