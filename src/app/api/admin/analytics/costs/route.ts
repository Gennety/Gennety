import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/admin-analytics/auth";
import { parseAnalyticsRange } from "@/lib/admin-analytics/range";
import { getCostAnalytics } from "@/lib/admin-analytics/service";

export async function GET(request: NextRequest) {
  const authError = requireAnalyticsAdmin(request);
  if (authError) return authError;

  const range = parseAnalyticsRange(request);
  return NextResponse.json(await getCostAnalytics(range));
}
