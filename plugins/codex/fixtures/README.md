# codex plugin fixtures

Synthetic data, nothing real: the `demo-*` models, the `/work/demo` project and the MCP server are made up.

- `home/.codex/config.toml` — the base settings (`model = "demo-beta"` with a trailing comment,
  `model_reasoning_effort = "medium"`), a multi-line `notify` array with `"[not a header]"` inside (not a table
  header), an `[mcp_servers.demo]` table whose env holds the `fixture-secret-do-not-print` marker (the plugin must not
  print it), and a `[projects."…"]` table.
- `home/.codex/models_cache.json` — Codex's model list: `demo-alpha` (listed, first by priority — the default model,
  levels up to `ultra`), `demo-hidden` (`visibility: "hide"`), `demo-beta` (listed, low/medium/high) and an entry with
  an invalid id (skipped). Fields the plugin doesn't use carry the marker.
- `home/.codex/version.json` — Codex's update check with `latest_version` 0.158.0, older than the cache's
  `client_version`, so the "list may be stale" note stays off by default.
- `home/.codex/sessions/…/rollout-demo.jsonl`, `home/.codex/history.jsonl` — traps with the
  `fixture-transcript-text-do-not-print` marker: the plugin never reads conversation files, the marker must not reach
  the output.
