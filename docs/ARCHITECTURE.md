# Headless core architecture

`server/sim/` retains the original 30 Hz deterministic battle and full content.
`server/match/` retains players, inventory, economy, choices, rounds, Unite and
shared boss pools. `shared/` retains loadout, potential, DIY/stand-in composition,
geometry and gameplay validation. Optional simulator rendering events remain
for immutable golden diagnostics; training disables their recording.

`server/training/Env.js` owns a Match/VirtualScheduler, resolved configuration,
decision boundaries, transactions, observations, action history and optional
shadow teacher. The bridge routes numbered JSON Lines requests to fixed workers.
Each worker reuses immutable data and owns independent environments; requests
within a worker execute in order.

`python/stronghold_core/` owns subprocess lifecycle, Env, BatchEnv and episode
curriculum helpers. Reader threads drain both pipes; only replies use stdout.
No HTTP service or native extension is required.

Generated data includes `core-manifest.json`. Import from a pinned commit with
`tools/core-import.mjs`, preserving rule text and dropping art metadata and
presentation-only settlement tables.

Validation reuses original goldens and one Python integration script. Historical
rule/source documents describe the original game; browser/server references
there are historical context, not current runtime modules.

Contracts: [CORE.md](CORE.md), [CORE_API.md](CORE_API.md).
