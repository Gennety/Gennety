import { NextRequest, NextResponse } from "next/server";
import { checkFreshnessDecay } from "@/lib/services/freshness";

/**
 * Vercel Cron — runs daily to check and transition freshness states.
 * Configured in vercel.json as: "0 6 * * *" (6 AM UTC daily)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkFreshnessDecay();

    console.log(
      `[freshness-decay] Completed: ${result.transitioned.length} state transitions`
    );

    return NextResponse.json({
      success: true,
      transitioned: result.transitioned,
      count: result.transitioned.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[freshness-decay] Cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
