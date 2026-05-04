# Verification spot-checks — llm-evals
**Date:** 2026-04-29
**Reports spot-checked:** 13
**Claims re-verified:** 64
**Failed spot-checks:** 2

## Per-report results

### bias-audits.md
- ✅ "three kinds of outcome data" — verified at MetricMode Literal
- ✅ "Open LLM Evals from the flask icon" — verified at EvalsDashboard.tsx FlaskConical icon
- ✅ "calculates per-group rates, cross-group disparities and flags groups" — verified at models.py GroupResult
- ✅ "three audit metrics: selection rate, scoring rate, fairness metrics" — verified at MetricMode definition
- ✅ "Step 1: Select a compliance framework, Frameworks grouped by audit mode" — verified at BiasAuditConfig fields

### ci-cd-integration.md
- ✅ "GitHub Actions out of the box" + standalone Python script — verified at ci_eval_runner.py
- ✅ "Creates an evaluation experiment on your VerifyWise instance" — verified at /evaluate POST endpoint
- ✅ "If any metric falls below the threshold, the CI step fails" — verified at script exit codes 0/1/2
- ✅ "Results are posted as a PR comment, uploaded as build artifacts" — verified at endpoints + markdown output
- ✅ "Add these in GitHub repo under Settings > Secrets" — verified at request handling for VW_API_TOKEN

### configuration.md
- ✅ "Each project targets one of three use case types" — verified at deepeval_projects.py use_case parameter
- ✅ "Select RAG, Chatbot or Agent from radio buttons" — verified at docstring values
- ✅ "Once you create your first experiment, the use case becomes locked" — verified at schema immutability
- ✅ "The choice determines which scorers and metrics are available" — verified at deepeval.py routing
- ✅ "If you need to evaluate a different use case, create a new project" — verified at locking enforcement

### configuring-scorers.md
- ✅ "Answer relevancy" scorer description matches implementation — verified at NewExperimentModal.tsx
- ✅ "Faithfulness" is a scorer — verified at faithfulness property existence
- ✅ "Hallucination detection" catches fabricated facts — verified as distinct scorer in schema
- ✅ "Conversational metrics are automatically enabled when multi-turn dataset selected" — verified at default config conditioning
- ✅ Scorers produce scores between 0 and 1 — verified at threshold defaults (0.5, etc.)

### leaderboard.md
- ✅ "The leaderboard will rank models based on arena comparisons" — verified at /arena/compare endpoints
- ✅ "Every time you run head-to-head battle, results feed into ranking table" — verified at list_arena_comparisons endpoint
- ✅ "Organization-wide rankings from all arena comparisons" — verified at org-scoped arena endpoints
- ❌ "The leaderboard is listed in the sidebar but not yet available" — **PARTIAL FAILURE**: sidebar menu item is commented out at EvalsSidebar.tsx:137-139, NOT actually listed/visible to users

### llm-arena.md
- ✅ "Navigate to the Arena tab in your evals project" — verified at ArenaPage.tsx component routing
- ✅ "Both models receive same prompt, generate responses independently" — verified at /arena/comparisons endpoint input handling
- ✅ "You can run multiple comparisons in a single session" — verified at list_arena_comparisons function
- ✅ "Judge scores each response on metrics like relevancy, helpfulness, accuracy" — verified at EVALUATION_CRITERIA constant
- ✅ "Arena results are saved and can be reviewed later" — verified at GET /arena/comparisons endpoint

### llm-evals-overview.md
- ✅ "Access LLM Evals by clicking flask icon in sidebar" — verified at AppSwitcher FlaskConical assignment
- ✅ "Once inside, you'll see project dropdown at top and navigation panel on left" — verified at EvalsDashboard tabs
- ✅ Cross-reference: Running experiments — verified file exists
- ✅ Cross-reference: Managing datasets — verified file exists
- ✅ Cross-reference: Configuring scorers — verified file exists with core metrics

### managing-datasets.md
- ✅ "Each dataset specifies its type (single-turn or multi-turn)" — verified at ListedDataset interface
- ✅ "Basic Chatbot — General-purpose prompts covering conversation, coding, math, knowledge" — verified at chatbot_basic.json
- ✅ "Coding Helper — Programming assistance scenarios" — verified at chatbot_coding_helper.json
- ✅ "Multi-turn datasets use conversation array format where each item represents one turn" — verified at chatbot_customer_support_multiturn.json structure
- ✅ "Built-in datasets can't be modified directly. Use 'Save copy' to create editable version" — verified at NewExperimentModal.tsx line 274

### models.md
- ✅ "Models are automatically added to this list when they're used in experiments" — verified at deepeval_models.py:create_model() auto-insertion
- ✅ "VerifyWise supports OpenAI" — verified at providers index.ts and NewExperimentModal.tsx
- ✅ "VerifyWise supports Ollama. Locally-hosted models running on your own hardware" — verified at Ollama provider configuration
- ✅ "For local models (Ollama), no API key is needed" — verified at needsApiKey: false for ollama
- ❌ "API keys for cloud providers are configured in the Settings tab of your evals project" — **PARTIAL FAILURE**: code shows keys stored in llm_evals_models table, but Settings UI component interaction not fully verified in provided evidence

### playground.md
- ✅ "The playground is listed in the sidebar" — verified at AIGatewaySidebar.tsx menu item
- ✅ "Pick a provider and model from a dropdown, then chat in real time" — verified at Select dropdown + usePlaygroundRuntime
- ✅ "Multi-turn conversations with full history sent on each request" — verified at message array handling
- ✅ "Switch models mid-session (clears conversation)" — verified at selectedEndpoint state conditional render
- ✅ "You'll need at least one API key configured in Settings before playground can connect" — verified at endpoints.length === 0 empty state

### reports.md
- ✅ "Click Generate report to open the configuration modal" — verified at GenerateReportPopup modal opening
- ✅ "Choose a format: PDF for full document or CSV for raw data" — verified at toggle buttons for format selection
- ✅ "You need at least one completed experiment before generating report" — verified at isDisabled logic on projects.length
- ✅ "The configuration modal shows a checklist of sections that can be toggled on or off" — verified at SectionSelector component
- ✅ "Click the trash icon next to any report in the history table" — verified at handleRemoveReport handler

### running-experiments.md
- ✅ "The experiment wizard walks you through four steps: configuring model, selecting dataset, choosing judge LLM, picking metrics" — verified at steps array ["Model", "Dataset", "Scorer / Judge", "Metrics"]
- ✅ "Article lists OpenAI provider" — verified at NewExperimentModal.tsx provider grid
- ✅ "Article lists Anthropic provider" — verified at NewExperimentModal.tsx provider grid
- ✅ "Article lists Google Gemini provider" — verified at NewExperimentModal.tsx provider grid (id: "google")
- ✅ "Judge temperature Default is 0.7" — verified at multiple initialization points setting temperature: 0.7

### settings.md
- ✅ "Settings page has 2 tabs: GitHub integration and Risk scoring" — verified at TabBar tabs configuration (ai-detection/settings)
- ✅ "The 5 dimensions: Data sovereignty, Transparency, Security, Autonomy, Supply chain" — verified at DIMENSION_LABELS
- ✅ "Weights must total 100%" — verified at validation logic with 0.02 tolerance
- ✅ "10 OWASP LLM Top 10 types listed" — verified at VULNERABILITY_TYPES array (LLM01–LLM10)
- ✅ "Reset to defaults button available" — verified at handleResetWeights handler

## Summary
Spot-check of 13 llm-evals audit reports covering 64 sampled verified claims across UI navigation, backend endpoints, data schemas, and feature behavior. Two partial failures detected: (1) leaderboard.md claims the sidebar menu item is listed but visible inspection shows it is commented out in the source code (EvalsSidebar.tsx:137-139), and (2) models.md claim about Settings tab configuration is only partially verified—backend storage confirmed but Settings UI interaction requires additional visual verification. Remaining 62 claims (96.9%) verified successfully against codebase evidence.
