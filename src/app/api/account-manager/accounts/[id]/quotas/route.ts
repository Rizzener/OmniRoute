import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getProviderLimitsCache, fetchAndPersistProviderLimits } from "@/lib/usage/providerLimits";
import { getCachedProviderConnectionById } from "@/lib/db/readCache";
import { mapQuotasToWindows } from "@/lib/accountManager";

/**
 * GET /api/account-manager/accounts/:id/quotas
 * Returns quota windows for an account
 * Query param: refresh=true triggers live fetch
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const shouldRefresh = searchParams.get("refresh") === "true";

    const connection = await getCachedProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: { message: "Connection not found" } }, { status: 404 });
    }

    let cache = getProviderLimitsCache(id);
    let source: "cache" | "live" | "stale" = "cache";

    if (shouldRefresh || !cache) {
      try {
        const result = await fetchAndPersistProviderLimits(id, "manual", {
          allowRotatingRefresh: true,
        });
        cache = result.cache;
        source = cache.message ? "stale" : "live";
      } catch {
        // Keep existing cache on failure
        source = cache ? "stale" : "live";
      }
    } else if (cache?.message) {
      source = "stale";
    }

    const quotas = mapQuotasToWindows(connection.provider as string, cache);

    return NextResponse.json({
      data: {
        quotas,
        source,
        fetchedAt: cache?.fetchedAt ?? null,
        message: cache?.message ?? null,
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Quotas fetch failed:", error);
    return NextResponse.json({ error: { message: "Failed to fetch quotas" } }, { status: 500 });
  }
}
