from stronghold_core import Env

with Env() as env:
    state = env.reset(3, {"difficulty": "FUNNY"})
    while not state["terminated"]:
        seat = state["decision_seats"][0]
        state = env.step(seat, env.teacher_action(seat))
        if "error" in state:
            raise RuntimeError(state["error"])
    print(state["metrics"]["outcome"])
