import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { getSupabaseService } from "@/lib/supabase-service";
import { POLICY_VERSION } from "@/constants/consent";

const VALID_ACTIONS = ["accepted", "rejected", "partial", "withdrawn"] as const;

const consentCategoriesSchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  functional: z.boolean(),
});

const consentBodySchema = z
  .object({
    eventId: z.string().uuid().optional(),
    event_id: z.string().uuid().optional(),
    action: z.enum(VALID_ACTIONS),
    consents: consentCategoriesSchema.optional(),
    categories: consentCategoriesSchema.optional(),
    sessionId: z.string().trim().min(1).max(256).optional(),
    session_id: z.string().trim().min(1).max(256).optional(),
    pageUrl: z.string().trim().max(2048).optional(),
    page_url: z.string().trim().max(2048).optional(),
    source: z.enum(["website", "app"]).optional(),
  })
  .transform((body) => ({
    eventId: body.eventId ?? body.event_id ?? randomUUID(),
    action: body.action,
    consents: body.consents ?? body.categories,
    sessionId: body.sessionId ?? body.session_id ?? null,
    pageUrl: body.pageUrl ?? body.page_url ?? null,
    source: body.source ?? "website",
  }))
  .refine((body) => Boolean(body.consents), {
    message: "Missing consent categories",
    path: ["consents"],
  });

type ConsentBody = z.infer<typeof consentBodySchema>;

function hashIp(rawIp: string): string {
  const salt =
    process.env.CONSENT_IP_SALT ??
    (process.env.NODE_ENV === "production" ? "" : "development-consent-ip-salt");
  if (!salt) {
    throw new Error("CONSENT_IP_SALT must be set");
  }
  return createHash("sha256").update(rawIp + salt).digest("hex");
}

function getForwardedIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}

function normalizePageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.slice(0, 255);
  } catch {
    return null;
  }
}

function getSiteHost(request: NextRequest, pageUrl: string | null): string | null {
  return (
    hostFromUrl(pageUrl) ??
    hostFromUrl(request.headers.get("origin")) ??
    hostFromUrl(request.headers.get("referer")) ??
    request.headers.get("host")?.slice(0, 255) ??
    null
  );
}

function getCountry(request: NextRequest): string | null {
  const value =
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-vercel-ip-country") ??
    null;
  return value?.slice(0, 2).toUpperCase() ?? null;
}

function isDuplicateEvent(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" || error?.message?.includes("duplicate key") === true;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = consentBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid consent payload" },
        { status: 400 }
      );
    }
    const body: ConsentBody = parsed.data;
    if (!body.consents) {
      return NextResponse.json(
        { error: "Invalid consent payload" },
        { status: 400 }
      );
    }

    const rawIp = getForwardedIp(request);
    const ipHash = hashIp(rawIp);
    const userAgent = request.headers.get("user-agent") ?? null;
    const country = getCountry(request);
    const pageUrl = normalizePageUrl(body.pageUrl);
    const siteHost = getSiteHost(request, pageUrl);

    // Authenticated user (optional)
    let ownerId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      ownerId = session?.user?.id ?? null;
    } catch {
      // Not logged in — that's fine
    }

    const bannerTextHash = createHash("sha256").update(POLICY_VERSION).digest("hex");

    const { data, error } = await getSupabaseService()
      .from("cookie_consents")
      .insert({
        event_id: body.eventId,
        action: body.action,
        policy_version: POLICY_VERSION,
        consents: body.consents,
        ip_hash: ipHash,
        user_agent: userAgent,
        country,
        owner_id: ownerId,
        session_id: body.sessionId,
        source: body.source,
        site_host: siteHost,
        page_url: pageUrl,
        banner_text_hash: bannerTextHash,
      })
      .select("id")
      .single();

    if (error) {
      if (isDuplicateEvent(error)) {
        return NextResponse.json({ success: true, idempotent: true });
      }
      console.error("[consent] insert error:", error.message);
      return NextResponse.json(
        { error: "Failed to record consent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, consentId: data.id });
  } catch (err) {
    console.error("[consent] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
