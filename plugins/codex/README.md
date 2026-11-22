# codex — Codex CLI settings for new sessions

An official plugin of the `agent-hub-plugins` registry (tier `official`). Type standard, runs every 30 s and right away
when `~/.codex/config.toml` or `~/.codex/models_cache.json` changes. It changes settings only on your click.

The Codex CLI counterpart of the `claude-code` plugin's "For new sessions" block. The plugin does the work itself; for
it the hub is the sandbox and the permissions. The hub knows neither Codex nor its settings: the allowed keys, the
config editor, the copy before a change and the atomic write all live in the plugin's code.

The plugin is bilingual for its users (Russian and English UI, by the hub's language); code comments and these docs are
in English.

## What it shows

- **Base for new sessions**: the top-level `model` and `model_reasoning_effort` of `~/.codex/config.toml`. The header
  line "Base: GPT-6.1 Terra · high" and the popover tile ("GPT-6.1 Terra · high", label "Codex") say the same.
- **Model** — a dropdown (`select=true`). The first item is "Default (<model>)": choosing it removes `model`, so Codex
  takes its own default — the first model of its picker. Then the models Codex's picker lists, in its order; a model
  with `supported_in_api: false` carries the note "ChatGPT sign-in only" (Codex hides it from any other sign-in; the
  plugin doesn't read the sign-in file, so it can't tell which one you use). A model set by hand that the picker doesn't list (a hidden one, or one this Codex doesn't know) stays visible as one
  more selected item with the note "not in Codex's list"; the plugin never hides what is written.
- **Effort** — a segment (`segment=true`): "default" (removes `model_reasoning_effort`; the tooltip names the model's
  own level) and exactly the levels the effective model supports. A level set by hand that the model doesn't support
  is shown orange, with a line saying so.
- **Warnings** (orange lines): a key written in a form the plugin doesn't edit (see "Writing settings"); no model list
  yet; the model isn't in Codex's list; the level isn't supported by the model; a top-level `profile = …` line — Codex
  0.159 refuses to start with it (remove it and pick a profile with `--profile`); a `model_provider` other than
  `openai` or a `model_catalog_json` — Codex then takes its models from there, so the list may not match.
- Grey notes: the values are written to `~/.codex/config.toml`, only these two keys; open Codex sessions keep theirs
  (use `/model` there); `--profile`, `-c` and a project's `.codex/config.toml` override them for a single run. When
  `~/.codex/version.json` names a newer Codex than the one that fetched the model list — "if you've updated, start
  Codex to refresh the list".
- Details (collapsed): where the list comes from, the Codex version that fetched it, when, and the effective model's id.

States: `ok` — the settings are read; `error` — a line before the first `[table]` can't be parsed (the plugin then
doesn't write; the page names the line) or the plugin failed; `unknown` — Codex isn't installed (no `~/.codex`).

Where each thing comes from:

| What | Source |
|---|---|
| Base | `~/.codex/config.toml`: top-level `model`, `model_reasoning_effort`; `profile`, `model_provider`, `model_catalog_json` only for the warnings |
| Model list | `~/.codex/models_cache.json` → `models[]`: `slug`, `display_name`, `visibility` (`list` is shown, `hide` isn't), `priority` (order), `default_reasoning_level`, `supported_reasoning_levels[].effort`, `supported_in_api`; `client_version`, `fetched_at` for the details. Codex fetches and refreshes this file itself; a new model shows up without a plugin release |
| "List may be stale" | `~/.codex/version.json` → `latest_version` (Codex's update check). No file in `~/.codex` names the installed version, so the plugin compares the newest version Codex has seen with the cache's `client_version` |
| Default model | the first `visibility: "list"` model by priority — what Codex picks when `model` is absent |
| Default effort | the model's `default_reasoning_level` |

## What it doesn't read

Only the three files above. The plugin never opens Codex's sign-in file, its sessions and archived sessions, the history
file or its state databases. In `config.toml` it looks at the lines before the first `[table]` and keeps only
`model`, `model_reasoning_effort`, `profile`, `model_provider` and `model_catalog_json` (the table headers after it are
scanned only for their names, see below); `[mcp_servers]`, `[projects]`, `notify`, environment tables and the
rest are never shown. In `models_cache.json` it keeps only the fields in the table above (no instructions, descriptions
or other model metadata), in `version.json` only `latest_version`.

The `CODEX_HOME` variable isn't passed to plugins by the hub, so the plugin always uses `~/.codex`. A Codex that runs
with another `CODEX_HOME` isn't seen.

## Writing settings

No TOML library. A small line-based editor reads the root table — the part before the first `[table]` header:

- each line there is blank, a comment, or `key = value` with an optional trailing comment;
- values are scanned, not interpreted: strings of all four kinds, arrays and inline tables (which may span lines) are
  skipped as a whole, so a `[` inside a string or a nested array is never taken for a header;
- quoted keys are decoded as TOML 1.1 strings (`\uXXXX`, `\UXXXXXXXX`, `\xHH`, `\e`, a literal tab), so
  `"mod\u0065l" = …` is `model`; a string TOML wouldn't accept is refused;
- anything else before the first table is "unparsed": the page is `error` and nothing is written.

A change touches one key:

- **an existing key** — only its value is replaced (`"value"`); the key's spelling, spacing and trailing comment stay;
- **a new key** — one line after the last root entry; with no root entries, right above the first table (and above the
  comment lines directly over it) followed by a blank line; with no tables, at the end;
- **"default"** removes the key's line (with the blank line under it when it stands alone above the first table, so
  setting a key and then "default" gives back the same bytes).

Every other byte is kept: comments, blank lines, tables, the BOM, line endings (a new line takes the ending of the line
next to it, or the file's most common one). The plugin refuses (with a message, nothing written) when the key can't be
edited unambiguously: a dotted key (`model.x = …`), the key repeated, a later table named after it (`[model]`,
`["model"]`, `["mod\u0065l".x]`, `[[model]]` — the headers after the root are walked line by line with values skipped,
so a `[model]` line inside a multi-line string isn't one), a table header that doesn't parse, a multi-line value or a
non-string value.

The write is atomic and careful:

- a symlinked `config.toml` (dotfiles) is followed: the target changes, the link stays; a dangling link is a refusal;
- the new text goes to a temp file with a random name next to the file (`config.toml.agenthub-<random>.tmp`, created
  exclusively, owner-only), gets the old file's mode, and replaces the file with `rename`;
- right before the rename the file is read again; if Codex or you changed it meanwhile, the change is redone on the new
  text (3 tries, then "the settings changed at the same time — try again"); the temp file never stays;
- before every change a copy goes to the plugin's own data folder (`$AGENTHUB_PLUGIN_DATA_PATH/backups/
  config.toml.<time>-agenthub`, owner-only); the last 20 are kept. Nothing is written into `~/.codex` besides
  `config.toml`.

## Actions

| Action | Level | Argument | What it does |
|---|---|---|---|
| `set-model` | immediate | `model` — `default` or an id `^[a-z0-9][a-z0-9._-]{0,63}$` | writes `model`; `default` removes it. Only a model Codex's picker lists (or the one already set). If the new model doesn't support the configured effort, `model_reasoning_effort` is removed too, so Codex uses the model's own level |
| `set-effort` | immediate | `level` — `default` or `^[a-z][a-z0-9_-]{0,31}$` | writes `model_reasoning_effort`; `default` removes it. Only a level the effective model supports (the set model, or Codex's default model when none is set) |

A refusal is exit code 3 with `message=<text>` and the last line `reason=<code>`: `bad-arg`, `no-codex`, `no-models`
(no model list yet — start Codex once), `unknown-model`, `unsupported-effort`, `config-unreadable`, `config-unparsed`,
`config-odd`, `config-link-broken`, `config-busy`, `not-allowed`, `plugin-failed`, `unknown-action`. Each has a Russian
and an English text.

## Permissions

| Permission | Why |
|---|---|
| `fsRead ~/.codex/config.toml` | show the base model and effort; re-read before writing. Only the lines before the first `[table]`; only `model`, `model_reasoning_effort` are shown, `profile`, `model_provider`, `model_catalog_json` only for warnings |
| `fsRead ~/.codex/models_cache.json` | Codex's model list: ids, names, whether a model is listed, its order and effort levels, whether it works without a ChatGPT sign-in, the Codex version that fetched it |
| `fsRead ~/.codex/version.json` | only `latest_version`, to say the model list may come from an older Codex |
| `fsWrite ~/.codex/config.toml` | write the choice — only the top-level keys `model` and `model_reasoning_effort` |
| `watch ~/.codex/config.toml`, `~/.codex/models_cache.json` | redraw at once when the settings or the model list change |
| `actions` — `set-model`, `set-effort` | the page's controls; nothing runs without your click |

No `exec`, no network, no terminal typing. Copies before a change go to the plugin's own data folder, which needs no
permission. `config.toml` also holds Codex's MCP servers and `notify` command; the plugin's writes can't reach them:
the allowed keys are fixed in the code, the values are checked against the patterns above (no quotes, newlines or
brackets), and a key in an ambiguous form is a refusal.

## Codex facts the plugin relies on

Checked against the Codex source, rust-v0.159.3:

- `config_toml.rs`: `model: Option<String>` and `model_reasoning_effort: Option<ReasoningEffort>` are top-level keys.
- Profiles are `--profile <name>` with `~/.codex/<name>.config.toml` layered over `config.toml`
  (`config/src/loader/mod.rs`); `[profiles.*]` tables are no longer applied, and a top-level `profile = "<name>"` makes
  config loading fail ("legacy `profile = …` config is no longer supported", `core/src/config/mod.rs`).
- Without a ChatGPT sign-in Codex keeps only `supported_in_api` models (`ModelPreset::filter_by_auth`); with one, all.
- Codex refetches `models_cache.json` when its `client_version` isn't the running Codex's version (`models-manager`
  `cache.rs`), so the cache catches up on the first start after an update.
- `~/.codex/installation_id` is created on every Codex start (`resolve_installation_id`), which is why it is the
  "Requires Codex CLI" check: `config.toml` may not exist yet on a fresh install, and the `~/.codex` folder itself can't
  be a check (it contains Codex's conversation logs, a forbidden location).
- `ReasoningEffort` parses `none|minimal|low|medium|high|xhigh|max|ultra|persistent` and any other non-empty string as a
  model-defined custom level, so the plugin offers the model's own level list, not a fixed table.
- The picker lists `visibility: "list"` models sorted by `priority`; with no `model` key the default is the first one.
- With no `model_reasoning_effort` a model uses its `default_reasoning_level`.

What the plugin can't see: a project's own `.codex/config.toml`, `--profile <name>` (its `<name>.config.toml`) and
`-c`/`--model` flags can still override the base for a particular run. The sign-in mode: the plugin doesn't read the
sign-in file, so it lists every model the picker shows and marks the ChatGPT-only ones. The installed Codex version: no
file names it, so the "list may be stale" note relies on Codex's update check.

## Not included

Kept out on purpose, to keep the plugin small and its writes safe: `approval_policy` and `sandbox_mode` (security
settings; approval also has a table form, and permission profiles interact with both), `personality` (deprecated in
0.159.3), `model_verbosity`, `plan_mode_reasoning_effort`, `model_reasoning_summary`, `service_tier`, profiles.

## Versions

- **1.0.0** — first version: model and effort for new sessions.
