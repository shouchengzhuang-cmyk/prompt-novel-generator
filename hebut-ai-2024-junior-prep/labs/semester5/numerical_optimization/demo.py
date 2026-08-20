from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.numerical import bisection, gradient_descent, newton


def main() -> None:
    bisected = bisection(lambda x: x * x - 2, 0, 2)
    newton_result = newton(lambda x: x * x - 2, lambda x: 2 * x, 1.0)
    descent = gradient_descent(
        lambda point: (point[0] - 3) ** 2 + (point[1] + 2) ** 2,
        lambda point: (2 * (point[0] - 3), 2 * (point[1] + 2)),
        initial=(0, 0),
        learning_rate=0.2,
    )
    print(f"sqrt(2) 真值: {math.sqrt(2):.12f}")
    print(f"二分法: {bisected.value:.12f}, iterations={bisected.iterations}")
    print(f"牛顿法: {newton_result.value:.12f}, iterations={newton_result.iterations}")
    print(f"梯度下降: point={descent.value}, iterations={descent.iterations}")


if __name__ == "__main__":
    main()
