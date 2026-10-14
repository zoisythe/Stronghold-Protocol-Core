"""Single compact acceptance run for the Python/Node interface."""
import json
from time import perf_counter
from stronghold_core import Env, BatchEnv, CoreError, Curriculum, LinearDecay


def take(env, action, seat=0):
    result = env.step(seat, action)
    assert "error" not in result, (action, result.get("error"), result.get("detail"))
    return result


def main():
    timings = {"teacher_s": 0.0, "step_s": 0.0}
    curriculum = Curriculum(LinearDecay(1, 0, 0, 100), LinearDecay(1, 0.1, 20, 100), ((0, "fixed"), (30, "random"), (80, "model")))
    assert curriculum.config(0)["perturbation_probability"] == 1
    assert curriculum.config(100)["perturbation_probability"] == 0
    assert curriculum.config(30)["strategy"]["mode"] == "random"
    assert abs(curriculum.teacher_probability(100) - 0.1) < 1e-12
    config = {"difficulty": "FUNNY", "bot_rehearsal": 3}
    start = perf_counter()
    with Env() as env:
        initial = env.reset(3, config)
        assert initial["decision_seats"] == [0]
        before = env.debug_state()
        for action in ({"t": "g.buy", "slot": -1}, {"t": "g.art", "itemUid": 123}, {"t": "g.wait"}):
            rejected = env.step(0, action)
            assert "error" in rejected and env.debug_state() == before
        legal = env.legal_actions()
        assert legal and env.debug_state() == before
        first = env.teacher_action()
        assert first in legal and first == env.teacher_action()
        assert env.debug_state() == before
        state = take(env, first)
        assert any(ord(c) > 127 for c in json.dumps(state, ensure_ascii=False))
        if state["observation"]["phase"] == "PREP":
            candidate = {"t": "g.refresh"}
            if candidate in env.legal_actions():
                state = take(env, candidate)
        steps = 1
        while not state["terminated"]:
            assert steps < 3000, "teacher match did not terminate"
            seat = env.observe()["decision_seats"][0]
            saved = env.debug_state()
            t = perf_counter()
            action = env.teacher_action(seat)
            timings["teacher_s"] += perf_counter() - t
            assert action is not None and env.debug_state() == saved
            t = perf_counter()
            state = take(env, action, seat)
            timings["step_s"] += perf_counter() - t
            steps += 1
        assert state["observation"]["result"]["reason"] in {"victory", "defeat", "eliminated"}
        outcome = state["metrics"]["outcome"]
        process = env._session.process
    assert process.poll() == 0
    assert not env._session._reader.is_alive() and not env._session._logger.is_alive()
    print(f"PASS full solo teacher match: {steps} actions, {outcome}", flush=True)

    perturb = {"perturbation_probability": 1, "bot_rehearsal": 0, "strategy": {"mode": "model", "ban_count": 3}}
    seeds = [7, 19]
    reference = []
    for seed in seeds:
        with Env() as single:
            a = single.reset(seed, perturb)
            b = single.reset(seed, perturb)
            assert a == b and b["resolved_setup"][0]["perturbed"]
            assert len(b["resolved_setup"][0]["diy"]) == 4
            assert len(b["strategy_bans"]) == 3
            assert all(action.get("bandId") not in b["strategy_bans"] for action in single.legal_actions())
            action = single.teacher_action()
            reference.append((b, action, take(single, action)))
    with BatchEnv(2, workers=2) as batch:
        resets = batch.reset(seeds, perturb)
        advice = batch.teacher_action()
        assert resets == [row[0] for row in reference]
        assert advice == [row[1] for row in reference]
        assert batch.step([0, 0], advice) == [row[2] for row in reference]
        process = batch._session.process
    assert process.poll() == 0
    print("PASS setup replay, bans, curriculum and single/batch parity", flush=True)

    with Env() as coop:
        state = coop.reset(11, {"mode": "coop", "players": 2, "controlled_seats": [0, 1], "bot_rehearsal": 0})
        seat = state["decision_seats"][0]
        waits = [a for a in coop.legal_actions(seat) if a["t"] == "g.wait"]
        assert waits
        state = take(coop, waits[0], seat)
        assert state["observation"]["self"]["bandId"] is not None
        before = coop.debug_state()
        rejected = coop.step(seat, {"t": "g.band", "bandId": "band_amedic"})
        assert "error" in rejected and coop.debug_state() == before
        observer = coop.observe(seat)
        assert "hand" not in observer["teammates"][0] and "funds" not in observer["teammates"][0]
    with Env(timeout=5) as failed:
        failed.reset()
        failed._session.process.terminate()
        failed._session.process.wait(timeout=5)
        failed._session._reader.join(timeout=2)
        try:
            failed.observe()
        except CoreError:
            pass
        else:
            raise AssertionError("unexpected child exit was not reported")
    print("PASS multiplayer virtual deadline, observation boundary and process failure", flush=True)
    print(json.dumps({"integration_seconds": perf_counter() - start, "actions": steps, **timings}), flush=True)


if __name__ == "__main__":
    main()
