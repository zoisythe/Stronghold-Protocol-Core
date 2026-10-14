# Headless core development

Read `docs/CORE.md` and `docs/CORE_API.md`, then relevant gameplay rules and source
evidence in `docs/DESIGN.md`, `docs/SIM.md`, `docs/META.md` and research documents.
The accepted core plan supersedes historical web instructions.

- Work on `core`; reference baseline is master `488db49f`. No reference worktree.
- Reuse existing Node.js logic and paths; npm as configured, `uv` for Python.
- Preserve full solo/cooperative gameplay, deterministic math, ordering and
  30 Hz combat. No generic substitutes or fake match results.
- Implement first. Retain original golden acceptance and one compact Python
  integration run; repeat only after relevant changes or failures.
- Original `test/golden/*.json` is immutable. Never hand-edit generated tables;
  use `node tools/core-import.mjs` and retain provenance.
- Player observations are separate from private debug state. Legality/advice
  queries never change gameplay, random streams or virtual time.
- Keep source/license notices; no game art/monetisation. Commit runnable
  checkpoints with one-line topic messages and no attribution trailers.
- Reuse Python integration in WSL, then clean temporary project contents while
  retaining the empty project directory.
