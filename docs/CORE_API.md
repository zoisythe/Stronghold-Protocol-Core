# Training API

Node.js and Python expose `reset(seed, config)`, `observe(seat)`,
`legal_actions(seat)`, `step(seat, action, elapsed_ms=0)`,
`teacher_action(seat)`, `debug_state()` and `close()`. `BatchEnv` offers ordered
batch reset/observe/actions/step/teacher calls with configurable workers.

Actions use the existing gameplay intent shapes (`t: 'g.buy'`, etc.); transport
and presentation messages are not actions. `g.wait` advances explicit virtual
time. Accepted steps return an observation, `decision_seats`, `terminated` and
gameplay metrics; they do not calculate a reward. Invalid actions return an
explicit error without advancing the environment. The observation is seat-local;
debug state is an explicitly separate replay/diagnostic interface.

Configuration selects solo/coop, difficulty, 1–4 seats, externally controlled
seats, bot rehearsal count, per-seat baseline setup and perturbation probability,
and strategy selection mode/bans. Actual resolved setup and seed accompany reset.
Baseline modules, potential and cultivation are retained during perturbation.

Python provides `Env` and `BatchEnv` context managers. Normal close shuts down
workers and the child process; unexpected exit, timeout and protocol mismatch
raise explicit exceptions. Never silently reset a failed environment. The
standard-output stream is reserved for numbered JSON Lines responses; stderr is
continuously drained for diagnostics. Launch with argument arrays, not a shell.

Curriculum uses training-global episode counts, independently configurable
linear probability decay intervals and strategy stage switches. Applying advice
is the trainer's decision. Record action source (`model`, `teacher`, `timeout`).

## Python use

```python
from stronghold_core import Env, BatchEnv, Curriculum, LinearDecay

with Env() as env:
    state = env.reset(3, {"difficulty": "FUNNY", "bot_rehearsal": 3})
    while not state["terminated"]:
        seat = state["decision_seats"][0]
        action = {**env.teacher_action(seat), "source": "teacher"}
        state = env.step(seat, action)
        if "error" in state:
            raise RuntimeError(state["error"])

with BatchEnv(2, workers=2) as batch:
    states = batch.reset([7, 19], {"strategy": {"mode": "model"}})
    advice = batch.teacher_action()
    states = batch.step([0, 0], advice)
```

`Env(node="node", root=None, timeout=120)` finds the bundled wheel runtime or
the editable checkout. `root` explicitly selects another checkout. Node.js must
be installed separately. Config can be a dictionary or a UTF-8 JSON file path.
`BatchEnv(count, workers=1, ...)` returns lists in environment order; `configs`
may be one shared config or a list. Terminal environments are not automatically
reset. A request timeout makes its entire session unavailable; construct a new
session explicitly after diagnosing the failure.

## Configuration defaults

| Key | Default / supported values |
|---|---|
| `mode`, `difficulty` | `solo`, `NORMAL`; `coop` and `FUNNY/NORMAL/HARD/ABYSS` supported |
| `players` | 1 for solo, 2 for coop; 1–4, solo requires 1 |
| `controlled_seats` | `[0]`; other seats use the original bot; `[]` runs all bots |
| `bot_rehearsal` | 3, configurable 0–8 |
| `setup` / `setups` | shared baseline / per-seat baselines; absent entries use defaults |
| `perturbation_probability` | 0; probability in [0,1] |
| `strategy` | `{ "mode": "model" }`; mode `fixed/random/model`, optional `fixed` id, `bans` ids and `ban_count` 0–3 |
| `ai_picks_last` | false; retains the original co-op draft option |

Each baseline uses `loadout: {baseChessId: {skill, module}}`,
`ops: {charId: {potential, cultivate}}`, `notOwned: [baseChessId]` and
`diy: {slotId: {charId, skillIndex, uniEquipId}}`. Defaults are all-owned,
default skills/modules, potential 6, cultivate 3 and empty DIY slots. Perturbation
retains baseline modules/potential/cultivation and locked prototype choices.
Seed 0 is normalised to 1, matching the existing Match implementation.

`g.wait` accepts `elapsed_ms` in its action dictionary; an explicit nonzero
`step(..., elapsed_ms)` overrides it. Other accepted actions apply their optional
elapsed time after the action, before returning the next decision. Queries never
advance time. `source` is optional action metadata (`model`, `teacher`, `timeout`);
normal actions default to model and explicit waiting defaults to timeout.

Observers receive their own hand, funds, shop, choices and setup; teammates expose
public boards, equipment, LP, level, strategy and public bond strips, never hand
or funds. Deploy tiles and the enemy preview accompany the observation.
`debug_state` contains private inventory, random streams and accepted-action
history. It is for diagnostics/replay, not a model input.

```python
curriculum = Curriculum(
    perturbation=LinearDecay(1.0, 0.0, 0, 100_000),
    teacher=LinearDecay(1.0, 0.1, 20_000, 100_000),
    strategy_stages=((0, "fixed"), (30_000, "random"), (80_000, "model")),
)
config = curriculum.config(global_episode, {"strategy": {"fixed": "band_amedic"}})
p_teacher = curriculum.teacher_probability(global_episode)
```

The trainer samples whether to execute advice. The core does not replace model
actions automatically. The teacher keeps a cached planned action sequence while
the trainer follows it; an intervening action/time advance invalidates it. A new
plan replays history in a shadow match, so teacher cost grows with episode history
and is measured separately from simulation/IPC cost.

Acceptance: `uv run python python/tests/integration.py`. All original gameplay
goldens: `node tools/golden.mjs` (no browser or npm dependencies needed).
