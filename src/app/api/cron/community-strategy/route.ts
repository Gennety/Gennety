import { NextRequest, NextResponse } from "next/server";
import { runDueCommunityStrategySessions } from "@/lib/services/community-strategy";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueCommunityStrategySessions();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[community-strategy] Cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

