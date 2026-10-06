"""
TerraLens prediction training — TabPFN (spec §28).

Trains one TabPFN classifier per named output from a CSV export of real
expedition history. Nothing here fabricates data: the dataset must exist,
must carry the canonical feature columns, and every trained output is
reported honestly (outputs that cannot be trained are skipped out loud).

Dataset format (CSV), one row per observed day (or per expedition):

  Feature columns (all required):
    obs_count_7d, walks_last_7d, hour_of_day, month,
    avg_score_30d, insect_count_7d, bird_count_7d, flower_count_7d

  Target columns (train only the ones you have; others are skipped):
    bird_activity         -> class label, positive class "active"
    insect_activity       -> class label, positive class "active"
    flower_likelihood     -> class label, positive class "blooming"
    rain_interruption     -> class label, positive class "rain_likely"
    best_window           -> window label (e.g. "morning (06:00-09:00)");
                             argmax across classes becomes the emitted window

Example:
    cd services/prediction
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python train.py --data data/observations.csv --out artifacts/activity_predictor.joblib

The artifact is a joblib bundle: {"models": {key: classifier}, "meta": {...}}.
serve.py refuses to emit any probability unless a classifier produced it.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import joblib
    import numpy as np
    import pandas as pd
except ModuleNotFoundError as exc:  # pragma: no cover - environment dependent
    print(
        f"Missing dependency '{exc.name}'. Install the service requirements first:\n"
        "    pip install -r requirements.txt\n"
        "Nothing was trained.",
        file=sys.stderr,
    )
    sys.exit(1)

FEATURE_NAMES = [
    "obs_count_7d",
    "walks_last_7d",
    "hour_of_day",
    "month",
    "avg_score_30d",
    "insect_count_7d",
    "bird_count_7d",
    "flower_count_7d",
]

OUTPUT_SPECS = [
    {"key": "bird_activity", "label": "Bird activity", "column": "bird_activity", "mode": "class", "class": "active"},
    {"key": "insect_activity", "label": "Insect activity", "column": "insect_activity", "mode": "class", "class": "active"},
    {"key": "flower_likelihood", "label": "Flower likelihood", "column": "flower_likelihood", "mode": "class", "class": "blooming"},
    {"key": "rain_interruption", "label": "Rain interruption", "column": "rain_interruption", "mode": "class", "class": "rain_likely"},
    {"key": "best_window", "label": "Best window", "column": "best_window", "mode": "argmax"},
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the TerraLens TabPFN activity predictor.")
    parser.add_argument("--data", default="data/observations.csv", help="CSV export of expedition history.")
    parser.add_argument("--out", default="artifacts/activity_predictor.joblib", help="Where to write the joblib bundle.")
    parser.add_argument("--model-version", default=None, help="Override the generated model version string.")
    args = parser.parse_args()

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        print(
            f"No dataset at {data_path}. Export one from your expedition history first (see README.md).\n"
            "Nothing was trained.",
            file=sys.stderr,
        )
        sys.exit(1)

    df = pd.read_csv(data_path)
    missing_features = [c for c in FEATURE_NAMES if c not in df.columns]
    if missing_features:
        print(
            f"Dataset is missing feature columns: {', '.join(missing_features)}.\nNothing was trained.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Imported here so `--help` works even without the heavy dependency installed.
    from tabpfn import TabPFNClassifier  # type: ignore

    X = df[FEATURE_NAMES].astype(float).to_numpy()
    print(f"Loaded {len(df)} rows from {data_path}")

    models: dict[str, object] = {}
    outputs: list[dict[str, object]] = []

    for spec in OUTPUT_SPECS:
        column = spec["column"]
        if column not in df.columns:
            print(f"  - {spec['key']}: no '{column}' column in dataset — skipped")
            continue
        y = df[column].astype(str).to_numpy()
        classes, counts = np.unique(y, return_counts=True)
        if len(classes) < 2:
            print(f"  - {spec['key']}: only one class present ({classes[0]}) — skipped")
            continue
        clf = TabPFNClassifier()  # downloads the default checkpoint on first run
        clf.fit(X, y)
        models[spec["key"]] = clf

        entry: dict[str, object] = {"key": spec["key"], "label": spec["label"], "mode": spec["mode"]}
        if spec["mode"] == "class":
            entry["class"] = spec["class"]
            entry["window"] = spec.get("window")
        outputs.append(entry)
        print(f"  - {spec['key']}: trained ({len(df)} rows, classes: {', '.join(map(str, classes))})")

    if not models:
        print("No output could be trained from this dataset.\nNothing was written.", file=sys.stderr)
        sys.exit(1)

    trained_at = datetime.now(timezone.utc)
    version = args.model_version or f"tabpfn-{trained_at:%Y%m%d}-n{len(df)}"
    bundle = {
        "models": models,
        "meta": {
            "modelVersion": version,
            "trainedAt": trained_at.isoformat(),
            "featureNames": FEATURE_NAMES,
            "outputs": outputs,
            "rows": int(len(df)),
        },
    }

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out_path)
    print(f"\nWrote {out_path}")
    print(f"  modelVersion: {version}")
    print(f"  outputs: {', '.join(o['key'] for o in outputs)}")
    print("Restart serve.py (or wait for Render to redeploy) to pick up the new artifact.")


if __name__ == "__main__":
    main()
