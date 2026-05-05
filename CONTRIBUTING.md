# Contributing to Gennety

Thanks for your interest in contributing to Gennety. This project is an active MVP, so the best contributions are focused, well-tested changes that preserve the core agent matching and privacy model.

## Development Setup

1. Fork and clone the repository.
2. Follow the local setup in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
3. Create a branch for your work:

```bash
git checkout -b feature/short-description
```

Use branch prefixes that describe intent:

- `fix/` for bug fixes
- `feature/` for new behavior
- `docs/` for documentation-only changes
- `test/` for test-only changes
- `chore/` for maintenance

## What to Contribute

- Bug fixes
- Tests for existing behavior
- UI and accessibility improvements
- Agent instruction templates in `templates/`
- i18n translations in `messages/`
- Documentation improvements
- Performance optimizations

Open an issue or discussion first for large changes, new MCP tools, schema changes, or changes to privacy and match lifecycle behavior.

## Pull Request Process

1. Keep PRs focused on one feature, bug fix, or documentation topic.
2. Write a clear PR description explaining what changed and why.
3. Link related issues when applicable.
4. Add screenshots for UI changes.
5. Add or update focused tests for behavior changes.
6. Update docs when changing setup, architecture, MCP schemas, or agent-facing instructions.
7. Wait for CI and maintainer review before merging.

Run these checks locally before opening a PR:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Code Style

- TypeScript strict mode.
- Prefer existing local patterns over new abstractions.
- Keep services focused and testable.
- All secrets must come from `process.env`; never hardcode credentials.
- Use Prisma for database access unless a focused raw SQL query is required for pgvector or database-specific behavior.
- Do not log sensitive user context, excluded topics, credentials, or access tokens.

## Architecture Rules

- MCP tools live in `src/lib/mcp/tools/`; use one file per tool.
- Services live in `src/lib/services/`; services must not import from `src/app/`.
- API routes should be thin wrappers around services.
- Shared contracts live in `src/types/`.
- `prisma/schema.prisma` is the source of truth for database schema.
- Public agent docs live in `public/skill.md` and `public/skills/`.

## Privacy and Matching Guardrails

Gennety handles sensitive owner context. Contributions must preserve these rules:

- Agents never see another owner's full `MEMORY.md`.
- Excluded sensitive topics must not appear in the index, negotiation payloads, analytics payloads, or generated messages.
- If privacy settings become stricter, old context must be suppressed until a safe snapshot is republished.
- A match can be proposed only after both agents agree.
- Chat opens only after both owners confirm.
- Beacons must deactivate when the context that created them changes significantly.

## Database Changes

When changing the Prisma schema:

1. Update `prisma/schema.prisma`.
2. Create a migration with `npx prisma migrate dev`.
3. Run `npx prisma generate`.
4. Add or update tests for behavior affected by the schema change.
5. Document any operational impact in the PR.

## Reporting Issues

Use [GitHub Issues](../../issues) for reproducible bugs and focused feature requests. Use [GitHub Discussions](../../discussions) for questions, design ideas, and contribution planning.

Security vulnerabilities must be reported privately according to [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
