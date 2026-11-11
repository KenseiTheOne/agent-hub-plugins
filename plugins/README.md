# plugins/

Each plugin is a `plugins/<id>/` folder:

```
plugins/<id>/
  <id>.<interval>.<extension>   ← executable file (or <id>.<extension> for streamable / scheduled)
  README.md                      ← what it shows, which permissions and why
  fixtures/home/                 ← synthetic HOME for tests (optional)
  test/*.test.mjs                ← plugin tests (optional), run on the synthetic HOME
```

File format, metadata and output are the Agent Hub plugin contract (copy in `docs/contract/`: start with
`writing-plugins.md`; the full reference is `extension-points.md`, section "Plugin contract"; what to declare under
contract 2 — CONTRIBUTING.md): `<agenthub.*>` tags in comments, SwiftBar-style output. Everything except `test/`,
`fixtures/` and dot files goes into the plugin archive.

## Official plugins

`hermes`, `clickup`, `claude-code` are official (the list is `official.json`, edited only by the owner; in the
index — `tier: "official"`). `night-runner` left the registry (09.11): the runner is private, its plugin lives in the
runner's own repository (`agenthub/night-runner/`) and is installed as **your own plugin** from a local folder
(`agenthub plugins install --from <folder>` + confirmation in the app; agent-hub README, "Your own plugins"). The
maintainer is the registry owner. Agent Hub's built-in plugins (claude-sessions, agents, quota) live in
`agent-hub/plugins/` and are not part of the registry.

The `official` label grants four things in CI and in the daemon, and the reviewer treats all four as a privilege:
- declared actions `<agenthub.action>` (level no lower than `confirm`; the confirmation and its text come from the
  core);
- own push rules `<agenthub.push …>`: event label, `hold`, `cooldown`, `away` and `quiet="true"` — a notification
  **during quiet hours** (for community plugins the tags are ignored: no plugin text in the notification);
- trusted status (`trusted`): the text of a line with `event=` goes into the notification (not for community);
- connections `<agenthub.connection>` (contract 2): the hub handles signing in to the service and calls to its MCP.
  For community — a linter error; `id` — the plugin id or `<id>.<name>`, `url` — https on a host name (not an IP),
  the host — from `<agenthub.net>`; the reviewer checks the `tools` allowlist — only what the plugin calls.

The daemon treats a plugin as official only while the signed index calls it `official` and the files on disk are
exactly the archive with the sha256 from the index: remove the id from `official.json` and the installed copy loses
these four things after the next `POST /registry/fetch`; a plugin that drops out of the signed index altogether becomes
community the same way (hub 0.1.2, logged once). The effects ceiling (`open.*`, `session.focus`, `terminal.focus` and
its deprecated alias `cmux.focus`; `Plugins/local` — only `open.*`) and the ban on mentioning forbidden locations are the same
as for everyone. A parameterised action:

```
// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9_-]{1,64}$" title="…">my-plugin.30s.mjs --action skip {taskId}</agenthub.action>
```

In the output: `Skip | action=skip arg=<value>`. The core checks the value against the pattern (wrapped in
`^(?:…)$`; also — no Unicode control and format characters (Cc, Cf: bidi, zero width) and U+2028/2029, not starting
with "-", up to 256 characters) and runs the plugin's main file with its own interpreter, passing the value as a
separate argv element in place of `{taskId}` (or at the end). The action checks the facts (lock holder, whether the
task exists) itself; refusal — exit code ≠ 0 and the last line `reason=<code>`, before it —
`message=<text in the hub's language>` (contract 2: the plugin writes the explanation, the hub has no texts of its
own for its codes). Own push rules — `<agenthub.push key=… hold=… quiet=…>Label</agenthub.push>`.

Plugin tests — `plugins/<id>/test/*.test.mjs`; shared helpers (core parsers from `scripts/vendor/`, temporary
HOME) — `scripts/lib/plugin-test.mjs`.

## Local install for development (without publishing)

```sh
node scripts/keygen.mjs /tmp/ahp-key                      # test key outside the repo (not the keychain)
node scripts/build-index.mjs --out /tmp/ahp-idx --sign-key-file /tmp/ahp-key/agent-hub-index.key
AGENTHUB_HOME=/tmp/ah-dev node ../agent-hub/daemon/bin/agenthub install \
  --registry-pubkey /tmp/ahp-key/agent-hub-index.pub --registry-url /tmp/ahp-idx/index.json --apply --no-launchd
AGENTHUB_HOME=/tmp/ah-dev node ../agent-hub/daemon/bin/agenthub plugins install hermes   # permissions window in the terminal
```
