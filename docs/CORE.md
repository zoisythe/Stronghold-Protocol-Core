# Headless gameplay core

`core` tracks the official gameplay of upstream v0.3.0 at
`c24e17eec3af1e6dedfa9935a6d15245cf2f4586`. The ignored `.worktrees/master`
checkout retains that complete upstream release, including rules and history.

Keep the existing deterministic 30 Hz simulation, complete solo/1–4 player
cooperative rules, shops, economy, inventory, choices, strategies, bonds, Unite,
shared boss pools, stand-ins, four DIY slots and the symbolic AI's real battle
rehearsals. HTTP/WebSocket, browser combat/AI delegation, UI, art/audio,
localisation packs, plugin authoring/loading/DSL and distribution tools are outside
the training core. DIY selections of built-in operators remain supported.

`server/sim/` runs combat; `server/match/` owns rounds and player state.
`server/training/` advances virtual time to decision boundaries and serves UTF-8
JSON Lines through fixed workers. `python/stronghold_core/` owns process lifecycle,
ordered batches and curriculum. Rewards and tensor encodings belong to trainers.

Player observations exclude private teammate state. Queries and rejected actions
must preserve gameplay, random streams and time. Teacher advice runs in an isolated
shadow match. Simulation/content errors are errors, never synthetic outcomes.
Setup perturbation uses its own seeded stream and records resolved setup for replay.

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
