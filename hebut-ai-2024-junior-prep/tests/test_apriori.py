from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.apriori import apriori, transactions_from_rows


class AprioriTests(unittest.TestCase):
    def test_known_frequent_itemsets(self) -> None:
        transactions = [
            {"A", "B", "C"},
            {"A", "B"},
            {"A", "C"},
            {"A", "B", "C"},
        ]
        result = apriori(transactions, min_support_count=2)
        counts = {entry.items: entry.support_count for entry in result}
        self.assertEqual(counts[("A",)], 4)
        self.assertEqual(counts[("A", "B")], 3)
        self.assertEqual(counts[("A", "C")], 3)
        self.assertEqual(counts[("B", "C")], 2)
        self.assertEqual(counts[("A", "B", "C")], 2)

    def test_group_rows_into_transactions(self) -> None:
        rows = [
            {"transaction_id": "T1", "item_category": "A"},
            {"transaction_id": "T1", "item_category": "B"},
            {"transaction_id": "T2", "item_category": "A"},
        ]
        self.assertEqual(transactions_from_rows(rows), [frozenset({"A", "B"}), frozenset({"A"})])

    def test_invalid_support(self) -> None:
        with self.assertRaises(ValueError):
            apriori([{"A"}], min_support_count=0)


if __name__ == "__main__":
    unittest.main()
