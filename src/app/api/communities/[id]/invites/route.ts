import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendCommunityInviteEmail } from "@/lib/services/notification";
import { CommunityError, createCommunityInvite } from "@/lib/services/community";
import { CommunityInviteSchema } from "@/types/community";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function communityErrorResponse(error: unknown) {
  if (error instanceof CommunityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  console.error("[community:invite]", error);
  return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:invite",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const input = CommunityInviteSchema.parse(body);
    const { invite, token } = await createCommunityInvite(auth.ownerId, id, input);
    const inviteUrl = `${BASE_URL.replace(/\/$/, "")}/communities/invites/${token}`;

    let emailDelivery: { sent: boolean; reason?: string } | null = null;
    if (invite.inviteeEmail) {
      emailDelivery = await sendCommunityInviteEmail(
        invite.inviteeEmail,
        invite.communityName,
        invite.inviterName,
        inviteUrl
      );
    }

    return NextResponse.json({ invite, inviteUrl, emailDelivery }, { status: 201 });
  } catch (error) {
    return communityErrorResponse(error);
  }
}
