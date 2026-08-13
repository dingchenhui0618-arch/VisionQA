"""Calculate Phase 1 anchor agreement with Python standard library only."""

from __future__ import annotations

import csv
import math
import sys
from collections import Counter
from pathlib import Path


def read_by_source(path: Path, anchor_only: bool = False) -> dict[int, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if anchor_only:
        rows = [row for row in rows if row.get("anchor_role") not in ("", "NONE", None)]
    return {int(row["source_number"]): row for row in rows}


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


def pearson(x: list[float], y: list[float]) -> float:
    mean_x, mean_y = sum(x) / len(x), sum(y) / len(y)
    numerator = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    denominator = math.sqrt(
        sum((a - mean_x) ** 2 for a in x) * sum((b - mean_y) ** 2 for b in y)
    )
    return numerator / denominator if denominator else float("nan")


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: calculate_anchor_agreement.py REVIEWER_A.csv REVIEWER_B.csv")
        return 2

    reviewer_a = read_by_source(Path(sys.argv[1]), anchor_only=True)
    reviewer_b = read_by_source(Path(sys.argv[2]))
    ids = sorted(reviewer_a.keys() & reviewer_b.keys())
    if not ids:
        raise ValueError("No matching source_number values")

    applicability_pairs = [
        (
            reviewer_a[number]["template_applicability"],
            reviewer_b[number]["assessability"],
        )
        for number in ids
    ]
    categories = ["APPLICABLE", "NOT_APPLICABLE", "NOT_ASSESSABLE"]
    observed = sum(a == b for a, b in applicability_pairs) / len(ids)
    count_a = Counter(a for a, _ in applicability_pairs)
    count_b = Counter(b for _, b in applicability_pairs)
    expected = sum(
        count_a[category] / len(ids) * count_b[category] / len(ids)
        for category in categories
    )
    applicability_kappa = (observed - expected) / (1 - expected)

    score_ids = [
        number
        for number in ids
        if reviewer_a[number]["template_applicability"] == "APPLICABLE"
        and reviewer_b[number]["assessability"] == "APPLICABLE"
    ]
    scores_a = [float(reviewer_a[number]["initial_fit_score"]) for number in score_ids]
    scores_b = [float(reviewer_b[number]["fit_score"]) for number in score_ids]
    mae = sum(abs(a - b) for a, b in zip(scores_a, scores_b)) / len(score_ids)
    spearman = pearson(average_ranks(scores_a), average_ranks(scores_b))

    levels = ["LOW", "MEDIUM", "HIGH"]
    index = {level: position for position, level in enumerate(levels)}
    matrix = [[0] * len(levels) for _ in levels]
    for number in score_ids:
        row = index[reviewer_a[number]["initial_fit_level"]]
        column = index[reviewer_b[number]["fit_level"]]
        matrix[row][column] += 1
    row_totals = [sum(row) for row in matrix]
    column_totals = [sum(matrix[row][column] for row in range(3)) for column in range(3)]
    weights = [[abs(row - column) / 2 for column in range(3)] for row in range(3)]
    observed_disagreement = sum(
        weights[row][column] * matrix[row][column]
        for row in range(3)
        for column in range(3)
    ) / len(score_ids)
    expected_disagreement = sum(
        weights[row][column]
        * (row_totals[row] * column_totals[column] / len(score_ids))
        for row in range(3)
        for column in range(3)
    ) / len(score_ids)
    weighted_kappa = 1 - observed_disagreement / expected_disagreement

    print(f"anchors={len(ids)}")
    print(f"assessability_exact={observed:.4f}")
    print(f"assessability_kappa={applicability_kappa:.4f}")
    print(f"common_scored={len(score_ids)}")
    print(f"fit_level_linear_weighted_kappa={weighted_kappa:.4f}")
    print(f"score_mae={mae:.4f}")
    print(f"score_spearman={spearman:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
