from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.apriori import apriori, transactions_from_rows
from hebut_ai_prep.data_mining import clean_sales_rows, read_csv_rows, write_csv_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="历史题型：Apriori 频繁项集挖掘")
    parser.add_argument(
        "--input", type=Path, default=ROOT / "artifacts/data_mining/cleaned_sales.csv"
    )
    parser.add_argument("--raw", type=Path, default=ROOT / "sample_data/synthetic_sales.csv")
    parser.add_argument("--min-support", type=int, default=2, dest="min_support")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/data_mining/frequent_itemsets.csv"
    )
    args = parser.parse_args()

    if args.input.exists():
        rows = read_csv_rows(args.input)
    else:
        rows = clean_sales_rows(read_csv_rows(args.raw))
        write_csv_rows(args.input, rows)

    transactions = transactions_from_rows(rows)
    itemsets = apriori(transactions, min_support_count=args.min_support)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=("size", "items", "support_count", "support")
        )
        writer.writeheader()
        for entry in itemsets:
            writer.writerow(
                {
                    "size": len(entry.items),
                    "items": "|".join(map(str, entry.items)),
                    "support_count": entry.support_count,
                    "support": f"{entry.support:.6f}",
                }
            )

    print(f"交易数: {len(transactions)}")
    print(f"最小支持计数: {args.min_support}")
    for entry in itemsets:
        print(f"{entry.items}: count={entry.support_count}, support={entry.support:.3f}")
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
