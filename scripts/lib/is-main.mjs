// The script was run as a program, not imported. Both sides go through realpath: node gives import.meta.url with
// symlinks already resolved (on macOS /tmp → /private/tmp, a symlink to ~/Projects), while process.argv[1] is the path
// as typed; a plain resolve() silently said "not a program" and exited 0 without running a single check.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
