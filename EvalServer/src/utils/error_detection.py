"""
Fatal error detection for experiment execution.

Detects API errors that are unrecoverable (won't succeed on retry)
and should stop the experiment early to avoid wasting time.
"""

import re
from typing import List, Optional, Tuple

# Fatal error patterns that won't recover - experiment should stop
# Format: (pattern_to_match, error_code, user_friendly_message)
FATAL_ERROR_PATTERNS = [
    # Credit/billing issues
    (
        "credit balance is too low",
        "insufficient_credits",
        "API credit balance is too low. Please add credits to your account.",
    ),
    (
        "insufficient_quota",
        "insufficient_credits",
        "API quota is insufficient. Please add credits to your account.",
    ),
    (
        "quota exceeded",
        "quota_exceeded",
        "API quota has been exceeded. Please wait or upgrade your plan.",
    ),
    (
        "rate limit exceeded",
        "rate_limit",
        "API rate limit exceeded. Please wait before retrying.",
    ),
    (
        "billing hard limit",
        "billing_limit",
        "Billing hard limit reached. Please check your account settings.",
    ),

    # Authentication issues
    (
        "invalid api key",
        "invalid_api_key",
        "The API key is invalid. Please check your API key configuration.",
    ),
    (
        "invalid x-api-key",
        "invalid_api_key",
        "The API key is invalid. Please check your API key configuration.",
    ),
    (
        "incorrect api key",
        "invalid_api_key",
        "The API key is incorrect. Please check your API key configuration.",
    ),
    (
        "authentication failed",
        "auth_failed",
        "Authentication failed. Please check your API key.",
    ),
    (
        "unauthorized",
        "unauthorized",
        "Unauthorized access. Please check your API key permissions.",
    ),
    (
        "permission denied",
        "permission_denied",
        "Permission denied. Your API key may not have access to this model.",
    ),
    (
        "access denied",
        "access_denied",
        "Access denied. Please check your API key permissions.",
    ),

    # Model issues
    (
        "model not found",
        "model_not_found",
        "The specified model was not found. Please check the model name.",
    ),
    (
        "does not exist",
        "model_not_found",
        "The specified model does not exist. Please check the model name.",
    ),
    (
        "model is not available",
        "model_unavailable",
        "The model is not available. Please try a different model.",
    ),
    (
        "model_not_found",
        "model_not_found",
        "The specified model was not found. Please check the model name.",
    ),

    # Account issues
    (
        "account has been disabled",
        "account_disabled",
        "Your account has been disabled. Please contact support.",
    ),
    (
        "access terminated",
        "access_terminated",
        "API access has been terminated. Please contact support.",
    ),
    (
        "account suspended",
        "account_suspended",
        "Your account has been suspended. Please contact support.",
    ),
]

# Errors that might recover with retry - don't stop experiment
TRANSIENT_ERROR_PATTERNS = [
    "timeout",
    "connection reset",
    "connection refused",
    "temporarily unavailable",
    "service unavailable",
    "internal server error",
    "bad gateway",
    "gateway timeout",
    "overloaded",
    "try again",
]


def detect_fatal_error(error_message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Check if an error message indicates a fatal (unrecoverable) error.

    Args:
        error_message: The error message string to analyze

    Returns:
        Tuple of (is_fatal, error_code, user_message)
        - is_fatal: True if error is fatal and experiment should stop
        - error_code: Short code for the error type (e.g., "insufficient_credits")
        - user_message: Human-readable message for display
    """
    if not error_message:
        return False, None, None

    error_lower = error_message.lower()

    # First check if it's a transient error (might recover)
    for pattern in TRANSIENT_ERROR_PATTERNS:
        if pattern in error_lower:
            return False, None, None

    # Check for fatal error patterns
    for pattern, error_code, user_message in FATAL_ERROR_PATTERNS:
        if pattern in error_lower:
            return True, error_code, user_message

    return False, None, None


def is_same_error_type(error_code1: Optional[str], error_code2: Optional[str]) -> bool:
    """
    Check if two error codes represent the same type of error.
    Used to track consecutive errors of the same type.
    """
    if not error_code1 or not error_code2:
        return False
    return error_code1 == error_code2


class FatalErrorTracker:
    """
    Tracks consecutive fatal errors during experiment execution.
    Triggers early termination when threshold is reached.
    """

    def __init__(self, threshold: int = 2):
        """
        Args:
            threshold: Number of consecutive fatal errors before stopping
        """
        self.threshold = threshold
        self.consecutive_count = 0
        self.last_error_code: Optional[str] = None
        self.last_error_message: Optional[str] = None
        self.last_user_message: Optional[str] = None

    def track_error(self, error_message: str) -> bool:
        """
        Track an error and determine if experiment should stop.

        Args:
            error_message: The error message from the failed operation

        Returns:
            True if experiment should stop (threshold reached), False otherwise
        """
        is_fatal, error_code, user_message = detect_fatal_error(error_message)

        if not is_fatal:
            # Non-fatal error, reset counter
            self.reset()
            return False

        # Fatal error detected
        if is_same_error_type(error_code, self.last_error_code):
            # Same type of fatal error, increment counter
            self.consecutive_count += 1
        else:
            # Different type of fatal error, start new count
            self.consecutive_count = 1
            self.last_error_code = error_code

        self.last_error_message = error_message
        self.last_user_message = user_message

        # Check if threshold reached
        return self.consecutive_count >= self.threshold

    def track_success(self):
        """
        Track a successful operation. Resets the error counter.
        """
        self.reset()

    def reset(self):
        """Reset the error tracking state."""
        self.consecutive_count = 0
        self.last_error_code = None
        self.last_error_message = None
        self.last_user_message = None

    def get_termination_reason(self) -> str:
        """
        Get the reason for early termination.

        Returns:
            Human-readable termination reason
        """
        if self.last_user_message:
            return f"{self.last_user_message} (failed {self.consecutive_count} times consecutively)"
        elif self.last_error_message:
            return f"Fatal error: {self.last_error_message[:200]}"
        else:
            return "Unknown fatal error"


NO_RESPONSES_MESSAGE = "No responses generated"
MAX_FIRST_ERROR_CHARS = 300

# Credentials that provider and HTTP client errors can echo back (request URL,
# headers, request body). Stored failure reasons are shown to every user of the
# organization. A value after password/secret/api_key/access_token is always
# redacted. After Bearer/Basic or a bare key/token it is redacted only when it
# looks like a credential, so error text such as
# "Unexpected token: <", "Basic authentication is not supported" or
# "Missing required key: messages_template" keeps its cause.
_TOKEN = r"[A-Za-z0-9._~+/=-]"
_SCHEME_VALUE = re.compile(r"(?i)\b(bearer|basic)(\s+)(" + _TOKEN + r"{8,})")
# A label starts after a non-alphanumeric character, not at a word boundary,
# so an env-style name ("OPENAI_API_KEY=", "x_api_key:") still matches.
_LABEL_START = r"(?<![A-Za-z0-9])"
# Labels that always introduce a secret: the value is redacted whatever it looks like.
# The value runs to the next whitespace, quote or separator, so a password
# with symbols ("a!b@c#d$") is redacted whole, not cut at the first symbol.
_STRONG_LABEL_VALUE = re.compile(
    r"(?i)" + _LABEL_START + r"(password|passwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token)"
    r"([\"']?\s*[:=]\s*[\"']?)([^\s\"',;&]+)"
)
# user:password@ (or :password@, as Redis URLs carry it) in a URL the error
# echoes (e.g. a proxy or database URL). The password runs to the last "@"
# before the host, so one containing "@" or "/" is redacted whole. Text
# like "host:8080/a@b" reads the same as "user:1234/abc@host", so it is
# redacted too: losing a port from an error beats leaking a password.
_URL_USERINFO = re.compile(r"(://[^/\s:@]*:)(\S+)(@)(?=[^@\s]*(?:\s|$))")
# Labels that also appear in ordinary error text ("Missing required key: x").
_WEAK_LABEL_VALUE = re.compile(
    r"(?i)" + _LABEL_START + r"(key|token)([\"']?\s*[:=]\s*[\"']?)(" + _TOKEN + r"{12,})"
)
_PREFIXED_SECRETS = [
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}"),
    re.compile(r"\b(?:hf|gsk|xox[bpas]|ghp|gho|github_pat)_[A-Za-z0-9_]{10,}"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{10,}"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
]


def _looks_like_secret(value: str) -> bool:
    """A credential has a digit, mixed case, base64 padding, or is very long."""
    return (
        len(value) >= 24
        or any(c.isdigit() for c in value)
        or (any(c.isupper() for c in value) and any(c.islower() for c in value))
        or value.endswith("=")
    )


def redact_secrets(text: str) -> str:
    """Replace credential-looking values in an error message with [redacted]."""

    def _keep_label(match: "re.Match[str]") -> str:
        label, sep, value = match.groups()
        return f"{label}{sep}[redacted]" if _looks_like_secret(value) else match.group(0)

    text = _URL_USERINFO.sub(lambda m: f"{m.group(1)}[redacted]{m.group(3)}", text)
    text = _STRONG_LABEL_VALUE.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", text)
    text = _SCHEME_VALUE.sub(_keep_label, text)
    text = _WEAK_LABEL_VALUE.sub(_keep_label, text)
    for pattern in _PREFIXED_SECRETS:
        text = pattern.sub("[redacted]", text)
    return text


def build_no_responses_message(total_prompts: int, errors: List[str]) -> str:
    """
    Build the failure reason for a run in which no prompt produced a response.

    Each failed prompt already has its own error log; this summarises them so
    the experiment's error_message says why the run failed, not only that it did.

    Args:
        total_prompts: Number of prompts the run attempted
        errors: Per-prompt error messages, in the order they occurred

    Returns:
        "No responses generated: <failed>/<total> prompts failed. First error: <error>",
        or the bare "No responses generated" when no error was recorded.
    """
    first_error = next((" ".join(e.split()) for e in errors if e and e.strip()), None)
    if first_error is None:
        return NO_RESPONSES_MESSAGE
    first_error = redact_secrets(first_error)
    if len(first_error) > MAX_FIRST_ERROR_CHARS:
        first_error = first_error[:MAX_FIRST_ERROR_CHARS] + "…"
    return (
        f"{NO_RESPONSES_MESSAGE}: {len(errors)}/{total_prompts} prompts failed. "
        f"First error: {first_error}"
    )
