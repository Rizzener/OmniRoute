import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { validateBody } from "@/shared/validation/helpers";
import { z } from "zod";
import { assignProxyToScope, getProxyById } from "@/lib/db/proxies";
import { recordProxyChanged } from "@/lib/accountManager";
import { invalidateDbCache } from "@/lib/db/readCache";

const AssignProxySchema = z.object({
  proxyId: z.string().uuid().nullable(),
  mode: z.enum(["inherit", "individual", "direct", "failover"]).optional(),
  failClosed: z.boolean().optional(),
  failoverProxyIds: z.array(z.string().uuid()).optional(),
  directFallbackAllowed: z.boolean().optional(),
});

/**
 * PUT /api/account-manager/accounts/:id/proxy
 * Assign or change proxy for an account
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(AssignProxySchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: { message: "Invalid request", details: validation.error.errors } },
        { status: 400 }
      );
    }

    const {
      proxyId,
      mode: _mode,
      failClosed: _failClosed,
      failoverProxyIds: _failoverProxyIds,
      directFallbackAllowed: _directFallbackAllowed,
    } = validation.data;

    // Verify proxy exists if provided
    if (proxyId) {
      const proxy = await getProxyById(proxyId, { includeSecrets: false });
      if (!proxy) {
        return NextResponse.json({ error: { message: "Proxy not found" } }, { status: 404 });
      }
    }

    // Get current assignment for event recording
    const assignments = await getProxyAssignments({ scope: "account", scopeId: id });
    const currentAssignment = assignments.find((a) => a.scope === "account" && a.scope_id === id);
    const oldProxyId = currentAssignment?.proxy_id ?? null;

    if (mode === "direct" || proxyId === null) {
      // Remove assignment (direct connection)
      await assignProxyToScope("account", id, null);
    } else if (proxyId) {
      // Assign new proxy
      await assignProxyToScope("account", id, proxyId);
    }
    // If mode === "inherit" and no proxyId, keep existing (no-op)

    // Record event
    await recordProxyChanged(id, oldProxyId, proxyId, "manual");

    // Invalidate caches
    invalidateDbCache("connections", id);

    return NextResponse.json({
      data: { success: true, proxyId, mode: mode || (proxyId ? "individual" : "inherit") },
    });
  } catch (error) {
    console.error("[AccountManager API] Error assigning proxy:", error);
    return NextResponse.json({ error: { message: "Failed to assign proxy" } }, { status: 500 });
  }
}
