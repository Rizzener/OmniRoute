import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getAccountEvents, getEventCategoryCounts } from "@/lib/accountManager";

/**
 * GET /api/account-manager/accounts/:id/events
 * Returns paginated account events/history
 * Query params: limit, offset, category, fromDate, toDate
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const category = searchParams.get("category") || undefined;
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;

    const [eventsResult, categoryCounts] = await Promise.all([
      getAccountEvents(id, { limit, offset, category, fromDate, toDate }),
      getEventCategoryCounts(id),
    ]);

    return NextResponse.json({
      data: eventsResult.events,
      meta: {
        total: eventsResult.total,
        limit,
        offset,
        categoryCounts,
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Events fetch failed:", error);
    return NextResponse.json({ error: { message: "Failed to fetch events" } }, { status: 500 });
  }
}
