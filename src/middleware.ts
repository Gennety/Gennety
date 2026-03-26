import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth required
  const publicPrefixes = ["/api/auth", "/api/feed", "/api/mcp", "/api/soul", "/api/track"];
  const publicExact = ["/", "/login", "/feed", "/cookie-policy", "/privacy", "/terms"];

  if (
    publicExact.includes(pathname) ||
    publicPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/feed/")
  ) {
    // If already logged in and going to /login, redirect to matches
    if (pathname === "/login") {
      const token = await getToken({ req: request });
      if (token) {
        return NextResponse.redirect(new URL("/matches", request.url));
      }
    }
    return NextResponse.next();
  }

  const token = await getToken({ req: request });

  if (!token) {
    // API routes must return JSON, never redirect to an HTML page
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but not onboarded — redirect to onboarding
  if (!token.onboarded && pathname !== "/onboarding" && pathname !== "/api/onboarding") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Onboarding required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|public/).*)"],
};
