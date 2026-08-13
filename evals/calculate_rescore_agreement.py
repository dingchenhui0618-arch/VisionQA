"""Calculate agreement for two aligned commercial anchor rescore CSV files."""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path


METRICS = [
    "product_subject_prominence",
    "selling_point_clarity",
    "promotion_hierarchy",
    "mobile_readability",
    "click_motivation",
    "placement_fit",
]


def read(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {row["asset_id"]: row for row in rows}


def average_ranks(values: list[float]) -> list[float]:
    result = [0.0] * len(values)
    order = sorted(range(len(values)), key=values.__getitem__)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        rank = ((start + 1) + end) / 2
        for position in range(start, end):
            result[order[position]] = rank
        start = end
    return result


def pearson(x: list[float], y: list[float]) -> float | None:
    mean_x, mean_y = sum(x) / len(x), sum(y) / len(y)
    numerator = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    denominator = math.sqrt(
        sum((a - mean_x) ** 2 for a in x) * sum((b - mean_y) ** 2 for b in y)
    )
    return numerator / denominator if denominator else None


def compare(values_a: list[float], values_b: list[float]) -> dict[str, float | None]:
    return {
        "mae": sum(abs(a - b) for a, b in zip(values_a, values_b)) / len(values_a),
        "spearman": pearson(average_ranks(values_a), average_ranks(values_b)),
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: calculate_rescore_agreement.py REVIEWER_A.csv REVIEWER_B.csv")
        return 2

    reviewer_a = read(Path(sys.argv[1]))
    reviewer_b = read(Path(sys.argv[2]))
    ids = sorted(reviewer_a.keys() & reviewer_b.keys())
    if len(ids) != len(reviewer_a) or len(ids) != len(reviewer_b):
        raise ValueError("Reviewer files do not contain identical asset_id sets")

    results: dict[str, object] = {"sample_count": len(ids), "metrics": {}}
    for metric in ["fit_score", *METRICS]:
        values_a = [float(reviewer_a[asset_id][metric]) for asset_id in ids]
        values_b = [float(reviewer_b[asset_id][metric]) for asset_id in ids]
        results["metrics"][metric] = compare(values_a, values_b)

    results["score_disagreements_over_15"] = [
        {
            "asset_id": asset_id,
            "reviewer_a": int(reviewer_a[asset_id]["fit_score"]),
            "reviewer_b": int(reviewer_b[asset_id]["fit_score"]),
            "absolute_gap": abs(
                int(reviewer_a[asset_id]["fit_score"])
                - int(reviewer_b[asset_id]["fit_score"])
            ),
        }
        for asset_id in ids
        if abs(
            int(reviewer_a[asset_id]["fit_score"])
            - int(reviewer_b[asset_id]["fit_score"])
        )
        > 15
    ]
    results["submetric_disagreements_over_20"] = [
        {
            "asset_id": asset_id,
            "metric": metric,
            "reviewer_a": int(reviewer_a[asset_id][metric]),
            "reviewer_b": int(reviewer_b[asset_id][metric]),
            "absolute_gap": abs(
                int(reviewer_a[asset_id][metric]) - int(reviewer_b[asset_id][metric])
            ),
        }
        for asset_id in ids
        for metric in METRICS
        if abs(
            int(reviewer_a[asset_id][metric]) - int(reviewer_b[asset_id][metric])
        )
        > 20
    ]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
