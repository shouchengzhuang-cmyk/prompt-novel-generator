from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src"))

from hebut_ai_prep.data_mining import (
    build_cube,
    clean_sales_rows,
    cube_rows,
    query_cube,
    read_csv_rows,
    write_csv_rows,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="历史题型：三维数据立方体与 OLAP 查询")
    parser.add_argument(
        "--input", type=Path, default=ROOT / "artifacts/data_mining/cleaned_sales.csv"
    )
    parser.add_argument("--raw", type=Path, default=ROOT / "sample_data/synthetic_sales.csv")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/data_mining/cube.csv")
    args = parser.parse_args()

    if args.input.exists():
        rows = read_csv_rows(args.input)
    else:
        rows = clean_sales_rows(read_csv_rows(args.raw))
        write_csv_rows(args.input, rows)

    cube = build_cube(rows)
    write_csv_rows(
        args.output,
        cube_rows(cube),
        fieldnames=("item_category", "store_id", "sale_date", "amount"),
    )

    print(f"非空立方体单元: {len(cube)}")
    print(f"全部销售额: {query_cube(cube)}")
    print(f"商店 1019: {query_cube(cube, store_id='1019')}")
    print(f"类别 10010: {query_cube(cube, category='10010')}")
    print(f"2026-01-14: {query_cube(cube, sale_date='2026-01-14')}")
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
