"""Optional real AlphaSP PPO acceptance: 8 decisions, two updates and one resume.

Run with AlphaSP's prepared uv environment. No mock model/game, full teacher
dataset, or long training job. Artifacts live in a temporary directory.
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path
from time import perf_counter
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alphasp-root", type=Path, default=Path(__file__).resolve().parents[3] / "AlphaSP")
    parser.add_argument("--device", choices=("cpu", "cuda", "npu"), default="cpu")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    alpha = args.alphasp_root.resolve()
    sys.path.insert(0, str(alpha / "src"))
    # Always test this checkout, even if the caller has an older installed wheel.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    import torch
    from stronghold_core import Env

    from alphasp.checkpoint import read_checkpoint
    from alphasp.config import load_config
    from alphasp.knowledge import build_knowledge
    from alphasp.training import train

    torch.set_num_threads(min(8, torch.get_num_threads()))
    started = perf_counter()
    config = load_config(alpha / "configs" / "bert_base.json")
    config.core.root = str(Path(__file__).resolve().parents[2])
    config.environment.num_envs = 1
    config.environment.max_episode_steps = 8
    config.environment.bot_rehearsal = 0
    config.ppo.total_steps = 8
    config.ppo.rollout_steps = 4
    config.ppo.epochs = 1
    config.training.accumulation_steps = 4
    config.training.device = args.device
    config.evaluation.validation_seeds = [1_000_001]
    config.evaluation.test_seeds = [2_000_001]
    # Source checks remain strict; never relabel or overwrite the normal cache.
    with tempfile.TemporaryDirectory(prefix="alphasp-core-") as temporary:
        root = Path(temporary)
        config.knowledge.directory = str(root / "knowledge")
        config.training.output_dir = str(root / "run")
        knowledge = build_knowledge(config, args.device)
        if args.device == "cuda":
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
        with patch.object(Env, "debug_state", side_effect=AssertionError("private state entered training")):
            first = train(config, stage="ppo", session_updates=1)
            checkpoint = root / "run" / "last.pt"
            saved = read_checkpoint(checkpoint)
            assert first == {"phase": "ppo", "steps": 4, "updates": 1, "stopped": True}, first
            assert saved["state"]["optimizer_steps"] == 1
            assert saved["pool"]["slots"][0]["steps"] == 4
            assert saved["optimizer"]["state"], "AdamW moments were not initialized"
            assert saved["state"]["phase"] == "ppo" and not saved["state"]["demos"]
            second = train(config, stage="ppo", resume=checkpoint, session_updates=1)
        resumed = read_checkpoint(checkpoint)
        assert second["steps"] == 8 and second["updates"] == 2, second
        assert resumed["state"]["optimizer_steps"] == 2
        changes = [
            name for name, value in resumed["model"].items()
            if not torch.equal(value, saved["model"][name])
        ]
        assert any("lora_" in name for name in changes), "LoRA parameters did not update"
        assert any(not name.startswith("bert.") for name in changes), "new heads did not update"
        assert all(torch.isfinite(value).all() for value in resumed["model"].values())
        moments = resumed["optimizer"]["state"].values()
        assert all(int(moment["step"]) == 2 for moment in moments), "optimizer did not resume"
        metrics = [json.loads(line) for line in (root / "run" / "metrics.jsonl").read_text().splitlines()]
        assert sum(event["phase"] == "teacher_baseline" for event in metrics) == 1
        updates = [event for event in metrics if event["phase"] == "ppo"]
        assert [event["update"] for event in updates] == [1, 2]
        report = {
            "passed": True,
            "runtime": resumed["runtime"],
            "core_revision": json.loads((root / "knowledge" / "manifest.json").read_text())["source"]["core_revision"],
            "knowledge_records": knowledge["records"],
            "ppo_decisions": 8,
            "optimizer_steps": 2,
            "resumed_optimizer": True,
            "resumed_active_episode": True,
            "changed_lora_parameters": sum("lora_" in name for name in changes),
            "changed_head_parameters": sum(not name.startswith("bert.") for name in changes),
            "private_debug_calls": 0,
            "teacher_dataset_episodes": 0,
            "updates": updates,
            "peak_allocated_bytes": torch.cuda.max_memory_allocated() if args.device == "cuda" else None,
            "peak_reserved_bytes": torch.cuda.max_memory_reserved() if args.device == "cuda" else None,
            "elapsed_s": perf_counter() - started,
        }
        text = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(text + "\n", encoding="utf-8")
        print(text)


if __name__ == "__main__":
    main()
