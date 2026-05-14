# Openhouse · Meetings

Production-grade meeting recording, transcription, and summarisation for the Openhouse RM team. Built for Vercel + Neon.

## What it does

- **RMs** sign in with Google → record a meeting → audio is transcribed (ElevenLabs Scribe v2) and summarised (Claude) → meeting is saved to Postgres with searchable transcript and structured summary.
- **Admins** sign in with Google → see all RMs' meetings, daily/weekly/monthly/90-day activity, and per-RM stats. Admins also manage who has access (add/deactivate/promote/delete users).
- **Audio recordings** are stored in Vercel Blob (optional but recommended), played back inline in the meeting modal.
- **Role-based access** is enforced at three layers: middleware, server components, and API routes.

## Stack

- **Framework:** Next.js 14 (App Router, JS)
- **DB:** Neon Postgres + Drizzle ORM
- **Auth:** NextAuth v5 (Google OAuth, JWT sessions)
- **Audio storage:** Vercel Blob
- **Transcription:** ElevenLabs Scribe v2 (server-side proxy)
- **Summarisation:** Claude Sonnet 4.5 via Anthropic SDK (server-side proxy)

API keys live server-side in env vars — the browser never sees them.

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url> openhouse-meetings
cd openhouse-meetings
npm install
```

### 2. Provision Neon

1. Go to https://console.neon.tech → create a project (region close to your Vercel deployment).
2. Copy the **pooled** connection string (it ends with `-pooler...`).

### 3. Set up Google OAuth

1. Go to https://console.cloud.google.com → APIs & Services → Credentials.
2. Create OAuth 2.0 Client ID → Web application.
3. Authorised redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Prod: `https://your-app.vercel.app/api/auth/callback/google`
4. Copy the client ID and secret.

### 4. Get an Anthropic API key

https://console.anthropic.com → API Keys → create one.

### 5. Get an ElevenLabs API key

https://elevenlabs.io → Profile → API key. Scribe v2 is metered per minute of audio.

### 6. Get a Vercel Blob token (required)

Vercel Blob storage is **required** — for recordings longer than ~3 minutes the audio file is larger than the 4.5 MB Vercel serverless body limit, so the browser uploads directly to Blob (using a token minted by `/api/upload-url`) and the server only sees the resulting URL.

1. Push the repo to GitHub.
2. Import into Vercel.
3. In the Vercel dashboard → Storage → Create a Blob store → it auto-injects `BLOB_READ_WRITE_TOKEN` into the project's env vars.

For local dev:

```bash
npm i -g vercel
vercel login
vercel link
vercel env pull .env.local
```

That pulls `BLOB_READ_WRITE_TOKEN` into your local env. Without it the recorder will fail with a clear error.

### 7. Configure env vars

```bash
cp .env.example .env.local
```

Then fill in:

```bash
DATABASE_URL="postgresql://...-pooler.../dbname?sslmode=require"

AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Bootstrap admins — these emails get auto-provisioned as admin on first sign-in.
# Everyone else must be invited from the admin UI first.
ADMIN_EMAILS="ashish@openhouse.in,rahool@openhouse.in"

ANTHROPIC_API_KEY="sk-ant-..."
ELEVENLABS_API_KEY="sk_..."
ELEVENLABS_LANGUAGE=""        # leave empty for auto-detect; or set to "en", "hi", etc.

BLOB_READ_WRITE_TOKEN=""      # optional, for audio playback
```

### 8. Push the schema

```bash
npm run db:migrate
```

This creates the `users` and `meetings` tables plus indexes.

### 9. Run locally

```bash
npm run dev
```

Open http://localhost:3000 → sign in with an email in `ADMIN_EMAILS` → you'll land on the admin overview → invite RMs.

---

## Deploy to Vercel

```bash
git push origin main
```

Then in Vercel:

1. Import the repo.
2. Set the same env vars as `.env.local`, but:
   - `AUTH_URL` = your production URL (e.g. `https://openhouse-meetings.vercel.app`)
   - Add the prod URL to the Google OAuth redirect URIs (see step 3).
3. Connect a Vercel Blob store (Storage tab → Create → it auto-injects `BLOB_READ_WRITE_TOKEN`).
4. After first deploy, run the migration once. The easiest way: `vercel env pull .env.local` then `npm run db:migrate` locally against the same Neon DB.

### Function timeout & long recordings

This app handles recordings up to **60 minutes** by:

1. **Bypassing the 4.5 MB serverless body limit** — the browser uploads audio directly to Vercel Blob via a one-time token (`/api/upload-url`), then sends only the resulting URL to `/api/process-meeting`. This is the `@vercel/blob/client` `upload()` pattern.
2. **Using a 13-minute function ceiling** — `app/api/process-meeting/route.js` sets `export const maxDuration = 800;`. This requires **Fluid Compute** (default on Pro, enabled automatically). Active CPU is only counted while your code is *executing*, not while waiting on ElevenLabs/Claude, so a 60-min transcription costs roughly the same as a 5-min one.

Check Fluid Compute is on: **Vercel dashboard → Project → Settings → Functions → Fluid Compute = enabled.**

If you ever need recordings >60 min, switch processing to a background queue (e.g. Vercel Queues or Inngest) — kicking off a job from the API route and returning immediately, then polling for completion.

---

## How auth works

1. User clicks **Continue with Google** → standard OAuth flow.
2. NextAuth fires the `signIn` callback in `auth.js`:
   - If the email is already in `users` table and `is_active = true` → allow.
   - If the email is in `ADMIN_EMAILS` env var → auto-provision as admin.
   - Otherwise → deny with `error=not_invited`.
3. The JWT carries `id` and `role`. `middleware.js` checks the role on every request and redirects:
   - RMs trying to hit `/admin` → bounced to `/dashboard`
   - Unauthed users → bounced to `/login`

To add a new RM as an admin: log in as admin → **Manage RMs** → **Add RM** → enter their Google email. They can then sign in.

---

## Project layout

```
auth.js                            NextAuth v5 config
auth-handlers.js                   GET/POST exports for the route
middleware.js                      Role-aware route protection

drizzle/
  schema.js                        users + meetings tables
  migrate.js                       Bootstrap script (npm run db:migrate)

lib/
  db.js                            Drizzle client (Neon HTTP driver)
  queries.js                       All DB reads/writes
  elevenlabs.js                    Server-side transcription
  claude.js                        Server-side summarisation
  utils.js                         fmtDate, fmtDuration, speaker turns

app/
  layout.jsx                       Root + global CSS
  page.jsx                         Redirects based on role
  globals.css                      All styles
  login/page.jsx                   Google sign-in
  dashboard/                       RM view: their own meetings
  admin/                           Admin view: all meetings + stats
  admin/rms/                       Admin view: manage users
  new-meeting/                     2-step form + recorder
  api/
    auth/[...nextauth]/route.js    OAuth handlers
    meetings/route.js              GET (role-scoped list)
    meetings/[id]/route.js         GET single, DELETE
    upload-url/route.js            Mints Blob client upload tokens (bypasses 4.5 MB body limit)
    process-meeting/route.js       Fetch from Blob URL → transcribe → summarise → save
    rms/route.js                   GET, POST (admin only)
    rms/[id]/route.js              PATCH, DELETE (admin only)
    admin/overview/route.js        Aggregate stats for the admin dashboard

components/
  AppShell.jsx                     Sidebar + main layout
  MeetingsTable.jsx                Filterable list
  MeetingDetail.jsx                Modal: summary, transcript, audio
  Recorder.jsx                     MediaRecorder wrapper
  Toast.jsx                        Notifications
  questions.js                     Default summary questions
```

---

## Customising the summary questions

Edit `lib/claude.js` and `components/questions.js` — keep them in sync. The keys in `DEFAULT_QUESTIONS` become keys on the JSON object Claude returns, and `MeetingDetail.jsx` renders the labels.

## Operational notes

- **The first admin** must be in `ADMIN_EMAILS` and must sign in once before they can invite anyone else. After that, admins manage everything from the UI.
- **Deleting an RM** with existing meetings will fail (`ON DELETE RESTRICT`) — deactivate them instead, so historical meetings stay attributable.
- **Audio is public** in Vercel Blob (the `put` call uses `access: 'public'`). The URL is unguessable but not access-controlled. For stricter ACLs, swap to a signed-URL flow.
- **Costs:** ElevenLabs Scribe v2 ~$0.40/hour audio · Claude Sonnet 4.5 ~$0.01 per meeting summary · Neon free tier handles low volume · Vercel Blob free tier is 1 GB.

## Common errors

- **"This email isn't registered"** on sign-in → email isn't in `users` table and not in `ADMIN_EMAILS`. Add via admin UI or bootstrap env.
- **`AUTH_SECRET` missing** → generate with `openssl rand -base64 32` and add to env.
- **Migration says `relation "users" already exists`** → that's fine, the script uses `IF NOT EXISTS`.
- **`maxDuration` exceeded** → upgrade to Vercel Pro, or shorten recordings, or move processing to a background queue.
