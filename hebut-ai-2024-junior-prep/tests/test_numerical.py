from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.numerical import bisection, gradient_descent, newton


class NumericalTests(unittest.TestCase):
    def test_bisection_and_newton_find_sqrt_two(self) -> None:
        bisected = bisection(lambda x: x * x - 2, 0, 2)
        newton_result = newton(lambda x: x * x - 2, lambda x: 2 * x, 1.0)
        self.assertTrue(bisected.converged)
        self.assertTrue(newton_result.converged)
        self.assertAlmostEqual(float(bisected.value), math.sqrt(2), places=7)
        self.assertAlmostEqual(float(newton_result.value), math.sqrt(2), places=7)

    def test_gradient_descent_minimises_quadratic(self) -> None:
        result = gradient_descent(
            lambda point: (point[0] - 3) ** 2 + (point[1] + 2) ** 2,
            lambda point: (2 * (point[0] - 3), 2 * (point[1] + 2)),
            initial=(0, 0),
            learning_rate=0.2,
        )
        self.assertTrue(result.converged)
        x, y = result.value
        self.assertAlmostEqual(x, 3.0, places=6)
        self.assertAlmostEqual(y, -2.0, places=6)

    def test_bisection_rejects_non_bracketing_interval(self) -> None:
        with self.assertRaises(ValueError):
            bisection(lambda x: x * x + 1, -1, 1)


if __name__ == "__main__":
    unittest.main()
