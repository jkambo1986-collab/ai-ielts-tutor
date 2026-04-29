#!/usr/bin/env bash
# Stop hook: increments a per-project counter and emits a reminder every 10th
# assistant turn so Claude refreshes the codebase-memory entries.
#
# We keep the counter outside the repo (in ~/.claude) so it doesn't get
# committed and doesn't affect git status.
#
# Output on stdout reaches Claude as if the user had said it (with the
# system-reminder framing the hook system provides).

set -euo pipefail

STATE_DIR="${HOME}/.claude/state/ai-ielts-tutor"
mkdir -p "${STATE_DIR}"
COUNTER_FILE="${STATE_DIR}/turn_counter"

if [ -f "${COUNTER_FILE}" ]; then
  count="$(cat "${COUNTER_FILE}")"
else
  count=0
fi

count=$((count + 1))
echo "${count}" > "${COUNTER_FILE}"

# Every 10th turn, emit a refresh reminder.
if [ $((count % 10)) -eq 0 ]; then
  cat <<EOF
[memory-refresh] You've completed ${count} turns in this project.
Per the project's refresh policy, re-verify and update memory entries that may
have drifted: stack.md, repo_layout.md, multitenancy.md, user_auth.md, off_limits.md.
Quick checks:
  - git log --oneline -20  (or just review recent files)
  - ls backend/apps/        (any new apps?)
  - grep -E "^class " backend/apps/practice/models.py | wc -l   (model count drift)
If anything material changed, update both the memory file AND CLAUDE.md.
EOF
fi
