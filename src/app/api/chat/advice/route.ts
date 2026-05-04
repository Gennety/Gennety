import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { safeErrorResponse } from "@/lib/api-error";
import {
  ModelAdviceRequestSchema,
  ModelAdviceRespondSchema,
} from "@/types/model-advice";
import {
  cancelModelAdviceSession,
  requestModelAdvice,
  respondToModelAdvice,
} from "@/lib/services/model-advice";
import { ZodError } from "zod";

export async function POST(request: NextRequest) {
  const rateLimited = rateLimit(request, {
    maxRequests: 6,
    windowMs: 60_000,
    keyPrefix: "chat-advice-request",
  });
  if (rateLimited) return rateLimited;

  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validated = ModelAdviceRequestSchema.parse(body);
    const session = await requestModelAdvice({
      matchId: validated.matchId,
      requesterOwnerId: auth.ownerId,
      promptKey: validated.promptKey,
      promptText: validated.promptText,
    });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    return safeErrorResponse(error, "Failed to request model advice", 400);
  }
}

export async function PATCH(request: NextRequest) {
  const rateLimited = rateLimit(request, {
    maxRequests: 6,
    windowMs: 60_000,
    keyPrefix: "chat-advice-respond",
  });
  if (rateLimited) return rateLimited;

  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validated = ModelAdviceRespondSchema.parse(body);
    const session =
      validated.action === "cancel"
        ? await cancelModelAdviceSession({
            sessionId: validated.sessionId,
            ownerId: auth.ownerId,
          })
        : await respondToModelAdvice({
            sessionId: validated.sessionId,
            ownerId: auth.ownerId,
            action: validated.action,
          });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    return safeErrorResponse(error, "Failed to respond to model advice", 400);
  }
}
