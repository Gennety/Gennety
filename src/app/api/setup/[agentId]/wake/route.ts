import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { pingWakeWebhook } from "@/lib/services/agent-wake";
import {
  buildWakeWebhookUrl,
  getWakeWebhookUrlError,
  normalizeWakeBaseUrl,
} from "@/lib/wake-webhook";
import { getWakeStreamConnectionCount, hasLiveWakeStream } from "@/lib/services/agent-wake-stream";

const WakeSetupSchema = z.object({
  baseUrl: z
    .string()
    .url("Must be a valid URL")
    .startsWith("https://", "Wake webhook must use HTTPS")
    .max(500)
    .optional(),
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .startsWith("https://", "Wake webhook must use HTTPS")
    .max(500)
    .optional(),
  webhookToken: z.string().min(8).max(500).optional(),
  bearerToken: z.string().min(8).max(500).optional(),
  enabled: z.boolean().optional().default(true),
  test: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  if (!value.baseUrl && !value.webhookUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either baseUrl or webhookUrl",
      path: ["baseUrl"],
    });
  }

  if (!value.webhookToken && !value.bearerToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either webhookToken or bearerToken",
      path: ["webhookToken"],
    });
  }
});

function getAgentSetupKey(request: NextRequest) {
  const queryKey = request.nextUrl.searchParams.get("key");
  if (queryKey) return queryKey;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function getAuthenticatedAgent(request: NextRequest, agentId: string) {
  const key = getAgentSetupKey(request);

  if (!key) {
    return {
      error: NextResponse.json(
        { error: "Missing setup key. Use ?key=... or Authorization: Bearer <agent_api_key>" },
        { status: 401 }
      ),
      agent: null,
    };
  }

  const agent = await prisma.agent.findUnique({
    where: { agentId },
    select: {
      id: true,
      apiKey: true,
      agentId: true,
      wakeWebhookEnabled: true,
      webhookUrl: true,
      webhookToken: true,
      wakeWebhookLastPingAt: true,
      wakeWebhookLastPingOk: true,
      wakeWebhookLastPingError: true,
      wakeStreamLastConnectedAt: true,
      wakeStreamLastSeenAt: true,
      wakeStreamLastDisconnectedAt: true,
      wakeStreamLastError: true,
    },
  });

  if (!agent || agent.apiKey !== key) {
    return {
      error: NextResponse.json({ error: "Invalid agent or key" }, { status: 401 }),
      agent: null,
    };
  }

  return { error: null, agent };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { agent, error } = await getAuthenticatedAgent(request, agentId);
  if (error || !agent) return error;

  return NextResponse.json({
    ok: true,
    agentId: agent.agentId,
    preferredMode: "outbound_stream",
    configured: Boolean(agent.webhookUrl && agent.webhookToken),
    enabled: agent.wakeWebhookEnabled,
    baseUrl: agent.webhookUrl ? normalizeWakeBaseUrl(agent.webhookUrl) : null,
    webhookUrl: agent.webhookUrl,
    webhookTokenSet: Boolean(agent.webhookToken),
    checkedAt: agent.wakeWebhookLastPingAt,
    reachable: agent.wakeWebhookLastPingOk,
    error: agent.wakeWebhookLastPingError,
    stream: {
      connected: hasLiveWakeStream(agent.id),
      connectionCount: getWakeStreamConnectionCount(agent.id),
      endpoint: "/api/agent/wake/stream",
      lastConnectedAt: agent.wakeStreamLastConnectedAt,
      lastSeenAt: agent.wakeStreamLastSeenAt,
      lastDisconnectedAt: agent.wakeStreamLastDisconnectedAt,
      lastError: agent.wakeStreamLastError,
    },
    legacyWebhook: {
      configured: Boolean(agent.webhookUrl && agent.webhookToken),
      enabled: agent.wakeWebhookEnabled,
      baseUrl: agent.webhookUrl ? normalizeWakeBaseUrl(agent.webhookUrl) : null,
      webhookUrl: agent.webhookUrl,
      webhookTokenSet: Boolean(agent.webhookToken),
      checkedAt: agent.wakeWebhookLastPingAt,
      reachable: agent.wakeWebhookLastPingOk,
      error: agent.wakeWebhookLastPingError,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { agent, error } = await getAuthenticatedAgent(request, agentId);
  if (error || !agent) return error;

  let body;
  try {
    body = WakeSetupSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawWakeAddress = body.baseUrl ?? body.webhookUrl ?? "";
  const webhookUrl = buildWakeWebhookUrl(rawWakeAddress);
  const webhookToken = body.webhookToken ?? body.bearerToken ?? null;

  if (!webhookUrl || !webhookToken) {
    return NextResponse.json(
      { error: "Wake setup requires a public base URL or webhookUrl plus a bearer token" },
      { status: 400 }
    );
  }

  const webhookUrlError = getWakeWebhookUrlError(webhookUrl);
  if (webhookUrlError) {
    return NextResponse.json({ error: webhookUrlError }, { status: 400 });
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      webhookUrl,
      webhookToken,
      wakeWebhookEnabled: body.enabled,
      wakeWebhookLastPingAt: null,
      wakeWebhookLastPingOk: null,
      wakeWebhookLastPingError: null,
    },
  });

  const result = body.test
    ? await pingWakeWebhook({
        agentId: agent.id,
        webhookUrl,
        webhookToken,
        reason: "Test connection after OpenClaw wake-up setup",
      })
    : null;

  return NextResponse.json({
    ok: true,
    updatedSettings: {
      baseUrl: normalizeWakeBaseUrl(webhookUrl),
      webhookUrl,
      webhookTokenSet: true,
    },
    wakeWebhookEnabled: body.enabled,
    tested: Boolean(result),
    reachable: result?.ok ?? null,
    checkedAt: result?.checkedAt ?? null,
    statusCode: result?.status ?? null,
    error: result?.error ?? null,
  });
}
