from __future__ import annotations

import argparse
import json
from pathlib import Path

from .evaluator import SimulationEvaluator
from .report import read_results, render_report
from .runner import evaluate_dataset, read_manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="visionqa")
    subparsers = parser.add_subparsers(dest="command", required=True)
    evaluate = subparsers.add_parser(
        "evaluate-dataset", help="run an offline simulation manifest"
    )
    evaluate.add_argument("--manifest", type=Path, required=True)
    evaluate.add_argument("--output", type=Path, required=True)
    evaluate.add_argument("--dataset-version", default="simulation-0.1")
    validate = subparsers.add_parser(
        "validate-manifest", help="validate a simulation JSONL manifest"
    )
    validate.add_argument("--manifest", type=Path, required=True)
    report = subparsers.add_parser(
        "render-report", help="render one static simulation batch report"
    )
    report.add_argument("--input", type=Path, required=True)
    report.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "evaluate-dataset":
        records = read_manifest(args.manifest)
        summary = evaluate_dataset(
            records,
            SimulationEvaluator(),
            args.output,
            args.dataset_version,
        )
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        print("simulation_only=true; no model accuracy claim")
        return 0
    if args.command == "validate-manifest":
        records = read_manifest(args.manifest)
        print(
            json.dumps(
                {"valid": True, "count": len(records), "simulation_only": True},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0
    if args.command == "render-report":
        summary = render_report(read_results(args.input), args.output)
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        print("simulation_only=true; no model accuracy claim")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
