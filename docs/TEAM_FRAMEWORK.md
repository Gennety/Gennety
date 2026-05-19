# Gennety Team Framework

> Стандартизированный фреймворк для командной работы агентов.
> Аналог CrewAI / LangChain, но ориентированный на команды людей+агентов,
> а не на изолированные агентные пайплайны.

---

## Что это такое

Team Framework — это **протокол и runtime для координации агентов** внутри
команды. Команда может состоять из людей с агентами, из чистых агентов,
или из любой комбинации. Фреймворк даёт им общий язык, общую память
и механизм передачи задач.

В отличие от CrewAI (где агенты — это роли внутри одного процесса),
здесь каждый агент обслуживает конкретного оператора (человека или
другого агента) и работает от его лица. Оркестрация — не централизованная,
а peer-to-peer через Context Hub.

Gennety Dating — это **reference implementation** фреймворка для конкретного
use-case (знакомства и нетворкинг). Сам фреймворк применим к любой
команде: стартап, dev-команда, контент-агентство, исследовательская группа.

---

## Два режима работы

`teamMode: 'autonomous' | 'assisted'`

### Режим 1 — Полная автоматизация (`autonomous`)

Сервис анализирует командные процессы и workflow, после чего:
1. Читает `soul.md` каждого агента и конфигурацию его оператора
2. Генерирует стандартизированные инструкции под каждого агента
3. Раздаёт права и задачи автономно
4. Назначает оркестратора — либо один из существующих агентов команды,
   либо сам сервис

Агенты работают автономно. Человек подключается только при
`REQUEST_APPROVAL` для критических действий.

### Режим 2 — Ручное управление с ускорением (`assisted`)

Человек-оператор руководит процессом, но агент:
- анализирует `soul.md` оператора и его историю в Hub
- предлагает следующие шаги проактивно
- берёт на себя рутинные задачи без запроса
- сообщает о блокерах и паттернах, которые оператор мог не заметить

Человек тратит минимум времени, принимая только значимые решения.

---

## Базис (Open Source)

Базис фреймворка — два примитива, открытых для кастомизации:

### 1. Context Hub

Общая структурированная память команды. Агенты:
- пишут туда логи активности (`log_activity`)
- читают оттуда контекст по запросу (`read_team_context`)
- редактируют вручную через чат с OpenClaw (`hub_edit`)

Базис включает: схему данных, distillation pipeline, векторный поиск,
права доступа по ролям.

Пользователь может кастомизировать:
- типы логируемых событий (`ActivityActionType`)
- правила distillation (промпты)
- структуру документов в Hub

### 2. Strategy Session

Периодический (по умолчанию еженедельный) анализ работы команды.
Агенты анализируют Hub, формируют рекомендации, Judge Agent финализирует.

Базис включает: Participant + Judge agent архитектуру, аналитические
измерения (GitHub, агентная эффективность, медиа), выходные форматы.

Пользователь может кастомизировать:
- частоту сессий
- измерения (заменить GitHub на Jira, медиа на любой другой API)
- промпты для Participant и Judge агентов
- формат и адресатов выходных документов

---

## Инструкции для агентов

Фреймворк генерирует **стандартизированные инструкции** для каждого агента
команды. Инструкции адаптируются автоматически под:

1. **Модель агента** — Haiku получает более конкретные, короткие инструкции;
   Sonnet — более контекстные, с нюансами
2. **Тип агента** — orchestrator, specialist, reviewer, observer
3. **Оператора** — агент читает `soul.md` оператора, его историю в Hub,
   его роль в команде → адаптирует стиль взаимодействия

### Структура AgentInstruction

```typescript
interface AgentInstruction {
  agentId: string
  operatorProfile: {
    workStyle: string
    preferredApprovalAreas: string[]
    autonomyLevel: 'low' | 'medium' | 'high'
  }
  teamContext: {
    myRole: AgentRole
    teamGoals: string[]
    currentBlockers: string[]
    recentActivityDigest: string
  }
  operatingMode: 'autonomous' | 'assisted'
  delegationRights: {
    canAutoDelegate: string[]
    requiresApproval: string[]
    forbidden: string[]
  }
}
```

### AgentSelfAssessment

Перед каждой Strategy Session агент читает свои логи за период:

```typescript
interface AgentSelfAssessment {
  periodStart: Date
  periodEnd: Date
  tasksCompleted: number
  tasksAutoDelegated: number
  approvalsRequested: number
  blockersRaised: number
  responseTimeP50: number
  gaps: string[]
  suggestions: string[]
}
```

---

## Типы агентов

| Тип | Роль | Типичные задачи |
|---|---|---|
| `orchestrator` | Раздаёт задачи остальным | Декомпозиция, делегирование, мониторинг |
| `specialist` | Выполняет задачи в своём домене | Код, дизайн, контент, анализ |
| `reviewer` | Проверяет результаты других | PR-ревью, fact-check, quality gate |
| `observer` | Мониторит и уведомляет | Метрики, сигналы, алерты |

Тип назначается в конфигурации или выводится автоматически из `soul.md`
и паттернов активности в Hub.

---

## Автономность: как она нарастает

```
Фаза 1 — Assisted
  Агент предлагает, человек решает.
  canAutoDelegate: []

Фаза 2 — Semi-autonomous
  Агент автономно делает рутину, человек — стратегию.
  canAutoDelegate: ['hub_doc_add', 'task_propose',
                    'code_review_request', 'status_update']

Фаза 3 — Autonomous (с контролирующим агентом)
  canAutoDelegate: всё кроме ['external_publish', 'merge_to_main', 'finance']
  Контролирующий агент (reviewer) заменяет большинство HITL-проверок.
```

Переход между фазами — ручной (OWNER меняет `autonomyLevel`) или
предлагается фреймворком по итогам Strategy Session.

---

## Структура open source репозитория

```
gennety-team-framework/
├── core/
│   ├── context-hub/          ← схема данных, distillation, поиск
│   ├── strategy-session/     ← базовый движок сессий
│   ├── agent-pipeline/       ← log, propose, delegate, approve
│   └── model-router/         ← task → model mapping
├── adapters/                 ← заменяемые интеграции
│   ├── github/
│   ├── telegram/
│   ├── notion/
│   └── [добавь своё]/
├── agent-types/              ← orchestrator, specialist, reviewer, observer
│   └── [добавь свой тип]/
└── soul-templates/           ← базовые soul.md шаблоны
    ├── developer.md
    ├── designer.md
    ├── manager.md
    └── [добавь свой]/
```

Каждое улучшение, сделанное командой для своих нужд, добавляет специализацию
в базис и может быть опубликовано обратно в open source.

---

## Позиционирование

```
CrewAI          — агентные роли внутри одного процесса
LangChain       — инструменты для построения цепочек LLM-вызовов
AutoGPT         — автономный агент для одиночных задач
Gennety Teams   — фреймворк для команд людей+агентов с общей памятью,
                  протоколом передачи задач и периодической оптимизацией
```

---

## Связанные документы

- `docs/AGENT_COLLABORATION_PIPELINE.md` — техническая спецификация трёх слоёв
- `docs/MODEL_ROUTING.md` — model router + hub_edit tool
- `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md` — Prisma-схемы и стратегические сессии
- `docs/OPEN_CORE_MODEL.md` — лицензирование и монетизация
