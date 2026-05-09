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

// Public static files served from public/ — agent discovery surface.
// Must stay on landing domain and require no auth.
const publicFilesExact = ["/skill.md", "/llms.txt", "/INDEX.md", "/AGENTS.md"];
const publicFilesPrefixes = ["/skills/", "/tools/", "/.well-known/"];

// Routes that belong on the app subdomain
const appPrefixes = ["/home", "/matches", "/profile", "/u", "/activity", "/notify", "/chat", "/communities", "/onboarding", "/settings"];
const appExact = ["/login", "/forgot-password", "/reset-password"];

// Public API routes — no auth required
const publicApiPrefixes = [
  "/api/auth",
  "/api/feed",
  "/api/mcp",
  "/api/setup",
  "/api/soul",
  "/api/track",
  "/api/oauth",
  "/api/.well-known",
  "/api/a2a",
  "/api/admin/analytics",
  "/api/agent",
  "/api/communities/agent-create",
  "/api/cron",
  "/api/stats",
  "/api/locale",
];

function isAppRoute(pathname: string) {
  return (
    appExact.includes(pathname) ||
    appPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/")
  );
}

function isPublicFile(pathname: string) {
  return (
    publicFilesExact.includes(pathname) ||
    publicFilesPrefixes.some((p) => pathname.startsWith(p))
  );
}

function isLandingRoute(pathname: string) {
  return (
    landingExact.includes(pathname) ||
    pathname.startsWith("/feed/") ||
    isPublicFile(pathname)
  );
}

// Determine cookie name the same way auth-options does
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
const sessionCookieName = useSecureCookies
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

function isLocalDevHost(host: string) {
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const isLocalDev = isLocalDevHost(host);

  // --- Subdomain routing (only in production when APP_HOST is set) ---
  if (APP_HOST && !isLocalDev && host !== APP_HOST && isAppRoute(pathname)) {
    // Someone hit gennety.com/login or gennety.com/matches → redirect to app subdomain
    return NextResponse.redirect(new URL(pathname + request.nextUrl.search, APP_URL));
  }

  if (APP_HOST && !isLocalDev && host === APP_HOST && isLandingRoute(pathname)) {
    // Someone hit app.gennety.com/ or app.gennety.com/feed → redirect to landing
    return NextResponse.redirect(new URL(pathname + request.nextUrl.search, LANDING_URL));
  }

  // --- Auth logic (unchanged, applies to both domains) ---

  // Public paths — no auth required
  const isPublic =
    landingExact.includes(pathname) ||
    appExact.includes(pathname) ||
    publicApiPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/feed/") ||
    isPublicFile(pathname);

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

  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: useSecureCookies,
      cookieName: sessionCookieName,
    });
  } catch (err) {
    console.error(`[middleware] getToken() threw for ${pathname}:`, err);
  }

  if (!token) {
    // Detailed logging for auth debugging (visible in Docker logs)
    const allCookies = request.cookies.getAll();
    const cookieNames = allCookies.map((c) => c.name);
    const sessionRelated = cookieNames.filter((n) => n.includes("next-auth"));
    console.warn(`[middleware] ${pathname} — NO TOKEN`);
    console.warn(`[middleware]   expected cookie: "${sessionCookieName}"`);
    console.warn(`[middleware]   next-auth cookies: [${sessionRelated.join(", ")}]`);
    console.warn(`[middleware]   all cookies (${cookieNames.length}): [${cookieNames.join(", ")}]`);
    console.warn(`[middleware]   NEXTAUTH_URL=${process.env.NEXTAUTH_URL} secret=${!!process.env.NEXTAUTH_SECRET} secure=${useSecureCookies}`);

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = APP_URL
      ? new URL("/login", APP_URL)
      : new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  console.log(`[middleware] ${pathname} — token OK for ${token.email} (onboarded=${token.onboarded})`);

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
