# Agent Collaboration Pipeline

> Техническая спецификация системы автономной координации агентов внутри Team.

Дата: 2026-05-19

---

## 1. Обзор

Пайплайн — это три взаимосвязанных слоя:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Weekly Strategy Session                       │
│  (Judge Agent, GitHub + media + efficiency analysis)    │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Event-Driven Task Delegation                  │
│  (PROPOSE / DELEGATE / REQUEST_APPROVAL)                │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Activity Logging                              │
│  (structured logs → distillation → Hub)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 — Activity Logging

Каждый агент OpenClaw логирует деятельность своего пользователя через
MCP tool `log_activity`.

### Структура лога

```typescript
interface TeamActivityLog {
  id: string
  communityId: string
  actorOwnerId: string           // кто сделал
  actionType: ActivityActionType // что сделал
  summary: string                // сгенерировано distillation-моделью
  payload: Json                  // raw details (PR id, commit sha, etc.)
  references: {
    githubPrId?: number
    githubCommitSha?: string
    knowledgeDocumentId?: string
    externalUrl?: string
  }
  autoDelegated: boolean
  humanApproved: boolean | null
  createdAt: Date
}

type ActivityActionType =
  | 'CODE_COMMITTED'
  | 'PR_MERGED'
  | 'PR_REVIEWED'
  | 'DEPLOYMENT_TRIGGERED'
  | 'DEPLOYMENT_COMPLETED'
  | 'SOCIAL_POST_PUBLISHED'
  | 'MEETING_HELD'
  | 'DECISION_MADE'
  | 'BLOCKER_FLAGGED'
  | 'BLOCKER_RESOLVED'
  | 'HUB_DOCUMENT_ADDED'
  | 'TASK_PROPOSED'
  | 'TASK_DELEGATED'
  | 'TASK_COMPLETED'
```

### Distillation при логировании

Каждый лог прогоняется через `resolveModel('distillation')` для генерации
структурированного `summary`. Это дёшево и делается синхронно при записи.

---

## 3. Layer 2 — Event-Driven Task Delegation

### Триггеры

После каждого нового лога система публикует событие в очередь.
Агент каждого участника команды подписан на события своей команды.

```typescript
type HubEvent =
  | { type: 'LOG_ADDED';              log: TeamActivityLog }
  | { type: 'TASK_PROPOSED';          task: AgentTask }
  | { type: 'BLOCKER_FLAGGED';        log: TeamActivityLog }
  | { type: 'DEPLOYMENT_EVENT';       log: TeamActivityLog }
  | { type: 'STRATEGY_SESSION_STARTED'; sessionId: string }
```

### Обработка событий агентом

```typescript
async function handleHubEvent(event: HubEvent, context: AgentContext) {
  const relevantLogs = await readTeamContext(context.communityId, event)
  const model = resolveModel('hub_edit_chat')  // quality-модель для анализа

  const decision = await callLLM({
    ...model,
    prompt: buildEventDecisionPrompt(event, relevantLogs, context)
  })
  // decision: 'no_action' | 'propose_task' | 'delegate_task' | 'request_approval'

  if (decision.action === 'propose_task') {
    await proposeTask(decision.task)
  } else if (decision.action === 'delegate_task' && decision.task.autoDelegatable) {
    await delegateTask(decision.task)  // без участия человека
  } else if (decision.action === 'request_approval') {
    await requestApproval(decision.task, context.ownerInboxId)
  }
}
```

### Правило Human in the Loop

Автономная делегация (`DELEGATE_TASK`) возможна только если:
- `AgentTask.autoDelegatable === true`
- `AgentTask.requiresApproval === false`
- задача не затрагивает внешние сервисы (публикации, финансы, мерж в main)

Во всех остальных случаях → `REQUEST_APPROVAL` в inbox пользователя.

---

## 4. Layer 3 — Weekly Strategy Session

### Запуск

Cron-джоб `/api/cron/team-strategy-weekly` запускается каждый понедельник.
Для каждой активной команды создаётся `WeeklyStrategySummary`.

### Участники сессии

| Роль | Модель | Задача |
|---|---|---|
| Participant Agents | `resolveModel('strategy_participant')` | Анализ своего домена |
| Judge Agent | `resolveModel('strategy_judge')` | Синтез и финализация |

### Что анализируется

**GitHub-активность** (из Hub-логов + GitHub connector):
- Реализованные фичи (PR merged с label `feature`)
- Velocity: среднее время закрытия PR за неделю
- Blocker rate: % задач с `BLOCKER_FLAGGED`
- Соотношение feature / bug / refactor

**Эффективность агентов**:
- Количество выполненных задач на агента
- `autoDelegated / total` ratio — насколько агент работает автономно
- Скорость реакции на `LOG_ADDED` события
- Количество `REQUEST_APPROVAL` vs. автономных действий

**Медиа-перформанс** (через social API или stub):
- Количество публикаций за неделю
- Engagement по каждой публикации
- Маппинг публикации → фича → реакция аудитории
- Какие фичи получили органический отклик

### Выходные документы

```typescript
interface WeeklyStrategySummary {
  id: string
  communityId: string
  weekStart: Date
  githubDigest: GitHubWeeklyDigest
  agentEfficiency: AgentEfficiencyReport
  mediaPerformance: MediaPerformanceReport | null  // null если API не подключён
  proposals: CommunityActionProposal[]   // к одобрению OWNER/ADMIN
  contentOpportunities: ContentOpportunity[]
  createdAt: Date
}

interface ContentOpportunity {
  id: string
  summaryId: string
  feature: string        // о какой фиче писать
  rationale: string      // почему сейчас хороший момент
  draftPost?: string     // черновик поста (если enabled)
  platform: 'x' | 'linkedin' | 'generic'
  status: 'pending_approval' | 'approved' | 'rejected' | 'published'
}
```

---

## 5. MCP Tools для OpenClaw

### `log_activity`
Агент логирует событие от имени пользователя → distillation → Hub.

### `read_team_context`
Агент читает релевантные логи из Hub по смысловому запросу.
Использует `resolveModel('hub_search_answer')` для RAG-ответа.

### `propose_task`
Агент предлагает задачу другому участнику. Создаёт `AgentTask`
со статусом `pending`, отправляет уведомление в inbox адресата.

### `delegate_task`
Агент автономно передаёт задачу. Только для `autoDelegatable=true`.

### `request_approval`
Агент отправляет запрос одобрения в inbox своего пользователя.
Пользователь видит: что хочет сделать агент, зачем, с какими данными.

---

## 6. Файлы для создания / изменения

### Новые файлы

```
src/lib/services/team-activity-log.ts        — write/read логов
src/lib/services/agent-task-pipeline.ts      — PROPOSE/DELEGATE/APPROVE flow
src/lib/services/team-strategy-session.ts    — weekly session engine
src/lib/services/agent-efficiency.ts         — метрики агентов
src/lib/services/content-opportunities.ts   — SMM предложения
src/lib/mcp/tools/log-activity.ts            — MCP tool
src/lib/mcp/tools/read-team-context.ts       — MCP tool
src/lib/mcp/tools/propose-task.ts            — MCP tool
src/lib/mcp/tools/delegate-task.ts           — MCP tool
src/lib/mcp/tools/request-approval.ts        — MCP tool
src/app/api/cron/team-strategy-weekly/route.ts
src/app/api/cron/team-activity-digest/route.ts
```

### Изменяемые файлы

```
prisma/schema.prisma                          — новые модели
src/lib/mcp/tools/check-in.ts                 — добавить новые tools в реестр
src/lib/model-router.ts                       — убедиться что все task types покрыты
CLAUDE_CODE_CONTEXT.md                        — обновить контекст
```

### Prisma-модели

```
TeamActivityLog
AgentTask
WeeklyStrategySummary
AgentEfficiencySnapshot
ContentOpportunity
```

---

## 7. Инварианты

1. Агент **никогда** не публикует во внешние сервисы без `REQUEST_APPROVAL`.
2. Агент **никогда** не мержит в main без явного одобрения.
3. Роли участников (OWNER/ADMIN/MEMBER) **никогда** не меняются автоматически.
4. Каждый LLM-вызов в пайплайне → `resolveModel(task)`, никогда не хардкод.
5. Каждый LLM-вызов → запись `ComputeUsage` с `communityId`, `task`, `model`.
6. Raw MEMORY.md **никогда** не попадает в `TeamActivityLog` или Hub.
7. `AgentEfficiencyReport` видят только OWNER/ADMIN (по умолчанию).
