from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reporting.core import load_contracts  # noqa: E402


SECTION_DEFAULTS: dict[str, dict[str, Any]] = {
    "metrics": {
        "name": "TODO：指标名称",
        "split": "TODO：数据划分",
        "value": None,
        "unit": "",
        "source": "artifacts/TODO-metrics.json",
    },
    "tables": {
        "title": "TODO：结果表标题",
        "path": "artifacts/TODO-table.csv",
        "caption": "TODO：解释表格中的主要现象",
    },
    "figures": {
        "title": "TODO：图标题",
        "path": "artifacts/TODO-figure.png",
        "caption": "TODO：解释图中的趋势或失败样例",
    },
    "artifacts": {
        "title": "TODO：产物名称",
        "kind": "file",
        "path": "artifacts/TODO-artifact.txt",
        "description": "TODO：说明用途",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="初始化一次正式课程实验工作目录")
    parser.add_argument("--course", required=True)
    parser.add_argument("--experiment", required=True)
    parser.add_argument("--contract", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--contracts",
        type=Path,
        default=ROOT / "reporting" / "contracts.json",
    )
    return parser.parse_args()


def build_manifest(course: str, experiment: str, contract_id: str, contract: dict[str, Any]) -> dict[str, Any]:
    manifest: dict[str, Any] = {
        "meta": {
            "course": course,
            "experiment": experiment,
            "contract": contract_id,
            "student": "TODO：本人填写",
            "student_id": "TODO：本人填写",
            "class_name": "TODO：本人填写",
            "date": "TODO：本人填写",
            "git_commit": "TODO：运行后填写",
        },
        "purpose": ["TODO：按老师要求改写实验目的"],
        "environment": {
            "os": "TODO：运行时采集",
            "python": "TODO：运行时采集",
            "hardware": "TODO：运行时采集",
            "random_seed": 42,
            "dependencies": {},
        },
        "data": [],
        "methodology": ["TODO：按实际实现填写算法与流程"],
        "parameters": [],
        "metrics": [],
        "tables": [],
        "figures": [],
        "artifacts": [],
        "commands": [{"purpose": "TODO：运行实验", "command": "TODO：可复现命令"}],
        "findings": [],
        "problems": [],
        "conclusion": ["TODO：运行并分析后填写结论"],
    }

    for requirement in contract.get("required_ids", []):
        if not isinstance(requirement, dict):
            continue
        section = requirement.get("section")
        identifier = requirement.get("id")
        if section not in SECTION_DEFAULTS or not isinstance(identifier, str):
            continue
        item = {"id": identifier, **SECTION_DEFAULTS[section]}
        item["description"] = requirement.get("description", item.get("description", ""))
        manifest[section].append(item)

    return manifest


def main() -> int:
    args = parse_args()
    contracts = load_contracts(args.contracts)
    contract = contracts.get(args.contract)
    if not isinstance(contract, dict):
        available = ", ".join(sorted(contracts))
        raise SystemExit(f"未知 contract：{args.contract}\n可用值：{available}")

    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"目标目录非空，拒绝覆盖：{output}")

    (output / "teacher").mkdir(parents=True, exist_ok=True)
    (output / "artifacts").mkdir(parents=True, exist_ok=True)
    (output / "artifacts" / ".gitkeep").write_text("", encoding="utf-8")
    (output / "teacher" / "README.md").write_text(
        "# 老师原始材料\n\n把通知原文、附件、评分点、数据说明和模板原样放在这里。\n",
        encoding="utf-8",
    )

    manifest = build_manifest(args.course, args.experiment, args.contract, contract)
    (output / "result-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output / "README.md").write_text(
        f"# {args.course}：{args.experiment}\n\n"
        f"结果合同：`{args.contract}`（{contract.get('confidence', '置信度未标注')}）\n\n"
        "1. 将老师材料放入 `teacher/`；\n"
        "2. 先做要求差异分析，再适配代码；\n"
        "3. 所有运行输出写入 `artifacts/`；\n"
        "4. 填写 `result-manifest.json`；\n"
        "5. 运行 `reporting/audit_artifacts.py`；\n"
        "6. 审计通过后生成报告草稿。\n",
        encoding="utf-8",
    )
    print(f"已初始化：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
