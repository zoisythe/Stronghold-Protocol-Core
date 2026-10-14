# Headless Node.js training core

Baseline: `488db49f11daf862b67ce26fa4cf89aa6cba2466` (0.2.6). Work takes place on
`core`; the baseline remains available from Git without a reference worktree.

Keep the existing simulation and complete solo/1–4 seat cooperative gameplay:
content, shops, economy, inventories, setup/loadouts, stand-ins, four DIY slots,
choices, strategies, bonds, Unite, boss pairing and shared pools. Remove HTTP,
WebSocket, browser authority, rooms, UI, rendering, audio, spectators, emotes,
localisation packs, asset pipelines and installation/update packaging.

Use the existing 30 Hz simulation, deterministic arithmetic and independent
seeded streams. Presentation waits disappear; gameplay deadlines remain virtual.
Advance automatic phases to a decision boundary. Invalid actions leave gameplay,
random streams and clocks unchanged. Engine/content failures are errors, never
synthetic match results. Observations contain player-visible information only.

Python owns a persistent Node.js process and communicates over UTF-8 JSON Lines.
Only protocol replies enter stdout. A fixed worker pool owns environments; an
environment never migrates between workers. Python computes future rewards and
tensor encodings outside this core.

The optional original symbolic teacher plans in an isolated shadow environment.
Advice executes through the model action interface. A changed state invalidates
advice. Preserve its real battle rehearsals, with a configurable count.

Setup defaults to all-owned/default loadouts/empty DIY slots. A separate seeded
stream probabilistically samples legal ownership, skills and DIY selections;
modules/potential/cultivation retain the baseline. Record resolved setup for
replay. Strategies support model (default), fixed and random selection, plus up
to three pre-selection bans with a nonempty candidate set. Episode-based Python
curriculum helpers independently decay perturbation and teacher probabilities.

Generated gameplay data retains source revision and SHA-256 provenance. Keep
text used by rule predicates; never hand-edit generated tables. No game art is
included. Original rules and GPL/source notices remain authoritative.

## Verification

Use the existing 287 golden scenarios (including whole-match bot runs) and the
compact Python integration for actions, advice, setup/curriculum, single/batch
parity and process cleanup. Original golden JSON remains immutable; compare
gameplay fields exactly, excluding documented presentation metadata. Run only
checks relevant to changed behavior and clean temporary WSL project contents.

Public API: [CORE_API.md](CORE_API.md).
