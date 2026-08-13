from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(r"D:\VisionQA")
DATA = ROOT / "data" / "commercial_reference_corpus_v0.2"
SOURCE_DIRS = [
    Path(r"C:\Users\123\Desktop\小宇电商图素材"),
    Path(r"C:\Users\123\Desktop\枪王电商图素材"),
]
OUT = DATA / "calibration_contact_sheets"
COLS, ROWS = 4, 4
CELL_W, IMAGE_H, LABEL_H = 250, 300, 64


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with (DATA / "calibration_human_review_v0.1.csv").open(
        "r", encoding="utf-8-sig", newline=""
    ) as stream:
        rows = list(csv.DictReader(stream))
    required = {row["sha256"] for row in rows}
    resolved = {}
    for directory in SOURCE_DIRS:
        for path in directory.glob("*.jpg"):
            value = digest(path)
            if value in required:
                resolved[value] = path
    if len(resolved) != len(required):
        raise RuntimeError(f"Resolved {len(resolved)} of {len(required)} calibration assets")

    page_size = COLS * ROWS
    for page_start in range(0, len(rows), page_size):
        page = rows[page_start : page_start + page_size]
        canvas = Image.new(
            "RGB", (COLS * CELL_W, ROWS * (IMAGE_H + LABEL_H)), "#f4f4f2"
        )
        draw = ImageDraw.Draw(canvas)
        for index, row in enumerate(page):
            col, line = index % COLS, index // COLS
            x, y = col * CELL_W, line * (IMAGE_H + LABEL_H)
            with Image.open(resolved[row["sha256"]]) as source:
                source.draft("RGB", (CELL_W * 2, IMAGE_H * 2))
                image = ImageOps.exif_transpose(source).convert("RGB")
                thumb = ImageOps.contain(image, (CELL_W - 12, IMAGE_H - 12))
                canvas.paste(
                    thumb,
                    (x + (CELL_W - thumb.width) // 2, y + (IMAGE_H - thumb.height) // 2),
                )
            sequence = page_start + index + 1
            draw.text((x + 6, y + IMAGE_H + 4), f"CAL-{sequence:02d} | {row['asset_alias']}", fill="#111111")
            draw.text((x + 6, y + IMAGE_H + 23), f"{row['intended_placement']}", fill="#333333")
            draw.text((x + 6, y + IMAGE_H + 42), "placement OK? [ ]  score done? [ ]", fill="#666666")
        output = OUT / f"calibration_contact_{page_start // page_size + 1:02d}.jpg"
        canvas.save(output, "JPEG", quality=90, optimize=True)
    print(f"CALIBRATION_ASSETS={len(rows)} SHEETS={(len(rows) + page_size - 1) // page_size}")


if __name__ == "__main__":
    main()
