from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.data_mining import build_cube, clean_sales_rows, query_cube


class DataMiningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = [
            {
                "store_id": "1019",
                "sale_date": "2026-01-13",
                "transaction_id": "T1",
                "item_code": "10010001",
                "quantity": "2",
                "amount": "10.5",
            },
            {
                "store_id": "1019",
                "sale_date": "",
                "transaction_id": "T1",
                "item_code": "10020001.0",
                "quantity": "-1",
                "amount": "-5",
            },
            {
                "store_id": "1019",
                "sale_date": "2026/01/14",
                "transaction_id": "T2",
                "item_code": "10010002",
                "quantity": "1",
                "amount": "8",
            },
        ]

    def test_cleaning_is_non_destructive_and_normalises_fields(self) -> None:
        cleaned = clean_sales_rows(self.rows)
        self.assertEqual(self.rows[1]["quantity"], "-1")
        self.assertEqual(cleaned[1]["quantity"], "1")
        self.assertEqual(cleaned[1]["amount"], "5")
        self.assertEqual(cleaned[1]["item_code"], "10020001")
        self.assertEqual(cleaned[1]["item_category"], "10020")
        self.assertEqual(cleaned[1]["sale_date"], "2026-01-13")
        self.assertEqual(cleaned[2]["sale_date"], "2026-01-14")

    def test_cube_slice_and_dice(self) -> None:
        cube = build_cube(clean_sales_rows(self.rows))
        self.assertEqual(query_cube(cube), Decimal("23.5"))
        self.assertEqual(query_cube(cube, category="10010"), Decimal("18.5"))
        self.assertEqual(query_cube(cube, sale_date="2026-01-13"), Decimal("15.5"))
        self.assertEqual(query_cube(cube, store_id="9999"), Decimal("0"))

    def test_store_without_any_date_is_rejected(self) -> None:
        rows = [dict(self.rows[0], sale_date="", store_id="9999")]
        with self.assertRaises(ValueError):
            clean_sales_rows(rows)


if __name__ == "__main__":
    unittest.main()
