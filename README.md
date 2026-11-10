# agent-hub-plugins

The [Agent Hub](../agent-hub) plugin registry — a monorepo: plugins, CI checks, and the signed `index.json` catalog
from which the app's plugin manager installs plugins.

```
plugins/<id>/<id>.<interval>.<ext>   README.md   fixtures/   test/
scripts/check.sh        ← single entry point for CI and authors
scripts/build-index.mjs ← index.json + archives (built by CI only on main after a merge)
blocklist.json  official.json  CODEOWNERS  CONTRIBUTING.md  SECURITY.md  LICENSE (MIT)
```

## How it works

1. An author sends a PR with a `plugins/<id>/` folder.
2. CI (`.github/workflows/ci.yml`, macOS and Windows, no network and no secrets, no `pull_request_target`) runs
   `scripts/check.sh --base <PR base>`:
   - metadata is parsed **by the same parser as the daemon's** (`scripts/vendor/meta.mjs`);
   - permissions linter: `~/.claude/projects`, `*.key`, `.env`, `auth.json`, `~/.cmuxterm/workstream.jsonl`
     (and masks that cover them) are forbidden — for everyone, no exceptions by label; effects — only `open.*`,
     `session.focus` and `cmux.focus` (`cmux.focus` is deprecated: new plugins use `session.focus <sessionId>`);
     `<agenthub.action>` — only for `official` (level no lower than `confirm`, `arg="name:^pattern$"`);
     every permission has a "— why" explanation;
   - a trial run on a synthetic HOME (`fixtures/home`), environment as in the daemon, 5 s timeout; the output
     cannot offer an effect that is not in the metadata;
   - the plugin's tests `test/*.test.mjs`;
   - changing files of the plugin archive (everything except `test/`, `fixtures/` and dot files) without a new
     `version` is an error: the `<id>-<version>.tar.gz` archive of a published version is never overwritten;
   - the permissions diff against the base goes to the job summary. The `permissions` label (second reviewer) is set
     by `perms-label.yml`: it runs on every PR via `pull_request_target` (its version and scripts come from `main`,
     not from the PR, and it does not depend on the PR's `ci.yml`: renaming or editing ci in a PR does not bypass the
     label) and computes permission growth itself with `main`'s scripts over the PR files as data — PR code is not
     executed there; it does not trust artifacts of the PR run. Changes to `.github/`, `scripts/`, `official.json`,
     `blocklist.json`, `CODEOWNERS` also get the label.
3. After a merge into `main`, the `sign` job (environment `registry-signing`) builds `index.json` with the sha256 of
   the archives and each plugin's `tier` (`official` — from `official.json`, otherwise `community`), signs it
   (minisign/Ed25519) and publishes it. The daemon takes a plugin's tier only from here (via `plugins.lock`), not from
   the metadata. Publications run one at a time and are not cancelled (cancelling mid-upload would leave a new
   `index.json` with an old signature): archives first, then `index.json.minisig` and `index.json`, then the published
   pair is compared with the built one. A version already published with a different archive sha256 fails the build
   (`build-index.mjs --published`).
4. The manager in the daemon (`agent-hub/daemon/lib/plugins.mjs`) verifies the signature with the public key from the
   config, installs an archive only if its sha256 matches, shows the permissions window with the "why", writes the
   agreed permissions to `plugins.lock` and asks again when an update grows the permissions. `blocklist.json` goes into
   the signed index and force-disables a plugin.

## For authors

```sh
scripts/check.sh --only my-plugin            # check your plugin
scripts/check.sh --base origin/main          # as in CI, with the permissions diff
node scripts/build-index.mjs --out /tmp/idx  # see what goes into the index (unsigned)
```

Requires Node ≥ 22. Start with the plugin author guide
[`docs/contract/writing-plugins.md`](docs/contract/writing-plugins.md); registry rules —
[CONTRIBUTING.md](CONTRIBUTING.md). Output language comes from `AGENTHUB_LANG=ru|en` (the hub passes it to the plugin;
a plugin without a translation is shown as is); metadata translations are tags with `lang="en"`.

## Core vendoring and the contract copy

CI cannot see the `agent-hub` repo, so the daemon modules are kept as byte-for-byte copies in `scripts/vendor/`
(`meta.mjs`, `output.mjs`, `registry/minisign.mjs`, `registry/tarball.mjs`, `registry/perms.mjs` + a
`native.mjs` stub), and the plugin contract as a copy of the documentation in
[`docs/contract/`](docs/contract/README.md) (`README.md`, the plugin author guide `writing-plugins.md`,
`extension-points.md` in full, and the sections a plugin author needs from `push.md`, `plugins-registry.md`, `api.md`,
with a "copy, contract vN, do not edit" header). Update only via `node scripts/sync-vendor.mjs [--from ../agent-hub]`;
`check.sh` (and CI) compares the copies with `scripts/vendor/VENDOR.json`, and if `agent-hub` is next to it, also with
the source (`node scripts/sync-vendor.mjs --check`).

## Tests of the repo itself

```sh
env -u NODE_OPTIONS node --test 'test/*.test.mjs'
```

Signing keys in the tests are generated in a temporary directory and deleted.

## License

[MIT](LICENSE).
