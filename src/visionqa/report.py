from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path
from typing import Any


SIMULATION_WARNING = (
    "SIMULATION ONLY — 本报告仅验证合同与门禁控制流，不包含真实图片分析，"
    "不得用于宣称模型准确率、召回率或商业可用性。"
)


def read_results(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error}") from error
            _validate_result(row, line_number)
            rows.append(row)
    if not rows:
        raise ValueError(f"{path}: no evaluation results")
    return rows


def render_report(results: list[dict[str, Any]], output_path: Path) -> dict[str, Any]:
    decisions = Counter(row["rule_evaluation"]["decision"] for row in results)
    sections = "\n".join(_render_case(row) for row in results)
    document = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VisionQA 模拟批次报告</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#17202a}}
.warning{{background:#fff0c2;border:2px solid #9a6700;padding:16px;font-weight:700}}
.summary{{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}}
.metric{{padding:12px 18px;border:1px solid #ccd1d1;border-radius:8px}}
.case{{border-top:1px solid #ccd1d1;padding:20px 0}}
.evidence{{background:#f5f7f9;padding:10px;border-radius:6px}}
.PASS{{color:#137333}}.REVIEW{{color:#9a6700}}.REJECT{{color:#b3261e}}
code{{overflow-wrap:anywhere}}
</style>
</head>
<body>
<h1>VisionQA 模拟批次报告</h1>
<div class="warning">{html.escape(SIMULATION_WARNING)}</div>
<div class="summary">
  <div class="metric">总数：{len(results)}</div>
  <div class="metric PASS">PASS：{decisions["PASS"]}</div>
  <div class="metric REVIEW">REVIEW：{decisions["REVIEW"]}</div>
  <div class="metric REJECT">REJECT：{decisions["REJECT"]}</div>
</div>
{sections}
</body>
</html>
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(document, encoding="utf-8", newline="\n")
    return {"count": len(results), "decisions": dict(decisions), "simulation_only": True}


def _render_case(row: dict[str, Any]) -> str:
    asset_id = html.escape(str(row["input"]["asset_id"]))
    rule = row["rule_evaluation"]
    decision = html.escape(str(rule["decision"]))
    reason = html.escape(str(rule["decision_reason"]))
    observations = row["model_evaluation"]["observations"]
    if observations:
        evidence = "\n".join(
            "<li><strong>{code}</strong> [{severity}] — {observation}"
            "<br>区域：{region}；证据：<code>{refs}</code></li>".format(
                code=html.escape(str(item["issue_code"])),
                severity=html.escape(str(item["severity"])),
                observation=html.escape(str(item["observation"])),
                region=html.escape(str(item["region"]["label"])),
                refs=html.escape(", ".join(map(str, item["evidence_refs"]))),
            )
            for item in observations
        )
    else:
        evidence = "<li>模拟输入未提供缺陷观察。</li>"
    return f"""<section class="case">
<h2>{asset_id} — <span class="{decision}">{decision}</span></h2>
<p>{reason}</p>
<div class="evidence"><h3>观察与证据</h3><ul>{evidence}</ul></div>
</section>"""


def _validate_result(row: dict[str, Any], line_number: int) -> None:
    required = {"run", "input", "model_evaluation", "rule_evaluation"}
    if not isinstance(row, dict) or required - row.keys():
        raise ValueError(f"results line {line_number}: incomplete evaluation result")
    model_snapshot = str(row["run"].get("model_snapshot", ""))
    warnings = " ".join(map(str, row["model_evaluation"].get("warnings", [])))
    if "simulation" not in model_snapshot.lower() and "模拟" not in warnings:
        raise ValueError(
            f"results line {line_number}: TECH-002 only renders simulation results"
        )
