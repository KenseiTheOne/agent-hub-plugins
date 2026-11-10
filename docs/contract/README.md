<!-- Copy from agent-hub, contract v3. Don't edit: node scripts/sync-vendor.mjs writes this file, --check catches drift. -->
# Agent Hub plugin contract (copy, contract v3)

What the hub core understands in a plugin — a copy of the agent-hub documentation for registry plugin authors. Read it
here, not in the hub repository. Don't edit these files by hand: `node scripts/sync-vendor.mjs` writes them.

| File | What |
|---|---|
| [writing-plugins.md](writing-plugins.md) | a practical guide: how to make, test and ship a plugin — start here |
| [extension-points.md](extension-points.md) | the plugin contract: file name, metadata, output, actions, environment, contract versions |
| [push.md](push.md) | push rules (<agenthub.push>), kinds and a plugin's own switch, carrying over contract 1 settings |
| [plugins-registry.md](plugins-registry.md) | tiers and permissions, own plugins from a folder, "Requires …", what the registry needs |
| [api.md](api.md) | running an action and its result (reason=, message=), connections and MCP calls through the hub, the hub terminal |

A plugin's contract version is the `<agenthub.contract>N</agenthub.contract>` tag ("Contract versions" in
extension-points.md): declare the one whose capabilities you use; a hub of version 2 or newer with an older contract
shows "Requires a newer hub". Contract 1 hubs don't know the tag and install the plugin silently — publish such a
plugin only after the hub is updated (same section, rollout order).
