import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCachedProviderConnectionById } from "@/lib/db/readCache";
import { buildAccountOverview } from "@/lib/accountManager";

/**
 * GET /api/account-manager/accounts/:id
 * Returns full AccountOverview for a single connection
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

    const overview = await buildAccountOverview(connection as any);

    return NextResponse.json({
      data: overview,
      meta: { revision: overview.dataRevision },
    });
  } catch (error) {
    console.error("[AccountManager API] Error fetching account:", error);
    return NextResponse.json({ error: { message: "Failed to fetch account" } }, { status: 500 });
  }
}
