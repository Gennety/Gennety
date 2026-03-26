import { prisma } from "@/lib/db";
import crypto from "crypto";

// Freshness thresholds in days
const AGING_THRESHOLD_DAYS = 30;
const STALE_THRESHOLD_DAYS = 60;
const INACTIVE_THRESHOLD_DAYS = 90;

type FreshnessState = "ACTIVE" | "AGING" | "STALE" | "INACTIVE";

interface RawContextKeyFields {
  current_work: string;
  looking_for: string;
  recent_problems?: string | null;
}

/**
 * Hash the three key fields that determine a "significant" context update.
 * Normalises whitespace before hashing so minor formatting changes don't count.
 */
export function computeContextHash(fields: RawContextKeyFields): string {
  const normalised = [
    fields.current_work,
    fields.looking_for,
    fields.recent_problems ?? "",
  ]
    .map((s) => s.trim().replace(/\s+/g, " "))
    .join("|");

  return crypto.createHash("sha256").update(normalised).digest("hex");
}

/**
 * Returns true when the new hash differs from the stored hash —
 * meaning at least one key field changed substantively.
 */
export function isSignificantUpdate(
  newHash: string,
  previousHash: string | null
): boolean {
  if (!previousHash) return true; // first publish is always significant
  return newHash !== previousHash;
}

/**
 * Called from publishContext() after every context update.
 * If significant: resets freshness clock to ACTIVE.
 * If not: only touches updatedAt (Prisma @updatedAt handles this).
 */
export async function updateFreshness(
  agentInternalId: string,
  isSignificant: boolean
): Promise<FreshnessState> {
  if (!isSignificant) {
    // Non-significant update — don't reset freshness clock
    const ctx = await prisma.agentContext.findUnique({
      where: { agentId: agentInternalId },
    });
    return ctx?.freshnessState as FreshnessState ?? "ACTIVE";
  }

  // Significant update — reset to ACTIVE, update clock
  const ctx = await prisma.agentContext.update({
    where: { agentId: agentInternalId },
    data: {
      freshnessState: "ACTIVE",
      lastSignificantUpdateAt: new Date(),
    },
  });

  // If restoring from STALE/INACTIVE, resume paused beacons
  await restoreFromStale(agentInternalId);

  return ctx.freshnessState as FreshnessState;
}

/**
 * Compute the freshness state based on days since last significant update.
 */
export function computeFreshnessState(lastSignificantUpdateAt: Date): FreshnessState {
  const daysSince = Math.floor(
    (Date.now() - lastSignificantUpdateAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince < AGING_THRESHOLD_DAYS) return "ACTIVE";
  if (daysSince < STALE_THRESHOLD_DAYS) return "AGING";
  if (daysSince < INACTIVE_THRESHOLD_DAYS) return "STALE";
  return "INACTIVE";
}

/**
 * Returns the ranking weight multiplier for a given freshness state.
 * ACTIVE=1.0, AGING=0.7, STALE=0, INACTIVE=0
 */
export function getFreshnessWeight(state: FreshnessState): number {
  switch (state) {
    case "ACTIVE":
      return 1.0;
    case "AGING":
      return 0.7;
    case "STALE":
    case "INACTIVE":
      return 0;
  }
}

/**
 * Returns the freshness score (0–100) for the reputation component.
 */
export function getFreshnessScore(state: FreshnessState): number {
  switch (state) {
    case "ACTIVE":
      return 100;
    case "AGING":
      return 60;
    case "STALE":
      return 20;
    case "INACTIVE":
      return 0;
  }
}

/**
 * Resume paused beacons when an agent returns to ACTIVE from STALE/INACTIVE.
 * Only beacons with preservable=true are resumed.
 * Deactivated beacons (preservable=false) are not restored.
 */
export async function restoreFromStale(agentInternalId: string): Promise<void> {
  await prisma.beacon.updateMany({
    where: {
      agentId: agentInternalId,
      isActive: false,
      preservable: true,
    },
    data: { isActive: true },
  });
}

/**
 * Cron job — runs daily. Checks all agent contexts and transitions freshness states.
 * On state transitions: updates DB, handles beacon pausing/deactivation.
 */
export async function checkFreshnessDecay(): Promise<{
  transitioned: Array<{ agentId: string; from: string; to: string }>;
}> {
  const contexts = await prisma.agentContext.findMany({
    include: { agent: true },
  });

  const transitioned: Array<{ agentId: string; from: string; to: string }> = [];

  for (const ctx of contexts) {
    const currentState = ctx.freshnessState as FreshnessState;
    const newState = computeFreshnessState(ctx.lastSignificantUpdateAt);

    if (currentState === newState) continue;

    // State changed — update DB
    await prisma.agentContext.update({
      where: { id: ctx.id },
      data: { freshnessState: newState },
    });

    // Handle beacon transitions
    if (newState === "STALE") {
      // Pause all active beacons (preservable = true, can be resumed)
      await prisma.beacon.updateMany({
        where: { agentId: ctx.agentId, isActive: true },
        data: { isActive: false, preservable: true },
      });
    } else if (newState === "INACTIVE") {
      // Deactivate all beacons (preservable = false, must be recreated)
      await prisma.beacon.updateMany({
        where: { agentId: ctx.agentId },
        data: { isActive: false, preservable: false },
      });
    }

    transitioned.push({
      agentId: ctx.agent.agentId,
      from: currentState,
      to: newState,
    });

    console.log(
      `[freshness-decay] ${ctx.agent.agentId}: ${currentState} → ${newState}`
    );
  }

  return { transitioned };
}
