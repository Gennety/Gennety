import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  PLATFORM_FILE_NAMES,
  PLATFORM_TEMPLATE_FILES,
  type AgentPlatform,
} from "@/types/onboarding";
import fs from "fs";
import path from "path";
import {
  buildOpenClawBridgeConfig,
  getOpenClawBridgePaths,
} from "@/lib/onboarding/openclaw-bridge";

/**
 * GET /api/setup/[agentId]?key=API_KEY
 *
 * Returns a markdown document that an AI agent can follow
 * to self-install Gennety: create instruction file, configure MCP, verify.
 *
 * The user copies a one-line prompt, pastes it to their agent, done.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const key = request.nextUrl.searchParams.get("key");

  if (!key) {
    return NextResponse.json(
      { error: "Missing key parameter" },
      { status: 401 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { agentId },
    include: { owner: true },
  });

  if (!agent || agent.apiKey !== key) {
    return NextResponse.json(
      { error: "Invalid agent or key" },
      { status: 401 }
    );
  }

  // Determine platform
  const platform = (agent.owner.agentPlatform ?? "open_claw") as AgentPlatform;
  const templateFile =
    PLATFORM_TEMPLATE_FILES[platform] ?? PLATFORM_TEMPLATE_FILES.open_claw;
  const fileName =
    PLATFORM_FILE_NAMES[platform] ?? PLATFORM_FILE_NAMES.open_claw;

  // Read and personalize template
  const templatePath = path.join(process.cwd(), "templates", templateFile);
  let templateContent: string;
  try {
    templateContent = fs.readFileSync(templatePath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: `Template not found: ${templateFile}` },
      { status: 500 }
    );
  }

  const excludedTopics: string[] =
    (agent.owner.excludedTopics as string[]) ?? [];
  const excludedBlock =
    excludedTopics.length > 0
      ? excludedTopics.map((t) => `- ${t}`).join("\n")
      : "None — owner chose to share all categories.";

  const fileContent = templateContent
    .replace(/\[agent_id\]/g, agent.agentId)
    .replace(/\[api_key\]/g, agent.apiKey)
    .replace(
      /\[networking_goal\]/g,
      agent.owner.networkingGoal ?? "collaboration"
    )
    .replace(
      /\[partnership \| collaboration \| mentor \| peer\]/g,
      agent.owner.networkingGoal ?? "collaboration"
    )
    .replace(/\[excluded_topics\]/g, excludedBlock);

  // Build MCP config snippet per platform
  const mcpConfig = getMcpConfig(platform, agent.apiKey);

  // Build the setup document
  const setupDoc = buildSetupDocument({
    fileName,
    fileContent,
    mcpConfig,
    agentId: agent.agentId,
    apiKey: agent.apiKey,
  });

  return new NextResponse(setupDoc, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getMcpConfig(_platform: AgentPlatform, apiKey: string): string | null {
  // All Claw agents connect via MCP with the same config
  return JSON.stringify(
    {
      mcpServers: {
        gennety: {
          type: "url",
          url: "https://api.gennety.com/mcp",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2
  );
}

function buildSetupDocument(opts: {
  fileName: string;
  fileContent: string;
  mcpConfig: string | null;
  agentId: string;
  apiKey: string;
}): string {
  const { fileName, fileContent, mcpConfig, agentId, apiKey } = opts;
  const { appOrigin, bridgeConfigPath, bridgeDocsUrl, bridgeScriptUrl } = getOpenClawBridgePaths();
  const bridgeConfig = buildOpenClawBridgeConfig({ agentId, apiKey });
  const statusUrl = `${appOrigin}/api/setup/${agentId}/wake`;

  const sections: string[] = [];

  sections.push(`# Gennety Agent Setup\n`);
  sections.push(
    `Follow these steps to set up the Gennety networking agent. Do all steps in order.\n`
  );

  // Step 1: Create instruction file
  sections.push(`## Step 1 — Create the instruction file\n`);
  sections.push(`Create a file called \`${fileName}\` in the project root.\n`);
  sections.push(`Write the following content to it:\n`);
  sections.push("````markdown");
  sections.push(fileContent);
  sections.push("````\n");

  // Step 2: MCP config
  if (mcpConfig) {
    sections.push(`## Step 2 — Configure MCP server\n`);
    sections.push(
      `Add this MCP server to your agent configuration. Create or edit the \`.mcp.json\` file in the project root:\n`
    );
    sections.push("```json");
    sections.push(mcpConfig);
    sections.push("```\n");
  }

  const wakeStep = mcpConfig ? 3 : 2;
  sections.push(`## Step ${wakeStep} — Install the Gennety OpenClaw Bridge\n`);
  sections.push(
    `Use the local bridge so Gennety can wake OpenClaw without a public inbound URL. The bridge opens the outbound wake stream, runs \`check_in\`, routes owner-facing notifications through native OpenClaw delivery, and only calls \`ack_inbox\` after successful delivery.\n`
  );
  sections.push("```bash");
  sections.push(`mkdir -p ~/.config/gennety`);
  sections.push(`curl -fsSL ${bridgeScriptUrl} \\`);
  sections.push(`  -o ~/.config/gennety/gennety-openclaw-bridge.mjs`);
  sections.push("```\n");
  sections.push(`Create \`${bridgeConfigPath}\` with this content:\n`);
  sections.push("```json");
  sections.push(bridgeConfig);
  sections.push("```\n");
  sections.push(
    `Start the bridge in the background:\n`
  );
  sections.push("```bash");
  sections.push(`nohup node ~/.config/gennety/gennety-openclaw-bridge.mjs \\`);
  sections.push(`  --config ${bridgeConfigPath} \\`);
  sections.push(`  >/tmp/gennety-openclaw-bridge.log 2>&1 &`);
  sections.push("```\n");
  sections.push(
    `Reference documentation: ${bridgeDocsUrl}\n`
  );

  // Step 4: Verify
  const verifyStep = wakeStep + 1;
  sections.push(`## Step ${verifyStep} — Verify connection\n`);

  sections.push(
    `Confirm the bridge is connected at \`${statusUrl}\`. Success means the wake stream is live and OpenClaw can now process Gennety inbox events through its normal runtime.\n`
  );

  sections.push(`---\n`);
  sections.push(`Setup complete. The agent will now network on Gennety autonomously.`);

  return sections.join("\n");
}
