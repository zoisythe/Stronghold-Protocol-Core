# Core extraction acceptance — 2026-10-14

Baseline: master `488db49f11daf862b67ce26fa4cf89aa6cba2466`, game 0.2.6.
Implementation checkpoint: `888e5235` on `core`. Python interface version 0.1.0.
The packaging/documentation follow-up retains the same gameplay runtime.

## Verified

Windows Node.js 24.21.0 / Python 3.15.0:

```
golden roster: 49 scenarios match
golden bonds: 46 scenarios match
golden fields: 22 scenarios match
golden matches: 20 scenarios match
golden standins: 10 scenarios match
golden diy: 140 scenarios match
ok · 65781 ms (jobs 4)
```

The original golden JSON is byte-for-byte unchanged in Git. Comparison excludes
only removed match metadata: combat transport label, presentation duration,
titles, trophies and reward display. The remaining original digests, including
battle snapshot chains and RNG draw counts, compare exactly. Existing 20 matches
cover original Symbolic AI, cooperation, Unite, boss/hidden-core and setup paths.
No new large reference corpus was generated.

The compact Python integration completed a teacher-driven solo victory in 174
actions with three layout rehearsals configured. It also passed invalid-action
and query atomicity, advice override/replanning, perturbed setup replay, four DIY
slots, three strategy bans, episode curriculum transitions, two-environment
single/batch equality, a multiplayer virtual deadline, observation boundaries,
normal process cleanup and explicit reporting of unexpected process exit.

WSL Arch Linux Node.js 26.11.1 / Python 3.14.8 installed the standalone wheel and
passed the same integration script, including the same 174-action victory.
Windows final integration took 5.38 s; WSL took 5.57 s. These are representative
single runs, not statistical performance results. After validation the WSL
project directory `/home/zoisythe/Projects/Stronghold-Protocol-Core` was emptied.

Static ESLint completed with zero errors (43 warnings, mostly inherited).
All 15 generated gameplay table hashes matched their manifest. The standalone
wheel contains the JavaScript runtime/data/notices and excludes frontend assets,
test/example namespace packages, emotes and title-only tuning data. Wheel size:
2,308,011 bytes; SHA-256:
`b1705e2c9a4e68a2cbc8ac1930f93e9da68750d301c22a6067a288a8756e0e71`.

## Representative performance

Same Windows host, Node.js 24.21.0, original `roster-001` inputs: one warmup and
five measured runs, with rendering events, snapshot hashing and diagnostic hook
counting disabled equally on both implementations.

| Measurement | Original | Core |
|---|---:|---:|
| Median battle time | 34.621 ms | 34.848 ms |
| Battle ticks / kills / RNG draws | 2700 / 26 / 50 | 2700 / 26 / 50 |
| Node RSS after measurement | 152.21 MiB | 149.49 MiB |

The 0.66% timing difference does not establish a performance regression or gain;
the same retained simulator is approximately unchanged on this sample.

Persistent Python bridge measurements use a fixed-strategy FUNNY first prep:

| Measurement | Result |
|---|---:|
| Mean observe roundtrip, 100 requests | 0.842 ms |
| Single-environment steps, 100 freeze toggles | 1,058 steps/s |
| Two workers, 200 freeze toggles in batches | 1,799 steps/s |
| Fresh teacher plan after 100 actions, three rehearsals | 127.325 ms |
| Single-worker Node RSS | 160.55 MiB |
| Two-worker Node RSS | 235.72 MiB |

These step rates measure preparation actions and transport, not battles or whole
training episodes. Teacher reconstruction/rehearsal costs are separate; new
plans replay episode history and become more expensive later in an episode.

The original tracked checkout contained 1,412 files / 54,560,246 bytes. The core
implementation checkpoint contained 456 files / 20,029,428 bytes (63.29% smaller,
excluding Git, caches, dependencies and build artifacts). Follow-up documentation
adds a small amount. There are zero Node runtime dependencies; only the existing
ESLint development dependencies remain.

## Boundaries

No model, reward function, tensor encoding or optimiser has been implemented.
No browser/UI suite or duplicate component matrix was run. Remote GitHub CI and
Node.js 22 were not executed in this session. Package integration was tested on
Windows/editable and WSL/wheel; no deployment or release publication occurred.
The checks establish parity for the retained original corpus and the documented
interface scenarios, not every possible future action/configuration combination.
