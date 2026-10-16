# Core changes

## 0.3.0

- Sync official gameplay and AI from upstream v0.3.0 (`c24e17ee`): combat targeting,
  enemy passengers, deferred inventory/rewards, shared item debt, co-op DIY stock,
  bond activation payouts and isolated battle rehearsals.
- Keep headless Node/Python interfaces; omit browser delegation and plugin
  authoring/loading. Reuse only the numeric/data helpers official gameplay needs.
- Import 15 gameplay tables with SHA-256 provenance; use upstream's 288 immutable
  golden scenarios. Keep the full release in ignored `.worktrees/master`.
- Consolidate core docs into README, CORE and CORE_API. Full upstream history and
  gameplay references remain in the reference checkout.

## 0.2.6 extraction

- Extract full deterministic gameplay and symbolic teacher into a headless core.
- Add Python Env/BatchEnv, JSON Lines workers, replayable setup and curriculum.
