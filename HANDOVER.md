# Openhouse Meetings — Handover

> Read this first if you're a fresh Claude Code session (e.g. after moving machines).
> It captures project context + everything that's **built but not yet deployed/tested**.
> Last updated at the end of the "Capacitor Android" phase.

---

## 1. What this app is (60-second orientation)

**Openhouse Meetings** — a Next.js web app for Openhouse RMs (real-estate Relationship
Managers) to record/transcribe/summarise Channel Partner (CP) meetings and buyer site
visits.

**Stack**
- **Next.js 14 App Router** (server components + API routes + server actions), deployed on **Vercel**.
- **Neon Postgres** via **drizzle ORM** (`drizzle/schema.js`; HTTP driver — each `` sql`` `` is one round-trip, no transactions across statements).
- **Vercel Blob** — audio storage. **ElevenLabs Scribe** — transcription. **Claude (Anthropic SDK, `claude-sonnet-4-5-20250929`)** — summaries + insights.
- **NextAuth** (Google OAuth). Roles: `admin`, `rm`, `direct_rm`.
- Meeting types: `engagement`, `visit`, `onboarding`, `call`.

**Pipeline:** record/upload → Vercel Blob → `/api/meetings/[id]/process` → ElevenLabs → Claude summary → row in `meetings`.

**Key dirs**
- `app/` — routes (pages + API). `components/` — UI. `lib/` — server/client helpers. `drizzle/` — schema + migration + CLI scripts.
- `drizzle/migrate.js` is the **idempotent** source of truth for the DB schema.

---

## 2. ⚠️ DO THESE FIRST — pending deploy tasks (none applied yet)

The recent phases (Salestrail sync, insights save/drill-down, direct-RM visits) added
DB columns/tables + env vars that have **NOT been applied to production**. Until they are,
those features 500 on use.

### 2a. Run the DB migrations
Easiest: `npm run db:migrate` (loads `.env.local`). If that hangs (Neon/IPv6 flakiness has
bitten before), paste this idempotent block into the **Neon SQL editor** instead:

```sql
ALTER TYPE role ADD VALUE IF NOT EXISTS 'direct_rm';

-- meetings columns added across recent phases
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS source_filename text;
CREATE INDEX IF NOT EXISTS meetings_source_filename_idx ON meetings(rm_id, source_filename);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS salestrail_call_id text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS salestrail_fetch_attempts integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS meetings_salestrail_call_uq ON meetings(salestrail_call_id) WHERE salestrail_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meetings_status_idx ON meetings(status);

-- Salestrail sync state (night-only continuous drain)
CREATE TABLE IF NOT EXISTS salestrail_sync_state (
  id integer PRIMARY KEY,
  cursor_at timestamptz,
  last_run_at timestamptz,
  last_result jsonb,
  in_progress boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false
);
ALTER TABLE salestrail_sync_state ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
INSERT INTO salestrail_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Insights: "save whole card" (legacy, dormant) + "save a single point"
ALTER TABLE insights ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS insights_pinned_idx ON insights(pinned) WHERE pinned = true;
CREATE TABLE IF NOT EXISTS saved_insight_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_insight_id uuid REFERENCES insights(id) ON DELETE SET NULL,
  source_title text,
  scope text NOT NULL,
  item jsonb NOT NULL,
  saved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_insight_items_scope_idx ON saved_insight_items(scope);
CREATE INDEX IF NOT EXISTS saved_insight_items_saved_at_idx ON saved_insight_items(saved_at DESC);
```

### 2b. Set Vercel environment variables (then redeploy)
- `SALESTRAIL_API_USERNAME` = `6af34e30-9e0b-46ee-97ad-7c4171538429`
- `SALESTRAIL_API_PASSWORD` = (the Salestrail Pull-API password — was failing with a 401; verify it's correct, regenerate at https://callanalytics.salestrail.io/integration/apidocs if unsure)
- `CRON_SECRET` = any random string (`openssl rand -base64 32`). **Required** — without it the Salestrail cron + self-chaining drain silently no-op.
- `SALESTRAIL_BATCH` = `8` (optional; recordings transcribed per drain batch)
- (existing, already set: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `AUTH_*`, `GOOGLE_*`, `CP_INVENTORY_DB_STRING`, `GOOGLE_SHEET_*`)

### 2c. Salestrail sync schedule
`vercel.json` runs `/api/salestrail/sync` at **22:00 + 02:00 IST** (cron `30 16,20 * * *`).
The drain runs **only 10 PM–6 AM IST** (gated in code) so it doesn't fight daytime uploads
for the Vercel Blob rate budget. Admin page: `/admin/salestrail` (Sync now / Pause).

---

## 3. The Capacitor Android phase — BUILT but NEVER RUN

Goal: a native app to fix mobile-web recording pain (background recording, call
interruptions, flaky uploads). Decision made: **Android first, native recorder**.
**Now on a Mac you can also do iOS** — see 3c.

### What's in the repo (all committed, untested on a device)
- Deps: `@capacitor/core|app|filesystem|cli|android`, `capacitor-voice-recorder`.
- `capacitor.config.json` — `appId: in.openhouse.meetings`, **`server.url` = `https://openhouse-meetings.vercel.app`** (the app is a thin shell loading the live site; all backend stays on Vercel). If the prod domain changes, edit this + `npm run cap:sync`.
- `components/NativeRecorder.jsx` — OS-level recorder, mirrors `components/Recorder.jsx`'s ref API (`finalize/resume/discard/elapsed` + `onPause/onDone/onCancel`). Records to `audio/aac` (m4a), returns base64 → Blob → existing upload pipeline.
- `app/new-meeting/client.jsx` — uses `NativeRecorder` **only** when `Capacitor.isNativePlatform()` (resolved post-mount to avoid hydration mismatch); the browser is 100% unchanged.
- `android/` — generated native project. Manifest has mic + location + foreground-service permissions.
- npm scripts: `cap:sync`, `cap:open`.

### 3a. Build & run on Android (Mac)
1. Install **Android Studio** (SDK + JDK bundled). Enable USB debugging on the phone.
2. `npm install` (after cloning), then `npm run cap:sync`.
3. `npm run cap:open` → wait for Gradle sync → plug in phone → green ▶ Run.
4. APK to share: Android Studio → Build → Build APK(s) → `android/app/build/outputs/apk/debug/app-debug.apk`.

### 3b. 🚧 KNOWN BLOCKER — Google login inside the WebView
NextAuth Google OAuth may be blocked by Google in the app's WebView
("disallowed_useragent"). It might work, might not. **Recommended fix (next task):**
native Google Sign-In plugin (`@codetrix-studio/capacitor-google-auth`) → get Google ID
token → new NextAuth **Credentials** provider verifies it server-side (`google-auth-library`)
and sets the session cookie via a same-origin fetch from inside the WebView. This is the
#1 thing to solve before handing the APK to RMs.

### 3c. iOS (now possible on Mac)
`npx cap add ios` → `npx cap open ios` (opens Xcode). Needs an Apple Developer account
($99/yr) to run on a real device / ship. Add the same mic/location usage strings to
`ios/App/App/Info.plist` (`NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`).

### 3d. Phase 2 hardening (not done)
- **Foreground service** for guaranteed long/screen-off recording (`capacitor-voice-recorder` alone can be killed when backgrounded; native is already far better than web, but a foreground service makes it bulletproof).
- Long-recording memory: the plugin returns the whole clip as base64 in memory — fine for short visits, risky for 60-min recordings. Move to a file-URI recorder if it crashes on long ones.
- App icon + name, then Play Store / sideload.

---

## 4. Feature map (what exists, where)
- **Salestrail sync** — `lib/salestrail.js`, `app/api/salestrail/sync/route.js`, admin UI `app/admin/salestrail/`. Pulls Mon/Fri calls of **regular RMs only** (direct_rm excluded), saves as `engagement` meetings. Night-only continuous self-chaining drain + Pause.
- **Direct-RM buyer survey** — `meeting_type='call'` recordings get a buyer-discovery survey summary (`components/questions.js` → `CALL_QUESTIONS`, `lib/claude.js` → `summarizeCall`). Has a `sentiment` (hot/warm/cold) field.
- **Direct-RM live visits** — direct RMs also have a "Start meeting" nav → `/new-meeting` in a stripped form (phone required, name/city optional), locked to `meeting_type='visit'`.
- **Admin Insights** (`app/admin/insights/`) — tabs: Visit / Engagement / Onboarding / Direct / Cross-cut / Ask. Has: custom date range + RM filter + Clear; per-point **Save** (`saved_insight_items`); and **every Tier-1 stat/bar is click-to-drill-down** into its recordings (`/api/admin/insights/stat-meetings`).
- **Uploads** — `lib/uploadMeeting.js` + `/api/upload-url`. `addRandomSuffix` is set **server-side** in `/api/upload-url`'s `onBeforeGenerateToken` (the client `upload()` can't pass it) so retries don't hit "blob already exists".

## 5. Gotchas learned (don't relearn the hard way)
- Neon HTTP driver: can't splice conditional SQL fragments — use the `(${param}::type IS NULL OR col = ${param}::type)` NULL-guard pattern for optional filters (see `lib/analytics.js`).
- `<style jsx>` inside a conditionally-rendered fragment crashes the SWC styled-jsx pass — use inline styles there.
- Time/date in client components: compute in IST deterministically (`Date.now() + 5.5h`) and guard with a `mounted` flag, or pass server-computed values via props — otherwise SSR/hydration mismatches.
- `capacitor.config` must be `.json` here (project is JS, no TypeScript installed — `.ts` config needs `npm i -D typescript`).
- Recording filenames are deterministic (`CPCODE_MOBILE_NAME_TYPE_DUR_TS.ext`); iOS records MP4 even when MediaRecorder claims webm → magic-byte detection in `lib/recordingName.js`.

## 6. Suggested next-session order
1. Apply §2 (migrations + env + redeploy) — unblocks all recent web features.
2. Build the Android app per §3a; test record → screen-off → upload.
3. If login blocks → build native Google sign-in (§3b).
4. Foreground service (§3d), then iOS (§3c) if wanted.
