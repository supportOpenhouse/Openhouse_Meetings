# Sales RM + Design Refresh — Roadmap

_Last updated: 2026-06-17_

## Decisions (locked)

1. **Architecture** — Sales RM is the "Field Connect Pro" CP-visit tracker, built **into the existing Next.js + Neon app** as a new `sales_rm` role. Own `/sales/*` routes, own `/api/sales/*` endpoints, **own tables** (clean data separation). Reuse the **libraries** (recorder, ElevenLabs, Claude, Blob) — not the existing `meetings` table/routes. The `Remix of Field Connect Pro` Supabase folder is **design + spec reference only** (not run).
2. **Field scope (v1)** — Lean core: CP registry + visit logging + follow-ups + sales dashboard. **Deferred** to a later phase: live GPS map of all reps, clock in/out sessions, continuous location breadcrumbs. (Single GPS point per visit comes free from the recorder; selfie-with-CP is a small fast-follow.)
3. **Audio in sales** — Every sales visit **records audio + AI summary** on top of the manual visit form. A visit = CP check-in → record → form (engagement / discussion / outcome / follow-up) → AI summary.
4. **Design rollout** — Sales RM ships in the new teal/amber design **first**; existing Demand + Direct RM recording screens get refreshed **after**.

## Design system (from Field Connect Pro)

- **Primary:** deep teal `hsl(187 65% 28%)` · **Accent:** warm amber `hsl(38 92% 50%)`
- **Success** `hsl(152 60% 40%)` · **Warning** amber · **Destructive** `hsl(0 72% 51%)`
- **Fonts:** Inter (400–800) + JetBrains Mono (IDs) · **Radius:** 0.75rem
- Glass cards, subtle gradients (`--gradient-primary`, `--gradient-hero`), mobile-first, bottom nav, 44px touch targets.
- Source tokens: `Remix of Field Connect Pro/src/index.css` + `tailwind.config.ts`.

## Sales RM v1 data model (new Neon/Drizzle tables)

- `sales_channel_partners` — CP registry. cp_id (auto, e.g. SCP001), cp_name, phone_primary, phone_secondary, email, primary_business (text[]), team_size, monthly_deal_volume, other_platforms (text[]), office_address, office_lat/lng, office_verification_status, societies (jsonb for v1), created_by (sales_rm), is_active, timestamps.
- `sales_visits` — the visit/meeting log + audio pipeline. sales_rm_id, cp_id, meeting_type (`first_visit` | `repeat_visit`), check_in_time, check_out_time, duration_seconds, meeting_lat/lng, key_discussion_points, cp_engagement_level (`positive`|`neutral`|`disengaged`), competitive_update, inventory_received (bool), inventory_pipeline_count, next_followup_date, next_action_required, meeting_outcome (`onboarded`|`follow_up_required`|`not_interested`|`future_potential`), selfie_url (later), **audio_url, transcript_text, transcript_words (jsonb), summary (jsonb), status** (processing|ready|failed), language, timestamps.
- Follow `.claude/rules/database/SCHEMA.md`: TEXT not VARCHAR, soft delete (`deleted_at`), no FK constraints, indexes on cp_id / sales_rm_id / next_followup_date.

## Phases

### Phase 1 — Staging foundation _(needs user push + Vercel actions)_
- `staging` git branch → Vercel auto preview → stable staging URL.
- Disable Deployment Protection for Preview (else WebView hits Vercel login).
- Staging Capacitor config (`server.url` → staging URL) + staging APK. v1: same appId (replaces prod app on test device, native Google auth works with zero GCP change). Side-by-side install via `.staging` appId is a later option (needs a GCP Android OAuth client for the new package).

### Phase 2 — Role + schema foundation _(local, reviewable)_
- Add `sales_rm` to role enum (idempotent `migrate.js`).
- Create `sales_channel_partners` + `sales_visits` tables + drizzle schema + indexes.
- Middleware: gate `/sales/**` + `/api/sales/**` to `sales_rm` (+ admin). Login redirect: `sales_rm` → `/sales`.

### Phase 3 — Sales RM app (new design)
- App shell + bottom nav + design tokens ported to our CSS.
- Dashboard (today's visits, pending follow-ups, quick stats).
- Search CPs · CP profile · Register CP (multi-step) · New Visit (record + form + AI summary) · Reports.
- Sales-specific Claude prompt (different meeting types + summary fields) in `lib/salesClaude.js`.

### Phase 4 — Admin views for sales
- Admin can list sales reps, their visits, CP registry, basic performance.

### Phase 5 — Design refresh of existing recording screens
- Apply teal/amber system to Demand + Direct RM dashboards, recorder, meeting detail, admin.

### Phase 6 — API optimization + bug/lag/polish
- Lean list payloads (drop transcript from list views), consolidate polling, trim over-fetch.
- Fix reported lag/jerk; visual polish; anti-AI-generic pass.

## Working constraints
- **User pushes, not me.** I make changes on a branch and tell them exactly what to push + configure.
- JS-only changes need **no APK rebuild** (Capacitor loads live from Vercel). Only native/manifest/Capacitor-config changes need a rebuild.
- All timestamps UTC (`Instant`/`TIMESTAMPTZ`); naming snake_case DB / camelCase code; API case conversion via interceptors.
