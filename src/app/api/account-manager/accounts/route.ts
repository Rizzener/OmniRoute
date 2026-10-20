import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getProviderConnections } from "@/lib/db/providers";
import { buildAccountOverview } from "@/lib/accountManager";
import { getCachedProviderConnections } from "@/lib/db/readCache";
import { compareTr } from "@/shared/utils/turkishText";

/**
 * GET /api/account-manager/accounts
 * Returns aggregated AccountOverview for all connections (optionally filtered by provider)
 * Query params: provider, search, status, page, pageSize
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || undefined;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "0", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 200);

    // Fetch connections (cached)
    const filter: Record<string, unknown> = { isActive: true };
    if (provider) filter.provider = provider;

    const connections = (await getCachedProviderConnections(filter)) as any[];

    // Apply search filter
    let filtered = connections;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = connections.filter(
        (c) =>
          (c.name && compareTr(c.name.toLowerCase(), searchLower) >= 0) ||
          (c.email && compareTr(c.email.toLowerCase(), searchLower) >= 0) ||
          (c.displayName && compareTr(c.displayName.toLowerCase(), searchLower) >= 0) ||
          (c.id && compareTr(c.id.toLowerCase(), searchLower) >= 0)
      );
    }

    // Build overviews for filtered connections
    const overviews = await Promise.all(filtered.map((conn) => buildAccountOverview(conn)));

    // Apply status filter
    if (status && status !== "all") {
      filtered = filtered.filter((_, i) => overviews[i].healthStatus === status);
    }

    // Pagination
    const total = filtered.length;
    const start = page * pageSize;
    const paginatedOverviews = overviews.slice(start, start + pageSize);

    return NextResponse.json({
      data: paginatedOverviews,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Error fetching accounts:", error);
    return NextResponse.json({ error: { message: "Failed to fetch accounts" } }, { status: 500 });
  }
}
