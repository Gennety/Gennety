import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/admin-analytics/auth";
import { parseAnalyticsRange } from "@/lib/admin-analytics/range";
import { getUsersAnalytics } from "@/lib/admin-analytics/service";

export async function GET(request: NextRequest) {
  const authError = requireAnalyticsAdmin(request);
  if (authError) return authError;

  const hasExplicitWindow =
    request.nextUrl.searchParams.has("range") ||
    request.nextUrl.searchParams.has("from") ||
    request.nextUrl.searchParams.has("to");
  const range = hasExplicitWindow
    ? parseAnalyticsRange(request)
    : {
        key: "all" as const,
        label: "All time",
        from: null,
        to: new Date(),
      };
  return NextResponse.json(await getUsersAnalytics(range));
}
