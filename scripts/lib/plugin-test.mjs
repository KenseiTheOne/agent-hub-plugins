// Помощники тестов плагинов реестра (plugins/<id>/test/*.test.mjs): каталог плагина, временный HOME,
// разборщики ядра из scripts/vendor/ (те же, что у демона). Тесты работают без сети и секретов.

import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export { parseOutput } from "../vendor/output.mjs";
export { readPluginMeta, parseMetaText } from "../vendor/meta.mjs";

// Каталог плагина по import.meta.url теста (plugins/<id>/test/x.test.mjs → plugins/<id>).
export function pluginDir(testUrl) {
  return resolve(dirname(fileURLToPath(testUrl)), "..");
}

// Короткий реальный путь (/tmp → /private/tmp): плагины сравнивают пути по realpath.
export function tempHome(prefix = "ahp-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

// Окружение запуска плагина в тесте: синтетический HOME (и USERPROFILE — os.homedir() на Windows читает его, а не
// HOME), PATH, extra поверх. На Windows — ещё SystemRoot/windir/COMSPEC/PATHEXT: без SystemRoot не
// инициализируются сокеты (WSAEPROVIDERFAILEDINIT) и не стартуют процессы. Секретов здесь нет.
export function testEnv(home, extra = {}) {
  const env = { HOME: home, PATH: process.platform === "win32" ? process.env.PATH || "" : "/usr/bin:/bin" };
  if (process.platform === "win32") {
    for (const k of ["SystemRoot", "windir", "COMSPEC", "PATHEXT", "TEMP", "TMP"]) if (process.env[k]) env[k] = process.env[k];
    env.USERPROFILE = home;
  }
  return { ...env, ...extra };
}
