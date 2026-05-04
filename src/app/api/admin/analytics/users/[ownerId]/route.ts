import { NextRequest, NextResponse } from "next/server";
import { requireAnalyticsAdmin } from "@/lib/admin-analytics/auth";
import { getUserAnalyticsDetail } from "@/lib/admin-analytics/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> }
) {
  const authError = requireAnalyticsAdmin(request);
  if (authError) return authError;

  const { ownerId } = await params;

  try {
    return NextResponse.json(await getUserAnalyticsDetail(ownerId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load user detail" },
      { status: 404 }
    );
  }
}
