# Telegram Integration

> Gennety operates as a **first-class Telegram Mini App** (Intelligram), not just a web redirect.
> The Telegram surface is a fully independent product experience — it is not a simplified version of the web app.

---

## Architecture Overview

```
User (Telegram) → Intelligram Mini App (Full Screen) → Gennety Backend → Agent Runtime
                                                               ↓
                                              Bot-to-Bot Communication API
                                              (Telegram Bot API 10.0, May 2026)
```

Three layers:
1. **Telegram Bot** — receives events, sends notifications, handles inline actions, manages Private Topics inbox.
2. **Intelligram Mini App** — full Next.js UI embedded inside Telegram via Full Screen Mini Apps (no top chrome, `Telegram.WebApp.expand()`). This is the primary product surface for Telegram users.
3. **Backend Intermediary** — authenticates Telegram users, bridges Telegram identity with Gennety accounts via a unified JWT token.

---

## What Intelligram Is

Intelligram is the Telegram-native product surface of Gennety. It is not a wrapper — it is a first-class experience designed specifically for the Telegram environment.

**Key principles:**
- Full-screen WebView with no Telegram chrome — no header bar, no back button imposed by Telegram.
- All core flows (onboarding, matching, agent chat, team space) work natively inside Telegram.
- After onboarding, users never need to leave Telegram to use Gennety.
- Bot notifications replace email/push — structured via Private Topics.

---

## Onboarding Flow (Telegram path)

```
User opens Telegram bot
  → Welcome message + "Start" button
  → Intelligram Mini App opens FULL SCREEN (Telegram.WebApp.expand())
  → Onboarding wizard (profile, photo, preferences — same as web)
  → Final question: "How do you want to use Gennety?"
      A) Web platform  →  email registration, redirect to web
      B) Stay in Telegram  →  Telegram account linked, Mini App is primary surface
  → Unified token issued (links Telegram ID ↔ Gennety account)
```

**Key rules:**
- Split happens at the end — user sees the full product pitch before choosing a surface.
- After onboarding, all working flows stay native in Telegram.
- Web and Telegram sessions share the same Gennety account via unified JWT.

---

## Private Topics — Structured Inbox (Bot API 9.4+)

After onboarding, the user's bot conversation is structured using `createForumTopic` in private chat. Each topic acts as a dedicated notification channel.

| Topic | Purpose |
|---|---|
| 💛 My Matches | Agent-proposed match cards and status updates |
| 📅 Dates | Scheduled meetings, confirmations, cancellations |
| ⚙️ Settings | Preference changes, search parameter updates |
| 🤖 Agent Log | Autonomous agent activity digest |
| 👥 Team Space | Community activity, task proposals, strategy summaries |

Agent sends all notifications to the relevant topic via `message_thread_id`. Users navigate their bot workspace like a structured inbox.

**Implementation notes:**
- Check `has_topics_enabled` on user before creating topics.
- Fall back to single-channel mode if topics not supported on the device.
- Team Space topic is only created when user joins a community with `teamMode` enabled.

---

## Bot-to-Bot Communication (Bot API 10.0)

Telegram Bot API 10.0 (May 2026) introduced native **Bot-to-Bot Communication**: bots can send structured messages directly to other bots by username.

**How Gennety uses it:**
- Agent A (user A's bot) sends a structured negotiation payload to Agent B (user B's bot) via Bot-to-Bot API.
- Agent B evaluates the request autonomously: accepts, rejects, or requests clarification.
- Result surfaces in both users' Match topics + Intelligram feed.
- Users see: "Your agent started a conversation with @username's agent."

This enables **fully autonomous agent-to-agent matchmaking** without requiring both users to be online simultaneously.

**Payload structure (negotiation message):**
```json
{
  "type": "negotiation_request",
  "fromAgentId": "...",
  "matchCandidateId": "...",
  "contextSummary": "...",
  "compatibilityScore": 87,
  "proposedTopics": ["AI product", "GTM strategy"]
}
```

**Out of scope for MVP:**
- Guest Mode (`answerGuestQuery`, Bot API 10.0) — deferred to future.

---

## Match Card — Native Telegram Format

Match cards are delivered natively inside Telegram via bot message, not via WebView. Ensures instant delivery and works in notifications without loading.

### Message Structure

```
[Live Photo — sendLivePhoto, Bot API 10.0]

🤝 Match with @username
✨ Compatibility: 87%

"You both focus on AI-native product development —
[User A] from the infra angle, [User B] from UX —
together you close the GTM gap."
— Your agent
```

### Inline Buttons (Bot API 9.4 — styled + custom emoji)

| Button | style | icon_custom_emoji_id | Action |
|---|---|---|---|
| 💬 Start Chat | green | chat emoji | Opens direct Telegram chat |
| 🤖 Agent Dialogue | default | robot emoji | Opens Intelligram WebView with bot-to-bot negotiation transcript |
| 📅 Schedule Call | default | calendar emoji | Initiates calendar coordination via agent |
| ✕ Skip | red | cross emoji | Dismisses match, marks dormant |

**Implementation notes:**
- `style` field available in both `InlineKeyboardButton` and `KeyboardButton` (Bot API 9.4).
- `icon_custom_emoji_id` requires bot owner to have Telegram Premium.
- "Agent Dialogue" button opens Intelligram WebView — only WebView surface on the match card.
- `sendLivePhoto` supports `sendMediaGroup` for multi-photo cards if needed.

---

## Intelligram UI Surfaces

| Screen | Mode | Description |
|---|---|---|
| Onboarding | Full Screen WebView | Profile setup, photo, preferences |
| Match Feed | Full Screen WebView | Agent-proposed matches with actions |
| Agent Chat | Full Screen WebView | Talk to your agent — adjust goals, context |
| Agent Dialogue Viewer | Inline WebView (from button) | Bot-to-bot negotiation transcript |
| Team Space | Full Screen WebView | Team group chat + Context Hub |
| Strategy Summary | Full Screen WebView | Weekly strategy session results |

---

## Team Space in Intelligram

When a user is part of a community with `teamMode` enabled, Intelligram exposes a **Team Space** screen.

**Team Space contains:**
- Group chat (CommunityChat) — unlocks when ≥ 2 active members
- Context Hub summary — SSOT document list, search
- Agent task feed — proposed tasks, pending approvals, completed work
- Strategy session results — last session summary + proposals

**Bot notifications for team events (→ Team Space topic):**
- New task proposed to agent
- Task completed by agent
- Strategy session finished — summary posted
- Blocker flagged by agent
- Approval requested by agent

**MCP tools triggered from Intelligram Team Space:**
- `hub_edit` (search, add)
- `propose_task`
- `request_approval`
- `get_my_instructions`

---

## Authentication & Unified Token

- On Telegram login, backend verifies `initData` from Mini App.
- Issues a **JWT** encoding both `telegramId` and `gennetyUserId`.
- Token stored in `window.Telegram.WebApp.CloudStorage`.
- Same token works on web platform — seamless cross-surface continuity.
- Account merge flow (web user adds Telegram later): TBD — open question.

---

## Technical Stack

| Component | Technology |
|---|---|
| Bot framework | `grammy` (TypeScript) |
| Mini App | Next.js (existing codebase) + `@twa-dev/sdk` |
| Full Screen API | `Telegram.WebApp.expand()` + `Telegram.WebApp.isFullscreen` |
| Bot-to-Bot | Telegram Bot API **v10.0** (May 2026) |
| Live Photos | `sendLivePhoto` method (Bot API 10.0) |
| Styled buttons | `style` + `icon_custom_emoji_id` (Bot API 9.4) |
| Private Topics | `createForumTopic` in private chats (Bot API 9.4) |
| Auth | JWT via `initData` verification |
| Token storage | `Telegram.WebApp.CloudStorage` |

---

## Implementation Scope (v1)

### In scope
- [ ] Bot onboarding flow with Mini App launch
- [ ] Private Topics creation and routing (5 topics)
- [ ] Match Card delivery via `sendLivePhoto` + styled inline buttons
- [ ] Bot-to-Bot negotiation (send + receive + auto-evaluate)
- [ ] Intelligram Mini App screens: Onboarding, Match Feed, Agent Chat, Agent Dialogue Viewer
- [ ] Team Space screen (group chat + hub search + task feed)
- [ ] Strategy session summary delivery to Team Space topic
- [ ] Unified JWT auth

### Out of scope (v1 → v2)
- Guest Mode (`answerGuestQuery`)
- Account merge flow (web → Telegram)
- Mini App deep links for sharing match cards
- `icon_custom_emoji_id` fallback for non-Premium bot owners

---

## Open Questions

- [ ] Rate limits for Bot-to-Bot API — max agent negotiations per day per user?
- [ ] Push notification strategy — Telegram topics vs. web push for cross-surface users?
- [ ] Account merge flow — web user adds Telegram later?
- [ ] Mini App deep links for sharing match cards outside Telegram?
- [ ] `icon_custom_emoji_id` fallback if bot owner doesn't have Premium?

*Updated: May 2026 — Bot API 10.0 — Intelligram v1 scope*
