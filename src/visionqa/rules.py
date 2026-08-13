from __future__ import annotations

from typing import Any


HARD_GATE_BY_CATEGORY = {
    "product_fidelity": "product_fidelity",
    "human_integrity": "human_integrity",
    "text_logo": "text_logo",
    "compliance": "compliance",
    "assessability": "assessability",
}
BASE_GATES = (
    "product_fidelity",
    "human_integrity",
    "text_logo",
    "compliance",
    "assessability",
)


def evaluate_rules(
    observations: list[dict[str, Any]], scope: dict[str, Any]
) -> dict[str, Any]:
    """Apply conservative simulation rules.

    Major/minor aggregation thresholds are fixtures for TECH-001 only and remain
    unvalidated for production use.
    """
    blockers = [item for item in observations if item["severity"] == "blocker"]
    majors = [item for item in observations if item["severity"] == "major"]
    minors = [item for item in observations if item["severity"] == "minor"]
    insufficient = [
        item
        for item in observations
        if item["severity"] == "information_insufficient"
    ]
    gate_hits: list[dict[str, Any]] = []

    if blockers:
        for gate_id in _unique(
            HARD_GATE_BY_CATEGORY[item["category"]] for item in blockers
        ):
            related = [
                item["observation_id"]
                for item in blockers
                if HARD_GATE_BY_CATEGORY[item["category"]] == gate_id
            ]
            gate_hits.append(_gate(gate_id, "REJECT", related, "检测到 blocker"))
        decision, reason = "REJECT", "至少一个已确认的 Blocker 命中硬门禁"
    elif len(majors) >= 2:
        gate_hits.append(
            _gate(
                "major_aggregation",
                "REJECT",
                [item["observation_id"] for item in majors],
                "模拟规则：多个 Major 聚合；生产阈值待验证",
            )
        )
        decision, reason = "REJECT", "模拟用多个 Major 聚合规则命中；阈值待验证"
    elif majors:
        gate_hits.append(
            _gate(
                "major_aggregation",
                "REVIEW",
                [item["observation_id"] for item in majors],
                "至少一个 Major 需要人工复核",
            )
        )
        decision, reason = "REVIEW", "存在 Major，需要人工复核"
    elif insufficient or scope["product_fidelity"]["status"] != "VERIFIED":
        if scope["product_fidelity"]["status"] != "VERIFIED":
            gate_hits.append(
                _gate(
                    "product_fidelity",
                    "NOT_EVALUATED",
                    _ids_for_code(observations, "AS-04"),
                    "商品忠实度参考材料不足",
                )
            )
        gate_hits.append(
            _gate(
                "assessability",
                "REVIEW",
                [item["observation_id"] for item in insufficient],
                "信息不足，需要补充材料或人工确认",
            )
        )
        decision, reason = "REVIEW", "核验范围或输入信息不足"
    elif minors:
        gate_hits.append(
            _gate(
                "minor_aggregation",
                "REVIEW",
                [item["observation_id"] for item in minors],
                "模拟保守规则：Minor 聚合进入复核；生产阈值待验证",
            )
        )
        decision, reason = "REVIEW", "存在 Minor；当前未验证阶段保守进入复核"
    else:
        gate_hits.extend(
            _gate(gate_id, "PASS", [], "模拟输入未提供该门禁缺陷")
            for gate_id in BASE_GATES
        )
        decision, reason = "PASS", "模拟输入材料齐全且未提供可见缺陷"

    required_checks = []
    if decision == "REVIEW":
        required_checks.append("由人工复核本次观察与输入材料")
    if scope["product_fidelity"]["status"] != "VERIFIED":
        required_checks.append("补充商品参考图和 SKU 不可改变项")
    if decision == "PASS":
        required_checks.append("阈值验证完成前仍需 100% 人工复核")

    return {
        "status": "SUCCEEDED",
        "decision": decision,
        "decision_reason": reason,
        "decision_confidence": None,
        "gate_hits": gate_hits,
        "dimension_scores": _dimension_scores(observations),
        "overall_score": None,
        "required_human_checks": required_checks,
        "recommended_actions": [],
    }


def _gate(
    gate_id: str, result: str, observation_ids: list[str], reason: str
) -> dict[str, Any]:
    return {
        "gate_id": gate_id,
        "result": result,
        "related_observation_ids": observation_ids,
        "rule_version": "gates-0.1-simulation",
        "reason": reason,
    }


def _dimension_scores(observations: list[dict[str, Any]]) -> dict[str, int | None]:
    categories = (
        "product_fidelity",
        "human_integrity",
        "garment_material",
        "photographic_physics",
        "composition_commercial",
        "text_logo",
        "compliance",
        "assessability",
    )
    scores: dict[str, int | None] = {category: 4 for category in categories}
    score_by_severity = {
        "blocker": 0,
        "major": 2,
        "minor": 3,
        "information_insufficient": None,
    }
    for item in observations:
        score = score_by_severity[item["severity"]]
        current = scores[item["category"]]
        if score is None:
            scores[item["category"]] = None
        elif current is not None:
            scores[item["category"]] = min(current, score)
    return scores


def _ids_for_code(observations: list[dict[str, Any]], code: str) -> list[str]:
    return [
        item["observation_id"]
        for item in observations
        if item["issue_code"] == code
    ]


def _unique(values: Any) -> list[str]:
    return list(dict.fromkeys(values))
