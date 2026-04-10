import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { supabaseService } from "@/lib/supabase-service";

const VALID_ACTIONS = ["accepted", "rejected", "partial", "withdrawn"] as const;

interface ConsentBody {
  session_id: string;
  policy_version: string;
  action: (typeof VALID_ACTIONS)[number];
  consents: {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
    functional: boolean;
  };
  banner_text_hash?: string;
}

function hashIp(rawIp: string): string {
  const salt = process.env.CONSENT_IP_SALT ?? "";
  return createHash("sha256").update(rawIp + salt).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsentBody;

    // Validate required fields
    if (
      !body.session_id ||
      !body.policy_version ||
      !body.action ||
      !body.consents
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    // Extract IP and hash it — never store raw
    const forwarded = request.headers.get("x-forwarded-for");
    const rawIp = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = hashIp(rawIp);

    // User agent
    const userAgent = request.headers.get("user-agent") ?? null;

    // Country from CDN headers
    const country =
      request.headers.get("cf-ipcountry") ??
      request.headers.get("x-vercel-ip-country") ??
      null;

    // Authenticated user (optional)
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in — that's fine
    }

    // Banner text hash
    const bannerTextHash =
      body.banner_text_hash ??
      createHash("sha256").update(body.policy_version).digest("hex");

    const { data, error } = await supabaseService
      .from("cookie_consents")
      .insert({
        session_id: body.session_id,
        action: body.action,
        policy_version: body.policy_version,
        consents: body.consents,
        ip_hash: ipHash,
        user_agent: userAgent,
        country: country?.substring(0, 2) ?? null,
        user_id: userId,
        banner_text_hash: bannerTextHash,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[consent] insert error:", error.message);
      return NextResponse.json(
        { error: "Failed to record consent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, consent_id: data.id });
  } catch (err) {
    console.error("[consent] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
