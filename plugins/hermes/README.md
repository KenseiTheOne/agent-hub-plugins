# hermes — Hermes cron jobs

Official plugin of the `agent-hub-plugins` registry (tier `official`, installed and removed from the manager).
Standard, every 60 s. Output is read-only.

**Shows:** whether the gateway is alive (heartbeat `state/gateway.heartbeat`, process from `gateway_state.json`),
whether each profile's scheduler is ticking (`cron/ticker_heartbeat`), ESTOP (`~/.hermes/ESTOP` and `profiles/*/ESTOP`),
jobs from `cron/jobs.json` with the last run from `executions.db` and usage from `usage_audit.jsonl`.

**"OK to shut down" (1.2.2):** the header carries `activity=` for the hub's "OK to shut down the computer" verdict
(Agent Hub core since 07.11; needs no permissions): "Hermes: 1 задача в работе" while a job has a run in progress
(`running`/`claimed` in `executions.db`, otherwise `state: running` in `jobs.json`); no jobs in progress — an empty
value (the plugin takes part, quiet). If the service is silent (`gateway-silent`, `ticker-silent-*`) or the data can't
be read (`source-broken`), the key is omitted: what Hermes is running is unknown, and it doesn't land in "checked".

**Events:**

| Key | When | Status |
|---|---|---|
| `job-failed-<id>` | the job's last run failed | error |
| `job-costly-<id>` | the last run used ≥ 2× the median of past runs (needs ≥ 3 past runs) | wait |
| `gateway-silent` | the gateway is declared `running`, but the heartbeat is older than 180 s or there is no process | error |
| `ticker-silent-<profile>` | the scheduler heartbeat is older than 200 s (as in Hermes: 3 × 60 + 20); not raised under ESTOP of the root or of this profile | error |
| `estop` | all of Hermes is paused (`~/.hermes/ESTOP`) — hint "`hermes resume`", no pause button | wait |
| `estop-<profile>` | only a profile is paused (`profiles/<n>/ESTOP`, `hermes -p <n> pause`; this is how Hermes's `agent/estop.py` works) — hint "`hermes -p <n> resume`", the other profiles and the button to pause all of Hermes work as usual (since 1.2.1) | wait |
| `source-broken` | an unknown shape of `jobs.json`, `gateway_state.json` or the `executions.db` schema | unknown |

**What it doesn't read:** `prompt`, `origin`, `last_error`, `last_failure.detail` from `jobs.json`; the text of the
`error` column (only whether it is set); Hermes key and token files, `config.yaml`, `state.db`, `sessions/`.
`executions.db` is opened with `sqlite3 -readonly 'file:…?immutable=1'` — no locks and no writes. The Hermes database
is in WAL mode, and with `immutable` the `-wal` file isn't read: while Hermes holds a connection open, fresh runs (and
a failure) live only there. So with a non-empty `executions.db-wal` (since 1.2.1) the database and the journal are
copied to a temp folder (`$AGENTHUB_PLUGIN_DATA_PATH` or the system tmp), the copy is read with a plain read-only
connection and deleted right away; neither `-shm` nor any other file appears in the Hermes folder. If the `immutable`
read fails because a `-wal` appeared meanwhile (a checkpoint during the read), it is retried on a copy. Broken sources
are reported in the hub's language (codes, not ready-made Russian strings).
`executions.db` has no tokens (checked 04.11), so usage comes from `cron/usage_audit.jsonl` (`total_tokens` per run);
if `*token*` columns appear in the schema, they are counted too.

**Offers:** `open.file` — the job's output folder `cron/output/<id>` in Finder.

**Actions** (`<agenthub.action>`; the confirmation and its text come from the core, only from the app; the core
checks the `job` argument against `^[A-Za-z0-9_-]{1,64}$` and passes it as a separate argv):

| id | Level | Command | Refusal (`reason=`) |
|---|---|---|---|
| `cron-pause <job>` | confirm-cost | `hermes [-p <profile>] cron pause <job>` | `already-paused` |
| `cron-resume <job>` | confirm-cost | `… cron resume <job>` | `not-paused` |
| `cron-run <job>` | confirm-cost | `… cron run <job>` | — |
| `pause` (the "Поставить Hermes на паузу" (Pause Hermes, ESTOP) button, while there is no ESTOP) | confirm | `hermes pause` | `hermes-paused` (`~/.hermes/ESTOP` exists; before 1.3.0 — `already-paused`) |

Common refusals: `no-hermes` (no `~/.local/bin/hermes`), `no-hermes-home` (the program is there, but the `~/.hermes`
folder with jobs isn't; since 1.3.0, before that also `no-hermes`), `bad-job`, `unknown-job`, `ambiguous-job` (the same
id in two profiles), `no-jobs-file`, `hermes-failed`, `timeout`. The plugin finds the job's profile itself from
`jobs.json` (the root — without `-p`).

**Refusal text** (since 1.3.0, contract 2): before `reason=<code>` the plugin prints `message=<explanation>` in the
hub's language (`AGENTHUB_LANG`); the shell shows it after the button name as is — «"Пауза": Задача уже на паузе.».
The hub no longer keeps its own texts for plugin codes; without `message=` the shell would only say "the plugin
refused (<code>)". The texts are `REFUSALS` in `hermes.60s.mjs`, each code in ru and en (a test checks that no code is
missed).

**Push** (`<agenthub.push>`): `job-failed`, `job-costly`, `ticker-silent`, `gateway-silent` (macOS only), `estop`.
Since 1.3.0 all are `kind="plugin" was="runs"`: they are muted by their own "Hermes" toggle in "Settings →
Notifications" (the hub builds the row from the installed plugin: no plugin — no row). `was="runs"` carries over the
previous choice: if the "Agent runs" kind (contract 1) was off, the "Hermes" toggle is off after the update too.

## Contract 2 (1.3.0)

Since 09.11 the hub knows nothing about Hermes (`docs/contract/extension-points.md`, "Contract versions"): the plugin
declares its icon, notification toggle and refusal texts itself.

| Declaration | Why |
|---|---|
| `<agenthub.contract>2</agenthub.contract>` | the plugin needs a hub with contract 2 (`kind="plugin"`, `message=`). A version 2 hub with an older contract shows "Hub update needed"; a contract 1 hub doesn't know the tag and installs 1.3.0, losing the `kind="plugin"` rules and the `message=` texts — publish after the hub is updated |
| `<agenthub.icon symbol="alarm" color="#30D158">` | the tile icon — the same one that used to be hard-coded in the shell |
| `kind="plugin" was="runs"` on push rules | its own "Hermes" toggle instead of the shared "Agent runs" kind |
| `message=` on action refusals | the refusal explanation in the hub's language: texts the shell used to keep |

**Permissions in 1.3.0** did not change: no new permissions; the icon, the contract and the notification kind don't
count as permissions — the update comes without a consent window.

## 1.3.1

Code comments and docs translated to English. No behaviour or permission change.

Tests: `test/hermes.test.mjs` (`scripts/check.sh --only hermes`), a synthetic HOME from `fixtures/`.
