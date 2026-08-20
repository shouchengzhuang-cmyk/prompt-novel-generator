"""Reusable algorithms for the HEBUT AI junior-year preparation kit."""

from .apriori import FrequentItemset, apriori, transactions_from_rows
from .data_mining import (
    build_cube,
    clean_sales_rows,
    query_cube,
    read_csv_rows,
    write_csv_rows,
)
from .metrics import accuracy_score, classification_report, confusion_matrix
from .numerical import IterationResult, bisection, gradient_descent, newton
from .optimizers import OptimizationResult, genetic_algorithm, particle_swarm

__all__ = [
    "FrequentItemset",
    "IterationResult",
    "OptimizationResult",
    "accuracy_score",
    "apriori",
    "bisection",
    "build_cube",
    "classification_report",
    "clean_sales_rows",
    "confusion_matrix",
    "genetic_algorithm",
    "gradient_descent",
    "newton",
    "particle_swarm",
    "query_cube",
    "read_csv_rows",
    "transactions_from_rows",
    "write_csv_rows",
]
