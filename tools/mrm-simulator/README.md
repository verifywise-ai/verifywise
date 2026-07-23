# MRM model-eval simulator

A standalone tool that impersonates a model-monitoring platform and feeds
compute-backed metrics into VerifyWise's MRM ingestion API, then reports gaps.

## Prerequisites

- VerifyWise backend running locally (`http://localhost:3000`) with an admin login.
- Node 22+.
- Python 3.11+ with a virtualenv for the compute module:

```bash
cd tools/mrm-simulator/compute
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Fleet configuration

The fleet of models is defined in `tools/mrm-simulator/config.yaml`. Each entry
specifies model metadata, the dataset file, metric keys, and threshold rules.
Edit `config.yaml` to add or remove models without touching any TypeScript.

## Datasets

CSV datasets live in `tools/mrm-simulator/datasets/`, with drift embedded in the
data. They are committed static; regenerate deterministically with:

```bash
cd tools/mrm-simulator/datasets
../compute/venv/bin/python generate.py
```

## Install

```bash
cd tools/mrm-simulator
npm install
```

## Usage

Pass CLI flags after a `--` (so npm forwards them), or invoke `tsx` directly.
The bundled datasets are fixed-date (2026-06-01 onward), so backfill needs
`--start-date` to align the periods with the dataset dates.

```bash
npm run sim -- setup                                        # create fleet + thresholds + token (idempotent)
npm run sim -- backfill --days 30 --start-date 2026-06-01   # push computed history over the dataset window
npm run sim -- live --interval 5s                           # keep pushing; watch a breach happen
npm run sim -- verify                                       # read MRM back, write gaps-report.md

# equivalently, without npm's arg forwarding:
npx tsx src/cli.ts backfill --days 30 --start-date 2026-06-01
```

Add `--dry-run` to `backfill`/`live` to print without POSTing (still computes).
Without `--start-date`, backfill walks the last N days ending today, which only
works if the datasets cover that range.
Credentials come from `VW_EMAIL` / `VW_PASSWORD` (default dev creds).
The tool refuses non-localhost targets unless `--i-know-what-im-doing` is passed.

## Live dashboard

```bash
npm run sim -- dashboard --start-date 2026-06-01 --days 30 --port 4000
```

Starts a local web dashboard (default `http://localhost:4000`) that drives the
simulation and streams computed metrics, breaches, and ingestion results live.
Four panels: fleet overview, per-model metric charts (with threshold lines),
a breach/event feed, and ingestion totals. The URL is printed and opened in
your browser automatically (best-effort). Requires the Python compute venv and
a running VerifyWise backend, same as the other commands.

## Output

`gaps-report.md` — categorised findings (Contract / Workflow / UX) to triage
against the MRM feature.
