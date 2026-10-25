"""Persistent UTF-8 pipe client. The game runs in Node, not in Python."""
from collections import deque
from concurrent.futures import Future, TimeoutError
import json
import os
from pathlib import Path
import subprocess
import threading


class CoreError(RuntimeError):
    pass


def _config(config):
    if isinstance(config, (str, Path)):
        with Path(config).open(encoding="utf-8") as stream:
            return json.load(stream)
    return config if config is not None else {}


class _Session:
    def __init__(self, *, workers=1, node="node", root=None, timeout=120, version="act2autochess"):
        if not isinstance(workers, int) or not 1 <= workers <= 64:
            raise ValueError("workers must be 1..64")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        package = Path(__file__).resolve().parent
        directory = Path(root).resolve() if root else package / "_runtime"
        if root is None and not directory.is_dir():
            directory = package.parents[1]
        bridge = directory / "server" / "training" / "bridge.mjs"
        if not bridge.is_file():
            raise CoreError("Node runtime not found; install the wheel or pass root=checkout")
        self.timeout = timeout
        self._lock = threading.RLock()
        self._pending = {}
        self._seq = 0
        self._closed = False
        self._closing = False
        self._failure = None
        self.stderr = deque(maxlen=100)
        self.process = subprocess.Popen(
            [node, str(bridge), "--workers", str(workers), "--version", version], cwd=directory,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="strict", text=True, bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._logger = threading.Thread(target=self._drain, daemon=True)
        self._reader.start()
        self._logger.start()

    def _fail(self, error):
        with self._lock:
            self._failure = error
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(error)
            self._pending.clear()

    def _read(self):
        try:
            for line in self.process.stdout:
                message = json.loads(line)
                if not isinstance(message.get("ok"), bool):
                    raise CoreError("invalid protocol response")
                with self._lock:
                    future = self._pending.pop(message.get("id"), None)
                if future is None:
                    raise CoreError("unknown response id")
                if message["ok"]:
                    future.set_result(message.get("result"))
                else:
                    error = message.get("error", {})
                    future.set_exception(CoreError(f"{error.get('name', 'Error')}: {error.get('message', '')}"))
            if not self._closing:
                self._fail(CoreError("Node process exited: " + "".join(self.stderr)[-4000:]))
        except Exception as error:
            self._fail(CoreError(f"protocol failed: {error}"))
            if self.process.poll() is None:
                self.process.terminate()

    def _drain(self):
        try:
            for line in self.process.stderr:
                self.stderr.append(line)
        except (OSError, ValueError):
            pass

    def request(self, op, *, env=None, args=()):
        with self._lock:
            if self._closed or self._failure:
                raise self._failure or CoreError("session is closed")
            self._seq += 1
            identifier = self._seq
            future = Future()
            frame = json.dumps({"id": identifier, "op": op, "env": env, "args": args}, ensure_ascii=False, allow_nan=False)
            self._pending[identifier] = future
            try:
                self.process.stdin.write(frame + "\n")
                self.process.stdin.flush()
            except (OSError, ValueError) as error:
                self._fail(CoreError(f"Node input failed: {error}"))
        try:
            return future.result(timeout=self.timeout)
        except TimeoutError as error:
            failure = CoreError(f"Node request timed out ({op}); session is unavailable")
            self._fail(failure)
            if self.process.poll() is None:
                self.process.terminate()
            raise failure from error

    def close(self):
        if self._closed:
            return
        self._closing = True
        try:
            if self.process.poll() is None and self._failure is None:
                self.request("shutdown")
        finally:
            self._closed = True
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
            self._fail(CoreError("session closed"))
            self._reader.join(timeout=2)
            self._logger.join(timeout=2)
            for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                stream.close()


class Env:
    def __init__(self, *, node="node", root=None, timeout=120, version="act2autochess"):
        self._session = _Session(node=node, root=root, timeout=timeout, version=version)
        try:
            self._env = self._session.request("create")
        except Exception:
            self._session.close()
            raise

    def _call(self, op, *args):
        return self._session.request(op, env=self._env, args=args)

    def reset(self, seed=1, config=None):
        return self._call("reset", seed, _config(config))

    def observe(self, seat=0):
        return self._call("observe", seat)

    def legal_actions(self, seat=0):
        return self._call("legal_actions", seat)

    def step(self, seat, action, elapsed_ms=0):
        return self._call("step", seat, action, elapsed_ms)

    def teacher_action(self, seat=0):
        return self._call("teacher_action", seat)

    def debug_state(self):
        return self._call("debug_state")

    def close(self):
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class BatchEnv:
    def __init__(self, count, *, workers=1, node="node", root=None, timeout=120, version="act2autochess"):
        if not isinstance(count, int) or count < 1:
            raise ValueError("count must be positive")
        self.count = count
        self._session = _Session(workers=workers, node=node, root=root, timeout=timeout, version=version)
        try:
            self._envs = [self._session.request("create") for _ in range(count)]
        except Exception:
            self._session.close()
            raise

    def _batch(self, op, arguments):
        if len(arguments) != self.count:
            raise ValueError("batch length does not match environment count")
        return self._session.request("batch", args=([{"env": env, "op": op, "args": args} for env, args in zip(self._envs, arguments)],))

    def reset(self, seeds, configs=None):
        if configs is None:
            configs = [{} for _ in range(self.count)]
        elif isinstance(configs, (dict, str, Path)):
            configs = [_config(configs) for _ in range(self.count)]
        if len(seeds) != self.count or len(configs) != self.count:
            raise ValueError("reset batch length mismatch")
        return self._batch("reset", [[seed, _config(config)] for seed, config in zip(seeds, configs)])

    def observe(self, seats=None):
        return self._batch("observe", [[seat] for seat in (seats if seats is not None else [0] * self.count)])

    def legal_actions(self, seats=None):
        return self._batch("legal_actions", [[seat] for seat in (seats if seats is not None else [0] * self.count)])

    def teacher_action(self, seats=None):
        return self._batch("teacher_action", [[seat] for seat in (seats if seats is not None else [0] * self.count)])

    def step(self, seats, actions, elapsed_ms=None):
        if elapsed_ms is None:
            elapsed_ms = [0] * self.count
        if any(len(values) != self.count for values in (seats, actions, elapsed_ms)):
            raise ValueError("step batch length mismatch")
        return self._batch("step", [[seat, action, elapsed] for seat, action, elapsed in zip(seats, actions, elapsed_ms)])

    def debug_state(self):
        return self._batch("debug_state", [[] for _ in range(self.count)])

    def close(self):
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
