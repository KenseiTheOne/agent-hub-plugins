# clickup — ClickUp tickets and their link to work

An official plugin of the `agent-hub-plugins` registry (tier `official`, installed and removed by the manager).
Standard, every 2 min (the link to open sessions — on every run; the tickets themselves — per the data path below).
Read-only, no actions. macOS only (since 1.6.0).

The plugin is bilingual: the hub shows its texts in Russian or English (`AGENTHUB_LANG`). UI texts below are quoted in
English.

## ClickUp sign-in through the hub (the main path, since 1.2.0)

The **Connect ClickUp** button is on the plugin page and in the shell's Settings → Connections. Sign-in and approval
happen on the ClickUp site, no token to paste. The core makes the connection (the `oauth` service, `agent-hub/docs/api.md`
"Connections"): the official MCP server `https://mcp.clickup.com/mcp`, OAuth 2.1 + PKCE (S256) + dynamic registration
of a public client (no client_secret), the redirect address is `127.0.0.1` with a random port, scope `read`.
The registration and tokens live only in the hub's keychain (`agent-hub.oauth`); **the plugin never sees the token**.

The plugin calls one tool — `clickup_filter_tasks` (`assignees: ["me"]`, open, with subtasks, by update time,
fields `custom_id, status, due_date, date_updated, list, priority`) — through the hub socket: `POST /connections/clickup/mcp`
(the `AGENTHUB_HUB_SOCKET` variable, which the core gives to trusted plugins only). The core lets through only a trusted
plugin that declares `<agenthub.net>mcp.clickup.com` and only tools from the connection's allowlist. **One call per
poll**: the server understands the user "me" itself, `clickup_get_user` isn't needed.

**Rate.** On the Free plan ClickUp allows about 100 MCP calls per rolling 24 h (per client and workspace), so the
plugin declares `interval="15m" budget="100"`, and the core calls ClickUp **no more than once every 15 min** and no
more than 100 times a day (on a plan with a higher limit the user raises the budget —
`services.oauth.clickup.dailyBudget` in the hub's `config.json`), returning the previous response in between. The
plugin says when the next refresh is and why it is less frequent: "next at 16:12", "ClickUp says the request limit is
used up — next refresh at …" (`RATE_LIMIT_EXCEEDED`/`retryAfter`, 429), "Saving the ClickUp daily limit: 96 of 100 …",
"ClickUp asks to slow down" (`x-ratelimit-*`), "ClickUp didn't respond — retrying at …"; while the first response is
still on its way — "Loading tickets from ClickUp…".

**Sign-in expired or revoked** (the server answered 401, nothing to refresh with) — `status=error`, "ClickUp:
reconnect", event `login-expired` (push "ClickUp: sign-in expired — reconnect", the "Problems and warnings" kind);
previous tickets remain. With a personal token — data from it and an orange note without an event.

Several workspaces: the server requires `workspace_id` — set it in `teamIds` in the settings. **The sign-in path takes
one workspace** — the first value of `teamIds` (one call per poll); the other values are not polled via the sign-in
(with a personal token the plugin polls all of them, as in 1.1.1). `listIds` → `list_ids`; `assignee: null`
— no assignee filter. An unfamiliar tool response shape (not JSON, no `tasks`, a task without id/name) —
`status=unknown` + `source-broken`. **A tool error** (ClickUp answered the request with an error) — also
`status=unknown` + `source-broken`, but with ClickUp's text (up to 120 characters); the `workspace_id` requirement gets
the header "ClickUp: choose the workspace", `status=wait` and **no** `source-broken` (a setting, not a broken
source), with the full path of the settings file and an example (`{ "teamIds": ["123456"] }`; the number is in the
ClickUp address, `app.clickup.com/<number>/…`). The core does not count such a response as a
successful refresh (backoff, "updated" doesn't move). **No access** (the core got a 403 — the sign-in lacks
permissions) — `status=error`, "ClickUp: no access to tickets via the sign-in", without `login-expired`: signing in
again won't help, the core retries in an hour. The keychain didn't answer — an orange "retrying in a minute" note,
previous tickets remain.

A hub without the `oauth` service — the plugin works with a personal token.

**The hub didn't answer** (no reply within 3.6 s — e.g. a slow keychain read — or `409 oauth:unavailable`, since
1.6.0): this is not "not connected". With a personal token the token takes over; without one the last tickets stay on
the page with a gray "The hub didn't answer — showing the tickets as of HH:MM" note and `status=unknown`.

## Fallback — a personal token

If there is no sign-in through the hub (not connected, older hub, service disabled), the plugin works with a personal
token, as before — a refresh every 2 min, REST limits.

**API:** REST v2 `https://api.clickup.com`, **GET only** and only paths from the allowlist
(`/api/v2/user`, `/api/v2/team`, `/api/v2/team/{id}/task`, `/api/v2/list/{id}/task`)
with allowed parameters (`assignees[]`, `include_closed`, `subtasks`, `order_by`, `page`); redirects are forbidden. No writes to ClickUp (out of scope).
`user` and `team` are cached for a day — a normal run makes one request per workspace.

**Token:** the `clickup.token` secret → `AGENTHUB_SECRET_CLICKUP_TOKEN` (the core calls the secrets provider). The
simplest way is the **Set key…** button on the plugin page (the Keys section). Or create the keychain entry yourself —
service `agent-hub.clickup`, account exactly `token` (the secrets service looks up
`find-generic-password -s agent-hub.clickup -a token`):

```sh
security add-generic-password -s agent-hub.clickup -a token -T /usr/bin/security -w
```

The plugin points to Set key… first and shows this command as the alternative (ru and en) when there is neither a sign-in nor a token (since 1.1.1; since 1.2.0 —
under "Fallback — a personal token", after "Click Connect ClickUp"). Neither sign-in nor token — `status=unknown`, no
requests at all. The token never reaches the output, cache or log.

**Limit:** `X-RateLimit-Remaining` / `X-RateLimit-Reset` are honoured (≤ 3 left — wait for the window to reset);
on 429 — backoff of 1, 2, 4… min (up to 30 min, not earlier than Reset), previous tickets stay on screen.

**Settings** (optional) — `<AGENTHUB_PLUGIN_DATA_PATH>/config.json`, on macOS
`~/Library/Application Support/AgentHub/PluginData/clickup/config.json`:
`{"teamIds": ["…"], "listIds": ["…"], "assignee": "me" | null, "limit": 15}`. By default — open tickets assigned
to the token owner in all of their workspaces (up to 3; more workspaces — a gray "Reading 3 of N workspaces" line).
Only the first page of each request is read (ClickUp gives up to 100 tickets per page); a full page adds a gray "Only
ClickUp's first page was read" line.

**Ticket ↔ session link:** a live Claude Code session whose git branch or folder contains the ticket id (the id or
the custom id as a whole word) — confidence "likely". Sessions — `~/.claude/sessions/<pid>.json` (the key files next
to them are not read), liveness — `process.kill(pid, 0)` (no `ps`), branch — the `.git` of the session folder or of a
folder above it (up to 12 levels), following `gitdir:` for a git worktree to its `HEAD` in the main repo's git dir;
git is not run.

**Offers:** `open.url` — the ticket in the browser; `session.focus <sessionId>` (since 1.5.0) — a "Switch to session"
button for a live session linked to the ticket: the hub finds the tab, the plugin knows nothing about the terminal.

**Events:** `auth-failed` (401/403 on `/user`, status=error; push rule "ClickUp: token rejected" —
`<agenthub.push>`; the user and workspace cache is reset), `source-broken` (unfamiliar response shape,
status=unknown; the reason is in the hub's language). `auth-failed` and `login-expired` are the plugin's rules with an
explicit `kind="problems"`: these are failures, silenced by the shared "Problems and warnings" switch in Settings →
Notifications, as before 1.3.0 (ClickUp has no toggle of its own — the choice of someone who turned off "Problems"
needs no migration). `source-broken` has no rule of its own — it is a key in the core's shared table, same kind.

**Denial for a workspace** (since 1.1.1): 401/403 on `/team/{id}/task` or `/list/{id}/task` while the token is
accepted is not "token rejected": that workspace's tickets are skipped, the rest are collected, the menu shows "No
access to workspace N — its tickets are skipped". If the user came from the cache, `/user` is re-checked first (the
token may have been switched to another account: then new `user` and `team`); a confirmed denial is remembered for a
day (no re-check on every run), and the workspace list is re-requested once (the user may have been removed from the
workspace). All denied — status=error "ClickUp: no access to workspace N", without `auth-failed`.

Tests use doubles only: HTTP on 127.0.0.1 (the base override is accepted only for loopback) —
`test/clickup.test.mjs`; a hub on a Unix socket in a temp folder — `test/clickup-mcp.test.mjs` (hub sign-in, "why
less often", expired sign-in, fallback, response parsing). `scripts/check.sh --only clickup`.

**Permissions 1.2.0:** added `net: mcp.clickup.com` (the hub makes the requests) — a permission increase, the update
shows a consent window. `api.clickup.com` and the `clickup.token` secret remain for the fallback.

## Contract 2 (1.3.0)

Since contract 2 the hub knows nothing about ClickUp (`docs/contract/extension-points.md`, "Contract versions"): everything
the core used to keep — the MCP server address, scope, tool allowlist, interval, daily budget, the name in the shell —
the plugin declares itself. What is declared and why:

| Declaration | Why |
|---|---|
| `<agenthub.contract>2</agenthub.contract>` | the plugin needs a hub with contract 2: the plugin declares the connection. A version-2 hub with an older contract shows "Newer hub needed"; a contract-1 hub doesn't know the tag — 1.3.0 works there through the connection built into that core, without the icon and without its own texts |
| `<agenthub.connection id="clickup" type="mcp" url="https://mcp.clickup.com/mcp" scope="read" tools="clickup_filter_tasks" interval="15m" budget="100" title="ClickUp">` | **a new `connections` permission** — the ClickUp sign-in and MCP calls through the hub. The host `mcp.clickup.com` is already declared in `<agenthub.net>` (otherwise the core won't accept the connection). The allowlist is **one tool**, the one the plugin calls (`clickup_filter_tasks`); before contract 2 the core also allowed `clickup_get_user`, `clickup_get_task`, `clickup_get_workspace_hierarchy` — the plugin doesn't need them. The interval and budget are the core's previous values (15 min, 100 a day). `id="clickup"` matches the plugin, so the keychain entries are unchanged (`agent-hub.oauth` / `clickup.client`, `clickup.token`): **an existing sign-in is not lost**, no need to reconnect |
| `<agenthub.icon symbol="checklist" color="#FF375F">` | the tile icon — the same one that used to be built into the shell |
| `kind="problems"` on `auth-failed` and `login-expired` | explicitly the shared "Problems and warnings" kind (as before 1.3.0; the core's table no longer has to know `auth-failed`) |

**Permissions 1.3.0:** added the `connections` kind (the `clickup` connection) — a permission increase: updating from
1.2.0 goes through a consent window where the connection is shown on its own line (address, scope, tool, "why"). The
other permissions are unchanged.

**The notification kind is unchanged.** Before 1.3.0 `auth-failed` and `login-expired` went under "Problems and
warnings" (`auth-failed` — via the core's table, `login-expired` — `kind="problems"`); since 1.3.0 both declare
`kind="problems"` explicitly, so a person's "Problems off" choice works as before.

## Page (1.4.0)

Tickets are grouped by what needs attention — each group as a separate card:

1. **Header** — "ClickUp: 9 tickets · 2 with agents · 1 overdue". The popover tile shows what needs attention:
   "2 with agents", without them "1 overdue", otherwise the open count.
2. **Stat cards** — with agents (in open sessions), overdue (the oldest), due this week
   (the nearest), open.
3. **With agents** — tickets open in a live session. The name is a line with a status symbol (empty circle —
   open, half-filled — in progress, checkmark — closed) and the status as a badge; under it "number · list · priority ·
   due", which session has it and with what confidence, the "Open in ClickUp" and "Switch to session …" buttons
   (`session.focus`).
4. **Due soon** — the other tickets that are overdue or due within the next 3 days, by due date; the due date is a
   colored line (red — overdue, orange — soon).
5. **Others** — by status (in progress → open → the rest), within a group — by priority and freshness; a link pill per
   ticket with just the name. `limit` (15) cuts only this group: "with agents" and "due soon" are always shown.

Priority (`urgent` — "urgent", `high` — "high priority") is shown in the number line and moves the ticket up within
its group. The plugin requests it from `clickup_filter_tasks` with the `priority` field (with a personal token it comes
anyway). If the sign-in isn't connected yet, the personal-token fallback is collapsed into "Details" so it doesn't hide
the Connect ClickUp button.

**Permissions 1.4.0 are unchanged** — no consent window on update. The request rate is the same: via the sign-in the
hub calls ClickUp no more than once every 15 min, and the Refresh button doesn't change that — between requests the hub
returns the previous result.

## Contract 3 (1.5.0): switching through the hub, no cmux

The plugin no longer knows anything about the terminal. Previously the "Switch" button was built from the cmux file
`~/.cmuxterm/claude-hook-sessions.json` (the session's tab and workspace) and the `cmux.focus` effect; now it is the hub
effect `session.focus <sessionId>`: the plugin already takes `sessionId` from `~/.claude/sessions/*.json`, and the
core's terminals layer finds the tab from the session registry — with cmux now and with any terminal the hub gets an
adapter for.

- **The "Switch" button** — on every live session linked to the ticket (previously — only on the one whose tab the cmux
  file found). If there is no tab, the hub refuses ("no tab", `no-terminal`) — the plugin can't know that in advance.
- `<agenthub.contract>3</agenthub.contract>`: only a contract-3 hub knows `session.focus`; an older hub shows
  "Newer hub needed".
- Code comments, tests and this README are now in English (no behaviour change; the UI stays bilingual).
- **The page is closer to the design.** "Others" lists each ticket as a text link (`link=true`, not a capsule) with a
  gray "number · list · priority · due" line; status groups have a gray title and a colored dot (`iconColor=`); ticket
  status badges are tinted (`badgeColor=`); an overdue line is red (`color=` on a nested line). The sign-in gives only the
  status name, so the kind, color and order (in progress → review → blocked → to do) come from the name when ClickUp's
  own color and type are missing. In sign-in mode "updated · next" is under "Refresh" (the hub's connection card already
  shows it). These are display parameters of hub 0.1.0 (still contract 3): an older hub ignores them and draws capsules.

**Permissions 1.5.0:** removed `fsRead ~/.cmuxterm/claude-hook-sessions.json`; the `cmux.focus` effect is replaced by
`session.focus`. The new effect is a permission increase: the update shows a consent window (switching to a tab is a
harmless effect, like `open.url`).

## What changed in 1.6.0

- **No more `~/.claude/task-runs`.** Night runs and `/ticket` runs are personal tools, not part of a public plugin:
  the plugin no longer reads them. A ticket is "with agents" only when a live session's branch or folder has its id.
- **macOS only.** The hub socket and the token hint (a macOS keychain command) are macOS-only; Windows is dropped from
  `platforms`.
- **The hub didn't answer ≠ not connected.** A slow hub or `oauth:unavailable` keeps the last tickets with a gray
  note instead of the "ClickUp isn't connected" screen; the REST fallback shares the run's deadline with the hub call.
- **Due today is not overdue.** A date-only due date (`due_date_time: false`, or a start-of-day time on the sign-in
  path) counts the whole day; overdue starts the next day.
- **Several workspaces** is a setting, not a failure: `status=wait`, no `source-broken`, the full path of
  `config.json` and an example on the page.
- What isn't read is said: the first page only (100 per request), at most 3 workspaces.
- Smaller: "Set key…" first in the token hint; whole-word status names (`household` is not "on hold"); a leading `~`
  is stripped from data; an oversized hub reply ends the call instead of hanging; the REST allowlist is narrowed to
  what is used (`/api/v2/task/{id}`, `reverse`, `statuses[]`, `custom_task_ids`, `team_id` removed).

**Permissions 1.6.0 shrink** — no consent window: removed `fsRead ~/.claude/task-runs` and the `windows` platform; the
`.git` read is described as it is (the session folder or a folder above it, a worktree's `HEAD` in the main repo).
