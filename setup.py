"""Bundle the existing JavaScript runtime into an ordinary, non-native wheel."""
from pathlib import Path
from shutil import copytree, copy2, rmtree
from setuptools import setup
from setuptools.command.build_py import build_py


class BuildCore(build_py):
    def run(self):
        super().run()
        root = Path(__file__).parent.resolve()
        build_root = Path(self.build_lib).resolve()
        target = build_root / "stronghold_core" / "_runtime"
        if not target.is_relative_to(build_root) or target.is_symlink():
            raise RuntimeError("unexpected runtime build path")
        if target.exists():
            rmtree(target)
        target.mkdir(parents=True, exist_ok=True)
        for directory in ("server", "shared", "data", "types"):
            copytree(root / directory, target / directory, dirs_exist_ok=True)
        for filename in ("package.json", "LICENSE", "NOTICE.md", "THIRD-PARTY-NOTICES.md"):
            copy2(root / filename, target / filename)


setup(cmdclass={"build_py": BuildCore})
