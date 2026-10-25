# Headless core development

Read `docs/CORE.md` and `docs/CORE_API.md`. Full upstream rules and source evidence
are available in `.worktrees/master/docs/` at the pinned upstream release.

- Work on `core`; upstream baseline is v0.3.3 `f07b8965`. Keep one ignored
  `.worktrees/master` on `master` as an unmodified upstream reference.
- Reuse existing Node.js logic and paths; npm as configured, `uv` for Python.
- Preserve full solo/cooperative gameplay, deterministic math, ordering and
  30 Hz combat. No generic substitutes or fake match results.
- Implement first. Retain original golden acceptance and one compact Python
  integration run; repeat only after relevant changes or failures.
- All JSON under `test/golden/` must match the pinned upstream release byte for byte;
  replace only from that release when upgrading, never regenerate from core.
  Never hand-edit generated tables; use `node tools/core-import.mjs` and retain provenance.
- Player observations are separate from private debug state. Legality/advice
  queries never change gameplay, random streams or virtual time.
- Keep source/license notices; no game art/monetisation. Commit runnable
  checkpoints with one-line topic messages and no attribution trailers.
- Reuse Python integration in WSL, then clean temporary project contents while
  retaining the empty project directory.
