# Headless gameplay core

`core` tracks the official gameplay of upstream v0.3.3 at
`f07b8965061bbc311ad7aa815879b09264a1e47d`. The ignored `.worktrees/master`
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

The four official gameplay versions are retained, including historical operator
kits and rules. The default is `act2autochess` (second period, lower half).
Historical tables live under `data/versions/` and use the same asset/settlement
trimming and source hashes. Python sessions select `version` at construction;
workers initialize that version's data before importing gameplay modules, so
module caches cannot mix operator identities between versions. Local built-in
bot policies are retained; external AI services, browser rehearsal delegation,
network simulation pools and room/version voting remain outside core.

Local v0.3.3 acceptance (2026-10-25): all four upstream corpora pass on Windows
(Node 24.22.1) and WSL (Node 26.12.1): 288 default, 269 second-period upper,
220 first-period lower and 218 first-period upper scenarios, 995 per platform.
All 24 golden Git blobs equal the release, and all 63 manifest source/output
hash pairs verify. The compact Python integration passes on Windows (3.15.1)
and WSL (3.13.17), including a complete 155-action teacher match and historical
single/batch isolation. Timed-solo replay, wheel build/content checks and ESLint
(0 errors, 38 warnings) pass. The WSL copy is cleaned after acceptance, retaining
the empty `/home/zoisythe/.cache/stronghold-core-integration` directory.

Public configuration and examples: [CORE_API.md](CORE_API.md).

AlphaSP owns ModernBERT training acceptance and model dependencies. See the neighboring project's docs/VALIDATION.md; gameplay acceptance remains independent of model training.

The data importer also retains the pinned English data/UI overlays and pure overlay helper for read-only trainer views. The simulator itself does not translate rule data. Optional teacher_incremental_shadow keeps a detached replay mirror, checkpoints its planning, and preserves the original seed/revision advice semantics.
