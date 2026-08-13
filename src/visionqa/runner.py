from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .evaluator import EvaluationContext, Evaluator
from .rules import evaluate_rules

ISSUE_CATEGORY_BY_CODE = {
    **{f"PF-{number:02d}": "product_fidelity" for number in range(1, 7)},
    **{f"HI-{number:02d}": "human_integrity" for number in range(1, 8)},
    **{f"GM-{number:02d}": "garment_material" for number in range(1, 7)},
    **{f"PP-{number:02d}": "photographic_physics" for number in range(1, 8)},
    **{f"CC-{number:02d}": "composition_commercial" for number in range(1, 7)},
    **{f"TL-{number:02d}": "text_logo" for number in range(1, 6)},
    **{f"CO-{number:02d}": "compliance" for number in range(1, 6)},
    **{f"AS-{number:02d}": "assessability" for number in range(1, 7)},
}
SCOPE_STATUSES = {"VERIFIED", "LIMITED", "NOT_VERIFIED", "NOT_APPLICABLE"}
COMPLIANCE_MODES = {
    "VISUAL_SCREENING_ONLY",
    "POLICY_RULESET_PROVIDED",
    "LEGAL_REVIEWED",
}


def read_manifest(path: Path) -> list[dict[str, Any]]:
    records = []
    case_ids: set[str] = set()
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error}") from error
            _validate_manifest_record(record, line_number)
            if record["case_id"] in case_ids:
                raise ValueError(
                    f"{path}:{line_number}: duplicate case_id {record['case_id']!r}"
                )
            case_ids.add(record["case_id"])
            records.append(record)
    if not records:
        raise ValueError(f"{path}: manifest contains no records")
    return records


def evaluate_dataset(
    records: Iterable[dict[str, Any]],
    evaluator: Evaluator,
    output_path: Path,
    dataset_version: str = "simulation-0.1",
) -> dict[str, Any]:
    run_id = datetime.now(timezone.utc).strftime("run_%Y%m%dT%H%M%SZ")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    decisions = {"PASS": 0, "REVIEW": 0, "REJECT": 0}
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            result = evaluate_record(record, evaluator, run_id, dataset_version)
            handle.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")
            count += 1
            decisions[result["rule_evaluation"]["decision"]] += 1
    return {"run_id": run_id, "count": count, "decisions": decisions}


def evaluate_record(
    record: dict[str, Any],
    evaluator: Evaluator,
    run_id: str,
    dataset_version: str,
) -> dict[str, Any]:
    started = time.perf_counter()
    asset_id = record["case_id"]
    response = evaluator.evaluate(
        EvaluationContext(
            asset_id=asset_id,
            description=record["case_description"],
            expected_issues=record["expected_issues"],
        ),
        run_id,
    )
    scope = _normalize_scope(record["scope"])
    rule_result = evaluate_rules(response.observations, scope)
    latency_ms = max(0, round((time.perf_counter() - started) * 1000))
    return {
        "schema_version": "0.1.0",
        "run": {
            "run_id": run_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "code_version": "tech-001",
            "dataset_version": dataset_version,
            "taxonomy_version": "0.1",
            "gates_version": "0.1-simulation",
            "prompt_version": "simulation-observer-0.1.0",
            "provider_adapter_version": evaluator.adapter_version,
            "model_snapshot": evaluator.model_snapshot,
            "configuration_hash": "sha256:" + _sha256_json(record),
        },
        "input": {
            "asset_id": asset_id,
            "asset_sha256": hashlib.sha256(asset_id.encode("utf-8")).hexdigest(),
            "scenario": "fashion_ecommerce_ai_model_image",
            "reference_asset_ids": (
                [f"{asset_id}_reference"]
                if scope["product_fidelity"]["status"] == "VERIFIED"
                else []
            ),
        },
        "scope": scope,
        "model_evaluation": {
            "status": response.status,
            "status_detail": response.status_detail,
            "observations": response.observations,
            "warnings": response.warnings,
            "raw_response_ref": response.raw_response_ref,
        },
        "rule_evaluation": rule_result,
        "performance": {
            "latency_ms": latency_ms,
            "attempt_count": 1,
            "cost": {
                "status": "NOT_APPLICABLE",
                "amount": None,
                "currency": None,
            },
        },
    }


def _normalize_scope(scope: dict[str, str]) -> dict[str, Any]:
    compliance_mode = scope["compliance"]
    compliance_status = (
        "VERIFIED"
        if compliance_mode in {"POLICY_RULESET_PROVIDED", "LEGAL_REVIEWED"}
        else "LIMITED"
    )
    return {
        "product_fidelity": {"status": scope["product_fidelity"]},
        "brand_guideline": {"status": scope["brand_guideline"]},
        "channel_requirements": {"status": scope["channel_requirements"]},
        "compliance": {
            "status": compliance_status,
            "mode": compliance_mode,
            "reason": "模拟 manifest 声明的核验范围",
        },
    }


def _validate_manifest_record(record: dict[str, Any], line_number: int) -> None:
    required = {
        "case_id",
        "simulation_only",
        "has_real_image",
        "case_description",
        "scope",
        "expected_issues",
        "expected_gate_hits",
        "expected_decision",
        "note",
    }
    missing = required - record.keys()
    if missing:
        raise ValueError(f"manifest line {line_number}: missing {sorted(missing)}")
    if record["simulation_only"] is not True:
        raise ValueError(f"manifest line {line_number}: only simulation cases allowed")
    if not isinstance(record["case_id"], str) or not record["case_id"].strip():
        raise ValueError(f"manifest line {line_number}: invalid case_id")
    if not isinstance(record["case_description"], str) or not record[
        "case_description"
    ].strip():
        raise ValueError(f"manifest line {line_number}: invalid case_description")
    if record["expected_decision"] not in {"PASS", "REVIEW", "REJECT"}:
        raise ValueError(f"manifest line {line_number}: invalid expected_decision")
    scope = record["scope"]
    required_scope = {
        "product_fidelity",
        "brand_guideline",
        "channel_requirements",
        "compliance",
    }
    if not isinstance(scope, dict) or required_scope - scope.keys():
        raise ValueError(f"manifest line {line_number}: incomplete scope")
    for name in required_scope - {"compliance"}:
        if scope[name] not in SCOPE_STATUSES:
            raise ValueError(f"manifest line {line_number}: invalid scope {name}")
    if scope["compliance"] not in COMPLIANCE_MODES:
        raise ValueError(f"manifest line {line_number}: invalid compliance mode")
    if not isinstance(record["expected_issues"], list):
        raise ValueError(f"manifest line {line_number}: expected_issues must be a list")
    for issue_index, issue in enumerate(record["expected_issues"], start=1):
        required_issue = {"issue_code", "category", "severity", "status"}
        if not isinstance(issue, dict) or required_issue - issue.keys():
            raise ValueError(
                f"manifest line {line_number}: issue {issue_index} is incomplete"
            )
        code = issue["issue_code"]
        if code not in ISSUE_CATEGORY_BY_CODE:
            raise ValueError(
                f"manifest line {line_number}: unknown taxonomy issue code {code!r}"
            )
        if issue["category"] != ISSUE_CATEGORY_BY_CODE[code]:
            raise ValueError(
                f"manifest line {line_number}: issue {code} category mismatch"
            )
        if issue["severity"] not in {
            "blocker",
            "major",
            "minor",
            "information_insufficient",
        }:
            raise ValueError(f"manifest line {line_number}: invalid issue severity")
        if issue["status"] not in {"detected", "suspected", "not_assessable"}:
            raise ValueError(f"manifest line {line_number}: invalid issue status")


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
