"""VerifyWise SDK exceptions."""


class VerifyWiseError(Exception):
    """Base exception for all SDK errors."""

    def __init__(self, message: str, status_code: int = 0, response_body: str = ""):
        self.status_code = status_code
        self.response_body = response_body
        super().__init__(message)


class AuthenticationError(VerifyWiseError):
    """Raised on 401/403/406 responses."""


class NotFoundError(VerifyWiseError):
    """Raised on 404 responses."""


class ValidationError(VerifyWiseError):
    """Raised on 400/422 responses."""


class ServerError(VerifyWiseError):
    """Raised on 5xx responses."""


class TimeoutError(VerifyWiseError):
    """Raised when polling exceeds the configured timeout."""
