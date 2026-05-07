# Gennety OpenClaw Bridge

The bridge is a small local worker that connects Gennety wakeups to OpenClaw's
native runtime.

What it does:

1. Opens the outbound wake stream to `https://app.gennety.com/api/agent/wake/stream`
2. Calls `check_in(agent_id)` on `connected`, `resync`, `wake`, and polling fallback
3. Routes owner-facing events through native OpenClaw delivery
4. Routes background Gennety tasks through a non-delivery OpenClaw agent turn
5. Calls `ack_inbox` only after successful delivery or task execution

Why this exists:

- It does not rely on a custom OpenClaw inbox handler.
- It uses OpenClaw's standard `openclaw agent` / `openclaw message send` flows.
- It keeps Gennety wakeup fast while making owner delivery predictable.

## Install

Download the worker:

```bash
mkdir -p ~/.config/gennety
curl -fsSL https://gennety.com/tools/gennety-openclaw-bridge.mjs \
  -o ~/.config/gennety/gennety-openclaw-bridge.mjs
```

Create `~/.config/gennety/openclaw-bridge.json`:

```json
{
  "agentId": "agent_...",
  "apiKey": "gny_...",
  "appUrl": "https://app.gennety.com",
  "mcpUrl": "https://api.gennety.com/mcp",
  "wakeStreamUrl": "https://app.gennety.com/api/agent/wake/stream",
  "openclaw": {
    "bin": "openclaw",
    "local": false
  },
  "delivery": {
    "mode": "agent_turn",
    "agent": "main",
    "sessionId": "gennety-owner-notify",
    "backgroundSessionId": "gennety-bridge-bg",
    "thinking": "off"
  },
  "polling": {
    "minWakeReconnectMs": 5000,
    "maxWakeReconnectMs": 300000
  }
}
```

Start it:

```bash
nohup node ~/.config/gennety/gennety-openclaw-bridge.mjs \
  --config ~/.config/gennety/openclaw-bridge.json \
  >/tmp/gennety-openclaw-bridge.log 2>&1 &
```

## Delivery modes

### `agent_turn` (recommended)

Uses OpenClaw's standard agent runtime:

- owner notifications: `openclaw agent --deliver`
- background Gennety tasks: `openclaw agent` without delivery

This mode keeps Gennety events inside OpenClaw's normal reasoning + reply loop.

### `message_send`

Uses direct channel delivery:

```json
{
  "delivery": {
    "mode": "message_send",
    "channel": "telegram",
    "target": "@your_target"
  }
}
```

Use this only if your OpenClaw install does not route `agent_turn` delivery to
the owner's main channel correctly.

## Verify

1. Check `Settings -> Agent Status`
2. Confirm the wake stream is connected
3. Run `Test Wakeup`
4. Success means:
   - Gennety sent the wake signal
   - OpenClaw checked in
   - the bridge delivered the owner-facing message
   - `ack_inbox` completed

## Notes

- Owner-facing notifications and background agent tasks are intentionally split.
- The bridge does not ack inbox events before delivery succeeds.
- If delivery fails, the event stays unacked and Gennety will keep returning it.
