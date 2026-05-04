import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pingWakeWebhook } from "@/lib/services/agent-wake";
import { getWakeWebhookUrlError } from "@/lib/wake-webhook";

const WakeSetupSchema = z.object({
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .startsWith("https://", "Wake webhook must use HTTPS")
    .max(500),
  webhookToken: z.string().min(8).max(500),
  enabled: z.boolean().optional().default(true),
  test: z.boolean().optional().default(true),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const key = request.nextUrl.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 401 });
  }

  const agent = await prisma.agent.findUnique({
    where: { agentId },
    select: { id: true, apiKey: true, agentId: true },
  });

  if (!agent || agent.apiKey !== key) {
    return NextResponse.json({ error: "Invalid agent or key" }, { status: 401 });
  }

  let body;
  try {
    body = WakeSetupSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const webhookUrlError = getWakeWebhookUrlError(body.webhookUrl);
  if (webhookUrlError) {
    return NextResponse.json({ error: webhookUrlError }, { status: 400 });
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      webhookUrl: body.webhookUrl,
      webhookToken: body.webhookToken,
      wakeWebhookEnabled: body.enabled,
      wakeWebhookLastPingAt: null,
      wakeWebhookLastPingOk: null,
      wakeWebhookLastPingError: null,
    },
  });

  const result = body.test
    ? await pingWakeWebhook({
        agentId: agent.id,
        webhookUrl: body.webhookUrl,
        webhookToken: body.webhookToken,
        reason: "Test connection after OpenClaw wake-up setup",
      })
    : null;

  return NextResponse.json({
    ok: true,
    wakeWebhookEnabled: body.enabled,
    tested: Boolean(result),
    reachable: result?.ok ?? null,
    checkedAt: result?.checkedAt ?? null,
    statusCode: result?.status ?? null,
    error: result?.error ?? null,
  });
}
