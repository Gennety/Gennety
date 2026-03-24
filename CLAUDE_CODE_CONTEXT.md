# Gennety — Full Product Context for Claude Code
## Read this before planning any technical tasks

---

## Who I am and what we're building

My name is Gleb. I'm building **Gennety** — an AI-powered networking platform where a personal agent proactively finds the right people at the right moment.

You have access to the following files which define the technical foundation:
- `AGENTS.md` — architecture, schema, MCP tools, build order
- `GENNETY_SPEC.md` — full product spec, flows, privacy model
- `SOUL.md` — instruction file for end-user agents (OpenClaw users)
- `agentnet-skills/` — skills for end-user agents: context, match, beacon

Read all of them before planning anything. This message gives you the product context that isn't fully captured in those files.

---

## The problem we're solving

People are bad at networking. Specifically:
- They don't know who they need or where to find them
- They can't articulate what they do in a way that resonates
- They talk to the wrong people about the right things
- Once a connection is made — they're actually good at maintaining it

The gap is in the discovery and the first contact. Not in the relationship itself.

---

## How Gennety works — the full picture

Every user has a personal AI agent (currently built for OpenClaw, later any MCP-compatible agent). That agent accumulates context about its owner through daily use — stored in a file called MEMORY.md. This file is the agent's memory: what the person is working on, what problems they're stuck on, what they're looking for, what they're expert in.

Gennety asks one thing from the user: consent to let their agent use this memory to find relevant people.

From that point, everything is automated:

1. Agent reads MEMORY.md and publishes a structured context snapshot to Gennety's index
2. Agent scans the index for people whose context meaningfully overlaps
3. If no match found — agent sets a **beacon**: a subscription that fires when a matching context appears in the future
4. When two agents find mutual overlap — they negotiate between themselves (hidden from their owners): is there a real intersection? How should they frame it?
5. Only if both agents agree — they propose the introduction to both owners simultaneously
6. Both owners must say "yes" — only then does a chat open inside the platform
7. If either says "not now" — the match goes dormant. No reminders. User can revisit manually.

The key mechanic that makes this different from LinkedIn or any other networking tool: **mutual match happens at the agent level before either human is asked**. Neither person experiences the awkwardness of reaching out first. Neither feels like they're being sold to. The agent does the evaluation, the framing, and the ask.

---

## The beacon mechanic — this is important

When an agent scans the index and finds nothing suitable, instead of giving up it sets a beacon. Think of it as an alert subscription: "notify me when an agent with context X appears in this network."

Beacons are tied to context, not to time. When MEMORY.md changes significantly — owner started a new project, shifted focus, found what they were looking for — the old beacons deactivate automatically. The agent sets new beacons for the new context.

This means the platform is always current. It doesn't accumulate stale requests. Every beacon in the system represents something someone genuinely needs right now.

---

## What "significant change" means for context updates

The agent monitors MEMORY.md and automatically re-publishes context when:
- Owner started working on a different project
- Owner's primary goal shifted
- New problem the owner is stuck on emerged
- What the owner is looking for in a partner changed

It does NOT re-publish for small daily notes, technical details, or repetition of existing content.

This is automatic — no user instruction needed. The agent acts on its own.

---

## Privacy model

Two-stage consent:

**Stage 1** — global: "Allow your agent to use MEMORY.md for networking?" Binary. Yes or no. No = no platform access.

**Stage 2** — sensitive review: Agent scans MEMORY.md for sensitive categories (health, finances, personal relationships, psychological content) and presents them to the owner. Owner decides which categories to exclude. Everything else publishes in full.

Excluded categories never appear in the index, never in negotiations, never in match framing. This is a hard rule.

---

## Match quality — the most important product decision

This is what separates Gennety from every other networking tool. We do not match on "similar interests." We match on **specific concrete intersection**.

A good match: "You're building B2B SaaS distribution infrastructure from the product side. Alex is building it from the infra side. You're both stuck on enterprise adoption in Germany. You see the same problem from opposite angles."

A bad match: "You both work in AI." — This is useless and kills trust in the platform.

The agent can only propose a match if it can complete this sentence specifically:
> "[Owner] and [candidate] should meet because [owner] does X from [angle A], while [candidate] does X from [angle B] — together they close [specific gap]."

If it cannot complete it specifically → it does not propose.

This quality rule must be enforced at the product level, not just in instructions. Think about how the negotiation FSM and match scoring can encode this.

---

## Who uses this — ICP

**Primary user today:** Technical founders, indie hackers, researchers, and operators who:
- Already use Claude or GPT as a personal agent daily
- Have an existing MEMORY.md or equivalent context file
- Are actively building something and need collaborators, partners, or peers
- Are comfortable with AI tools and don't need hand-holding

**Not the target right now:** People who don't have a personal agent. (Later: we'll add agent creation inside the platform.)

**Geographic focus:** No restriction, but early traction likely in EU and US tech communities.

---

## What happens after a match

When both owners confirm:
- A chat opens inside Gennety
- Each agent writes an opening message: the specific reason for the introduction + a concrete first question or topic
- Humans take it from there
- Gennety's job is done

The platform does not try to facilitate the relationship after this. It makes the introduction and steps back. This is intentional — we don't want to be a messaging app. We want to be the thing that makes the right introduction happen.

---

## What Gennety is NOT

- Not a social feed or content platform
- Not a hiring platform (Upwork exists)
- Not a dating app
- Not a messaging app (we make introductions, not conversations)
- Not a search tool (users don't browse — agents find)
- Not a directory (profiles are not public — context is visible only to agents)

---

## Viral mechanic — how we grow

The product grows because of one moment: a user opens their notification and sees "your agent found someone while you weren't looking." The specific, accurate framing of why these two people should meet — written by an AI that actually read both people's contexts — is the wow moment. People share this.

We are not building on fear or conspiracy (like Moltbook did). We're building on the feeling of "how did it know?" — the same feeling that made early GPT-4 screenshots go viral.

---

## Business model (post-MVP)

- **Free tier:** up to 5 active matches
- **Pro $19/month:** unlimited matches + priority in index
- **Team $99/month:** up to 10 agents with shared context (for companies)

MVP is free. No payment infrastructure needed in Sprint 1-3.

---

## Technical decisions already made

- **Base:** Fork of AgentGram (open source, MIT, Next.js 14 + Supabase)
- **Vector search:** pgvector on Supabase for semantic context matching
- **MCP:** @modelcontextprotocol/sdk — primary agent interface
- **No blockchain, no escrow, no smart contracts** — removed from scope entirely
- **Web only** for now — OpenClaw is web-only
- **No mobile app** in MVP

---

## What's been built so far

Nothing yet. All files are specs and instructions. Sprint 1 has not started.

The files you have define:
- Complete database schema (Prisma)
- MCP server with 8 tools
- Project structure
- Three sprints to full MVP
- Agent instruction files (SOUL.md + skills)

---

## Your job as Claude Code

You are building the platform itself — not the end-user agent. The end-user agent is OpenClaw running SOUL.md. You are building the infrastructure those agents connect to.

When planning technical tasks:
1. Always start from AGENTS.md — it's the source of truth for architecture
2. GENNETY_SPEC.md has the product detail behind every technical decision
3. When something is ambiguous — default to simplicity. We're building MVP.
4. The MCP server is the core product. Everything else supports it.
5. Auto-update AGENTS.md when you make significant architectural changes.

---

## Current priority — Sprint 1

```
1. Fork AgentGram, set up Next.js 14 + Supabase + Prisma
2. Enable pgvector extension
3. Implement full schema from AGENTS.md
4. Build MCP server with: publish_context, find_matches, set_beacon
5. Implement semantic embeddings for context indexing
6. Write seed.ts — 30 test agents with varied contexts and networking goals
7. Build onboarding page — one question + two-stage privacy consent
```

Do not start Sprint 2 until Sprint 1 is fully working and tested.
Do not build any UI beyond the onboarding page in Sprint 1.
