from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(r"D:\VisionQA")
XIAOYU_DIR = Path(r"C:\Users\123\Desktop\小宇电商图素材")
GWANG_DIR = Path(r"C:\Users\123\Desktop\枪王电商图素材")
OUT = ROOT / "data" / "commercial_reference_corpus_v0.2"
SHEETS = OUT / "contact_sheets"
THUMB_W, THUMB_H = 240, 300
COLS, ROWS = 4, 4


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_features(path: Path) -> dict[str, object]:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        width, height = image.size
        gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        values = np.asarray(gray, dtype=np.int16)
        bits = values[:, 1:] > values[:, :-1]
        dhash = 0
        for bit in bits.flatten():
            dhash = (dhash << 1) | int(bit)
        average = image.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
        avg_values = np.asarray(average, dtype=np.float32)
        avg_bits = avg_values > avg_values.mean()
        ahash = 0
        for bit in avg_bits.flatten():
            ahash = (ahash << 1) | int(bit)
        small = np.asarray(image.resize((64, 64), Image.Resampling.BILINEAR))
        hist = []
        for channel in range(3):
            values, _ = np.histogram(small[:, :, channel], bins=8, range=(0, 256))
            hist.extend(values.astype(np.float64))
        hist_array = np.asarray(hist, dtype=np.float64)
        hist_array /= max(float(np.linalg.norm(hist_array)), 1.0)
        return {
            "width": width,
            "height": height,
            "aspect_ratio": round(width / height, 4),
            "dhash": f"{dhash:016x}",
            "ahash": f"{ahash:016x}",
            "hist": hist_array,
        }


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


class UnionFind:
    def __init__(self, size: int):
        self.parent = list(range(size))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parent[b] = a


def build_gwang_groups(rows: list[dict[str, object]]) -> None:
    union = UnionFind(len(rows))
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            a, b = rows[left], rows[right]
            aspect_delta = abs(float(a["aspect_ratio"]) - float(b["aspect_ratio"]))
            if aspect_delta > 0.12:
                continue
            dh = hamming(str(a["dhash"]), str(b["dhash"]))
            ah = hamming(str(a["ahash"]), str(b["ahash"]))
            similarity = float(np.dot(a["hist"], b["hist"]))
            if (dh <= 10 and ah <= 12 and similarity >= 0.88) or (
                dh <= 6 and similarity >= 0.78
            ):
                union.union(left, right)
    roots: dict[int, str] = {}
    for index, row in enumerate(rows):
        root = union.find(index)
        if root not in roots:
            roots[root] = f"GW-VG-{len(roots) + 1:03d}"
        row["visual_group"] = roots[root]


def proposed_split(group: str) -> str:
    bucket = int(hashlib.sha256(group.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 70:
        return "TRAIN_REFERENCE"
    if bucket < 85:
        return "CALIBRATION_REVIEW"
    return "EVALUATION_HOLDOUT"


def load_xiaoyu() -> list[dict[str, object]]:
    frozen = {}
    manifest = ROOT / "data" / "customer_xiaoyu_v0.1" / "asset_manifest.csv"
    with manifest.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            frozen[row["sha256"]] = row
    rows = []
    for path in sorted(XIAOYU_DIR.glob("*.jpg")):
        digest = sha256_file(path)
        source = frozen[digest]
        features = image_features(path)
        rows.append(
            {
                "dataset_id": "xiaoyu",
                "asset_alias": source["source_alias"],
                "sha256": digest,
                "bytes": path.stat().st_size,
                **features,
                "visual_group": source["shoot_group"],
                "proposed_split": source["proposed_split"],
                "group_review_status": "FROZEN_EXISTING_SHOOT_GROUP",
                "source_path": path,
            }
        )
    return rows


def load_gwang() -> list[dict[str, object]]:
    rows = []
    for path in sorted(GWANG_DIR.glob("*.jpg")):
        digest = sha256_file(path)
        features = image_features(path)
        rows.append(
            {
                "dataset_id": "gwang",
                "asset_alias": f"gwang/{digest[:16]}.jpg",
                "sha256": digest,
                "bytes": path.stat().st_size,
                **features,
                "source_path": path,
            }
        )
    build_gwang_groups(rows)
    for row in rows:
        row["proposed_split"] = proposed_split(str(row["visual_group"]))
        row["group_review_status"] = "PROVISIONAL_VISUAL_HASH_GROUP"
    return rows


def render_contact_sheets(rows: list[dict[str, object]], dataset_id: str) -> list[str]:
    dataset_rows = [row for row in rows if row["dataset_id"] == dataset_id]
    page_size = COLS * ROWS
    outputs = []
    for page_index in range(math.ceil(len(dataset_rows) / page_size)):
        page_rows = dataset_rows[page_index * page_size : (page_index + 1) * page_size]
        canvas = Image.new("RGB", (COLS * THUMB_W, ROWS * (THUMB_H + 48)), "#f3f3f1")
        draw = ImageDraw.Draw(canvas)
        for index, row in enumerate(page_rows):
            col, line = index % COLS, index // COLS
            x, y = col * THUMB_W, line * (THUMB_H + 48)
            with Image.open(Path(row["source_path"])) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                thumb = ImageOps.contain(image, (THUMB_W - 12, THUMB_H - 12))
                px = x + (THUMB_W - thumb.width) // 2
                py = y + (THUMB_H - thumb.height) // 2
                canvas.paste(thumb, (px, py))
            label = f"{row['asset_alias']} | {row['visual_group']}"
            draw.text((x + 6, y + THUMB_H + 4), label[:42], fill="#111111")
            draw.text(
                (x + 6, y + THUMB_H + 22),
                f"{row['proposed_split']} | placement: ____",
                fill="#555555",
            )
        output = SHEETS / f"{dataset_id}_contact_{page_index + 1:02d}.jpg"
        canvas.save(output, "JPEG", quality=88, optimize=True)
        outputs.append(str(output))
    return outputs


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SHEETS.mkdir(parents=True, exist_ok=True)
    rows = load_xiaoyu() + load_gwang()
    final_rows = []
    for row in rows:
        final_rows.append(
            {
                "dataset_id": row["dataset_id"],
                "asset_alias": row["asset_alias"],
                "sha256": row["sha256"],
                "bytes": row["bytes"],
                "width": row["width"],
                "height": row["height"],
                "aspect_ratio": row["aspect_ratio"],
                "visual_group": row["visual_group"],
                "group_review_status": row["group_review_status"],
                "proposed_split": row["proposed_split"],
                "intended_placement": "PENDING_HUMAN_REVIEW",
                "aesthetic_reference": "YES_USER_CONFIRMED",
                "human_realism_score": "",
                "photography_realism_score": "",
                "material_realism_score": "",
                "product_prominence_score": "",
                "selling_point_clarity_score": "",
                "promotion_hierarchy_score": "",
                "information_legibility_score": "",
                "click_motivation_score": "",
                "channel_placement_fit_score": "",
                "overall_score": "",
                "human_decision": "",
                "reviewer_id": "",
                "review_status": "PENDING",
            }
        )
    fields = list(final_rows[0].keys())
    with (OUT / "training_annotation_template.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(final_rows)
    sheet_paths = render_contact_sheets(rows, "xiaoyu") + render_contact_sheets(rows, "gwang")
    group_counts = {}
    for row in rows:
        key = f"{row['dataset_id']}:{row['visual_group']}"
        group_counts[key] = group_counts.get(key, 0) + 1
    summary = {
        "corpus_version": "v0.2",
        "total_assets": len(rows),
        "xiaoyu_assets": sum(row["dataset_id"] == "xiaoyu" for row in rows),
        "gwang_assets": sum(row["dataset_id"] == "gwang" for row in rows),
        "total_groups": len(group_counts),
        "xiaoyu_groups": len({row["visual_group"] for row in rows if row["dataset_id"] == "xiaoyu"}),
        "gwang_provisional_groups": len({row["visual_group"] for row in rows if row["dataset_id"] == "gwang"}),
        "split_counts": {
            split: sum(row["proposed_split"] == split for row in rows)
            for split in ["TRAIN_REFERENCE", "DEVELOPMENT_REFERENCE", "CALIBRATION_REVIEW", "EVALUATION_HOLDOUT"]
        },
        "contact_sheets": sheet_paths,
        "human_labels": 0,
        "status": "GROUPED_PROVISIONALLY_AND_READY_FOR_HUMAN_PLACEMENT_LABELING",
    }
    (OUT / "build_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
