"""Run the static data pipeline for the dashboard."""
from src.export.dashboard_json import main
from src.validate.pipeline_audit import run_audit


if __name__ == "__main__":
    audit = run_audit(fail_on_error=True)
    print(f"Pipeline audit: {audit['summary']}")
    main()
