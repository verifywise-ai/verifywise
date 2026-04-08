from infer.models_config import ModelSpec, ModelsConfig


def test_model_spec_region_defaults_to_none():
    spec = ModelSpec(provider="openrouter", model_id="google/gemini-2.5-pro")
    assert spec.region is None


def test_model_spec_accepts_region():
    spec = ModelSpec(
        provider="bedrock",
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region="us-east-1",
    )
    assert spec.region == "us-east-1"


def test_models_config_parses_bedrock_entry():
    data = {
        "version": "models_v0.1",
        "models": [
            {
                "provider": "bedrock",
                "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                "region": "us-east-1",
            }
        ],
    }
    cfg = ModelsConfig(**data)
    assert cfg.models[0].region == "us-east-1"


def test_existing_openrouter_spec_still_parses():
    """Regression: adding region field must not break existing openrouter entries."""
    data = {
        "version": "models_v0.1",
        "models": [{"provider": "openrouter", "model_id": "google/gemini-2.5-pro"}],
    }
    cfg = ModelsConfig(**data)
    assert cfg.models[0].region is None
