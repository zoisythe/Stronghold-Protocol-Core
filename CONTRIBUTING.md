# Core development

Read [docs/CORE.md](docs/CORE.md), [docs/CORE_API.md](docs/CORE_API.md) and the
gameplay reference for the subsystem. Preserve original gameplay and data
provenance. Work on `core`; baseline `master` remains available in Git.

Use Node.js/npm as configured and `uv` for Python. Implement first, then run only
verification relevant to the risk. Final acceptance consists of `npm run golden`
and `uv run python python/tests/integration.py`. No browser suite or duplicate
component/whole-match matrix. Keep original golden JSON immutable.

Keep 30 Hz combat, deterministic math, ordering, random streams and full content.
Errors are explicit, never invented match results. Regenerate gameplay tables
with `tools/core-import.mjs` instead of hand editing them.

Commit runnable checkpoints with one-line topic messages and no attribution
trailers. Retain source/license notices; never commit game art or monetisation.
