from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.optimizers import genetic_algorithm, particle_swarm


def sphere(position: tuple[float, ...]) -> float:
    return sum(value * value for value in position)


class OptimizerTests(unittest.TestCase):
    def test_genetic_algorithm_improves_sphere(self) -> None:
        result = genetic_algorithm(
            sphere,
            [(-5, 5), (-5, 5)],
            population_size=40,
            generations=50,
            seed=7,
        )
        self.assertLess(result.best_score, 0.05)
        self.assertLessEqual(result.history[-1], result.history[0])

    def test_particle_swarm_improves_sphere(self) -> None:
        result = particle_swarm(
            sphere,
            [(-5, 5), (-5, 5)],
            swarm_size=30,
            generations=50,
            seed=7,
        )
        self.assertLess(result.best_score, 1e-4)
        self.assertLessEqual(result.history[-1], result.history[0])

    def test_invalid_bounds(self) -> None:
        with self.assertRaises(ValueError):
            genetic_algorithm(sphere, [(1, 1)])


if __name__ == "__main__":
    unittest.main()
