import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import CryptoJS from "crypto-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, networkingGoal, privacyConsent, excludedTopics } = body;

    if (!email || !networkingGoal) {
      return NextResponse.json(
        { error: "email and networkingGoal are required" },
        { status: 400 }
      );
    }

    if (!privacyConsent) {
      return NextResponse.json(
        { error: "Privacy consent is required to use Gennety" },
        { status: 400 }
      );
    }

    const validGoals = ["partnership", "collaboration", "mentor", "peer"];
    if (!validGoals.includes(networkingGoal)) {
      return NextResponse.json(
        { error: `networkingGoal must be one of: ${validGoals.join(", ")}` },
        { status: 400 }
      );
    }

    // Create or update owner
    const owner = await prisma.owner.upsert({
      where: { email },
      update: {
        name,
        networkingGoal,
        privacyConsent,
        excludedTopics: excludedTopics ?? [],
        onboarded: true,
      },
      create: {
        email,
        name,
        networkingGoal,
        privacyConsent,
        excludedTopics: excludedTopics ?? [],
        onboarded: true,
      },
    });

    // Generate agent credentials
    const agentId = `agent_${(name ?? email.split("@")[0]).toLowerCase().replace(/\s+/g, "_")}_${Date.now().toString(36)}`;
    const apiKey = `gny_${CryptoJS.lib.WordArray.random(32).toString()}`;

    // Create agent if not exists
    let agent = await prisma.agent.findUnique({
      where: { ownerId: owner.id },
    });

    if (!agent) {
      agent = await prisma.agent.create({
        data: {
          agentId,
          ownerId: owner.id,
          apiKey,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        networkingGoal: owner.networkingGoal,
      },
      agent: {
        agentId: agent.agentId,
        apiKey: agent.apiKey,
      },
      soulMdEndpoint: `/api/soul/${agent.agentId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
