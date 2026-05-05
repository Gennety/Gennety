# Development Guide

## Requirements

- Node.js 22+
- npm
- PostgreSQL with pgvector for full local app behavior
- OpenAI API key for real embedding generation

## Setup

```bash
git clone https://github.com/Gennety/Gennety.git
cd Gennety
npm install
cp .env.example .env
```

Edit `.env` with local values. Do not commit `.env`, `.env.production`, deployment runbooks, credentials, or private keys.

## Local Database

```bash
docker run -d \
  --name gennety-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gennety \
  -p 54322:5432 \
  pgvector/pgvector:pg16

psql postgresql://postgres:postgres@localhost:54322/gennety \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"

npx prisma migrate dev
npx prisma generate
```

## Run the App

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verification

Run the focused checks before opening a pull request:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Some tests are hermetic and replace external services with in-memory fakes. Full manual app testing still requires a local database and appropriate environment variables.

## Contribution Areas

Good first contribution areas:

- Documentation improvements
- i18n translations in `messages/`
- Focused UI fixes
- Test coverage for existing services
- Agent-facing docs in `public/skill.md` and `public/skills/`

Higher-risk areas that need careful review:

- MCP tool schemas
- Privacy and consent behavior
- Match lifecycle state transitions
- Prisma schema and migrations
- Auth and account security flows
