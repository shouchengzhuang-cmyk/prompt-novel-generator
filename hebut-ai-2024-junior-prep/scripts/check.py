from __future__ import annotations

import compileall
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*arguments: str) -> None:
    command = [sys.executable, *arguments]
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    if not compileall.compile_dir(ROOT / "src", quiet=1):
        raise SystemExit("src 编译失败")
    if not compileall.compile_dir(ROOT / "labs", quiet=1):
        raise SystemExit("labs 编译失败")
    run("-m", "unittest", "discover", "-s", "tests", "-v")
    run("labs/semester5/data_mining/lab01_preprocessing.py")
    run("labs/semester5/data_mining/lab02_olap_cube.py")
    run("labs/semester5/data_mining/lab03_apriori.py", "--min-support", "2")
    run("labs/semester5/ml_pattern_recognition/baseline.py")
    run("labs/semester5/computational_intelligence/demo.py")
    run("labs/semester5/numerical_optimization/demo.py")
    run("labs/semester6/nlp/text_classification.py")
    print("\n核心检查全部通过；未运行需要 PyTorch/OpenCV/FastAPI 的重型实验。")


if __name__ == "__main__":
    main()
