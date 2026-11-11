# How to submit a plugin

**Start with the plugin author guide: [docs/contract/writing-plugins.md](docs/contract/writing-plugins.md).**

The plugin contract — what the hub understands in metadata and output — is kept as a copy in
[docs/contract/](docs/contract/README.md) (a copy of the agent-hub documentation, updated by
`node scripts/sync-vendor.mjs`; do not edit by hand). References to `docs/extension-points.md` and the like below
point to this copy.

## What a third-party plugin may do

- Show statuses: output in SwiftBar format (`Title | key=value`, header up to `---`).
- Offer only safe core primitives: `open.*` (open a link/file) and `session.focus` (switch to a session's tab) — for
  all registry plugins, official ones included. Use `session.focus <sessionId>` (contract 3): the hub finds the tab
  itself. `terminal.focus` is the terminal-neutral form of the old `cmux.focus <surfaceId>`; `cmux.focus` is still
  allowed as its deprecated alias, kept for compatibility with already installed plugins. Replies to sessions, stopping and launching sessions are core primitives only for the app's built-in
  plugins. Declared actions `<agenthub.action>` — only for plugins labelled `official` (`official.json`, edited by
  the owner), level no lower than `confirm`. Also only for `official`: push rules `<agenthub.push>` (for a third-party
  plugin the hub ignores them; events go as kind "Other", macOS only and without the plugin's text) and connections
  `<agenthub.connection>` (for a third-party plugin — a linter error). The daemon takes the tier from the signed
  index, not from the metadata; it enforces the ceiling itself, whatever the metadata says.
- Forbidden locations (`~/.claude/projects`, `*.key`, `.env`, `auth.json`, `workstream.jsonl`) are a linter error
  for everyone, with no exceptions by label (README and other archive files are checked too).
- `bash=`, `shell=`, `terminal=` in the output do not work: output cannot run a command.

## Structure

```
plugins/<id>/
  <id>.<interval>.<extension>   ← .mjs/.js/.cjs/.py/.sh/.bash/.zsh — text only, binaries are not accepted
  README.md
  fixtures/home/                 ← synthetic HOME: files of the same shape as the real ones, but without personal data
  test/*.test.mjs
```

`id` — `a-z`, `0-9`, `-`, up to 64 characters; folder name = `id` = file name before the interval.

## Metadata and permissions

```
# <agenthub.title>My plugin</agenthub.title>  <agenthub.version>1.0.0</agenthub.version>
# <agenthub.author.name>Name</agenthub.author.name>  <agenthub.author.github>login</agenthub.author.github>
# <agenthub.platforms>macos,windows</agenthub.platforms>
# <agenthub.fsRead>~/.config/tool/state.json — show the state</agenthub.fsRead>
# <agenthub.net>api.example.com — service status</agenthub.net>
# <agenthub.effects>open.url</agenthub.effects>
```

- Author: `author.github` is required (the GitHub login — the plugin manager turns it into a profile link),
  `author.name` — how to sign in the catalog card (shown first; without it — the login).
- Every permission (`fsRead`, `fsWrite`, `exec`, `secrets`, `net`) comes with an explanation after ` — `: the user
  sees it in the permissions window.
- It is forbidden to declare or mention in code: `~/.claude/projects` (conversation text), `*.key`, `.env`,
  `auth.json`, `~/.cmuxterm/workstream.jsonl`, as well as directories and masks that cover them
  (`~/.claude`, `~/.claude/*`, `~/.claude/sessions` as a whole).
- Permission growth in an update (a new permission, a new effect) shows up in the PR as a diff and needs a second
  reviewer; for the user, the update does not apply until they agree again. The permission is the "what" before
  ` — `: it is also the key, only the "why" is translated (`lang="en"`). So write the "what" language-neutrally — a
  path, a command, a host (`<session cwd>/.git/HEAD`, `--task <project>:<id>`), without Russian words; changing the
  "what" is permission growth too.
- A dependency is an external program without which the plugin is useless:
  `<agenthub.requires name="Hermes" url="https://…" check="~/.hermes">why</agenthub.requires>` (translation — the
  same tag with `lang="en"` and the same `name`). The catalog in the manager shows "Requires Hermes" with the `url`
  link; if the `check` path is missing in the home directory, the "Install" button is dimmed with a hint (installing
  is still possible). This is not a permission: the hub only checks whether the path exists. `url` — `https://` only,
  `check` — `~/…` or an absolute path without masks; forbidden locations (above) are a linter error here too.
- Any change to files that go into the archive (code, README, `lib/` — everything except `test/`, `fixtures/` and dot
  files) requires a new `version`: CI compares with the PR base, and the catalog build with the published index.

## Contract 2: what a plugin declares about itself

The hub does not know any specific plugin — no names, icons, notification kinds or error texts
(`docs/contract/extension-points.md`, "Contract versions"). Everything plugin-specific comes from metadata and output.
`<agenthub.contract>` and `<agenthub.icon>` — for any plugin; `<agenthub.push>`, `<agenthub.connection>` and
`message=` on actions — only for official ones (above, "What a third-party plugin may do"):

```
# <agenthub.contract>2</agenthub.contract>                               ← minimum hub contract version
# <agenthub.icon symbol="checklist" color="#FF375F"></agenthub.icon>     ← tile icon (SF Symbol, #RRGGBB)
# <agenthub.push key="job-failed" kind="plugin">Job failed</agenthub.push>   ← own notification toggle
# <agenthub.connection id="<id>" type="mcp" url="https://…" scope="read" tools="…" interval="15m" budget="100" title="…">why</agenthub.connection>
```

- `<agenthub.contract>2` — declare it if you use anything from contract 2: a hub of version 2 or newer with an older
  contract shows "Newer hub required" and does not install, rather than accepting the plugin silently. Contract 1 hubs
  (before 10.11) do not know the tag and install the plugin, losing the new tags — such plugins are published only
  after the hub is updated (`docs/contract/extension-points.md`, "Contract versions"). `scripts/check.sh` warns if a
  contract 2 feature is used but the tag is missing.
- `<agenthub.icon>` — without it, the tile gets a neutral grey icon. The tag must be closed.
- `kind="plugin"` on `<agenthub.push>` (`official` only) — a row with the plugin's name in "Settings → Notifications"
  (the hub builds it from the installed trusted plugin; for a third-party plugin the rules are ignored). The legacy
  `kind="runs"` / `kind="night"` work with a warning; when migrating, write `kind="plugin" was="runs|night"` — the
  choice of a user who turned off the old kind carries over.
- `<agenthub.connection>` (`official` only; for a third-party plugin — a linter error) — the hub handles signing in
  to the service and calls to its MCP server; the plugin never sees the token. `id` — the plugin id (by default) or
  `<plugin id>.<name>` (name: a-z, 0-9, "-", starting with a letter, up to 32; whole id — starting with a letter, up
  to 64). `url` — https on a host name (not an IP address), without a port; the `url` host and `hosts` must be in
  `<agenthub.net>`, `tools` — only the tools the plugin actually calls. This is a permission of the `connections`
  kind: a new connection or a new tool is permission growth (consent window).
- Action refusal (actions — `official` only): before the last line `reason=<code>`, print `message=<text>` in the
  hub's language (`AGENTHUB_LANG`), up to 120 characters, without the button name — the shell shows
  "\"button\": text". Without `message=` the person only sees "plugin refused (<code>)".

## Hub data

- The Claude subscription quota comes from the hub's cache, not from other tools' caches (kensei-statusline etc.):
  the core `usage` service writes `<home>/Cache/usage.json` every 3 min, and the hub passes the path in
  `AGENTHUB_USAGE_FILE` — **only to built-in and official** plugins (community plugins and `Plugins/local` do not get
  the variable). Format: `{version: 1, fetched_at, checked_at, error, rows: [{kind, group, percent, severity,
  resets_at, scope?: {model: {display_name}}, label?}]}`; `fetched_at`/`checked_at` — epoch seconds, `error` — a code
  (`no-token`, `token-expired`, `http-429`, `network`, …) or `null`. There are no tokens in the file. On error the
  service keeps the rows of the last success: ignore a row whose `resets_at` has already passed (the week was reset),
  and take the data age from `fetched_at`. No variable — the service is off or the hub is old: show "quota
  unavailable", do not look for the file yourself. Declare the permission like this:
  `<agenthub.fsRead>$AGENTHUB_USAGE_FILE — why</agenthub.fsRead>`. In tests, put a synthetic file in place and pass
  its path in `AGENTHUB_USAGE_FILE`.

## Language and clear output

- The hub passes the plugin `AGENTHUB_LANG=ru|en` — the language chosen in the app (Settings → Language: System /
  Russian / English). When the language changes, the hub restarts the plugin. A plugin without a translation is shown
  as is.
- Metadata translations — the same tag with `lang="xx"` (a tag without `lang` is the plugin's default language):
  ```
  # <agenthub.title>Мой плагин</agenthub.title>
  # <agenthub.title lang="en">My plugin</agenthub.title>
  # <agenthub.desc lang="en">What it shows, in one line</agenthub.desc>
  # <agenthub.fsRead lang="en">~/.config/tool/state.json — show the state</agenthub.fsRead>   (explanation only)
  # <agenthub.status value="wait" label="Сервис тормозит">пояснение</agenthub.status>
  # <agenthub.status value="wait" lang="en" label="Service is slow">explanation</agenthub.status>
  ```
  For an action — the `title-en`, `cost-en` attributes; for a push rule — a repeated
  `<agenthub.push key="…" lang="en">`. `build-index.mjs` carries into the index (`i18n`) the translations of the
  title, the description, the "why" of permissions (`why`) and action titles (`actions`); the hub's permissions window
  shows them in the hub's language. An official plugin must have an English variant for every permission and action
  (test `build-index.test.mjs`). The permissions themselves (what is read, what is run) do not depend on the
  translation: a `lang` variant adds no permissions. Write the "why" for a person — which button or line this
  permission serves, without names of internal files and fields.
- The header (first line) answers "do I need to do anything and what is going on" in plain words, without internal
  jargon. The header parameter `tile="…"` is a short value for the popover tile: what is happening (`04:30`,
  `2 waiting`, `62%`, `3 tasks`, `1 problem`), not `!` — the status icon already shows the alarm.
- Technical details (process numbers, cron strings, ids) go to the second level, collapsed: a line
  `--Details | details=true`, under it `----process 123`.
- Plugin page layout (per the prototype): `stat="Label"` — a number card (the line title is the value, `note=` — the
  line under it, `color=` — its colour; consecutive ones sit side by side); `gauge=0…100` — a card with a bar
  (`note=` on the right), in the first header line — a ring (`gaugeLabel=` under the number); `strip=true` — the
  line's children as a strip of cells (`sfimage`, title, `note`).
- Make your own status labels (`<agenthub.status>`) unambiguous for your plugin: "waiting" means different things for
  a quota and for sessions.

## Tests

- The plugin must work on the synthetic HOME from `fixtures/home` — CI runs it with `HOME` pointing to a copy of
  this folder, with a cleared environment, like the daemon.
- Tests (`test/*.test.mjs`, `node:test`) get `HOME`, `AGENTHUB_PLUGIN_FILE` (path to the plugin) and
  `AGENTHUB_FIXTURES`. **No network and no secrets**: a PR has none.
- Fixtures are synthetic: no real session identifiers, paths with people's names, tokens or conversation text.

## Checks before a PR

```sh
scripts/check.sh --only <id>
scripts/check.sh --base origin/main
```

## Review

PRs are reviewed by the owner (CODEOWNERS). New plugins and permission growth — a second reviewer. `official.json`,
`blocklist.json`, `scripts/`, `.github/` are edited only by the owner.
