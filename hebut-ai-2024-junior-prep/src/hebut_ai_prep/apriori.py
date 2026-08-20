"""A transparent Apriori implementation for teaching and small datasets."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Hashable, Iterable, Mapping

Item = Hashable
Transaction = frozenset[Item]


@dataclass(frozen=True, order=True)
class FrequentItemset:
    items: tuple[Item, ...]
    support_count: int
    support: float


def transactions_from_rows(
    rows: Iterable[Mapping[str, object]],
    *,
    transaction_field: str = "transaction_id",
    item_field: str = "item_category",
) -> list[Transaction]:
    """Group item/category values by transaction identifier."""

    grouped: defaultdict[str, set[Item]] = defaultdict(set)
    for row in rows:
        transaction_id = str(row.get(transaction_field, "")).strip()
        item = row.get(item_field)
        if not transaction_id or item is None or str(item).strip() == "":
            raise ValueError(f"Missing transaction/item value: {row}")
        grouped[transaction_id].add(item)
    return [frozenset(items) for _, items in sorted(grouped.items())]


def apriori(
    transactions: Iterable[Iterable[Item]],
    *,
    min_support_count: int = 2,
    max_size: int | None = None,
) -> list[FrequentItemset]:
    """Return all frequent itemsets sorted by size and lexical representation."""

    if min_support_count < 1:
        raise ValueError("min_support_count must be at least 1")
    if max_size is not None and max_size < 1:
        raise ValueError("max_size must be positive")

    txs = [frozenset(transaction) for transaction in transactions]
    txs = [transaction for transaction in txs if transaction]
    if not txs:
        return []

    singleton_counts: Counter[frozenset[Item]] = Counter()
    for transaction in txs:
        for item in transaction:
            singleton_counts[frozenset({item})] += 1

    current = {
        itemset: count
        for itemset, count in singleton_counts.items()
        if count >= min_support_count
    }
    all_levels: list[dict[frozenset[Item], int]] = []
    if current:
        all_levels.append(current)

    size = 2
    while current and (max_size is None or size <= max_size):
        candidates = _generate_candidates(set(current), size)
        counts: Counter[frozenset[Item]] = Counter()
        for transaction in txs:
            for candidate in candidates:
                if candidate.issubset(transaction):
                    counts[candidate] += 1
        current = {
            candidate: count
            for candidate, count in counts.items()
            if count >= min_support_count
        }
        if current:
            all_levels.append(current)
        size += 1

    result: list[FrequentItemset] = []
    total = len(txs)
    for level in all_levels:
        for itemset, count in level.items():
            ordered = tuple(sorted(itemset, key=lambda item: str(item)))
            result.append(FrequentItemset(ordered, count, count / total))
    return sorted(result, key=lambda entry: (len(entry.items), tuple(map(str, entry.items))))


def _generate_candidates(
    previous_level: set[frozenset[Item]],
    target_size: int,
) -> set[frozenset[Item]]:
    """Join frequent (k-1)-sets and prune candidates with infrequent subsets."""

    previous = list(previous_level)
    candidates: set[frozenset[Item]] = set()
    for left_index, left in enumerate(previous):
        for right in previous[left_index + 1 :]:
            union = left | right
            if len(union) != target_size:
                continue
            if all(frozenset(union - {item}) in previous_level for item in union):
                candidates.add(frozenset(union))
    return candidates
