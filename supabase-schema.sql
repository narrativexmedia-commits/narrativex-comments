-- ══════════════════════════════════════════════════════════
--  NarrativeX Comment Manager — Supabase Schema
--  Run this in the Supabase SQL Editor
--  These tables use the cm_ prefix to avoid conflicts with
--  the existing Meta Publisher tables in the same project.
-- ══════════════════════════════════════════════════════════

-- ─── 1. cm_clients ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS cm_clients (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  page_name          TEXT        NOT NULL,
  page_id            TEXT        NOT NULL UNIQUE,
  instagram_id       TEXT,
  page_access_token  TEXT        NOT NULL,
  page_description   TEXT,
  is_active          BOOLEAN     DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. cm_comments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cm_comments (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID        REFERENCES cm_clients(id) ON DELETE CASCADE,
  comment_id      TEXT        NOT NULL UNIQUE,   -- Instagram comment ID
  commenter_name  TEXT,
  comment_text    TEXT        NOT NULL,
  post_id         TEXT,
  post_caption    TEXT,
  post_permalink  TEXT,
  ai_reply        TEXT,
  final_reply     TEXT,                          -- set if SMM edited the reply
  status          TEXT        DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'negative', 'approved', 'rejected',
      'posted', 'manually_replied', 'failed'
    )),
  is_negative     BOOLEAN     DEFAULT false,
  assigned_smm    TEXT,                          -- email of SMM who acted
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cm_comments_client_status
  ON cm_comments(client_id, status);

CREATE INDEX IF NOT EXISTS idx_cm_comments_status
  ON cm_comments(status);

CREATE INDEX IF NOT EXISTS idx_cm_comments_comment_id
  ON cm_comments(comment_id);

CREATE INDEX IF NOT EXISTS idx_cm_comments_created_at
  ON cm_comments(created_at DESC);

-- ─── 4. Row Level Security ────────────────────────────────
ALTER TABLE cm_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_comments ENABLE ROW LEVEL SECURITY;

-- Authenticated users (SMMs logged in via Supabase Auth)
CREATE POLICY "cm_clients_auth"
  ON cm_clients FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "cm_comments_auth"
  ON cm_comments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role (used by API routes / cron jobs)
CREATE POLICY "cm_clients_service"
  ON cm_clients FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "cm_comments_service"
  ON cm_comments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Done ─────────────────────────────────────────────────
-- After running this SQL, add your first client either:
-- a) Via the dashboard "Add New Client" button, or
-- b) Via a direct INSERT into cm_clients if you have many clients:

-- Example INSERT (repeat per client):
-- INSERT INTO cm_clients (page_name, page_id, instagram_id, page_access_token, page_description)
-- VALUES (
--   'Daawat Biryani House',
--   '123456789012345',
--   '987654321098765',
--   'EAA...your_long_lived_token...',
--   'A Hyderabadi biryani restaurant. Warm, friendly, and foodie tone.'
-- );
