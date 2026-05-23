import type { CorporateConnector, AgentTask } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCommunityBudgetStatus } from "@/lib/services/community-budget";
import {
  asCorporateConfig,
  configString,
  decryptCorporateConnectorToken,
  findCorporateConnector,
} from "@/lib/services/corporate-connectors";
import { fetchWithCorporateRateLimit } from "@/lib/connectors/corporate/outbound-queue";

type SlackBlock = Record<string, unknown>;

interface SlackApiResponse {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

function truncateSlackText(value: string, max = 2_900) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function slackToken(connector: Pick<CorporateConnector, "encryptedToken" | "tokenIv">) {
  const token = decryptCorporateConnectorToken(connector);
  if (!token) throw new Error("Slack connector token is unavailable");
  return token;
}

async function postSlackApi(
  connector: Pick<CorporateConnector, "encryptedToken" | "tokenIv">,
  method: string,
  body: Record<string, unknown>
) {
  const response = await fetchWithCorporateRateLimit(
    "slack",
    `https://slack.com/api/${method}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken(connector)}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    },
    { retries: 3 }
  );

  const payload = (await response.json().catch(() => ({}))) as SlackApiResponse;
  if (!response.ok || payload.ok === false) {
    throw new Error(`Slack API ${method} failed: ${payload.error ?? response.status}`);
  }
  return payload;
}

export function buildSlackApprovalBlocks(args: {
  taskId: string;
  title: string;
  riskLevel: string;
  requestedBy: string;
  explanation: string;
}) {
  const value = JSON.stringify({ taskId: args.taskId });
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Approval Required:* ${truncateSlackText(args.title, 220)}\n` +
          `Risk: *${args.riskLevel}* | Requested by: \`${args.requestedBy}\`\n` +
          truncateSlackText(args.explanation, 900),
      },
    },
    {
      type: "actions",
      block_id: `task_approval_${args.taskId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          action_id: "gennety_task_approve",
          value,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          action_id: "gennety_task_reject",
          value,
        },
      ],
    },
  ] satisfies SlackBlock[];
}

export async function notifySlackApprovalRequested(args: {
  communityId: string;
  taskId: string;
  title: string;
  riskLevel: string;
  requestedBy: string;
  explanation: string;
}) {
  const connector = await findCorporateConnector({
    platform: "SLACK",
    communityId: args.communityId,
  });
  if (!connector) return { skipped: "slack_connector_missing" as const };

  const config = asCorporateConfig(connector.config);
  const channel =
    configString(config, "approvalChannelId") ??
    configString(config, "adminChannelId") ??
    configString(config, "channelId");
  if (!channel) return { skipped: "slack_channel_missing" as const };

  const result = await postSlackApi(connector, "chat.postMessage", {
    channel,
    text: `Approval required: ${args.title}`,
    blocks: buildSlackApprovalBlocks(args),
    unfurl_links: false,
    unfurl_media: false,
  });
  return { ok: true as const, slack: result };
}

function statusEmoji(status: string) {
  if (status === "APPROVAL_REQUIRED") return ":large_yellow_circle:";
  if (status === "RUNNING") return ":large_blue_circle:";
  if (status === "ASSIGNED") return ":white_check_mark:";
  if (status === "REJECTED") return ":red_circle:";
  return ":white_circle:";
}

function taskLine(task: Pick<AgentTask, "id" | "title" | "status" | "riskLevel" | "assigneeId">) {
  return `${statusEmoji(task.status)} *${truncateSlackText(task.title, 120)}* (${task.status}, ${task.riskLevel})${
    task.assigneeId ? ` -> \`${task.assigneeId}\`` : ""
  }`;
}

export function buildSlackAppHomeView(args: {
  communityName: string;
  activeMembers: number;
  monthTokensUsed: number | null;
  monthlySpentPercent: number | null;
  shouldDegradeQuality: boolean;
  tasks: Array<Pick<AgentTask, "id" | "title" | "status" | "riskLevel" | "assigneeId">>;
  handshakes: Array<{ id: string; status: string; summary: string | null }>;
}) {
  const budgetLine =
    args.monthlySpentPercent === null
      ? "Budget: no monthly cap configured"
      : `Budget: ${args.monthlySpentPercent.toFixed(1)}% used (${args.monthTokensUsed ?? 0} tokens)`;
  const taskText =
    args.tasks.length > 0
      ? args.tasks.map(taskLine).join("\n")
      : "No active agent tasks right now.";
  const handshakeText =
    args.handshakes.length > 0
      ? args.handshakes
          .map((item) => `*${item.status}:* ${truncateSlackText(item.summary ?? item.id, 160)}`)
          .join("\n")
      : "No pending team handshake opportunities.";

  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Gennety: ${truncateSlackText(args.communityName, 120)}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Community status*\n` +
            `Active members: *${args.activeMembers}*\n` +
            `${budgetLine}${args.shouldDegradeQuality ? "\nQuality model routing is degraded near budget cap." : ""}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Task pipeline*\n${taskText}` },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Match feed*\n${handshakeText}` },
      },
    ],
  };
}

export async function publishSlackAppHomeDashboard(args: {
  connector: CorporateConnector;
  slackUserId: string;
}) {
  const [community, budget, tasks, handshakes] = await Promise.all([
    prisma.community.findUnique({
      where: { id: args.connector.communityId },
      select: {
        name: true,
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
    }),
    getCommunityBudgetStatus(args.connector.communityId).catch(() => null),
    prisma.agentTask.findMany({
      where: {
        communityId: args.connector.communityId,
        status: { in: ["APPROVAL_REQUIRED", "PROPOSED", "ASSIGNED", "RUNNING"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, riskLevel: true, assigneeId: true },
    }),
    prisma.communityInviteHandshake.findMany({
      where: {
        communityId: args.connector.communityId,
        status: { in: ["PENDING", "RUNNING", "NEEDS_HUMAN_REVIEW", "WAITING_OWNER_AGENT"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, status: true, judgeSummary: true, candidateSummary: true },
    }),
  ]);

  if (!community) throw new Error("Community not found for Slack App Home");

  const view = buildSlackAppHomeView({
    communityName: community.name,
    activeMembers: community._count.members,
    monthTokensUsed: budget?.monthTokensUsed ?? null,
    monthlySpentPercent: budget?.monthlySpentPercent ?? null,
    shouldDegradeQuality: budget?.shouldDegradeQuality ?? false,
    tasks,
    handshakes: handshakes.map((item) => ({
      id: item.id,
      status: item.status,
      summary: item.judgeSummary ?? item.candidateSummary,
    })),
  });

  return postSlackApi(args.connector, "views.publish", {
    user_id: args.slackUserId,
    view,
  });
}

export async function postSlackResponseUrl(responseUrl: string, body: Record<string, unknown>) {
  const response = await fetchWithCorporateRateLimit(
    "slack",
    responseUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    },
    { retries: 2 }
  );
  if (!response.ok) throw new Error(`Slack response_url failed: ${response.status}`);
}
