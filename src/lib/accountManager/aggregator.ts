/**
 * Account Manager 2.0 — Account Aggregator
 *
 * Builds AccountOverview DTO by combining data from:
 * - provider_connections (base connection data)
 * - Proxy registry & assignments (effective proxy resolution)
 * - rateLimitManager (rate limit status)
 * - providerLimitsCache (quota snapshots)
 * - Combo routing configs (routing participation)
 */

import {
  AccountOverview,
  HealthStatus,
  HealthDetails,
  AuthHealth,
  ProxyHealth,
  QuotaHealth,
  RateLimitHealth,
  UpstreamHealth,
  EffectiveProxy,
  ProxyPolicy,
  QuotaWindow,
  RateLimitStatus,
  RateLimitOverrides,
  RoutingParticipation,
  LastErrorInfo,
} from "./types";

import type { ProviderConnectionLike } from "@/lib/usage/providerLimits";
import { getProviderLimitsCache } from "@/lib/db/providerLimits";
import {
  resolveProxyForConnection,
  getProxyAssignments,
  // getProxyById, // unused
  // type ProxyRegistryRecord, // unused
} from "@/lib/db/proxies";
import {
  getRateLimitStatus /*, isRateLimitEnabled */,
} from "@omniroute/open-sse/services/rateLimitManager";
import { getSettings } from "@/lib/db/settings";
import { getProviderConnections } from "@/lib/db/providers";
// import { getCombos } from "@/lib/db/combos"; // unused

/**
 * Compute health status from connection state, proxy, quota, rate limit, and upstream
 */
export function computeHealthStatus(
  connection: ProviderConnectionLike,
  effectiveProxy: EffectiveProxy | null,
  proxyPolicy: ProxyPolicy,
  quotas: QuotaWindow[],
  rateLimit: RateLimitStatus,
  lastError: LastErrorInfo | null
): { status: HealthStatus; details: HealthDetails } {
  // Auth health
  const authHealth = computeAuthHealth(connection);

  // Proxy health
  const proxyHealth = computeProxyHealth(effectiveProxy, proxyPolicy, connection);

  // Quota health
  const quotaHealth = computeQuotaHealth(quotas);

  // Rate limit health
  const rateLimitHealth = computeRateLimitHealth(rateLimit);

  // Upstream health
  const upstreamHealth = computeUpstreamHealth(connection);

  // Determine overall status (priority order)
  let status: HealthStatus;

  if (!connection.isActive) {
    status = "disabled";
  } else if (authHealth.status === "expired" || authHealth.status === "missing") {
    status = "auth_error";
  } else if (proxyHealth.status === "failed" && proxyPolicy.failClosed) {
    status = "proxy_error";
  } else if (quotaHealth.status === "exhausted") {
    status = "quota_exhausted";
  } else if (rateLimitHealth.status === "cooldown") {
    status = "rate_limited";
  } else if (upstreamHealth.status === "down") {
    status = "provider_error";
  } else if (
    authHealth.status === "valid" &&
    (proxyHealth.status === "ok" || proxyHealth.status === "not_configured") &&
    (quotaHealth.status === "available" ||
      quotaHealth.status === "unlimited" ||
      quotaHealth.status === "unknown") &&
    rateLimitHealth.status !== "queue_full" &&
    upstreamHealth.status !== "down"
  ) {
    status = "working";
  } else if (authHealth.status === "unknown" && !lastError) {
    status = "unchecked";
  } else {
    status = "working"; // Default to working if no hard failure
  }

  const details: HealthDetails = {
    auth: authHealth,
    proxy: proxyHealth,
    quota: quotaHealth,
    rateLimit: rateLimitHealth,
    upstream: upstreamHealth,
  };

  return { status, details };
}

function computeAuthHealth(connection: ProviderConnectionLike): AuthHealth {
  const tokenExpiresAt = connection.tokenExpiresAt || connection.expiresAt;
  if (!tokenExpiresAt) {
    return { status: "unknown", expiresAt: null, minutesUntilExpiry: null };
  }

  const expiresMs = new Date(tokenExpiresAt).getTime();
  const now = Date.now();
  const minutesLeft = Math.floor((expiresMs - now) / 60000);

  if (minutesLeft < 0) {
    return { status: "expired", expiresAt: tokenExpiresAt, minutesUntilExpiry: minutesLeft };
  }
  if (minutesLeft < 30) {
    return { status: "expiring_soon", expiresAt: tokenExpiresAt, minutesUntilExpiry: minutesLeft };
  }
  return { status: "valid", expiresAt: tokenExpiresAt, minutesUntilExpiry: minutesLeft };
}

function computeProxyHealth(
  effectiveProxy: EffectiveProxy | null,
  proxyPolicy: ProxyPolicy,
  _connection: ProviderConnectionLike
): ProxyHealth {
  if (!effectiveProxy && !proxyPolicy.failClosed) {
    return {
      status: "not_configured",
      lastCheckAt: null,
      failClosedActive: proxyPolicy.failClosed,
    };
  }
  if (!effectiveProxy && proxyPolicy.failClosed) {
    return { status: "failed", lastCheckAt: null, failClosedActive: true };
  }
  if (effectiveProxy?.checkStatus === "failed") {
    return {
      status: "failed",
      lastCheckAt: effectiveProxy.lastCheckAt,
      failClosedActive: proxyPolicy.failClosed,
    };
  }
  if (effectiveProxy?.checkStatus === "success") {
    return {
      status: "ok",
      lastCheckAt: effectiveProxy.lastCheckAt,
      failClosedActive: proxyPolicy.failClosed,
    };
  }
  return {
    status: "unknown",
    lastCheckAt: effectiveProxy?.lastCheckAt ?? null,
    failClosedActive: proxyPolicy.failClosed,
  };
}

function computeQuotaHealth(quotas: QuotaWindow[]): QuotaHealth {
  if (quotas.length === 0) {
    return { status: "unknown", lowestRemainingPercentage: null, nextResetAt: null };
  }

  let lowestPct: number | null = null;
  let nextReset: string | null = null;
  let hasExhausted = false;
  let hasUnlimited = false;
  let allStale = true;

  for (const q of quotas) {
    if (q.unlimited) {
      hasUnlimited = true;
      continue;
    }
    if (q.staleAfterReset) {
      continue;
    }
    allStale = false;

    if (q.remainingPercentage !== null) {
      if (lowestPct === null || q.remainingPercentage < lowestPct) {
        lowestPct = q.remainingPercentage;
      }
    }
    if (q.remaining !== null && q.remaining <= 0) {
      hasExhausted = true;
    }
    if (q.resetAt && (!nextReset || q.resetAt < nextReset)) {
      nextReset = q.resetAt;
    }
  }

  if (hasExhausted) {
    return { status: "exhausted", lowestRemainingPercentage: lowestPct, nextResetAt: nextReset };
  }
  if (hasUnlimited && lowestPct === null) {
    return { status: "unlimited", lowestRemainingPercentage: null, nextResetAt: nextReset };
  }
  if (allStale) {
    return { status: "stale", lowestRemainingPercentage: lowestPct, nextResetAt: nextReset };
  }
  if (lowestPct !== null && lowestPct < 15) {
    return { status: "low", lowestRemainingPercentage: lowestPct, nextResetAt: nextReset };
  }
  if (lowestPct !== null) {
    return { status: "available", lowestRemainingPercentage: lowestPct, nextResetAt: nextReset };
  }
  return { status: "unknown", lowestRemainingPercentage: null, nextResetAt: null };
}

function computeRateLimitHealth(rateLimit: RateLimitStatus): RateLimitHealth {
  if (!rateLimit.effectiveState) {
    return { status: "disabled", cooldownUntil: null, queuedRequests: 0 };
  }
  if (rateLimit.current.cooldownUntil) {
    return {
      status: "cooldown",
      cooldownUntil: rateLimit.current.cooldownUntil,
      queuedRequests: rateLimit.current.queued,
    };
  }
  if (rateLimit.current.queued > 50) {
    // Arbitrary threshold
    return { status: "queue_full", cooldownUntil: null, queuedRequests: rateLimit.current.queued };
  }
  if (rateLimit.current.running > 0 || rateLimit.current.queued > 0) {
    return { status: "throttling", cooldownUntil: null, queuedRequests: rateLimit.current.queued };
  }
  return { status: "ok", cooldownUntil: null, queuedRequests: 0 };
}

function computeUpstreamHealth(connection: ProviderConnectionLike): UpstreamHealth {
  if (!connection.lastError) {
    return { status: "unknown", lastErrorCode: null, lastErrorAt: null };
  }
  const code = Number(connection.errorCode);
  if (code >= 500) {
    return { status: "down", lastErrorCode: code, lastErrorAt: connection.lastErrorAt ?? null };
  }
  if (code === 429) {
    return { status: "degraded", lastErrorCode: code, lastErrorAt: connection.lastErrorAt ?? null };
  }
  return { status: "ok", lastErrorCode: code, lastErrorAt: connection.lastErrorAt ?? null };
}

/**
 * Resolve effective proxy for a connection with full source chain
 */
export async function resolveEffectiveProxy(
  connectionId: string
): Promise<{ proxy: EffectiveProxy | null; policy: ProxyPolicy; sourceChain: string }> {
  const proxyInfo = await resolveProxyForConnection(connectionId);

  // Get assignment to determine source
  const assignments = await getProxyAssignments({ scope: "account", scopeId: connectionId });
  const individualAssignment = assignments.find(
    (a) => a.scope === "account" && a.scope_id === connectionId
  );

  let proxy: EffectiveProxy | null = null;
  let source: EffectiveProxy["source"] = "direct";
  let sourceChain = "Direct connection (no proxy assigned)";

  if (individualAssignment?.proxy) {
    // Individual assignment takes priority
    source = "individual";
    proxy = await mapProxyToEffective(individualAssignment.proxy, "individual");
    sourceChain = `Individual assignment → ${individualAssignment.proxy.name}`;
  } else if (proxyInfo?.proxy) {
    // Fall back to resolved proxy (provider/global/combo level)
    source = proxyInfo.level as ProxySource;
    proxy = await mapProxyToEffective(proxyInfo.proxy, source);
    sourceChain = buildSourceChain(proxyInfo.level, proxyInfo);
  }

  const policy: ProxyPolicy = {
    mode: individualAssignment ? "individual" : "inherit",
    failClosed: false, // Would need to read from connection settings
    failoverProxyIds: [],
    directFallbackAllowed: true,
  };

  return { proxy, policy, sourceChain };
}

async function mapProxyToEffective(
  proxy: {
    id: string;
    name: string;
    type: string;
    host: string;
    port: number;
    region: string | null;
    username?: string;
    password?: string;
  },
  source: ProxySource
): Promise<EffectiveProxy> {
  const maskedAddress = buildMaskedAddress(proxy);
  const protocol = proxy.type as "http" | "https" | "socks5";

  return {
    proxyId: proxy.id,
    name: proxy.name,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    region: proxy.region,
    maskedAddress,
    protocol,
    source,
    lastCheckAt: null, // Would come from proxy health check
    checkStatus: "unknown",
    egressIp: null,
    egressIpCheckedAt: null,
    geoLocation: null,
  };
}

function buildMaskedAddress(proxy: {
  host: string;
  port: number;
  type: string;
  username?: string;
  password?: string;
}): string {
  const protocol = `${proxy.type}:`;
  const auth = proxy.username ? `${maskString(proxy.username)}:***@` : "";
  return `${protocol}//${auth}${proxy.host}:${proxy.port}`;
}

function maskString(str: string): string {
  if (str.length <= 4) return "***";
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

function buildSourceChain(level: string, proxyInfo: { proxy: { name: string } }): string {
  const levelLabels: Record<string, string> = {
    global: "Global proxy",
    provider: "Provider-level proxy",
    combo: "Combo-level proxy",
    account: "Account-level proxy",
  };
  return `${levelLabels[level] || level} → ${proxyInfo.proxy.name}`;
}

/**
 * Convert providerLimitsCache quota entries to QuotaWindow[]
 */
export function mapQuotasToWindows(
  providerId: string,
  cache: ReturnType<typeof getProviderLimitsCache>
): QuotaWindow[] {
  if (!cache?.quotas) return [];

  const windows: QuotaWindow[] = [];

  for (const [key, quota] of Object.entries(cache.quotas)) {
    if (!quota || typeof quota !== "object") continue;
    const q = quota as Record<string, unknown>;

    const used = typeof q.used === "number" ? q.used : null;
    const total = typeof q.total === "number" ? q.total : null;
    const remaining = typeof q.remaining === "number" ? q.remaining : null;
    const remainingPercentage =
      typeof q.remainingPercentage === "number" ? q.remainingPercentage : null;
    const unlimited = q.unlimited === true;
    const isCredits = q.isCredits === true || q.isResetCredits === true;
    const creditCount =
      typeof q.creditCount === "number"
        ? q.creditCount
        : typeof q.remaining === "number"
          ? q.remaining
          : null;
    const resetAt = typeof q.resetAt === "string" ? q.resetAt : null;
    const staleAfterReset = q.staleAfterReset === true;
    const displayName = typeof q.displayName === "string" ? q.displayName : key;

    windows.push({
      name: key,
      displayName,
      used,
      total,
      remaining,
      remainingPercentage,
      unlimited,
      resetAt,
      isCredits,
      creditCount,
      staleAfterReset,
    });
  }

  // Sort: canonical windows first (5h, 7d, monthly), then per-model
  return windows.sort((a, b) => {
    const rank = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes("5h") || n.includes("session")) return 1;
      if (n.includes("7d") || n.includes("week")) return 2;
      if (n.includes("month")) return 3;
      return 4;
    };
    return rank(a.name) - rank(b.name);
  });
}

/**
 * Build rate limit status from rateLimitManager + connection settings
 */
export function buildRateLimitStatus(connection: ProviderConnectionLike): RateLimitStatus {
  const rlStatus = getRateLimitStatus(connection.provider, connection.id);
  const individuallyEnabled = connection.rateLimitProtection === true;
  const autoProtected = connection.rateLimitAutoProtected === true;

  let configuredMode: RateLimitMode = "inherit";
  if (individuallyEnabled) configuredMode = "enabled";
  // Note: There's no explicit "disabled" mode stored per-connection currently

  const effectiveState = rlStatus.enabled;
  let source: RateLimitSource = "global";
  let autoReason: string | null = null;

  if (individuallyEnabled) {
    source = "individual";
  } else if (autoProtected) {
    source = "auto";
    autoReason = "Automatic protection for API Key connection";
  }

  const overrides = connection.rateLimitOverrides as RateLimitOverrides | undefined;

  return {
    configuredMode,
    effectiveState,
    source,
    autoReason,
    overrides: overrides ?? null,
    current: {
      queued: rlStatus.queued,
      running: rlStatus.running,
      avgWaitMs: 0, // Would need to track separately
      errors429: 0, // Would need to track separately
      cooldownUntil: connection.rateLimitedUntil ?? null,
      cooldownReason:
        connection.lastErrorType === "upstream_rate_limited" ? "Upstream rate limit" : null,
    },
  };
}

/**
 * Compute routing participation for an account
 */
export async function computeRoutingParticipation(
  connection: ProviderConnectionLike
): Promise<RoutingParticipation> {
  const combos = await getCombos({ provider: connection.provider });
  const providerCombos = combos.filter((c) =>
    c.targets?.some((t: any) => t.connectionId === connection.id)
  );
  const comboNames = providerCombos.map((c) => c.name);

  // Determine effective strategy
  let effectiveStrategy = "priority";
  let strategySource: StrategySource = "global";

  if (providerCombos.length > 0) {
    // Use first combo's strategy (simplified)
    effectiveStrategy = providerCombos[0].strategy || "priority";
    strategySource = "combo";
  } else {
    // Check provider-level override
    const settings = await getSettings();
    const providerStrategy = settings[`routing_strategy_${connection.provider}`];
    if (providerStrategy) {
      effectiveStrategy = providerStrategy;
      strategySource = "provider";
    } else {
      const globalStrategy = settings.routing_strategy_global;
      if (globalStrategy) {
        effectiveStrategy = globalStrategy;
        strategySource = "global";
      }
    }
  }

  // Check if account is in fallback pool (accountFallback.ts logic)
  const availableInPool =
    connection.isActive !== false &&
    !["banned", "credits_exhausted", "expired", "deactivated"].includes(
      connection.testStatus || ""
    ) &&
    !connection.rateLimitedUntil;

  // Mock metrics - would come from usage analytics
  const requestsLast24h = 0;
  const successRate = 100;
  const currentLoad: RoutingParticipation["currentLoad"] = "idle";

  return {
    participatesInCombo: providerCombos.length > 0,
    comboNames,
    effectiveStrategy,
    strategySource,
    stickyLimit: null, // Would need to read from combo/strategy config
    priority: connection.priority ?? 0,
    globalPriority: connection.globalPriority ?? null,
    maxConcurrent: connection.maxConcurrent ?? null,
    availableInPool,
    requestsLast24h,
    successRate,
    currentLoad,
  };
}

/**
 * Main aggregation function — builds AccountOverview from connection
 */
export async function buildAccountOverview(
  connection: ProviderConnectionLike
): Promise<AccountOverview> {
  // 1. Resolve effective proxy
  const { proxy: effectiveProxy, policy: proxyPolicy } = await resolveEffectiveProxy(
    connection.id!
  );

  // 2. Get quota cache
  const quotaCache = getProviderLimitsCache(connection.id!);
  const quotas = mapQuotasToWindows(connection.provider, quotaCache);
  const quotaSource = quotaCache ? (quotaCache.message ? "stale" : "cache") : "live";
  const quotaFetchedAt = quotaCache?.fetchedAt ?? null;

  // 3. Get rate limit status
  const rateLimit = buildRateLimitStatus(connection);

  // 4. Compute routing participation
  const routing = await computeRoutingParticipation(connection);

  // 5. Build lastError info
  const lastError: LastErrorInfo | null = connection.lastError
    ? {
        code: connection.errorCode ?? 0,
        message: connection.lastError,
        type: connection.lastErrorType ?? "unknown",
        source: connection.lastErrorSource ?? "unknown",
        at: connection.lastErrorAt ?? new Date().toISOString(),
      }
    : null;

  // 6. Compute health status
  const { status: healthStatus, details: healthDetails } = computeHealthStatus(
    connection,
    effectiveProxy,
    proxyPolicy,
    quotas,
    rateLimit,
    lastError
  );

  // 7. Determine routing eligibility
  const routingEligible = healthStatus === "working" && routing.availableInPool;
  const routingExclusionReasons: string[] = [];
  if (healthStatus !== "working") routingExclusionReasons.push(`Health: ${healthStatus}`);
  if (!routing.availableInPool) routingExclusionReasons.push("Not available in routing pool");

  // 8. Compute data revision (simple hash of key fields)
  const revisionFields = [
    connection.updatedAt,
    connection.testStatus,
    connection.rateLimitedUntil,
    connection.lastError,
    quotaFetchedAt,
    effectiveProxy?.proxyId,
    connection.rateLimitProtection,
  ]
    .filter(Boolean)
    .join("|");
  const dataRevision = simpleHash(revisionFields);

  return {
    connectionId: connection.id!,
    providerId: connection.provider!,
    displayName: connection.displayName || connection.name || connection.email || connection.id!,
    authType: (connection.authType as AuthType) || "apikey",
    enabled: connection.isActive ?? true,
    healthStatus,
    healthDetails,
    routingEligible,
    routingExclusionReasons,
    effectiveProxy,
    proxyPolicy,
    quotas,
    quotaSource,
    quotaFetchedAt,
    rateLimit,
    routing,
    lastSuccessAt: connection.lastTested ?? null,
    lastError,
    diagnosticsAt: null, // Would need new column
    dataRevision,
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
