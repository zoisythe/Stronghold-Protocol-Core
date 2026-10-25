# Stronghold Protocol headless core

基于 [Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol) **v0.3.3**
（`f07b8965`）的无界面训练核心。保留完整原版玩法、单人/1–4 人合作、四个自选槽位和
Symbolic AI 教师；移除网页、联网、素材与插件设施。Python 通过常驻 Node.js 进程调用，
支持批量环境、可重放配置和课程扰动。

保留上游四个玩法版本，默认第二期下半。历史版本可用
`Env(version="act1autochess")` 或 `BatchEnv(..., version="act2autochess@V2_1")`
选择；每个会话固定版本并隔离模块缓存，第一期单人默认遵循原版计时。

需要 Node.js >=22、Python >=3.11；Python 使用 `uv`，Node 工具保持现有 npm 配置。

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
        state = env.step(seat, env.teacher_action(seat))
        if "error" in state:
            raise RuntimeError(state["error"])
```

[API、配置和批量调用](docs/CORE_API.md) · [核心边界与同步流程](docs/CORE.md)

`observe` 只含玩家可见信息；私有回放信息由 `debug_state` 单独返回。奖励和张量编码由
训练器计算。wheel 包含 JS 和玩法数据，Node.js 需单独安装。

```powershell
node tools/golden.mjs
uv run python python/tests/integration.py
```

验收使用上游 0.3.3 的 288 个黄金场景及现有 Python 集成。黄金 JSON 直接来自上游，
不可由 core 重生成。数据使用 `node tools/core-import.mjs [revision]` 导入，默认使用
`data/core-manifest.json` 的固定提交，并记录源文件/输出 SHA-256。

`core` 是精简分支；完整上游固定在被忽略的 `.worktrees/master`（`master` 分支）。
其中 `docs/` 保留规则、设计与历史资料。重新建立参考：

```powershell
git fetch upstream --tags
git worktree add .worktrees/master master
```

项目代码采用 GPL-3.0-or-later，游戏数据保留原权利，不含美术素材，不得商业化。
详见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md)、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
