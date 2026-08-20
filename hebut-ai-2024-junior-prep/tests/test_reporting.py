from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from reporting.core import build_markdown_report, load_contracts, validate_manifest

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = load_contracts(ROOT / "reporting" / "contracts.json")


class ReportingTests(unittest.TestCase):
    def make_valid_case(self, directory: Path) -> tuple[Path, dict]:
        artifacts = directory / "artifacts"
        artifacts.mkdir()
        (artifacts / "metrics.json").write_text(
            json.dumps({"gradient_max_error": 0.0}), encoding="utf-8"
        )
        (artifacts / "gradient_check.csv").write_text(
            "x,analytic,autograd\n2,8,8\n3,10,10\n", encoding="utf-8"
        )
        (artifacts / "run.log").write_text("gradient check passed\n", encoding="utf-8")

        manifest = {
            "meta": {
                "course": "深度学习",
                "experiment": "自动求导与梯度截断",
                "contract": "dl-exp1",
                "student": "测试用户",
                "student_id": "20240000",
                "class_name": "人工智能",
                "date": "2027-03-01",
                "git_commit": "abc123",
            },
            "purpose": ["验证自动求导。"],
            "environment": {
                "os": "Linux",
                "python": "3.11",
                "hardware": "CPU",
                "dependencies": {"torch": "2.5"},
            },
            "data": [],
            "methodology": ["计算解析梯度并与自动梯度比较。"],
            "parameters": [{"name": "max_norm", "value": 1.0, "reason": "实验设置"}],
            "metrics": [
                {
                    "id": "metric.gradient_max_error",
                    "name": "最大梯度误差",
                    "split": "all",
                    "value": 0.0,
                    "unit": "",
                    "source": "artifacts/metrics.json",
                },
                {
                    "id": "metric.norm_before_clip",
                    "name": "截断前范数",
                    "split": "all",
                    "value": 12.806248,
                    "unit": "",
                    "source": "artifacts/metrics.json",
                },
                {
                    "id": "metric.norm_after_clip",
                    "name": "截断后范数",
                    "split": "all",
                    "value": 1.0,
                    "unit": "",
                    "source": "artifacts/metrics.json",
                },
            ],
            "tables": [
                {
                    "id": "table.gradient_check",
                    "title": "梯度核验表",
                    "path": "artifacts/gradient_check.csv",
                    "caption": "两种梯度一致。",
                }
            ],
            "figures": [],
            "artifacts": [
                {
                    "id": "artifact.console_log",
                    "title": "日志",
                    "kind": "text",
                    "path": "artifacts/run.log",
                    "description": "完整日志",
                }
            ],
            "commands": [{"purpose": "run", "command": "python exp01.py"}],
            "findings": [
                {
                    "claim": "自动求导与解析梯度一致。",
                    "evidence": ["metric.gradient_max_error", "table.gradient_check"],
                    "caveat": "仅对本次函数成立。",
                }
            ],
            "problems": ["示例规模较小。"],
            "conclusion": ["完成梯度核验。"],
        }
        path = directory / "result-manifest.json"
        path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        return path, manifest

    def test_valid_manifest_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.make_valid_case(Path(temp))
            audit = validate_manifest(manifest, path, CONTRACTS)
            self.assertTrue(audit.ok, audit.errors)
            report = build_markdown_report(manifest, path)
            self.assertIn("自动求导与梯度截断实验报告", report)
            self.assertIn("| x | analytic | autograd |", report)
            self.assertIn("metric.gradient_max_error", report)

    def test_missing_contract_artifact_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.make_valid_case(Path(temp))
            manifest["tables"] = []
            audit = validate_manifest(manifest, path, CONTRACTS)
            self.assertFalse(audit.ok)
            self.assertTrue(any("table.gradient_check" in item for item in audit.errors))

    def test_unknown_evidence_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.make_valid_case(Path(temp))
            manifest["findings"][0]["evidence"] = ["metric.not_exists"]
            audit = validate_manifest(manifest, path, CONTRACTS)
            self.assertTrue(any("不存在的证据" in item for item in audit.errors))

    def test_absolute_path_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.make_valid_case(Path(temp))
            manifest["artifacts"][0]["path"] = "/tmp/run.log"
            audit = validate_manifest(manifest, path, CONTRACTS)
            self.assertTrue(any("绝对路径" in item for item in audit.errors))

    def test_direct_cli_audit_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            path, _ = self.make_valid_case(directory)
            audit = subprocess.run(
                [sys.executable, str(ROOT / "reporting" / "audit_artifacts.py"), str(path)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(audit.returncode, 0, audit.stdout + audit.stderr)

            output = directory / "report.md"
            build = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "reporting" / "build_report.py"),
                    str(path),
                    "--output",
                    str(output),
                    "--allow-warnings",
                ],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            self.assertTrue(output.exists())
            self.assertIn("自动求导与梯度截断实验报告", output.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
