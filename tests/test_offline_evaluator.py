from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from visionqa.evaluator import SimulationEvaluator
from visionqa.runner import evaluate_dataset, evaluate_record, read_manifest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "datasets" / "simulation_manifest_v0.1.jsonl"


class OfflineEvaluatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.records = read_manifest(MANIFEST)
        cls.by_id = {record["case_id"]: record for record in cls.records}
        cls.evaluator = SimulationEvaluator()

    def result(self, case_id: str) -> dict:
        return evaluate_record(
            self.by_id[case_id],
            self.evaluator,
            "test_run",
            "simulation-0.1",
        )

    def test_manifest_has_twelve_cases(self) -> None:
        self.assertEqual(12, len(self.records))

    def test_all_twelve_expected_decisions(self) -> None:
        for record in self.records:
            with self.subTest(case_id=record["case_id"]):
                actual = self.result(record["case_id"])["rule_evaluation"]["decision"]
                self.assertEqual(record["expected_decision"], actual)

    def test_blocker_is_not_offset_by_soft_scores(self) -> None:
        result = self.result("SIM-001")
        self.assertEqual("REJECT", result["rule_evaluation"]["decision"])
        scores = result["rule_evaluation"]["dimension_scores"]
        self.assertTrue(any(score == 4 for score in scores.values()))
        self.assertIsNone(result["rule_evaluation"]["overall_score"])

    def test_information_insufficient_is_review(self) -> None:
        result = self.result("SIM-009")
        self.assertEqual("REVIEW", result["rule_evaluation"]["decision"])
        self.assertEqual(
            "NOT_VERIFIED", result["scope"]["product_fidelity"]["status"]
        )

    def test_model_layer_has_no_decision(self) -> None:
        result = self.result("SIM-002")
        self.assertNotIn("decision", result["model_evaluation"])
        self.assertEqual("REJECT", result["rule_evaluation"]["decision"])

    def test_jsonl_output_is_parseable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "results.jsonl"
            summary = evaluate_dataset(
                self.records, self.evaluator, output, "simulation-0.1"
            )
            lines = output.read_text(encoding="utf-8").splitlines()
            parsed = [json.loads(line) for line in lines]
            self.assertEqual(12, summary["count"])
            self.assertEqual(12, len(parsed))
            self.assertTrue(all(row["schema_version"] == "0.1.0" for row in parsed))

    def test_gate_observation_references_exist(self) -> None:
        for record in self.records:
            result = self.result(record["case_id"])
            observation_ids = {
                item["observation_id"]
                for item in result["model_evaluation"]["observations"]
            }
            for gate in result["rule_evaluation"]["gate_hits"]:
                self.assertLessEqual(
                    set(gate["related_observation_ids"]), observation_ids
                )

    def test_simulation_cost_is_not_applicable(self) -> None:
        cost = self.result("SIM-010")["performance"]["cost"]
        self.assertEqual("NOT_APPLICABLE", cost["status"])
        self.assertIsNone(cost["amount"])


if __name__ == "__main__":
    unittest.main()
