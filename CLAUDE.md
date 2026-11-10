# agent-hub-plugins — rules for the plugins session

This is the public registry of official Agent Hub plugins. A session here works **only on plugins**.

- **Read the plugin contract here, in `docs/contract/`**, not in the hub repository: it is a copy of the agent-hub
  documentation (`README.md`; `writing-plugins.md` — the plugin author guide; `extension-points.md` in full — metadata,
  output, actions, environment, contract versions; `push.md`, `plugins-registry.md`, `api.md` — the sections a plugin
  needs). The copy is written only by `node scripts/sync-vendor.mjs` (together with `scripts/vendor/`); `--check` and
  CI catch drift; do not edit by hand. The contract version is in the copy's header and in
  `scripts/vendor/VENDOR.json`; a plugin declares the version it needs with the tag
  `<agenthub.contract>N</agenthub.contract>`.
- **Do not touch the hub.** Open the hub repository `~/Projects/IT/agent-hub` only when you need a capability that
  `docs/contract/` does not have (a new output key, primitive, permission, connection): do not work around or edit the
  core from here; write down what is needed (what, why, what format) and hand it to the hub session. The hub does not
  know plugin names: everything plugin-specific (icon, notification toggle, connection, refusal texts) the plugin
  declares itself. A plugin that uses a new capability is published only after a hub release with it (and an update of
  the live hub) and declares the new contract version: a hub of version 2 or newer with an older contract shows "Newer
  hub required"; contract 1 hubs do not know the tag and install the plugin silently, losing the new tags. After a hub
  release — `node scripts/sync-vendor.mjs`.
- **Plugins are independent of each other.** Each has its own `plugins/<id>/` folder, version, tests, permissions.
  Editing one does not touch the others; there is no shared code between plugins (only core vendoring in
  `scripts/vendor/`, via `scripts/sync-vendor.mjs`, not by hand).
- **Any change to a plugin's files = a new version** (`check.sh --base HEAD` checks this). Permission growth means a
  consent window for the user on update; explain in the plugin's README why each permission is needed.
- **No private tools here.** A plugin that needs the author's private tool lives in that tool's repository
  (`agenthub/<id>/`) and is installed from a local folder. A plugin that needs a third-party program declares the
  dependency ("requires …") in its metadata.
- **Checks before a commit:** `bash scripts/check.sh`, `bash scripts/check.sh --base HEAD`,
  `env -u NODE_OPTIONS node --test plugins/*/test/*.test.mjs test/*.test.mjs`, `node scripts/sync-vendor.mjs --check`.
- Commit and push only on an explicit command; a push to main publishes the signed catalog (CI).
