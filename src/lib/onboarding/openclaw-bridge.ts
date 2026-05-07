export interface OpenClawBridgeConfigParams {
  agentId: string;
  apiKey: string;
}

export function getOpenClawBridgePaths() {
  const landingOrigin = (process.env.NEXT_PUBLIC_LANDING_URL ?? "https://gennety.com").replace(/\/$/, "");
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.gennety.com").replace(/\/$/, "");

  return {
    appOrigin,
    landingOrigin,
    bridgeScriptUrl: `${landingOrigin}/tools/gennety-openclaw-bridge.mjs`,
    bridgeDocsUrl: `${landingOrigin}/tools/gennety-openclaw-bridge.md`,
    bridgeConfigPath: "~/.config/gennety/openclaw-bridge.json",
    wakeStreamUrl: `${appOrigin}/api/agent/wake/stream`,
    mcpUrl: "https://api.gennety.com/mcp",
  };
}

export function buildOpenClawBridgeConfig(params: OpenClawBridgeConfigParams) {
  const paths = getOpenClawBridgePaths();

  return JSON.stringify(
    {
      agentId: params.agentId,
      apiKey: params.apiKey,
      appUrl: paths.appOrigin,
      mcpUrl: paths.mcpUrl,
      wakeStreamUrl: paths.wakeStreamUrl,
      openclaw: {
        bin: "openclaw",
        local: false,
      },
      delivery: {
        mode: "agent_turn",
        agent: "main",
        backgroundSessionId: "gennety-bridge-bg",
        thinking: "off",
      },
      polling: {
        minWakeReconnectMs: 5000,
        maxWakeReconnectMs: 300000,
      },
    },
    null,
    2
  );
}
