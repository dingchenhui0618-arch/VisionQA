from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class EvaluationContext:
    asset_id: str
    description: str
    expected_issues: list[dict[str, Any]]


@dataclass(frozen=True)
class EvaluationResponse:
    status: str
    status_detail: str
    observations: list[dict[str, Any]]
    warnings: list[str]
    raw_response_ref: str


class Evaluator(Protocol):
    """Provider-neutral boundary: evaluators return observations, not decisions."""

    adapter_version: str
    model_snapshot: str

    def evaluate(self, context: EvaluationContext, run_id: str) -> EvaluationResponse:
        ...


class SimulationEvaluator:
    """Deterministic adapter for contract tests. It does not inspect real images."""

    adapter_version = "simulation-adapter-0.1.0"
    model_snapshot = "simulation-fixture-v0.1"

    def evaluate(self, context: EvaluationContext, run_id: str) -> EvaluationResponse:
        observations: list[dict[str, Any]] = []
        for index, issue in enumerate(context.expected_issues, start=1):
            issue_code = issue["issue_code"]
            severity = issue["severity"]
            status = issue["status"]
            observations.append(
                {
                    "observation_id": f"{context.asset_id.lower()}_obs_{index:03d}",
                    "issue_code": issue_code,
                    "category": issue["category"],
                    "severity": severity,
                    "status": status,
                    "region": {
                        "asset_id": context.asset_id,
                        "coordinate_space": "UNSPECIFIED",
                        "label": "模拟案例描述所指区域",
                    },
                    "observation": (
                        f"模拟观察 {issue_code}：{context.description}"
                    ),
                    "impact": _impact_for(severity),
                    "confidence": 1.0,
                    "evidence_refs": [context.asset_id],
                    "related_categories": [],
                }
            )
        return EvaluationResponse(
            status="SUCCEEDED",
            status_detail="由 simulation adapter 根据预期观察生成；未分析真实图片",
            observations=observations,
            warnings=["模拟协议与门禁演练，不代表真实模型准确率。"],
            raw_response_ref=f"runs/{run_id}/raw/{context.asset_id}.json",
        )


def _impact_for(severity: str) -> str:
    return {
        "blocker": "触发候选硬门禁；不得被软评分抵消",
        "major": "需要人工复核或明显返工",
        "minor": "降低发布质量；聚合阈值待真实素材验证",
        "information_insufficient": "限制本次可验证范围，需要补充材料",
    }[severity]
