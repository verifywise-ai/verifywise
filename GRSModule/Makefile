.PHONY: seeds render perturb validate all backfill-base export-parquet publish-dataset generate judge-patch

seeds:
	uv run grs-scenarios generate --stage seeds

render:
	uv run grs-scenarios generate --stage render --seed 42 --per-obligation 3

perturb:
	uv run grs-scenarios generate --stage perturb --seed 42 --k-per-base 3 --coverage per_family

validate:
	uv run grs-scenarios generate --stage validate

backfill-base:
	@if [ -z "$(VERSION)" ]; then echo "Error: VERSION is required. Usage: make backfill-base VERSION=grs_scenarios_v0.3"; exit 1; fi
	uv run grs-scenarios generate --stage backfill-base --dataset-version $(VERSION)

infer-mock-client:
	uv run grs-scenarios generate --stage infer --model-id mock-v0 --limit 3

infer-openrouter-gpt4:
	uv run grs-scenarios generate --stage infer --provider openrouter --model-id openai/gpt-4o-mini 

infer-multi-model:
	uv run grs-scenarios generate --stage infer --models-config configs/models.yaml --temperature 0.2 --max-tokens 8192 --limit 6 --resume

infer-debug:
	uv run grs-scenarios generate --stage infer --models-config configs/models.yaml --dataset-version debug --temperature 0.2 --max-tokens 512 --limit 1

judge:
	uv run grs-scenarios generate --stage judge --judge-model-id openai/gpt-4o-mini --judge-limit 6

judge-resume:
	uv run grs-scenarios generate --stage judge --judge-resume

judge-patch:
	uv run grs-scenarios generate --stage judge-patch \
		--dataset-version debug \
		--patch-dimension accountability_transparency \
		--judge-model-id openai/gpt-5.2 \
		--judge-provider openrouter

run-scenario-viewer:
	uv run streamlit run viewer.py

all: seeds render perturb validate

export-parquet:
	uv run python scripts/export_parquet.py --dataset-dir datasets/$(VERSION)

VERSION ?= grs_scenarios_v0.1

generate:
	uv run python scripts/run_pipeline.py --version $(VERSION)

publish-dataset: export-parquet
	@if [ -z "$(VERSION)" ]; then echo "Error: VERSION is required. Usage: make publish-dataset VERSION=grs_scenarios_v0.1"; exit 1; fi
	@echo "Snapshotting configs/ → datasets/$(VERSION)/configs_snapshot/ ..."
	mkdir -p datasets/$(VERSION)/configs_snapshot/
	cp -r configs/. datasets/$(VERSION)/configs_snapshot/
	@echo "Publishing datasets/ to data/grs_scenarios branch via git worktree..."
	git -C .. worktree remove --force /tmp/grs-data 2>/dev/null || true
	git -C .. show-ref --verify --quiet refs/heads/data/grs_scenarios \
		&& git -C .. worktree add /tmp/grs-data data/grs_scenarios \
		|| git -C .. worktree add -b data/grs_scenarios /tmp/grs-data
	mkdir -p /tmp/grs-data/GRSModule
	cp -r datasets/ /tmp/grs-data/GRSModule/
	cd /tmp/grs-data && git add GRSModule/datasets/ && git commit -m "$(if $(MSG),$(MSG),data: publish $(VERSION) $$(date +%Y-%m-%d))"
	git -C .. worktree remove /tmp/grs-data
	@echo "Done. $(VERSION) committed to data/grs_scenarios."

ui-install:
	uv sync && cd ui/frontend && npm install

ui-dev:
	uvicorn ui.backend.app:app --port 8200 --reload &
	cd ui/frontend && npm run dev

ui-build:
	cd ui/frontend && npm run build
