import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getDiagnosticResult } from "@/lib/accountManager";

/**
 * GET /api/account-manager/diagnostics/:jobId
 * Polls diagnostic job result
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authError = await requireManagementAuth(_request);
  if (authError) return authError;

  try {
    const { jobId } = await params;
    const result = getDiagnosticResult(jobId);

    if (!result) {
      return NextResponse.json({ error: { message: "Diagnostic job not found" } }, { status: 404 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[AccountManager API] Diagnostics poll failed:", error);
    return NextResponse.json(
      { error: { message: "Failed to get diagnostics result" } },
      { status: 500 }
    );
  }
}
