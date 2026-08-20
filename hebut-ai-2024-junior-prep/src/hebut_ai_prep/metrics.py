"""Dependency-free classification metrics used by the lightweight labs."""

from __future__ import annotations

from collections import defaultdict
from typing import Hashable, Iterable, Sequence

Label = Hashable


def accuracy_score(y_true: Sequence[Label], y_pred: Sequence[Label]) -> float:
    _validate_labels(y_true, y_pred)
    if not y_true:
        return 0.0
    return sum(expected == predicted for expected, predicted in zip(y_true, y_pred)) / len(y_true)


def confusion_matrix(
    y_true: Sequence[Label],
    y_pred: Sequence[Label],
    labels: Iterable[Label] | None = None,
) -> tuple[list[Label], list[list[int]]]:
    _validate_labels(y_true, y_pred)
    ordered_labels = list(labels) if labels is not None else sorted(set(y_true) | set(y_pred), key=str)
    index = {label: position for position, label in enumerate(ordered_labels)}
    if len(index) != len(ordered_labels):
        raise ValueError("labels contains duplicates")
    matrix = [[0 for _ in ordered_labels] for _ in ordered_labels]
    for expected, predicted in zip(y_true, y_pred):
        if expected not in index or predicted not in index:
            raise ValueError("A label is absent from the supplied labels list")
        matrix[index[expected]][index[predicted]] += 1
    return ordered_labels, matrix


def classification_report(
    y_true: Sequence[Label],
    y_pred: Sequence[Label],
) -> dict[str, object]:
    """Return per-class precision/recall/F1 and macro averages."""

    labels, matrix = confusion_matrix(y_true, y_pred)
    per_class: dict[str, dict[str, float | int]] = {}
    for class_index, label in enumerate(labels):
        true_positive = matrix[class_index][class_index]
        false_positive = sum(row[class_index] for row in matrix) - true_positive
        false_negative = sum(matrix[class_index]) - true_positive
        support = sum(matrix[class_index])
        precision = _safe_divide(true_positive, true_positive + false_positive)
        recall = _safe_divide(true_positive, true_positive + false_negative)
        f1 = _safe_divide(2 * precision * recall, precision + recall)
        per_class[str(label)] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
        }

    macro = defaultdict(float)
    if per_class:
        for metrics in per_class.values():
            for name in ("precision", "recall", "f1"):
                macro[name] += float(metrics[name]) / len(per_class)
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "macro": dict(macro),
        "per_class": per_class,
    }


def _safe_divide(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _validate_labels(y_true: Sequence[Label], y_pred: Sequence[Label]) -> None:
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have the same length")
