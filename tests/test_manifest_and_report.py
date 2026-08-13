from __future__ import annotations

import copy
import html
import json
import tempfile
import unittest
from pathlib import Path

from visionqa.evaluator import SimulationEvaluator
from visionqa.report import SIMULATION_WARNING, render_report
from visionqa.runner import evaluate_record, read_manifest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "datasets" / "simulation_manifest_v0.1.jsonl"


class ManifestValidationTests(unittest.TestCase):
    def write_records(self, directory: str, records: list[dict]) -> Path:
        path = Path(directory) / "manifest.jsonl"
        path.write_text(
            "\n".join(json.dumps(row, ensure_ascii=False) for row in records) + "\n",
            encoding="utf-8",
        )
        return path

    def test_invalid_issue_code_is_rejected(self) -> None:
        records = read_manifest(MANIFEST)
        records[0]["expected_issues"][0]["issue_code"] = "PF-99"
        with tempfile.TemporaryDirectory() as temp_dir:
            path = self.write_records(temp_dir, records)
            with self.assertRaisesRegex(ValueError, "unknown taxonomy issue code"):
                read_manifest(path)

    def test_duplicate_case_id_is_rejected(self) -> None:
        records = read_manifest(MANIFEST)
        records[1]["case_id"] = records[0]["case_id"]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = self.write_records(temp_dir, records)
            with self.assertRaisesRegex(ValueError, "duplicate case_id"):
                read_manifest(path)


class ReportTests(unittest.TestCase):
    def setUp(self) -> None:
        record = copy.deepcopy(read_manifest(MANIFEST)[0])
        self.result = evaluate_record(
            record, SimulationEvaluator(), "report_test", "simulation-0.1"
        )

    def test_report_escapes_dynamic_content(self) -> None:
        payload = '<script>alert("x")</script>'
        self.result["input"]["asset_id"] = payload
        self.result["model_evaluation"]["observations"][0]["observation"] = payload
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "report.html"
            render_report([self.result], output)
            document = output.read_text(encoding="utf-8")
            self.assertNotIn(payload, document)
            self.assertIn(html.escape(payload), document)

    def test_report_has_unambiguous_simulation_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "report.html"
            summary = render_report([self.result], output)
            document = output.read_text(encoding="utf-8")
            self.assertTrue(summary["simulation_only"])
            self.assertIn(SIMULATION_WARNING, document)
            self.assertIn("不得用于宣称模型准确率", document)
            self.assertNotIn("真实准确率", document)


if __name__ == "__main__":
    unittest.main()
