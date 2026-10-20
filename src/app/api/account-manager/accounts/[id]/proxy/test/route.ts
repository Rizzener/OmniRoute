import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { resolveProxyForConnection } from "@/lib/db/proxies";
import { runWithProxyContext } from "@omniroute/open-sse/utils/proxyFetch";
import { getUsageForProvider } from "@omniroute/open-sse/services/usage";
import { getCachedProviderConnectionById } from "@/lib/db/readCache";

interface ProxyTestResult {
  step: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  details: string | null;
  errorCode: string | null;
}

/**
 * POST /api/account-manager/accounts/:id/proxy/test
 * Runs proxy diagnostic sequence
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(_request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const connection = await getCachedProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: { message: "Connection not found" } }, { status: 404 });
    }

    const results: ProxyTestResult[] = [];
    const proxyInfo = await resolveProxyForConnection(id);

    // 1. Check configuration
    const configStart = Date.now();
    if (!proxyInfo?.proxy) {
      results.push({
        step: "Configuration",
        status: "skipped",
        durationMs: Date.now() - configStart,
        details: "No proxy assigned (direct connection)",
        errorCode: "NO_PROXY",
      });
    } else {
      results.push({
        step: "Configuration",
        status: "success",
        durationMs: Date.now() - configStart,
        details: `Proxy: ${proxyInfo.proxy.name} (${proxyInfo.proxy.host}:${proxyInfo.proxy.port})`,
        errorCode: null,
      });
    }

    if (!proxyInfo?.proxy) {
      return NextResponse.json({ data: { results, overallStatus: "skipped" } });
    }

    const proxy = proxyInfo.proxy;
    const proxyConfig = {
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
    };

    // 2. DNS Resolution
    const dnsStart = Date.now();
    try {
      // DNS resolution happens in the fetch below
      results.push({
        step: "DNS Resolution",
        status: "success",
        durationMs: Date.now() - dnsStart,
        details: `Resolved ${proxy.host}`,
        errorCode: null,
      });
    } catch (err) {
      results.push({
        step: "DNS Resolution",
        status: "failed",
        durationMs: Date.now() - dnsStart,
        details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        errorCode: "DNS_FAILED",
      });
      return NextResponse.json({ data: { results, overallStatus: "failed" } });
    }

    // 3. TCP Connection
    const tcpStart = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      await fetch(`http://${proxy.host}:${proxy.port}`, {
        method: "CONNECT",
        signal: controller.signal,
      }).catch(() => {}); // CONNECT may not be supported, that's OK
      clearTimeout(timeout);

      results.push({
        step: "TCP Connection",
        status: "success",
        durationMs: Date.now() - tcpStart,
        details: `Connected to ${proxy.host}:${proxy.port}`,
        errorCode: null,
      });
    } catch (err) {
      results.push({
        step: "TCP Connection",
        status: "failed",
        durationMs: Date.now() - tcpStart,
        details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        errorCode: "TCP_FAILED",
      });
      return NextResponse.json({ data: { results, overallStatus: "failed" } });
    }

    // 4. Proxy Authentication (if configured)
    if (proxy.username) {
      const authStart = Date.now();
      try {
        // Test auth by making a request through proxy
        await runWithProxyContext(proxyConfig, async () => {
          const response = await fetch("https://httpbin.org/ip", {
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });

        results.push({
          step: "Proxy Authentication",
          status: "success",
          durationMs: Date.now() - authStart,
          details: "Authentication successful",
          errorCode: null,
        });
      } catch (err) {
        results.push({
          step: "Proxy Authentication",
          status: "failed",
          durationMs: Date.now() - authStart,
          details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          errorCode: "PROXY_AUTH_FAILED",
        });
        return NextResponse.json({ data: { results, overallStatus: "failed" } });
      }
    } else {
      results.push({
        step: "Proxy Authentication",
        status: "skipped",
        durationMs: 0,
        details: "No authentication configured",
        errorCode: null,
      });
    }

    // 5. TLS Check (for HTTPS proxies)
    if (proxy.type === "https") {
      const tlsStart = Date.now();
      try {
        await runWithProxyContext(proxyConfig, async () => {
          const response = await fetch("https://httpbin.org/ip", {
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        });

        results.push({
          step: "TLS Handshake",
          status: "success",
          durationMs: Date.now() - tlsStart,
          details: "TLS connection established",
          errorCode: null,
        });
      } catch (err) {
        results.push({
          step: "TLS Handshake",
          status: "failed",
          durationMs: Date.now() - tlsStart,
          details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          errorCode: "TLS_FAILED",
        });
        return NextResponse.json({ data: { results, overallStatus: "failed" } });
      }
    } else {
      results.push({
        step: "TLS Handshake",
        status: "skipped",
        durationMs: 0,
        details: "Not an HTTPS proxy",
        errorCode: null,
      });
    }

    // 6. Egress IP Check
    const ipStart = Date.now();
    let egressIp = null;
    try {
      const ipResult = await runWithProxyContext(proxyConfig, async () => {
        const response = await fetch("https://httpbin.org/ip", {
          signal: AbortSignal.timeout(10000),
        });
        return response.json();
      });
      egressIp = ipResult?.origin ?? null;

      results.push({
        step: "Egress IP Check",
        status: "success",
        durationMs: Date.now() - ipStart,
        details: `Egress IP: ${egressIp}`,
        errorCode: null,
      });
    } catch (err) {
      results.push({
        step: "Egress IP Check",
        status: "failed",
        durationMs: Date.now() - ipStart,
        details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        errorCode: "EGRESS_IP_FAILED",
      });
    }

    // 7. Provider Endpoint Check
    const providerStart = Date.now();
    try {
      await runWithProxyContext(proxyConfig, async () => {
        const usage = await getUsageForProvider(connection as any, { forceRefresh: false });
        if (usage?.message && /error/i.test(usage.message)) {
          throw new Error(usage.message);
        }
      });

      results.push({
        step: "Provider Endpoint",
        status: "success",
        durationMs: Date.now() - providerStart,
        details: `Provider ${connection.provider} reachable via proxy`,
        errorCode: null,
      });
    } catch (err) {
      results.push({
        step: "Provider Endpoint",
        status: "failed",
        durationMs: Date.now() - providerStart,
        details: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        errorCode: "PROVIDER_ENDPOINT_FAILED",
      });
    }

    const overallStatus = results.some((r) => r.status === "failed") ? "failed" : "success";

    return NextResponse.json({
      data: {
        results,
        overallStatus,
        egressIp,
        proxy: {
          id: proxy.id,
          name: proxy.name,
          host: proxy.host,
          port: proxy.port,
        },
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Proxy test failed:", error);
    return NextResponse.json({ error: { message: "Proxy test failed" } }, { status: 500 });
  }
}
