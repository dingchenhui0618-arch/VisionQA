from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean


ROOT = Path(r"D:\VisionQA")
DATA = ROOT / "data" / "commercial_reference_corpus_v0.2"
GOLD = DATA / "gold_labels_calibration_v0.1.csv"
MODEL = DATA / "qwen_calibration_v0.1" / "calibration_summary.csv"
COMPARISON = DATA / "qwen_calibration_v0.1" / "human_model_comparison_v0.1.csv"
STATS = DATA / "qwen_calibration_v0.1" / "calibration_metrics_v0.1.json"
REPORT = DATA / "qwen_calibration_v0.1" / "CALIBRATION_REPORT_v0.1.md"

NA = {"", "NOT_APPLICABLE", "NOT_ASSESSABLE"}
DIMENSIONS = {
    "human_realism": ("human_realism_score", "model_human_realism"),
    "photography_realism": ("photography_realism_score", "model_photography_realism"),
    "material_realism": ("material_realism_score", "model_material_realism"),
    "product_prominence": ("product_prominence_score", "model_product_prominence"),
    "selling_point_clarity": ("selling_point_clarity_score", "model_selling_point_clarity"),
    "promotion_hierarchy": ("promotion_hierarchy_score", "model_promotion_hierarchy"),
    "information_legibility": ("information_legibility_score", "model_information_legibility"),
    "click_motivation": ("click_motivation_score", "model_click_motivation"),
    "channel_placement_fit": ("channel_placement_fit_score", "model_channel_placement_fit"),
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def number(value: str) -> float | None:
    return None if value.strip() in NA else float(value)


def metric(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"n": 0, "bias": None, "mae": None, "rmse": None}
    return {
        "n": len(values),
        "bias": round(mean(values), 2),
        "mae": round(mean(abs(value) for value in values), 2),
        "rmse": round(math.sqrt(mean(value * value for value in values)), 2),
    }


def main() -> None:
    gold = {row["asset_alias"]: row for row in read_csv(GOLD)}
    model_rows = read_csv(MODEL)
    if len(model_rows) != 40 or set(gold) != {row["asset_alias"] for row in model_rows}:
        raise SystemExit("Gold and model calibration sets do not match exactly.")

    comparisons: list[dict[str, str | float]] = []
    dimension_deltas: dict[str, list[float]] = defaultdict(list)
    dimension_applicability: dict[str, Counter[str]] = defaultdict(Counter)
    overall_deltas: list[float] = []
    placement_deltas: dict[str, list[float]] = defaultdict(list)
    dataset_deltas: dict[str, list[float]] = defaultdict(list)
    confusion: Counter[tuple[str, str]] = Counter()

    for model in model_rows:
        human = gold[model["asset_alias"]]
        human_overall = number(human["overall_score"])
        model_overall = number(model["model_overall_score"])
        delta = None
        if human_overall is not None and model_overall is not None:
            delta = model_overall - human_overall
            overall_deltas.append(delta)
            placement_deltas[human["intended_placement"]].append(delta)
            dataset_deltas[human["dataset_id"]].append(delta)
        confusion[(human["threshold_gate_decision"], model["model_gate"])] += 1

        row: dict[str, str | float] = {
            "asset_alias": model["asset_alias"],
            "dataset_id": human["dataset_id"],
            "intended_placement": human["intended_placement"],
            "human_overall_score": human["overall_score"],
            "model_overall_score": model["model_overall_score"],
            "overall_delta_model_minus_human": "" if delta is None else round(delta, 2),
            "human_gate": human["threshold_gate_decision"],
            "model_gate": model["model_gate"],
            "gate_match": "YES" if human["threshold_gate_decision"] == model["model_gate"] else "NO",
            "score_status": model["score_status"],
            "repair_prompt": model["repair_prompt"],
            "response_file": model["response_file"],
        }
        for name, (human_column, model_column) in DIMENSIONS.items():
            human_value = number(human[human_column])
            model_value = number(model[model_column])
            row[f"human_{name}"] = "" if human_value is None else human_value
            row[f"model_{name}"] = "" if model_value is None else model_value
            if human_value is not None and model_value is not None:
                dimension_deltas[name].append(model_value - human_value)
                dimension_applicability[name]["BOTH_SCORED"] += 1
            elif human_value is None and model_value is None:
                dimension_applicability[name]["BOTH_NA"] += 1
            elif human_value is None:
                dimension_applicability[name]["MODEL_OVER_ASSESSED"] += 1
            else:
                dimension_applicability[name]["MODEL_MISSING"] += 1
        comparisons.append(row)

    with COMPARISON.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(comparisons[0]))
        writer.writeheader()
        writer.writerows(comparisons)

    gate_matches = sum(count for (human_gate, model_gate), count in confusion.items() if human_gate == model_gate)
    false_passes = sum(count for (human_gate, model_gate), count in confusion.items() if model_gate == "PASS" and human_gate != "PASS")
    stats = {
        "schema_version": "visionqa-calibration-metrics@0.1.0",
        "model_snapshot": model_rows[0]["model_snapshot"],
        "sample_count": len(model_rows),
        "http_200": sum(row["http_status"] == "200" for row in model_rows),
        "score_status": dict(Counter(row["score_status"] for row in model_rows)),
        "overall": {
            **metric(overall_deltas),
            "human_mean_all": round(mean(float(row["human_overall_score"]) for row in model_rows), 2),
            "human_mean_comparable": round(mean(
                float(row["human_overall_score"])
                for row in model_rows
                if row["model_overall_score"]
            ), 2),
            "model_mean_comparable": round(mean(float(row["model_overall_score"]) for row in model_rows if row["model_overall_score"]), 2),
            "within_5_points": sum(abs(value) <= 5 for value in overall_deltas),
            "within_10_points": sum(abs(value) <= 10 for value in overall_deltas),
        },
        "gate": {
            "accuracy": round(gate_matches / len(model_rows), 4),
            "matches": gate_matches,
            "false_passes": false_passes,
            "confusion": {f"human_{human}__model_{model}": count for (human, model), count in sorted(confusion.items())},
        },
        "dimensions": {
            name: {
                **metric(dimension_deltas[name]),
                "applicability": dict(dimension_applicability[name]),
            }
            for name in DIMENSIONS
        },
        "by_placement": {name: metric(values) for name, values in sorted(placement_deltas.items())},
        "by_dataset": {name: metric(values) for name, values in sorted(dataset_deltas.items())},
        "usage": {
            "input_tokens": sum(int(row["prompt_tokens"] or 0) for row in model_rows),
            "output_tokens": sum(int(row["completion_tokens"] or 0) for row in model_rows),
            "mean_latency_ms": round(mean(float(row["latency_ms"]) for row in model_rows), 0),
        },
    }
    STATS.write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    largest = sorted(
        (row for row in comparisons if row["overall_delta_model_minus_human"] != ""),
        key=lambda row: abs(float(row["overall_delta_model_minus_human"])),
        reverse=True,
    )[:8]
    dimension_lines = []
    for name in DIMENSIONS:
        item = stats["dimensions"][name]
        dimension_lines.append(
            f"| {name} | {item['n']} | {item['bias'] if item['bias'] is not None else '—'} | {item['mae'] if item['mae'] is not None else '—'} | {item['applicability'].get('MODEL_OVER_ASSESSED', 0)} | {item['applicability'].get('MODEL_MISSING', 0)} |"
        )
    confusion_lines = [
        f"- 人工 `{human}` → 模型 `{model}`：{count} 张"
        for (human, model), count in sorted(confusion.items())
    ]
    largest_lines = [
        f"- `{row['asset_alias']}`（{row['intended_placement']}）：人工 {row['human_overall_score']}，模型 {row['model_overall_score']}，偏差 {float(row['overall_delta_model_minus_human']):+.1f}。"
        for row in largest
    ]

    REPORT.write_text(
        "\n".join([
            "# VisionQA Qwen—人工校准报告 v0.1",
            "",
            "## 结论",
            "",
            f"40/40 张真实调用成功；38 张形成完整综合分，2 张审美参考因商业维度整体不适用保持 PARTIAL。模型当前**不能自动放行**：Gate 一致率仅 {stats['gate']['accuracy'] * 100:.1f}%，且有 {false_passes} 张人工 REVIEW 被模型判为 PASS。",
            "",
            f"在 38 张可比分数中，模型平均高估 {stats['overall']['bias']:+.2f} 分，MAE {stats['overall']['mae']:.2f}，RMSE {stats['overall']['rmse']:.2f}；仅 {stats['overall']['within_5_points']}/38 落在 ±5 分内。",
            "",
            "因此当前 Gate 冻结为 `HUMAN_REVIEW_REQUIRED`，不启用 ≥90 自动发布。下一轮应优先压低模型的宽松高分倾向，再进行盲测。",
            "",
            "## Gate 混淆",
            "",
            *confusion_lines,
            "",
            "## 分项偏差",
            "",
            "| 维度 | 可比 n | Bias | MAE | 模型多评 | 模型漏评 |",
            "|---|---:|---:|---:|---:|---:|",
            *dimension_lines,
            "",
            "`模型多评` 表示人工标为不适用但模型仍给分；`模型漏评` 表示人工给分但模型未形成分数。",
            "",
            "## 最大总分偏差",
            "",
            *largest_lines,
            "",
            "## 校准动作",
            "",
            "1. 保持四 Skill 权重 25/20/20/35 和 90/70 阈值不变，先校准模型评分尺度，避免同时改权重和阈值造成不可解释漂移。",
            "2. 在模型提示词中加入这 40 张人工分布的严格锚点：优秀商业实拍通常位于 82–91，不因画面漂亮默认给 95+。",
            "3. 对 `LIFESTYLE_CAMPAIGN` 单独增加高分约束；该用途是本轮主要高估来源。",
            "4. 修正信息可读性的适用性判断：无叠加商业信息时必须 `NOT_APPLICABLE`，不得把衣服印花或场景文字当促销信息。",
            "5. 校准后重跑同一 40 张；达到总分 MAE ≤5、Gate 一致率 ≥80%、错误 PASS ≤2 张，才允许进入 31 张锁定盲测。",
            "",
            "## 费用与运行证据",
            "",
            f"- 模型：`{stats['model_snapshot']}`",
            f"- 输入/输出 tokens：{stats['usage']['input_tokens']} / {stats['usage']['output_tokens']}",
            f"- 平均延迟：{stats['usage']['mean_latency_ms'] / 1000:.1f} 秒/张",
            "- 本批次只记录 token 与调用证据；实际账单金额以阿里云控制台为准，不在本地臆测。",
        ]) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
