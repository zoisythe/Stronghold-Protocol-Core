# Upstream gameplay regression corpus

All JSON files are copied byte for byte from upstream v0.3.3
`f07b8965061bbc311ad7aa815879b09264a1e47d`: 49 roster, 46 bonds, 22 fields,
21 matches, 10 stand-ins and 140 DIY scenarios (288 total).

The three historical corpora are under their version slugs. Select one with
`node tools/golden.mjs --version act1autochess` (also `act1autochess@V1_1` and
`act2autochess@V2_1`). Query scenario counts with `--list`; all expectations
remain upstream bytes.

Run `node tools/golden.mjs`. Preserve scenario generation, seeds, snapshot hash
chains, hooks, digest precision and whole-match AI runs. Do not regenerate the
expectations from core; refresh only from a pinned upstream release.

The comparator removes only match presentation metadata: `combat`,
`end.virtualMs`, and result players' `title`, `trophies`, `reward`.
All remaining gameplay fields compare exactly at the upstream digest precision.
Training disables event recording; the corpus retains diagnostic events.
