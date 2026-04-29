# AI IELTS Tutor — Multi-Tenant Platform

Production-ready IELTS practice platform.

- **Frontend**: React 19 + Vite + TypeScript (deploys to Vercel)
- **Backend**: Django 5 + DRF + Postgres (deploys to Railway)
- **AI**: Google Gemini 2.5 Flash. AI Studio in dev, Vertex AI in prod.
- **Multi-tenant**: Shared DB with `institute_id` on every row, slug-based tenant resolution.

## Repo layout

```
.                       # Frontend (Vite root)
├── App.tsx
├── components/
├── services/           # apiClient, authService, geminiService — all hit the backend
├── types.ts
├── vite.config.ts
└── backend/            # Django backend
    ├── apps/
    │   ├── tenants/    # Institute model + middleware
    │   ├── accounts/   # Custom User + JWT auth
    │   ├── practice/   # Writing/Speaking/Reading/Listening sessions + AI endpoints
    │   ├── ai/         # Gemini provider abstraction (AI Studio + Vertex)
    │   ├── billing/    # Subscriptions + feature gates
    │   └── content/    # (future: prompt library)
    ├── config/         # settings.{base,dev,prod}, urls, exceptions
    ├── manage.py
    └── requirements.txt
```

## Run locally

### One-time setup

1. **Backend**
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env  # then fill in values (GEMINI_API_KEY at minimum)
   createdb -U postgres ielts_dev
   python manage.py migrate
   python manage.py seed_institutes
   python manage.py createsuperuser  # optional, for /admin
   ```

2. **Frontend**
   ```bash
   npm install
   # .env at repo root already has VITE_API_BASE_URL pointing at localhost:8000
   ```

### Each session

Two terminals:

```bash
# Backend
cd backend && source .venv/bin/activate && python manage.py runserver 8000

# Frontend
npm run dev
```

Open <http://localhost:3000>. Default tenant is `default`. Two seeded admin users:
- `admin@default.local` / `CHANGE_ME_DEV`
- `admin@demo.local` / `CHANGE_ME_DEV`

### Verify Gemini provider works

```bash
cd backend && source .venv/bin/activate
python manage.py test_gemini
```

In dev this hits AI Studio. In prod (`USE_VERTEX_AI=True`) it hits Vertex and prints `traffic_type=ON_DEMAND` if billing is correctly wired.

### Run tests

```bash
cd backend && source .venv/bin/activate
pytest
```

## Multi-tenancy

Every tenant-scoped row has an `institute_id`. The current institute is resolved per-request by `apps.tenants.middleware.TenantMiddleware`:

- **Dev**: `X-Institute-Slug` header (the FE sends this from `VITE_DEFAULT_INSTITUTE_SLUG`)
- **Prod**: subdomain (e.g. `acme.aiielts.app` → slug=`acme`); falls back to header if no subdomain

Add a new institute:

```bash
python manage.py shell
>>> from apps.tenants.models import Institute, InstituteSettings
>>> i = Institute.objects.create(name="Acme School", slug="acme", plan_tier="pro")
>>> InstituteSettings.objects.create(institute=i)
```

Then DNS the subdomain to your Vercel app.

## AI provider switching (Vertex)

Set these env vars on Railway to switch dev → prod billing through Vertex:

```
USE_VERTEX_AI=True
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GCP_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}  # single line
```

`GOOGLE_APPLICATION_CREDENTIALS_JSON` should be the entire service-account JSON, escaped to one line. Never commit it.

The same `GeminiClient` class transparently handles both modes — the only difference is auth + endpoint, and JSON response shapes are identical.

## Deployment

### Backend on Railway

1. Create a Railway project, add the **Postgres** plugin (auto-sets `DATABASE_URL`).
2. New service from your GitHub repo, **Root Directory = `backend`**.
3. Set env vars (the bare minimum to boot):
   - `DJANGO_SETTINGS_MODULE=config.settings.prod`
   - `DJANGO_SECRET_KEY=<long random string>` (use `python -c "import secrets;print(secrets.token_urlsafe(64))"`)
   - `DJANGO_ALLOWED_HOSTS=api.aiielts.app,*.railway.app`
   - `CORS_ALLOWED_ORIGINS=https://aiielts.app,https://*.aiielts.app`
   - `USE_VERTEX_AI=True`
   - `GOOGLE_CLOUD_PROJECT=your-gcp-project-id`
   - `GCP_REGION=us-central1`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON=<paste single-line JSON>`
4. `railway.toml` already configures the start command + healthcheck.
5. After first deploy, run the seeds via `railway run python manage.py seed_institutes`.

### Frontend on Vercel

1. Connect repo, **Root Directory = `/`** (project root).
2. Vercel auto-detects Vite. No build settings to change.
3. Env vars:
   - `VITE_API_BASE_URL=https://api.aiielts.app/api`
   - `VITE_DEFAULT_INSTITUTE_SLUG=default`  # only used in dev
4. Add custom domain `aiielts.app` and **wildcard subdomain `*.aiielts.app`** for multi-tenant routing.
5. Add `api.aiielts.app` as a CNAME pointing at the Railway service.

## Where things live

- **API endpoints**: `backend/config/urls.py` is the entry point; each app exposes its routes under `/api/<resource>/`. Browse the live OpenAPI schema at `/api/schema/swagger/`.
- **Gemini prompts/schemas**: `backend/apps/ai/{schemas.py,service.py}` — Python ports of the original `services/geminiService.ts`.
- **Feature gates (Pro/Free)**: `backend/apps/billing/features.py` lists the catalog and the `requires_feature` decorator. Apply it on view methods.
- **Adaptive learning logic**: `backend/apps/practice/services/adaptive.py`.
- **Tenant middleware + scoping**: `backend/apps/tenants/`.

## Common tasks

| Task | Command |
| --- | --- |
| Make migrations | `python manage.py makemigrations` |
| Apply migrations | `python manage.py migrate` |
| Add a new institute | `python manage.py shell` (see above) |
| Reset local DB | `dropdb ielts_dev && createdb ielts_dev && python manage.py migrate && python manage.py seed_institutes` |
| Run tests | `pytest` |
| Smoke-test Gemini | `python manage.py test_gemini` |
| Open Django admin | `http://localhost:8000/admin` |
| Browse API docs | `http://localhost:8000/api/schema/swagger/` |

## Phase 9+ TODOs (not in initial migration)

- [ ] Real Stripe billing integration (`/api/billing/upgrade` is currently a stub that just sets `plan=pro`).
- [ ] SendGrid/SES password-reset emails (currently logs the link).
- [ ] Email verification on signup.
- [ ] Sentry on FE + BE.
- [ ] Celery + Redis for long-running Gemini calls and background analysis.
- [ ] S3/GCS for Speaking session audio storage (currently audio is ephemeral).
- [ ] Swap to short-lived ephemeral tokens for Vertex Live API.
