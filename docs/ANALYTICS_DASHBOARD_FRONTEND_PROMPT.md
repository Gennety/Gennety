# Frontend Prompt — Analytics Dashboard

Use this prompt in the next Codex session, opened in the separate dashboard repository.

---

Build the frontend for Gennety's internal analytics dashboard.

Important context:

- The dashboard is a separate repository and a separate deployment.
- It is for one private operator only.
- Backend analytics endpoints already exist in the main Gennety repo under `/api/admin/analytics/*`.
- Authentication to that backend must be server-to-server with `Authorization: Bearer ${ANALYTICS_ADMIN_SECRET}`.
- Do not expose that secret in browser code.
- The dashboard should fetch backend data in server components, route handlers, or other server-only utilities.

Product goals:

- Keep the dashboard visually close to the current Gennety app.
- Make it minimal, fast, dark, calm, and structured.
- Avoid a single long scrolling page.
- Use clear navigation and short section names with obvious meaning.
- Optimize for load speed and perceived smoothness.
- No LLM calls are needed in the dashboard itself.

Information architecture:

- Overview
- Trust
- Supply & Demand
- Beacons
- Model Advice
- Agent Quality
- Countries
- Users
- Costs
- Anomalies
- Reports

UX requirements:

- Desktop-first, but responsive on laptop and tablet widths
- Persistent left navigation
- Clear top summary cards
- Dense but readable metric blocks
- Use tabs / subnavigation where helpful
- Keep charts lightweight
- Avoid heavy charting libraries if a lighter option works
- Skeleton states are fine
- No client-side overfetching

Design direction:

- Match the existing Gennety app aesthetic
- Dark background, restrained contrast, clean borders
- Typography should feel deliberate, not default admin-template
- No noisy gradients or generic SaaS look
- No purple bias
- Use careful spacing and hierarchy
- Interface should feel like a product surface, not a BI export

Implementation expectations:

- Build a typed API layer for the analytics endpoints
- Keep endpoint contracts centralized
- Prefer server rendering for the first load
- Use caching thoughtfully, but do not let the dashboard show stale critical data forever
- If using charts, keep them simple and fast
- Make anomaly rows and leaderboard rows scan easily
- Keep each screen ergonomic and not overpacked

Backend endpoints available:

- `GET /api/admin/analytics`
- `GET /api/admin/analytics/overview`
- `GET /api/admin/analytics/trust`
- `GET /api/admin/analytics/network`
- `GET /api/admin/analytics/beacons`
- `GET /api/admin/analytics/advice`
- `GET /api/admin/analytics/agents`
- `GET /api/admin/analytics/countries`
- `GET /api/admin/analytics/users`
- `GET /api/admin/analytics/users/:ownerId`
- `GET /api/admin/analytics/costs`
- `GET /api/admin/analytics/anomalies`
- `GET /api/admin/analytics/reports`

Dashboard-specific requirements:

- Add a user directory screen.
- Add a user detail screen with:
  - profile summary
  - match list
  - chat list
  - full message transcript per chat
- Add a country distribution screen or section.

Range filters:

- `7d`
- `30d`
- `90d`
- `365d`
- `all`
- optional `from/to`

What I want from this session:

1. Inspect the dashboard repo structure.
2. Propose the page architecture and route map.
3. Implement the API client and server-only fetch layer.
4. Build the shell, navigation, and the main analytics pages.
5. Connect all pages to the existing backend endpoints.
6. Keep the result lightweight and production-ready.
7. Explain any assumptions briefly and keep moving.

If something in the backend response shape is unclear, read `docs/ANALYTICS_API.md` from the main repo context I provided in the previous session.
