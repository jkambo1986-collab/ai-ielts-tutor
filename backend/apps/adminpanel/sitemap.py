"""
Sitemap definition — the structural map of every section/route in the platform.

Kept as a Python data structure (not a model) because it changes only when
the codebase changes, not at runtime. The sitemap endpoint enriches each node
with live counts pulled from the DB so admins can see usage at a glance.

Each node has:
  - id: stable identifier (used for analytics/search)
  - title: display name
  - path: FE route (relative — admin renders these)
  - description: 1-line explanation
  - skill: optional grouping for student modalities
  - admin_only: hidden from non-admins (defaults False)
  - children: nested sections
  - api_endpoints: backend endpoints that power this section (for admin reference)
"""

from typing import TypedDict


class SitemapNode(TypedDict, total=False):
    id: str
    title: str
    path: str
    description: str
    skill: str
    admin_only: bool
    children: list
    api_endpoints: list[str]


SITEMAP: list[SitemapNode] = [
    {
        "id": "auth",
        "title": "Authentication",
        "path": "/auth",
        "description": "Public sign-up, login, and password reset surfaces.",
        "children": [
            {"id": "auth.signup", "title": "Sign up", "path": "/signup",
             "description": "Public student sign-up; scoped to the requesting institute.",
             "api_endpoints": ["POST /api/auth/signup"]},
            {"id": "auth.login", "title": "Log in", "path": "/login",
             "description": "Email + password JWT login.",
             "api_endpoints": ["POST /api/auth/login"]},
            {"id": "auth.reset", "title": "Forgot password", "path": "/forgot-password",
             "description": "Triggers a reset email (stubbed; logs to server console).",
             "api_endpoints": ["POST /api/auth/password-reset-request",
                               "POST /api/auth/password-reset-confirm"]},
        ],
    },
    {
        "id": "student",
        "title": "Student Tutor",
        "path": "/",
        "description": "Authenticated practice surface for students.",
        "children": [
            {"id": "student.dashboard", "title": "Dashboard", "path": "/?tab=Dashboard",
             "description": "Performance overview, weakness analysis, study plans.",
             "api_endpoints": ["GET /api/analytics/overview",
                               "POST /api/analytics/weakness-analysis",
                               "POST /api/analytics/comprehensive-analysis",
                               "POST /api/analytics/study-plan"]},
            {"id": "student.writing", "title": "Writing Tutor", "path": "/?tab=Writing",
             "skill": "writing",
             "description": "Task 2 essay practice with band-score feedback + cohesion mapper (Pro).",
             "api_endpoints": ["POST /api/writing/evaluate",
                               "POST /api/writing/essay-plan",
                               "POST /api/writing/cohesion-analysis",
                               "GET /api/writing/sessions/",
                               "GET /api/writing/contextual-prompts"]},
            {"id": "student.speaking", "title": "Speaking Tutor", "path": "/?tab=Speaking",
             "skill": "speaking",
             "description": "Real-time AI conversation via Gemini Live; standard + role-play (Pro).",
             "api_endpoints": ["POST /api/speaking/start-session",
                               "POST /api/speaking/end-session",
                               "POST /api/speaking/analyze-transcript",
                               "GET /api/speaking/sessions/",
                               "POST /api/speaking/pronunciation-practice"]},
            {"id": "student.reading", "title": "Reading Tutor", "path": "/?tab=Reading",
             "skill": "reading",
             "description": "MCQ comprehension with distractor analysis.",
             "api_endpoints": ["POST /api/reading/test",
                               "POST /api/reading/evaluate-answer",
                               "POST /api/reading/submit-session",
                               "GET /api/reading/sessions/"]},
            {"id": "student.listening", "title": "Listening Tutor", "path": "/?tab=Listening",
             "skill": "listening",
             "description": "Synthesised audio + MCQ comprehension with distractor analysis.",
             "api_endpoints": ["POST /api/listening/test",
                               "POST /api/listening/evaluate-answer",
                               "POST /api/listening/submit-session",
                               "GET /api/listening/sessions/"]},
            {"id": "student.integrated", "title": "Integrated Skills Lab", "path": "/?tab=Integrated+Skills",
             "description": "Pro-only multi-skill synthesis tasks.",
             "api_endpoints": ["POST /api/integrated-skills/task",
                               "POST /api/integrated-skills/evaluate-summary",
                               "POST /api/integrated-skills/evaluate-synthesis"]},
            {"id": "student.quiz", "title": "Quiz", "path": "/?tab=Quiz",
             "description": "Adaptive vocabulary + grammar quizzes (Easy/Medium/Hard).",
             "api_endpoints": ["POST /api/quiz/generate",
                               "POST /api/quiz/rephrase-explanation"]},
        ],
    },
    {
        "id": "admin",
        "title": "Institute Admin",
        "path": "/admin",
        "description": "Institute-scoped administrator surface — user management, usage, content.",
        "admin_only": True,
        "children": [
            {"id": "admin.overview", "title": "Overview", "path": "/admin",
             "admin_only": True,
             "description": "Institute usage at a glance: users, sessions, Pro seats.",
             "api_endpoints": ["GET /api/admin/sitemap",
                               "GET /api/admin/usage-stats"]},
            {"id": "admin.users", "title": "Users", "path": "/admin/users",
             "admin_only": True,
             "description": "List, search, invite, grant/revoke Pro for institute users.",
             "api_endpoints": ["GET /api/admin/users",
                               "POST /api/billing/grant-pro",
                               "POST /api/billing/revoke-pro"]},
            {"id": "admin.content", "title": "Prompt Library", "path": "/admin/content",
             "admin_only": True,
             "description": "Custom writing/speaking prompts for the institute (planned).",
             "api_endpoints": ["GET /api/admin/content/prompts (planned)"]},
            {"id": "admin.billing", "title": "Subscription", "path": "/admin/billing",
             "admin_only": True,
             "description": "Institute plan tier, billing contact, seat counts.",
             "api_endpoints": ["GET /api/billing/current"]},
        ],
    },
    {
        "id": "platform",
        "title": "Platform",
        "path": "/",
        "description": "Cross-cutting platform surfaces.",
        "children": [
            {"id": "platform.healthz", "title": "Health check", "path": "/api/healthz",
             "description": "Liveness + dependency check.",
             "api_endpoints": ["GET /api/healthz"]},
            {"id": "platform.openapi", "title": "API docs (Swagger)", "path": "/api/schema/swagger/",
             "admin_only": True,
             "description": "OpenAPI 3 schema + interactive docs.",
             "api_endpoints": ["GET /api/schema/", "GET /api/schema/swagger/"]},
            {"id": "platform.django_admin", "title": "Django Admin", "path": "/admin/",
             "admin_only": True,
             "description": "Low-level Django admin (super_admin only).",
             "api_endpoints": []},
        ],
    },
]


def filter_for_user(user, nodes: list[SitemapNode] | None = None) -> list[SitemapNode]:
    """Returns the sitemap with admin-only nodes hidden for non-admin users.

    super_admin sees everything; institute_admin sees admin-only nodes scoped
    to their institute; students see only the public/student parts.
    """
    if nodes is None:
        nodes = SITEMAP

    is_admin = user.role in {"institute_admin", "super_admin"}
    out: list[SitemapNode] = []
    for node in nodes:
        if node.get("admin_only") and not is_admin:
            continue
        copy: SitemapNode = {**node}
        if "children" in node:
            copy["children"] = filter_for_user(user, node["children"])
        out.append(copy)
    return out
