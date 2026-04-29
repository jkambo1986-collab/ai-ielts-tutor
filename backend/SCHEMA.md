# Database Schema

This document describes the production schema for the AI IELTS Tutor backend.
It is the human-readable companion to `apps/*/models.py`.

## Conventions

- **PostgreSQL** is the target database (JSONB, indexes, constraints).
- **UUID** primary keys on all user-visible records.
- **Tenant scoping**: every tenant-owned row carries `institute_id`. Reads are
  filtered by the active institute via `TenantManager` / `TenantMiddleware`.
- **JSONB** is used for nested AI feedback objects (transcripts, analyses,
  feedback rubrics, study plans). Flattening into normalized tables would not
  pay off until SQL-level analytics over feedback content is needed.
- **Decimal** is used for IELTS band scores (0.5 increments, no float drift).

## Apps

| App | Purpose |
|---|---|
| `tenants` | Institutes (multi-tenant root) and per-institute settings. |
| `accounts` | Custom `User` model (email login, role, plan, target score). |
| `billing` | `Subscription` records (Stripe-ready). |
| `practice` | All practice session tables + caches + quiz bank. |
| `ai` | No DB models — wraps Gemini calls. |
| `content` | Reserved for future curated content endpoints. |
| `adminpanel` | Admin views; no DB models of its own. |

## Tables

### `tenants_institute`
The root of multi-tenancy. Every other tenant-scoped row FKs here.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | varchar(200) | Display name |
| `slug` | slug, unique | Used in `X-Institute-Slug` header / subdomain |
| `plan_tier` | enum | free / starter / pro / enterprise |
| `max_users` | int | Seat cap |
| `billing_email` | email | |
| `is_active` | bool | Soft-disable switch |
| `created_at`, `updated_at` | datetime | |

### `tenants_institutesettings`
1:1 with institute — feature flags, branding, defaults.

### `accounts_user` (Custom User)
Extends Django's `AbstractUser`. Primary auth identifier is `email`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | email, unique, indexed | Login identifier |
| `username` | varchar | Mirrors email — kept only because AbstractUser requires it |
| `password` | varchar | Django hash |
| `name` | varchar(200) | |
| `institute_id` | FK → tenants_institute | Null only for super_admins |
| `role` | enum | super_admin / institute_admin / instructor / student |
| `target_score` | decimal(3,1) | IELTS target band, e.g. 7.5 |
| `adaptive_learning_enabled` | bool | |
| `subscription_plan` | enum | free / pro (denormalized cache of latest active Subscription) |
| `subscription_end_date` | datetime | Null if free |
| `created_at` | datetime | |

> **Note on plan duplication**: `User.subscription_plan` is a fast-read cache.
> The source of truth is `billing_subscription`. The two are kept in sync by
> the billing layer (and Stripe webhooks in Phase 9).

CHECK constraint: every non-super-admin must have an institute.

### `billing_subscription`
Historical record of plan changes. Stripe IDs are filled by webhook (Phase 9).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | FK → accounts_user | |
| `institute_id` | FK → tenants_institute | |
| `plan` | enum | free / pro |
| `status` | enum | active / canceled / expired |
| `current_period_start` | datetime | |
| `current_period_end` | datetime | |
| `canceled_at` | datetime | nullable |
| `stripe_customer_id` | varchar | Phase 9 |
| `stripe_subscription_id` | varchar | Phase 9 |

Indexed on `(user_id, status)`.

### Practice session tables

All practice session tables share the abstract `PracticeSessionBase`:
- `id` UUID PK
- `institute_id` FK → tenants_institute (indexed)
- `user_id` FK → accounts_user (indexed)
- `created_at` datetime
- Composite indexes on `(user, -created_at)` and `(institute, -created_at)`
  to keep history queries fast.

#### `practice_writing_session`
| Column | Type | Notes |
|---|---|---|
| `prompt` | text | The IELTS task prompt the user responded to |
| `essay` | text | The user's submitted essay |
| `band_score` | decimal(3,1) | Overall band |
| `feedback` | jsonb | Full `WritingFeedback` (criteria, suggestions, vocab enhancements) |

#### `practice_speaking_session`
| Column | Type | Notes |
|---|---|---|
| `duration_seconds` | int | |
| `topic` | varchar(500) | Optional summary |
| `mode` | enum | Standard / RolePlay |
| `prompt` | jsonb | `{ part, text }` if structured |
| `transcript` | jsonb | Array of `Turn` objects |
| `analysis` | jsonb | `SpeakingAnalysis` (set after analysis runs) |

#### `practice_reading_session`
| Column | Type | Notes |
|---|---|---|
| `score` | int | |
| `total_questions` | int | |
| `passage_title` | varchar(300) | |
| `passage_content` | text | Original passage text — kept for replay/review |

#### `practice_listening_session`
| Column | Type | Notes |
|---|---|---|
| `score` | int | |
| `total_questions` | int | |
| `title` | varchar(300) | |
| `transcript` | text | Audio script — kept for replay/review |

#### `practice_quiz_session`
| Column | Type | Notes |
|---|---|---|
| `category` | enum | Reading / Listening / Grammar / Vocabulary |
| `difficulty` | enum | Easy / Medium / Hard |
| `score` | int | |
| `total_questions` | int | |
| `title` | varchar(300) | |
| `questions_snapshot` | jsonb | Frozen Q&A as shown to the user |

### Caches & plans

#### `practice_weakness_cache`
TTL ~7 days, regenerated on demand.
Unique constraint: `(user, skill)` — only one active analysis per skill per user.
| Column | Type | Notes |
|---|---|---|
| `skill` | enum | writing / speaking |
| `analysis` | jsonb | Cached `WeaknessAnalysis` |
| `expires_at` | datetime | |

#### `practice_study_plan`
| Column | Type | Notes |
|---|---|---|
| `plan` | jsonb | Array of `DailyGoal` |
| `is_active` | bool, indexed | Latest active plan flag |

### `practice_quiz_question`
Optional curated / cached question bank. Not tenant-scoped by default — set
`institute_id` to make a question private to one institute.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `institute_id` | FK → tenants_institute, nullable | Null = global |
| `category` | enum | Reading / Listening / Grammar / Vocabulary |
| `difficulty` | enum | Easy / Medium / Hard |
| `question_text` | text | |
| `options` | jsonb | Array of strings |
| `correct_answer` | varchar(10) | Letter, e.g. "A" |
| `explanation` | text | |
| `created_at` | datetime | |

Indexed on `(category, difficulty)` for fast filtered lookups.

## Relationship diagram (text)

```
tenants_institute ─┬─ accounts_user ─┬─ billing_subscription
                   │                 ├─ practice_writing_session
                   │                 ├─ practice_speaking_session
                   │                 ├─ practice_reading_session
                   │                 ├─ practice_listening_session
                   │                 ├─ practice_quiz_session
                   │                 ├─ practice_weakness_cache
                   │                 └─ practice_study_plan
                   ├─ tenants_institutesettings (1:1)
                   └─ practice_quiz_question (optional, nullable institute)
```

## Phase 9 (Stripe) checklist

When wiring real billing:
1. Stripe webhook handler updates `billing_subscription` (period end, status,
   `stripe_*` IDs).
2. After every successful webhook, mirror `plan` and `current_period_end`
   onto `accounts_user.subscription_plan` and `subscription_end_date`.
3. Drop the manual `upgradeUserPlan` / `downgrade_if_expired` paths once
   the webhook is the source of truth.
