from __future__ import annotations

import argparse
from pathlib import Path

try:
    from .core import load_contracts, load_manifest, validate_manifest
except ImportError:  # 允许直接执行 python reporting/audit_artifacts.py
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from reporting.core import load_contracts, load_manifest, validate_manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="审计实验结果清单和产物完整性")
    parser.add_argument("manifest", type=Path, help="result-manifest.json 路径")
    parser.add_argument(
        "--contracts",
        type=Path,
        default=Path(__file__).with_name("contracts.json"),
        help="结果合同定义",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = load_manifest(args.manifest)
    contracts = load_contracts(args.contracts)
    result = validate_manifest(manifest, args.manifest, contracts)

    for message in result.errors:
        print(f"ERROR: {message}")
    for message in result.warnings:
        print(f"WARN:  {message}")

    if result.ok:
        print(f"PASS: 结果清单通过审计（{len(result.warnings)} 条警告）")
        return 0
    print(f"FAIL: {len(result.errors)} 个错误，{len(result.warnings)} 条警告")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
