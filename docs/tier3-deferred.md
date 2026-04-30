# Tier 3 — deferred until business decisions land

These three features are intentionally NOT yet implemented in code. Each
has a hard prerequisite that needs sign-off before any engineering can
responsibly start. This file is the up-to-date checklist so when the
green light comes, the eng work is unambiguous.

Last updated: 2026-04-30

---

## T3#16 — Voice cloning of examiner personas

**Concept.** Premium accent / persona pack where the live speaking
examiner uses a cloned voice of a known IELTS examiner (with consent).
Optional Pro-Plus add-on. Differentiator vs. generic Gemini Live voices.

**Hard prerequisites (BLOCK code work).**

- A signed licensing agreement with at least one named IELTS examiner
  authorising voice cloning + commercial use, with an opt-out clause.
- A vendor pick: ElevenLabs (Voice Lab), Resemble.ai, or Cartesia. Each
  has different licensing terms for cloned voices and different latency
  profiles for streaming.
- Disclosure policy: do students see "synthetic voice of [examiner]" or
  is it transparent? Legal review required.
- Per-cloned-voice cost (subscription tier from vendor + per-minute
  inference) must fit the Pro-Plus margin model.

**Soft prerequisites (engineering can scope but not start).**

- Define the persona schema extension: add `voice_provider` and
  `voice_id` to the existing speaking persona model.
- Sketch the live-session token flow: voice synthesis happens vendor-
  side; we mint short-lived ephemeral creds the FE uses to stream.
- Latency budget: target sub-300 ms first-byte for the synthesised
  reply. Most vendors hit this for English; verify with a vendor demo.

**Estimated engineering scope once unblocked.** ~2 weeks (auth flow,
persona model extension, FE voice picker, monitoring + fallback to the
default Gemini voice when the vendor 5xxs).

---

## T3#17 — SOC 2 Type II + GDPR data-residency

**Concept.** Defensive moat for institutional buyers. Many institutes
running a B2B procurement process won't sign without SOC 2 Type II and a
GDPR-aligned data-residency commitment per region.

**Hard prerequisites (BLOCK certification, NOT code work).**

- Compliance officer (full-time or fractional) hired or designated.
- Auditor engagement signed (typical: A-LIGN, Schellman, or Drata-routed
  auditor). Type II requires a 6+ month observation window — start
  early.
- Budget approved: ~USD 50k-100k for the initial audit + ~25k/yr for
  surveillance.
- Data residency policy decided: do we route EU users' data to a
  separate Postgres region (and run the Django app there too), or do we
  rely on contractual safeguards (SCCs)? Engineering implications
  diverge sharply.

**Engineering work that can start regardless (independent of audit).**

- `apps/audit/` is already append-only and has `AuditLogEntry`. Extend
  it to log: every login, every Pro grant/revoke, every data export.
- Add `DJANGO_DATA_REGION` env var; refuse to start if it doesn't match
  the user's institute setting (safeguard against accidental cross-
  region routing).
- Encrypt `User.email` at rest using `django-cryptography` or similar
  — this is a SOC 2 control most auditors expect.
- Document the access-control model: who has DB shell access in prod,
  break-glass procedures, key rotation cadence. (This document.)
- Quarterly access review automation — a small Django command that
  emails the institute admin a list of currently-active staff users
  with their last-login date.

**Estimated engineering scope of the work that doesn't need the audit:**
~2 weeks. The audit itself is a 6-month timer, separate from
engineering.

---

## T3#18 — Real-time examiner avatar with facial cues

**Concept.** Lip-sync + expression-mirroring avatar during live speaking
sessions. Experimental category-leader play; converts a Gemini-Live
session from "voice in your ear" to "examiner across the table".

**Hard prerequisites (BLOCK code work).**

- Vendor pick: HeyGen Streaming Avatar API, D-ID Real-Time API,
  Synthesia (no real-time at time of writing), or self-hosted
  open-source (Wav2Lip-style, lots of GPU). Each has very different
  cost / latency / quality profiles.
- Bandwidth budget: HeyGen + D-ID stream WebRTC video at ~500 kbps;
  budget the egress against per-session cost.
- Privacy policy update: avatar video is rendered server-side; some
  vendors record clips for QA. We must opt out at the vendor level.
- Quality bar: students will compare to in-person examiners. If the
  uncanny-valley effect dominates, the feature destroys trust rather
  than building it. Demo before commit.

**Soft prerequisites.**

- Decide whether the avatar is per-persona (replaces the current
  Gemini Live audio) or supplementary (audio stays as today, video
  layered on top). The former is cleaner; the latter is incrementally
  shippable.
- A/B testing infrastructure: we'd want to run avatar-on vs avatar-off
  and measure session completion + band-trajectory delta. Hooks into
  the existing analytics overview.

**Estimated engineering scope once unblocked.** ~3 weeks (vendor SDK
integration, FE video pane, bandwidth-aware fallback, A/B harness).

---

## Summary for the next product review

| Item | Blocker | Earliest unblock | Eng scope |
|---|---|---|---|
| T3#16 voice cloning | examiner license + vendor pick + legal review | a few weeks if business prioritises | ~2 weeks |
| T3#17 SOC 2 / GDPR | auditor engagement, compliance officer, budget | 6 months Type II observation | ~2 weeks of code now + audit |
| T3#18 avatar | vendor pick, bandwidth budget, quality demo | weeks | ~3 weeks |

The "engineering work that can start regardless" bullets in T3#17 are
the lowest-effort, highest-defensive work we can do without any
business commitment. Recommend prioritising those independently.
