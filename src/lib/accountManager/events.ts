/**
 * Account Manager 2.0 — Events Service
 *
 * Records and retrieves account lifecycle events for history tab.
 * Uses new account_events table.
 */

import { AccountEvent } from "./types";
import { getDbInstance } from "@/lib/db/core";

const ACCOUNT_EVENTS_TABLE = "account_events";

// Event categories (must match DB schema)
export const EVENT_CATEGORIES = [
  "connected",
  "disconnected",
  "auth_updated",
  "proxy_changed",
  "proxy_test",
  "diagnostics_completed",
  "quota_exhausted",
  "quota_recovered",
  "cooldown_start",
  "cooldown_end",
  "routing_selected",
  "fallback_triggered",
  "settings_changed",
  "bulk_operation",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface RecordEventInput {
  connectionId: string;
  category: EventCategory;
  result: "success" | "warning" | "error" | "info";
  summary: string;
  details?: Record<string, unknown>;
  reasonCode?: string;
}

/**
 * Record an account event
 */
export async function recordAccountEvent(input: RecordEventInput): Promise<AccountEvent> {
  const db = getDbInstance();

  const stmt = db.prepare(`
    INSERT INTO ${ACCOUNT_EVENTS_TABLE}
    (connection_id, category, result, summary, details_json, reason_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(
    input.connectionId,
    input.category,
    input.result,
    input.summary,
    input.details ? JSON.stringify(input.details) : null,
    input.reasonCode ?? null
  );

  const event = db
    .prepare(`SELECT * FROM ${ACCOUNT_EVENTS_TABLE} WHERE id = ?`)
    .get(info.lastInsertRowid);
  return mapEventRow(event);
}

/**
 * Get events for a connection (paginated)
 */
export async function getAccountEvents(
  connectionId: string,
  options?: {
    limit?: number;
    offset?: number;
    category?: EventCategory;
    fromDate?: string;
    toDate?: string;
  }
): Promise<{ events: AccountEvent[]; total: number }> {
  const db = getDbInstance();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let where = "WHERE connection_id = ?";
  const params: unknown[] = [connectionId];

  if (options?.category) {
    where += " AND category = ?";
    params.push(options.category);
  }
  if (options?.fromDate) {
    where += " AND created_at >= ?";
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    where += " AND created_at <= ?";
    params.push(options.toDate);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM ${ACCOUNT_EVENTS_TABLE} ${where}`);
  const total = (countStmt.get(...params) as { cnt: number }).cnt;

  const dataStmt = db.prepare(`
    SELECT * FROM ${ACCOUNT_EVENTS_TABLE}
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = dataStmt.all(...params, limit, offset) as any[];

  return {
    events: rows.map(mapEventRow),
    total,
  };
}

/**
 * Get event categories with counts for a connection
 */
export async function getEventCategoryCounts(
  connectionId: string
): Promise<Record<EventCategory, number>> {
  const db = getDbInstance();

  const rows = db
    .prepare(
      `
    SELECT category, COUNT(*) as cnt
    FROM ${ACCOUNT_EVENTS_TABLE}
    WHERE connection_id = ?
    GROUP BY category
  `
    )
    .all(connectionId) as { category: string; cnt: number }[];

  const counts: Partial<Record<EventCategory, number>> = {};
  for (const row of rows) {
    counts[row.category as EventCategory] = row.cnt;
  }

  // Ensure all categories present
  for (const cat of EVENT_CATEGORIES) {
    if (!(cat in counts)) counts[cat] = 0;
  }

  return counts as Record<EventCategory, number>;
}

/**
 * Record common event types (convenience functions)
 */
export async function recordProxyChanged(
  connectionId: string,
  oldProxyId: string | null,
  newProxyId: string | null,
  source: "manual" | "auto"
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "proxy_changed",
    result: "info",
    summary: `Proxy ${oldProxyId ? "changed" : "assigned"}: ${oldProxyId || "none"} → ${newProxyId || "none"}`,
    details: { oldProxyId, newProxyId, source },
    reasonCode: "PROXY_ASSIGNMENT_CHANGED",
  });
}

export async function recordDiagnosticsCompleted(
  connectionId: string,
  result: "healthy" | "degraded" | "unhealthy",
  mode: "quick" | "full" | "ai-test",
  stepCount: number,
  errorCount: number
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "diagnostics_completed",
    result: result === "healthy" ? "success" : result === "degraded" ? "warning" : "error",
    summary: `${mode} diagnostics ${result} (${stepCount} steps, ${errorCount} errors)`,
    details: { mode, stepCount, errorCount },
    reasonCode: "DIAGNOSTICS_COMPLETED",
  });
}

export async function recordQuotaExhausted(
  connectionId: string,
  windowName: string,
  resetAt: string | null
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "quota_exhausted",
    result: "error",
    summary: `Quota exhausted: ${windowName}`,
    details: { window: windowName, resetAt },
    reasonCode: "QUOTA_EXHAUSTED",
  });
}

export async function recordQuotaRecovered(
  connectionId: string,
  windowName: string
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "quota_recovered",
    result: "success",
    summary: `Quota recovered: ${windowName}`,
    details: { window: windowName },
    reasonCode: "QUOTA_RECOVERED",
  });
}

export async function recordCooldownStart(
  connectionId: string,
  reason: string,
  until: string
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "cooldown_start",
    result: "warning",
    summary: `Rate limit cooldown started: ${reason}`,
    details: { reason, until },
    reasonCode: "COOLDOWN_STARTED",
  });
}

export async function recordCooldownEnd(connectionId: string): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "cooldown_end",
    result: "success",
    summary: "Rate limit cooldown ended",
    reasonCode: "COOLDOWN_ENDED",
  });
}

export async function recordRoutingSelected(
  connectionId: string,
  comboName: string,
  strategy: string,
  reasonCode: string
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "routing_selected",
    result: "info",
    summary: `Selected for ${comboName} via ${strategy}`,
    details: { combo: comboName, strategy },
    reasonCode,
  });
}

export async function recordFallbackTriggered(
  connectionId: string,
  fromAccountId: string,
  toAccountId: string,
  reason: string
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "fallback_triggered",
    result: "warning",
    summary: `Fallback from ${fromAccountId} to ${toAccountId}: ${reason}`,
    details: { fromAccountId, toAccountId, reason },
    reasonCode: "FALLBACK_TRIGGERED",
  });
}

export async function recordSettingsChanged(
  connectionId: string,
  changes: Record<string, { from: unknown; to: unknown }>
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "settings_changed",
    result: "info",
    summary: `Settings updated: ${Object.keys(changes).join(", ")}`,
    details: { changes },
    reasonCode: "SETTINGS_CHANGED",
  });
}

export async function recordBulkOperation(
  connectionId: string,
  operation: string,
  affectedCount: number,
  successCount: number,
  errorCount: number
): Promise<void> {
  await recordAccountEvent({
    connectionId,
    category: "bulk_operation",
    result: errorCount > 0 ? (successCount > 0 ? "warning" : "error") : "success",
    summary: `Bulk ${operation}: ${successCount}/${affectedCount} succeeded`,
    details: { operation, affectedCount, successCount, errorCount },
    reasonCode: "BULK_OPERATION",
  });
}

function mapEventRow(row: any): AccountEvent {
  return {
    id: row.id,
    connectionId: row.connection_id,
    category: row.category,
    result: row.result,
    summary: row.summary,
    detailsJson: row.details_json,
    reasonCode: row.reason_code,
    createdAt: row.created_at,
  };
}

/**
 * Initialize account_events table (called from migration)
 */
export function createAccountEventsTable(): void {
  const db = getDbInstance();

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${ACCOUNT_EVENTS_TABLE} (
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
    ON ${ACCOUNT_EVENTS_TABLE}(connection_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_account_events_category
    ON ${ACCOUNT_EVENTS_TABLE}(category);
  `);
}
