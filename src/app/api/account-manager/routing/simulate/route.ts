import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { validateBody } from "@/shared/validation/helpers";
import { z } from "zod";
import { simulateRouting } from "@/lib/accountManager";

const SimulateSchema = z.object({
  comboName: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  count: z.number().int().min(1).max(100).default(10),
});

/**
 * POST /api/account-manager/routing/simulate
 * Simulates routing decisions
 */
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validation = validateBody(SimulateSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: { message: "Invalid request", details: validation.error.errors } },
        { status: 400 }
      );
    }

    const result = await simulateRouting(validation.data);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[AccountManager API] Routing simulation failed:", error);
    return NextResponse.json({ error: { message: "Failed to simulate routing" } }, { status: 500 });
  }
}
