import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { computeRoutingParticipation } from "@/lib/accountManager";
import { getCachedProviderConnectionById } from "@/lib/db/readCache";

/**
 * GET /api/account-manager/accounts/:id/routing
 * Returns effective routing configuration for an account
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(_request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const connection = await getCachedProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: { message: "Connection not found" } }, { status: 404 });
    }

    const routing = await computeRoutingParticipation(connection as any);

    return NextResponse.json({ data: routing });
  } catch (error) {
    console.error("[AccountManager API] Routing fetch failed:", error);
    return NextResponse.json(
      { error: { message: "Failed to fetch routing configuration" } },
      { status: 500 }
    );
  }
}
