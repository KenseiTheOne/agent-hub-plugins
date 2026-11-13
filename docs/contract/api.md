<!-- Copy from agent-hub, contract v3. Don't edit: node scripts/sync-vendor.mjs writes this file, --check catches drift. -->
> **Copy from agent-hub, contract v3 — don't edit.** Source: `docs/api.md`, sections: "POST /actions/:id", "Connections", "Terminal". Updated by
> `node scripts/sync-vendor.mjs` (next to agent-hub); `node scripts/sync-vendor.mjs --check` and CI catch drift.
> Paths and links in the text are relative to the agent-hub repository root. Need a capability that isn't here? Write
> down what you need and hand it to the hub session (the registry's CLAUDE.md).

### `POST /actions/:id` — app, cli
`:id` is an `offer.id` from `/state` (a plugin offer: the arguments come from the offer, `args` from the body are
ignored) **or** a primitive name (`open.url`) with arguments in the body. A declared plugin action (`<agenthub.action>`)
can only be called through an offer.

Body: `{"args": {...}, "input": "…", "confirmToken": "…"}` (all optional). `input` — the text a human typed into the
field of an offer with `input` (see below); for any other target it is ignored.

The order of core checks: target → peer class → hub pause (estop) → arguments of a direct primitive call → `verifyFacts`
→ confirmation → run. Arguments are checked **after** the peer class: `POST /actions/session.stop` with an empty body from
cli gets `403 peer:cli`, not `400 args:…` (UI pass 2026-11-05).

- Level `immediate` and not app-only — `app` and `cli`.
- Levels `confirm`/`confirm-cost` and app-only primitives (`session.respond|launch|stop|interrupt`, `process.*`) —
  **`app` only**; otherwise `403 peer:cli`. Actions of non-built-in plugins — **always `app` only**, at any level (the
  offer has `"appOnly": true`): an official (or own) plugin without declared network access may declare `immediate`
  (since 2026-11-09 — for example, a mode toggle) — then without a confirmation window, but not from cli; with network
  access or a price on the action (`cost=`) — at least `confirm-cost`, unless the action declares `net="none"` (then
  the network floor is lifted for it; a `cost=` still counts). A community plugin's action — at least `confirm`. The one
  exception to "app only": a test hub started with `AGENTHUB_TEST_TIER=own` (and `AGENTHUB_HOME` other than the live
  directory) lets cli press actions of its test-tier plugins (`plugins[].testTier`) at any level; the 428 token is not
  bound to the requester's pid there. The same hub lets cli call `job.cancel` for a job of a test-tier plugin (a job of
  any other plugin stays app only: `403 peer:cli`).
- **Input actions** (`offer.input`, contract 3 additive): app only, any tier (cli on a test hub as above). The text is checked like an argument —
  `400 input:required|too-long|control|option-like|pattern` (empty, over `maxLength` characters, control or format
  characters including line breaks, a leading `-`, not matching the declared pattern). It goes to the action process on
  **stdin** — the text, one `\n`, end of input — never into argv; the journal records `inputLength`, never the text; a
  streamable plugin's `actionResult` gets `arg: null` and `inputLength`. An `immediate` input action needs `input` in the
  request. At `confirm`/`confirm-cost` the app may send the request without `input`: the 428 then carries
  `"input": {placeholder, maxLength, pattern}` and the text says it is typed in the window — the app shows the field in the
  confirmation sheet and repeats the request with `input` and `confirmToken` (such a token accepts any valid text); a
  request with `input` gets a 428 whose text quotes it, and its token accepts only that text (`403 confirm:invalid`).
  An input action declared with `inputPattern=` (contract 3 additive, re-review 65) is also bound to a row: the offer
  carries the row's `arg=` value (checked against the action's `arg=` pattern, `409 facts:bad-arg` when it no longer
  matches), it goes to argv as for any parameterized action, `offer.label`, the 428 text and `actionResult.arg` name it,
  and the typed text is checked against `inputPattern` (that is `input.pattern` then); the text still goes only to stdin.
  The request body is the same: `input` (+ `confirmToken`), never `args` — the row value comes from the offer.
- **Background actions** (`offer.background`): the request returns as soon as the job has started —
  `200 {"ok":true,"result":{"ok":true,"job":"<16 hex>","pid":…}}`; `409 facts:jobs-limit` — the plugin already has
  `plugins.maxJobsPerPlugin` (4) jobs (jobs still starting count too; jobs of a removed or updated instance that are being killed do not). The job is listed in `plugins[].jobs` and in the idle verdict, journaled
  (`job-start`, `job-exit`), has no timeout, and is stopped by `job.cancel`, the hub pause, removing/disabling/updating
  the plugin and the daemon stopping — not by a restart of the plugin's streamable process.
- The core decides on confirmation: the first request without a token →
  `428 {"error":"confirm-required","needsConfirm":true,"token":"…","level":"confirm","text":"<core text>","cost":null|"…","expiresInMs":120000}`.
  The app shows `text`/`cost` in an `NSAlert` and repeats the request with `confirmToken`. The token is single-use,
  lives 120 s, and is bound to the action with its arguments, to the plugin action fingerprint (command, level, argument
  pattern, plugin version and tier) and to the requester's pid: a token issued for one version's text gives
  `403 confirm:invalid` after the plugin is updated. Extra 428 fields (additive): `row` — the sanitized title of the
  row that carries the button (≤ 120 graphemes, control characters replaced), also quoted at the end of `text`; a child
  row whose text only repeats the action's title gives its parent row's title instead. The same offer (same action and
  arguments) on rows with different titles is split into one offer per title, so `row` is always the row that was
  pressed. The first title in frame order (header lines, then body) keeps the usual id; each further title gets an id
  derived from the base id and its position (not from the text), so ids stay stable when a row text changes every frame
  (a time in it) and when a later copy appears or disappears. When a copy appears before it, the id moves to that
  copy — the same action and arguments, so an open confirmation still runs (re-review 64, review 3);
  `input` (above); `background: true` — the action starts a job.
- Success: `200 {"ok":true|false,"result":{…scalars only…}}`. After the action a standard plugin is restarted, a
  streamable one gets `{"type":"actionResult","id","actionId","primitive","arg","ok","code","inputLength"?,"job"?}` on
  stdin (`arg` — the checked argument value from the offer or `null`).
- A plugin action: the core writes the confirmation text in the hub language (`lib/i18n.mjs`) —
  `«<название>» (<уровень>) просит: «<title>» для <значение>. Выполнится: <команда>.` / `"<plugin>" (<tier>) asks to: "<title>" for <value>. Will run: <command>.`,
  where the command is shown as it will run: the value replaces the word `{name}`, or without it goes at the end
  (`my-tool.30s.mjs --action skip ABC-1`); the price comes from the core (`confirm-cost`: "The command may access the
  network: <hosts>") plus the author's words marked "According to the plugin: …". `title`/`cost` are taken in the hub
  language from the `title-xx`/`cost-xx` metadata, if present; all variants are part of the action fingerprint, so a
  language change does not cause `facts:action-changed`. Before the confirmation and the run the core re-reads the plugin
  file metadata from disk: an argument that does not match the current pattern — `409 facts:bad-arg`; the command, level,
  pattern, version or plugin tier changed (the file was replaced before a rescan, updated, demoted) —
  `409 facts:action-changed`. The command is argv without a shell, the argument value is a separate element. `result`:
  `code`, `timedOut`, `durationMs`, `reason` (the action's last stdout line `reason=<code>` — the plugin's own
  machine-readable refusal reason) and `message` (contract 2: a `message=<text>` line among the last 5 stdout lines — an
  explanation for the human in the hub language, the plugin gets `AGENTHUB_LANG`; cleaned like `activity=` phrases, up to
  120 graphemes). The shell shows a refusal as ""<button>": <message>"; without `message` — "the plugin refused
  (<reason>)". The hub has no texts of its own for specific plugins' codes.

### Connections — `GET /connections` (app, cli), `POST /connections/:id/connect|cancel|disconnect` (app only), `POST /connections/:id/mcp`, `POST /connections/:id/http` (a plugin process)
The hub signs into external services via OAuth 2.1 and calls their MCP servers on behalf of plugins (the `oauth`
service, `daemon/lib/services/oauth.mjs`, `lib/oauth.mjs`, `lib/mcp-client.mjs`; routes — `lib/routes/connections.mjs`;
decision 2026-11-09). **The core does not know which connections exist** (contract 2): plugins declare them themselves
with the tag `<agenthub.connection id=… type="mcp" url="https://…" scope=… tools=… interval=… budget=… title=…>why</…>`
([`extension-points.md`](extension-points.md)). The core takes a declaration only from trusted plugins
(builtin/official/own), with the plugin id or `<plugin id>.<name>` (the whole id starts with a letter, up to 64), and
only if the `url` host (and the authorization server `hosts`) is in the plugin's `<agenthub.net>`; otherwise — the
journal record `connection-rejected {plugin, connection, why: id|net|duplicate|taken}` and no connection. A plugin
restart (`plugin.removed` with `restart: true`) does not touch the connection: an ongoing sign-in and the result cache
stay. If the plugin was removed (or stopped declaring the connection) but the sign-in remains in the keychain, the
connection is **orphaned**: listed with `orphan: true`, only `disconnect` (`connect` — `409 oauth:orphan`, plugin calls —
`409 oauth:orphan`); after a daemon restart such connections are found via `Cache/oauth-<id>.json` (call timestamps,
plugin id and title, no tokens); "Disconnect" removes the sign-in, the line and this file (journal
`connection-orphaned`). If the plugin comes back, it is a regular connection again with the previous sign-in. Removing a
plugin "with data" (`POST /registry/remove` with `purge`, event `plugins.removed {purge: true}`) also removes the
sign-in of its connections (journal `connection-purged`). For an own plugin a connection is a `connections` permission
in the consent window (address, scope, allowlist; anything new is a permission increase). No service —
`503 oauth:disabled`; an unknown `:id` — `404`. The examples below use a `tix` connection to
`https://mcp.example.com/mcp`.

**Sign-in** (`POST /connections/tix/connect`, no body needed) → `200 {authorizeUrl, expiresAt, connection}`. The shell
opens the `authorizeUrl` page (the default browser); the confirmation happens on the service's site, the hub shows no
window of its own. Before that the core:
- discovers the authorization server: a request without a token → `401` with `WWW-Authenticate … resource_metadata=` →
  resource metadata (RFC 9728; only from the same origin as the resource; `resource` must match) → server metadata
  (RFC 8414; `issuer` must match). Without `S256` in `code_challenge_methods_supported`, without
  `registration_endpoint` or without `none` among the client authentication methods — refusal `oauth:discovery`. All
  addresses are https on the connection's hosts (the `url` host and `hosts` from the declaration); in test mode also a
  double on 127.0.0.1/localhost. Metadata is cached for an hour;
- registers a **public** client (RFC 7591: `token_endpoint_auth_method: none`, no client_secret; `grant_types` — the
  intersection of `authorization_code`, `refresh_token` with what the server declares — sometimes only
  `authorization_code`; both 200 and 201 responses are success). The registration is kept and reused at the next sign-in
  if the same receiver port is free (otherwise a new registration with a new redirect address);
- starts a **temporary receiver** `http://127.0.0.1:<random port>/oauth/callback` — the only place where the daemon
  listens on TCP: 127.0.0.1 only, only `GET` on this path, a 5 min lifetime (`loginTimeoutMs`), one acceptance: the first
  request with the correct `state` (constant-time comparison) and the correct `iss` (RFC 9207: if the server declared
  it, a response without `iss` is not accepted) closes the receiver; a foreign `state` — `400`, the sign-in keeps
  waiting; `error=access_denied` — the sign-in is cancelled;
- PKCE `S256` (verifier — 32 random bytes), `state` — 24 bytes, `scope` — the words from the plugin declaration that the
  server lists (for example `read`: then the server itself enforces "read-only"), `resource=<MCP address>` (RFC 8707).
  The code, verifier and state live only in memory.

The code exchange (`code_verifier`, `resource`, `redirect_uri`, `client_id`) happens before answering the browser: the
page tells the truth ("<name from the declaration> connected — you can close this tab" / "it did not work"; the name is
escaped), in the hub language. Errors (`connection.error` and the route response `error`, `oauth:<code>`): `discovery`
(the details are in the response `reason` and `connection.errorReason`: `resource-mismatch`, `issuer-url`, `no-s256`,
`no-public-client`, …; `no-resource-metadata`/`no-as-metadata` can also come from a server failure), `register`,
`exchange`, `invalid-grant`, `denied`, `iss-mismatch`, `timeout`, `keychain`, `keychain-read` (`503`: the keychain did
not answer), `no-keychain` (`409`: the secrets service is off, or in test mode there is no `security` double), `net`,
`http`. `POST …/cancel` — abort an ongoing sign-in (the state returns to what it was). A repeated `connect` aborts the
previous sign-in.

**Storage.** The client registration and tokens live **only in the keychain**, through the `secrets` service (the
`secrets.store` fact): service `agent-hub.oauth`, entries `<id>.client` and `<id>.token` (the connection id; before
contract 2 the same names — an existing sign-in is kept), the value is JSON in base64url. A token remembers the resource
address it was issued for (`resource`): if the plugin changed `url`, the old token is not sent to the new address, the
connection becomes `disconnected` (journal `oauth-resource-changed`), and a new sign-in is needed. An entry from before
contract 2 does not remember an address: on first read it is bound to the declared address (journal
`oauth-resource-pinned`) if a built-in or official plugin declared the connection; for an own plugin it is not accepted
(journal `oauth-resource-unknown`, a new sign-in is needed): an own plugin with the same id could have appeared after the
official one was removed. Writes go through stdin of `security -i` (`lib/keychain.mjs`), not argv. `oauth.*` keys are
never given to plugins (`denyReason` → `reserved`, including a plugin with id `oauth`). Neither the token, the code nor
the verifier ever reaches the journal, the bus, SSE, `/state`, route responses or plugins; the service reads the token
itself from the keychain on every call. `security -i` reads a line of at most 4095 characters: a longer entry is not
written as one line (`writeItem` → `too-large` without calling `security`, the previous entry stays intact), and the
store splits the value into parts `<entry>.<a|b><n>` with a header `parts_<generation>_<n>_<sha256>` (the header is
written last, the parts of the previous generation are deleted afterwards). A keychain read failure (timeout, a locked
keychain, a code ≠ 44) is not "no entry": at startup the connection stays `unknown` with the `keychain-read` error and is
re-read after `reloadMs` (60 s) or on a plugin call; during a call — an `error` backoff, without marking a sign-in
failure. **"Disconnect"** (`POST …/disconnect`) deletes both entries; if the token was not deleted —
`500 oauth:keychain-delete`, the state is unchanged (the sign-in stays in the keychain), and the "Disconnect" button
stays. The hub does not try to revoke the granted access on the service side (MCP servers usually do not declare a
`revocation_endpoint`) — the shell suggests doing it in the service's settings.

**Expiry and revocation.** If the server issued a refresh token, the service refreshes access itself (ahead of time if
less than 1 min remains, and on a `401` from MCP; a new refresh token replaces the old one — rotation; only the core
refreshes). No refresh token (the server did not issue one), it was revoked (`invalid_grant`) or the server answered
`401` — the `expired` state: the shell says "Sign-in expired or access revoked — connect again", the plugin gets
`409 oauth:expired`, journal `oauth-expired`. A network failure or `5xx` during refresh is not expiry: the plugin gets
`200` with `error: oauth:refresh`, an `error` backoff, the refresh token is intact. A `403` from MCP (except
`invalid_token`; `insufficient_scope` — the sign-in lacks permissions) is not expiry either: `error: mcp:forbidden`,
`connection.error: forbidden` (`errorReason` — the error from `WWW-Authenticate`), a `why: forbidden` backoff for an
hour.

**An MCP call on behalf of a plugin** (`POST /connections/tix/mcp {tool, args, fresh?}`, peer class `cli`). The core
recognizes the plugin by the peer pid on the socket (the `pluginByPid` fact with `{actions: true}`: a running standard
run, a streamable process or an action a human started — not a descendant); the plugin must be **trusted** (builtin/official/own), **the one that declared the
connection**, and have the service host in `<agenthub.net>`; the tool must be on the declaration's allowlist
(`tools=`). Refusals: `403 mcp:not-a-plugin|mcp:untrusted|mcp:not-owner|mcp:net-not-declared|mcp:tool-not-allowed`,
`403 net:none` (hub 0.1.3+: the caller is the process of an action, or a background job, declared with `net="none"` —
it promised no network, and the hub's proxy is network; journal `mcp-denied` with `action`),
`400 args:tool:required|args:args:type|args:fresh:type`, `413 too-large` (arguments > 8 KB),
`409 oauth:not-connected|oauth:expired|oauth:unavailable` (with `connection`). A `200` response:
`{ok, result: <the tools/call result: content, structuredContent?> | null, fetchedAt, nextAt, why, intervalMs,
calls24h, dailyBudget, fresh, pending?, error?, errorText?}`. A result with `isError` (not a rate limit) is not a
successful refresh: it is not stored in memory, `lastOkAt` does not move, the previous result stays,
`error: mcp:tool-error` and `errorText` — the service text as one line up to 300 characters (repeated in answers from
memory until a successful call), a `why: tool-error` backoff. The protocol is Streamable HTTP: `initialize` and
`notifications/initialized` once per session (`Mcp-Session-Id`, `MCP-Protocol-Version`), the response is JSON or SSE; if
the server forgot the session (`404`) — one retry with a new one.

**Writes: `fresh: true`.** A call that changes something on the service (or a refresh a human asked for) passes
`fresh: true` (a boolean; anything else — `400 args:fresh:type`). Since hub 0.1.3 two more calls count as fresh without
the flag, so a write is never answered from the cache: a tool the declaration lists in `writes=` (a subset of
`tools=`; `GET /connections` and `/state` show it as `writes`), and any call from a foreground action process
(a human pressed the button) — even one with an explicit `"fresh": false`, on `/mcp` and `/http` alike. A background
job follows the interval cache like a run and passes `fresh: true` itself when it needs a current answer: forcing every
poll fresh would spend the daily budget and mark the plugin's cached results stale each time (review 3). It skips the interval cache and is not merged with an
identical call in flight; the reply waits for the service (the call's own 20 s deadline, not `callWaitMs`). The daily
budget and every backoff still apply: if the connection is gated, the call is **not made** —
`429 {error: "mcp:wait", why, nextAt, intervalMs, calls24h, dailyBudget}` (no previous result is passed off as the
answer). A `200` response has the same shape as above: success — `{ok: true, result, fetchedAt, fresh: true, nextAt:
null, why: null, …}`; a failure — `{ok: false, result: null, fresh: false, error, errorText?}`. The result is not kept in
memory; a tool error (`mcp:tool-error`) on a fresh call starts no backoff (it is usually the input, not the service)
and is not repeated in later answers. A successful fresh call marks every cached result of that plugin on that
connection **stale**: the next ordinary call goes to the service (subject to the gate; while gated it still gets the
previous result), and a read that was in flight during the write is stored stale too. Journal: `mcp-call` with
`fresh: true`.

**The core enforces the rate, not the plugin.** The same request (plugin + tool + arguments) runs at most once per
`intervalMs` (`interval=` from the declaration, 15 min by default; the core keeps it within 5 min … 24 h); between calls
the plugin gets the previous result from the service's memory (`fresh: false`). Daily budget: at most `dailyBudget − 4`
calls in 24 h (`budget=` from the declaration, 100 by default; core limits 1…10000; the core knows nothing about the
service's plans) (`why: budget`); a call let through is counted from that moment (before the keychain read), so
parallel calls cannot all pass the gate before the first one is recorded. A service rate limit — `RATE_LIMIT_EXCEEDED` in a JSON-RPC error or in a tool result
(`retryAfter` — seconds, ms or an epoch timestamp; 1 min … 24 h), `429` with `Retry-After` — backoff (`why: rate-limit`;
without `retryAfter` — 15 min → 30 min → 1 h → 3 h → 6 h); `x-ratelimit-remaining ≤ 2` — wait for
`x-ratelimit-reset` (`why: http-limit`); other failures — 1 → 2 → 5 → 10 min (`why: error`). If the service does not
answer within `callWaitMs` (3 s) — `pending: true`, the call completes in the background and lands in the service's
memory. Call timestamps, the backoff and the sign-in failure mark survive restarts: `<home>/Cache/oauth-<id>.json` (0600;
only times — at least as many timestamps as the daily budget, otherwise a budget above 500 could not be enforced — plus
the plugin id and title, no tokens or content). Response content lives only in daemon memory. Journal:
`mcp-call {connector, plugin, tool, fresh?, ok, error?, ms}`, `mcp-call-failed {kind, status, waitS, fresh?}`, `mcp-denied`.

`/state.connections` and `GET /connections` → `[{id, title, note, plugin, orphan?, host, tools, type, apiHosts?, methods?,
paths?, state, since, error, errorReason, scope, requestedScope, expiresAt, refresh, login: {startedAt, expiresAt} | null,
intervalMs, dailyBudget, calls24h, lastOkAt, nextAt, why, keychain}]` (`type`: `mcp` | `http`; for `http` — `apiHosts`,
`methods`, `paths` from the declaration and `tools: []`); `state`: `unknown` (the keychain has not been read yet), `unavailable` (no keychain),
`disconnected`, `connecting`, `connected`, `expired`; `title` and `note` come from the plugin declaration in the hub
language (without `title=` — the plugin name). A change — the `connections.changed {connections}` event; appearance and
disappearance — journal `connection-added`, `connection-removed`. The sign-in journal: `oauth-login-start {port,
scope}`, `oauth-client-registered {grants}`, `oauth-connected {scope, refresh, expiresInS}`,
`oauth-login-failed {error}`, `oauth-login-cancelled`, `oauth-refreshed {rotated}`, `oauth-refresh-failed`,
`oauth-disconnected`; the secrets service — `secret-store {op, account, ok}`.

Settings (`config.json → services.oauth`): `enabled`; `<id>.intervalMs` and `<id>.dailyBudget` — over the plugin
declaration, within the same core limits; `<id>.loginTimeoutMs` (300000), `<id>.callWaitMs` (3000), `<id>.reloadMs`
(60000 — re-read the keychain if it did not answer at startup); in test mode — `<id>.resource` and `<id>.hosts` (a double
on 127.0.0.1; overriding is not accepted in the live hub); for `type="http"` — `<id>.authorize`, `<id>.token` (loopback
endpoints), `<id>.api` (the loopback origin every declared API host is sent to) and `<id>.port`. The service gives
trusted plugins the `AGENTHUB_HUB_SOCKET` variable — the hub socket path.

**`type="http"`: a pre-registered public client and an HTTP proxy (contract 3 additive).** For a service without
MCP the plugin declares `<agenthub.connection type="http" client_id=… authorize="https://…" token="https://…"
hosts="api.example.com" scope=… methods="GET,POST" paths="/v1/" port=… interval=… budget=… title=…>` (grammar —
`lib/meta.mjs` `parseHttpConnection`; every host — `authorize`, `token`, `hosts` — must be in `<agenthub.net>`).
Sign-in is the same route and receiver as above, but: no discovery and no client registration — the declared endpoints
(https on the declared hosts; test mode — loopback doubles) and the declared public `client_id` (no secret; the token
request carries `client_id` and the PKCE verifier, no `resource`); `scope` as declared; a declared `port` is used as the
only receiver port (busy — `409 oauth:port-busy`). Only `<id>.token` is stored (no `<id>.client`); the token is bound to
the declaration (token endpoint, client id, API hosts): a changed declaration means `disconnected` and a new sign-in.
Refresh, expiry, Disconnect, orphans, purge — as above.

`POST /connections/:id/http {method?, host?, path, query?, headers?, body?, fresh?}` — the same callers as `/mcp` (a
trusted plugin process that declared the connection, recognized by pid, actions included). The hub checks: `method`
(default `GET`) in `methods`, `host` (default — the first) in `hosts` and in the plugin's `<agenthub.net>`, `path`
absolute (not `//…`), no `?`/`#`/backslash/whitespace/control characters/dot segments, and none of `%2F`, `%5C`, `%2E`,
`%25` (double encoding), a malformed `%` escape or `;` in any case (a server or a proxy could decode them past the prefix:
`..%2F`, `..;/`, `%252e`) — refused, not normalized; under one of `paths` if declared; `query` — an object of
strings/numbers/booleans (or arrays of them, ≤ 64 pairs), never the key `_method` (a method override for some frameworks:
`403 http:query-not-allowed` with `key`); request `headers` from an allow-list only (`Accept`, `Accept-Language`,
`Content-Type`, `If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since`, `Prefer`, `Idempotency-Key`,
`Range` and API version headers `…-Version` such as `Notion-Version` or `X-GitHub-Api-Version`, except routing names;
any other `X-…` header — `X-Override-URL`, `X-Envoy-*`, `x-middleware-subrequest`, vendor ones — is refused; ≤ 16,
values ≤ 1024 without control characters); `body` — a string or JSON
(`Content-Type: application/json` by default), ≤ 64 KB, not for `GET`/`HEAD`. The request goes to `https://<host><path>`
with `Authorization: Bearer <token>`, no redirects followed, 15 s timeout. Refusals: `403 http:not-a-plugin|untrusted|
not-owner|net-not-declared|method-not-allowed|host-not-allowed|path-not-allowed|header-not-allowed` (+`header`)|
query-not-allowed` (+`key`), `403 net:none` (an action declared `net="none"`, as for `/mcp`; journal `http-denied`;
a read from any other foreground action process is served fresh, past the cache, even with `"fresh": false`; a
background job's read uses the cache unless it sends `fresh: true`),
`400 http:not-http|args:body:type|args:path:invalid|args:query:type|args:query:too-many|args:headers:type|
args:headers:too-many|args:headers:value|args:body:not-allowed|args:fresh:type`, `413 too-large`,
`409 oauth:not-connected|expired|unavailable|orphan`; `/mcp` on an `http` connection — `400 mcp:not-mcp`.

A `200` reply has the `/mcp` shape with `response` instead of `result`: `{ok, response: {status, headers, body, encoding:
"utf8"|"base64", json?, truncated?} | null, fetchedAt, nextAt, why, intervalMs, calls24h, dailyBudget, fresh, pending?,
error?}`. Response headers from an allow-list (`Content-Type`, `Content-Language`, `Content-Range`, `ETag`,
`Last-Modified`, `Link`, `Location`, `Retry-After`, `Cache-Control`, `Date`, `Expires`, `X-Total-Count`, `X-Request-Id`,
`X-RateLimit-*`, `RateLimit*`); the body is capped at 256 KB (`truncated: true`), text and JSON types as UTF-8 (JSON also
parsed into `json`), anything else base64. `GET`/`HEAD` are reads: interval cache per (plugin, method, host, path, query,
headers), merged with an identical read in flight, `fresh: true` skips the cache. Other methods are writes: always
fresh (gated — `429 http:wait`, not sent), never cached, and a success marks the plugin's cached reads stale. Any status
the service answers is `ok: true` (a `4xx` read is cached like any answer) except: `401` — one refresh and a retry, then
`409 oauth:expired`; `429` or `503` with `Retry-After` — `error: http:rate-limited` (with `response`) and a rate backoff
(`Retry-After` in seconds or a date, 1 min … 24 h); `5xx` — `error: http:server-error` (with `response`; for reads an
`error` backoff); a network failure — `error: http:net`. `X-RateLimit-Remaining`/`RateLimit-Remaining` ≤ 2 waits for the
reset like MCP (`why: http-limit`). Journal: `http-call {connector, plugin, method, host, path (≤120), fresh?, ok, error?,
ms}`, `http-call-failed {request, kind: net|rate|server, status, waitS}`, `http-denied`; never query values, bodies or
tokens.

### Terminal — `POST /terminal/read-screen`, `POST /terminal/send-text` (a trusted plugin process, contract 3)

"Read the tab screen" and "type a line into the tab" of a Claude Code session (the `terminal` service,
`daemon/lib/services/terminal.mjs`; routes — `lib/routes/terminal.mjs`; the terminal layer — `lib/terminals/`: the cmux
adapter runs operations through the bridge, [`bridge/README.md`](../bridge/README.md), the tmux adapter through the tmux
CLI; iTerm2 and Terminal.app do not support these routes — `409 terminal:unsupported {terminal, capability}`). Class `cli`, but only the
plugin's own process is admitted — a running run, a streamable process or a running action (the fact
`pluginByPid(pid, {actions: true})`: the peer pid from the kernel) — of a trusted plugin (builtin/official/own) that
declared `<agenthub.terminal>`: `read-screen` for the first route, `send </commands>|*` for the second (by command — a
declared slash command at the start and at most 3 arguments from `[A-Za-z0-9._:[]-]`; with `*` — any line except a
leading `!`, `#`, `&`). Why not a primitive: control primitives are accepted only from the app and with a confirmation,
while a plugin also needs background typing per its own setting; the human granted the permission once in the consent
window (as a red line).

| Route | Body | 200 |
|---|---|---|
| `POST /terminal/read-screen` | `{sessionId, lines?}` (1…30) | `{ok, sessionId, terminal, idle, foreground, promptFound, promptEmpty, busy, ready}` — flags only, no screen text |
| `POST /terminal/send-text` | `{sessionId, text}` | `{ok, sessionId, terminal}` |

Checks in order: the plugin and permission (`403 terminal:not-a-plugin|untrusted|not-declared`), the plugin's overall
request rate (`429`, `scope: requests`), the pause (`423 estop`), the body (`400 body`, `args:sessionId:*`,
`args:<field>:unknown`, `args:text:too-long`, `terminal:bad-text` — not printable ASCII, `\`, leading/trailing spaces),
the line against the permission (`403 terminal:text-not-declared`), the session in the registry
(`409 terminal:unknown-session`; a non-Claude agent session — `409 terminal:external-session`), the Claude Code signature now and the same start time (`409 terminal:unverified`), the
terminal knows the tab and it belongs to the same pid and start time (`409 terminal:no-tab|pid-mismatch`), the terminal
supports the operation (`409 terminal:unsupported`, with `terminal` and `capability`), for typing —
the session is free (`409 terminal:session-busy`: the registry status, without it — the terminal's), the process is not
stopped and is in the foreground of its terminal (`409 terminal:not-foreground|process-unknown`) and the typing rate per
plugin and per tab (`429`, `scope: plugin|tab`). Then the terminal:
`409 terminal:bridge-offline|no-tab|prompt-not-found|prompt-not-empty|session-busy|prompt-mismatch|terminal-test-mode`,
`501 terminal:bridge-outdated` (a bridge without these operations), `502 terminal:cmux-failed|tmux-failed`,
`504 terminal:bridge-timeout|bridge-pickup-timeout|cmux-timeout|tmux-timeout|deadline` (Enter only before the `enterBy` deadline the
daemon puts into the operation; a late bridge answer is `bridge-op-late` in the journal). No service —
`503 terminal:disabled`. Journal: `terminal-send {plugin, sessionId, surfaceId, workspaceId, terminal, tab, len, sha, head,
ok, error}` (`surfaceId`/`workspaceId` — cmux only, `tab` — the adapter's tab key) (head — the declared slash command at the start of the line, sha — 12 characters of the line's sha256, only
together with head; for a line under the `*` permission both are `null`; duplicated in the audit log),
`bridge-op-late {op, opId, sessionId, surfaceId, ok, error, lateMs}` (also in the audit log) and
`terminal-denied {plugin, op, sessionId, error}` (a refusal by the overall rate — at most once a minute per plugin); bus —
`terminal.send {plugin, sessionId, ok, error}`. The whole line and the screen text never go anywhere. Settings —
`services.terminal`: `requestsPerMin` (60), `sendPerMin` (12), `sendPerTabPerMin` (4).
