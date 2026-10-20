-- Migration 154: Account Manager 2.0 - account_events table and provider_connections additions

-- account_events table for history tab
CREATE TABLE IF NOT EXISTS account_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  category TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'warning', 'error', 'info')),
  summary TEXT NOT NULL,
  details_json TEXT,
  reason_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_events_connection_created
ON account_events(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_events_category
ON account_events(category);

-- Add columns to provider_connections for Account Manager 2.0
-- diagnostics_at: timestamp of last diagnostic run
ALTER TABLE provider_connections ADD COLUMN diagnostics_at TEXT;

-- data_revision: optimistic locking for concurrent edits
ALTER TABLE provider_connections ADD COLUMN data_revision INTEGER DEFAULT 0;

-- per_key_proxy_enabled already exists (boolean)
-- proxy_enabled already exists (boolean)

-- Note: proxy assignments are in proxy_assignments table with scope='account'
-- No separate account_proxies_json column needed - resolved via proxy_assignments