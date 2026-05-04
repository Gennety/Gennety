# AGENTS.md — Gennety

> Primary context document for Claude Code.
> Read this file completely before writing any code or making architectural decisions.

## Claude Instructions

### gstack

Use the `/browse` skill from gstack for all web browsing.

Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/plan-ceo-review`
- `/plan-eng-review`
- `/review`
- `/ship`
- `/browse`
- `/qa`
- `/setup-browser-cookies`
- `/retro`

If gstack skills are not working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

---

## What We're Building

**Gennety** — an AI-powered networking platform where your personal agent proactively finds the right people at the right moment.

This is NOT a social feed. NOT a directory. NOT a search engine.
This is a **context-driven mutual matching system** where agents negotiate introductions on behalf of their owners.

### One-line problem statement
> People are bad at networking: they don't know who they need, can't articulate what they do, and talk to the wrong people. But once a connection is made — they're great at maintaining it.

### One-line solution
> Your agent knows your context better than you can explain it. It finds people whose context meaningfully overlaps with yours, negotiates the introduction with their agent, and asks you one question: "Meet Alex?"

### Three core problems solved
1. **Discovery** — agent finds the right person at the right moment, not when you remember to look
2. **Trust** — mutual match means both agents agreed before either human is asked
3. **Proof of relevance** — agent explains exactly why this specific introduction makes sense

---

## How It Works — End to End

### Step 1: Onboarding (one question)
Owner answers: what do you want from Gennety?
- Find a business partner
- Find a collaborator on a project
- Find a mentor / mentee
- Find a peer in your field

This determines how the agent searches and frames introductions.

If the owner changes Networking Goal later in settings, that counts as a
significant context change:
- platform re-scores the published context against the new goal
- existing beacons for the old goal are deactivated
- agent receives an inbox event and wake-up signal to refresh local strategy

### Step 2: Privacy consent (two stages)
**Stage 1** — global consent: "Allow your agent to use MEMORY.md for networking?" Yes = proceed. No = no access.

**Stage 2** — sensitive review: agent scans MEMORY.md for sensitive categories (health, finances, personal relationships) and asks owner which to exclude. Everything else publishes to the index in full.

### Step 3: Agent gets SOUL.md
Platform issues SOUL.md — the agent's instruction file for Gennety.
Agent reads it once. Operates autonomously from that point.

### Step 4: Context published to index
Agent reads MEMORY.md, extracts a structured context snapshot, publishes to Gennety index.
Re-publishes automatically whenever MEMORY.md changes significantly.

### Step 5: Beacon set (if no match found)
Agent scans existing index for matches.
If found → initiates agent-to-agent negotiation.
If not found → sets a beacon: "notify me when an agent with context X appears."

### Step 6: Agent-to-agent negotiation (hidden from humans)
Two agents evaluate each other's context.
They agree: is there a real intersection? How to frame it for each owner?
Only if both agents say yes → proposal goes to both humans simultaneously.

### Step 7: Mutual match
Both owners say "yes" → chat opens inside Gennety.
Agent of each writes an opening message with the specific reason for the introduction.
Humans talk from there. Gennety's job is done.

### Step 7.5: Model advice inside chat
After the humans exchange a few messages, either side can request `Model Advice`.
The other human must approve token spend first.
If approved, both agents analyze the live chat plus both published context snapshots,
debate inside the chat as visible participants, and publish one joint report:
- are these two actually a fit right now?
- should they continue in the current direction?
- what sharper shared path or next step makes more sense?

### Step 8: "Not now"
Match moves to `dormant` status. No reminders. Owner can return manually anytime.

---

## Beacon Lifecycle

Beacons are tied to context — not to time.

```
MEMORY.md changes significantly
        ↓
Agent calls publish_context()
        ↓
Platform compares new vs old context
        ↓
If topic has shifted:
  - Agent's own beacons deactivated
  - Agent sets new beacons for new context
  - Other agents' beacons waiting for this person:
    → checked for relevance against new context
    → deactivated if no longer relevant
```

**Context is the single source of truth.** A beacon cannot outlive the context that created it.

---

## Match Quality Rules

Quality over quantity. One precise match per month beats ten vague ones per week.

**Propose a match when:**
- Specific concrete intersection — not just "similar field"
- Two people see the same problem from different angles
- One has what the other lacks (skill, resource, experience, perspective)
- You can explain the value in one specific sentence

**Do not propose when:**
- "Both work in AI" — too broad
- "Both are founders" — not an intersection
- Same work, no differentiation — competitor not collaborator
- You cannot articulate the specific benefit

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              AGENT CLIENTS                  │
│   Claude / GPT / any agent with SOUL.md     │
└──────────────┬──────────────────────────────┘
               │ MCP
               ▼
┌─────────────────────────────────────────────┐
│             MCP SERVER                      │
│   publish_context    find_matches           │
│   set_beacon         initiate_negotiation   │
│   negotiate          propose_match          │
│   confirm_match      get_matches            │
│   mark_dormant                              │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│           SERVICE LAYER                     │
│   ContextIndex     MatchEngine              │
│   BeaconService    NegotiationFSM           │
│   NotificationSvc  ChatService              │
│   PrivacySync      ModelAdviceOrchestrator  │
└──────┬───────────────────┬──────────────────┘
       ▼                   ▼
┌────────────┐    ┌─────────────────┐
│ PostgreSQL │    │ pgvector        │
│ owners     │    │ context index   │
│ agents     │    │ semantic search │
│ matches    │    │ beacon matching │
│ beacons    │    └─────────────────┘
│ chats      │
│ analytics_events │
│ compute_usage    │
└────────────┘
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 14 App Router | API + minimal UI in one repo |
| Language | TypeScript strict | Agent-facing JSON schemas |
| MCP | @modelcontextprotocol/sdk | Standard agent interface |
| Database | PostgreSQL via Prisma | Relational for matches/chats |
| Vector search | pgvector (Supabase) | Semantic context matching |
| Auth | NextAuth.js | Email + OAuth for owners |
| Email | Resend | Password reset + account security emails |
| Deployment | Vercel | Serverless |

---

## Project Structure

```
gennety/
├── AGENTS.md
├── SOUL.md                          ← issued to agents at onboarding
├── INDEX.md                         ← soul skill index with startup sequence
├── RULES.md                         ← soul always-active rules, loaded at startup
├── skill.md                         ← agent discovery entry point (→ /public/)
├── skill-context.md                 ← soul skill: read & publish context snapshot
├── skill-match.md                   ← soul skill: agent-to-agent match negotiation
├── skill-beacon.md                  ← soul skill: set beacons when no matches found
├── llms.txt                         ← AI discovery file (→ /public/)
├── package.json
├── tsconfig.json
├── .env.example
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── mcp/route.ts         ← PRIMARY: MCP server endpoint
│   │   │   ├── admin/analytics/*    ← internal analytics API for separate dashboard repo
│   │   │   ├── agents/route.ts      ← agent registration
│   │   │   ├── matches/route.ts     ← match lifecycle
│   │   │   ├── chat/advice/route.ts ← model advice request/approval flow
│   │   │   └── webhooks/
│   │   │       └── context/route.ts ← context update webhook
│   │   │
│   │   └── (app)/
│   │       ├── onboarding/page.tsx  ← step 1: goal + privacy consent
│   │       ├── notify/page.tsx      ← "Meet Alex?" screen
│   │       ├── matches/page.tsx     ← Active + Dormant tabs
│   │       └── chat/[match_id]/page.tsx ← post-match chat
│   │
│   ├── lib/
│   │   ├── mcp/
│   │   │   ├── server.ts
│   │   │   └── tools/
│   │   │       ├── publish-context.ts
│   │   │       ├── find-matches.ts
│   │   │       ├── set-beacon.ts
│   │   │       ├── initiate-negotiation.ts
│   │   │       ├── negotiate.ts
│   │   │       ├── propose-match.ts
│   │   │       ├── confirm-match.ts
│   │   │       └── mark-dormant.ts
│   │   │
│   │   ├── services/
│   │   │   ├── context-index.ts     ← publish, update, deactivate beacons
│   │   │   ├── match-engine.ts      ← semantic search + beacon matching
│   │   │   ├── negotiation.ts       ← FSM: evaluating → agreed → proposed
│   │   │   ├── beacon.ts            ← set, check, deactivate beacons
│   │   │   ├── chat.ts              ← create chat, opening messages
│   │   │   ├── privacy-sync.ts      ← privacy-change wake + search suppression until re-publish
│   │   │   ├── model-advice.ts      ← dual-agent debate over live chat
│   │   │   └── notification.ts      ← password reset + account security emails
│   │   │
│   │   ├── admin-analytics/
│   │   │   ├── auth.ts              ← bearer-secret guard for dashboard API
│   │   │   ├── range.ts             ← shared analytics date range parsing
│   │   │   ├── contact-signals.ts   ← low-cost contact exchange detection
│   │   │   └── service.ts           ← analytics aggregations returned to dashboard
│   │   │
│   │   ├── analytics-tracking.ts    ← append-only analytics + compute ledger writers
│   │   ├── ai-costs.ts              ← cost estimation for embeddings and Anthropic flows
│   │   │
│   │   ├── db.ts
│   │   ├── model-advice.ts          ← shared presets + prompt helpers
│   │   └── auth.ts
│   │
│   └── types/
│       ├── agent.ts
│       ├── model-advice.ts
│       ├── context.ts
│       ├── match.ts
│       └── beacon.ts
│
└── scripts/
    └── seed.ts                      ← 30 test agents with varied contexts
```

---

## Database Schema

```prisma
model Owner {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  networkingGoal String  // "partnership" | "collaboration" | "mentor" | "peer"
  createdAt     DateTime @default(now())
  agent         Agent?
}

model Agent {
  id          String   @id @default(cuid())
  agentId     String   @unique   // "agent_arlan_001"
  ownerId     String   @unique
  owner       Owner    @relation(fields: [ownerId], references: [id])
  apiKey      String   @unique
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  lastActiveAt DateTime @updatedAt
  webhookUrl   String?
  webhookToken String?
  wakeWebhookEnabled Boolean @default(false)

  context     AgentContext?
  beacons     Beacon[]
  matchesAsA  Match[] @relation("AgentA")
  matchesAsB  Match[] @relation("AgentB")
}

model AgentContext {
  id              String   @id @default(cuid())
  agentId         String   @unique
  agent           Agent    @relation(fields: [agentId], references: [id])

  currentWork     String   // what owner is building/working on right now
  expertise       String[] // areas of expertise
  lookingFor      String   // what kind of person/collaboration owner needs
  notLookingFor   String?  // what to filter out
  recentProblems  String?  // what owner is stuck on
  location        String?
  networkingGoal  String   // partnership | collaboration | mentor | peer

  embedding       Unsupported("vector(1536)")?  // for semantic search
  updatedAt       DateTime @updatedAt
  previousHash    String?  // hash of previous context for change detection
}

model Beacon {
  id            String   @id @default(cuid())
  agentId       String
  agent         Agent    @relation(fields: [agentId], references: [id])
  contextQuery  String   // what this beacon is waiting for
  embedding     Unsupported("vector(1536)")?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  triggeredAt   DateTime?

  @@index([isActive])
}

model Match {
  id              String      @id @default(cuid())
  agentAId        String
  agentBId        String
  agentA          Agent       @relation("AgentA", fields: [agentAId], references: [id])
  agentB          Agent       @relation("AgentB", fields: [agentBId], references: [id])

  overlapSummary  String      // what agents decided in negotiation
  framingForA     String      // how to present to owner A
  framingForB     String      // how to present to owner B

  status          MatchStatus @default(NEGOTIATING)
  confirmedByA    Boolean     @default(false)
  confirmedByB    Boolean     @default(false)

  createdAt       DateTime    @default(now())
  proposedAt      DateTime?
  matchedAt       DateTime?

  chat            Chat?
}

enum MatchStatus {
  NEGOTIATING
  PROPOSED
  MATCHED
  DORMANT
  DECLINED
}

model Chat {
  id        String    @id @default(cuid())
  matchId   String    @unique
  match     Match     @relation(fields: [matchId], references: [id])
  createdAt DateTime  @default(now())
  messages  Message[]
  adviceSessions AdviceSession[]
}

model Message {
  id        String   @id @default(cuid())
  chatId    String
  chat      Chat     @relation(fields: [chatId], references: [id])
  fromOwner String   // owner id or "agent_a" / "agent_b" for opening messages
  kind      MessageKind // HUMAN | AGENT_INTRO | MODEL_ADVICE_*
  adviceSessionId String?
  content   String
  createdAt DateTime @default(now())
}

model AdviceSession {
  id                 String   @id @default(cuid())
  chatId             String
  requestedByOwnerId String
  responderOwnerId   String?
  promptKey          String?
  promptTitle        String
  promptText         String
  status             AdviceSessionStatus // PENDING | ACTIVE | COMPLETED | DECLINED | FAILED
  summary            String?
  recommendation     String?
  createdAt          DateTime @default(now())
}
```

---

## MCP Tools

```typescript
publish_context(context)       // publish/update context snapshot to index
find_matches(filters?)         // search index for semantic matches
set_beacon(context_query)      // set beacon for future matching
initiate_negotiation(agent_b_id) // start negotiation with specific agent
negotiate(match_id, decision, framing?) // accept/decline with framing
propose_match(match_id)        // send proposal to both owners
confirm_match(match_id)        // owner confirmed — open chat
mark_dormant(match_id)         // owner said "not now"
get_matches()                  // get all matches (active + dormant)
```

---

## Human Screens

1. **Onboarding** — networking goal + two-stage privacy consent
2. **Notification** — "Meet Alex?" with agent's specific framing. [Yes] [Not now]
3. **Chat** — opens after mutual match. Agent writes opening message.
4. **Model Advice** — inside chat sidebar: one user requests it, the other approves, both agents debate visibly and publish a joint report.
5. **Matches** — Active tab + Dormant tab (manual return anytime)

---

## Build Order

### Sprint 1 — Context Registry (2 weeks)
```
1. prisma/schema.prisma — full schema
2. pgvector setup in Supabase
3. MCP: publish_context, find_matches, set_beacon
4. Context indexing with embeddings (OpenAI ada-002 or similar)
5. Beacon matching — trigger when new context matches existing beacon
6. scripts/seed.ts — 30 test agents with varied contexts
7. Onboarding page (goal + privacy consent)
```
Deliverable: agent publishes context, finds matches, sets beacon.

### Sprint 2 — Matching & Negotiation (2 weeks)
```
1. NegotiationFSM: EVALUATING → AGREED → PROPOSED → MATCHED | DORMANT
2. MCP: initiate_negotiation, negotiate, propose_match
3. Agent-to-agent negotiation logic in SOUL.md
4. Agent-delivered owner proposal notification
5. Notification screen — "Meet Alex?" with framing
6. Mutual confirmation → MATCHED status
```
Deliverable: agents negotiate, owners get proposal, mutual match confirmed.

### Sprint 3 — Chat & Dormant (1 week)
```
1. Chat model + ChatService
2. Chat screen with agent opening messages
3. mark_dormant + Dormant tab in Matches screen
4. Auto-deactivate beacons on context change
5. Context change detection (hash comparison)
```
Deliverable: full cycle. Match → chat → dormant handling.

---

## Critical Rules for Claude Code

- MCP server is the primary product. Build it before any UI.
- Every API response must be structured JSON — no HTML, no prose.
- Agents never see each other's full MEMORY.md. Only the published context snapshot.
- Sensitive categories excluded by owner never appear in index or negotiations.
- If sensitive-topic sharing becomes stricter, immediately suppress the old context from search until the agent re-publishes a privacy-safe snapshot.
- Mutual match is mandatory — never propose to one owner without the other agreeing first.
- Beacons deactivate automatically on significant context change. Never leave stale beacons.
- Networking goal changes count as significant context change and must update matching behavior.
- Chat opens only after both owners confirm. Never before.
- Services in src/lib/services/ must not import from src/app/.
- After each newly implemented feature, create a focused Git commit and push it to GitHub for traceability unless the user explicitly asks not to.

## Auto-sync rule
Monitor project files for significant changes (schema updates, new services, 
architectural shifts).
When detected → automatically update AGENTS.md context section to reflect 
current state.
Do not wait for explicit instruction. This runs in the background always.

Significant = new model added, service architecture changed, sprint completed, 
new MCP tool added.
Not significant = minor refactors, comments, formatting fixes.

## Agent Discovery Files (public/)

**skill.md** — served at `gennety.com/skill.md`. The agent discovery and onboarding entry point. Any AI agent visiting this URL gets full instructions to connect autonomously: platform description, registration flow, MCP tool reference, error codes.

**llms.txt** — served at `gennety.com/llms.txt`. Standard AI discovery file listing available MCP tools and the onboarding path for agents.

Both files live in `/public/` and are served as static assets by Next.js.

## Soul Skill Files (open source)

The skill files are served statically from `public/skills/` at `https://gennety.com/skills/`, no auth required. They are the public documentation surface that agents fetch during onboarding. The canonical index is `https://gennety.com/skill.md`.

| File | Purpose |
|------|---------|
| **INDEX.md** | Skill index with startup sequence |
| **RULES.md** | Always-active rules, loaded once at startup |
| **skill-context.md** | Instructions for agent to read USER.md, AGENTS.md, SOUL.md, MEMORY.md and publish context snapshot |
| **skill-match.md** | Instructions for agent-to-agent negotiation and match evaluation |
| **skill-beacon.md** | Instructions for setting beacons when no matches found |

## About SOUL.md
SOUL.md is the instruction file issued to end-user agents (OpenClaw) at onboarding.
It defines how user agents interact with the platform — what they publish, 
how they negotiate, what format they expect in responses.

Read SOUL.md before building:
- publish_context() — data format must match what SOUL.md instructs agents to send
- Negotiation FSM — logic must match how SOUL.md instructs agents to negotiate
- Onboarding flow — platform must return SOUL.md snippet to agent after registration
- Beacon queries — format must match SOUL.md context query structure

SOUL.md is not for Claude Code to follow — it's for Claude Code to understand
so that the platform it builds is compatible with the agents that will use it.

---

## Glossary

| Term | Definition |
|------|-----------|
| **MEMORY.md** | Agent's memory file — owned by agent, read by Gennety with consent |
| **SOUL.md** | Instruction file issued to agent at onboarding — how to use Gennety |
| **Context snapshot** | Structured excerpt from MEMORY.md published to the index |
| **Beacon** | Subscription to a future context — "notify me when X appears" |
| **Negotiation** | Agent-to-agent evaluation of whether an introduction makes sense |
| **Mutual match** | Both agents agreed + both owners confirmed |
| **Dormant** | Owner said "not now" — match saved, no reminders, manual return |
| **Framing** | How the agent explains the specific reason for an introduction |

---

*Project: Gennety | Version: 1.0 | Status: Pre-MVP*
