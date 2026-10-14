# Immutable gameplay regression corpus

These original JSON expectations come from the 0.2.6 baseline at
`488db49f11daf862b67ce26fa4cf89aa6cba2466`. Core extraction never changes them.

| Family | Scenarios |
|---|---:|
| roster | 49 |
| bonds | 46 |
| fields | 22 |
| matches | 20 |
| standins | 10 |
| diy | 140 |
| total | 287 |

Run `node tools/golden.mjs` (or `npm run golden`). The original scenario
generators, seeds, battle snapshot chains, hook counts, numerical digest precision
and whole-match Symbolic AI runs are retained. No browser, npm dependencies,
original unit-test helpers or separate end-to-end matrix is required.

The headless comparator projects only removed match presentation metadata:
`combat`, `end.virtualMs`, and each result player's `title`, `trophies`, `reward`.
All remaining digest fields compare exactly at the original digest precision;
no numerical tolerance was added. Battle event/snapshot/hook diagnostics remain
available in the golden runner although training disables event recording.

A mismatch is investigated, not repaired by regenerating expectations from the
new implementation. Rule/source references remain in `docs/`. The core extraction
passed all 287 scenarios and the compact Python integration on Windows and WSL;
subsequent changes run only checks relevant to their risk.
