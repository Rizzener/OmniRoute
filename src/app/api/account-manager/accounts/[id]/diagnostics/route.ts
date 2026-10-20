import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { runAccountDiagnostics } from "@/lib/accountManager";
import { validateBody } from "@/shared/validation/helpers";
import { z } from "zod";

const DiagnosticsSchema = z.object({
  mode: z.enum(["quick", "full", "ai-test"]),
});

/**
 * POST /api/account-manager/accounts/:id/diagnostics
 * Starts account diagnostics
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(DiagnosticsSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: { message: "Invalid request", details: validation.error.errors } },
        { status: 400 }
      );
    }

    const { mode } = validation.data;
    const result = await runAccountDiagnostics(id, mode);

    return NextResponse.json({
      data: {
        jobId: result.jobId,
        mode: result.mode,
        startedAt: result.startedAt,
      },
    });
  } catch (error) {
    console.error("[AccountManager API] Diagnostics start failed:", error);
    return NextResponse.json(
      { error: { message: "Failed to start diagnostics" } },
      { status: 500 }
    );
  }
}
