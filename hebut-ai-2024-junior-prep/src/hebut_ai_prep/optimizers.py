"""Compact genetic algorithm and particle swarm optimiser implementations."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable, Sequence

Bounds = Sequence[tuple[float, float]]
Objective = Callable[[tuple[float, ...]], float]


@dataclass(frozen=True)
class OptimizationResult:
    best_position: tuple[float, ...]
    best_score: float
    generations: int
    history: tuple[float, ...]


def genetic_algorithm(
    objective: Objective,
    bounds: Bounds,
    *,
    population_size: int = 40,
    generations: int = 100,
    crossover_rate: float = 0.8,
    mutation_rate: float = 0.1,
    elite_count: int = 2,
    seed: int = 42,
) -> OptimizationResult:
    """Minimise ``objective`` with a real-valued genetic algorithm."""

    _validate_common(bounds, generations)
    if population_size < 4:
        raise ValueError("population_size must be at least 4")
    if not 0 <= crossover_rate <= 1 or not 0 <= mutation_rate <= 1:
        raise ValueError("crossover_rate and mutation_rate must be within [0, 1]")
    if elite_count < 1 or elite_count >= population_size:
        raise ValueError("elite_count must be in [1, population_size)")

    rng = random.Random(seed)
    normalised_bounds = _normalise_bounds(bounds)
    population = [_random_position(normalised_bounds, rng) for _ in range(population_size)]
    history: list[float] = []

    for _ in range(generations):
        ranked = sorted(((objective(member), member) for member in population), key=lambda pair: pair[0])
        history.append(float(ranked[0][0]))
        next_population = [member for _, member in ranked[:elite_count]]

        def tournament() -> tuple[float, ...]:
            contestants = rng.sample(ranked, k=min(3, len(ranked)))
            return min(contestants, key=lambda pair: pair[0])[1]

        while len(next_population) < population_size:
            left, right = tournament(), tournament()
            if rng.random() < crossover_rate:
                alpha = rng.random()
                child = tuple(alpha * a + (1 - alpha) * b for a, b in zip(left, right))
            else:
                child = left
            child_values = list(child)
            for index, (low, high) in enumerate(normalised_bounds):
                if rng.random() < mutation_rate:
                    sigma = (high - low) * 0.1
                    child_values[index] += rng.gauss(0.0, sigma)
                child_values[index] = min(high, max(low, child_values[index]))
            next_population.append(tuple(child_values))
        population = next_population

    final_score, final_position = min(
        ((float(objective(member)), member) for member in population), key=lambda pair: pair[0]
    )
    history.append(final_score)
    return OptimizationResult(final_position, final_score, generations, tuple(history))


def particle_swarm(
    objective: Objective,
    bounds: Bounds,
    *,
    swarm_size: int = 30,
    generations: int = 100,
    inertia: float = 0.7,
    cognitive: float = 1.4,
    social: float = 1.4,
    seed: int = 42,
) -> OptimizationResult:
    """Minimise ``objective`` with a bounded particle swarm optimiser."""

    _validate_common(bounds, generations)
    if swarm_size < 2:
        raise ValueError("swarm_size must be at least 2")
    if inertia < 0 or cognitive < 0 or social < 0:
        raise ValueError("PSO coefficients cannot be negative")

    rng = random.Random(seed)
    normalised_bounds = _normalise_bounds(bounds)
    positions = [_random_position(normalised_bounds, rng) for _ in range(swarm_size)]
    velocities = [
        tuple(rng.uniform(-(high - low) * 0.1, (high - low) * 0.1) for low, high in normalised_bounds)
        for _ in range(swarm_size)
    ]
    personal_best = list(positions)
    personal_scores = [float(objective(position)) for position in positions]
    global_index = min(range(swarm_size), key=personal_scores.__getitem__)
    global_best = personal_best[global_index]
    global_score = personal_scores[global_index]
    history = [global_score]

    for _ in range(generations):
        for particle_index in range(swarm_size):
            position = positions[particle_index]
            velocity = velocities[particle_index]
            updated_velocity: list[float] = []
            updated_position: list[float] = []
            for dimension, (low, high) in enumerate(normalised_bounds):
                r1, r2 = rng.random(), rng.random()
                speed = (
                    inertia * velocity[dimension]
                    + cognitive * r1 * (personal_best[particle_index][dimension] - position[dimension])
                    + social * r2 * (global_best[dimension] - position[dimension])
                )
                max_speed = high - low
                speed = min(max_speed, max(-max_speed, speed))
                coordinate = min(high, max(low, position[dimension] + speed))
                updated_velocity.append(speed)
                updated_position.append(coordinate)

            positions[particle_index] = tuple(updated_position)
            velocities[particle_index] = tuple(updated_velocity)
            score = float(objective(positions[particle_index]))
            if not math.isfinite(score):
                raise ValueError("objective produced a non-finite value")
            if score < personal_scores[particle_index]:
                personal_scores[particle_index] = score
                personal_best[particle_index] = positions[particle_index]
                if score < global_score:
                    global_score = score
                    global_best = positions[particle_index]
        history.append(global_score)

    return OptimizationResult(global_best, global_score, generations, tuple(history))


def _normalise_bounds(bounds: Bounds) -> tuple[tuple[float, float], ...]:
    result = tuple((float(low), float(high)) for low, high in bounds)
    for low, high in result:
        if not math.isfinite(low) or not math.isfinite(high) or low >= high:
            raise ValueError(f"Invalid bound: {(low, high)}")
    return result


def _validate_common(bounds: Bounds, generations: int) -> None:
    if not bounds:
        raise ValueError("bounds cannot be empty")
    if generations < 1:
        raise ValueError("generations must be positive")
    _normalise_bounds(bounds)


def _random_position(bounds: tuple[tuple[float, float], ...], rng: random.Random) -> tuple[float, ...]:
    return tuple(rng.uniform(low, high) for low, high in bounds)
