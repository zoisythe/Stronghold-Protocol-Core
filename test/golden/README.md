# Upstream gameplay regression corpus

The six JSON files are copied byte for byte from upstream v0.3.1
`b3deebdae4a92642c007d217a1a4573e5d3612c5`: 49 roster, 46 bonds, 22 fields,
21 matches, 10 stand-ins and 140 DIY scenarios (288 total).

Run `node tools/golden.mjs`. Preserve scenario generation, seeds, snapshot hash
chains, hooks, digest precision and whole-match AI runs. Do not regenerate the
expectations from core; refresh only from a pinned upstream release.

The comparator removes only match presentation metadata: `combat`,
`end.virtualMs`, and result players' `title`, `trophies`, `reward`.
All remaining gameplay fields compare exactly at the upstream digest precision.
Training disables event recording; the corpus retains diagnostic events.
