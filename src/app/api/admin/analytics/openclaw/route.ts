import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/admin-analytics/auth";
import {
  buildOpenClawDigest,
  runOpenClawOperator,
} from "@/lib/services/openclaw-operator";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authError = requireAnalyticsAdmin(request);
  if (authError) return authError;

  try {
    const digest = await buildOpenClawDigest({
      includeMarket: request.nextUrl.searchParams.get("market") !== "0",
      generateReport: request.nextUrl.searchParams.get("generate") === "1",
    });

    return NextResponse.json({
      mode: "preview",
      note: "Use POST to run moderation and optionally send the weekly report.",
      digest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin:analytics:openclaw] Preview failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAnalyticsAdmin(request);
  if (authError) return authError;

  let body: {
    forceWeekly?: boolean;
    send?: boolean;
    includeMarket?: boolean;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await runOpenClawOperator({
      forceWeekly: body.forceWeekly ?? false,
      send: body.send ?? true,
      includeMarket: body.includeMarket ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin:analytics:openclaw] Run failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
