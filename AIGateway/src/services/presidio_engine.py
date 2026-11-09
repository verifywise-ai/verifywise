"""
Presidio PII detection engine — lazy-loaded, in-process.

Loads spaCy model + Presidio only when first PII scan is requested.
Includes custom recognizers for EU-specific patterns (IBAN, TCKN, EU phone).
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy singletons
_analyzer = None
_anonymizer = None
_initialized = False

# The spaCy model requirements.txt installs (pinned wheel). Presidio's own
# default is en_core_web_lg (~560 MB), which nothing installs, so without this
# the engine downloaded lg on its first PII scan.
SPACY_MODEL = "en_core_web_md"


def nlp_configuration() -> dict:
    """Presidio's default NLP configuration (its default.yaml: NER entity
    mapping, ignored labels, confidence) keeping only the English model,
    swapped for SPACY_MODEL. A hand-written config would drop the NER
    settings and change what PII rules detect. Raises when a Presidio upgrade
    changes the default's shape, rather than silently loading another model."""
    import copy

    from presidio_analyzer.nlp_engine import NlpEngineProvider

    # Copied so a Presidio that caches its default is never edited in place.
    config = copy.deepcopy(NlpEngineProvider().nlp_configuration)
    models = config.get("models") or []
    english = [m for m in models if isinstance(m, dict) and m.get("lang_code") == "en"]
    if (
        config.get("nlp_engine_name") != "spacy"
        or not all(isinstance(m, dict) for m in models)
        or len(english) != 1
        or not isinstance(english[0].get("model_name"), str)
    ):
        raise RuntimeError(
            "Presidio's default NLP configuration changed shape; update presidio_engine.nlp_configuration"
        )
    english[0]["model_name"] = SPACY_MODEL
    config["models"] = english
    return config


def _get_custom_recognizers():
    """Build custom pattern recognizers for EU-specific PII."""
    from presidio_analyzer import Pattern, PatternRecognizer

    recognizers = []

    # IBAN (International Bank Account Number)
    recognizers.append(
        PatternRecognizer(
            supported_entity="IBAN_CODE",
            name="iban_recognizer",
            patterns=[
                Pattern(
                    name="iban_pattern",
                    regex=r"\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4}\b",
                    score=0.85,
                )
            ],
            supported_language="en",
        )
    )

    # Turkish TCKN (11-digit national ID)
    recognizers.append(
        PatternRecognizer(
            supported_entity="TR_TCKN",
            name="turkish_tckn_recognizer",
            patterns=[
                Pattern(
                    name="tckn_pattern",
                    regex=r"\b[1-9]\d{10}\b",
                    score=0.6,
                )
            ],
            supported_language="en",
        )
    )

    # EU phone numbers (common formats)
    recognizers.append(
        PatternRecognizer(
            supported_entity="EU_PHONE",
            name="eu_phone_recognizer",
            patterns=[
                Pattern(
                    name="eu_phone_intl",
                    regex=r"\+(?:33|49|44|34|39|31|32|43|41|90|48|46|47|45|358)[\s.-]?\d[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}",
                    score=0.7,
                )
            ],
            supported_language="en",
        )
    )

    return recognizers


def _ensure_initialized():
    """Lazy-load Presidio analyzer and anonymizer on first use."""
    global _analyzer, _anonymizer, _initialized

    if _initialized:
        return

    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider
        from presidio_anonymizer import AnonymizerEngine

        logger.info(f"Loading Presidio engine with {SPACY_MODEL}...")
        nlp_engine = NlpEngineProvider(nlp_configuration=nlp_configuration()).create_engine()
        _analyzer = AnalyzerEngine(nlp_engine=nlp_engine)

        # Add custom EU recognizers
        for recognizer in _get_custom_recognizers():
            _analyzer.registry.add_recognizer(recognizer)
            logger.info(f"Registered custom recognizer: {recognizer.name}")

        _anonymizer = AnonymizerEngine()
        _initialized = True
        logger.info("Presidio engine initialized successfully")
    except ImportError as e:
        logger.error(f"Presidio not installed: {e}")
        raise RuntimeError(
            "Presidio is not installed. Install AIGateway/requirements.txt as the Dockerfile does "
            "(presidio-anonymizer with --no-deps, to keep cryptography>=50)"
        ) from e
    except Exception as e:
        logger.error(f"Failed to initialize Presidio: {e}")
        raise


def analyze_text(
    text: str,
    entities: Optional[list[str]] = None,
    language: str = "en",
    score_thresholds: Optional[dict[str, float]] = None,
) -> list[dict]:
    """
    Analyze text for PII entities.

    Returns list of detections:
    [{ "entity_type": "EMAIL_ADDRESS", "start": 10, "end": 25, "score": 0.95, "text": "john@example.com" }]
    """
    _ensure_initialized()

    results = _analyzer.analyze(
        text=text,
        entities=entities,
        language=language,
    )

    global_threshold = (score_thresholds or {}).get("ALL", 0.0)

    detections = []
    for result in results:
        # Apply score thresholds
        entity_threshold = (score_thresholds or {}).get(
            result.entity_type, global_threshold
        )
        if result.score < entity_threshold:
            continue

        detections.append(
            {
                "entity_type": result.entity_type,
                "start": result.start,
                "end": result.end,
                "score": round(result.score, 3),
                "text": text[result.start : result.end],
            }
        )

    return detections


def is_available() -> bool:
    """Check if Presidio can be loaded (without actually loading it)."""
    try:
        import presidio_analyzer  # noqa: F401
        import presidio_anonymizer  # noqa: F401

        return True
    except ImportError:
        return False


def _missing_spacy_models() -> list[str]:
    """spaCy models the engine's NLP configuration needs that are not installed."""
    import spacy.util

    return [m["model_name"] for m in nlp_configuration()["models"] if not spacy.util.is_package(m["model_name"])]


def warm_up() -> bool:
    """Load the engine now so the first PII scan does not wait for it.

    Skips (returns False) when Presidio or its spaCy model is not installed:
    Presidio would download a missing model, and a startup preload must not
    pull hundreds of MB on every start. The lazy path in analyze_text still
    loads (or downloads) it, or raises its clear error, on the first PII scan.
    Other load errors are raised to the caller.
    """
    if _initialized:
        return True
    if not is_available():
        logger.info("Presidio is not installed; skipping PII engine preload")
        return False
    missing = _missing_spacy_models()
    if missing:
        logger.info(f"spaCy model {', '.join(missing)} not installed; PII engine will load on first PII scan")
        return False
    _ensure_initialized()
    return True
