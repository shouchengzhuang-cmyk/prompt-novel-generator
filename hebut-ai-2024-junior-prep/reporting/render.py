from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from .validation import is_todo


def _md_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def _table(headers: list[str], rows: list[list[Any]]) -> str:
    lines = [
        "| " + " | ".join(_md_cell(item) for item in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(_md_cell(item) for item in row) + " |" for row in rows)
    return "\n".join(lines)


def _inline_csv(path: Path, max_rows: int = 40, max_columns: int = 12) -> str | None:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.reader(handle))
    except (OSError, UnicodeError, csv.Error):
        return None
    if not rows or len(rows[0]) > max_columns:
        return None
    output = _table(rows[0], rows[1 : max_rows + 1])
    if len(rows) - 1 > max_rows:
        output += f"\n\n> 仅内嵌前 {max_rows} 行；完整结果见原 CSV。"
    return output


def _todo_paths(manifest: dict[str, Any]) -> list[str]:
    output: list[str] = []

    def walk(value: Any, path: str) -> None:
        if is_todo(value):
            output.append(path)
        elif isinstance(value, dict):
            for key, item in value.items():
                walk(item, f"{path}.{key}" if path else key)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f"{path}[{index}]")

    walk(manifest, "")
    return output


def build_markdown_report(manifest: dict[str, Any], manifest_path: str | Path) -> str:
    base_dir = Path(manifest_path).parent
    meta = manifest["meta"]
    lines: list[str] = [
        f"# {meta['course']}：{meta['experiment']}实验报告",
        "",
        "> 本报告由结构化结果清单生成。所有数字、图表和结论必须能追溯到本次运行产物。",
        "",
        "## 1. 实验信息",
        "",
        _table(
            ["项目", "内容"],
            [
                ["课程", meta.get("course", "")],
                ["实验", meta.get("experiment", "")],
                ["姓名", meta.get("student", "TODO")],
                ["学号", meta.get("student_id", "TODO")],
                ["班级", meta.get("class_name", "TODO")],
                ["日期", meta.get("date", "TODO")],
                ["代码版本", meta.get("git_commit", "TODO")],
                ["结果合同", meta.get("contract", "")],
            ],
        ),
        "",
        "## 2. 实验目的",
        "",
    ]
    lines.extend(f"- {item}" for item in manifest.get("purpose", []))

    lines.extend(["", "## 3. 环境与依赖", ""])
    environment = manifest.get("environment", {})
    env_rows = [[key, value] for key, value in environment.items() if key != "dependencies"]
    dependencies = environment.get("dependencies", {}) if isinstance(environment, dict) else {}
    if isinstance(dependencies, dict):
        env_rows.extend([[f"依赖：{key}", value] for key, value in dependencies.items()])
    lines.extend([_table(["项目", "值"], env_rows), ""])

    lines.extend(["## 4. 数据说明", ""])
    data_rows = []
    for item in manifest.get("data", []):
        if isinstance(item, dict):
            data_rows.append(
                [item.get(key, "") for key in ("name", "source", "path", "samples", "split", "notes")]
            )
    lines.extend(
        [_table(["数据", "来源", "路径", "样本量", "划分", "说明"], data_rows), ""]
        if data_rows
        else ["> 尚未登记数据。", ""]
    )

    lines.extend(["## 5. 方法与流程", ""])
    lines.extend(
        f"{index}. {item}" for index, item in enumerate(manifest.get("methodology", []), start=1)
    )

    lines.extend(["", "## 6. 参数设置", ""])
    parameter_rows = [
        [item.get("name", ""), item.get("value", ""), item.get("reason", "")]
        for item in manifest.get("parameters", [])
        if isinstance(item, dict)
    ]
    lines.extend(
        [_table(["参数", "值", "设置依据"], parameter_rows), ""]
        if parameter_rows
        else ["> 本实验未登记可调参数。", ""]
    )

    lines.extend(["## 7. 实验结果", "", "### 7.1 核心指标", ""])
    metric_rows = [
        [
            item.get("id", ""),
            item.get("name", ""),
            item.get("split", ""),
            item.get("value", ""),
            item.get("unit", ""),
            item.get("source", ""),
        ]
        for item in manifest.get("metrics", [])
        if isinstance(item, dict)
    ]
    lines.extend(
        [_table(["证据 ID", "指标", "数据划分", "值", "单位", "来源"], metric_rows), ""]
        if metric_rows
        else ["> 尚未登记指标。", ""]
    )

    lines.extend(["### 7.2 结果表", ""])
    for item in manifest.get("tables", []):
        if not isinstance(item, dict):
            continue
        title, path_text = item.get("title", item.get("id", "结果表")), item.get("path", "")
        lines.extend(
            [f"#### {title}", "", f"证据 ID：`{item.get('id', '')}`  ", f"文件：`{path_text}`", ""]
        )
        if isinstance(path_text, str) and path_text.lower().endswith(".csv"):
            embedded = _inline_csv(base_dir / path_text)
            if embedded:
                lines.extend([embedded, ""])
        if item.get("caption"):
            lines.extend([f"> {item['caption']}", ""])

    lines.extend(["### 7.3 图像与截图", ""])
    for item in manifest.get("figures", []):
        if not isinstance(item, dict):
            continue
        title, path_text = item.get("title", item.get("id", "图")), item.get("path", "")
        lines.extend(
            [f"#### {title}", "", f"证据 ID：`{item.get('id', '')}`", "", f"![{title}]({path_text})", ""]
        )
        if item.get("caption"):
            lines.extend([f"> {item['caption']}", ""])

    lines.extend(["### 7.4 其他产物", ""])
    artifact_rows = [
        [item.get(key, "") for key in ("id", "title", "kind", "path", "description")]
        for item in manifest.get("artifacts", [])
        if isinstance(item, dict)
    ]
    lines.extend(
        [_table(["证据 ID", "产物", "类型", "路径", "说明"], artifact_rows), ""]
        if artifact_rows
        else ["> 无其他产物。", ""]
    )

    lines.extend(["## 8. 结果解释与证据追踪", ""])
    for index, item in enumerate(manifest.get("findings", []), start=1):
        if not isinstance(item, dict):
            continue
        evidence = ", ".join(f"`{value}`" for value in item.get("evidence", []))
        lines.extend([f"### 发现 {index}", "", item.get("claim", ""), "", f"- 证据：{evidence}"])
        if item.get("caveat"):
            lines.append(f"- 局限：{item['caveat']}")
        lines.append("")

    lines.extend(["## 9. 问题、失败样例与局限", ""])
    for item in manifest.get("problems", []):
        if isinstance(item, dict):
            text = f"- **{item.get('title', '问题')}**：{item.get('description', '')}"
            if item.get("action"):
                text += f"；处理：{item['action']}"
            lines.append(text)
        else:
            lines.append(f"- {item}")

    lines.extend(["", "## 10. 结论", ""])
    lines.extend(f"- {item}" for item in manifest.get("conclusion", []))
    lines.extend(["", "## 11. 可复现命令", ""])
    for item in manifest.get("commands", []):
        if isinstance(item, dict):
            lines.extend(
                [f"### {item.get('purpose', '运行')}", "", "```bash", item.get("command", ""), "```", ""]
            )

    lines.extend(["## 12. 提交前人工核验", ""])
    todo_paths = _todo_paths(manifest)
    if todo_paths:
        lines.extend(["以下字段仍含 TODO，提交前必须由本人填写或核验：", ""])
        lines.extend(f"- `{item}`" for item in todo_paths)
    else:
        lines.append("结构化清单中未检测到 TODO；仍需本人阅读全文、核对截图和准备答辩。")
    return "\n".join(lines).rstrip() + "\n"
