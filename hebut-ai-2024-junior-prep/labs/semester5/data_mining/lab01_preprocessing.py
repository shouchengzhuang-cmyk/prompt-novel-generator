from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.data_mining import clean_sales_rows, read_csv_rows, write_csv_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="历史题型：销售数据预处理")
    parser.add_argument("--input", type=Path, default=ROOT / "sample_data/synthetic_sales.csv")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/data_mining/cleaned_sales.csv"
    )
    args = parser.parse_args()

    raw_rows = read_csv_rows(args.input)
    cleaned = clean_sales_rows(raw_rows)
    write_csv_rows(args.output, cleaned)

    changed_signs = sum(
        str(raw["quantity"]).strip().startswith("-") or str(raw["amount"]).strip().startswith("-")
        for raw in raw_rows
    )
    filled_dates = sum(not str(raw["sale_date"]).strip() for raw in raw_rows)
    print(f"输入行数: {len(raw_rows)}")
    print(f"补全日期: {filled_dates}")
    print(f"修正负数行: {changed_signs}")
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
