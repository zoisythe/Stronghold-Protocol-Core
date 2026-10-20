# Core changes

## 0.3.1

- Sync v0.3.1 (`b3deebda`): Cathy grants one mutation cell per match,
  Unite runtime children do not add LP loss, Swire S3 stays open, and placement /
  attack-range flags survive record composition. Keep plugin and presentation
  extensions outside core.
- Reimport official tables and copy all 288 golden expectations unchanged from
  the release. Add optional bounded AlphaSP PPO update/checkpoint acceptance.

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
