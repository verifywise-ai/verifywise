"""DeepEval evaluation engine for comprehensive LLM evaluation."""

# The classes load on first use (PEP 562), so importing a light submodule such as
# gateway_litellm_client does not pull in torch, transformers and deepeval.
_LAZY = {
    "DeepEvalEvaluator": ".deepeval_evaluator",
    "EvaluationDataset": ".evaluation_dataset",
    "ModelRunner": ".model_runner",
}

__all__ = list(_LAZY)


def __getattr__(name):
    if name in _LAZY:
        from importlib import import_module

        return getattr(import_module(_LAZY[name], __name__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
