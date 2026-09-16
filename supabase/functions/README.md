# Phase 11 — Automation: Daily Email Report

This runs server-side on a schedule — something the browser app itself can't
do (there's no "always-on" tab). It's a Supabase Edge Function, triggered
once a day by a cron job.

## ⚠️ Important: redeploy after this update

If you already deployed this function before, **you must redeploy it again**:

```bash
supabase functions deploy daily-report
```

This update fixes a real bug: the Gmail SMTP support I added used a
**static top-level import** of the `denomailer` library. If that import
failed to resolve for any reason during Supabase's function bundling, the
**entire function would fail to boot** — including the CORS/OPTIONS
handling — which shows up in the browser as what looks exactly like a
CORS policy error, even though it has nothing to do with CORS. The import
is now **dynamic** (only loaded the moment SMTP is actually configured and
used), so a problem with that dependency can never take down the rest of
the function, including the parts that already worked fine via Resend.

Also new: an **Enable SSL** toggle in Settings — controls the `tls` flag
passed to the SMTP client directly, instead of guessing from the port
number. Leave it on for port 465, off for 587/STARTTLS (Gmail's standard).

## 1. One-time setup

### a) Get a free Resend account (for sending email)
1. Sign up at https://resend.com (free tier: 3,000 emails/month, 100/day —
   more than enough for one email a day)
2. Get your API key from the Resend dashboard
3. For quick testing, you can send from Resend's shared test address
   `onboarding@resend.dev` with no extra setup. To send from your own
   domain/email later, verify a domain in Resend first.

### b) Run the settings migration
Run `0009_settings_automation.sql` in Supabase SQL Editor (see the SQL
posted in chat), then set your recipient email:

```sql
update settings set notification_email = 'youremail@example.com' where id = 1;
```

### c) Install the Supabase CLI (on your own machine, not this sandbox)
```bash
npm install -g supabase
supabase login
```

### d) Link this project and deploy the function
From your project root (where the `supabase/` folder lives):
```bash
supabase link --project-ref <your-project-ref>
supabase functions deploy daily-report
```

Your project ref is the subdomain in your Supabase URL, e.g. for
`https://avggkxqzuzkspremibkr.supabase.co` it's `avggkxqzuzkspremibkr`.

### e) Set the function's secrets
```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set FROM_EMAIL=onboarding@resend.dev
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available to
Edge Functions automatically — no need to set those yourself.)

### f) Test it manually once
```bash
supabase functions invoke daily-report
```
Check your inbox — you should get the report email. If it fails, run with
`--debug` or check the function logs in the Supabase Dashboard under
Edge Functions.

## 2. Scheduling it to run automatically every night

You have two free options — pick whichever is easier for you:

### Option A: Supabase's built-in Cron (Dashboard, no extra tools)
1. Supabase Dashboard → **Database** → **Cron Jobs** → **Create a new cron job**
2. Schedule: `0 21 * * *` (9:00 PM UTC — adjust for your desired IST time;
   IST is UTC+5:30, so for 9:00 PM IST, use `30 15 * * *` in UTC)
3. Type: **HTTP Request**
4. URL: `https://<your-project-ref>.supabase.co/functions/v1/daily-report`
5. Method: POST
6. Headers: `Authorization: Bearer <your-anon-or-service-role-key>`

### Option B: A free external cron service (simplest, no SQL needed)
1. Go to https://cron-job.org (free, no credit card)
2. Create an account, add a new cron job
3. URL: `https://<your-project-ref>.supabase.co/functions/v1/daily-report`
4. Schedule: daily at your preferred time (in your local timezone — the
   site handles IST directly, no UTC math needed)
5. Add a custom header: `Authorization: Bearer <your-anon-key>`
6. Save — that's it, it'll hit your function daily for free

## 3. Manual "Send Now" (in-app)

Settings → Email & Automation now has a **"Send Report Now"** button with a
date picker. This calls the same Edge Function directly from the app
(`supabase.functions.invoke('daily-report', { body: { date, force: true } })`)
— useful if the scheduled cron run didn't fire for some reason, or to
(re)send a specific past day's report. `force: true` bypasses the
`daily_report_enabled` toggle so it always sends when you explicitly ask.

## 4. Multiple recipients

`notification_email` in Settings now accepts a **comma-separated list** —
managed in the UI as removable chips. The Edge Function splits on commas
and sends to all of them via Resend's array `to` field.

## 5. What this does NOT do yet (future extension)

- **Stock Purchase Suggestion** is included as a simple heuristic in the
  email (suggested purchase = 2x the minimum stock threshold), matching
  your spec's example (minimum 10 → suggested purchase 20). This can be
  refined later (e.g. factoring in sales velocity) without changing the
  scheduling setup.
- **Configurable schedule/recipient from within the app UI** (rather than
  editing the `settings` table directly via SQL) is a natural fit for
  **Phase 12 (Settings)** — the next phase — since that's exactly where a
  proper form for these fields belongs.

---

## cleanup-activity-logs

Deletes `activity_logs` rows older than 7 days. This is its **own separate
function with its own separate cron schedule** — it has nothing to do with
`daily-report`'s schedule, and setting `daily_report_time` in Settings does
not affect this either (that field only affects the daily report email;
see the note above about it being stored data, not an active scheduler).

### Deploy it

```bash
supabase functions deploy cleanup-activity-logs
```

Uses the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` that are
already available to every Edge Function automatically — no new secrets
to set.

### Test it once manually

```bash
supabase functions invoke cleanup-activity-logs
```

Should return something like `{"deleted": 3, "cutoff": "2026-07-31T..."}`.

### Schedule it (separate cron job from daily-report)

Same two options as `daily-report` — pick whichever you used there:

**cron-job.org:**
- URL: `https://avggkxqzuzkspremibkr.supabase.co/functions/v1/cleanup-activity-logs`
- Method: POST
- Schedule: once a day, any time (e.g. 3:00 AM) — this doesn't need to
  match the daily report's time at all
- Header: `Authorization: Bearer <your-anon-key>`

**Supabase Database → Cron Jobs:** same URL/method/header, schedule in UTC.

### Alternative: skip the Edge Function entirely

Since this is just a periodic `DELETE`, it can also be done with a single
scheduled SQL statement via `pg_cron` directly in Supabase's Database →
Cron Jobs, with **no Edge Function or HTTP call needed at all**:

```sql
select cron.schedule(
  'cleanup-activity-logs',
  '0 3 * * *',  -- 3:00 AM UTC daily
  $$ delete from activity_logs where created_at < now() - interval '7 days' $$
);
```

Either approach works — the Edge Function version above gives you
invocation logs in the Edge Functions dashboard if you want visibility
into when it ran; the `pg_cron` version is one line and needs no
deployment.
