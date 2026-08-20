from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REQUIRED_TOP_LEVEL = (
    "meta",
    "environment",
    "data",
    "methodology",
    "parameters",
    "metrics",
    "tables",
    "figures",
    "artifacts",
    "commands",
    "findings",
    "problems",
    "conclusion",
)
COLLECTION_SECTIONS = ("metrics", "tables", "figures", "artifacts")
PATH_SECTIONS = ("tables", "figures", "artifacts")


@dataclass(slots=True)
class AuditResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def load_manifest(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("manifest 顶层必须是 JSON 对象")
    return payload


def load_contracts(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("contracts 顶层必须是 JSON 对象")
    return payload


def is_todo(value: Any) -> bool:
    return isinstance(value, str) and "TODO" in value.upper()


def _is_relative_safe(path_text: str) -> bool:
    path = Path(path_text)
    return not path.is_absolute() and ".." not in path.parts


def _dict_items(value: Any, section: str, result: AuditResult) -> Iterable[dict[str, Any]]:
    if not isinstance(value, list):
        result.errors.append(f"{section} 必须是数组")
        return []
    output: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            result.errors.append(f"{section}[{index}] 必须是对象")
            continue
        output.append(item)
    return output


def _evidence_ids(manifest: dict[str, Any], result: AuditResult) -> dict[str, str]:
    ids: dict[str, str] = {}
    for section in COLLECTION_SECTIONS:
        for index, item in enumerate(_dict_items(manifest.get(section), section, result)):
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip():
                result.errors.append(f"{section}[{index}] 缺少非空 id")
                continue
            if identifier in ids:
                result.errors.append(
                    f"证据 id 重复：{identifier}（{ids[identifier]} 与 {section}[{index}]）"
                )
            else:
                ids[identifier] = f"{section}[{index}]"
    return ids


def _validate_paths(manifest: dict[str, Any], manifest_path: Path, result: AuditResult) -> None:
    base_dir = manifest_path.parent
    for section in PATH_SECTIONS:
        for index, item in enumerate(_dict_items(manifest.get(section), section, result)):
            path_text = item.get("path")
            if not isinstance(path_text, str) or not path_text.strip():
                result.errors.append(f"{section}[{index}] 缺少 path")
                continue
            if not _is_relative_safe(path_text):
                result.errors.append(
                    f"{section}[{index}] 使用了绝对路径或父目录跳转：{path_text}"
                )
                continue
            if not (base_dir / path_text).exists():
                result.errors.append(f"产物不存在：{path_text}（来自 {section}[{index}]）")

    for index, metric in enumerate(_dict_items(manifest.get("metrics"), "metrics", result)):
        source = metric.get("source")
        if source in (None, ""):
            result.warnings.append(f"metrics[{index}] 没有 source，数值无法追溯")
        elif not isinstance(source, str) or not _is_relative_safe(source):
            result.errors.append(f"metrics[{index}] 的 source 必须是安全相对路径")
        elif not (base_dir / source).exists():
            result.errors.append(f"指标来源文件不存在：{source}")


def _validate_metrics(manifest: dict[str, Any], result: AuditResult) -> None:
    for index, metric in enumerate(_dict_items(manifest.get("metrics"), "metrics", result)):
        value = metric.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            result.errors.append(f"metrics[{index}].value 必须是真实运行得到的数值")
        elif not math.isfinite(float(value)):
            result.errors.append(f"metrics[{index}].value 不能是 NaN 或 Infinity")


def _validate_findings(
    manifest: dict[str, Any], evidence_ids: dict[str, str], result: AuditResult
) -> None:
    for index, finding in enumerate(_dict_items(manifest.get("findings"), "findings", result)):
        claim = finding.get("claim")
        if not isinstance(claim, str) or not claim.strip() or is_todo(claim):
            result.errors.append(f"findings[{index}] 缺少已完成的 claim")
        evidence = finding.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            result.errors.append(f"findings[{index}] 必须引用至少一个证据 id")
            continue
        for identifier in evidence:
            if identifier not in evidence_ids:
                result.errors.append(
                    f"findings[{index}] 引用了不存在的证据 id：{identifier}"
                )


def _validate_meta_and_commands(manifest: dict[str, Any], result: AuditResult) -> None:
    meta = manifest.get("meta")
    if not isinstance(meta, dict):
        result.errors.append("meta 必须是对象")
    else:
        for key in ("course", "experiment", "contract"):
            value = meta.get(key)
            if not isinstance(value, str) or not value.strip() or is_todo(value):
                result.errors.append(f"meta.{key} 必须填写")
        for key in ("student", "student_id", "class_name", "date", "git_commit"):
            if meta.get(key) in (None, "") or is_todo(meta.get(key)):
                result.warnings.append(f"meta.{key} 仍待本人填写或核验")

    commands = list(_dict_items(manifest.get("commands"), "commands", result))
    if not commands:
        result.errors.append("commands 至少需要一条可复现命令")
    for index, item in enumerate(commands):
        command = item.get("command")
        if not isinstance(command, str) or not command.strip() or is_todo(command):
            result.errors.append(f"commands[{index}] 缺少可执行 command")


def _validate_contract(
    manifest: dict[str, Any], contracts: dict[str, Any] | None, result: AuditResult
) -> None:
    meta = manifest.get("meta")
    contract_id = meta.get("contract") if isinstance(meta, dict) else None
    if not isinstance(contract_id, str) or not contract_id:
        return
    if contracts is None:
        result.warnings.append("未加载 contracts.json，无法检查课程专属结果清单")
        return
    contract = contracts.get(contract_id)
    if not isinstance(contract, dict):
        result.errors.append(f"未知 contract：{contract_id}")
        return

    present: dict[str, str] = {}
    for section in COLLECTION_SECTIONS:
        for item in manifest.get(section, []):
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                present[item["id"]] = section
    required = contract.get("required_ids", [])
    if not isinstance(required, list):
        result.errors.append(f"contract {contract_id} 的 required_ids 格式错误")
        return
    for requirement in required:
        if not isinstance(requirement, dict):
            continue
        identifier = requirement.get("id")
        expected = requirement.get("section")
        if identifier not in present:
            result.errors.append(
                f"缺少合同产物 {identifier}：{requirement.get('description', '未说明')}"
            )
        elif expected and present[identifier] != expected:
            result.errors.append(
                f"{identifier} 应位于 {expected}，实际位于 {present[identifier]}"
            )


def validate_manifest(
    manifest: dict[str, Any],
    manifest_path: str | Path,
    contracts: dict[str, Any] | None = None,
) -> AuditResult:
    result = AuditResult()
    for key in REQUIRED_TOP_LEVEL:
        if key not in manifest:
            result.errors.append(f"缺少顶层字段：{key}")

    _validate_meta_and_commands(manifest, result)
    evidence_ids = _evidence_ids(manifest, result)
    _validate_paths(manifest, Path(manifest_path), result)
    _validate_metrics(manifest, result)
    _validate_findings(manifest, evidence_ids, result)
    _validate_contract(manifest, contracts, result)

    conclusion = manifest.get("conclusion")
    if not isinstance(conclusion, list) or not conclusion:
        result.errors.append("conclusion 必须是非空数组")
    elif any(not isinstance(item, str) or not item.strip() or is_todo(item) for item in conclusion):
        result.errors.append("conclusion 不能包含空项或 TODO")
    methodology = manifest.get("methodology")
    if not isinstance(methodology, list) or not methodology:
        result.errors.append("methodology 必须是非空数组")
    if not manifest.get("data"):
        result.warnings.append("data 为空：报告将缺少数据来源、规模与划分说明")
    if not manifest.get("problems"):
        result.warnings.append("problems 为空：建议记录失败样例、局限或异常")
    return result
