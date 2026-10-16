# Core development

Read [CORE.md](docs/CORE.md) and [CORE_API.md](docs/CORE_API.md). Work on `core`;
keep `.worktrees/master` unmodified as the pinned upstream reference, including
its full rules and design documents. Use the existing npm setup and `uv`.

Implement first; validate relevant changes with the upstream golden corpus and
one compact Python integration. Golden JSON must match the pinned release byte
for byte; never regenerate it from core. Import gameplay tables with
`tools/core-import.mjs` and retain provenance. Preserve deterministic 30 Hz
combat, player observation boundaries, explicit errors and source/license notices.
Commit runnable checkpoints with one-line topic messages and no attribution trailers.
