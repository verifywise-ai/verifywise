.PHONY: seeds render perturb all export-parquet publish-dataset generate

seeds:
	uv run grs-scenarios generate --stage seeds

render:
	uv run grs-scenarios generate --stage render --seed 42 --per-obligation 2

perturb:
	uv run grs-scenarios generate --stage perturb --seed 42 --k-per-base 3 --coverage per_family

validate:
	uv run grs-scenarios generate --stage validate

infer-mock-client:
	uv run grs-scenarios generate --stage infer --model-id mock-v0 --limit 3

infer-openrouter-gpt4:
	uv run grs-scenarios generate --stage infer --provider openrouter --model-id openai/gpt-4o-mini 

infer-multi-model:
	uv run grs-scenarios generate --stage infer --models-config configs/models.yaml --temperature 0.2 --max-tokens 8192 --limit 6 --resume

judge:
	uv run grs-scenarios generate --stage judge --judge-model-id openai/gpt-4o-mini --judge-limit 6

judge-resume:
	uv run grs-scenarios generate --stage judge --judge-resume

run-scenario-viewer:
	uv run streamlit run viewer.py

all: seeds render perturb validate

export-parquet:
	uv run python scripts/export_parquet.py --dataset-dir datasets/grs_scenarios_v0.1

VERSION ?= grs_scenarios_v0.1

generate:
	uv run python scripts/run_pipeline.py --version $(VERSION)

publish-dataset: export-parquet
	@if [ -z "$(VERSION)" ]; then echo "Error: VERSION is required. Usage: make publish-dataset VERSION=grs_scenarios_v0.1"; exit 1; fi
	@echo "Snapshotting configs/ → datasets/$(VERSION)/configs_snapshot/ ..."
	cp -r configs/ datasets/$(VERSION)/configs_snapshot/
	@echo "Publishing datasets/ to data/$(VERSION) branch via git worktree..."
	git -C .. worktree remove --force /tmp/grs-data 2>/dev/null || true
	git -C .. worktree add /tmp/grs-data data/$(VERSION)
	cp -r datasets/ /tmp/grs-data/GRSModule/
	cd /tmp/grs-data && git add GRSModule/datasets/ && git commit -m "data: publish $(VERSION) $$(date +%Y-%m-%d)"
	git -C .. worktree remove /tmp/grs-data
	@echo "Done. $(VERSION) committed to data/$(VERSION)."
