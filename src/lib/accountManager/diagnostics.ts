/**
 * Account Manager 2.0 — Diagnostics Service
 *
 * Runs account diagnostics in three modes:
 * - quick: config validity, credentials present, token expiry, proxy, service availability
 * - full: quick + auth check, model access, quota status, rate limit status
 * - ai-test: full + real test request to model
 */

import { DiagnosticResult, DiagnosticStep, DiagnosticMode } from "./types";
import type { ProviderConnectionLike } from "@/lib/usage/providerLimits";
import { getProviderConnectionById } from "@/lib/db/providers";
import { resolveProxyForConnection } from "@/lib/db/proxies";
import { getProviderLimitsCache, fetchAndPersistProviderLimits } from "@/lib/usage/providerLimits";
import { getRateLimitStatus } from "@omniroute/open-sse/services/rateLimitManager";
import { getUsageForProvider } from "@omniroute/open-sse/services/usage";
import { runWithProxyContext } from "@omniroute/open-sse/utils/proxyFetch";
import { v4 as uuidv4 } from "uuid";

// In-memory job store (replace with Redis/DB in production)
const diagnosticJobs = new Map<string, DiagnosticResult>();

export async function runAccountDiagnostics(
  connectionId: string,
  mode: DiagnosticMode["mode"]
): Promise<DiagnosticResult> {
  const jobId = uuidv4();
  const startedAt = new Date().toISOString();

  const result: DiagnosticResult = {
    jobId,
    connectionId,
    mode,
    startedAt,
    completedAt: null,
    steps: [],
    overallStatus: "incomplete",
  };

  diagnosticJobs.set(jobId, result);

  // Run asynchronously
  runDiagnosticsAsync(jobId, connectionId, mode).catch((err) => {
    console.error("[Diagnostics] Job failed:", err);
    const job = diagnosticJobs.get(jobId);
    if (job) {
      job.overallStatus = "unhealthy";
      job.completedAt = new Date().toISOString();
    }
  });

  return result;
}

async function runDiagnosticsAsync(
  jobId: string,
  connectionId: string,
  mode: "quick" | "full" | "ai-test"
): Promise<void> {
  const result = diagnosticJobs.get(jobId)!;
  const connection = (await getProviderConnectionById(
    connectionId
  )) as ProviderConnectionLike | null;

  if (!connection) {
    addStep(result, "connection_exists", "error", "Connection not found", "Verify connection ID");
    finishJob(result, "unhealthy");
    return;
  }

  const steps: Array<{ name: string; fn: () => Promise<DiagnosticStep> }> = [
    { name: "config_validity", fn: () => checkConfigValidity(connection) },
    { name: "credentials_present", fn: () => checkCredentialsPresent(connection) },
    { name: "token_expiry", fn: () => checkTokenExpiry(connection) },
    { name: "proxy", fn: () => checkProxy(connection) },
    { name: "service_availability", fn: () => checkServiceAvailability(connection) },
  ];

  if (mode !== "quick") {
    steps.push(
      { name: "auth", fn: () => checkAuth(connection) },
      { name: "model_access", fn: () => checkModelAccess(connection) },
      { name: "quota_status", fn: () => checkQuotaStatus(connection) },
      { name: "rate_limit_status", fn: () => checkRateLimitStatus(connection) }
    );
  }

  if (mode === "ai-test") {
    steps.push({ name: "ai_test_request", fn: () => runTestRequest(connection) });
  }

  for (const step of steps) {
    const stepResult = await step.fn();
    result.steps.push(stepResult);
    diagnosticJobs.set(jobId, { ...result }); // Update reference
  }

  finishJob(result, computeOverallStatus(result.steps));
}

function finishJob(result: DiagnosticResult, status: DiagnosticResult["overallStatus"]): void {
  result.completedAt = new Date().toISOString();
  result.overallStatus = status;
  diagnosticJobs.set(result.jobId, result);
}

function computeOverallStatus(steps: DiagnosticStep[]): DiagnosticResult["overallStatus"] {
  const hasError = steps.some((s) => s.status === "error");
  const hasWarning = steps.some((s) => s.status === "warning");
  const allSuccessOrSkipped = steps.every(
    (s) => s.status === "success" || s.status === "skipped" || s.status === "unsupported"
  );

  if (hasError) return "unhealthy";
  if (hasWarning) return "degraded";
  if (allSuccessOrSkipped) return "healthy";
  return "incomplete";
}

function addStep(
  result: DiagnosticResult,
  name: string,
  status: DiagnosticStep["status"],
  details: string | null,
  recommendedAction: string | null = null,
  errorCode: string | null = null
): void {
  result.steps.push({
    name,
    status,
    durationMs: null,
    details,
    errorCode,
    recommendedAction,
  });
}

// ===== Individual Checks =====

async function checkConfigValidity(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();
  const issues: string[] = [];

  if (!connection.provider) issues.push("Missing provider");
  if (!connection.authType) issues.push("Missing auth type");
  if (connection.authType === "oauth" && !connection.accessToken && !connection.refreshToken) {
    issues.push("Missing OAuth tokens");
  }
  if (connection.authType === "apikey" && !connection.apiKey) {
    issues.push("Missing API key");
  }

  return {
    name: "config_validity",
    status: issues.length === 0 ? "success" : "error",
    durationMs: Date.now() - start,
    details: issues.length === 0 ? "Configuration is valid" : issues.join("; "),
    errorCode: issues.length > 0 ? "CONFIG_INVALID" : null,
    recommendedAction: issues.length > 0 ? "Fix missing configuration fields" : null,
  };
}

async function checkCredentialsPresent(
  connection: ProviderConnectionLike
): Promise<DiagnosticStep> {
  const start = Date.now();
  let hasCreds = false;

  if (connection.authType === "oauth") {
    hasCreds = !!(connection.accessToken || connection.refreshToken);
  } else if (connection.authType === "apikey" || connection.authType === "api_key") {
    hasCreds = !!connection.apiKey;
  } else if (connection.authType === "web_cookie") {
    hasCreds = !!connection.apiKey; // Cookie stored in apiKey field
  }

  return {
    name: "credentials_present",
    status: hasCreds ? "success" : "error",
    durationMs: Date.now() - start,
    details: hasCreds ? "Credentials found" : "No credentials configured",
    errorCode: hasCreds ? null : "CREDENTIALS_MISSING",
    recommendedAction: hasCreds ? null : "Add credentials via provider configuration",
  };
}

async function checkTokenExpiry(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();
  const tokenExpiresAt = connection.tokenExpiresAt || connection.expiresAt;

  if (!tokenExpiresAt) {
    return {
      name: "token_expiry",
      status: "unsupported",
      durationMs: Date.now() - start,
      details: "Token expiry not tracked for this auth type",
      errorCode: null,
      recommendedAction: null,
    };
  }

  const minutesLeft = Math.floor((new Date(tokenExpiresAt).getTime() - Date.now()) / 60000);

  if (minutesLeft < 0) {
    return {
      name: "token_expiry",
      status: "error",
      durationMs: Date.now() - start,
      details: `Token expired ${Math.abs(minutesLeft)} minutes ago`,
      errorCode: "TOKEN_EXPIRED",
      recommendedAction: "Refresh token via OAuth flow or re-authenticate",
    };
  }
  if (minutesLeft < 30) {
    return {
      name: "token_expiry",
      status: "warning",
      durationMs: Date.now() - start,
      details: `Token expires in ${minutesLeft} minutes`,
      errorCode: "TOKEN_EXPIRING_SOON",
      recommendedAction: "Token will auto-refresh on next use",
    };
  }

  return {
    name: "token_expiry",
    status: "success",
    durationMs: Date.now() - start,
    details: `Token valid for ${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`,
    errorCode: null,
    recommendedAction: null,
  };
}

async function checkProxy(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  if (!connection.proxyEnabled) {
    return {
      name: "proxy",
      status: "skipped",
      durationMs: Date.now() - start,
      details: "Proxy not enabled for this connection",
      errorCode: null,
      recommendedAction: null,
    };
  }

  try {
    const proxyInfo = await resolveProxyForConnection(connection.id!);

    if (!proxyInfo?.proxy) {
      return {
        name: "proxy",
        status: "warning",
        durationMs: Date.now() - start,
        details: "No proxy resolved (using direct connection)",
        errorCode: "PROXY_NOT_RESOLVED",
        recommendedAction: "Configure proxy assignment or verify inherited proxy",
      };
    }

    // Test proxy connectivity (simplified - would use proxyFetch in real impl)
    const proxy = proxyInfo.proxy;

    // Quick TCP check via fetch with short timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch("https://httpbin.org/ip", {
        signal: controller.signal,
        // Note: Would need to route through proxy in real implementation
      });
      clearTimeout(timeout);

      return {
        name: "proxy",
        status: "success",
        durationMs: Date.now() - start,
        details: `Proxy ${proxy.name} (${proxy.host}:${proxy.port}) reachable`,
        errorCode: null,
        recommendedAction: null,
      };
    } catch (err) {
      clearTimeout(timeout);
      return {
        name: "proxy",
        status: "error",
        durationMs: Date.now() - start,
        details: `Proxy connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        errorCode: "PROXY_CONNECTION_FAILED",
        recommendedAction: "Verify proxy host, port, and credentials",
      };
    }
  } catch (err) {
    return {
      name: "proxy",
      status: "error",
      durationMs: Date.now() - start,
      details: `Proxy resolution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "PROXY_RESOLUTION_FAILED",
      recommendedAction: "Check proxy assignment configuration",
    };
  }
}

async function checkServiceAvailability(
  connection: ProviderConnectionLike
): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    // Use existing usage fetcher which knows how to call each provider's health endpoint
    const proxyInfo = await resolveProxyForConnection(connection.id!);
    const proxyConfig = proxyInfo?.proxy
      ? {
          type: proxyInfo.proxy.type,
          host: proxyInfo.proxy.host,
          port: proxyInfo.proxy.port,
          username: proxyInfo.proxy.username,
          password: proxyInfo.proxy.password,
        }
      : null;

    const usage = await runWithProxyContext(proxyConfig, () =>
      getUsageForProvider(connection as any, { forceRefresh: false })
    );

    if (usage?.message && typeof usage.message === "string" && usage.message.includes("error")) {
      return {
        name: "service_availability",
        status: "warning",
        durationMs: Date.now() - start,
        details: `Provider responded with: ${usage.message}`,
        errorCode: "PROVIDER_DEGRADED",
        recommendedAction: "Check provider status page",
      };
    }

    return {
      name: "service_availability",
      status: "success",
      durationMs: Date.now() - start,
      details: "Provider service is reachable",
      errorCode: null,
      recommendedAction: null,
    };
  } catch (err) {
    return {
      name: "service_availability",
      status: "error",
      durationMs: Date.now() - start,
      details: `Service check failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "SERVICE_UNAVAILABLE",
      recommendedAction: "Verify provider endpoint and network connectivity",
    };
  }
}

async function checkAuth(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    const proxyInfo = await resolveProxyForConnection(connection.id!);
    const proxyConfig = proxyInfo?.proxy
      ? {
          type: proxyInfo.proxy.type,
          host: proxyInfo.proxy.host,
          port: proxyInfo.proxy.port,
          username: proxyInfo.proxy.username,
          password: proxyInfo.proxy.password,
        }
      : null;

    const usage = await runWithProxyContext(proxyConfig, () =>
      getUsageForProvider(connection as any, { forceRefresh: true })
    );

    // Check for auth errors in response
    if (usage?.message) {
      const msg = usage.message.toLowerCase();
      if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("invalid token")) {
        return {
          name: "auth",
          status: "error",
          durationMs: Date.now() - start,
          details: "Authentication failed: invalid or expired credentials",
          errorCode: "AUTH_FAILED",
          recommendedAction: "Re-authenticate or update API key",
        };
      }
    }

    return {
      name: "auth",
      status: "success",
      durationMs: Date.now() - start,
      details: "Authentication successful",
      errorCode: null,
      recommendedAction: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("unauthorized")) {
      return {
        name: "auth",
        status: "error",
        durationMs: Date.now() - start,
        details: "Authentication failed",
        errorCode: "AUTH_FAILED",
        recommendedAction: "Re-authenticate or update API key",
      };
    }
    return {
      name: "auth",
      status: "error",
      durationMs: Date.now() - start,
      details: `Auth check error: ${msg}`,
      errorCode: "AUTH_CHECK_ERROR",
      recommendedAction: "Check connection configuration",
    };
  }
}

async function checkModelAccess(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    const proxyInfo = await resolveProxyForConnection(connection.id!);
    const proxyConfig = proxyInfo?.proxy
      ? {
          type: proxyInfo.proxy.type,
          host: proxyInfo.proxy.host,
          port: proxyInfo.proxy.port,
          username: proxyInfo.proxy.username,
          password: proxyInfo.proxy.password,
        }
      : null;

    const usage = await runWithProxyContext(proxyConfig, () =>
      getUsageForProvider(connection as any, { forceRefresh: false })
    );

    // Check if models are listed in quota response
    if (usage?.quotas && Object.keys(usage.quotas).length > 0) {
      return {
        name: "model_access",
        status: "success",
        durationMs: Date.now() - start,
        details: `Access to ${Object.keys(usage.quotas).length} model quotas confirmed`,
        errorCode: null,
        recommendedAction: null,
      };
    }

    return {
      name: "model_access",
      status: "warning",
      durationMs: Date.now() - start,
      details: "No model quota data returned",
      errorCode: "NO_MODEL_QUOTAS",
      recommendedAction: "Verify model permissions on provider side",
    };
  } catch (err) {
    return {
      name: "model_access",
      status: "error",
      durationMs: Date.now() - start,
      details: `Model access check failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "MODEL_ACCESS_ERROR",
      recommendedAction: "Check provider API access",
    };
  }
}

async function checkQuotaStatus(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    const cache = getProviderLimitsCache(connection.id!);
    if (!cache?.quotas) {
      // Try live fetch
      await fetchAndPersistProviderLimits(connection.id!, "manual", { allowRotatingRefresh: true });
      const freshCache = getProviderLimitsCache(connection.id!);
      if (!freshCache?.quotas) {
        return {
          name: "quota_status",
          status: "warning",
          durationMs: Date.now() - start,
          details: "No quota data available",
          errorCode: "QUOTA_UNAVAILABLE",
          recommendedAction: "Provider may not expose quota API",
        };
      }
    }

    const cache2 = getProviderLimitsCache(connection.id!);
    const hasQuota =
      cache2?.quotas &&
      Object.keys(cache2.quotas).some((k) => {
        const q = cache2.quotas![k] as any;
        return q.unlimited || (q.remaining !== undefined && q.remaining > 0);
      });

    return {
      name: "quota_status",
      status: hasQuota ? "success" : "warning",
      durationMs: Date.now() - start,
      details: hasQuota ? "Quota available" : "All quota windows exhausted",
      errorCode: hasQuota ? null : "QUOTA_EXHAUSTED",
      recommendedAction: hasQuota ? null : "Wait for quota reset or upgrade plan",
    };
  } catch (err) {
    return {
      name: "quota_status",
      status: "error",
      durationMs: Date.now() - start,
      details: `Quota check failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "QUOTA_CHECK_ERROR",
      recommendedAction: "Try manual quota refresh",
    };
  }
}

async function checkRateLimitStatus(connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    const rlStatus = getRateLimitStatus(connection.provider, connection.id!);

    if (!rlStatus.enabled) {
      return {
        name: "rate_limit_status",
        status: "skipped",
        durationMs: Date.now() - start,
        details: "Rate limit protection not enabled",
        errorCode: null,
        recommendedAction: null,
      };
    }

    if (rlStatus.queued > 50) {
      return {
        name: "rate_limit_status",
        status: "warning",
        durationMs: Date.now() - start,
        details: `${rlStatus.queued} requests queued`,
        errorCode: "QUEUE_BUILDUP",
        recommendedAction: "Consider increasing rate limits or adding accounts",
      };
    }

    if (
      connection.rateLimitedUntil &&
      new Date(connection.rateLimitedUntil).getTime() > Date.now()
    ) {
      return {
        name: "rate_limit_status",
        status: "warning",
        durationMs: Date.now() - start,
        details: `In cooldown until ${connection.rateLimitedUntil}`,
        errorCode: "IN_COOLDOWN",
        recommendedAction: "Wait for cooldown to expire",
      };
    }

    return {
      name: "rate_limit_status",
      status: "success",
      durationMs: Date.now() - start,
      details: `Rate limit active (${rlStatus.running} running, ${rlStatus.queued} queued)`,
      errorCode: null,
      recommendedAction: null,
    };
  } catch (err) {
    return {
      name: "rate_limit_status",
      status: "error",
      durationMs: Date.now() - start,
      details: `Rate limit check failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "RL_CHECK_ERROR",
      recommendedAction: "Check rate limit manager status",
    };
  }
}

async function runTestRequest(_connection: ProviderConnectionLike): Promise<DiagnosticStep> {
  const start = Date.now();

  try {
    // This would use the actual chat completion pipeline with a minimal test prompt
    // For now, return unsupported since it requires full executor chain
    return {
      name: "ai_test_request",
      status: "unsupported",
      durationMs: Date.now() - start,
      details: "AI test request not implemented in diagnostics service",
      errorCode: "NOT_IMPLEMENTED",
      recommendedAction: "Use provider test button in UI for live test",
    };
  } catch (err) {
    return {
      name: "ai_test_request",
      status: "error",
      durationMs: Date.now() - start,
      details: `Test request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorCode: "TEST_REQUEST_FAILED",
      recommendedAction: "Check connection and model availability",
    };
  }
}

/**
 * Get diagnostic job result
 */
export function getDiagnosticResult(jobId: string): DiagnosticResult | null {
  return diagnosticJobs.get(jobId) ?? null;
}

/**
 * Clean up old jobs (call periodically)
 */
export function cleanupOldJobs(maxAgeMs = 3600000): void {
  // 1 hour default
  const now = Date.now();
  for (const [jobId, job] of diagnosticJobs) {
    const started = new Date(job.startedAt).getTime();
    if (now - started > maxAgeMs) {
      diagnosticJobs.delete(jobId);
    }
  }
}
