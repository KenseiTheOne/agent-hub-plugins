<!-- Copy from agent-hub, contract v3. Don't edit: node scripts/sync-vendor.mjs writes this file, --check catches drift. -->
> **Copy from agent-hub, contract v3 — don't edit.** Source: `docs/plugins-registry.md`, sections: "Policy for the core", "Own sources", "Dependencies in the catalog", "Index: tier", "Plugin contract 2". Updated by
> `node scripts/sync-vendor.mjs` (next to agent-hub); `node scripts/sync-vendor.mjs --check` and CI catch drift.
> Paths and links in the text are relative to the agent-hub repository root. Need a capability that isn't here? Write
> down what you need and hand it to the hub session (the registry's CLAUDE.md).

## Policy for the core

The service sets `ctx.setPluginPolicy`. While there is no policy (the service is off or failed in `init`), the core does
not admit installed plugins at all (`policy:no-manager`): without lock, sha256 and consent nothing from `Plugins/<id>`
runs.

- `builtin` — unchanged;
- `local` — admitted, except those blocklisted as a whole by id; the core cuts effects down to `open.*`;
- `installed` — only if it is in lock, not disabled, not blocklisted, lives as a folder `Plugins/<id>/`, the hashes of
  all files match lock and the permissions in the metadata are no wider than the agreed ones; effects = declared ∩
  agreed (the core additionally cuts them down to `open.*`, `session.focus`, `terminal.focus`, `cmux.focus`); `tier` follows the verified
  catalog at check time: `official` only if the index currently names the id official, the sha256 from lock is signed as
  official — by the current index or by the saved `Registry/attest/<id>` (an earlier index where this version was the
  latest; verified with the same public key, id, version and sha256 are compared) — and the lock files are exactly the
  contents of `Registry/archives/<id>.tar.gz` with that sha256; otherwise `community`. A new release of an official
  plugin (including one found by the background check) does not change the tier of the installed one: until it is
  updated it keeps its actions, its own push rules and service variables (before 2026-11-05 a released version demoted
  the installed one to community as soon as the catalog was loaded). The `tier` field in lock is informational: a lock
  entry made bypassing the manager gives no tier — neither official (no signed index names its archive official) nor
  own (no manager consent, see "The `own` tier" below); demoting an id in a new index removes the installed copy's
  actions and push rules after the catalog loads, and the attestation of the old version does not restore official
  status (the manager asks the core to re-evaluate the policy). A catalog on disk newer than the daemon's memory
  (installed from a terminal) is re-read during the check.
  **"Official" is only what the signed catalog lists right now** (decision 2026-11-11): an installed official plugin
  whose id a newer verified index no longer lists at all (or lists as `community` — the owner removed it from
  `official.json`) is `community` from the next policy check on — effects ceiling, actions, its own push rules, service
  variables and consent rules all as for community. The UI just shows the tier it has now (no "removed from the
  catalog" label). The journal gets `plugin-tier-lowered {plugin, version, from: "official", to: "community", reason:
  "not-in-catalog"|"community"|"archive", generatedAt}` once per installed copy, and `plugin-tier-restored` once if a
  later catalog lists it as official again; `Registry/tiers.json` remembers lowered ids across restarts (cleared on
  reinstall and removal). Only a verified catalog moves the tier: a failed download, a bad signature or a rollback keeps
  the last verified catalog (`registry-rejected`), and a catalog pair on disk that does not verify (another process is
  halfway through writing it, or a damaged file) does not replace the verified one already in memory
  (`registry-cache-rejected`). A daemon that starts without any verified catalog treats registry plugins as community
  and journals nothing until it has one. The core allows `<agenthub.action>` for `builtin`, `official`, `own` and
  (hub 0.1.3+) `community` plugins; for an official plugin without declared network access and without a declared price
  the action is as declared, including `immediate` (no window, from the app only; 2026-11-09); with network access
  (unless the action declares `net="none"`) or `cost=` (in any language, `cost-en=` too) — at least `confirm-cost`
  (linter: `immediate` with network and without `net="none"`, or with `cost=`, is an error). A community action is never below `confirm` (the linter warns about
  `immediate`), always from the app, always journaled. Plugin metadata does not affect the tier.
  **Community actions and push rules (hub 0.1.3+).** The linter accepts them with warnings for the reviewer
  (`check.sh`: "! <agenthub.action>: community plugin actions…"): **the reviewer checks every command does exactly what
  its `title` says**, nothing irreversible hides behind a vague title, and the row that carries the button names the
  thing acted on (the core quotes that row in the confirmation window). Community `<agenthub.push>` rules count only with
  `kind="plugin"`, and only their label and `macOnly="true"` (it only narrows delivery to the Mac banner): the banner
  shows the reviewed label and the row text — **the reviewer reads every label and checks the rows with `event=` carry
  no foreign or secret text** (foreign text escaped, see below). `quiet`, `away`, `hold`, `cooldown` and other kinds are
  ignored (a linter warning).
  **`net="none"`, `background="true"`, `input=` (hub 0.1.3+)** — each is a warning for the reviewer: `net="none"` lifts
  the network floor for one action, so **the reviewer checks the command reaches no host** (itself or through programs
  it starts; the hub's own connection proxy is refused to such an action with `403 net:none`); `background="true"` runs without a timeout, so **the reviewer checks the job ends by itself and on SIGTERM
  and spends no more than its title says**; `input=` hands the human's text to the command on stdin, so **the reviewer
  checks it is treated as data** — no `eval`, no shell, no splicing into commands or URLs without encoding. `net=none`,
  `background` and `input` are part of the action's permission key (adding one in an update asks for consent again).
  **The registry reviewer checks every `immediate` action for a price.** "No network and no `cost=`" does not mean
  "free": an action may start a runner, agents or turn on daily quota spending (for example, a runner plugin's mode
  switch), and the core will run it on a single click. The linter flags every such action with a warning (`check.sh`:
  "! … immediate — one-click launch, no window…"). Only an action that spends nothing at the moment of the click and is
  undone by the same click (a toggle) is acceptable; a price that comes later is stated in words in its `title` (the
  button tooltip). If it spends right away or cannot be undone from the hub — `confirm-cost` with `cost=`.
- **Writing to hijack locations (contract 3, 2026-11-10).** `fsWrite` to places from which Claude Code or the system
  can be hijacked is allowed (a Claude Code settings plugin needs exactly that), but loud: `perms.mjs` (`writeRisk`,
  `WRITE_RISKS`) maps the path to a kind of place — `claude-code` (all of `~/.claude` except `task-runs` and `backups`:
  settings, hooks, commands, agents, statusline scripts, `ide/*.lock`, `local/claude`; `~/.claude.json`; managed
  settings; in any project the whole `.claude` directory and `.mcp.json`), `autostart` (`~/Library/LaunchAgents`,
  LaunchDaemons, cron, systemd user, Hammerspoon, Windows startup, …), `shell` (`~/.zshrc`, `~/.zshenv`,
  `~/.bash_profile`, `~/.profile`, fish, `/etc/zshrc`, `/etc/paths`, sudoers, the PowerShell profile…), `bin`
  (`~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, global npm packages — to plant your own `claude`), `terminals`
  (`~/.cmuxterm` — binding sessions to tabs, configs of cmux, ghostty, kitty, WezTerm, tmux), `ssh`, `git`
  (`~/.gitconfig`), `hub` (the Agent Hub directory except its own `PluginData/<id>` and `Cache/<id>`). Coverage is by
  segments: a path inside the place, an ancestor path (`/`, `/Users`, `~`, `~/.claude`), a mask inside the place
  (`~/Library/LaunchAgents/*.plist`) and a mask that can reach it (`~/Library/*/*.plist`, `/Users/*/.zshrc`) all count.
  The linter flags every such permission with a warning (`check.sh`: "! <agenthub.fsWrite>…: hijack location (kind) —
  …"): **the reviewer checks that the plugin writes there only what it promises** (an allowlist of keys, a backup before
  editing, atomic writes). The consent window (the app and `agenthub plugins install`) shows the permission as a red line
  with an explanation — for an own plugin too (along with the "Check it yourself" warning).
- **Terminal (contract 3, 2026-11-10).** `<agenthub.terminal>read-screen|send </commands>|* — why</agenthub.terminal>` —
  only for official and own plugins (a linter error for community ones), an entry of any other form is an error, "why"
  is required. Every `send` permission is a warning for the reviewer (`check.sh`: "! <agenthub.terminal>send …: typing
  into Claude Code tabs…"): **the reviewer checks that the plugin types only what it promises and only on a human action
  or setting**. By command — slash commands only (`/model`, `/effort`; a word without `/` is a linter error) with at most
  3 short arguments; `send *` — any prompt to the agent and any slash command (except a leading `!`, `#`, `&` — the hub
  never types those), so look more strictly: where does the line come from, and can foreign text inject it. In the
  permissions it is the `terminal` kind (`permissions.terminal: [{what, why}]` in the index; an empty list is not
  written), and `send` has `risk: "terminal"`: the consent window shows a red line "Typing into Claude Code sessions".
- **Event subscriptions (2026-11-12).** `<agenthub.subscribe>plugin-id:key-prefix — why</agenthub.subscribe>` — another
  plugin's events (key and row text) on the plugin's stdin; the core delivers them only to trusted (builtin, official, own) streamable
  plugins (for community ones, and for `standard` ones, the linter warns that the tag is ignored), a malformed entry or
  more than 16 is an error, "why" is required. `*:` (every plugin) is a warning: **the reviewer checks the plugin needs
  them and treats the row text as data** — it never sends it anywhere or runs it. In the permissions it is the
  `subscribe` kind (`permissions.subscribe: [{what, why}]`; an empty list is not written): adding one is permission growth.
- **Foreign text in output (2026-11-12).** A plugin that prints text it doesn't control (log lines, PR or task titles,
  tab, file and folder names, model names, error messages) last on a line lets that text add parameters after its own
  `|` — `href=`, `event=`, the plugin's own `action=`/`arg=`. **The reviewer checks every place where such text reaches
  a line**: titles go through an `escapeTitle` helper (`\|`, a guarded leading `-`/`~`, no line breaks; or `|` → `¦`
  and the leading `-`/`~` stripped for hubs before 0.1.3), values are always double-quoted with `"`, `\` and `|`
  escaped, and no foreign text is printed unquoted into a value or as a line of its own (`---`, `~~~`). Helpers and the
  escape rules: [`writing-plugins.md` 4.1](writing-plugins.md#41-lines). A plugin that prints raw foreign text is sent
  back, whatever its tier.
- **Hub socket (2026-11-12).** Processes of community and local plugins — the plugin process, its action and their
  children — get only `GET /health` and `GET /peer` on `hub.sock` (`403 peer:untrusted-plugin`, journaled; see
  [`api.md`](api.md)). A community plugin whose README or code talks to the hub socket won't work and is sent back.

## Own sources (2026-11-09)

Decision 2026-11-09: plugins that are not meant for the public catalog are installed from an **own source** — a local
folder. Only a folder on this Mac, no git URLs. The folder format is the same as for a registry plugin
(`<id>.<interval>.<extension>` with metadata, `README.md`, `test/`, `fixtures/`); by convention the tool's repository
keeps the plugin in `agenthub/<id>/` (for example, `~/Projects/my-tool/agenthub/my-tool`). Code:
`daemon/lib/registry/own-source.mjs` (folder checks) and `PluginManager` (requests, installation, watching).

**Request and installation.** `agenthub plugins install --from <folder>` (terminal, a repository script; you may point
at the repository root — the single plugin in `agenthub/` will be found) or the "Add from folder…" button in the manager
→ `POST /registry/own/request` (classes app and cli: any local process may create a request). The CLI **does not
install**: the daemon checks the folder and creates a request (valid for a day, survives daemon restarts —
`Registry/own-requests.json`; at most 10 — beyond that `429 own:too-many-requests`, old ones are not evicted; repeating
the same folder replaces the earlier request, while a request for the same id from a **different** folder while the
earlier one is waiting gives `409 own:request-conflict` with the waiting one's path: the human would otherwise confirm
the wrong folder), the `plugins.own-request` event, and entries in `/state.ownPlugins` and `/registry/installed.requests`.
A request is bound to its folder: if before "Review and install" the folder was replaced with a link or another folder
(a different realpath) — `409 own:path-changed`. Only a human in the pinned app can install: "Plugins" → "Waiting for
confirmation" → "Review and install" → `POST /registry/own/approve` without a token — the folder is checked again,
**always** 428 with a consent window (path, id, version, content fingerprint, permissions — the same `ConsentList`, who
can write to the folder; `changedSinceRequest` if the content changed after the request) → with a token (single-use,
120 s, app pid) exactly the bytes shown in the window are installed. Without a pinned app (`requirements.app` is empty)
no request is created: `409 own:no-app`, and the CLI says "No pinned Agent Hub app…". While the hub is paused,
installation gives 423 (declining is still possible).

**Folder checks** — the same as in registry CI: no symbolic links (neither outward nor inward), `README.md`, exactly one
main file with a known interpreter (not binary), metadata without warnings, `lintPlugin` as for an official plugin
(actions are allowed, `immediate` with network — without `net="none"` — or a price is an error), forbidden places in all files of the copy,
archive size limits. The walk is complete: more than 200 files (excluding dot files, including `test/` and `fixtures/`,
as in CI) or more than 1000 entries is an error, not a truncated list; an unreadable main file is an error. Reading has
no "checked — then read" race: `O_NOFOLLOW|O_NONBLOCK`, `fstat` of the descriptor — a regular file with the same inode as
during the walk, within the limit; a file swapped for a link or a FIFO gives "the file changed during the check", and a
directory is re-checked with `lstat`. The path is the `realpath` (a link to the folder is resolved at request time; lock
holds the real path). Only the owner — you — should write to the folder and its files: a foreign owner, world write
permission, a macOS ACL granting write to anyone but you (`chmod +a "everyone allow write"` with mode 644; read via
`/bin/ls -le`), a parent directory that is world-writable without the sticky bit — all are errors. **Group write**
(umask 002; on a Mac the user's group is usually `staff`, i.e. every local account) is allowed with a loud warning
(decision 2026-11-11): `writable.group` lists such paths, the request and the consent window carry `risk:
"group-writable"`, the CLI prints `!!! WARNING: …` under "Request created", the app shows a red line in the consent
window (the same `WRITE_RISK_TEXT` mechanism as for takeover locations), and the journal gets `risk` in
`plugin-own-requested` plus a separate `plugin-own-risk {plugin, version, risk, path, files, auto}` on every install
from such a folder, automatic updates included. The fix is `chmod -R g-w <folder>`. The check does not
protect against processes **running as your own user** (including agents working in that repository): their edit with
the same set of permissions will be installed by itself (below, "Updates"); the consent window says so. A failed check
means no request (`422 own:lint` with `errors`, listed in the CLI). A plugin in the folder that requires a newer
contract than the hub (`<agenthub.contract>`) gets no request: `409 own:hub-too-old` with `need`/`have`, and the CLI
says "Plugin … needs a newer hub"; an already installed one becomes `broken` while watching, with `error:
own:hub-too-old`, `need`, `have` (the previous copy keeps running; it updates after the hub is updated). Error texts
are in the hub language (`lang`; the `perms.mjs` linter too — registry CI calls it without `lang`). The window's
`source.warnings` are linter warnings (`immediate` actions, deprecated `kind="runs"|"night"`) and `pushWarnings`
(`kind="security"`, core keys): an own plugin has no registry reviewer, so the shell shows them in the window as a
"Check it yourself" banner.

**The `own` tier.** The copy lives in `Plugins/<id>` (as for installed plugins, without `test/`, `fixtures/` and dot
files; the copy runs, not the repository folder); the lock entry has `tier: "own"`, `own.path`, `sha256` — the
fingerprint (sha256 of a list of "path — file sha256"), `archive: null`. Policy: the files on disk are exactly lock
(otherwise quarantine, as for everyone) **and** the lock entry was written by the manager itself (`ownTrusted`) →
`tier: own`. The `tier: "own"` field in lock gives no tier by itself (any user process can write it): the manager
remembers the fingerprint of every own entry it wrote (path, content fingerprint, files, permissions) in daemon memory
and in `Registry/own-approvals.json`. While the daemon runs, an entry in the consent file that it did not write gives no
trust — only revocations are taken from the file (`agenthub plugins remove` from another process); at startup consents
are read from the file. On a mismatch the plugin runs as **community** (actions only at `confirm` and up, push rules
only `kind="plugin"` labels, no service variables), the blocklist applies to it, journal `plugin-own-unexpected`, event `plugins.own-unexpected` → the push
service: the security exception `@hub:plugin-own-unexpected:<id>` (like a pin change: immediately, during quiet hours,
banner bypassing the shell), an orange `unverified` line in the manager, and the hub itself creates a request to
re-confirm from the entry's folder (`reason: "unexpected"`; all permissions in the window are "new"). The limit is the
same as for app pinning (`daemon/lib/app-pin.mjs`): forging both files while the daemon is down cannot be detected; only
Touch ID would close it fully. Trust is as for an official plugin: actions (without network and price — the declared
level, `immediate` without a window, from the app only), own push rules, `AGENTHUB_USAGE_FILE` and `$VARIABLE` in
`<agenthub.watch>`, the session registry, MCP through the hub. The registry blocklist does not disable a confirmed own
plugin. The UI label is "own · <path>".

An own plugin's permissions are the same kinds as in the registry, plus `push`: loud `<agenthub.push>` rules with
`kind="security"` (delivered regardless of switches) or `quiet="true"` (during quiet hours too) —
`what: "<key> [security, quiet]"`, `why` is the rule label (`loudPushRules` in `perms.mjs`). The registry has no such
kind (the reviewer sees such rules as a CI warning); for an own plugin the human sees them in the consent window, and
their appearance is a permission increase.

**Updates.** The plugins service watches the folders of own plugins (`fs.watch` with a 1.5 s debounce and a fingerprint
check once a minute — `services.plugins.ownCheck {checkMs, debounceMs}`). The content changed, **the set of permissions
is exactly the same** (`permissionsFingerprint`, including `push` permissions), the version is not older than the
installed one, the check passed — the new copy is installed **by itself** (user decision: "install it yourself"):
journal `plugin-own-updated` with the list of changed files (`files`), the `plugins.own-updated` event and a banner
"Plugin updated — "<title>" updated to <version>" (or "updated from its folder (version …)" when the version stayed;
decision 2026-11-11: no window, but you always hear about it; kind `updates`, so the "Hub and plugin updates" switch
turns it off, and during quiet hours while you are away it waits for the digest) (while the hub is paused — `paused`,
until the pause is lifted). The daemon process installs it, while any
user process can write to the folder — including a Claude Code session in that repository; this is the price of the
decision (the consent window says so). Permissions grew — the `update` state: in `pluginUpdates` (`tier: "own"`,
`notifyKey` — one "Update available" notification per new content), in the manager "Update · new permissions" →
`POST /registry/install {id}` takes the own plugin from its folder → a consent window with "new" marks. Permissions
narrowed or the version is older than the installed one (`git checkout` of an old branch; `downgrade: true`) — also
`update`, but without a window: installed with a single "Update" click (narrowing is not installed by itself, otherwise
returning to the previous content would again trigger a window for what the human already agreed to). The folder
disappeared — `missing`; it fails the check, was replaced with a link (a different realpath) or contains another plugin
— `broken` with a reason: the plugin runs on the last copy, the manager shows an orange line, and
`/state.ownPlugins.problems` gets an entry.

**Migration.** An own plugin never becomes official: only the manager writes lock after consent, and it has no archive
(`Registry/archives/<id>`) and no attestation (`Registry/attest/<id>`) (they are deleted on migration); `officialNow`
for `tier: own` is always false. If the same id is already installed from the registry (official or community), the
request and the consent window carry `migrate: {from, version}` ("Will replace the official "…" from the catalog with
your own from this folder…", a "Replace" button); the plugin data (`PluginData/<id>`) is kept. From another own folder —
`migrate.from: "own"`. The id is not installed but is in the registry catalog — `migrate: {from: "catalog", tier,
version, title}`: the own plugin gets everything the hub stores under that id (secrets `agent-hub.<id>` in the keychain,
`PluginData/<id>`, notification rules `<id>:<key>`) — the window says so plainly, a "Replace" button, the CLI prints a
warning. Back again — the catalog card's "Restore from catalog" → `POST /registry/install {id, source: "registry"}`: a
window with `migrate.from: "own"` ("Will replace your own "…" from folder … with the plugin from the registry catalog.
Folder watching will stop"); from the terminal `agenthub plugins install <id>` prints "Replace" and the same line. The
catalog offers no updates for an id installed as own (`installedOwn`, `updateAvailable: false`).

## Dependencies in the catalog: "Requires …" (2026-11-09)

A plugin declares an external program with `<agenthub.requires name="…" url="https://…" check="~/…">why</agenthub.requires>`
([`extension-points.md`](extension-points.md)); `build-index.mjs` puts `requires: [{name, url, check, note}]` into the
index entry and the translation into `i18n.<lang>.requires`. `GET /registry/catalog` returns
`requires: [{name, url, note, check, present}]` — the daemon computes `present` from whether `check` exists in the
plugins' HOME. The catalog card: "Requires <name>" as a link, "not found on this Mac" / "installed"; when missing,
"Install" is dimmed with a tooltip (installing is still possible). For example, a registry plugin for an
agent tool declares the tool itself ("Requires <tool>", `~/.<tool>`). An invalid index entry (not https, a mask in `check`) is dropped.

## Index: `tier`

Every `index.json` entry has `tier: "official" | "community"` (built by `build-index.mjs` from `official.json`) and the
older `official: bool`. They must agree (`tier:"official"` ⇔ `official:true`), otherwise the entry is rejected
(`registry:index-entry`); the index cannot assign `builtin` or `local`. An old index without `tier` is read by `official`.

## Plugin contract 2 (2026-11-09): what the registry needs

Cleaning plugin names out of the core ([`extension-points.md`](extension-points.md), "Contract versions"). The registry
side:

- **Sync `scripts/vendor`** (`node scripts/sync-vendor.mjs`): `perms.mjs` knows the `connections` permission kind
  (a `<agenthub.connection>`), the linter checks the connection host against `<agenthub.net>` and the connection's own
  id and warns about the deprecated `kind="runs"|"night"`; `meta.mjs` parses `<agenthub.icon>`, `<agenthub.contract>`,
  `<agenthub.connection>`, `kind="plugin"` and `was=`. Without syncing, the index of a plugin with a connection will not
  match its archive (`registry:archive-permissions`): the index permissions are built by the vendored `perms.mjs`.
- **`build-index.mjs`** copies `contract` (an integer from `<agenthub.contract>`; absent — the field is not written) and
  `icon` (`{symbol, color?}` from `<agenthub.icon>`) into the index entry. The daemon accepts an entry without them
  (contract 1: a neutral icon); an invalid `icon` in the index does not break the entry — there is just no icon; an
  unparseable `contract` (not an integer 1…9999 — for example "2.1" from a future build-index) does not break the entry
  either: it is marked "Requires a newer hub" (`needsHub.need: null`).
- A plugin with a contract newer than the hub may be published in the index: hubs of **version 2 and newer** will show
  "Requires a newer hub" and will not install it (a version that needs a newer hub is not offered as an "available
  update" either). **Contract 1 hubs (everything deployed before 2026-11-10) know neither the tag nor the `contract`
  field and will install such a plugin**, losing the new tags (`kind="plugin"`, connections, `message=`). So contract 2
  plugins are published only after the hub is updated — the rollout order is in
  [`extension-points.md`](extension-points.md), "Contract versions".
- A connection (`<agenthub.connection>`) is for official plugins only: the linter with `official=false` treats the tag
  as an error. The connection id is the plugin id or `<plugin id>.<name>`, and `url` uses a host name, not an IP address.
- `connections` permissions are the same "permission increase" on update: a new connection or a new tool in its
  allowlist means a consent window (changing `interval`/`budget` does not: that is not access).
