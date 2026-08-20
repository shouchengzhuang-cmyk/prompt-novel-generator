from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.optimizers import genetic_algorithm, particle_swarm


def sphere(position: tuple[float, ...]) -> float:
    return sum(value * value for value in position)


def main() -> None:
    bounds = [(-5.12, 5.12), (-5.12, 5.12)]
    ga = genetic_algorithm(sphere, bounds, population_size=50, generations=80, seed=42)
    pso = particle_swarm(sphere, bounds, swarm_size=40, generations=80, seed=42)
    print("目标函数: f(x)=sum(x_i^2)，理论最优值 0")
    print(f"GA : position={ga.best_position}, score={ga.best_score:.8f}")
    print(f"PSO: position={pso.best_position}, score={pso.best_score:.8f}")


if __name__ == "__main__":
    main()
