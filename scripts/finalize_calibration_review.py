from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean


ROOT = Path(r"D:\VisionQA")
DATA_DIR = ROOT / "data" / "commercial_reference_corpus_v0.2"
SOURCE = DATA_DIR / "calibration_human_review_v0.1.csv"
GOLD = DATA_DIR / "gold_labels_calibration_v0.1.csv"
STATS = DATA_DIR / "calibration_statistics_v0.1.json"
VALIDATION = DATA_DIR / "human_review_validation_report_v0.1.md"
GAP = DATA_DIR / "qwen_human_gap_report_v0.1.md"
QWEN = ROOT / "data" / "mixed_commercial_reference_v0.3" / "provisional_reference_labels.csv"

NA = {"", "NOT_APPLICABLE", "NOT_ASSESSABLE"}
SCORE_COLUMNS = [
    "human_realism_score",
    "photography_realism_score",
    "material_realism_score",
    "product_prominence_score",
    "selling_point_clarity_score",
    "promotion_hierarchy_score",
    "information_legibility_score",
    "click_motivation_score",
    "channel_placement_fit_score",
    "overall_score",
]
COMMERCIAL_WEIGHTS = {
    "product_prominence_score": 0.25,
    "selling_point_clarity_score": 0.20,
    "promotion_hierarchy_score": 0.20,
    "information_legibility_score": 0.15,
    "click_motivation_score": 0.10,
    "channel_placement_fit_score": 0.10,
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def numeric(value: str) -> float | None:
    if value.strip() in NA:
        return None
    return float(value)


def threshold_gate(score: float) -> str:
    if score >= 90:
        return "PASS"
    if score >= 70:
        return "REVIEW"
    return "REJECT"


def weighted_available(row: dict[str, str], weights: dict[str, float]) -> float | None:
    values = [(numeric(row[column]), weight) for column, weight in weights.items()]
    applicable = [(value, weight) for value, weight in values if value is not None]
    if not applicable:
        return None
    return sum(value * weight for value, weight in applicable) / sum(weight for _, weight in applicable)


def main() -> None:
    rows = read_csv(SOURCE)
    errors: list[str] = []
    warnings: list[str] = []

    if len(rows) != 40:
        errors.append(f"期望 40 行，实际 {len(rows)} 行")
    for key in ("asset_alias", "sha256"):
        values = [row[key] for row in rows]
        if len(values) != len(set(values)):
            errors.append(f"{key} 存在重复")

    enriched: list[dict[str, str]] = []
    raw_gate_mismatches = 0
    formula_deltas: list[float] = []
    for index, row in enumerate(rows, start=2):
        for column in SCORE_COLUMNS:
            try:
                value = numeric(row[column])
            except ValueError:
                errors.append(f"第 {index} 行 {column} 不是数字或允许的 NA 标签")
                continue
            if value is not None and not 0 <= value <= 100:
                errors.append(f"第 {index} 行 {column} 超出 0–100")
        if not row["intended_placement"].strip():
            errors.append(f"第 {index} 行缺 intended_placement")
        if row["review_status"] != "COMPLETED":
            errors.append(f"第 {index} 行 review_status 不是 COMPLETED")
        if not row["reviewer_id"].strip():
            errors.append(f"第 {index} 行缺 reviewer_id")

        overall = numeric(row["overall_score"])
        if overall is None:
            errors.append(f"第 {index} 行缺 overall_score")
            continue
        normalized_gate = threshold_gate(overall)
        gate_consistency = "CONSISTENT" if row["human_decision"] == normalized_gate else "NORMALIZED_FROM_RAW"
        if gate_consistency != "CONSISTENT":
            raw_gate_mismatches += 1

        commercial = weighted_available(row, COMMERCIAL_WEIGHTS)
        formula_overall: float | None = None
        if commercial is not None:
            objective = [numeric(row[name]) for name in (
                "human_realism_score",
                "photography_realism_score",
                "material_realism_score",
            )]
            if all(value is not None for value in objective):
                formula_overall = round(
                    objective[0] * 0.25
                    + objective[1] * 0.20
                    + objective[2] * 0.20
                    + commercial * 0.35,
                    2,
                )
                formula_deltas.append(round(overall - formula_overall, 2))

        output = dict(row)
        output["human_decision_raw"] = row["human_decision"]
        output["threshold_gate_decision"] = normalized_gate
        output["gate_consistency"] = gate_consistency
        output["commercial_value_derived"] = "" if commercial is None else f"{commercial:.2f}"
        output["formula_overall_score"] = "" if formula_overall is None else f"{formula_overall:.2f}"
        output["formula_delta_vs_reviewer"] = "" if formula_overall is None else f"{overall - formula_overall:.2f}"
        output["gold_label_status"] = "GOLD_HUMAN_SCORE_GATE_NORMALIZED_V0.1"
        enriched.append(output)

    fieldnames = list(enriched[0])
    with GOLD.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(enriched)

    score_values = [float(row["overall_score"]) for row in rows]
    placement_scores: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        placement_scores[row["intended_placement"]].append(float(row["overall_score"]))
    stats = {
        "schema_version": "calibration-statistics@0.1.0",
        "source": str(SOURCE),
        "row_count": len(rows),
        "unique_assets": len({row["asset_alias"] for row in rows}),
        "review_status": dict(Counter(row["review_status"] for row in rows)),
        "reviewers": dict(Counter(row["reviewer_id"] for row in rows)),
        "overall_score": {
            "min": min(score_values),
            "max": max(score_values),
            "mean": round(mean(score_values), 2),
        },
        "raw_human_decision": dict(Counter(row["human_decision"] for row in rows)),
        "threshold_gate_decision": dict(Counter(threshold_gate(float(row["overall_score"])) for row in rows)),
        "raw_gate_mismatches": raw_gate_mismatches,
        "placements": {
            placement: {
                "count": len(values),
                "mean": round(mean(values), 2),
                "min": min(values),
                "max": max(values),
            }
            for placement, values in sorted(placement_scores.items())
        },
        "formula_delta_vs_reviewer": {
            "comparable_count": len(formula_deltas),
            "mean": round(mean(formula_deltas), 2) if formula_deltas else None,
            "min": min(formula_deltas) if formula_deltas else None,
            "max": max(formula_deltas) if formula_deltas else None,
        },
        "validation_errors": errors,
        "validation_warnings": warnings,
    }
    STATS.write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    validation_status = "PASS_WITH_GATE_NORMALIZATION" if not errors else "FAIL"
    unique_asset_count = len({row["asset_alias"] for row in rows})
    VALIDATION.write_text(
        "\n".join([
            "# VisionQA 人工校准评分验收报告 v0.1",
            "",
            f"- 验收状态：`{validation_status}`",
            f"- 完整性：{len(rows)}/40，唯一素材 {unique_asset_count} 张",
            f"- 评审状态：{dict(Counter(row['review_status'] for row in rows))}",
            f"- 综合分：{min(score_values):.0f}–{max(score_values):.0f}，平均 {mean(score_values):.2f}",
            f"- 原始人工决定：{dict(Counter(row['human_decision'] for row in rows))}",
            f"- 按产品阈值归一化：{dict(Counter(threshold_gate(float(row['overall_score'])) for row in rows))}",
            "",
            "## 关键处理",
            "",
            f"原表有 {raw_gate_mismatches} 行 `human_decision` 与产品 Gate（≥90 PASS、70–89 REVIEW、<70 REJECT）不一致。原始决定没有被覆盖；Gold 文件同时保留 `human_decision_raw`，并新增 `threshold_gate_decision` 作为系统运行 Gate。",
            "",
            "这些素材仍可全部作为客户确认的优秀正向审美参考；但“优秀参考素材”不等于“在指定图位自动通过”。训练语义与上线 Gate 已分离。",
            "",
            "人工填写的 `overall_score` 被视为评审员综合判断并保留。`formula_overall_score` 仅作为 25/20/20/35 权重核查列，不回写覆盖人工分；非适用商业子项按剩余适用权重归一化。",
            "",
            "## 验收问题",
            "",
            *(f"- ERROR：{item}" for item in errors),
            *(f"- WARNING：{item}" for item in warnings),
            "- 无阻断性数据错误。" if not errors else "",
            "",
            "## 输出",
            "",
            f"- Gold：`{GOLD}`",
            f"- 统计：`{STATS}`",
        ]) + "\n",
        encoding="utf-8",
    )

    qwen_rows = {row["asset_alias"]: row for row in read_csv(QWEN)} if QWEN.exists() else {}
    overlaps = [row for row in rows if row["asset_alias"] in qwen_rows]
    comparable = []
    mismatch_context = []
    for row in overlaps:
        qwen = qwen_rows[row["asset_alias"]]
        if qwen["intended_placement"] == row["intended_placement"] and qwen["overall_score"]:
            comparable.append((row, qwen))
        else:
            mismatch_context.append((row, qwen))
    gap_lines = [
        "# Qwen—人工校准偏差报告 v0.1",
        "",
        f"- 校准集与已调用 Qwen 样本重合：{len(overlaps)} 张",
        f"- 同用途且双方有完整总分：{len(comparable)} 张",
        f"- 用途不一致或模型为 PARTIAL：{len(mismatch_context)} 张",
        "",
        "当前不能计算可靠的 MAE、一致率或阈值校准。不能把不同图位的结论当成模型误差。",
        "",
        "## 不可比样本",
        "",
    ]
    for human, model in mismatch_context:
        gap_lines.append(
            f"- `{human['asset_alias']}`：人工用途 `{human['intended_placement']}` / {human['overall_score']} / {threshold_gate(float(human['overall_score']))}；Qwen 用途 `{model['intended_placement']}` / {model['score_status']} / {model['gate_decision']}。"
        )
    gap_lines += [
        "",
        "## 下一步",
        "",
        "先让模型按这 40 张各自的 `intended_placement` 跑受控校准批次，再计算分项 MAE、Gate 一致率和系统性偏差；31 张 holdout 继续保持锁定。",
    ]
    GAP.write_text("\n".join(gap_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": validation_status,
        "rows": len(rows),
        "raw_gate_mismatches": raw_gate_mismatches,
        "normalized_gate": stats["threshold_gate_decision"],
        "qwen_overlap": len(overlaps),
        "qwen_comparable": len(comparable),
        "outputs": [str(GOLD), str(STATS), str(VALIDATION), str(GAP)],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
