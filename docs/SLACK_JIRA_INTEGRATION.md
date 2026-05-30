# Slack & Jira Corporate Integration Specification

Status: authoritative future Corporate Layer integration spec.
Cross-references:
- [MODEL_ROUTING.md](file:///Users/pro/Desktop/Gennety/docs/MODEL_ROUTING.md) (model tasks for parsing conversation contexts)
- [CONTEXT_HUB_CONNECTORS.md](file:///Users/pro/Desktop/Gennety/docs/CONTEXT_HUB_CONNECTORS.md) (AES-256-GCM token encryption standard)
- [AGENT_COLLABORATION_PIPELINE.md](file:///Users/pro/Desktop/Gennety/docs/AGENT_COLLABORATION_PIPELINE.md) (Human-in-the-Loop approval events, `AgentTask` transitions)

---

## 1. Goal and Concepts

To enable enterprise team adoption, Gennety must integrate directly into corporate environments. The corporate layer acts as a bridge, allowing agents and human managers to coordinate within the channels they already use. 

This specification covers:
1. **Slack integration**: Interactive App Home dashboard, Block Kit notification routing, and interactive task approval buttons.
2. **Jira Forge panels**: Ticket context matching against Context Hub, issue event tracking, and Confluence wiki synchronization.
3. **Enterprise security boundaries**: Encrypted workspace credentials and rate-limiting safeguards.

---

## 2. Database Schema

Add the following structures to `prisma/schema.prisma` to manage corporate configurations:

```prisma
model CorporateConnector {
  id              String    @id @default(cuid())
  communityId     String    @map("community_id")
  community       Community @relation(fields: [communityId], references: [id], onDelete: Cascade)
  
  platform        String    // "SLACK" | "JIRA"
  enabled         Boolean   @default(true)
  
  // Encrypted workspace credentials (AES-256-GCM)
  encryptedToken  String    @map("encrypted_token") @db.Text
  tokenIv         String    @map("token_iv")
  webhookSecret   String?   @map("webhook_secret")
  
  externalSpaceId String    @map("external_space_id") // Slack Workspace ID or Jira Cloud ID
  config          Json?     // Channel-to-thread mappings, synchronization preferences
  
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@unique([communityId, platform])
  @@map("corporate_connectors")
}
```

---

## 3. Slack Integration Blueprint

### 3.1 App Home Tab (Dashboard)
The App Home displays an interactive view generated using Slack Block Kit JSON:
* **Community Status Summary**: Active members, budget health metrics (from `docs/MODEL_ROUTING.md`).
* **Task Pipeline Overview**: A list of tasks assigned to agents or waiting for human approval.
* **Match Feeds**: For team-matching contexts, summaries of current handshake opportunities.

### 3.2 Block Kit Notification & Interactive Approvals
When a critical operation requires human sign-off (e.g., `requiresHitl = true` in task pipeline):
1. Gennety posts a structured Block Kit message to the configured Slack administration channel:
   ```json
   {
     "blocks": [
       {
         "type": "section",
         "text": {
           "type": "mrkdwn",
           "text": "*Approval Required:* Agent is requesting permission to publish release notes."
         }
       },
       {
         "type": "actions",
         "elements": [
           {
             "type": "button",
             "text": {"type": "plain_text", "text": "Approve"},
             "style": "primary",
             "action_id": "approve_task_123"
           },
           {
             "type": "button",
             "text": {"type": "plain_text", "text": "Reject"},
             "style": "danger",
             "action_id": "reject_task_123"
           }
         ]
       }
     ]
   }
   ```
2. The Owner clicks "Approve". Slack sends an interactive payload to `/api/webhooks/slack/actions`.
3. Gennety verifies the Slack signature, decrypts the workspace token, maps the Slack user to an `Owner` ID, updates `AgentTask.status` to `ASSIGNED`, and posts a success confirmation back to Slack.

### 3.3 Slash Commands
* `/gennety-search [query]`: Invokes cosine-similarity search on `CommunityKnowledgeChunk` (filtered by the user's workspace roles) and returns matching bullet points.
* `/gennety-task`: Lists all active tasks assigned to agents within the community.

---

## 4. Jira & Confluence Integration Blueprint

### 4.1 Jira Forge Context Panel
Gennety exposes a custom Forge panel in Jira Issue Details:
1. When an issue page is loaded, Jira Forge requests the Gennety context match endpoint: `/api/jira/issue-context`.
2. Gennety extracts ticket title/description, calls `resolveModel("hub_search_answer")` to retrieve related items in the Context Hub, and lists suggested documentation or resolution paths.

### 4.2 Ticket Event Webhook
Updates to Jira issues (Status transition, comments) send webhooks to `/api/webhooks/jira/events`. These events are normalized and appended to `TeamActivityLog` under the `"task"` category.

### 4.3 Confluence Strategy Sync
* At the conclusion of a strategy session, the Judge Agent's final report is sent to the Confluence API as a new wiki page inside a configured space.
* Direct edits on Confluence wiki pages trigger webhooks that sync updates back to the community's `CommunityKnowledgeDocument` database.

---

## 5. Security & Rate-Limiting Constraints

1. **Verify Signatures**: All incoming Slack payloads must validate the `X-Slack-Signature` header using the signing secret configured in `CorporateConnector.webhookSecret`.
2. **Decoupled Call Queue**: External API calls to Slack and Jira are placed in an asynchronous queue (e.g. Redis-backed BullMQ). This prevents blocking next.js API threads and manages platform rate limits (e.g., Slack's Tier 3 limits) by pacing retry sequences.
3. **Sensitive Data Redaction**: Slack message listeners must ignore any message containing bot tokens, credentials, or strings matching patterns of confidential environments. Channels containing private DMs must never be parsed.
