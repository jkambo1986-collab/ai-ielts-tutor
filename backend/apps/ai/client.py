"""
GeminiClient — single abstraction over AI Studio (dev) and Vertex AI (prod).

Both modes use the same google-genai SDK and produce identical response shapes.
The only meaningful difference is auth + endpoint, controlled by USE_VERTEX_AI.

Why this matters:
  - Dev and prod return JSON in the same shape, so service code doesn't fork.
  - Switching is one env var; no code changes.
  - Vertex calls draw the Vertex credits in the configured GCP project; the
    response carries `traffic_type=ON_DEMAND` to confirm.

Auth:
  - AI Studio: GEMINI_API_KEY (free tier, no GCP credits drawn).
  - Vertex: service-account credentials. Loaded from
    GOOGLE_APPLICATION_CREDENTIALS_JSON (single-line JSON env var, never committed)
    or fall back to Application Default Credentials.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from django.conf import settings
from google import genai
from google.genai import types as genai_types

from apps.ai.exceptions import AIError

log = logging.getLogger(__name__)

# Finish reasons we treat as success
_OK_FINISH_REASONS = {"STOP", "MAX_TOKENS", "FUNCTION_CALLING"}


def _make_credentials_for_vertex():
    """Build google-auth Credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON.

    Returns None to fall back to ADC if no JSON env var is set.
    """
    raw = settings.GOOGLE_APPLICATION_CREDENTIALS_JSON
    if not raw:
        return None
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIError(
            f"GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: {exc}",
            is_fatal=True,
        ) from exc
    from google.oauth2 import service_account
    return service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )


class GeminiClient:
    """Thin wrapper around google-genai with common helpers."""

    def __init__(self):
        self.use_vertex = settings.USE_VERTEX_AI
        self.model = settings.GEMINI_MODEL
        self.live_model = settings.GEMINI_LIVE_MODEL

        if self.use_vertex:
            if not settings.GOOGLE_CLOUD_PROJECT:
                raise AIError(
                    "GOOGLE_CLOUD_PROJECT must be set when USE_VERTEX_AI=True.",
                    is_fatal=True,
                )
            credentials = _make_credentials_for_vertex()
            self._client = genai.Client(
                vertexai=True,
                project=settings.GOOGLE_CLOUD_PROJECT,
                location=settings.GCP_REGION,
                credentials=credentials,
            )
            log.info(
                "GeminiClient initialised in Vertex mode (project=%s, region=%s)",
                settings.GOOGLE_CLOUD_PROJECT,
                settings.GCP_REGION,
            )
        else:
            if not settings.GEMINI_API_KEY:
                raise AIError(
                    "GEMINI_API_KEY must be set when USE_VERTEX_AI=False.",
                    is_fatal=True,
                )
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            log.info("GeminiClient initialised in AI Studio mode")

    # -- Public API -- #

    def generate_json(
        self,
        prompt: str,
        schema: dict,
        *,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> Any:
        """Call Gemini with a response_schema and return the parsed JSON."""
        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
        )
        response = self._call(prompt, config, model=model)
        return self._parse_json_response(response)

    def generate_text(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> str:
        config = genai_types.GenerateContentConfig(temperature=temperature)
        response = self._call(prompt, config, model=model)
        text = self._extract_text(response)
        if not text:
            raise AIError("AI returned an empty response.")
        return text.strip()

    def generate_with_tools(
        self,
        prompt: str,
        function_declarations: list,
        *,
        model: Optional[str] = None,
    ) -> Any:
        """Function-calling mode — returns the raw response (caller extracts function_calls)."""
        config = genai_types.GenerateContentConfig(
            tools=[genai_types.Tool(function_declarations=function_declarations)],
        )
        return self._call(prompt, config, model=model)

    def get_traffic_type(self, response) -> Optional[str]:
        """Inspect a response for trafficType (Vertex marker that credits are being drawn)."""
        try:
            return response.usage_metadata.traffic_type  # type: ignore[attr-defined]
        except AttributeError:
            return None

    # -- Internals -- #

    def _call(self, prompt, config, model: Optional[str] = None):
        try:
            return self._client.models.generate_content(
                model=model or self.model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:
            self._reraise_friendly(exc)

    @staticmethod
    def _extract_text(response) -> str:
        # google-genai puts text on response.text or in candidates[0].content.parts[0].text
        text = getattr(response, "text", None)
        if text:
            return text
        try:
            return response.candidates[0].content.parts[0].text or ""
        except (AttributeError, IndexError, TypeError):
            return ""

    @classmethod
    def _parse_json_response(cls, response) -> Any:
        finish_reason = None
        try:
            finish_reason = str(response.candidates[0].finish_reason)
        except (AttributeError, IndexError, TypeError):
            pass

        # FUNCTION_CALLING is a different code path — caller should use generate_with_tools
        if finish_reason and not any(ok in (finish_reason or "") for ok in _OK_FINISH_REASONS):
            raise AIError(
                f"AI response stopped unexpectedly (finish_reason={finish_reason}).",
            )

        text = cls._extract_text(response)
        if not text:
            raise AIError("AI returned an empty response.")

        # Models occasionally wrap JSON in markdown fences
        text = text.strip()
        if text.startswith("```"):
            text = text.lstrip("`")
            text = text.removeprefix("json").lstrip("\n").rstrip("`").rstrip("\n")

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            log.warning("AI returned non-JSON response: %s", text[:500])
            raise AIError(
                "The AI returned an invalid response format. Please try again."
            ) from exc

    @staticmethod
    def _reraise_friendly(exc: Exception):
        """Map provider exceptions to user-friendly AIError messages."""
        msg = str(exc).lower()
        if "api key not valid" in msg or "permission denied" in msg or "401" in msg:
            raise AIError(
                "AI service configuration error: invalid or missing credentials.",
                is_fatal=True,
            ) from exc
        if "quota" in msg or "resource has been exhausted" in msg or "429" in msg:
            raise AIError(
                "The AI service is at capacity. Please try again in a moment.",
            ) from exc
        if "5" in msg[:3] or "internal" in msg or "server error" in msg:
            raise AIError(
                "The AI service is having trouble. Please try again shortly.",
            ) from exc
        raise AIError(f"AI request failed: {exc}") from exc


# Module-level singleton — Django will instantiate once per process
_client: Optional[GeminiClient] = None


def get_client() -> GeminiClient:
    """Lazy singleton — avoids client construction on import (so tests can patch settings)."""
    global _client
    if _client is None:
        _client = GeminiClient()
    return _client
