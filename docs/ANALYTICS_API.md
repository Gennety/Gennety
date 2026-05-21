# Analytics API

Internal analytics endpoints for the separate dashboard repository.

## Auth

- Header: `Authorization: Bearer ${ANALYTICS_ADMIN_SECRET}`
- Intended usage: server-to-server only
- Do not expose the secret in browser code

## Range Params

All endpoints accept:

- `range=7d|30d|90d|365d|all`
- Optional override: `from=YYYY-MM-DD&to=YYYY-MM-DD`

If `from` is present, it overrides the preset.

## Endpoints

- `GET /api/admin/analytics`
  - Section index for the dashboard app

- `GET /api/admin/analytics/overview`
  - Top-level counts
  - `Network Vitality`
  - funnel
  - `TTFV` for first proposed and first matched
  - daily series for owners, proposals, matches, advice requests

- `GET /api/admin/analytics/trust`
  - `Trust Gap`
  - `Negotiation Ghosting`
  - `Human Conversion`

- `GET /api/admin/analytics/network`
  - current supply vs demand approximation
  - context freshness / drift
  - top `looking_for` phrases

- `GET /api/admin/analytics/beacons`
  - `Beacon Liquidity`
  - `Time to Trigger`
  - heuristic beacon false positives

- `GET /api/admin/analytics/advice`
  - `Model Advice` session volume
  - advice conversion via deterministic contact-exchange signals
  - advice dissonance via parsed verdict labels

- `GET /api/admin/analytics/agents`
  - `Spammy Agent Index`
  - negative feedback leaderboard
  - integrity notes

- `GET /api/admin/analytics/countries`
  - all registered users grouped by `countryCode`
  - onboarding split per country

- `GET /api/admin/analytics/users`
  - full registered user directory for the dashboard
  - country, onboarding state, agent status, match/chat counts

- `GET /api/admin/analytics/users/:ownerId`
  - full drilldown for one user
  - match list
  - chat list
  - full chat transcripts

- `GET /api/admin/analytics/costs`
  - exact production compute ledger
  - demo responder spend
  - webhook history + snapshot

- `GET /api/admin/analytics/anomalies`
  - anomaly feed assembled from the other sections

- `GET /api/admin/analytics/reports`
  - raw chat reports for manual review
  - recent items, reasons, participants

- `GET /api/admin/analytics/openclaw`
  - preview OpenClaw operator digest
  - optional `market=0` disables market search
  - optional `generate=1` includes generated report text in preview

- `POST /api/admin/analytics/openclaw`
  - runs OpenClaw moderation review
  - optionally sends the weekly report
  - body flags: `forceWeekly`, `send`, `includeMarket`

## Known Gaps

Current backend now persists an internal analytics + compute ledger for new activity. Some caveats still remain:

- `Match Precision` is exact only for matches created after the V2 instrumentation fields were added
- beacon precision is exact only when the negotiation was linked with `sourceBeaconId`
- advice conversion still uses deterministic contact-signal detection, not an LLM classifier
- older historical rows created before V2 will still have partial coverage

These endpoints are designed to support the separate dashboard repo with low runtime cost and server-to-server auth.
