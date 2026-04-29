# CLAUDE.md

> Project briefing loaded into every Claude Code session. Keep it short, high-signal,
> and current. When the codebase drifts, **update this file in the same change** —
> don't let it rot.

---

## What this is

**AI IELTS Tutor** — a multi-tenant SaaS that helps students prepare for IELTS via
AI-driven practice (writing, speaking, reading, listening, integrated skills, quiz)
and an institute-admin layer for managing those students. Sold to **institutions**,
not individual users — students never self-pay; institute admins grant Pro access.

## Stack

| Layer | Choice | Where |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | repo root |
| Backend | Django 5.1 + DRF + JWT (simplejwt) | `backend/` |
| DB | Postgres 18 (local: password `CHANGE_ME`, db `ielts_dev`) | env: `DATABASE_URL` |
| AI | Google Gemini 2.5 Flash; AI Studio in dev, Vertex AI in prod | `backend/apps/ai/` |
| Realtime audio | Gemini Live API — FE connects directly with backend-minted creds | `components/SpeakingTutor.tsx` |
| Errors | Sentry (FE + BE) — only enabled when DSN set | `index.tsx`, `config/settings/base.py` |
| Logs | JSON in prod (`python-json-logger`) + `X-Request-ID` middleware | `apps/common/middleware.py` |
| Deploy | Backend → Railway, Frontend → Vercel | `backend/Procfile`, `vercel.json` |

## Architecture decisions (and why)

- **Multi-tenant: shared DB + `institute_id` FK on every tenant-scoped row.** Simpler ops than schema-per-tenant; tenant resolved by `TenantMiddleware` from `X-Institute-Slug` header (dev) or subdomain (prod).
- **Custom `User` model in `apps.accounts`** — set `AUTH_USER_MODEL = "accounts.User"` on day 1; swapping later is painful.
- **Email is the username field** (`USERNAME_FIELD = "email"`). `username` column still exists (AbstractUser requirement) and is mirrored from email in `User.save()`.
- **Soft delete via `deleted_at`** on User + every session model. Viewsets filter `deleted_at__isnull=True` by default; admin surfaces full data.
- **API is versioned at `/api/v1/`.** No alias to `/api/`. FE points at `VITE_API_BASE_URL`.
- **Pro features gated server-side** via `apps.billing.features.requires_feature(...)` decorator. Free users get 402. FE also hides UI as a courtesy but is **not** the security boundary.
- **Self-serve upgrade is intentionally absent.** Pro is granted by institute admins via `/billing/grant-pro` and `/billing/bulk-grant-pro`. Don't reintroduce a "upgrade" button on the FE.
- **Gemini provider abstraction**: one `GeminiClient` (`apps.ai.client`) toggles between AI Studio and Vertex by `USE_VERTEX_AI` env var. Both modes return identical JSON shapes.
- **Live API tokens are minted by backend** (`mint_live_session_token`) — FE never reads from `process.env.API_KEY` anymore. In Vertex mode this still raises (TODO: ephemeral token flow).
- **Audit log is append-only.** Use `apps.audit.services.record(...)` for every Pro grant/revoke, login, signup, password reset, invite. Never delete rows.
- **Per-plan throttles** in `apps.common.throttles` — Free 60/hour gen + 20/hour analyze; Pro 5x.
- **Pagination is on by default** (DRF `PageNumberPagination`, page_size 20). Session list endpoints support `?days=N&search=...&page=...`.
- **Decimal precision** on `band_score` and `target_score` (max_digits=3, decimal_places=1). DRF returns numbers (not strings) because `COERCE_DECIMAL_TO_STRING=False`.

## Repo layout

```
.                                 # FE (Vite root)
├── App.tsx, index.tsx
├── components/                   # React components (Tutor, Dashboard, Admin, etc.)
│   ├── dashboard/                # Cards, charts, ConfidenceModal
│   └── ...
├── services/                     # apiClient, authService, geminiService, historyService, dashboardService, adminService, contentService
├── types.ts                      # Shared TS types — keep aligned with backend serializers
├── constants.ts                  # Hardcoded fallback prompts (used when /content/prompts is empty)
├── vite.config.ts, vite-env.d.ts
└── backend/
    ├── apps/
    │   ├── accounts/             # User, JWT auth, signup/login/me, invitations, password reset, email verify
    │   ├── tenants/              # Institute, InstituteSettings, TenantMiddleware, TenantManager
    │   ├── practice/             # Writing/Speaking/Reading/Listening/Quiz sessions, dashboard analytics, vocabulary, error cards (SRS), mock tests, calibration, share links, alerts
    │   ├── ai/                   # GeminiClient + service.py (Python ports of the 20 TS Gemini calls)
    │   ├── billing/              # Subscription, feature gates, grant/revoke Pro
    │   ├── content/              # Per-institute prompt library
    │   ├── adminpanel/           # /admin/sitemap, users list, usage stats, audit log, invite mgmt
    │   ├── audit/                # AuditLogEntry (append-only)
    │   ├── health/               # /healthz (liveness) + /readyz (DB + cached Gemini)
    │   └── common/               # Throttles, middleware, soft-delete mixin
    ├── config/
    │   ├── settings/{base,dev,prod}.py
    │   ├── urls.py               # /api/v1/ root
    │   └── exceptions.py         # AIError → 502/503 mapping
    ├── manage.py, requirements.txt, Procfile, railway.toml
    └── scripts/backup_db.sh
```

## Run locally

Two terminals:

```bash
# Backend (one-time setup, then `runserver`)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                        # fill GEMINI_API_KEY at minimum
createdb -U postgres ielts_dev              # one-time
python manage.py migrate
python manage.py seed_institutes            # creates `default` + `demo` institutes
python manage.py seed_prompts               # 40 prompts per institute
python manage.py runserver 8000

# Frontend
npm install
npm run dev                                 # serves on :3000
```

**Default credentials**: `admin@default.local` / `CHANGE_ME!Dev`, `admin@demo.local` / `CHANGE_ME!Dev`. Both are institute admins. Students sign up at `/signup` (institute resolved from `X-Institute-Slug` header in dev).

## Tests

```bash
cd backend && source .venv/bin/activate && pytest      # backend unit/integration
npx tsc --noEmit                                       # FE type-check
python manage.py test_gemini                           # smoke-test the AI provider
```

Backend test layout: `apps/<app>/tests/test_*.py`. Pytest config in `backend/pytest.ini`. Currently only `apps/accounts/tests/test_auth_flow.py` exists (9 tests, all passing). Dashboard/calibration/cohort/share-link endpoints lack test coverage — add as you touch them.

## Code style + conventions

- **Python**: snake_case, type hints encouraged but not enforced. Module docstrings are short and explain *why* (not *what*).
- **TypeScript**: strict mode (`tsconfig.json`). Pre-existing `ErrorBoundary.tsx` declares `props` explicitly to satisfy React 19 typing — keep this pattern when extending Component.
- **Migrations**: never edit applied migrations. `python manage.py makemigrations` in dev, commit the file. Migration history is canonical.
- **Tenant scoping**: any new model holding user data must FK to both `User` and `Institute`. Use `TenantManager` (`apps.tenants.managers`). Viewsets must extend `TenantScopedViewSet` from `apps.practice.views._base`.
- **Audit trail**: any state change worth investigating later (Pro grant/revoke, role change, prompt edit, invite send/accept/revoke) calls `apps.audit.services.record(...)`. The action vocabulary is in `apps.audit.models.AuditLogEntry.ACTION_*`.
- **Feature gates**: don't hardcode `if user.is_pro` in views. Use `@requires_feature(features.FEATURE_X)` from `apps.billing.features`. Add new feature names to `PLAN_FEATURES` map there.
- **Pricing/upgrade UI**: do not add. The platform is institutionally licensed.
- **Sitemap**: `backend/apps/adminpanel/sitemap.py` is a static structure. When you add a new endpoint or page, add it to the sitemap so admins see it in the Admin panel.

## Off-limits / careful zones

- `backend/apps/accounts/models.py` — `User` model. Field changes require migrations *and* affect every dashboard view. Coordinate before touching.
- `backend/apps/practice/migrations/` — never edit applied migrations.
- `backend/apps/audit/` — append-only. Don't add update or delete endpoints.
- `backend/apps/ai/schemas.py` — Gemini JSON schemas mirror frontend types in `types.ts`. Changing one without the other will cause runtime parse failures.
- Self-serve upgrade flow — do not reintroduce. See architectural decision above.
- `services/constants.ts` — fallback only, served when `/content/prompts` returns empty. Don't add new content here; add to the DB.
- Live API in Vertex mode — `mint_live_session_token` raises on purpose. Wire ephemeral tokens before flipping `USE_VERTEX_AI=true` for a Speaking session.

## Patterns to use

- **New API endpoint**: define in `apps/<app>/views.py` (or a sub-module under `views/`); register URL in `apps/<app>/urls.py`; ensure it appears in `apps/adminpanel/sitemap.py`.
- **New tenant-scoped model**: inherit `PracticeSessionBase` (gives id, institute, user, created_at, deleted_at, indexes). For non-session models, manually add `institute` FK + `deleted_at`.
- **AI calls**: every new Gemini function lives in `apps/ai/service.py`, takes its JSON schema from `apps/ai/schemas.py`, and is invoked from a view via `from apps.ai import service as ai_service; ai_service.foo(...)`.
- **Long Gemini calls** (study plan, comprehensive analysis): currently inline. Move to Celery + Redis when latency complaints start (deliberately not done yet).
- **Errors that should reach the user**: throw `AIError` (gets mapped to 502/503 by `config/exceptions.py`). The FE `apiClient` exposes `isAiError`/`isAiFatal` flags.

## Patterns to avoid

- Hardcoding institute or user IDs in tests — use the `institute_default` / `institute_demo` fixtures in `apps/accounts/tests/test_auth_flow.py`.
- Calling Gemini directly from a view — always go through `apps.ai.service`.
- Using `User.objects.filter(...)` without `deleted_at__isnull=True` for student-facing data. Admin views may bypass.
- Returning bare arrays from list endpoints — use DRF pagination or wrap in `{"results": [...]}`.
- Adding `print(...)` for debugging — use `log = logging.getLogger(__name__)` and `log.info/warning/exception`.
- Storing secrets in `.env.example` or committing real `.env` files (both are in `.gitignore`).

## Known issues / constraints

- **Vertex Live API not wired** — `mint_live_session_token` raises in Vertex mode. See `apps/ai/service.py`.
- **Stripe not wired** — billing is institute-managed, but if direct billing is added later, integrate into `apps/billing/` (skeleton already there).
- **Celery not wired** — long Gemini calls block the request thread. Acceptable until users complain.
- **No test coverage** for the new dashboard / calibration / cohort / share-link / error-card endpoints. Add tests when modifying these areas.
- Pre-existing FE TS bugs all fixed; tsc currently green.
- **Two unused fields**: `IELTSSection.Profile` enum exists but no Profile component is wired into the tab routing yet.

## Memory refresh policy

This project changes fast. The persistent memory at `~/.claude/projects/...gravityantimacos.../memory/` mirrors the most stable codebase facts. **Refresh those entries roughly every 10th assistant turn** (or sooner if a major area changes — e.g. new app added, model shape changed, new conventions adopted). The setup uses an `output-style` hook in `.claude/settings.local.json` that nudges this.

## Contact + ops

- Local Postgres: `psql -U postgres -h localhost -d ielts_dev` (password `CHANGE_ME`)
- Vertex project (prod): `your-gcp-project-id`, region `us-central1`
- Backup script: `backend/scripts/backup_db.sh` — wire to Railway Cron at deploy time
- Health: `GET /api/v1/healthz` (liveness) and `GET /api/v1/readyz?gemini=1` (readiness incl. AI)
