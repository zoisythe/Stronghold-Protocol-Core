from copy import deepcopy
from dataclasses import dataclass


@dataclass(frozen=True)
class LinearDecay:
    initial: float
    final: float
    start_episode: int
    end_episode: int

    def __post_init__(self):
        if not 0 <= self.final <= self.initial <= 1:
            raise ValueError("decay probabilities must satisfy 0 <= final <= initial <= 1")
        if self.start_episode < 0 or self.end_episode <= self.start_episode:
            raise ValueError("invalid decay episode interval")

    def at(self, episode):
        if not isinstance(episode, int) or episode < 0:
            raise ValueError("episode must be a nonnegative integer")
        fraction = min(1, max(0, (episode - self.start_episode) / (self.end_episode - self.start_episode)))
        return self.initial + (self.final - self.initial) * fraction


@dataclass(frozen=True)
class Curriculum:
    perturbation: LinearDecay
    teacher: LinearDecay
    strategy_stages: tuple = ((0, "model"),)

    def __post_init__(self):
        starts = [stage[0] for stage in self.strategy_stages]
        if not starts or starts[0] != 0 or starts != sorted(set(starts)) or any(not isinstance(s, int) for s in starts):
            raise ValueError("strategy stages must start at episode 0 and strictly increase")
        if any(mode not in {"model", "fixed", "random"} for _, mode in self.strategy_stages):
            raise ValueError("unknown strategy mode")

    def config(self, episode, baseline=None):
        config = deepcopy(baseline) if baseline is not None else {}
        config["perturbation_probability"] = self.perturbation.at(episode)
        config.setdefault("strategy", {})["mode"] = next(mode for start, mode in reversed(self.strategy_stages) if episode >= start)
        return config

    def teacher_probability(self, episode):
        return self.teacher.at(episode)
