# TerraLens prediction service — TabPFN

The only place TerraLens predictions are produced. TabPFN is a real model:
small-data tabular classification from prior-fitted networks. This service
**never fabricates numbers** — without a trained artifact, `/predict` answers
`503 model-not-loaded` and the app renders "unavailable" honestly.

- `serve.py` — FastAPI app. `GET /health`, `POST /predict`.
- `train.py` — trains one TabPFN classifier per named output from a CSV export
  of real expedition history, writes a `joblib` bundle.
- `requirements.txt` — fastapi, uvicorn, tabpfn (pulls torch), pandas.

## How the web app talks to it

`src/lib/server/prediction.ts` (server-only) probes `/health` and calls
`/predict`. When `PREDICTION_SERVICE_KEY` is set here, the web app must send
the same value in the `x-terralens-key` header — otherwise `401`.

Response contract (consumed verbatim by the adapter):

| Case | Status | Body |
| --- | --- | --- |
| Health, any state | 200 | `{status, model, trained, modelVersion, trainedAt, featureCount}` |
| Prediction OK | 200 | `{outputs:[{key,label,probability,window}], modelVersion, featureCount}` |
| < 4 numeric features, or missing trained features | 422 | `{error:"insufficient-data", detail}` |
| No trained artifact | 503 | `{error:"model-not-loaded", detail}` |
| Bad key | 401 | `{error:"unauthorized"}` |

`probability` is always the classifier's `predict_proba` output or `null` —
never a guess. `best_window` uses argmax across the trained window classes:
the emitted `window` is the class label, the `probability` is its share.

## Provisioning (local)

```bash
cd services/prediction
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # pulls torch — several hundred MB
export PREDICTION_SERVICE_KEY=$(openssl rand -hex 16)   # optional but recommended
uvicorn serve:app --host 127.0.0.1 --port 8000
curl -s localhost:8000/health | python3 -m json.tool
```

Then in the web app `.env.local`:

```
PREDICTION_SERVICE_URL=http://127.0.0.1:8000
PREDICTION_SERVICE_KEY=<same key>
ENABLE_TABPFN=1
```

## Training on real history

The dataset is **your own expedition data** — export a CSV with the canonical
feature columns and any target columns you actually have:

```
obs_count_7d,walks_last_7d,hour_of_day,month,avg_score_30d,insect_count_7d,bird_count_7d,flower_count_7d,bird_activity,insect_activity,flower_likelihood,rain_interruption,best_window
14,5,7,5,742,6,9,2,active,active,blooming,rain_likely,morning (06:00-09:00)
...
```

```bash
python train.py --data data/observations.csv --out artifacts/activity_predictor.joblib
# -> Wrote .../artifacts/activity_predictor.joblib
#    modelVersion: tabpfn-20261006-n128
```

Outputs whose target column is absent (or has a single class) are **skipped
out loud** — they are simply not part of the artifact, and the app shows only
the outputs the model actually produced.

Point the service at the artifact with `TABPFN_MODEL_PATH` (default:
`artifacts/activity_predictor.joblib`) and restart it.

## Deploying on Render

`render.yaml` defines a third service, `terralens-prediction`, from this
directory. Set `PREDICTION_SERVICE_KEY` (sync: false) in the dashboard, and
point `TABPFN_MODEL_PATH` at a committed artifact (or bake the training step
into the build command). The web service receives the URL via `fromService`
and normalizes the bare host to `https://…` (see `src/lib/config/index.ts`).

## Honesty model (spec §28)

- No trained artifact → `trained: false`, `/predict` → 503, app shows
  "unavailable". No fallback numbers, ever.
- Fewer than 4 numeric features (or missing trained features) → 422 →
  app shows "Not enough data yet."
- Model probabilities are emitted only from `predict_proba`; a failed
  prediction yields `probability: null` rather than an invented value.
- The `source` field the app stores is `tabpfn-service` only when this
  service actually answered a prediction.
