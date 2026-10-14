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

Implementation examples and the compact integration command will be documented
here as runnable checkpoints land.
