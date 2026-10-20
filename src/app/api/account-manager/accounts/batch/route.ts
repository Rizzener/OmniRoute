import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { validateBody } from "@/shared/validation/helpers";
import { z } from "zod";
import { getCachedProviderConnectionById } from "@/lib/db/readCache";
import { updateProviderConnection } from "@/lib/db/providers";
import { assignProxyToScope } from "@/lib/db/proxies";
import {
  enableRateLimitProtection,
  disableRateLimitProtection,
} from "@omniroute/open-sse/services/rateLimitManager";
import { fetchAndPersistProviderLimits } from "@/lib/usage/providerLimits";
import { runAccountDiagnostics } from "@/lib/accountManager";
import { recordBulkOperation } from "@/lib/accountManager";
import { invalidateDbCache } from "@/lib/db/readCache";

const BulkSchema = z.object({
  connectionIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum([
    "activate",
    "deactivate",
    "assign_proxy",
    "unassign_proxy",
    "set_rate_limit_mode",
    "refresh_quotas",
    "run_diagnostics",
  ]),
  params: z.record(z.unknown()),
});

/**
 * POST /api/account-manager/accounts/batch
 * Performs bulk operations on multiple accounts
 */
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validation = validateBody(BulkSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: { message: "Invalid request", details: validation.error.errors } },
        { status: 400 }
      );
    }

    const { connectionIds, action, params } = validation.data;
    const results: Array<{ connectionId: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const connectionId of connectionIds) {
      try {
        const connection = await getCachedProviderConnectionById(connectionId);
        if (!connection) {
          throw new Error("Connection not found");
        }

        switch (action) {
          case "activate":
            await updateProviderConnection(connectionId, { isActive: true });
            break;

          case "deactivate":
            await updateProviderConnection(connectionId, { isActive: false });
            break;

          case "assign_proxy": {
            const proxyId = params.proxyId as string | null;
            if (!proxyId) throw new Error("proxyId required");
            await assignProxyToScope("account", connectionId, proxyId);
            break;
          }

          case "unassign_proxy":
            await assignProxyToScope("account", connectionId, null);
            break;

          case "set_rate_limit_mode": {
            const mode = params.mode as "enabled" | "disabled" | "inherit";
            if (mode === "enabled") {
              await enableRateLimitProtection(connectionId);
            } else if (mode === "disabled") {
              await disableRateLimitProtection(connectionId);
            }
            // "inherit" = remove individual setting, would need DB update
            break;
          }

          case "refresh_quotas":
            await fetchAndPersistProviderLimits(connectionId, "manual", {
              allowRotatingRefresh: true,
            });
            break;

          case "run_diagnostics": {
            const mode = (params.mode as "quick" | "full" | "ai-test") || "quick";
            await runAccountDiagnostics(connectionId, mode);
            break;
          }
        }

        invalidateDbCache("connections", connectionId);
        results.push({ connectionId, success: true });
        successCount++;
      } catch (err) {
        results.push({
          connectionId,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        errorCount++;
      }
    }

    // Record bulk operation event for each connection
    await Promise.all(
      connectionIds.map((id) =>
        recordBulkOperation(id, action, connectionIds.length, successCount, errorCount)
      )
    );

    return NextResponse.json({
      data: {
        results,
        summary: {
          total: connectionIds.length,
          succeeded: successCount,
          failed: errorCount,
        },
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Bulk operation failed:", error);
    return NextResponse.json({ error: { message: "Bulk operation failed" } }, { status: 500 });
  }
}
