import { NextRequest, NextResponse } from "next/server";

export const ANALYTICS_ADMIN_SECRET_ENV = "ANALYTICS_ADMIN_SECRET";

export function requireAnalyticsAdmin(request: NextRequest) {
  const expected = process.env[ANALYTICS_ADMIN_SECRET_ENV];
  if (!expected) {
    return NextResponse.json(
      { error: `${ANALYTICS_ADMIN_SECRET_ENV} not configured` },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
