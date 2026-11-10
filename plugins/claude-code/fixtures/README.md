# claude-code plugin fixtures

Synthetic data, nothing real: session ids, pids, the `/work/*` paths, the styles and the `demo-plugin` plugin are made
up.

- `home/` — HOME for the `scripts/check.sh` trial run and the tests: `.local/bin/claude` (an empty file — "Claude Code
  is installed"), `.claude/settings.json` (with `fixture-secret-do-not-print` markers — the plugin must not print
  them), `.claude/output-styles`, `.claude/plugins` (`installPath` contains `HOME_PLACEHOLDER` — the tests substitute
  the path), `.claude/sessions/*.json`, `.cmuxterm/claude-hook-sessions.json` (a trap: since 1.1.0 the plugin doesn't
  read terminal files; the conversation text marker in `lastBody` must not reach the output).
- `hub-sessions.json` — the hub's file with the sessions' model and effort (`$AGENTHUB_CLAUDE_SESSIONS_FILE`,
  contract 3).

Processes (`ps`) in the tests are a double script in `AGENTHUB_TEST_BIN_DIR`; the hub's terminal is a hub socket
double that the test starts in HOME (`hub.sock`).
