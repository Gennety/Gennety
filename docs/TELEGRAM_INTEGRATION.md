# Telegram Integration (Intelligram) Specification

Status: authoritative future Telegram Integration spec.
Cross-references:
- [MODEL_ROUTING.md](file:///Users/pro/Desktop/Gennety/docs/MODEL_ROUTING.md) (model task 'negotiation' and 'hub_search_answer')
- [TEAM_FRAMEWORK.md](file:///Users/pro/Desktop/Gennety/docs/TEAM_FRAMEWORK.md) (Owner database references and AgentSelfAssessment data structures)
- [AGENT_COLLABORATION_PIPELINE.md](file:///Users/pro/Desktop/Gennety/docs/AGENT_COLLABORATION_PIPELINE.md) (Task pipeline events and status flags)

---

## 1. Goal and Concepts

Telegram is the primary mobile gateway for Gennety. The **Intelligram** suite turns a standard Telegram bot into a feature-rich workspace by combining a Grammy-powered bot framework with a Next.js-based Telegram Mini App (TMA). It enables users to view matches, authorize Web sessions, review agent-to-agent negotiations, track team tasks, and review weekly strategy reports.

---

## 2. Intelligram Modules

### BLOCK A — Bot Setup & Authentication

1. **Grammy Bot Core**: Setup a Grammy bot instance configured in `src/lib/telegram/bot.ts`.
2. **`verifyInitData`**: Implement HMAC-SHA256 signature verification of the raw Telegram WebApp `initData` using the bot token as the secret.
3. **`issueUnifiedToken`**: Generates a JWT encoding the verified `telegramId` and the corresponding Gennety `ownerId` from the `Owner` model.
4. **Endpoint `POST /api/telegram/auth`**: Consumes `initData` and returns the JWT session token.
5. **Private Forum Group Onboarding**:
   * *Telegram Constraint*: Forum topics are not supported in direct message (DM) chats with bots; they require a Supergroup.
   * *Solution*: On first login, the bot prompts the user to create a private group with the bot and enable Topics, or the bot automates invite/setup.
   * *`createUserTopics`*: Creates 5 Forum Topics (using Bot API 9.4 `createForumTopic`) in the private workspace group:
     * 💛 `My Matches` (thread for matchmaking events)
     * 📅 `Dates` (thread for date/meeting setup)
     * ⚙️ `Settings` (thread for preferences/privacy configuration)
     * 🤖 `Agent Log` (thread for direct agent activity logging)
     * 👥 `Team Space` (thread for shared team chat)
   * *Fallback*: If the user interacts only via direct messages (`has_topics_enabled = false`), the bot runs in single-channel mode, sending all notifications as direct messages with inline command headers.

### BLOCK B — Onboarding Webhook

1. **Endpoint `POST /api/telegram/webhook`**: Standard webhook listener for incoming Telegram updates.
2. **Command `/start`**: Sends a greeting message containing a description of Gennety and an inline button to launch the Mini App.
3. **Callback Handler**: Processes inline button callback queries for initial profile options.

### BLOCK C — Bot-to-Bot Negotiation Protocol

Gennety agents conduct matchmaking negotiations autonomously using Telegram's Bot API 10.0.

1. **Handshake**: Agent A sends a `NegotiationPayload` to Agent B (using B's configured Telegram username).
2. **Evaluation**: Agent B evaluates compatibility using `resolveModel('negotiation')`.
3. **Surfacing**: Updates are written to `NegotiationLog` and push notifications are sent to the `My Matches` topic for both Owners.
4. **Copy Pattern**: `"Your agent started a conversation with @username's agent."`
5. **Payload Schema**:
   ```ts
   interface NegotiationPayload {
     type: 'negotiation_request';
     fromAgentId: string;
     matchCandidateId: string;
     contextSummary: string;
     compatibilityScore: number;
     proposedTopics: string[];
   }
   ```

### BLOCK D — Native Match Card

1. **`sendLivePhoto`**: Sends an interactive live photo card (using Bot API 10.0) with candidate summary caption.
2. **Inline Buttons (Bot API 9.4)**:
   * 💬 `Start Chat` (green callback button to open direct chat)
   * 🤖 `Agent Dialogue` (opens Mini App showing the step-by-step agent negotiation log)
   * `Schedule Call` (opens scheduler)
   * ✕ `Skip` (declines match, moves status to `DORMANT`)
3. **Delivery**: Routed directly to the `My Matches` topic by matching its `message_thread_id` from `TelegramTopic`.

### BLOCK E — Team Space Notifications

1. **Routing**: Task pipeline events (`notifyTaskProposed`, `notifyTaskCompleted`, `notifyApprovalRequested`, `notifyStrategySessionDone`, `notifyBlockerFlagged`) are formatted and posted directly to the `Team Space` topic.
2. **Conditional Activation**: The `Team Space` topic is only active if the corresponding community has `teamMode = true` and the Owner has joined.
3. **Integration**: Wires into events in `src/lib/services/agent-task-pipeline.ts` and `src/lib/services/community-strategy.ts`.

---

## 3. Database Schema

Add the following structures to `prisma/schema.prisma`:

```prisma
// Modify model Owner to include:
// telegramId String? @unique @map("telegram_id")
// telegramTopics TelegramTopic[]

model TelegramTopic {
  id              String   @id @default(cuid())
  ownerId         String   @map("owner_id")
  owner           Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  topicType       String   @map("topic_type") // "matches" | "dates" | "settings" | "agent_log" | "team_space"
  messageThreadId Int      @map("message_thread_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([ownerId, topicType])
  @@map("telegram_topics")
}
```

---

## 4. Mini App WebView Screens (BLOCK G)

The TMA renders the following full-screen views inside Telegram:
* **Onboarding**: Form collecting name, professional domain, preferences, and privacy checklist.
* **Match Feed**: Swipable list showing active match proposals and compatibility scores.
* **Agent Chat**: Direct DM interface between the Owner and their own Agent.
* **Agent Dialogue Viewer**: Displays detailed text transcripts of agent-to-agent negotiations (from `NegotiationLog`).
* **Team Space Screen**: Renders the task list, a search bar for the Context Hub, and recent activity logs.
* **Strategy Summary**: Displays the weekly strategy results, highlighting judge findings.

---

## 5. Security & Redaction Rules

1. **Redact Tokens**: Webhook logs and error handlers must redact `TELEGRAM_BOT_TOKEN` and JWTs before outputting to stdout or third-party loggers.
2. **JWT Expiry**: WebApp session tokens must expire within 7 days, requiring re-validation of `initData` HMAC.
3. **Signature Bounds**: Webhook updates must match the Telegram CIDR IP range or verify signature checks to prevent malicious HTTP triggers.
