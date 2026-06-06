"""Run election data validation without rebuilding the dashboard."""
from __future__ import annotations

import argparse
import json

from src.validate.pipeline_audit import run_audit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="fail when an error-level check fails")
    args = parser.parse_args()
    report = run_audit(fail_on_error=args.strict)
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
