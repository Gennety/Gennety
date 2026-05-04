# CI/CD Audit Report — Gennety

> Archived note: this report describes an older Vercel deployment setup from
> March 2026. It is not the current production deployment runbook. Current
> production deploy instructions live in the private root-level `deploy.md`
> referenced from `AGENTS.md`.

**Date:** 2026-03-26
**Repository:** github.com/Gennety/Gennety
**Stack:** Next.js 14 App Router + Prisma + Supabase (PostgreSQL + pgvector)
**Historical deploy target:** Vercel
**CI:** GitHub Actions

---

## Текущее состояние

| Компонент | Статус |
|-----------|--------|
| GitHub Actions CI | Настроен (lint, typecheck, build). Один workflow `ci.yml` на `push`/`PR` в `main` |
| Vercel deploy | Настроен через `vercel.json` (buildCommand, installCommand, ignoreCommand) |
| Branch protection | **Отсутствует** — `main` не защищён (`protected: false`) |
| Последний коммит в main | `c9390f3` — "Add CI/CD pipeline" (2026-03-25) |
| Тесты | **Отсутствуют** — нет test-файлов, нет скрипта `npm test` |

---

## Поток push → deploy

```
Developer pushes to main
        ↓
┌───────────────────────────────────────┐
│  GitHub Actions CI (параллельно)      │
│  checkout → install → prisma generate │
│  → lint → typecheck → build           │
└───────────────────────────────────────┘
        ↓ (результат НЕ блокирует деплой)
┌───────────────────────────────────────┐
│  Vercel webhook (параллельно)         │
│  ignoreCommand проверка               │
│  → npm ci → prisma generate           │
│  → next build → deploy                │
└───────────────────────────────────────┘
        ↓
Production URL обновлён
```

**Ключевой риск:** CI и Vercel работают **параллельно и независимо**. Vercel не ждёт результата CI. Если CI упал (lint error, type error) — Vercel всё равно задеплоит.

---

## Найденные проблемы

### 1. [Critical] Нет branch protection на `main`

- **Что происходит:** Ветка `main` не защищена (`protected: false`). Любой push напрямую в main триггерит деплой.
- **Чем грозит:** Сломанный код попадает в production без code review и без ожидания CI.
- **Как исправить:** В GitHub → Settings → Branches → Add rule для `main`:
  - Require pull request reviews before merging
  - Require status checks to pass (выбрать job `ci`)
  - Do not allow bypassing the above settings

### 2. [Critical] Vercel деплоит без проверки CI

- **Что происходит:** Vercel получает webhook от GitHub и деплоит независимо от результата CI.
- **Чем грозит:** Код с ошибками линтинга, тайпчека или билда может попасть в production.
- **Как исправить:** Настроить branch protection (п.1) + работать через PR. Vercel preview deployments для PR + merge только после зелёного CI.

### 3. [Important] `installCommand` использовал `npm install` вместо `npm ci`

- **Что происходило:** `vercel.json` содержал `"installCommand": "npm install"`, что может привести к неконсистентным зависимостям.
- **Чем грозит:** Vercel может установить другие версии зависимостей, чем те, что зафиксированы в `package-lock.json`.
- **Статус:** **Исправлено** в этом аудите — заменено на `"npm ci"`.

### 4. [Important] Node.js 20 в CI — устаревает

- **Что происходило:** В `ci.yml` использовалась `NODE_VERSION: '20'`. GitHub объявил deprecation Node.js 20 actions с июня 2026.
- **Статус:** **Исправлено** в этом аудите — обновлено до `NODE_VERSION: '22'`.

### 5. [Important] `ignoreCommand` не покрывал все критичные файлы

- **Что происходило:** `vercel.json` ignoreCommand не отслеживал изменения в `public/`, `tailwind.config.ts`, `postcss.config.mjs`, `vercel.json`.
- **Чем грозит:** Изменения в иконках, стилях Tailwind или конфигурации Vercel не триггерили редеплой.
- **Статус:** **Исправлено** в этом аудите — добавлены недостающие пути.

### 6. [Important] Нет тестов

- **Что происходит:** В проекте нет ни одного test-файла (`.test.ts`, `.spec.ts`), нет скрипта `npm test` в `package.json`, нет testing framework (jest/vitest) в зависимостях.
- **Чем грозит:** Нет автоматической проверки бизнес-логики. Регрессии обнаруживаются только вручную.
- **Как исправить:** Добавить vitest, написать тесты для критичных путей (auth, matching, embeddings), добавить шаг `npm test` в CI.

### 7. [Important] Миграции БД — ручной процесс

- **Что происходит:** CI запускает только `prisma generate` (генерация клиента). `prisma migrate deploy` не выполняется нигде в пайплайне.
- **Чем грозит:** После деплоя новой версии с изменениями в schema, БД может не соответствовать коду. Ручные миграции — риск забыть.
- **Как исправить:** Рассмотреть добавление `prisma migrate deploy` как шага в Vercel build command (после настройки `DATABASE_URL` в Vercel env vars) или как отдельный GitHub Action.

### 8. [Minor] Нет health check после деплоя

- **Что происходит:** После деплоя на Vercel нет автоматической проверки, что сайт работает.
- **Чем грозит:** Деплой может завершиться "успешно" (build прошёл), но сайт может быть нерабочим (ошибки runtime, отсутствующие env vars).
- **Как исправить:** Добавить post-deploy webhook или GitHub Action, который делает `curl` на production URL и проверяет HTTP 200.

### 9. [Minor] Dummy env vars в CI могут маскировать ошибки

- **Что происходит:** CI build использует dummy значения для `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Остальные env vars (OPENAI_API_KEY, GOOGLE_CLIENT_ID и т.д.) отсутствуют.
- **Чем грозит:** Если какой-то код начнёт использовать `OPENAI_API_KEY` на этапе билда (не runtime), CI build упадёт. Сейчас все API-ключи используются только в runtime — это безопасно. Но нужно следить при добавлении нового кода.
- **Статус:** Приемлемо на текущем этапе. Все env vars в проекте используются только в server-side runtime.

### 10. [Minor] `cancel-in-progress: true` на main

- **Что происходит:** Concurrency group `ci-${{ github.ref }}` с `cancel-in-progress: true` отменяет предыдущий CI run при новом push в ту же ветку.
- **Чем грозит:** При быстрых последовательных пушах в `main`, промежуточные CI проверки отменяются. Это допустимо для PR, но на main означает, что некоторые коммиты не будут проверены CI.
- **Как исправить:** Разделить concurrency для PR (cancel-in-progress: true) и main (cancel-in-progress: false). Но при текущей частоте коммитов это не критично.

---

## Что работает корректно

- **`.gitignore` настроен правильно:** `.env`, `.env*.local`, `.next/`, `node_modules/`, `.vercel` — всё исключено. Секреты не попадают в репо.
- **`package-lock.json` присутствует** — `npm ci` работает корректно и в CI, и на Vercel.
- **CI workflow структурирован логично:** checkout → install → prisma generate → lint → typecheck → build — правильная последовательность.
- **Prisma generate в CI** — клиент генерируется до линтинга и билда, что необходимо для корректной типизации.
- **Vercel buildCommand** — `"prisma generate && next build"` корректно генерирует Prisma-клиент перед билдом.
- **Все env vars — server-side only** — нет `NEXT_PUBLIC_` переменных, API-ключи не утекают в клиентский код.
- **Security headers** — `next.config.mjs` настраивает X-Frame-Options, X-Content-Type-Options, Referrer-Policy и другие заголовки безопасности.
- **Concurrency groups** — предотвращают дублирование CI runs для одной ветки.
- **actions/checkout@v4 + actions/setup-node@v4** — используются последние мажорные версии actions.

---

## Переменные окружения — матрица

| Переменная | Нужна при build | Нужна в runtime | В CI (dummy) | В Vercel Dashboard |
|------------|:-:|:-:|:-:|:-:|
| `DATABASE_URL` | Yes (Prisma generate) | Yes | Yes | Нужна |
| `DIRECT_URL` | Yes (Prisma generate) | Yes | Yes | Нужна |
| `NEXTAUTH_SECRET` | Yes (Next.js build) | Yes | Yes | Нужна |
| `NEXTAUTH_URL` | Yes (Next.js build) | Yes | Yes | Нужна |
| `OPENAI_API_KEY` | No | Yes | No | Нужна |
| `ANTHROPIC_API_KEY` | No | Yes (optional) | No | Рекомендуется |
| `GOOGLE_CLIENT_ID` | No | Yes | No | Нужна |
| `GOOGLE_CLIENT_SECRET` | No | Yes | No | Нужна |
| `RESEND_API_KEY` | No | Yes (optional) | No | Опционально |
| `TELEGRAM_BOT_TOKEN` | No | Yes (optional) | No | Опционально |
| `TELEGRAM_CHAT_ID` | No | Yes (optional) | No | Опционально |

---

## Рекомендации (по приоритету)

### Приоритет 1 — Сделать сейчас

1. **Настроить branch protection rule на `main`** — require status checks (`ci` job) + require PR reviews. Это единственный способ гарантировать, что сломанный код не попадёт в production.
2. **Проверить env vars в Vercel Dashboard** — убедиться, что все критичные переменные (DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) заданы в Vercel Environment Variables для production.

### Приоритет 2 — В ближайшие спринты

3. **Добавить testing framework (vitest)** и написать тесты хотя бы для API routes и бизнес-логики (matching, embeddings).
4. **Добавить smoke test после деплоя** — GitHub Action или Vercel webhook, который проверяет доступность production URL.
5. **Автоматизировать миграции БД** — добавить `prisma migrate deploy` в build pipeline или отдельный workflow.

### Приоритет 3 — На будущее

6. **Разделить concurrency** для main и PR веток.
7. **Рассмотреть preview deployments** для PR — Vercel делает их автоматически, если подключён к GitHub. Полезно для ревью.
8. **Добавить dependabot** или Renovate для автоматического обновления зависимостей.
9. **Добавить CODEOWNERS** для автоматического назначения ревьюеров.

---

## Исправления, внесённые в этом аудите

| Файл | Изменение | Причина |
|------|-----------|---------|
| `.github/workflows/ci.yml` | `NODE_VERSION: '20'` → `'22'` | Node.js 20 deprecation в GitHub Actions (июнь 2026) |
| `vercel.json` | `"npm install"` → `"npm ci"` | Воспроизводимые сборки на основе lockfile |
| `vercel.json` | Добавлены `public/`, `tailwind.config.ts`, `postcss.config.mjs`, `vercel.json` в ignoreCommand | Изменения в стилях/иконках/конфигурации Vercel не триггерили редеплой |
