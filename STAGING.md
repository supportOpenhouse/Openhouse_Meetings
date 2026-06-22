# Staging (web) — setup runbook

Web-only staging on Vercel. **No APK build needed** — testers open the staging
URL in a phone/desktop browser. Staging **shares the production Neon database**,
so a "STAGING · live data" badge is shown (gated on `NEXT_PUBLIC_STAGING=1`).

The app already sets `trustHost: true`, so NextAuth uses whatever host Vercel
serves — no per-deploy `AUTH_URL` juggling required.

---

## One-time setup

### 1. Create + push the `staging` branch
```bash
git checkout -b staging
git add -A
git commit -m "Sales RM app + admin views + teal refresh + staging banner"
git push -u origin staging
```
Vercel auto-creates a branch deployment with a **stable alias**:
`https://<project>-git-staging-<team>.vercel.app`
(Find the exact URL in Vercel → Deployments → the `staging` branch.)

### 2. Set Preview env vars in Vercel
Vercel → Project → **Settings → Environment Variables** → scope **Preview**
(or specifically the `staging` branch). Copy every Production value (DB is
shared, so they're identical) and add one extra:

| Variable | Preview (staging) value |
|---|---|
| `DATABASE_URL` | same as production (shared DB) |
| `AUTH_SECRET` | same as production |
| `AUTH_URL` | **the staging alias** `https://<project>-git-staging-<team>.vercel.app` — **NOT** the production URL |
| `AUTH_TRUST_HOST` | `true` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | same as production |
| `ADMIN_EMAILS` | same as production |
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_LANGUAGE` | same |
| `BLOB_READ_WRITE_TOKEN` | same as production |
| `NEXT_PUBLIC_STAGING` | **`1`**  ← only here, never in Production |
| (others: `CP_INVENTORY_DB_STRING`, `GOOGLE_*`, `SALESTRAIL_*`, `CRON_SECRET`) | same as production |

> ⚠️ **`AUTH_URL` is the #1 gotcha.** If you copy the Production env to Preview,
> `AUTH_URL` comes across as the production URL — and then NextAuth sends the
> OAuth `redirect_uri` to production, so **after login you land on prod (old
> code), not staging.** You MUST override `AUTH_URL` in the Preview scope to the
> staging alias (or remove it from Preview so `trustHost` auto-detects the host).
> This is exactly the "logged in → bounced to openhouse-meetings.vercel.app"
> symptom.

### 3. Add the staging callback to Google OAuth (REQUIRED for login)
Google Cloud Console → APIs & Services → Credentials → your OAuth client →
**Authorised redirect URIs** → add:
```
https://<project>-git-staging-<team>.vercel.app/api/auth/callback/google
```
Without this, Google sign-in fails on staging with `redirect_uri_mismatch`.

### 4. Redeploy the staging branch
Trigger a redeploy (push a commit or "Redeploy" in Vercel) so it picks up the
env vars. Open the staging URL → you should see the amber **STAGING · live data**
badge top-right, and be able to sign in.

---

## Testing the Sales RM role on staging
The schema migration is already applied to the shared DB. To make a tester a
sales rep:
```sql
UPDATE users SET role = 'sales_rm' WHERE email = 'tester@openhouse.in';
```
They sign in with Google → land on `/sales`. Admins see the new **Field sales**
section in the admin sidebar.

---

## Notes & cautions
- **Shared DB**: anything created on staging (visits, CPs) lands in production
  data. The badge is the reminder. If you want true isolation later, point
  `DATABASE_URL` (Preview) at a separate Neon branch and run `npm run db:migrate`
  against it.
- **APK**: unchanged. `capacitor.config` still points at the production URL; the
  Android app is not part of staging. (A staging APK would just need
  `server.url` set to the staging alias + `npm run cap:sync` — skipped per scope.)
- **Demo data**: remove the seeded demo rows when done (see the cleanup SQL in
  the handoff / `drizzle/seed_sales_demo.js`).
