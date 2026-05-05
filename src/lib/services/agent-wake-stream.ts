import crypto from "node:crypto";

const HEARTBEAT_MS = 25_000;
const MAX_CONNECTION_MS = 55 * 60_000;

export interface WakeStreamPayload {
  kind: string;
  reason: string;
  urgency?: "normal" | "high";
  referenceId?: string | null;
  createdAt?: string;
}

export interface WakeStreamDeliveryResult {
  delivered: boolean;
  connectionCount: number;
  deliveredAt: Date;
}

interface WakeStreamConnection {
  connectionId: string;
  agentInternalId: string;
  agentExternalId: string;
  connectedAt: Date;
  send: (event: string, data: Record<string, unknown>) => boolean;
  close: (reason: string) => void;
}

type ConnectionMap = Map<string, Map<string, WakeStreamConnection>>;

const globalForWakeStreams = globalThis as unknown as {
  gennetyWakeStreams?: ConnectionMap;
};

const wakeStreams =
  globalForWakeStreams.gennetyWakeStreams ?? new Map<string, Map<string, WakeStreamConnection>>();

globalForWakeStreams.gennetyWakeStreams = wakeStreams;

function formatSse(event: string, data: Record<string, unknown>, id?: string) {
  const lines = [`event: ${event}`];
  if (id) lines.unshift(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join("\n")}\n\n`;
}

function registerConnection(connection: WakeStreamConnection) {
  const existing = wakeStreams.get(connection.agentInternalId) ?? new Map<string, WakeStreamConnection>();
  existing.set(connection.connectionId, connection);
  wakeStreams.set(connection.agentInternalId, existing);
}

function unregisterConnection(agentInternalId: string, connectionId: string) {
  const existing = wakeStreams.get(agentInternalId);
  if (!existing) return;
  existing.delete(connectionId);
  if (existing.size === 0) wakeStreams.delete(agentInternalId);
}

export function hasLiveWakeStream(agentInternalId: string) {
  return (wakeStreams.get(agentInternalId)?.size ?? 0) > 0;
}

export function getWakeStreamConnectionCount(agentInternalId: string) {
  return wakeStreams.get(agentInternalId)?.size ?? 0;
}

export function emitWakeStreamEvent(
  agentInternalId: string,
  payload: WakeStreamPayload
): WakeStreamDeliveryResult {
  const deliveredAt = new Date();
  const connections = wakeStreams.get(agentInternalId);
  if (!connections || connections.size === 0) {
    return { delivered: false, connectionCount: 0, deliveredAt };
  }

  let delivered = 0;
  for (const connection of connections.values()) {
    const ok = connection.send("wake", {
      kind: payload.kind,
      reason: payload.reason,
      urgency: payload.urgency ?? "normal",
      reference_id: payload.referenceId ?? null,
      should_check_in: true,
      created_at: payload.createdAt ?? deliveredAt.toISOString(),
    });
    if (ok) delivered += 1;
  }

  return {
    delivered: delivered > 0,
    connectionCount: connections.size,
    deliveredAt,
  };
}

export function createAgentWakeStream({
  agentInternalId,
  agentExternalId,
  onDisconnect,
}: {
  agentInternalId: string;
  agentExternalId: string;
  onDisconnect?: (args: {
    connectionId: string;
    connectedAt: Date;
    disconnectedAt: Date;
    reason: string;
  }) => void;
}) {
  const connectionId = crypto.randomUUID();
  const connectedAt = new Date();
  const encoder = new TextEncoder();
  let heartbeat: NodeJS.Timeout | null = null;
  let maxAge: NodeJS.Timeout | null = null;
  let closed = false;
  let connection: WakeStreamConnection | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(formatSse(event, data, connectionId)));
          return true;
        } catch {
          close("write_failed");
          return false;
        }
      };

      const close = (reason: string) => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (maxAge) clearTimeout(maxAge);
        unregisterConnection(agentInternalId, connectionId);
        try {
          controller.close();
        } catch {
          // The client may already have disconnected.
        }
        onDisconnect?.({
          connectionId,
          connectedAt,
          disconnectedAt: new Date(),
          reason,
        });
      };

      connection = {
        connectionId,
        agentInternalId,
        agentExternalId,
        connectedAt,
        send,
        close,
      };
      registerConnection(connection);

      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      send("connected", {
        connection_id: connectionId,
        agent_id: agentExternalId,
        connected_at: connectedAt.toISOString(),
      });
      send("resync", {
        reason: "wake_stream_connected",
        should_check_in: true,
        created_at: connectedAt.toISOString(),
      });

      heartbeat = setInterval(() => {
        send("ping", {
          connection_id: connectionId,
          server_time: new Date().toISOString(),
        });
      }, HEARTBEAT_MS);

      maxAge = setTimeout(() => {
        send("reconnect", {
          reason: "connection_rotation",
          retry_ms: 5000,
          created_at: new Date().toISOString(),
        });
        close("connection_rotation");
      }, MAX_CONNECTION_MS);
    },
    cancel() {
      connection?.close("client_cancelled");
    },
  });

  return { stream, connectionId, connectedAt };
}
