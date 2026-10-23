# Headless gameplay core

`core` tracks the official gameplay of upstream v0.3.1 at
`b3deebdae4a92642c007d217a1a4573e5d3612c5`. The ignored `.worktrees/master`
checkout retains that complete upstream release, including rules and history.

Keep the existing deterministic 30 Hz simulation, complete solo/1–4 player
cooperative rules, shops, economy, inventory, choices, strategies, bonds, Unite,
shared boss pools, stand-ins, four DIY slots and the symbolic AI's real battle
rehearsals. HTTP/WebSocket, browser combat/AI delegation, UI, art/audio,
trainer presentation beyond the retained English localization overlay, plugin authoring/loading/DSL and distribution tools are outside
the training core. DIY selections of built-in operators remain supported.

`server/sim/` runs combat; `server/match/` owns rounds and player state.
`server/training/` advances virtual time to decision boundaries and serves UTF-8
JSON Lines through fixed workers. `python/stronghold_core/` owns process lifecycle,
ordered batches and curriculum. Rewards and tensor encodings belong to trainers.

Player observations exclude private teammate state. Queries and rejected actions
must preserve gameplay, random streams and time. Teacher advice runs in an isolated
shadow match. Simulation/content errors are errors, never synthetic outcomes.
Setup perturbation uses its own seeded stream and records resolved setup for replay.

Training may explicitly set `solo_timed: true` to use the same difficulty's
multiplayer phase timers and round-by-round preparation limits for solo play.
This opt-in is contained in the training adapter; ordinary gameplay timers,
solo content and default untimed solo behavior remain unchanged.

Generated gameplay tables are imported with `node tools/core-import.mjs`; the
manifest records the source commit and source/output SHA-256. Text used by rules
is retained; art and presentation settlement tables are removed.

For an upstream upgrade, pin the release in `master` and its reference checkout,
apply changes to retained gameplay paths, trim new peripheral dependencies,
reimport data, and copy that release's golden JSON unchanged. Run the upstream
golden corpus and the compact Python integration on Windows and WSL. Do not
regenerate expectations from core. Keep temporary build/test artifacts ignored
and clean the WSL copy after validation.

Public configuration and examples: [CORE_API.md](CORE_API.md).

AlphaSP owns ModernBERT training acceptance and model dependencies. See the neighboring project's docs/VALIDATION.md; gameplay acceptance remains independent of model training.

The data importer also retains the pinned English data/UI overlays and pure overlay helper for read-only trainer views. The simulator itself does not translate rule data. Optional teacher_incremental_shadow keeps a detached replay mirror, checkpoints its planning, and preserves the original seed/revision advice semantics.
