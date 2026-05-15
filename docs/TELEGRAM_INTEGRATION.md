# Telegram Integration

> Gennety operates as a **first-class Telegram Mini App**, not just a web redirect.

## Architecture Overview

```
User (Telegram) → Mini App (Full Screen, no header bar) → Gennety Backend → Agent Runtime
                                                                  ↓
                                                   Bot-to-Bot Communication API
                                                   (Telegram Bot API 10.0, May 2026)
```

The integration uses three layers:
1. **Telegram Bot** — receives events, sends notifications, handles inline actions.
2. **Mini App** — full Next.js UI embedded inside Telegram via Full Screen Mini Apps (no top chrome, launched via `Telegram.WebApp.expand()`).
3. **Backend Intermediary** — authenticates Telegram users, bridges Telegram identity with Gennety accounts via a unified token.

---

## Onboarding Flow (Telegram path)

```
User opens Telegram bot
  → Welcome message + "Start" button
  → Mini App opens FULL SCREEN (no header bar, Telegram.WebApp.expand())
  → Onboarding wizard (profile, photo, preferences — same as web)
  → Final question: "How do you want to use Gennety?"
      A) Web platform  →  email registration, redirect to web
      B) Stay in Telegram  →  Telegram account linked, Mini App is primary surface
  → Unified token issued (links Telegram ID ↔ Gennety account)
```

**Key rules:**
- Full-screen WebView with no Telegram chrome — maximises onboarding UX.
- The split happens at the end — user sees the full product pitch before choosing a surface.
- After onboarding, all working flows (matches, chats, notifications) stay **native in Telegram bot**.

---

## Private Topics — User Space inside the Bot (Bot API 9.4+)

After onboarding, the user's bot conversation is structured using `createForumTopic` in private chat:

| Topic | Purpose |
|---|---|
| 💛 My Matches | Agent-proposed match cards and status updates |
| 📅 Dates | Scheduled meetings, confirmations, cancellations |
| ⚙️ Settings | Preference changes, search parameter updates |
| 🤖 Agent Log | Autonomous agent activity digest |

Agent sends all notifications to the relevant topic via `message_thread_id`. Users navigate their bot workspace like a structured inbox.

**Implementation notes:**
- Check `has_topics_enabled` on user before creating topics.
- Use `is_name_implicit` for auto-named topics where appropriate.
- Fall back to single-channel mode if topics not supported.

---

## Bot-to-Bot Communication (Bot API 10.0)

Telegram Bot API 10.0 (May 2026) introduced native **Bot-to-Bot Communication**: bots can send structured messages directly to other bots by username.

**How Gennety uses it:**
- Agent A (user A) sends a structured negotiation payload to Agent B (user B) via Bot-to-Bot API.
- Agent B evaluates the request autonomously: accepts, rejects, or requests clarification.
- Result surfaces in both users' Match topics + Mini App feed.
- Users see: "Your agent started a conversation with @username's agent."

This enables **fully autonomous agent-to-agent matchmaking** without requiring both users to be online simultaneously.

**Out of scope (not included in MVP):**
- Guest Mode (`answerGuestQuery`, Bot API 10.0) — limited practical use for the current ICP, deferred to future.

---

## Match Card — Native Telegram (not WebView)

Match cards are delivered natively inside Telegram via bot message, not via WebView. This ensures instant delivery and works in notifications without any loading.

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
| 🤖 Agent Dialogue | default | robot emoji | Opens WebView with bot-to-bot negotiation transcript |
| 📅 Schedule Call | default | calendar emoji | Initiates Zoom/calendar coordination via agent |
| ✕ Skip | red | cross emoji | Dismisses match, marks dormant |

**Implementation notes:**
- `style` field available in both `InlineKeyboardButton` and `KeyboardButton` (Bot API 9.4).
- `icon_custom_emoji_id` requires bot owner to have Telegram Premium.
- "Agent Dialogue" button opens a Mini App WebView showing the full bot-to-bot negotiation transcript — the only WebView surface on the match card.
- `sendLivePhoto` supports `sendMediaGroup` for multi-photo cards if needed.

---

## Mini App UI Surfaces

| Screen | Mode | Description |
|---|---|---|
| Onboarding | Full Screen WebView | Profile setup, photo, preferences |
| Match Feed | Full Screen WebView | Agent-proposed matches with actions |
| Agent Chat | Full Screen WebView | Talk to your agent — adjust goals, context |
| Agent Dialogue Viewer | Inline WebView (from button) | Bot-to-bot negotiation transcript |
| Team Space | Full Screen WebView | Team group chat + Context Hub |

---

## Authentication & Unified Token

- On Telegram login, the backend verifies `initData` from Mini App.
- Issues a **JWT** that encodes both `telegramId` and `gennetyUserId`.
- Token is stored in Mini App storage (`window.Telegram.WebApp.CloudStorage`).
- Same token works on web platform — seamless cross-surface continuity.

---

## Technical Stack

- **Bot framework:** `grammy` (TypeScript)
- **Mini App:** Next.js (existing codebase) with `@twa-dev/sdk`
- **Full Screen API:** `Telegram.WebApp.expand()` + `Telegram.WebApp.isFullscreen`
- **Bot-to-Bot:** Telegram Bot API **v10.0** (May 2026)
- **Live Photos:** `sendLivePhoto` method (Bot API 10.0)
- **Styled buttons:** `style` + `icon_custom_emoji_id` fields (Bot API 9.4)
- **Private topics:** `createForumTopic` in private chats (Bot API 9.4)

---

## Open Questions
- [ ] How to handle users who start on web and later want to add Telegram? (account merge flow)
- [ ] Push notification strategy — Telegram topics vs. web push?
- [ ] Rate limits for Bot-to-Bot API — how many agent negotiations per day per user?
- [ ] Mini App deep links for sharing match cards.
- [ ] `icon_custom_emoji_id` fallback if bot owner doesn't have Premium?

*Updated: May 2026 — Bot API 10.0*
