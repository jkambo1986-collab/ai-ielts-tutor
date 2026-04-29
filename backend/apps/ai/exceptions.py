"""AI-specific exceptions, mirroring services/geminiService.ts AIError class."""


class AIError(Exception):
    """Raised when the AI provider returns an error or unparseable response."""

    def __init__(self, message: str, is_fatal: bool = False):
        super().__init__(message)
        self.is_fatal = is_fatal
