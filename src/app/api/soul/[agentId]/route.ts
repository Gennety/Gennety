import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

// GET /api/soul/[agentId] — serve personalized SOUL.md for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params;

  const agent = await prisma.agent.findUnique({
    where: { agentId },
    include: { owner: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Read the base SOUL.md template
  const soulPath = path.join(process.cwd(), "SOUL.md");
  let soulContent: string;

  try {
    soulContent = fs.readFileSync(soulPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "SOUL.md template not found" }, { status: 500 });
  }

  // Replace placeholders with agent-specific values
  const personalizedSoul = soulContent
    .replace("[agent_id]", agent.agentId)
    .replace("[api_key]", agent.apiKey)
    .replace(
      "[partnership | collaboration | mentor | peer]",
      agent.owner.networkingGoal ?? "collaboration"
    );

  return new NextResponse(personalizedSoul, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
