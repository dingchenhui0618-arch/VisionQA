from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path


ROOT = Path(r"D:\VisionQA")
CORPUS = ROOT / "data" / "commercial_reference_corpus_v0.2"
SOURCE = CORPUS / "training_annotation_template.csv"
OUTPUT = CORPUS / "training_annotation_template_v0.2.csv"


XIAOYU_PLACEMENT = {
    "SG-01": "AESTHETIC_REFERENCE",
    "SG-02": "LIFESTYLE_CAMPAIGN",
    "SG-03": "PRODUCT_MAIN_IMAGE",
    "SG-04": "AESTHETIC_REFERENCE",
    "SG-05": "LIFESTYLE_CAMPAIGN",
    "SG-06": "LIFESTYLE_CAMPAIGN",
    "SG-07": "PLATFORM_PROMOTION_MAIN_IMAGE",
    "SG-08": "LIFESTYLE_CAMPAIGN",
    "SG-09": "PRODUCT_MAIN_IMAGE",
    "SG-10": "PRODUCT_MAIN_IMAGE",
    "SG-11": "PRODUCT_MAIN_IMAGE",
    "SG-12": "LIFESTYLE_CAMPAIGN",
    "SG-13": "LIFESTYLE_CAMPAIGN",
    "SG-14": "PRODUCT_MAIN_IMAGE",
    "SG-15": "PRODUCT_MAIN_IMAGE",
}


GWANG_RANGES = [
    (1, 5, "GW-S01", "PRODUCT_MAIN_IMAGE", "TRAIN_REFERENCE"),
    (6, 9, "GW-S02", "LIFESTYLE_CAMPAIGN", "TRAIN_REFERENCE"),
    (10, 12, "GW-S03", "LIFESTYLE_CAMPAIGN", "EVALUATION_HOLDOUT"),
    (13, 18, "GW-S04", "PRODUCT_MAIN_IMAGE", "TRAIN_REFERENCE"),
    (19, 22, "GW-S05", "PRODUCT_MAIN_IMAGE", "CALIBRATION_REVIEW"),
    (23, 25, "GW-S06", "PRODUCT_MAIN_IMAGE", "CALIBRATION_REVIEW"),
    (26, 33, "GW-S07", "PRODUCT_MAIN_IMAGE", "TRAIN_REFERENCE"),
    (34, 34, "GW-S08", "AESTHETIC_REFERENCE", "CALIBRATION_REVIEW"),
    (35, 37, "GW-S09", "PRODUCT_MAIN_IMAGE", "CALIBRATION_REVIEW"),
    (38, 46, "GW-S10", "AESTHETIC_REFERENCE", "TRAIN_REFERENCE"),
    (47, 84, "GW-S11", "LIFESTYLE_CAMPAIGN", "TRAIN_REFERENCE"),
    (85, 93, "GW-S12", "LIFESTYLE_CAMPAIGN", "CALIBRATION_REVIEW"),
    (94, 99, "GW-S13", "LIFESTYLE_CAMPAIGN", "EVALUATION_HOLDOUT"),
    (100, 101, "GW-S14", "OUT_OF_SCOPE_OTHER_COMMERCIAL", "EVALUATION_HOLDOUT"),
    (102, 102, "GW-S15", "AESTHETIC_REFERENCE", "CALIBRATION_REVIEW"),
    (103, 103, "GW-S16", "OUT_OF_SCOPE_OTHER_COMMERCIAL", "EVALUATION_HOLDOUT"),
]


def gwang_decision(index: int) -> tuple[str, str, str]:
    for start, end, group, placement, split in GWANG_RANGES:
        if start <= index <= end:
            return group, placement, split
    raise ValueError(f"No Gwang decision for index {index}")


def main() -> None:
    with SOURCE.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    exposed_aliases = {
        "gwang/6e977399dd360b69.jpg",
        "gwang/9785cfc4cf3440bc.jpg",
        "gwang/1c577045771119b9.jpg",
        "gwang/700d190d8cf52b9e.jpg",
        "gwang/f5ddce3cb4b24e98.jpg",
        "xiaoyu/d5b064961a59c36a.jpg",
        "xiaoyu/fd7e3fb17988a2d7.jpg",
    }
    gwang_index = 0
    for row in rows:
        if row["dataset_id"] == "xiaoyu":
            group = row["visual_group"]
            row["intended_placement"] = XIAOYU_PLACEMENT[group]
            if row["proposed_split"] == "DEVELOPMENT_REFERENCE":
                row["proposed_split"] = "TRAIN_REFERENCE"
            row["group_review_status"] = "HUMAN_VISUAL_REVIEW_V0.2"
            if row["asset_alias"] == "xiaoyu/0480402367dcd023.jpg":
                row["intended_placement"] = "PLATFORM_PROMOTION_MAIN_IMAGE"
        else:
            gwang_index += 1
            group, placement, split = gwang_decision(gwang_index)
            row["visual_group"] = group
            row["intended_placement"] = placement
            row["proposed_split"] = split
            row["group_review_status"] = "HUMAN_VISUAL_REVIEW_V0.2"
        row["model_exposure_status"] = (
            "EXPOSED_QWEN_CANARY"
            if row["asset_alias"] in exposed_aliases
            else "NOT_EXPOSED"
        )

    if any(
        row["proposed_split"] == "EVALUATION_HOLDOUT"
        and row["model_exposure_status"] != "NOT_EXPOSED"
        for row in rows
    ):
        raise ValueError("Model-exposed assets cannot remain in the evaluation holdout.")

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    group_rows = {}
    for row in rows:
        key = (row["dataset_id"], row["visual_group"])
        group_rows.setdefault(key, []).append(row)
    group_manifest = []
    for (dataset_id, group), items in sorted(group_rows.items()):
        placements = sorted({item["intended_placement"] for item in items})
        splits = sorted({item["proposed_split"] for item in items})
        group_manifest.append(
            {
                "dataset_id": dataset_id,
                "visual_group": group,
                "asset_count": len(items),
                "intended_placement": "|".join(placements),
                "proposed_split": "|".join(splits),
                "review_status": "HUMAN_VISUAL_REVIEW_V0.2",
            }
        )
    with (CORPUS / "group_manifest_v0.2.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=list(group_manifest[0].keys()))
        writer.writeheader()
        writer.writerows(group_manifest)

    summary = {
        "assets": len(rows),
        "groups": len(group_manifest),
        "dataset_counts": dict(Counter(row["dataset_id"] for row in rows)),
        "placement_counts": dict(Counter(row["intended_placement"] for row in rows)),
        "split_counts": dict(Counter(row["proposed_split"] for row in rows)),
        "model_exposed_assets": sum(
            row["model_exposure_status"] == "EXPOSED_QWEN_CANARY" for row in rows
        ),
        "model_exposed_in_holdout": 0,
        "human_score_labels": 0,
        "status": "PLACEMENT_AND_GROUP_SPLIT_PROPOSED_HUMAN_SCORE_LABELS_PENDING",
    }
    (CORPUS / "finalization_summary_v0.2.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
