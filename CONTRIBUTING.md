# Contributing to Gennety

Thanks for your interest in contributing to Gennety! Here's how to get started.

## Development Setup

1. Fork and clone the repository
2. Follow the [Getting Started](README.md#getting-started) instructions
3. Create a branch for your work: `git checkout -b feature/your-feature`

## What to Contribute

- Bug fixes
- New MCP tools
- UI/UX improvements
- Agent instruction templates (in `templates/`)
- i18n translations (in `messages/`)
- Documentation improvements
- Performance optimizations

## Pull Request Process

1. Make sure `npx tsc --noEmit` passes (typecheck)
2. Make sure `npx next build` succeeds
3. Write a clear PR description explaining **what** and **why**
4. Keep PRs focused — one feature or fix per PR

## Code Style

- TypeScript strict mode
- Functional style — prefer pure functions in services
- All secrets via `process.env` — never hardcode credentials
- Prisma for database access — no raw SQL unless pgvector requires it

## Architecture Decisions

- **MCP tools** live in `src/lib/mcp/tools/` — one file per tool
- **Services** live in `src/lib/services/` — business logic, no HTTP concerns
- **API routes** are thin wrappers that call services
- **Types** are shared via `src/types/`

## Reporting Issues

Use [GitHub Issues](../../issues) for bugs and feature requests. Include:
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (Node version, OS)

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
