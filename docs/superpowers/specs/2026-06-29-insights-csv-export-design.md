# Insights CSV Export — Design

**Date:** 2026-06-29
**Scope:** Demand insights (`/admin/insights`) + Supply insights (`/admin/supply/insights`)

## Goal
Add "download CSV" buttons across both insights pages at every level the user reads
data: whole **tab**, each **section**, each **sub-stat** (via drill modal), and **AI
insights** (overall + per-item). Every CSV is **one row per underlying CP
visit/meeting** (not the aggregate numbers), with rich columns, and **always honors
the page's date-range + RM filters**.

## Decisions (confirmed with user)
- **Button placement:** ⤓ inline on tab + section headers; sub-stat export lives
  inside the drill-down modal that opens when a bar is clicked.
- **Columns:** rich, no full transcript.
- **AI insights:** export both overall (whole card) and per-item.

## Architecture
All generation is **server-side** — the client only holds aggregates.

### Shared
- `lib/csv.js` — extracted from `app/api/admin/export/route.js`:
  `csvCell(v)`, `listOrString(v)`, `toIsoDate(d)`, and `csvResponse(filename, rows)`
  (sets `text/csv; charset=utf-8`, `Content-Disposition: attachment`, UTF-8 BOM).
- Rich row mappers + header lists: `meetingCsvRow(m)` (demand) and `visitCsvRow(v)`
  (supply).

### Columns (rich)
CP code · CP name · CP phone · city · date · RM name · duration · meeting type ·
sentiment/score class · AI summary · key topics · requirements · properties ·
budget · objections · commitments · next action · follow-up · audio URL.
Supply maps to: outcome · engagement level · onboarding stage · cp_sentiment ·
key points · cp needs · objections · commitments · competitive intel · inventory.

### Demand
- Refactor the WHERE-building inside `app/api/admin/insights/stat-meetings/route.js`
  into a shared helper so exports match the modal exactly.
- New `GET /api/admin/insights/export` — modes:
  - **tab**: `type` + filters → all meetings of that type.
  - **stat**: `type` + selector (`param` | `outcome` | `temp` | `call_field`+`call_value`)
    → the drill subset (the modal's Export button).
  - **ids**: `ids=` (AI insight `meeting_ids`).
  - Returns ALL matching rows (no 200-row display cap). Optional `section=visit_funnel`
    flattens the 12 funnel steps into boolean columns.

### Supply (no drill-down exists yet — added)
- New `GET /api/admin/supply/insights/records` — JSON (for the new drill modal,
  capped for display) and `?format=csv` (all rows). Shared visit-filter helper.
  Selectors: `outcome` | `stage` | `sentiment` | `engagement` | `meeting_type` | `ids`
  + `since`/`until`/`rm_id`. Joins `sales_channel_partners` (phone/city) + `users` (RM).
- New **drill modal** in the supply client: click a bar → matching visits → Export.

### Client
- `components/insights/DownloadCsv.jsx` — small ⤓ anchor linking to the export URL
  with current filters baked in (cookies auth same-origin; `Content-Disposition`
  triggers the download).
- Demand client: ⤓ on tab headers + section (`Panel`) headers; Export inside the
  drill modal; ⤓ overall + per-item on `InsightCard` / `AskTab` results.
- Supply client: ⤓ on tab + section headers; new drill modal w/ Export; ⤓ on
  Ask-anything results (overall + per-item via `visitIds`).

## Out of scope
- Full transcript column. Background/streaming for very large exports (return all
  matching synchronously, as the existing `/api/admin/export` already does).

## Verification
Build green; forged-admin screenshots of both pages showing the buttons; spot-check
a downloaded CSV honors the date/RM filter and contains the rich per-record columns.
