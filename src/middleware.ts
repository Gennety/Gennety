import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOST = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
  : null; // e.g. "app.gennety.com"

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Routes that belong on the landing domain only
const landingExact = ["/", "/feed", "/cookie-policy", "/privacy", "/terms"];

// Routes that belong on the app subdomain
const appPrefixes = ["/home", "/matches", "/profile", "/activity", "/notify", "/chat", "/onboarding", "/settings"];
const appExact = ["/login", "/forgot-password", "/reset-password"];

// Public API routes — no auth required
const publicApiPrefixes = ["/api/auth", "/api/feed", "/api/mcp", "/api/soul", "/api/track", "/api/oauth", "/api/.well-known", "/api/a2a", "/api/cron", "/api/stats", "/api/locale"];

function isAppRoute(pathname: string) {
  return (
    appExact.includes(pathname) ||
    appPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/")
  );
}

function isLandingRoute(pathname: string) {
  return landingExact.includes(pathname) || pathname.startsWith("/feed/");
}

// Determine cookie name the same way auth-options does
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
const sessionCookieName = useSecureCookies
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // --- Subdomain routing (only in production when APP_HOST is set) ---
  if (APP_HOST && host !== APP_HOST && isAppRoute(pathname)) {
    // Someone hit gennety.com/login or gennety.com/matches → redirect to app subdomain
    return NextResponse.redirect(new URL(pathname + request.nextUrl.search, APP_URL));
  }

  if (APP_HOST && host === APP_HOST && isLandingRoute(pathname)) {
    // Someone hit app.gennety.com/ or app.gennety.com/feed → redirect to landing
    return NextResponse.redirect(new URL(pathname + request.nextUrl.search, LANDING_URL));
  }

  // --- Auth logic (unchanged, applies to both domains) ---

  // Public paths — no auth required
  const isPublic =
    landingExact.includes(pathname) ||
    appExact.includes(pathname) ||
    publicApiPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/feed/");

  if (isPublic) {
    // If already logged in and going to /login, redirect to /home
    if (pathname === "/login") {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: useSecureCookies,
        cookieName: sessionCookieName,
      });
      if (token) {
        const homeUrl = APP_URL ? new URL("/home", APP_URL) : new URL("/home", request.url);
        return NextResponse.redirect(homeUrl);
      }
    }
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: useSecureCookies,
    cookieName: sessionCookieName,
  });

  if (!token) {
    // Log cookie state when token is missing on protected routes (helps debug auth issues)
    const allCookies = request.cookies.getAll().map((c) => c.name);
    const hasSession = allCookies.some((n) => n.startsWith(sessionCookieName));
    console.warn(`[middleware] ${pathname} — no token | cookie=${sessionCookieName} present=${hasSession} | secret=${!!process.env.NEXTAUTH_SECRET} secure=${useSecureCookies}`);

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = APP_URL
      ? new URL("/login", APP_URL)
      : new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but not onboarded — redirect to onboarding
  if (!token.onboarded && pathname !== "/onboarding" && pathname !== "/api/onboarding") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Onboarding required" }, { status: 403 });
    }
    const onboardingUrl = APP_URL
      ? new URL("/onboarding", APP_URL)
      : new URL("/onboarding", request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|public/).*)"],
};
