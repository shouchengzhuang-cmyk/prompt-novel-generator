"""Numerical-analysis routines with explicit iteration history."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Sequence

Vector = Sequence[float]


@dataclass(frozen=True)
class IterationResult:
    value: float | tuple[float, ...]
    iterations: int
    converged: bool
    history: tuple[float, ...]


def bisection(
    function: Callable[[float], float],
    left: float,
    right: float,
    *,
    tolerance: float = 1e-8,
    max_iterations: int = 100,
) -> IterationResult:
    """Find a root in a sign-changing interval by bisection."""

    _validate_solver_options(tolerance, max_iterations)
    f_left = function(left)
    f_right = function(right)
    if not math.isfinite(f_left) or not math.isfinite(f_right):
        raise ValueError("Function values at interval boundaries must be finite")
    if f_left == 0:
        return IterationResult(left, 0, True, (left,))
    if f_right == 0:
        return IterationResult(right, 0, True, (right,))
    if f_left * f_right > 0:
        raise ValueError("Bisection requires opposite signs at interval boundaries")

    history: list[float] = []
    midpoint = (left + right) / 2
    for iteration in range(1, max_iterations + 1):
        midpoint = (left + right) / 2
        f_mid = function(midpoint)
        if not math.isfinite(f_mid):
            raise ValueError("Function produced a non-finite value")
        history.append(midpoint)
        if abs(f_mid) <= tolerance or abs(right - left) / 2 <= tolerance:
            return IterationResult(midpoint, iteration, True, tuple(history))
        if f_left * f_mid < 0:
            right = midpoint
            f_right = f_mid
        else:
            left = midpoint
            f_left = f_mid
    return IterationResult(midpoint, max_iterations, False, tuple(history))


def newton(
    function: Callable[[float], float],
    derivative: Callable[[float], float],
    initial: float,
    *,
    tolerance: float = 1e-8,
    max_iterations: int = 100,
    derivative_floor: float = 1e-12,
) -> IterationResult:
    """Find a scalar root with Newton's method."""

    _validate_solver_options(tolerance, max_iterations)
    current = float(initial)
    history = [current]
    for iteration in range(1, max_iterations + 1):
        f_value = function(current)
        derivative_value = derivative(current)
        if not math.isfinite(f_value) or not math.isfinite(derivative_value):
            raise ValueError("Function and derivative values must be finite")
        if abs(f_value) <= tolerance:
            return IterationResult(current, iteration - 1, True, tuple(history))
        if abs(derivative_value) <= derivative_floor:
            raise ZeroDivisionError("Derivative is too close to zero for a stable Newton step")
        updated = current - f_value / derivative_value
        history.append(updated)
        if abs(updated - current) <= tolerance:
            return IterationResult(updated, iteration, True, tuple(history))
        current = updated
    return IterationResult(current, max_iterations, False, tuple(history))


def gradient_descent(
    objective: Callable[[tuple[float, ...]], float],
    gradient: Callable[[tuple[float, ...]], Sequence[float]],
    initial: Sequence[float],
    *,
    learning_rate: float = 0.1,
    tolerance: float = 1e-8,
    max_iterations: int = 1_000,
) -> IterationResult:
    """Minimise a differentiable objective with fixed-step gradient descent."""

    _validate_solver_options(tolerance, max_iterations)
    if learning_rate <= 0:
        raise ValueError("learning_rate must be positive")
    current = tuple(float(value) for value in initial)
    if not current:
        raise ValueError("initial vector cannot be empty")

    scores = [float(objective(current))]
    for iteration in range(1, max_iterations + 1):
        grad = tuple(float(value) for value in gradient(current))
        if len(grad) != len(current):
            raise ValueError("gradient dimension does not match the initial vector")
        norm = math.sqrt(sum(value * value for value in grad))
        if norm <= tolerance:
            return IterationResult(current, iteration - 1, True, tuple(scores))
        updated = tuple(value - learning_rate * delta for value, delta in zip(current, grad))
        score = float(objective(updated))
        if not math.isfinite(score):
            raise ValueError("objective produced a non-finite value")
        scores.append(score)
        step_norm = math.sqrt(sum((new - old) ** 2 for old, new in zip(current, updated)))
        current = updated
        if step_norm <= tolerance:
            return IterationResult(current, iteration, True, tuple(scores))
    return IterationResult(current, max_iterations, False, tuple(scores))


def _validate_solver_options(tolerance: float, max_iterations: int) -> None:
    if tolerance <= 0:
        raise ValueError("tolerance must be positive")
    if max_iterations < 1:
        raise ValueError("max_iterations must be positive")
