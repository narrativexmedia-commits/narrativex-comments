# NarrativeX Comment Manager v2.0

AI-powered Instagram comment management. Built on Next.js + Supabase + Vercel.
Replaces the old n8n + Railway setup with a fully free, maintainable stack.

---

## Stack

| Service | Purpose | Cost |
|---|---|---|
| Vercel | Hosting + API routes | Free |
| Supabase | Database + Auth | Free |
| cron-job.org | 5-minute cron trigger | Free |
| Anthropic Claude | AI reply generation | ~₹200-300/month |

**Total fixed cost: ₹0**

---

## Setup Guide

### Step 1 — Supabase

1. Go to your existing Supabase project (same one as Meta Publisher)
2. Open the **SQL Editor**
3. Paste and run the contents of `supabase-schema.sql`
4. Note down your **Project URL**, **Anon Key**, and **Service Role Key**

### Step 2 — Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
CRON_SECRET=any-random-string-you-choose
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Step 3 — Create SMM Accounts in Supabase Auth

1. Go to Supabase → **Authentication** → **Users**
2. Click **Invite user** or **Add user**
3. Create accounts for each SMM (email + password)
4. They log in at your app URL with these credentials

### Step 4 — Deploy to Vercel

```bash
# Install dependencies
npm install

# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-org/narrativex-comments.git
git push -u origin main
```

Then in Vercel:
1. Import the GitHub repo
2. Add all environment variables from Step 2
3. Deploy

### Step 5 — Set Up cron-job.org (Two Jobs)

**Job 1 — Fetch Comments (every 5 minutes)**
- URL: `https://your-app.vercel.app/api/cron/fetch-comments`
- Method: GET
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Schedule: Every 5 minutes

**Job 2 — Detect Manual Replies (every 5 minutes)**
- URL: `https://your-app.vercel.app/api/cron/detect-manual`
- Method: GET
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Schedule: Every 5 minutes

### Step 6 — Add Your Clients

Option A — Through the dashboard "Add New Client" button (best for small numbers)

Option B — Bulk SQL insert via Supabase SQL Editor (for 35 clients):
```sql
INSERT INTO cm_clients (page_name, page_id, instagram_id, page_access_token, page_description)
VALUES
  ('Client Name 1', 'PAGE_ID_1', 'IG_ID_1', 'TOKEN_1', 'Brand persona text'),
  ('Client Name 2', 'PAGE_ID_2', 'IG_ID_2', 'TOKEN_2', 'Brand persona text');
```

---

## How the Cron Works (3-Hour Window)

The fetch-comments cron uses a **3-hour lookback window** every time it runs.
This means even if the cron misses a run, it will catch all comments from the past 3 hours on the next run.
No comments fall through the gap.

---

## Comment Status Lifecycle

```
Instagram comment posted
        ↓
  fetch-comments cron (every 5 min)
        ↓
  Already has a reply? → manually_replied
        ↓ (no)
  Claude generates reply + detects if negative
        ↓
  pending (positive)  OR  negative (hostile)
        ↓
  SMM Reviews on Dashboard
        ↓
  Approve → posted (reply on Instagram)
  Edit → save new reply → posted
  Reject → rejected → optional write-reply → posted
```

---

## Folder Structure

```
app/
  login/          Login page (Supabase Auth)
  dashboard/      Main SMM working view
  clients/        Client list management
  api/
    cron/
      fetch-comments/   Fetches IG comments + generates AI replies
      detect-manual/    Detects direct IG replies
    comments/
      approve/    Posts reply to Instagram
      reject/     Marks as rejected
      edit/       Saves edited reply + posts
      delete/     Removes from dashboard
      write-reply/ Posts custom reply for rejected comments
      bulk/       Bulk approve or reject
    clients/
      add/        Adds/updates a client (with Meta verification)
      list/       Lists all clients

lib/
  supabase.ts         Browser Supabase client
  supabase-server.ts  Server Supabase client + service client
  meta.ts             Meta Graph API integration
  claude.ts           Claude AI reply generation
  utils.ts            Types, helpers, constants

middleware.ts   Auth protection for all routes
supabase-schema.sql  Run once in Supabase SQL Editor
```

---

## Token Expiry Warning

Meta access tokens expire every 60 days. When they expire, the fetch-comments cron will
start getting errors for that client. Check the cron-job.org logs if comments stop appearing
for a specific client. You'll need to refresh the token in the cm_clients table.

Future improvement: proactive email alerts before token expiry.

---

## Cost Breakdown

| Item | Monthly Cost |
|---|---|
| Vercel hosting | ₹0 |
| Supabase | ₹0 |
| cron-job.org | ₹0 |
| Claude API (~35 clients, ~20 comments/day avg) | ~₹200-350 |
| **Total** | **~₹200-350/month** |
