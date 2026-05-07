#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_IDLE_CHECK_IN_MS = 15 * 60 * 1000;
const DEFAULT_MIN_RECONNECT_MS = 5_000;
const DEFAULT_MAX_RECONNECT_MS = 5 * 60_000;

const DEFAULT_CONFIG_PATH = process.env.GENNETY_OPENCLAW_BRIDGE_CONFIG
  ? process.env.GENNETY_OPENCLAW_BRIDGE_CONFIG
  : path.join(os.homedir(), ".config", "gennety", "openclaw-bridge.json");

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG_PATH,
    once: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config" && argv[index + 1]) {
      args.configPath = argv[index + 1];
      index += 1;
    } else if (value === "--once") {
      args.once = true;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(
    [
      "Gennety OpenClaw Bridge",
      "",
      "Usage:",
      "  node gennety-openclaw-bridge.mjs [--config /path/to/openclaw-bridge.json] [--once]",
      "",
      "Environment:",
      "  GENNETY_OPENCLAW_BRIDGE_CONFIG  Override the config path",
      "",
      "Behavior:",
      "  - Opens the Gennety wake stream",
      "  - Calls check_in on connected/resync/wake and on polling fallback",
      "  - Routes owner-facing events through native OpenClaw delivery",
      "  - Routes background Gennety tasks through a non-delivery OpenClaw turn",
      "  - Calls ack_inbox only after successful delivery or task execution",
    ].join("\n")
  );
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required config field: ${fieldName}`);
  }
  return value.trim();
}

function loadConfig(filePath) {
  const config = readJsonFile(filePath);
  const appUrl = typeof config.appUrl === "string" && config.appUrl.trim().length > 0
    ? config.appUrl.trim().replace(/\/$/, "")
    : "https://app.gennety.com";

  const mcpUrl = typeof config.mcpUrl === "string" && config.mcpUrl.trim().length > 0
    ? config.mcpUrl.trim()
    : "https://api.gennety.com/mcp";

  const wakeStreamUrl = typeof config.wakeStreamUrl === "string" && config.wakeStreamUrl.trim().length > 0
    ? config.wakeStreamUrl.trim()
    : `${appUrl}/api/agent/wake/stream`;

  const openclaw = config.openclaw && typeof config.openclaw === "object" ? config.openclaw : {};
  const delivery = config.delivery && typeof config.delivery === "object" ? config.delivery : {};
  const polling = config.polling && typeof config.polling === "object" ? config.polling : {};

  return {
    agentId: ensureString(config.agentId, "agentId"),
    apiKey: ensureString(config.apiKey, "apiKey"),
    appUrl,
    mcpUrl,
    wakeStreamUrl,
    openclaw: {
      bin: typeof openclaw.bin === "string" && openclaw.bin.trim().length > 0 ? openclaw.bin.trim() : "openclaw",
      local: openclaw.local === true,
    },
    delivery: {
      mode: delivery.mode === "message_send" ? "message_send" : "agent_turn",
      agent: typeof delivery.agent === "string" && delivery.agent.trim().length > 0 ? delivery.agent.trim() : "main",
      sessionId:
        typeof delivery.sessionId === "string" && delivery.sessionId.trim().length > 0
          ? delivery.sessionId.trim()
          : "gennety-owner-notify",
      backgroundSessionId:
        typeof delivery.backgroundSessionId === "string" && delivery.backgroundSessionId.trim().length > 0
          ? delivery.backgroundSessionId.trim()
          : "gennety-bridge-bg",
      thinking:
        typeof delivery.thinking === "string" && delivery.thinking.trim().length > 0
          ? delivery.thinking.trim()
          : "off",
      channel: typeof delivery.channel === "string" ? delivery.channel.trim() : "",
      target: typeof delivery.target === "string" ? delivery.target.trim() : "",
      account: typeof delivery.account === "string" ? delivery.account.trim() : "",
      replyChannel: typeof delivery.replyChannel === "string" ? delivery.replyChannel.trim() : "",
      replyTo: typeof delivery.replyTo === "string" ? delivery.replyTo.trim() : "",
      replyAccount: typeof delivery.replyAccount === "string" ? delivery.replyAccount.trim() : "",
      dryRun: delivery.dryRun === true,
    },
    polling: {
      minWakeReconnectMs:
        typeof polling.minWakeReconnectMs === "number" && Number.isFinite(polling.minWakeReconnectMs)
          ? polling.minWakeReconnectMs
          : DEFAULT_MIN_RECONNECT_MS,
      maxWakeReconnectMs:
        typeof polling.maxWakeReconnectMs === "number" && Number.isFinite(polling.maxWakeReconnectMs)
          ? polling.maxWakeReconnectMs
          : DEFAULT_MAX_RECONNECT_MS,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatOwnerMessage(event) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};

  switch (event.type) {
    case "NEW_MESSAGE":
      return {
        title: "New Gennety chat message",
        summary: `New message from ${payload.from_owner_name ?? "your match"}`,
        text: `New message in Gennety from ${payload.from_owner_name ?? "your match"}:\n\n${payload.message_preview ?? "Open Gennety to read it."}\n\nReply here if you want me to relay your answer back into the chat.`,
      };
    case "MATCH_PROPOSED":
      return {
        title: "New match proposal",
        summary: `Potential introduction: ${payload.other_owner_name ?? payload.other_display_name ?? "someone"}`,
        text: `Gennety found a potential introduction: ${payload.other_owner_name ?? payload.other_display_name ?? "someone"}.\n\nWhy it fits: ${payload.framing ?? payload.overlap_summary ?? "Open Gennety to review the proposal."}\n\nOpen Gennety to confirm, or tell me what you think here.`,
      };
    case "MATCH_CONFIRMED":
      return {
        title: "Match confirmed",
        summary: `Your match with ${payload.other_owner_name ?? payload.other_display_name ?? "your contact"} is live`,
        text: `Your Gennety match with ${payload.other_owner_name ?? payload.other_display_name ?? "your contact"} is now live.\n\n${payload.overlap_summary ?? "Open Gennety to continue the conversation."}`,
      };
    case "FRESHNESS_WARNING":
      return {
        title: "Context freshness warning",
        summary: `Your Gennety context is now ${payload.new_state ?? "aging"}`,
        text: `Gennety update: your agent context is now ${payload.new_state ?? "AGING"}.\n\n${payload.action ?? "Open Gennety and refresh your context."}`,
      };
    case "WAKEUP_TEST_CONFIRMATION":
      return {
        title: "Wakeup test completed",
        summary: "Gennety realtime wakeup is working",
        text:
          payload.message_suggestion ??
          "Wakeup is working. I am receiving live Gennety events and can react without waiting for the next polling cycle.",
      };
    default:
      return {
        title: `Gennety event: ${event.type}`,
        summary: `Unhandled owner-facing event ${event.type}`,
        text: `Gennety sent an event of type ${event.type}.\n\nPayload:\n${safeJson(payload)}`,
      };
  }
}

function buildOwnerDeliveryPrompt(event) {
  const formatted = formatOwnerMessage(event);

  return [
    "System notification from Gennety.",
    "Deliver exactly one concise owner-facing message through your normal configured channel.",
    "Do not ask the owner to do setup work. Do not mention internal tool names unless needed.",
    "If the owner replies, continue normally and use your configured Gennety tools when appropriate.",
    "Return only the final owner-facing message.",
    "",
    `Title: ${formatted.title}`,
    `Summary: ${formatted.summary}`,
    "Suggested message:",
    formatted.text,
    "",
    "Event payload:",
    safeJson({
      event_id: event.event_id,
      type: event.type,
      payload: event.payload,
    }),
  ].join("\n");
}

function buildBackgroundTaskPrompt(task) {
  return [
    "System task from Gennety.",
    "This is not an owner message.",
    "Process it autonomously using your Gennety MCP tools when needed.",
    "Do not send an owner-facing reply unless the task explicitly requires it.",
    "If there is no useful action to take, end the turn quietly.",
    "",
    `Task type: ${task.type}`,
    `Created at: ${task.created_at ?? nowIso()}`,
    "",
    "Task payload:",
    safeJson(task.payload),
  ].join("\n");
}

function buildCheckInBackgroundTask(checkIn) {
  const negotiations = Array.isArray(checkIn.incoming_negotiations) ? checkIn.incoming_negotiations : [];
  if (negotiations.length === 0) return null;

  return {
    type: "INCOMING_NEGOTIATIONS",
    created_at: nowIso(),
    payload: {
      incoming_negotiations: negotiations,
      recommended_actions: checkIn.recommended_actions ?? [],
      context_status: checkIn.context_status ?? null,
      days_since_update: checkIn.days_since_update ?? null,
    },
  };
}

function ownerFacingEvent(event) {
  return new Set([
    "NEW_MESSAGE",
    "MATCH_PROPOSED",
    "MATCH_CONFIRMED",
    "FRESHNESS_WARNING",
    "WAKEUP_TEST_CONFIRMATION",
  ]).has(event.type);
}

function backgroundInboxEvent(event) {
  return new Set([
    "BEACON_TRIGGERED",
    "PRIVACY_SETTINGS_CHANGED",
    "NETWORKING_GOAL_CHANGED",
    "AGENT_SEARCH_PAUSED",
    "AGENT_SEARCH_RESUMED",
  ]).has(event.type);
}

function extractTextResult(body) {
  if (body?.error?.message) {
    throw new Error(body.error.message);
  }

  if (!body?.result) {
    throw new Error("MCP response did not include a result");
  }

  if (body.result.isError) {
    const first = Array.isArray(body.result.content) ? body.result.content[0] : null;
    if (first?.text) {
      try {
        const parsed = JSON.parse(first.text);
        throw new Error(parsed.error ?? first.text);
      } catch {
        throw new Error(first.text);
      }
    }
    throw new Error("MCP tool returned an error");
  }

  const first = Array.isArray(body.result.content) ? body.result.content.find((item) => item?.type === "text") : null;
  if (!first?.text) {
    return null;
  }

  return first.text;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

class GennetyOpenClawBridge {
  constructor(config) {
    this.config = config;
    this.checkInInFlight = false;
    this.pendingCheckIn = false;
    this.shutdownRequested = false;
    this.pollTimer = null;
    this.reconnectDelayMs = config.polling.minWakeReconnectMs;
    this.decoder = new TextDecoder();
    this.lastBackgroundFingerprint = null;
  }

  log(message, extra) {
    if (extra !== undefined) {
      console.log(`[gennety-bridge] ${message}`, extra);
      return;
    }
    console.log(`[gennety-bridge] ${message}`);
  }

  async start({ once = false } = {}) {
    process.on("SIGINT", () => this.stop("SIGINT"));
    process.on("SIGTERM", () => this.stop("SIGTERM"));

    this.log(`using config ${this.config.agentId} @ ${this.config.mcpUrl}`);

    if (once) {
      await this.runCheckIn("manual_once");
      return;
    }

    this.schedulePoll(DEFAULT_IDLE_CHECK_IN_MS);
    void this.openWakeStreamLoop();
    await this.runCheckIn("startup");
  }

  stop(reason) {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.log(`stopping bridge (${reason})`);
  }

  schedulePoll(delayMs) {
    if (this.shutdownRequested) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const normalized = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : DEFAULT_IDLE_CHECK_IN_MS;
    this.pollTimer = setTimeout(() => {
      void this.runCheckIn("poll");
    }, normalized);
    this.log(`next polling check_in in ${Math.round(normalized / 1000)}s`);
  }

  async callMcpTool(name, args) {
    const response = await fetch(this.config.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${name}:${Date.now()}`,
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    const body = await response.json();
    const text = extractTextResult(body);
    return text ? JSON.parse(text) : {};
  }

  async runCheckIn(reason) {
    if (this.shutdownRequested) return;
    if (this.checkInInFlight) {
      this.pendingCheckIn = true;
      return;
    }

    this.checkInInFlight = true;

    do {
      this.pendingCheckIn = false;
      try {
        this.log(`check_in (${reason})`);
        const checkIn = await this.callMcpTool("check_in", {
          agent_id: this.config.agentId,
        });

        await this.processInbox(Array.isArray(checkIn.inbox) ? checkIn.inbox : []);
        await this.processBackgroundTasks(checkIn);
        this.schedulePoll(checkIn.next_check_in_ms ?? DEFAULT_IDLE_CHECK_IN_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`check_in failed: ${message}`);
        this.schedulePoll(DEFAULT_IDLE_CHECK_IN_MS);
      }
      reason = "queued_retry";
    } while (this.pendingCheckIn && !this.shutdownRequested);

    this.checkInInFlight = false;
  }

  async processInbox(inbox) {
    if (inbox.length === 0) return;
    const ackIds = [];

    for (const event of inbox) {
      const eventId = event.event_id ?? event.id;
      if (!eventId || !event.type) continue;

      try {
        let handled = false;
        if (ownerFacingEvent(event)) {
          handled = await this.deliverOwnerNotification(event);
        } else if (backgroundInboxEvent(event)) {
          handled = await this.runBackgroundTask({
            type: event.type,
            created_at: event.created_at ?? nowIso(),
            payload: event.payload ?? {},
          });
        }

        if (handled) {
          ackIds.push(eventId);
        } else {
          this.log(`leaving inbox event unacked: ${event.type} (${eventId})`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`failed to process inbox event ${event.type} (${eventId}): ${message}`);
      }
    }

    if (ackIds.length > 0) {
      await this.callMcpTool("ack_inbox", {
        agent_id: this.config.agentId,
        event_ids: ackIds,
      });
      this.log(`acked ${ackIds.length} inbox event(s)`);
    }
  }

  async processBackgroundTasks(checkIn) {
    const task = buildCheckInBackgroundTask(checkIn);
    if (!task) return;

    const fingerprint = JSON.stringify(task.payload);
    if (this.lastBackgroundFingerprint === fingerprint) {
      return;
    }

    const handled = await this.runBackgroundTask(task);
    if (handled) {
      this.lastBackgroundFingerprint = fingerprint;
    }
  }

  async deliverOwnerNotification(event) {
    if (this.config.delivery.dryRun) {
      this.log(`dry-run owner notification: ${event.type}`);
      this.log(formatOwnerMessage(event).text);
      return true;
    }

    if (this.config.delivery.mode === "message_send") {
      return this.deliverViaMessageSend(formatOwnerMessage(event).text);
    }

    const prompt = buildOwnerDeliveryPrompt(event);
    return this.runOpenClawAgentTurn({
      prompt,
      deliver: true,
      sessionId: this.config.delivery.sessionId,
    });
  }

  async runBackgroundTask(task) {
    if (this.config.delivery.dryRun) {
      this.log(`dry-run background task: ${task.type}`);
      this.log(safeJson(task.payload));
      return true;
    }

    const prompt = buildBackgroundTaskPrompt(task);
    return this.runOpenClawAgentTurn({
      prompt,
      deliver: false,
      sessionId: this.config.delivery.backgroundSessionId,
    });
  }

  async runOpenClawAgentTurn({ prompt, deliver, sessionId }) {
    const args = ["agent", "--message", prompt, "--agent", this.config.delivery.agent, "--session-id", sessionId, "--thinking", this.config.delivery.thinking, "--verbose", "off"];

    if (this.config.openclaw.local) {
      args.push("--local");
    }

    if (deliver) {
      args.push("--deliver");
      if (this.config.delivery.replyChannel) {
        args.push("--reply-channel", this.config.delivery.replyChannel);
      }
      if (this.config.delivery.replyTo) {
        args.push("--reply-to", this.config.delivery.replyTo);
      }
      if (this.config.delivery.replyAccount) {
        args.push("--reply-account", this.config.delivery.replyAccount);
      }
    }

    const result = await runCommand(this.config.openclaw.bin, args);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `openclaw exited with code ${result.code}`);
    }
    return true;
  }

  async deliverViaMessageSend(message) {
    if (!this.config.delivery.channel || !this.config.delivery.target) {
      throw new Error("message_send mode requires delivery.channel and delivery.target");
    }

    const args = [
      "message",
      "send",
      "--channel",
      this.config.delivery.channel,
      "--target",
      this.config.delivery.target,
      "--message",
      message,
    ];

    if (this.config.delivery.account) {
      args.push("--account", this.config.delivery.account);
    }

    const result = await runCommand(this.config.openclaw.bin, args);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `openclaw exited with code ${result.code}`);
    }
    return true;
  }

  async openWakeStreamLoop() {
    while (!this.shutdownRequested) {
      try {
        await this.consumeWakeStream();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`wake stream disconnected: ${message}`);
      }

      if (this.shutdownRequested) break;

      this.log(`reconnecting wake stream in ${Math.round(this.reconnectDelayMs / 1000)}s`);
      await delay(this.reconnectDelayMs);
      this.reconnectDelayMs = Math.min(
        this.reconnectDelayMs * 2,
        this.config.polling.maxWakeReconnectMs
      );
    }
  }

  async consumeWakeStream() {
    const response = await fetch(this.config.wakeStreamUrl, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: "text/event-stream",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`wake stream returned ${response.status}`);
    }

    this.reconnectDelayMs = this.config.polling.minWakeReconnectMs;
    let buffer = "";
    const reader = response.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("wake stream ended");
      }

      buffer += this.decoder.decode(value, { stream: true });

      while (buffer.includes("\n\n")) {
        const splitIndex = buffer.indexOf("\n\n");
        const frame = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);
        this.handleWakeFrame(frame);
      }
    }
  }

  handleWakeFrame(frame) {
    const lines = frame.split("\n");
    let event = "message";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data += line.slice(5).trim();
      }
    }

    if (!event) return;
    this.log(`wake stream event: ${event}`);

    if (event === "connected" || event === "resync" || event === "wake") {
      void this.runCheckIn(event);
    }

    if (event === "reconnect") {
      this.reconnectDelayMs = this.config.polling.minWakeReconnectMs;
    }

    if (data && (event === "connected" || event === "wake" || event === "resync")) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.should_check_in === true) {
          void this.runCheckIn(`${event}_hint`);
        }
      } catch {
        // Ignore malformed data hints and rely on the event itself.
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig(args.configPath);
  const bridge = new GennetyOpenClawBridge(config);
  await bridge.start({ once: args.once });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[gennety-bridge] fatal: ${message}`);
  process.exit(1);
});
