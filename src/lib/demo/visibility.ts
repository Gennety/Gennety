import { demoConfig } from "@/lib/config/demo";

/**
 * Returns a Prisma `where` fragment that hides demo records when the demo
 * network is disabled (production-like deployments). On demo deployments
 * (DEMO_NETWORK_ENABLED=true) demo records are visible everywhere a real
 * user would see them — otherwise the friend has nothing to interact with.
 *
 * Use on analytics surfaces (stats, leaderboards) where demo-inflated
 * numbers would be misleading in production.
 *
 *   prisma.owner.count({ where: { onboarded: true, ...publicDemoFilter() } })
 */
export function publicDemoFilter() {
  if (demoConfig.enabled) return {};
  return { isDemo: false };
}

/**
 * Filter for joined queries that traverse agent→owner. Applies where clause
 * to the agent side and/or agent.owner side.
 */
export function publicAgentDemoFilter() {
  if (demoConfig.enabled) return {};
  return { isDemo: false };
}
