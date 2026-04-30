# Repo-root Dockerfile for Railway.
#
# The Railway "backend" service builds from the repo root (it has
# a `package.json` here and railpack auto-detects Node, which would
# build the React FE — that's not what we want; the FE deploys to
# Vercel separately). This Dockerfile overrides the auto-detector
# and explicitly builds the Django app from `backend/`.
#
# Vercel ignores this file (it uses vercel.json + Vite), so co-locating
# both deploys in this repo is fine.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# psycopg[binary] needs libpq at runtime; the slim base doesn't ship it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so Docker caches them across code changes.
COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the Django app.
COPY backend/ .

# Bake static files in at build time so the runtime startCommand only
# does migrate + gunicorn.
RUN python manage.py collectstatic --noinput || true

EXPOSE 8080

# Same start command as backend/railway.toml. Railway sets $PORT.
CMD sh -c "python manage.py migrate --noinput && gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8080} --workers 3 --timeout 120 --log-file -"
