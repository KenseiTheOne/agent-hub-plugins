// Helpers for registry plugin tests (plugins/<id>/test/*.test.mjs): the plugin directory, a temporary HOME,
// the core parsers from scripts/vendor/ (the same ones the daemon uses). Tests run without network or secrets.

import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export { parseOutput } from "../vendor/output.mjs";
export { readPluginMeta, parseMetaText } from "../vendor/meta.mjs";

// The plugin directory from the test's import.meta.url (plugins/<id>/test/x.test.mjs → plugins/<id>).
export function pluginDir(testUrl) {
  return resolve(dirname(fileURLToPath(testUrl)), "..");
}

// A short real path (/tmp → /private/tmp): plugins compare paths by realpath.
export function tempHome(prefix = "ahp-") {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

// The environment for running a plugin in a test: a synthetic HOME (and USERPROFILE — on Windows os.homedir() reads it,
// not HOME), PATH, with extra on top. On Windows also SystemRoot/windir/COMSPEC/PATHEXT: without SystemRoot sockets
// don't initialize (WSAEPROVIDERFAILEDINIT) and processes don't start. No secrets here.
export function testEnv(home, extra = {}) {
  const env = { HOME: home, PATH: process.platform === "win32" ? process.env.PATH || "" : "/usr/bin:/bin" };
  if (process.platform === "win32") {
    for (const k of ["SystemRoot", "windir", "COMSPEC", "PATHEXT", "TEMP", "TMP"]) if (process.env[k]) env[k] = process.env[k];
    env.USERPROFILE = home;
  }
  return { ...env, ...extra };
}
