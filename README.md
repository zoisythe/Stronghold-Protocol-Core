# Stronghold Protocol headless core

A non-commercial GPL-3.0-or-later fan implementation of Arknights 卫戍协议：盟约,
extracted from the original Node.js game at commit
`488db49f11daf862b67ce26fa4cf89aa6cba2466` (0.2.6).

Complete battle/content and solo/1–4 seat cooperative rules run without a browser
or HTTP server. Python uses a persistent Node.js process. The optional original
symbolic teacher retains its planner and real battle rehearsals.

Requires Node.js >=22 and Python >=3.11; use `uv` for Python tooling.

```powershell
uv sync
uv run python python/examples/play.py
```

```python
from stronghold_core import Env

with Env() as env:
    state = env.reset(3, {"difficulty": "FUNNY"})
    while not state["terminated"]:
        seat = state["decision_seats"][0]
        action = env.teacher_action(seat)  # Or a model action.
        state = env.step(seat, action)
        if "error" in state:
            raise RuntimeError(state["error"])
```

`observe` returns player-visible structured state. `legal_actions` returns
concrete gameplay intents. `step` returns observations, decision seats,
termination and gameplay metrics; rewards/tensors belong to the trainer.
`debug_state` is separate and contains private replay information.
`BatchEnv` supports ordered batches over configurable workers.

Python wheels bundle the JavaScript runtime and gameplay data; Node.js is installed
separately. `uv sync` installs the editable package from this checkout.

Read [docs/CORE.md](docs/CORE.md), [docs/CORE_API.md](docs/CORE_API.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Gameplay rules and source evidence
remain in [docs/DESIGN.md](docs/DESIGN.md), [docs/SIM.md](docs/SIM.md),
[docs/META.md](docs/META.md) and [docs/research/](docs/research/).

```powershell
npm run golden
uv run python python/tests/integration.py
```

Original golden JSON remains immutable; only documented removed presentation
fields are projected out. Gameplay comparisons are exact. No browser/assets or
frontend dependencies are required.

Import data using `node tools/core-import.mjs <revision> [output_directory]`.
The generated manifest records source/output SHA-256 and transformation version.
Generated tables are never edited by hand.

Original project: [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol).
See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). No monetisation or game art.
