/**
 * Account Manager 2.0 — Public Exports
 */

// Types
export * from "./types";

// Aggregator
export {
  buildAccountOverview,
  resolveEffectiveProxy,
  mapQuotasToWindows,
  buildRateLimitStatus,
  computeRoutingParticipation,
} from "./aggregator";

// Diagnostics
export {
  runAccountDiagnostics,
  getDiagnosticResult,
  cleanupOldJobs,
  recordAccountEvent,
} from "./diagnostics";
export type { DiagnosticMode } from "./diagnostics";

// Routing Simulator
export { simulateRouting } from "./routingSimulator";

// Events
export {
  recordAccountEvent,
  getAccountEvents,
  getEventCategoryCounts,
  recordProxyChanged,
  recordDiagnosticsCompleted,
  recordQuotaExhausted,
  recordQuotaRecovered,
  recordCooldownStart,
  recordCooldownEnd,
  recordRoutingSelected,
  recordFallbackTriggered,
  recordSettingsChanged,
  recordBulkOperation,
  createAccountEventsTable,
  EVENT_CATEGORIES,
} from "./events";
export type { EventCategory, RecordEventInput } from "./events";
