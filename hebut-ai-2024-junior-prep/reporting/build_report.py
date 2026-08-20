from __future__ import annotations

import argparse
from pathlib import Path

try:
    from .core import build_markdown_report, load_contracts, load_manifest, validate_manifest
except ImportError:  # 允许直接执行 python reporting/build_report.py
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from reporting.core import (
        build_markdown_report,
        load_contracts,
        load_manifest,
        validate_manifest,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从真实运行产物生成实验报告 Markdown 草稿")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--contracts",
        type=Path,
        default=Path(__file__).with_name("contracts.json"),
    )
    parser.add_argument(
        "--allow-warnings",
        action="store_true",
        help="保留警告但继续生成；错误仍会终止",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = load_manifest(args.manifest)
    contracts = load_contracts(args.contracts)
    audit = validate_manifest(manifest, args.manifest, contracts)

    for message in audit.errors:
        print(f"ERROR: {message}")
    for message in audit.warnings:
        print(f"WARN:  {message}")

    if audit.errors:
        print("未生成报告：先补齐缺失产物和证据。")
        return 1
    if audit.warnings and not args.allow_warnings:
        print("未生成报告：存在警告；核验后使用 --allow-warnings。")
        return 2

    output = args.output or args.manifest.with_name("实验报告草稿.md")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(build_markdown_report(manifest, args.manifest), encoding="utf-8")
    print(f"报告草稿已生成：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
