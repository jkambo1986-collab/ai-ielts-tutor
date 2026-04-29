"""Development settings — local Postgres, AI Studio, debug on."""

from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# In dev, never reach Vertex — use AI Studio API key
USE_VERTEX_AI = False
