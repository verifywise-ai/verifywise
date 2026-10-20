"""Endpoint model names in LiteLLM form ("<provider>/<model>")."""

from typing import Optional

import litellm


def normalize_endpoint_model(provider: Optional[str], model: Optional[str]) -> Optional[str]:
    """Collapse a repeated provider prefix: "gemini/gemini/x" becomes "gemini/x".

    LiteLLM lists many models with their provider prefix already, and the
    endpoint form used to add it again. Only the providers an API key can be
    stored for are repaired (the same set migration a0017 repairs).
    Collapsing stops at a name LiteLLM knows. OpenRouter model ids are
    "<vendor>/<model>" and "openrouter" is itself a vendor
    ("openrouter/openrouter/auto"), so an OpenRouter name is never cut below
    three parts. Everything else is returned unchanged.
    """
    # Imported here: routers import this module, so a top-level import of a
    # router from it would tie the two together at load time.
    from routers.api_keys import VALID_PROVIDERS

    if (
        not isinstance(provider, str)
        or not isinstance(model, str)
        or provider not in VALID_PROVIDERS
    ):
        return model
    prefix = f"{provider}/"
    while model.startswith(prefix + prefix) and model not in litellm.model_cost:
        shorter = model[len(prefix):]
        if provider == "openrouter" and shorter.count("/") < 2:
            break
        model = shorter
    return model


def normalize_acl_models(entries: list[str], blocked: bool) -> list[str]:
    """Repair a virtual key's allowed/blocked model list the way a0017 does.

    Access rules are compared with the stored endpoint model, which is now
    collapsed on save, so an entry typed with a doubled prefix would never
    match. A plain allowed entry gets the same repair as an endpoint model.
    Blocked entries fail closed: the typed entry is kept and followed by its
    repaired form, so the block matches either way. An allowed wildcard is
    kept as typed (collapsing it would widen access); a blocked one is
    followed by its fully collapsed form.
    Order is kept and duplicates are dropped, so saving a list twice is stable.
    """
    from routers.api_keys import VALID_PROVIDERS

    result: list[str] = []
    for entry in entries:
        provider = entry.split("/", 1)[0]
        if "*" not in entry:
            if blocked:
                result.append(entry)
            result.append(normalize_endpoint_model(provider, entry))
            continue
        result.append(entry)
        prefix = f"{provider}/"
        if blocked and provider in VALID_PROVIDERS and entry.startswith(prefix + prefix):
            collapsed = entry
            while collapsed.startswith(prefix + prefix):
                collapsed = collapsed[len(prefix):]
            result.append(collapsed)
    return list(dict.fromkeys(result))
