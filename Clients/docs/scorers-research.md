# Scorers Research Summary

## What Are Scorers?

Scorers (also called evaluators/metrics) are functions that assess LLM outputs and return a score (typically 0-1). They're essential for measuring quality, detecting issues, and comparing model performance.

---

## Three Main Scorer Types

### 1. LLM-as-Judge (most common)

- Uses another LLM to evaluate outputs
- Best for subjective criteria (tone, helpfulness, creativity)
- Requires: prompt template, scoring rubric, judge model selection
- Techniques:
  - **G-Eval**: Chain of Thought + probability normalization
  - **QAG**: Binary yes/no questions
  - **DAG**: Decision trees with branching logic

### 2. Code-based (TypeScript/Python)

- Deterministic, fast, cheap
- Best for: exact match, regex, keyword presence, format validation
- Returns numeric score or boolean

### 3. Pre-built/Library

- Ready-to-use metrics for common tasks
- Examples: Hallucination detection, RAG relevance, Toxicity, Factuality

---

## Vendor Comparison

| Feature               | Braintrust                    | DeepEval                           | LangSmith                                  | Arize Phoenix                                 |
| --------------------- | ----------------------------- | ---------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Scorer Types**      | LLM Judge, TypeScript, Python | LLM-as-Judge (G-Eval, QAG, DAG)    | Python/TS custom evaluators                | Pre-built + Custom LLM                        |
| **Score Range**       | 0-1 with choice labels        | 0-1 with threshold (default 0.5)   | Numeric, boolean, categorical, or multiple | Binary or multi-class labels mapped to scores |
| **Custom Prompts**    | Yes (multi-turn builder)      | G-Eval supports custom criteria    | Custom evaluator functions                 | Custom prompts with label mappings            |
| **CoT Support**       | Toggle option                 | Built into G-Eval                  | Via custom logic                           | Via prompt template                           |
| **Pre-built Metrics** | AutoEvals library             | Hallucination, RAG, Toxicity, etc. | embedding_distance, exact_match, etc.      | 15+ pre-built (Hallucination, QA, RAG, etc.)  |

---

## Braintrust's UI Components (Reference Screenshot)

| Field          | Purpose                                      |
| -------------- | -------------------------------------------- |
| Name/Slug      | Identifier for the scorer                    |
| Type toggle    | LLM judge / TypeScript / Python              |
| AI providers   | Select judge model (OpenAI, Anthropic, etc.) |
| Prompt builder | System + User messages for the judge         |
| CoT toggle     | Enable chain-of-thought reasoning            |
| Choice scores  | Map labels to numeric scores (0-1)           |
| Description    | Document what the scorer evaluates           |
| Metadata       | Additional config/tags                       |

---

## Key Design Patterns

1. **Choice scores are critical** - Force LLM to pick from defined options (e.g., "Excellent"=1, "Good"=0.7, "Poor"=0.3, "Fail"=0) rather than free-form numbers

2. **Binary is often better** - Pass/fail (1/0) scoring is easier to calibrate than granular scales

3. **CoT improves accuracy** - Having the judge explain reasoning before scoring reduces errors

4. **Threshold-based pass/fail** - DeepEval defaults to 0.5 threshold for determining success

---

## Common Pre-built Metrics by Use Case

| Use Case          | Metrics                                               |
| ----------------- | ----------------------------------------------------- |
| **RAG**           | Context relevancy, Answer faithfulness, Hallucination |
| **Chatbot**       | Helpfulness, Coherence, Toxicity                      |
| **Safety**        | Bias detection, Harmful content, PII leakage          |
| **Code Gen**      | Correctness, Syntax validity, Test pass rate          |
| **Summarization** | Factual consistency, Coverage, Conciseness            |

---

## DeepEval Specific Techniques

### G-Eval

- Most versatile metric type
- Uses LLM-as-a-judge with chain-of-thoughts (CoT)
- Can evaluate ANY custom criteria with human-like accuracy

### DAG (Deep Acyclic Graph)

- Decision tree powered by LLM-as-a-judge
- Node types:
  - **Task nodes**: Break down test case into atomic units
  - **Binary Judgment nodes**: True/False decisions
  - **Non-Binary Judgment nodes**: List of string options
  - **Verdict nodes**: Return final score based on evaluation path

### QAG (Question Answer Generation)

- Constrains verdicts to binary "yes" or "no"
- Very little room for stochasticity
- Used in RAG metrics like contextual precision

---

## Implementation Recommendations for VerifyWise

### Phase 1: Core UI

- Scorer list view with table (name, type, status, last modified)
- Create scorer modal/page with:
  - Name & slug fields
  - Type selector (LLM Judge, Code)
  - For LLM Judge: prompt builder, model selector, CoT toggle, choice scores
  - Description field

### Phase 2: Pre-built Library

- Add pre-built scorers for common use cases:
  - Hallucination detection
  - Answer relevancy
  - Toxicity
  - Factual consistency

### Phase 3: Advanced Features

- Code editor for TypeScript/Python scorers
- Scorer versioning
- A/B testing scorers
- Online/real-time scoring

---

## Sources

- [Braintrust Scorers](https://www.braintrust.dev/docs/guides/functions/scorers)
- [Braintrust Writing Scorers Best Practices](https://www.braintrust.dev/docs/best-practices/scorers)
- [DeepEval Metrics Introduction](https://deepeval.com/docs/metrics-introduction)
- [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals)
- [LangSmith Custom Evaluators](https://docs.smith.langchain.com/evaluation/how_to_guides/custom_evaluator)
- [Arize Phoenix Evals](https://arize.com/docs/phoenix/evaluation/llm-evals)
- [LLM-as-a-Judge Guide](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)
