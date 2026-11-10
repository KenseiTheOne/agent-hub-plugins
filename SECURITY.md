# Security

## Reporting a vulnerability

Do not open a public issue. Use GitHub **Private vulnerability reporting** (Security tab → Report a vulnerability)
in this repo. Describe the class of the problem and the affected plugin/version; a working exploit is not needed.

## What we do

- A dangerous plugin or version goes into `blocklist.json` (by `id`, `versions` or archive `sha256`). The list is
  part of the signed `index.json`; the plugin manager disables such plugins on the next catalog update
  (the files move from `Plugins/` to `Registry/disabled/`, the plugin does not run).
- Signing key leak — a new key (`scripts/keygen.mjs`, run by the owner), a new public key in the app and the daemon
  config; the old index is no longer accepted.

## Trust model

- `index.json` is signed with the registry key (minisign, Ed25519 + BLAKE2b-512); the daemon accepts only an index
  signed with this key and not older than the one already accepted (rollback protection).
- A plugin archive is installed only if its sha256 matches the index; inside — only regular files under `<id>/`,
  no links and no `..`; the permissions in the archive must match the permissions in the index.
- CI on PRs: no secrets, read-only token, `persist-credentials: false`; `pull_request_target` — only in
  `perms-label.yml` (the `permissions` label, token `pull-requests: write`): scripts and node come from `main`, PR
  files are read as data and not executed;
  signing — a separate job only on push to `main`, from the `registry-signing` environment.
- Even with a signature, a third-party plugin gets nothing beyond statuses, `open.*`, `session.focus` and
  `cmux.focus` (deprecated): the ceiling is enforced by the daemon core. A plugin is a separate process with a cleared
  environment, but runs as the same user: the permissions in the metadata are the author's promise, checked by review
  and the linter, not a sandbox.
