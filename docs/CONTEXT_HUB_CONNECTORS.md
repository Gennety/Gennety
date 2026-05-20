# Context Hub: Personal Connectors System
## Technical Specification for Implementation

> **Scope:** Full end-to-end implementation of the personal Connectors feature inside the Gennety platform.
> **Target agent:** Claude Code (or any capable coding agent)
> **Repository:** [gennety/gennety](https://github.com/Gennety/Gennety)
> **Stack:** Next.js · Supabase (Postgres + Auth) · Prisma · grammy (Telegram Bot API v10)
>
> **Related doc:** `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md` describes a separate but complementary feature — connectors for **Community/Team SSOT** (shared knowledge base). This document covers **personal profile connectors** only. The two features use the same connector pattern but write to different targets: this spec writes to `User.profile`, the other writes to `CommunityKnowledgeDocument`.

---

## 1. Overview & Core Idea

Connectors allow a user to link external data sources to their Gennety profile. Once linked, data from those sources is continuously fed into the user's **Context Hub** — the structured long-term memory layer powering the personal AI agent (OpenClaw). OpenClaw reads new data, decides whether it enriches the user's profile, and writes only meaningful updates.

The key design principle is **webhook-first, cost-aware**: data arrives via push notifications whenever possible. Polling is reserved only for sources that lack webhook APIs.

---

## 2. Architecture

### 2.1 Data Flow

```
External Source
      │
      ▼  (push webhook OR scheduled poll)
[Connector Adapter]
      │  raw payload
      ▼
[Ingest Queue]  ← DB-backed (ConnectorEvent table), no Redis in v1
      │  normalized ConnectorEvent
      ▼
[OpenClaw Review Agent]
      │  decides: UPDATE | SKIP
      ▼
[Profile Patcher]
      │  writes only changed fields
      ▼
[User Profile in DB]
```

### 2.2 Components

| Component | Responsibility |
|---|---|
| **Connector Adapter** | Per-source module. Normalizes raw payload into `ConnectorEvent`. |
| **Ingest Queue** | `ConnectorEvent` table rows with `status: "pending"`. No Redis needed. |
| **Review Agent** | OpenClaw sub-prompt. Evaluates `ConnectorEvent` against current profile. Returns `UPDATE` or `SKIP` with diff. |
| **Profile Patcher** | Applies diff to Prisma `User` model. Records audit log entry. |
| **Connector Registry** | `Connector` DB table — which connectors are active per user + auth tokens. |

---

## 3. Supported Connectors (v1)

### Push-based (Webhook)

| Source | Trigger | Data extracted |
|---|---|---|
| **Notion** | Page created / updated | Project names, skill tags, work areas, notes |
| **GitHub** | Push, PR open/merge | Languages used, repos, topics, commit patterns |
| **Telegram** | User-initiated manual sync button | Bio, pinned messages, interests from channels |
| **Linear** | Issue created / completed | Work topics, technologies, project domains |

### Poll-based (every 20 min)

| Source | Interval | Data extracted |
|---|---|---|
| **Obsidian** | 20 min | Notes linked to profile vault folder |

### Explicitly excluded from v1

- **Gmail** — privacy-sensitive, low signal-to-noise for profile enrichment. Revisit in v2.
- **Google Keep / Apple Calendar** — insufficient profile signal; defer to v2.
- **Instagram / TikTok** — requires OAuth apps under review; defer.

---

## 4. Data Model (Prisma)

### 4.1 New tables to create

```prisma
model Connector {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  source       String    // "notion" | "github" | "telegram" | "linear" | "obsidian"
  status       String    @default("active") // "active" | "paused" | "error"
  accessToken  String?   // encrypted OAuth token
  refreshToken String?   // encrypted refresh token
  tokenExpiry  DateTime?
  webhookId    String?   // remote webhook ID from source (for cleanup on disconnect)
  config       Json?     // source-specific config (e.g. Notion workspace ID)
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  events ConnectorEvent[]
}

model ConnectorEvent {
  id             String    @id @default(cuid())
  connectorId    String
  connector      Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  userId         String
  rawPayload     Json      // original data from source
  normalized     Json      // ConnectorEvent shape (see section 5)
  status         String    @default("pending") // "pending" | "processed" | "skipped" | "error"
  agentDecision  String?   // "UPDATE" | "SKIP"
  agentReason    String?   // short explanation from OpenClaw
  profileDiff    Json?     // what was actually written to the profile
  processedAt    DateTime?
  createdAt      DateTime  @default(now())
}

model ProfileAuditLog {
  id        String   @id @default(cuid())
  userId    String
  source    String   // connector source or "manual"
  eventId   String?  // linked ConnectorEvent id
  fieldPath String   // e.g. "skills.languages" or "interests.topics"
  oldValue  Json?
  newValue  Json
  createdAt DateTime @default(now())
}
```

### 4.2 User model — add connector-relevant profile fields

Check the existing Prisma schema in `prisma/schema.prisma`. Add the following fields to the `User` model **only if they don't already exist**:

```prisma
// In User model — add if missing:
skills      Json?  // { languages: string[], tools: string[], domains: string[] }
interests   Json?  // { topics: string[], communities: string[] }
workContext Json?  // { currentProjects: string[], roles: string[] }
connectors  Connector[]
```

---

## 5. ConnectorEvent Shape (Normalized)

Every Connector Adapter outputs this structure:

```typescript
interface ConnectorEvent {
  source: string;        // "notion" | "github" | "telegram" | "linear" | "obsidian"
  userId: string;
  eventType: string;     // e.g. "page.updated", "push", "note.created"
  timestamp: string;     // ISO 8601
  extractedData: {
    skills?:   string[]; // programming languages, tools, frameworks
    topics?:   string[]; // project areas, interest domains
    projects?: string[]; // project/repo names
    bio?:      string;   // free-form biographical text
    tags?:     string[]; // any tags / labels
    rawText?:  string;   // fallback: full text for agent to parse
  };
  metadata?: Record<string, unknown>; // source-specific extra data
}
```

---

## 6. API Routes

### 6.1 Webhook receiver

```
POST /api/connectors/webhook/[source]
```

- Validates request signature (HMAC or source-specific method)
- Saves raw payload to `ConnectorEvent` with `status: "pending"`
- Returns `200 OK` immediately (async processing)
- Enqueues processing job

### 6.2 Manual OAuth connect

```
GET  /api/connectors/auth/[source]           → redirects to OAuth provider
GET  /api/connectors/auth/[source]/callback  → saves tokens, registers webhook

POST   /api/connectors/[connectorId]/pause
POST   /api/connectors/[connectorId]/resume
DELETE /api/connectors/[connectorId]         → revoke tokens + delete remote webhook
```

### 6.3 Status & history

```
GET /api/connectors                        → list user's connectors
GET /api/connectors/[connectorId]/events   → paginated event history
GET /api/profile/context                   → current enriched profile snapshot
```

---

## 7. OpenClaw Review Agent Logic

The Review Agent is a sub-prompt injected into OpenClaw when processing a `ConnectorEvent`. It must be stateless and fast.

### System prompt structure

```
You are the Gennety Profile Review Agent. Your task is to decide
whether new data from a connected source should update the user's profile.

CURRENT PROFILE SNAPSHOT:
{currentProfileJSON}

NEW EVENT FROM {source}:
{normalizedEventJSON}

RULES:
1. Return UPDATE only if new data adds genuinely new information not already in the profile.
2. Return SKIP if the data is already represented, too generic, or irrelevant to the profile.
3. If UPDATE: return the exact JSON diff — only changed fields, no full profile.
4. Keep the diff minimal. Do not remove existing data; only extend or refine it.
5. Maximum profile diff size: 500 tokens.

RESPONSE FORMAT (strict JSON, no prose):
{
  "decision": "UPDATE" | "SKIP",
  "reason": "<one sentence>",
  "diff": { ...only if UPDATE... }
}
```

### Processing function

```typescript
async function processConnectorEvent(eventId: string) {
  const event = await prisma.connectorEvent.findUnique({
    where: { id: eventId },
    include: { connector: true },
  });

  const currentProfile = await getUserProfileSnapshot(event.userId);

  const agentResponse = await callOpenClaw({
    systemPrompt: buildReviewPrompt(currentProfile, event.normalized),
    maxTokens: 600,
  });

  const parsed = JSON.parse(agentResponse);

  if (parsed.decision === "UPDATE") {
    await applyProfileDiff(event.userId, parsed.diff);
    await logProfileAudit(event.userId, event.connector.source, event.id, parsed.diff);
  }

  await prisma.connectorEvent.update({
    where: { id: eventId },
    data: {
      status:        parsed.decision === "UPDATE" ? "processed" : "skipped",
      agentDecision: parsed.decision,
      agentReason:   parsed.reason,
      profileDiff:   parsed.diff ?? null,
      processedAt:   new Date(),
    },
  });
}
```

---

## 8. Poll Scheduler (Obsidian)

Use **Vercel Cron** (already configured in this repo via `vercel.json`):

```json
// vercel.json — add:
{
  "crons": [
    { "path": "/api/connectors/poll/obsidian", "schedule": "*/20 * * * *" }
  ]
}
```

The poll route:
1. Finds all active Obsidian connectors
2. Fetches new notes since `lastSyncAt`
3. Creates `ConnectorEvent` records with `status: "pending"`
4. Triggers `processConnectorEvent` for each

---

## 9. Connector UI (Settings Page)

Add a **Connectors** tab in the user's Settings. Minimum viable UI:

- List of available connectors with connect / disconnect buttons
- Status badge per connector: `active` / `paused` / `error`
- Last synced timestamp
- Recent events log (last 10 events with `decision` + `reason`)
- Manual "Sync now" button (triggers immediate poll / re-fetch)

---

## 10. Security & Privacy

- All OAuth `accessToken` and `refreshToken` values must be **encrypted at rest** (AES-256) before storing in DB. Use a `CONNECTOR_SECRET` env variable as the encryption key. Follow the existing token storage pattern already used in the repo (see `src/lib/` for the token service pattern).
- Webhook endpoints must verify request signatures. Reject requests without valid signatures with `401`.
- Connector text is **untrusted data**. It must never be placed in system prompts as instructions — treat it as user-supplied content only.
- Users can revoke any connector at any time. On revoke: delete tokens from DB, call the source API to delete the registered webhook, delete all `ConnectorEvent` records for that user + source.
- `ConnectorEvent.rawPayload` is sensitive — do not expose it in API responses without explicit user request.

---

## 11. Implementation Order

Implement in this sequence to allow incremental testing:

1. **DB migration** — add `Connector`, `ConnectorEvent`, `ProfileAuditLog` models + User fields
2. **TypeScript types** — `ConnectorEvent` interface in `src/types/connector.ts`
3. **GitHub connector** — full OAuth + webhook flow as the proof-of-concept connector
4. **Review Agent prompt** + `processConnectorEvent()` function
5. **Profile Patcher** + `ProfileAuditLog` writes
6. **Notion connector**
7. **Telegram manual sync** button + adapter
8. **Linear connector**
9. **Obsidian poll** + scheduler
10. **Connectors Settings UI**

---

## 12. Open Questions for Claude Code

Before starting implementation, answer these questions by inspecting the codebase:

```
1. Read prisma/schema.prisma — what fields already exist on the User model?
   We need to know before adding skills / interests / workContext to avoid conflicts.

2. Read src/lib/ — is there already a pattern for calling LLMs (OpenAI, Claude, etc.)?
   Show the existing wrapper function signature.
   The Review Agent (section 7) will reuse the same pattern.

3. Is there a token encryption service in the codebase?
   Search src/lib/ for AES, crypto, or "token" utilities.
   We must use the existing pattern for storing OAuth tokens.

4. Check src/app/api/ structure — what is the existing route handler convention?
   (e.g., do routes export named functions like `export async function POST(req)` ?)

5. Read AGENTS.md — what is the current OpenClaw agent invocation interface?
   We need to know how to call it for the Review Agent sub-prompt.
```

---

## 13. File Placement

| New file | Path |
|---|---|
| DB migration | `prisma/migrations/YYYYMMDD_add_personal_connectors/` |
| Type definitions | `src/types/connector.ts` |
| Connector adapters | `src/lib/connectors/[source].ts` |
| Review Agent | `src/lib/agents/review-agent.ts` |
| Profile Patcher | `src/lib/profile/patcher.ts` |
| Webhook route | `src/app/api/connectors/webhook/[source]/route.ts` |
| OAuth routes | `src/app/api/connectors/auth/[source]/route.ts` |
| Poll route | `src/app/api/connectors/poll/obsidian/route.ts` |
| Connector list API | `src/app/api/connectors/route.ts` |
| Settings UI | `src/app/(dashboard)/settings/connectors/page.tsx` |

---

## 14. Key Decisions Summary

- **No Redis in v1.** Queue is the `ConnectorEvent` table (`status: "pending"`).
- **Review Agent logic is identical for all sources.** No privileged connectors.
- **Gmail, Google Keep, Apple Calendar excluded from v1.**
- **Webhook-first.** Obsidian is the only polled source in v1.
- **Profile updates are additive only.** The Review Agent never removes existing data.
- **Token encryption is mandatory** before any connector can be activated.
- **Not the same as Community Connectors.** See `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md` — that document covers connectors that write to community SSOT (`CommunityKnowledgeDocument`). This spec writes to the personal `User.profile` only.
