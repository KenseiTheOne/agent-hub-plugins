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
- **Page layout (1.2.0, design v2):** model and effort are segmented controls (`segment=true`), the output style a
  dropdown (`select=true`), ultracode a switch (`toggle=`), open sessions a table (`table=true`): tabs that differ, have
  no data or are queued come first, the ones as the base sit in a collapsible "As base · N" group (`group=true`). A row:
  a state dot, the tab, state, model and effort cells (orange where they differ, `cellColors=`), "Fix" or a note, and an
  icon-only "Switch". "Apply base · N" is the table's header button (`header=true`; N is the number of tabs that
  differ). The button has one name everywhere — "Apply base" («Проставить базовые» in Russian): on the page, in the
  confirmation window, in refusal texts and in the consent window. These are display lines of hub 0.1.1 (contract 3);
  an older hub draws the children as plain lines and buttons.
- **Default model:** the first segment is "Default (Opus 5.5)": choosing it removes `model` from settings.json, so
  Claude Code takes its own default. The model in brackets is the plugin's default-model table (`DEFAULT_MODEL`): the
  hub's sessions file can't tell a default model from `--model`. The header then reads "Base: default (Opus 5.5) ·
  medium", the tile "Opus 5.5 · medium".
- **Model list (1.3.0):** the "Model" segment isn't a table in the code. The hub asks Anthropic which models your
  Claude Code sign-in can use and gives the plugin the list (`$AGENTHUB_CLAUDE_MODELS_FILE`, hub 0.1.5+, refreshed
  every 6 hours). The buttons are the newest version of each family in that list, so a new model shows up by itself,
  without a plugin release. The base model from settings.json is added as it is — even an older one — but only as one
  more item: a value typed into settings.json by hand never hides the newest model. Names ("Fable 5.2") and the effort
  rules are derived from the id. An id with a date suffix (`claude-opus-4-5-20251101`) isn't a version and isn't
  listed. Every button writes and types the **full id** (`/model claude-fable-5-2`), never an alias, so a base set from
  the hub doesn't move when Claude Code repoints an alias.
  **Without the hub's list** (an older hub, the `models` service is off, nothing fetched yet, signed out) the segment
  is put together from the models this machine has met: the ones open sessions run on (the hub's sessions file), the
  ones remembered from earlier runs (`state.json`) and a small built-in floor (Opus 5.5, Sonnet 5.5, Haiku 5.5,
  Fable 5.1).
  **"Another model…"** is the spare way: you type the full id (`claude-fable-5-2`) and the plugin writes it as the
  base — for a hub without the list, or for an id the list doesn't show (a dated one).
- **Open sessions** — what a row says: a free tab that differs gets "Fix", a busy one "after the turn", one waiting for
  you "after your answer".
- **Progress of "Apply base"**: what was typed, what waits for the turn to end or for your answer, what was
  skipped and why. The result stays until it is dismissed.

Where each thing comes from:

| What | Source |
|---|---|
| Base | `~/.claude/settings.json`: `model`, `modelSettings.<model>.effortLevel` (for Opus 5.5 and newer only this one works), `effortLevel` (for older models), `env.CLAUDE_CODE_EFFORT_LEVEL` (max), `outputStyle`, `ultracode` |
| Style list | built-in (Default, Proactive, Concise, Explanatory, Learning), `~/.claude/output-styles/*.md` (the name comes from the file header), styles of enabled Claude Code plugins (`~/.claude/plugins/installed_plugins.json` → the plugin folder in `~/.claude/plugins/cache` → `output-styles/` or the manifest's `outputStyles`; name `<plugin>:<style>`) |
| Sessions | `~/.claude/sessions/<pid>.json`: id, folder, name, state, start time. A session is live if the process with this pid is alive, started at the same time (`procStart`, ps in UTC) and is Claude Code |
| Tab | not read: the plugin knows only the `sessionId`; the hub finds the tab (the hub's terminal for typing, the `session.focus` effect for "Switch") |
| Model list | the hub's file `$AGENTHUB_CLAUDE_MODELS_FILE` (the models the sign-in can use). Without it: the hub's file `$AGENTHUB_CLAUDE_SESSIONS_FILE` (models of open sessions), the plugin's `state.json` (`models` — met earlier), the built-in floor |
| Session model and effort | whichever is fresher: the hub's file `$AGENTHUB_CLAUDE_SESSIONS_FILE` (transcript write time, see "From the hub") or what the plugin set itself. Without the hub's file — only the latter, and the header says "tabs: no data", not "as base" |

## 1M context (1.4.0)

The "1M-token context" switch is for new sessions. What it writes depends on the base model, as Claude Code's
"Extended context" documentation describes it:

- **Fable, Sonnet 5+, Haiku 5.5+, Opus 4.7+** have the 1M window by themselves. Off writes
  `env.CLAUDE_CODE_DISABLE_1M_CONTEXT = "1"` (the window is 200K and history is compacted sooner — a long session
  then uses the limit slower); on deletes the key. The key applies to every model, so it is written only for these.
- **Opus 4.6, Sonnet 4.6** get the window from the `[1m]` suffix on `model`: on adds it, off removes it. Picking
  another model in the "Model" segment keeps the window on (the suffix is added where it is needed).
- **Older models** have no 1M window: the page shows a line instead of a switch, the action refuses with `no-1m`.

Open tabs are not touched by the switch: the plugin can't tell a 200K tab from a 1M one, so the sessions table doesn't
compare them by it.

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
`env.CLAUDE_CODE_EFFORT_LEVEL`, `env.CLAUDE_CODE_DISABLE_1M_CONTEXT`. Any other path, including `env.ANTHROPIC_BASE_URL`, `hooks`, `permissions`,
`apiKeyHelper`, `statusLine`, `__proto__`, is refused with `not-allowed` (the "allow list" test). Otherwise the plugin
could hijack Claude Code.

How it is written:

1. Read the file. An empty one counts as `{}`. Not JSON — refused with `settings-broken`, the file isn't touched. The
   file is a symlink (dotfiles): the file it points to is written, and the link stays.
2. A copy before the change: `~/.claude/backups/settings.json.<time>-agenthub` (mode 0600: it holds your `env`). The
   last 20 such copies are kept; other files in `backups` are not deleted.
3. Write the new text (indent 2, key order kept, new keys at the end) to a temp file next to it. The temp file has a
   random name and is created exclusively with mode 0600 (since 1.4.1; a file or a link planted under a guessable
   name is never written through); the previous permissions are put back once the text is in. It is removed on every
   path that doesn't end in the rename.
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

## Typing into a tab ("Fix", "Apply base", "Continue")

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

"Apply base" queues the tabs that differ. Free ones are typed into at once. Busy ones (working, waiting for
you) — when they become free: the session file changes, the hub runs the plugin via `watch`, and the plugin types the
deferred commands — **only if the hub reports it isn't paused** (`AGENTHUB_PAUSED=0`, a request to the hub). If the hub
doesn't report it (older) or is paused, a tab that became free waits for the "Continue" button (the `apply-continue`
action, which the hub's pause blocks).

The queue and the result live in the plugin's data (`PluginData/claude-code/state.json`); the page shows the progress.
The regular run and actions change it only under the `state.lock` lock: "Stop" isn't overwritten by a run, and one tab
doesn't get the command twice. A lock abandoned by a killed run (the process in the lock is gone) is removed at once.
Before the first send the item is saved as "typing"; if the core killed the run mid-typing, this item isn't typed a
second time ("interrupted while typing — check the tab"). Time limits count from the process start, including waiting
for the lock and `ps`. The hub's timeouts for a run and for an action are hub settings (`standardTimeoutMs`,
`actionTimeoutMs`) and the contract doesn't pass their values to a plugin, so the plugin keeps its own budget — 4 s
for a regular run, 26 s for an action — below the hub's defaults. "Stop" drops the deferred items.
Retry is the same "Apply base" button: it takes the tabs that differ now.

If the hub didn't give the plugin a terminal (no `$AGENTHUB_HUB_SOCKET`), the page is read-only: no typing buttons,
and a "View-only" line. Which terminal is behind the tab — cmux or another one the hub has an adapter for — doesn't
matter to the plugin. The "Switch" button on each open session is the hub effect `session.focus <sessionId>`: the hub
finds the tab, and if there is none, the hub refuses.

## Actions

| id | level | what | `reason=` refusals |
|---|---|---|---|
| `set-model <id>` | immediate | model for new sessions: `default` or a model from the page's list (see "Model list") | `bad-arg` |
| `set-model-id` | immediate, typed text | model for new sessions by the full id the human types in the hub (`claude-<family>-<major>[-<minor>]`); the text comes on stdin, not from the plugin's output; only the shape is checked | `bad-arg` |
| `set-effort <level>` | immediate | low, medium, high, xhigh; leaving max | `bad-arg` |
| `effort-max` | confirm-cost | max via `env`; the price in the window — "the limit runs out several times faster, it applies at once in every tab" | — |
| `set-style <name>` | immediate | a style from the list (built-in, yours, plugins') | `bad-arg`, `unknown-style` |
| `ultracode-on`, `ultracode-off` | immediate | the `ultracode` key (turning off deletes the key) | — |
| `context-1m-on`, `context-1m-off` | immediate | the 1M-token context window for new sessions (see "1M context") | `no-1m` |
| `apply <sessionId>` | confirm-cost | "Fix": type into a free session's tab | `no-terminal`, `no-session`, `session-busy`, `rate`, `unverified`, `no-tab`, `input-text`, `input-mixed`, `unknown-outcome`, `partial`, `terminal-offline`, `terminal-failed`, `paused`, `no-ps` |
| `apply-all` | confirm-cost | "Apply base" and "Retry for K" | `no-terminal`, `nothing-to-do`, `job-running`, `no-ps` |
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
ultracode says the limit goes faster). Typing into a tab can't be undone from the hub — "Fix", "Apply base" and
"Continue" go through a window with the price (`confirm-cost`). So does max: window L from the mockup became the
core's window, its "Are you sure?" is in `cost`. The registry linter flags every `immediate` for the reviewer.

## Permissions

The full set the plugin declares as of 1.4.1. The set last grew in 1.4.0; what each version changed is below the
table.

| Permission | Why |
|---|---|
| `fsRead ~/.claude/settings.json` | show the base settings; re-read before writing |
| `fsRead ~/.claude/output-styles` | the list of your output styles (only the name from the file header) |
| `fsRead ~/.claude/plugins/installed_plugins.json, ~/.claude/plugins/cache` | output styles of enabled Claude Code plugins |
| `fsRead ~/.claude/sessions/*.json` | open sessions: pid, folder, name, state, start time |
| `fsRead ~/.local/bin/claude, ~/.local/share/claude/versions, /opt/homebrew/bin/claude, /usr/local/bin/claude` | whether Claude Code is installed (native install, Homebrew, npm; another sign is an existing `~/.claude/settings.json`) |
| `fsRead $AGENTHUB_CLAUDE_SESSIONS_FILE` | model (`modelId`) and effort of open sessions from the hub — metadata only; the plugin doesn't take the tabs (`surfaceId`) |
| `fsRead $AGENTHUB_CLAUDE_MODELS_FILE` | the model list from the hub: model ids, display names and release dates — what Anthropic offers your sign-in. The hub fetches it; the plugin never sees the sign-in token and makes no network requests |
| `fsWrite ~/.claude/settings.json` | write the choice (only the allow list of keys) |
| `fsWrite ~/.claude/backups/settings.json.*-agenthub` | a copy before every change, the last 20 are kept |
| `exec /bin/ps -o pid=,lstart=,comm= -p …` | whether a session is alive and is Claude Code (no process arguments or environment) |
| `terminal send /model /effort` | type `/model` and `/effort` into a tab through the hub: the hub checks the session, the signature and the input line and presses Enter; the screen isn't given to the plugin. The consent window shows a red line "Typing into Claude Code sessions" |
| `effects session.focus` | the "Switch" button on an open session: the hub finds the tab |
| `watch ~/.claude/settings.json`, `~/.claude/sessions/*.json`, `$AGENTHUB_CLAUDE_SESSIONS_FILE`, `$AGENTHUB_CLAUDE_MODELS_FILE` | show changes at once, type deferred commands when a session becomes free, see the session's answer to the typing, and redraw the Model buttons when the hub refreshes the list |
| `actions` — the 14 actions of the "Actions" table above (id, level, command, argument pattern) | the page's buttons: each changes only the allow list of settings keys or types `/model` and `/effort` into a tab; nothing runs without your click |

**What changed since 1.0.0:** `fsRead ~/.cmuxterm/claude-hook-sessions.json`, `exec …/cmux read-screen|send|send-key`
and `exec /usr/bin/codesign` are gone — typing, finding the tab and checking the signature are done by the hub. Added
`terminal send /model /effort`, `effects session.focus` and `watch $AGENTHUB_CLAUDE_SESSIONS_FILE` — the permissions
grow, so updating shows a consent window. Needs a hub with contract 3 (`<agenthub.contract>3`): an older hub shows
"Needs a newer hub".

**What changed in 1.2.0:** the `set-model` action also takes `default` (its argument pattern grew from
`^claude-…$` to `^(?:default|claude-…)$`): it removes the `model` key from settings.json — still within the allow list,
nothing new is written or read. A changed action is a permission change, so updating shows a consent window.

**What changed in 1.3.0:** added `fsRead` and `watch $AGENTHUB_CLAUDE_MODELS_FILE` — the model list is no longer a
table in the code, it comes from the hub (see "Model list"; needs hub 0.1.5, an older hub skips the two lines and the
plugin falls back to the models it has met); the permissions grow, so updating shows a consent window. Without the
consent the previous version keeps running. The refusal for a hub terminal bridge that isn't running now says to start it and where the command is (the
hub's Settings, Terminal) instead of "try later". New action `set-model-id` ("Another model…", a typed full id) for
a model the list doesn't have. The `fable` alias in a hand-written settings.json is read as Fable 5.1 — what
Claude Code 2.1.323 resolves it to.

**What changed in 1.4.0:** `fsRead` and `fsWrite` of `~/.claude/settings.json` name one more key,
`env.CLAUDE_CODE_DISABLE_1M_CONTEXT` (the "1M-token context" switch), and two actions are new: `context-1m-on` and
`context-1m-off` — the permissions grow, so updating from 1.3.0 or older shows a consent window. A refused "Fix"
also prints `fact=`, `hint=` and `session=` lines for the refusal window of hub 0.1.6 (an older hub ignores them).

**What changed in 1.4.1:** no permission is added or widened — only the "why" of `terminal send /model /effort` and
three action titles are reworded, which is not permission growth, so updating from 1.4.0 shows no consent window.
Texts: the button that types into every tab that differs is called "Apply base" («Проставить базовые») everywhere
(refusal texts and the consent text used to say "Apply to all"); the advice for a paused hub says "Resume the hub" —
the hub's word for lifting the pause. The temp file for `settings.json` gets a random name and is created exclusively with mode 0600 (see
"Writing settings"). The docs no longer promise the hub's action timeout as a number.

## From the hub (contract 3)

1. **`$AGENTHUB_CLAUDE_SESSIONS_FILE`** — each session's model (`modelId`) and effort, the write time and `verified`.
   Without it the "Model" and "Effort" columns show only what the plugin set itself.
2. **`AGENTHUB_PAUSED=0|1`** — the plugin types deferred commands itself only with an explicit `0`; otherwise — the
   "Continue" button.
3. **The hub's terminal** (`/terminal/send-text`, permission `<agenthub.terminal>`) and the **`session.focus`** effect.

Tests: `test/claude-code.test.mjs` (`scripts/check.sh --only claude-code`), a synthetic HOME from `fixtures/`, ps is a
double script, the hub's terminal is a hub socket double (a separate process on a unix socket in the test's HOME).
