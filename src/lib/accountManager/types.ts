/**
 * Account Manager 2.0 — Type Definitions
 *
 * Unified DTO for account overview combining data from:
 * - provider_connections table
 * - proxy registry & assignments
 * - rateLimitManager (Bottleneck)
 * - providerLimitsCache (quota snapshots)
 * - combo routing configs
 */

export type AuthType = "oauth" | "apikey" | "api_key" | "web_cookie";

export type HealthStatus =
  | "working" // Green — eligible for routing
  | "unchecked" // Gray — no diagnostics yet
  | "checking" // Blue — diagnostic in progress
  | "rate_limited" // Yellow — cooldown active
  | "quota_exhausted" // Orange — confirmed no quota
  | "auth_error" // Red — credentials invalid/expired
  | "proxy_error" // Red — mandatory proxy unreachable
  | "provider_error" // Red — upstream 5xx
  | "disabled"; // Gray — manually disabled

export type ProxyMode = "inherit" | "individual" | "direct" | "failover";
export type ProxySource = "individual" | "provider" | "global" | "combo" | "direct";
export type RateLimitMode = "inherit" | "enabled" | "disabled";
export type RateLimitSource = "individual" | "global" | "auto" | "provider";
export type StrategySource = "global" | "provider" | "combo" | "account";

export interface AccountOverview {
  // Identity
  connectionId: string;
  providerId: string;
  displayName: string;
  authType: AuthType;

  // Admin state
  enabled: boolean;

  // Computed health (source of truth for UI)
  healthStatus: HealthStatus;
  healthDetails: HealthDetails;

  // Routing eligibility
  routingEligible: boolean;
  routingExclusionReasons: string[];

  // Effective proxy (resolved by backend)
  effectiveProxy: EffectiveProxy | null;
  proxyPolicy: ProxyPolicy;

  // Quotas (from providerLimitsCache)
  quotas: QuotaWindow[];
  quotaSource: "cache" | "live" | "stale";
  quotaFetchedAt: string | null;

  // Rate limit protection
  rateLimit: RateLimitStatus;

  // Routing participation
  routing: RoutingParticipation;

  // Timestamps
  lastSuccessAt: string | null;
  lastError: LastErrorInfo | null;
  diagnosticsAt: string | null;

  // Optimistic concurrency
  dataRevision: number;
}

export interface HealthDetails {
  auth: AuthHealth;
  proxy: ProxyHealth;
  quota: QuotaHealth;
  rateLimit: RateLimitHealth;
  upstream: UpstreamHealth;
}

export interface AuthHealth {
  status: "valid" | "expired" | "expiring_soon" | "missing" | "unknown";
  expiresAt: string | null;
  minutesUntilExpiry: number | null;
}

export interface ProxyHealth {
  status: "ok" | "degraded" | "failed" | "not_configured" | "unknown";
  lastCheckAt: string | null;
  failClosedActive: boolean;
}

export interface QuotaHealth {
  status:
    "available" | "low" | "exhausted" | "waiting_recovery" | "stale" | "unknown" | "unlimited";
  lowestRemainingPercentage: number | null;
  nextResetAt: string | null;
}

export interface RateLimitHealth {
  status: "ok" | "throttling" | "cooldown" | "queue_full" | "disabled";
  cooldownUntil: string | null;
  queuedRequests: number;
}

export interface UpstreamHealth {
  status: "ok" | "degraded" | "down" | "unknown";
  lastErrorCode: number | null;
  lastErrorAt: string | null;
}

export interface EffectiveProxy {
  proxyId: string;
  name: string;
  type: string;
  host: string;
  port: number;
  region: string | null;
  maskedAddress: string; // e.g., "http://us-***@proxy.example.com:8080"
  protocol: "http" | "https" | "socks5";
  source: ProxySource;
  lastCheckAt: string | null;
  checkStatus: "success" | "failed" | "pending" | "unknown";
  egressIp: string | null;
  egressIpCheckedAt: string | null;
  geoLocation: GeoLocation | null;
}

export interface ProxyPolicy {
  mode: ProxyMode;
  failClosed: boolean; // Strict / Fail-Closed
  failoverProxyIds: string[]; // For failover mode
  directFallbackAllowed: boolean;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  isp: string;
}

export interface QuotaWindow {
  name: string; // "5h", "7d", "monthly", "model:gpt-4"
  displayName: string;
  used: number | null;
  total: number | null;
  remaining: number | null;
  remainingPercentage: number | null;
  unlimited: boolean;
  resetAt: string | null;
  isCredits: boolean;
  creditCount: number | null;
  staleAfterReset: boolean;
}

export interface RateLimitStatus {
  configuredMode: RateLimitMode;
  effectiveState: boolean; // What actually applies
  source: RateLimitSource;
  autoReason: string | null; // Why auto-enabled (e.g., "API Key connection")
  overrides: RateLimitOverrides | null;
  current: RateLimitCurrent;
}

export interface RateLimitOverrides {
  rpm?: number | null;
  maxConcurrent?: number | null;
  queueSize?: number | null;
  queueTimeoutMs?: number | null;
  cooldownMs?: number | null;
  minTimeMs?: number | null;
  executionMaxWaitMs?: number | null;
}

export interface RateLimitCurrent {
  queued: number;
  running: number;
  avgWaitMs: number;
  errors429: number;
  cooldownUntil: string | null;
  cooldownReason: string | null;
}

export interface RoutingParticipation {
  participatesInCombo: boolean;
  comboNames: string[];
  effectiveStrategy: string;
  strategySource: StrategySource;
  stickyLimit: number | null;
  priority: number;
  globalPriority: number | null;
  maxConcurrent: number | null;
  availableInPool: boolean;
  requestsLast24h: number;
  successRate: number;
  currentLoad: "idle" | "low" | "medium" | "high";
}

export interface LastErrorInfo {
  code: string | number;
  message: string;
  type: string;
  source: string;
  at: string;
}

// Input types for mutations
export interface AssignProxyInput {
  proxyId: string | null; // null = unassign
  mode?: ProxyMode;
  failClosed?: boolean;
  failoverProxyIds?: string[];
  directFallbackAllowed?: boolean;
}

export interface DiagnosticMode {
  mode: "quick" | "full" | "ai-test";
}

export interface SimulateRoutingInput {
  comboName?: string;
  providerId?: string;
  model?: string;
  count?: number; // Number of virtual selections to simulate
}

export interface BulkOperationInput {
  connectionIds: string[];
  action:
    | "activate"
    | "deactivate"
    | "assign_proxy"
    | "unassign_proxy"
    | "set_rate_limit_mode"
    | "refresh_quotas"
    | "run_diagnostics";
  params: Record<string, unknown>;
}

// Diagnostic types
export interface DiagnosticStep {
  name: string;
  status: "pending" | "running" | "success" | "warning" | "error" | "skipped" | "unsupported";
  durationMs: number | null;
  details: string | null;
  errorCode: string | null;
  recommendedAction: string | null;
}

export interface DiagnosticResult {
  jobId: string;
  connectionId: string;
  mode: "quick" | "full" | "ai-test";
  startedAt: string;
  completedAt: string | null;
  steps: DiagnosticStep[];
  overallStatus: "healthy" | "degraded" | "unhealthy" | "incomplete";
}

export interface SimulateRoutingResult {
  effectiveStrategy: string;
  strategySource: StrategySource;
  eligibleAccounts: Array<{
    connectionId: string;
    displayName: string;
    priority: number;
    reason: string;
  }>;
  excludedAccounts: Array<{
    connectionId: string;
    displayName: string;
    reason: string;
  }>;
  simulation: Array<{
    step: number;
    selectedAccountId: string;
    selectedAccountName: string;
    reason: string;
  }>;
}

export interface AccountEvent {
  id: number;
  connectionId: string;
  category: string;
  result: "success" | "warning" | "error" | "info";
  summary: string;
  detailsJson: string | null;
  reasonCode: string | null;
  createdAt: string;
}

// API Response envelopes
export interface ApiSuccess<T> {
  data: T;
  meta?: { revision: number };
}

export interface ApiError {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
