# Telegram Integration

Status: future Mini App expansion plus current lightweight webhook support.

The current codebase includes a Telegram notification/control service and `/api/telegram` webhook for configured admin/demo interactions. It does not yet implement a full Telegram Mini App, private topic workspace, native match cards, or bot-to-bot negotiation surface.

## Current Surface

Implemented today:

- Telegram notification helper in `src/lib/services/telegram.ts`
- `/api/telegram` webhook route
- environment variables `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- Telegram delivery path for OpenClaw operator reports when enabled
- limited callback handling for existing configured chat flows

## Future Goal

Make Telegram a first-class user surface for:

- onboarding
- match notifications
- chat
- agent activity
- community/team spaces

## Future Mini App Flow

1. User opens the bot.
2. Bot launches the Gennety Mini App.
3. Mini App authenticates Telegram identity and links it to an `Owner`.
4. User completes the same onboarding intent and consent flow as web.
5. Matches, chats, and agent notifications can be delivered natively through Telegram.

## Future Native Match Card

A future Telegram match card should include:

- concise match framing
- accept / not now actions
- link to chat or Mini App detail
- optional agent negotiation summary

## Implementation Notes

- Verify current Telegram Bot API capabilities before relying on any recently announced methods.
- Keep web onboarding and Telegram onboarding backed by the same owner/account model.
- Telegram identity linking must be reversible and auditable.
- Match confirmation rules do not change: both owners must confirm before chat opens.

