"""
Redact credentials from provider error text before it leaves the gateway.

A copy of EvalServer's redact_secrets (EvalServer/src/utils/error_detection.py); the two
services deploy separately. Keep them in step: AIGateway/tests/test_redaction.py and
EvalServer's tests use the same cases.
"""

import re

# A value after password/secret/api_key/access_token is always redacted. After Bearer/Basic
# or a bare key/token it is redacted only when it looks like a credential, so error text
# such as "Unexpected token: <" or "Missing required key: messages_template" keeps its cause.
_TOKEN = r"[A-Za-z0-9._~+/=-]"
_SCHEME_VALUE = re.compile(r"(?i)\b(bearer|basic)(\s+)(" + _TOKEN + r"{8,})")
# A label starts after a non-alphanumeric character, so "OPENAI_API_KEY=" still matches.
_LABEL_START = r"(?<![A-Za-z0-9])"
_STRONG_LABEL_VALUE = re.compile(
    r"(?i)" + _LABEL_START + r"(password|passwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token)"
    r"([\"']?\s*[:=]\s*[\"']?)([^\s\"',;&]+)"
)
# A key or token query parameter in a URL the error echoes (Gemini sends ?key=...): the
# value is redacted whatever it looks like
_QUERY_SECRET = re.compile(r"(?i)([?&](?:key|api[_-]?key|access[_-]?token|token)=)[^&\s\"'#]+")
# user:password@ in a URL the error echoes (a proxy or api_base URL)
_URL_USERINFO = re.compile(r"(://[^/\s:@]*:)(\S+)(@)(?=[^@\s]*(?:\s|$))")
_WEAK_LABEL_VALUE = re.compile(
    r"(?i)" + _LABEL_START + r"(key|token)([\"']?\s*[:=]\s*[\"']?)(" + _TOKEN + r"{12,})"
)
_PREFIXED_SECRETS = [
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}"),
    re.compile(r"\b(?:hf|gsk|xox[bpas]|ghp|gho|github_pat)_[A-Za-z0-9_]{10,}"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{10,}"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(r"\bxai-[A-Za-z0-9]{8,}"),
]

# A shorter key would also match ordinary words in the error text
MIN_LITERAL_KEY_LENGTH = 8


def _looks_like_secret(value: str) -> bool:
    """A credential has a digit, mixed case, base64 padding, or is very long."""
    return (
        len(value) >= 24
        or any(c.isdigit() for c in value)
        or (any(c.isupper() for c in value) and any(c.islower() for c in value))
        or value.endswith("=")
    )


def redact_secrets(text: str, known_secret: str = "") -> str:
    """Replace credential-looking values, and known_secret itself, with [redacted]."""
    if len(known_secret) >= MIN_LITERAL_KEY_LENGTH:
        text = text.replace(known_secret, "[redacted]")

    def _keep_label(match: "re.Match[str]") -> str:
        label, sep, value = match.groups()
        return f"{label}{sep}[redacted]" if _looks_like_secret(value) else match.group(0)

    text = _QUERY_SECRET.sub(lambda m: f"{m.group(1)}[redacted]", text)
    text = _URL_USERINFO.sub(lambda m: f"{m.group(1)}[redacted]{m.group(3)}", text)
    text = _STRONG_LABEL_VALUE.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", text)
    text = _SCHEME_VALUE.sub(_keep_label, text)
    text = _WEAK_LABEL_VALUE.sub(_keep_label, text)
    for pattern in _PREFIXED_SECRETS:
        text = pattern.sub("[redacted]", text)
    return text
