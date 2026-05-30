import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runOpenClawOperator } from "@/lib/services/openclaw-operator";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}` || !isAuthorizedCronRequest(request, authHeader ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runOpenClawOperator({
      forceWeekly: request.nextUrl.searchParams.get("force") === "1",
      send: request.nextUrl.searchParams.get("send") !== "0",
      includeMarket: request.nextUrl.searchParams.get("market") !== "0",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[openclaw-operator] Cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
