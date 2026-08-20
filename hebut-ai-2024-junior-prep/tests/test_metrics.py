from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.metrics import accuracy_score, classification_report, confusion_matrix


class MetricsTests(unittest.TestCase):
    def test_metrics(self) -> None:
        expected = ["A", "A", "B", "B"]
        predicted = ["A", "B", "B", "B"]
        self.assertEqual(accuracy_score(expected, predicted), 0.75)
        labels, matrix = confusion_matrix(expected, predicted)
        self.assertEqual(labels, ["A", "B"])
        self.assertEqual(matrix, [[1, 1], [0, 2]])
        report = classification_report(expected, predicted)
        self.assertAlmostEqual(report["accuracy"], 0.75)
        self.assertIn("A", report["per_class"])

    def test_length_mismatch(self) -> None:
        with self.assertRaises(ValueError):
            accuracy_score([1], [1, 2])


if __name__ == "__main__":
    unittest.main()
