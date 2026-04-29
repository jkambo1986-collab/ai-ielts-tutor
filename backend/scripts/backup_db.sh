#!/usr/bin/env bash
# Nightly Postgres backup script.
#
# Usage:
#   ./backup_db.sh                # writes to ./backups/<timestamp>.sql.gz locally
#   BACKUP_S3_BUCKET=foo ./backup_db.sh   # also uploads to s3://foo/<env>/<ts>.sql.gz
#
# Schedule with cron (server-side) or Railway Cron (managed).
# In Railway, set: 0 3 * * *  (3 AM UTC daily)
#
# Requires: pg_dump (postgresql-client), aws cli (only if uploading to S3).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

ENV_NAME="${ENV_NAME:-prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/${ENV_NAME}-${TS}.sql.gz"

echo "Dumping database to ${OUT}..."
pg_dump --no-owner --no-acl "${DATABASE_URL}" | gzip > "${OUT}"
echo "Local dump complete: $(du -h "${OUT}" | cut -f1)"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI not installed; skipping S3 upload" >&2
  else
    KEY="${ENV_NAME}/$(basename "${OUT}")"
    echo "Uploading to s3://${BACKUP_S3_BUCKET}/${KEY}"
    aws s3 cp "${OUT}" "s3://${BACKUP_S3_BUCKET}/${KEY}"
  fi
fi

# Local retention — keep last N days
find "${BACKUP_DIR}" -name "${ENV_NAME}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "Done."
