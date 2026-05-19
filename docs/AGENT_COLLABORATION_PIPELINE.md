# Agent Collaboration Pipeline

Дата: 2026-05-19

> Технический документ. Описывает архитектуру автономной передачи задач
> между агентами OpenClaw внутри Team через Context Hub.

---

## 1. Концепция

Team — это не просто группа людей. Это **команда агентов**, каждый из которых
действует от лица своего пользователя. Агенты:

1. **Логируют** деятельность пользователя в Context Hub
2. **Читают** логи других участников
3. **Сопоставляют** паттерны и строят общую картину
4. **Передают задачи** друг другу — автономно или с одобрением человека

Context Hub — это **общая оперативная память команды**. Не только база знаний,
но и живой журнал событий, который агенты читают непрерывно.

---

## 2. Activity Logging

Каждое значимое действие пользователя → агент логирует в Hub.

### Структура TeamActivityLog

```typescript
interface TeamActivityLog {
  id: string;
  communityId: string;
  actorOwnerId: string;          // кто сделал
  agentId: string;               // какой агент залогировал
  actionType: ActivityActionType;
  summary: string;               // distilled summary (cheap model)
  references: ActivityReference[]; // PR id, issue id, post url и т.д.
  autoDelegated: boolean;        // было ли это авто-делегацией
  humanApproved: boolean | null; // null = не требовалось
  metadata: Record<string, unknown>;
  createdAt: Date;
}

type ActivityActionType =
  | 'CODE_COMMITTED'
  | 'PR_OPENED'
  | 'PR_MERGED'
  | 'PR_REVIEWED'
  | 'DEPLOYMENT_TRIGGERED'
  | 'DEPLOYMENT_COMPLETED'
  | 'SOCIAL_POST_DRAFTED'
  | 'SOCIAL_POST_PUBLISHED'
  | 'BLOCKER_FLAGGED'
  | 'BLOCKER_RESOLVED'
  | 'TASK_PROPOSED'
  | 'TASK_DELEGATED'
  | 'TASK_COMPLETED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_DENIED'
  | 'STRATEGY_SESSION_STARTED'
  | 'STRATEGY_SESSION_COMPLETED'
  | 'MANUAL_HUB_EDIT';           // ручное редактирование через chat
```

### Distillation при логировании

Каждый лог проходит `distillDocument()` через `resolveModel('distillation')`
(cheap model). Результат: `summary` + `tags` + `keyEntities`.
Raw-текст из MEMORY.md **никогда** не попадает в лог.

---

## 3. Event-Driven Task Delegation

### Триггеры

После каждого нового `TeamActivityLog` система рассылает событие
подписчикам-агентам в той же команде.

```typescript
type HubEvent =
  | { type: 'LOG_ADDED';              log: TeamActivityLog }
  | { type: 'TASK_PROPOSED';          task: AgentTask }
  | { type: 'BLOCKER_FLAGGED';        log: TeamActivityLog }
  | { type: 'DEPLOYMENT_EVENT';       log: TeamActivityLog }
  | { type: 'STRATEGY_SESSION_STARTED'; sessionId: string }
  | { type: 'APPROVAL_REQUESTED';     taskId: string; targetOwnerId: string }
```

### AgentTask

```typescript
interface AgentTask {
  id: string;
  communityId: string;
  proposedByOwnerId: string;
  assignedToOwnerId: string;     // целевой участник
  assignedToAgentId?: string;    // если делегируется напрямую агенту
  title: string;
  description: string;
  taskCategory: TaskCategory;
  autoDelegatable: boolean;      // можно ли без одобрения человека
  requiresApproval: boolean;
  status: 'PROPOSED' | 'DELEGATED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  sourceLogId?: string;          // какой лог породил задачу
  dueAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

type TaskCategory =
  | 'CODE_REVIEW'         // auto_delegatable: true
  | 'DEPLOY'              // auto_delegatable: true (внутренний)
  | 'SOCIAL_DRAFT'        // auto_delegatable: true (только драфт)
  | 'SOCIAL_PUBLISH'      // auto_delegatable: false — нужно одобрение
  | 'MERGE_TO_MAIN'       // auto_delegatable: false — нужно одобрение
  | 'STRATEGY_PROPOSAL'   // auto_delegatable: false
  | 'BLOCKER_ESCALATION'  // auto_delegatable: true
  | 'NOTIFICATION';       // auto_delegatable: true
```

### Правило Human in the Loop

```
if task.autoDelegatable:
    agent → DELEGATE_TASK → выполняет напрямую → логирует результат
else:
    agent → REQUEST_APPROVAL → inbox пользователя
    if approved:
        agent → выполняет → логирует
    if denied:
        agent → логирует отказ, задача REJECTED
```

### Пример полной цепочки

```
1. Dev-агент: CODE_COMMITTED (PR #42 opened)
   → log в Hub

2. Maintainer-агент видит LOG_ADDED (PR_OPENED)
   → PROPOSE_TASK(CODE_REVIEW, autoDelegatable=true)
   → Maintainer-агент: читает PR, оставляет ревью, пушит правки
   → log: PR_REVIEWED, PR_MERGED

3. DevOps-агент видит LOG_ADDED (PR_MERGED)
   → DELEGATE_TASK(DEPLOY, autoDelegatable=true)
   → запускает деплой pipeline
   → log: DEPLOYMENT_COMPLETED (v1.4.2)

4. SMM-агент видит LOG_ADDED (DEPLOYMENT_COMPLETED)
   → DELEGATE_TASK(SOCIAL_DRAFT, autoDelegatable=true)
   → составляет пост для X
   → REQUEST_APPROVAL → inbox SMM-пользователя
   → пользователь одобряет
   → log: SOCIAL_POST_PUBLISHED
```

---

## 4. Weekly Strategy Session

### Запуск

Cron: каждый понедельник 09:00 UTC → `/api/cron/team-strategy-weekly`
Либо вручную: OWNER/ADMIN через UI или команду OpenClaw.

### Этапы

**1. Сбор данных** (Participant Agents, `resolveModel('strategy_participant')`)

- GitHub-аналитика из Hub-логов:
  - фичи, закрытые за неделю
  - velocity PR (время open → merge)
  - блокеры (открытые и закрытые)
  - соотношение feature / bug / refactor

- Агентная эффективность из `AgentEfficiencySnapshot`:
  - задач выполнено на агента
  - % автономных делегаций
  - среднее время реакции на триггер
  - REQUEST_APPROVAL: % одобрений / отказов

- Медиа-аналитика из `ContentOpportunity` + внешних API:
  - посты опубликованы за неделю
  - engagements по каждому посту
  - какие фичи упомянуты
  - виральные vs. незамеченные

**2. Синтез** (Judge Agent, `resolveModel('strategy_judge')`)

Judge Agent получает все данные → формирует:
- `WeeklyStrategySummary` (Markdown, для команды)
- `CommunityActionProposal[]` (рекомендации на одобрение)
- `AgentEfficiencyReport` (по ролям)
- `ContentOpportunity[]` (что стоит опубликовать на следующей неделе)

**3. Доставка**

- Summary публикуется в Group Chat команды
- Proposals попадают в inbox OWNER/ADMIN для одобрения
- Efficiency report доступен OWNER/ADMIN

### Выходные типы

```typescript
interface WeeklyStrategySummary {
  id: string;
  communityId: string;
  weekStart: Date;
  weekEnd: Date;
  githubSection: string;       // Markdown
  agentSection: string;        // Markdown
  mediaSection: string;        // Markdown
  keyInsights: string[];       // топ-3 инсайта
  risks: string[];             // риски на следующую неделю
  createdAt: Date;
}

interface AgentEfficiencySnapshot {
  id: string;
  communityId: string;
  ownerIdSubject: string;      // чей агент
  weekStart: Date;
  tasksCompleted: number;
  tasksDelegatedAuto: number;
  tasksRequiredApproval: number;
  approvalsGranted: number;
  approvalsDenied: number;
  avgResponseMinutes: number;
  blockersFlagged: number;
  blockersResolved: number;
}

interface ContentOpportunity {
  id: string;
  communityId: string;
  triggerLogId: string;        // какой лог породил идею
  suggestedPlatform: 'X' | 'LINKEDIN' | 'TELEGRAM' | 'OTHER';
  draftContent?: string;       // если агент уже составил драфт
  status: 'PROPOSED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  createdAt: Date;
}
```

---

## 5. MCP Tools для OpenClaw

### `log_activity`

```typescript
interface LogActivityInput {
  communityId: string;
  actionType: ActivityActionType;
  content: string;             // описание от агента
  references?: ActivityReference[];
}
// → TeamActivityLog (distilled)
```

### `read_team_context`

```typescript
interface ReadTeamContextInput {
  communityId: string;
  query: string;               // semantic search
  filterActionTypes?: ActivityActionType[];
  since?: Date;
  limit?: number;              // default 10
}
// → TeamActivityLog[] (ranked by relevance)
```

### `propose_task`

```typescript
interface ProposeTaskInput {
  communityId: string;
  assignedToOwnerId: string;
  title: string;
  description: string;
  taskCategory: TaskCategory;
  sourceLogId?: string;
}
// → AgentTask (status: PROPOSED)
// → HubEvent TASK_PROPOSED → inbox целевого участника
```

### `delegate_task`

```typescript
interface DelegateTaskInput {
  taskId: string;              // должен быть autoDelegatable=true
  executionNote?: string;
}
// Проверяет autoDelegatable, иначе выбрасывает ошибку
// → AgentTask (status: DELEGATED)
// → log: TASK_DELEGATED
```

### `request_approval`

```typescript
interface RequestApprovalInput {
  communityId: string;
  targetOwnerId: string;       // кто должен одобрить
  taskId?: string;
  actionDescription: string;
  urgency: 'low' | 'medium' | 'high';
}
// → HubEvent APPROVAL_REQUESTED → inbox targetOwnerId
// → AgentTask или отдельная запись ApprovalRequest
```

---

## 6. Файлы для имплементации

### Новые файлы

```
src/lib/services/team-activity-log.ts     — write/read activity logs
src/lib/services/agent-task-pipeline.ts   — PROPOSE/DELEGATE/REQUEST flow
src/lib/services/team-strategy-session.ts — weekly analysis engine
src/lib/services/agent-efficiency.ts      — metrics aggregation
src/lib/services/content-opportunities.ts — SMM proposals
src/lib/mcp/tools/log-activity.ts         — MCP tool
src/lib/mcp/tools/read-team-context.ts    — MCP tool
src/lib/mcp/tools/propose-task.ts         — MCP tool
src/lib/mcp/tools/delegate-task.ts        — MCP tool
src/lib/mcp/tools/request-approval.ts     — MCP tool
src/app/api/cron/team-strategy-weekly/route.ts
src/app/api/cron/team-activity-digest/route.ts
```

### Изменяемые файлы

```
prisma/schema.prisma             — новые модели (см. ниже)
src/lib/mcp/tools/check-in.ts   — добавить log_activity, propose_task
src/lib/model-advice.ts         — экспорт ModelTask для новых задач
CLAUDE_CODE_CONTEXT.md          — обновить архитектурный раздел
```

### Prisma-модели

```
TeamActivityLog
AgentTask
WeeklyStrategySummary
AgentEfficiencySnapshot
ContentOpportunity
ApprovalRequest
```

---

## 7. Инварианты

1. `DELEGATE_TASK` возможен **только** если `task.autoDelegatable = true`. Иначе — ошибка.
2. `SOCIAL_PUBLISH`, `MERGE_TO_MAIN`, финансовые действия — **всегда** `autoDelegatable = false`.
3. Raw MEMORY.md **никогда** не попадает в `TeamActivityLog`.
4. Каждый LLM-вызов использует `resolveModel(task)` и записывает `ComputeUsage`.
5. Агент **никогда** не меняет роли (OWNER/ADMIN/MEMBER) напрямую — только через `CommunityActionProposal`.
6. Все логи имеют поля `autoDelegated` и `humanApproved` для полной аудитируемости.
7. `OWNER/ADMIN` всегда могут остановить любую автономную цепочку.

---

## 8. Эволюция модели управления

```
Фаза 1 (сейчас):    Люди управляют, агенты логируют и предлагают задачи
Фаза 2 (ближайшая): Агенты автономно передают auto_delegatable задачи
                    Human-in-the-Loop только для внешних действий
Фаза 3 (будущая):   Контролирующие агенты (supervisor role) заменяют
                    большинство Human-in-the-Loop проверок
                    Человек = точка override для критических решений
```
