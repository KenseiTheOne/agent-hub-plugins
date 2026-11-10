# claude-code — Claude Code settings for new sessions and open tabs

An official plugin of the `agent-hub-plugins` registry (tier `official`). Type standard, runs every 30 s and right away
when `~/.claude/settings.json` or a session file changes. It changes settings only on your click.

The plugin does the work itself; for it the hub is the sandbox and the permissions. Decision of 10.11: the hub knows
neither Claude Code nor its settings. Everything below lives in the plugin's code: the allow list of keys, the copy
before a change, the atomic write, typing into a tab.

The plugin is bilingual for its users (Russian and English UI, by the hub's language). Since 1.1.0 the code comments
and these docs are in English; this is a documentation change only, with no change in behaviour.

## What it shows

- **Base for new sessions** from `~/.claude/settings.json`: model, effort, output style, ultracode. The header line
  "Base: Opus 5.5 · medium" and the popover tile say the same on one line.
- **Open sessions**: every live Claude Code session is a compact row, as in the design table: a state icon (idle,
  working, waiting for you), the tab name, "model · effort" as a badge — orange (`badgeColor=`) when it differs from the
  base —, a gray "state · note" line, then the "Fix" and "Switch" buttons. A free tab gets "Fix", a busy one "after the
  turn" or "after your answer". Since 1.1.1; 1.1.0 drew each session as a strip of cells, a tall card per tab. The
  colors are display parameters of hub 0.1.0 (contract 3): an older hub ignores them.
- **Progress of "Apply base to all"**: what was typed, what waits for the turn to end or for your answer, what was
  skipped and why. The result stays until it is dismissed.

Where each thing comes from:

| What | Source |
|---|---|
| Base | `~/.claude/settings.json`: `model`, `modelSettings.<model>.effortLevel` (for Opus 5.5 and newer only this one works), `effortLevel` (for older models), `env.CLAUDE_CODE_EFFORT_LEVEL` (max), `outputStyle`, `ultracode` |
| Style list | built-in (Default, Proactive, Concise, Explanatory, Learning), `~/.claude/output-styles/*.md` (the name comes from the file header), styles of enabled Claude Code plugins (`~/.claude/plugins/installed_plugins.json` → the plugin folder in `~/.claude/plugins/cache` → `output-styles/` or the manifest's `outputStyles`; name `<plugin>:<style>`) |
| Sessions | `~/.claude/sessions/<pid>.json`: id, folder, name, state, start time. A session is live if the process with this pid is alive, started at the same time (`procStart`, ps in UTC) and is Claude Code |
| Tab | not read: the plugin knows only the `sessionId`; the hub finds the tab (the hub's terminal for typing, the `session.focus` effect for "Switch") |
| Session model and effort | whichever is fresher: the hub's file `$AGENTHUB_CLAUDE_SESSIONS_FILE` (transcript write time, see "From the hub") or what the plugin set itself. Without the hub's file — only the latter, and the header says "tabs: no data", not "as base" |

## What it doesn't read

- Session transcripts — never: they hold the conversation text. The hub provides the sessions' model and effort as
  ready-made metadata.
- Session keys, login files and tokens: from `~/.claude/sessions` only `<pid>.json`.
- From `~/.claude/settings.json` only the listed keys appear in the output. `env`, `permissions`, `hooks` and the rest
  aren't shown; the tests put a marker into `env` in the fixture and check it is absent from the output.
- Terminal files and programs (cmux etc.) — never (since 1.1.0): the hub finds the tab, the plugin knows nothing
  about the terminal.
- The tab's screen — never: the hub's terminal answers the plugin only "typed" or with a refusal code.

## Writing settings

**Only** these paths are written (`ALLOWED_PATHS` in the code, checked on every operation):
`model`, `effortLevel`, `modelSettings.<model id>.effortLevel`, `outputStyle`, `ultracode`,
`env.CLAUDE_CODE_EFFORT_LEVEL`. Any other path, including `env.ANTHROPIC_BASE_URL`, `hooks`, `permissions`,
`apiKeyHelper`, `statusLine`, `__proto__`, is refused with `not-allowed` (the "allow list" test). Otherwise the plugin
could hijack Claude Code.

How it is written:

1. Read the file. An empty one counts as `{}`. Not JSON — refused with `settings-broken`, the file isn't touched. The
   file is a symlink (dotfiles): the file it points to is written, and the link stays.
2. A copy before the change: `~/.claude/backups/settings.json.<time>-agenthub` (mode 0600: it holds your `env`). The
   last 20 such copies are kept; other files in `backups` are not deleted.
3. Write the new text (indent 2, key order kept, new keys at the end) to a temp file next to it, with the previous
   permissions.
4. Before replacing, check that the file hasn't changed since it was read. If it changed (`/model`, `/effort` in a
   session, another plugin) — re-read and retry. After three attempts — refused with `settings-busy`.
5. `rename` over it. The hub logs the action run in its journal.

Claude Code specifics (checked against the installed 2.1.321):

- **Effort for Opus 5.5 and newer** is taken only from `modelSettings["<id>"].effortLevel`, while `effortLevel` in
  `~/.claude/settings.json` has no effect for them (for older models, including 3.x and 4.x, it does). The plugin
  writes both: `effortLevel` and the current model's `modelSettings`. With no model chosen, Opus 5.5 is assumed (the
  Anthropic API default model): both display and writes go by its entry. When the model changes, effort carries over
  to the new model, otherwise it would start from its own default.
- **`env.CLAUDE_CODE_EFFORT_LEVEL`** is understood by the plugin the same way as by Claude Code: a level
  (`med` = medium) or max overrides effort in every session; `auto`/`unset` — each session gets its model's default
  effort; an integer overrides (shown as is); anything else (`ultracode`, surrounding spaces) Claude Code ignores — and
  so does the plugin. Anything that overrides is shown on the page as an orange line; picking a level clears it the
  same way as max.
- **With no model chosen** the base effort is Opus 5.5's effort. The plugin doesn't compare a tab on another model with
  it by effort: `/effort` there would overwrite its model's saved effort.
- **max** in `effortLevel` is silently dropped by Claude Code. Max holds only in `env.CLAUDE_CODE_EFFORT_LEVEL=max`,
  and live sessions pick up `env` at once. That's why max is an action with confirmation: "it applies at once in every
  tab, open ones included, and overrides /effort there".
- **Leaving max**: `env.CLAUDE_CODE_EFFORT_LEVEL` becomes `""` (empty = "not set"; `auto` and `unset` mean a forced
  auto), the chosen level goes into `effortLevel` and `modelSettings`. Live sessions don't notice a removed `env` key
  (they would keep max), so the plugin deletes the key itself once no live sessions started before leaving max remain
  (the time of leaving is in the plugin's data).
- **outputStyle** from `~/.claude/settings.json` is picked up by open sessions from their next message. A project with
  its own style (`.claude/settings.local.json`, where `/output-style` writes) overrides the base one.
- **Claude Code itself saves /model and /effort typed into a tab as the base.** The plugin types exactly the base
  values, and the model as it is written (`opus[1m]` stays `opus[1m]` rather than turning into an id without 1M).

## Typing into a tab ("Fix", "Apply base to all", "Continue")

Only through the hub's terminal (contract 3): `POST /terminal/send-text {sessionId, text}` to the
`$AGENTHUB_HUB_SOCKET` socket from the plugin's own process, under the permission
`<agenthub.terminal>send /model /effort`. Only two commands: `/model <id>` and `/effort <level>` (the pattern is
checked both in the plugin and in the hub by the permission). The plugin itself picks sessions that are:

- live and Claude Code (pid, start time, executable path). If `ps` didn't respond, the plugin doesn't treat sessions as
  closed: the queue waits, the max key isn't touched;
- not rejected by the hub (`verified: false` in the hub's file — don't type);
- idle (for "Fix" too: from a page drawn a minute ago nothing is typed into a working session — refused with
  `session-busy`).

The hub checks the rest on every typing: the Claude Code signature right now, the same pid and start time, the tab is
known to the terminal, the session is free and in the foreground, the input line is found and empty; it types the
line, checks that the input holds exactly it, and presses Enter. The plugin never gets the tab's screen. The plugin
maps the hub's refusals to its own reasons:

| Hub answer | What the plugin does |
|---|---|
| `prompt-not-empty` | the tab is skipped: "there was text in the input line" (a draft or Claude Code's pale suggestion) |
| `prompt-mismatch` | "the typed line was left in the input — check the tab": Enter wasn't pressed, nothing is typed a second time |
| `session-busy`, `not-foreground`, `prompt-not-found`, `rate-limited` | nothing typed — the item waits for the next run ("Fix" is refused as busy) |
| `*-timeout`, `deadline` | outcome unknown: "the terminal didn't answer in time — check the tab", nothing is typed a second time |
| `unverified`, `pid-mismatch`, `process-unknown` | "Claude Code signature not verified" |
| `no-tab`, `unknown-session` | "the hub didn't find the session's tab" |
| `disabled`, no socket | "no way to type into tabs" |

**Confirmation comes from the hub's file.** The plugin remembers what it set with the time typing **started**. Claude
Code writes the answer to `/model` and `/effort` into the transcript, the hub puts it into
`$AGENTHUB_CLAUDE_SESSIONS_FILE` (`…Source: "command"`, `modelId`, `at`) — this record is newer than the typing, and
the page shows it instead. If the session didn't accept the command, after the next turn the hub's file shows the real
model and the tab differs from the base again.

"Apply base to all" queues the tabs that differ. Free ones are typed into at once. Busy ones (working, waiting for
you) — when they become free: the session file changes, the hub runs the plugin via `watch`, and the plugin types the
deferred commands — **only if the hub reports it isn't paused** (`AGENTHUB_PAUSED=0`, a request to the hub). If the hub
doesn't report it (older) or is paused, a tab that became free waits for the "Continue" button (the `apply-continue`
action, which the hub's pause blocks).

The queue and the result live in the plugin's data (`PluginData/claude-code/state.json`); the page shows the progress.
The regular run and actions change it only under the `state.lock` lock: "Stop" isn't overwritten by a run, and one tab
doesn't get the command twice. A lock abandoned by a killed run (the process in the lock is gone) is removed at once.
Before the first send the item is saved as "typing"; if the core killed the run mid-typing, this item isn't typed a
second time ("interrupted while typing — check the tab"). Time limits count from the process start: a regular run fits
into 4 s of 5, an action into 26 s of 30, including waiting for the lock and `ps`. "Stop" drops the deferred items.
Retry is the same "Apply base to all" button: it takes the tabs that differ now.

If the hub didn't give the plugin a terminal (no `$AGENTHUB_HUB_SOCKET`), the page is read-only: no typing buttons,
and a "View-only" line. Which terminal is behind the tab — cmux or another one the hub has an adapter for — doesn't
matter to the plugin. The "Switch" button on each open session is the hub effect `session.focus <sessionId>`: the hub
finds the tab, and if there is none, the hub refuses.

## Actions

| id | level | what | `reason=` refusals |
|---|---|---|---|
| `set-model <id>` | immediate | model for new sessions (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1) | `bad-arg` |
| `set-effort <level>` | immediate | low, medium, high, xhigh; leaving max | `bad-arg` |
| `effort-max` | confirm-cost | max via `env`; the price in the window — "the limit runs out several times faster, it applies at once in every tab" | — |
| `set-style <name>` | immediate | a style from the list (built-in, yours, plugins') | `bad-arg`, `unknown-style` |
| `ultracode-on`, `ultracode-off` | immediate | the `ultracode` key (turning off deletes the key) | — |
| `apply <sessionId>` | confirm-cost | "Fix": type into a free session's tab | `no-terminal`, `no-session`, `session-busy`, `rate`, `unverified`, `no-tab`, `input-text`, `input-mixed`, `unknown-outcome`, `partial`, `terminal-offline`, `terminal-failed`, `paused`, `no-ps` |
| `apply-all` | confirm-cost | "Apply base to all" and "Retry for K" | `no-terminal`, `nothing-to-do`, `job-running`, `no-ps` |
| `apply-continue` | confirm-cost | "Continue": type the deferred commands into tabs that became free | `no-terminal`, `no-ps` |
| `apply-stop` | immediate | drop the deferred items | — |
| `apply-done` | immediate | dismiss the result | — |

Common refusals: `no-claude`, `settings-broken`, `settings-link-broken` (the `settings.json` link points nowhere — the
plugin doesn't replace it with a file), `settings-unreadable`, `settings-busy`, `not-allowed`, `plugin-busy` (another
run holds the state lock), `plugin-failed` (the plugin itself failed), `unknown-action`.
Before `reason=` the plugin prints `message=<explanation>` in the hub's language (contract 2 and newer).

**Levels follow the registry rule** (`docs/contract/plugins-registry.md`): `immediate` is only a toggle that spends
nothing at the moment of the click and is undone by the same click; a future price is described in words in `title`.
That's how model, effort below max, style, ultracode, "Stop" and "Dismiss" work (the button hint of model, effort and
ultracode says the limit goes faster). Typing into a tab can't be undone from the hub — "Fix", "Apply base to all" and
"Continue" go through a window with the price (`confirm-cost`). So does max: window L from the mockup became the
core's window, its "Are you sure?" is in `cost`. The registry linter flags every `immediate` for the reviewer.

## Permissions 1.1.0

| Permission | Why |
|---|---|
| `fsRead ~/.claude/settings.json` | show the base settings; re-read before writing |
| `fsRead ~/.claude/output-styles` | the list of your output styles (only the name from the file header) |
| `fsRead ~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache` | output styles of enabled Claude Code plugins |
| `fsRead ~/.claude/sessions/*.json` | open sessions: pid, folder, name, state, start time |
| `fsRead ~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude` | whether Claude Code is installed (native install, Homebrew, npm; another sign is an existing `~/.claude/settings.json`) |
| `fsRead $AGENTHUB_CLAUDE_SESSIONS_FILE` | model (`modelId`) and effort of open sessions from the hub — metadata only; the plugin doesn't take the tabs (`surfaceId`) |
| `fsWrite ~/.claude/settings.json` | write the choice (only the allow list of keys) |
| `fsWrite ~/.claude/backups/settings.json.*-agenthub` | a copy before every change, the last 20 are kept |
| `exec /bin/ps -o pid=,lstart=,comm= -p …` | whether a session is alive and is Claude Code (no process arguments or environment) |
| `terminal send /model /effort` | type `/model` and `/effort` into a tab through the hub: the hub checks the session, the signature and the input line and presses Enter; the screen isn't given to the plugin. The consent window shows a red line "Typing into Claude Code sessions" |
| `effects session.focus` | the "Switch" button on an open session: the hub finds the tab |
| `watch ~/.claude/settings.json`, `~/.claude/sessions/*.json`, `$AGENTHUB_CLAUDE_SESSIONS_FILE` | show changes at once, type deferred commands when a session becomes free, and see the session's answer to the typing |

**What changed since 1.0.0:** `fsRead ~/.cmuxterm/claude-hook-sessions.json`, `exec …/cmux read-screen|send|send-key`
and `exec /usr/bin/codesign` are gone — typing, finding the tab and checking the signature are done by the hub. Added
`terminal send /model /effort`, `effects session.focus` and `watch $AGENTHUB_CLAUDE_SESSIONS_FILE` — the permissions
grow, so updating shows a consent window. Needs a hub with contract 3 (`<agenthub.contract>3`): an older hub shows
"Needs a newer hub".

## From the hub (contract 3)

1. **`$AGENTHUB_CLAUDE_SESSIONS_FILE`** — each session's model (`modelId`) and effort, the write time and `verified`.
   Without it the "Model" and "Effort" columns show only what the plugin set itself.
2. **`AGENTHUB_PAUSED=0|1`** — the plugin types deferred commands itself only with an explicit `0`; otherwise — the
   "Continue" button.
3. **The hub's terminal** (`/terminal/send-text`, permission `<agenthub.terminal>`) and the **`session.focus`** effect.

Tests: `test/claude-code.test.mjs` (`scripts/check.sh --only claude-code`), a synthetic HOME from `fixtures/`, ps is a
double script, the hub's terminal is a hub socket double (a separate process on a unix socket in the test's HOME).
