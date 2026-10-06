"""
TerraLens prediction service — TabPFN boundary (spec §28, §51).

This service is the ONLY place where TerraLens predictions are produced.
It never invents numbers: without a trained artifact at TABPFN_MODEL_PATH
every /predict call answers 503 model-not-loaded, and the web app honestly
renders "unavailable".

Contract (consumed by src/lib/server/prediction.ts):

  GET  /health
       -> 200 {"status":"ok","model":"tabpfn","trained":bool,"modelVersion":str|null}
       -> 503 {"status":"model-not-loaded", ...} is NOT used here on purpose:
          /health answers 200 whenever the process is up so probes can
          distinguish "process down" (network error) from "no model" (trained=false).

  POST /predict
       Headers: x-terralens-key: <PREDICTION_SERVICE_KEY>   (required when the
                service is started with that env var set)
       Body:    {"features": {"<name>": <number|string|null>, ...},
                 "horizonDate": "YYYY-MM-DD"|null}
       -> 200 {"outputs":[{"key","label","probability","window"}...],
               "modelVersion": str, "featureCount": int}
       -> 422 {"error":"insufficient-data","detail": "..."}  (fewer than MIN_FEATURES)
       -> 401 {"error":"unauthorized"}
       -> 503 {"error":"model-not-loaded","detail":"..."}
       -> 400 malformed body

The probability values are emitted by the trained TabPFN classifier only.
No fixture, stub, or random fallback exists in this file.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

MIN_FEATURES = 4
DEFAULT_MODEL_PATH = "artifacts/activity_predictor.joblib"

app = FastAPI(title="terralens-prediction", version="1.0.0")

_state: dict[str, Any] = {"models": None, "meta": None, "load_error": None}


def model_path() -> Path:
    return Path(os.environ.get("TABPFN_MODEL_PATH", DEFAULT_MODEL_PATH)).resolve()


def service_key() -> str | None:
    key = os.environ.get("PREDICTION_SERVICE_KEY", "").strip()
    return key or None


def load_model() -> None:
    """Load the trained artifact once at startup. Failures are recorded, not fatal."""
    path = model_path()
    if not path.exists():
        _state["load_error"] = f"No trained artifact at {path}. Run train.py first."
        return
    try:
        import joblib  # type: ignore

        bundle = joblib.load(path)
        _state["models"] = bundle["models"]
        _state["meta"] = bundle.get("meta", {})
        _state["load_error"] = None
    except Exception as exc:  # pragma: no cover - environment dependent
        _state["load_error"] = f"Failed to load {path}: {exc}"


@app.on_event("startup")
def _startup() -> None:
    load_model()


@app.get("/health")
def health() -> JSONResponse:
    trained = bool(_state["models"])
    meta = _state["meta"] or {}
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "model": "tabpfn",
            "trained": trained,
            "modelVersion": meta.get("modelVersion"),
            "trainedAt": meta.get("trainedAt"),
            "featureCount": len(meta.get("featureNames", [])) or None,
            "detail": None if trained else _state["load_error"],
        },
    )


def _unauthorized(key: str | None) -> bool:
    expected = service_key()
    return expected is not None and key != expected


@app.post("/predict")
async def predict(request: Request, x_terralens_key: str | None = Header(default=None)) -> JSONResponse:
    if _unauthorized(x_terralens_key):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "malformed-body"})

    features = body.get("features")
    if not isinstance(features, dict):
        return JSONResponse(status_code=400, content={"error": "malformed-body", "detail": "features must be an object"})

    numeric = {k: v for k, v in features.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
    if len(numeric) < MIN_FEATURES:
        return JSONResponse(
            status_code=422,
            content={
                "error": "insufficient-data",
                "detail": f"Need at least {MIN_FEATURES} numeric features; received {len(numeric)}.",
            },
        )

    if not _state["models"]:
        return JSONResponse(
            status_code=503,
            content={"error": "model-not-loaded", "detail": _state["load_error"] or "No trained model loaded."},
        )

    meta = _state["meta"] or {}
    feature_names: list[str] = meta.get("featureNames", [])
    missing = [name for name in feature_names if name not in numeric]
    if missing:
        return JSONResponse(
            status_code=422,
            content={
                "error": "insufficient-data",
                "detail": f"Missing required features: {', '.join(missing)}.",
            },
        )

    import numpy as np  # type: ignore

    values = np.array([[float(numeric[name]) for name in feature_names]])

    # Each output probability comes straight from that output's classifier —
    # the class -> named output mapping is fixed at training time in meta.
    outputs = []
    for spec in meta.get("outputs", []):
        clf = _state["models"].get(spec.get("key"))
        probability = None
        window = spec.get("window")
        if clf is not None:
            try:
                proba = clf.predict_proba(values)[0]
                classes = list(clf.classes_)
                if spec.get("mode") == "argmax":
                    idx = int(np.argmax(proba))
                    probability = round(float(proba[idx]), 4)
                    window = str(classes[idx])
                else:
                    cls = spec.get("class")
                    if cls in classes:
                        probability = round(float(proba[classes.index(cls)]), 4)
            except Exception:
                probability = None  # honest null rather than a guessed number
        outputs.append(
            {
                "key": spec.get("key"),
                "label": spec.get("label", spec.get("key")),
                "probability": probability,
                "window": window,
            }
        )

    return JSONResponse(
        status_code=200,
        content={
            "outputs": outputs,
            "modelVersion": meta.get("modelVersion"),
            "featureCount": len(numeric),
        },
    )


if __name__ == "__main__":  # pragma: no cover
    import uvicorn  # type: ignore

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
