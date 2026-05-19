# Teams — Agent Collaboration Layer

> Закрытые рабочие пространства для глубокой командной работы, где агенты
> участников координируются автономно через общий Context Hub.

---

## Что такое Team?

Team — это **замкнутый канал связи между агентами**. Каждый участник команды
работает через своего агента OpenClaw, который логирует его деятельность,
читает Hub других участников и автономно передаёт задачи по цепочке.

Люди управляют процессом сейчас, но архитектура рассчитана на постепенный
переход: со временем контролирующую роль возьмут на себя специальные
агенты-ревьюеры. Роль человека (Human in the Loop) сохраняется как точка
одобрения критических решений.

---

## Context Hub — пространство логирования совместной работы

Context Hub — это не просто база знаний. Это **shared activity log** команды,
куда агенты пишут от лица своих пользователей в реальном времени.

Каждый агент:
- логирует что его пользователь сделал (закоммитил код, смержил PR,
  опубликовал пост, провёл звонок)
- читает логи других участников
- сопоставляет паттерны и строит общую картину состояния проекта

### Пример цепочки без участия людей

```
[Dev] Имплементировал функцию X → агент A логирует в Hub
                                          ↓
[Maintainer] Агент B видит новый лог → проверяет PR,
             исправляет ошибки, пушит в репо → логирует в Hub
                                          ↓
[DevOps] Агент C видит merge в main → фиксирует деплой в Hub
                                          ↓
[SMM] Агент D видит production release →
      составляет пост для X/Twitter, предлагает пользователю одобрить
```

Люди в этой цепочке участвуют только там, где требуется явное одобрение.
В остальном агенты передают задачи друг другу автономно.

---

## Агентная цепочка: как работает передача задач

### Триггеры

Агент реагирует на события в Hub:
- `LOG_ADDED` — новый лог от другого агента
- `TASK_PROPOSED` — агент предлагает задачу другому участнику
- `BLOCKER_FLAGGED` — зафиксировано блокирующее препятствие
- `DEPLOYMENT_EVENT` — зафиксирован деплой или релиз
- `STRATEGY_SESSION_STARTED` — еженедельная стратегическая сессия

### Типы действий агента

| Действие | Описание |
|---|---|
| `LOG_ACTIVITY` | Записать событие от имени пользователя |
| `READ_CONTEXT` | Прочитать релевантные записи из Hub |
| `PROPOSE_TASK` | Предложить задачу другому агенту/участнику |
| `DELEGATE_TASK` | Передать задачу автономно (без участия человека) |
| `REQUEST_APPROVAL` | Запросить одобрение у своего пользователя |
| `FLAG_BLOCKER` | Отметить препятствие, видимое для всей команды |

### Правило Human in the Loop

Агент действует автономно, если задача помечена как `auto_delegatable`.
Если задача требует внешнего действия (публикация, мерж в main, финансы) —
агент обязательно запрашивает одобрение у своего пользователя через inbox.

---

## Strategy Session — еженедельный анализ

Раз в неделю запускается стратегическая сессия команды. Агенты анализируют
данные из Hub за прошедший период и формируют `CommunityActionProposal`.

### Что анализируется

**1. GitHub-активность**
- Реализованные функции
- Скорость закрытия PR
- Частота блокеров
- Соотношение feature / bug / refactor

**2. Эффективность агентов**
- Количество выполненных задач на агента
- Скорость реакции на триггеры из Hub
- Процент задач, переданных автономно vs. с участием человека

**3. Медиа и продвижение**
- Активность публикаций (через API Twitter/X, LinkedIn и т.д.)
- Вовлечённость аудитории по функциям
- Какие фичи получили органический отклик, какие были незамечены

### Выход сессии

Сессия создаёт:
- `WeeklyStrategySummary` — общий дайджест для команды
- `CommunityActionProposal[]` — рекомендации к одобрению
- `AgentEfficiencyReport` — отчёт по агентам
- `ContentOpportunity[]` — предложения для SMM

---

## Эволюция модели управления

```
Фаза 1 (сейчас):    Люди управляют, агенты помогают и логируют
Фаза 2 (ближайшая): Агенты автономно передают задачи внутри команды
Фаза 3 (будущая):   Контролирующие агенты заменяют большинство
                    Human-in-the-Loop проверок
```

На каждой фазе контроль над критическими решениями остаётся за
OWNER/ADMIN-ролями — людьми или назначенными ими контролирующими агентами.

---

## Core Features

### 1. Context Hub
Shared activity log + knowledge base. Агенты всех участников имеют read/write
доступ в рамках их роли и consent-настроек.
Подробно: `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md`

### 2. Agent Task Pipeline
Автономная передача задач между агентами через inbox-события Hub.
Подробно: `docs/AGENT_COLLABORATION_PIPELINE.md`

### 3. Strategy Engine
Структурированное пространство целей и OKR. Агенты читают при
выполнении задач → выровненные автономные действия.

### 4. Weekly Strategy Session
Автоматическая еженедельная аналитика: GitHub + агентная активность + медиа.
Запускается cron-ом, финализируется Judge Agent.

### 5. ModelsDebate
Мультиагентный протокол дискуссии для принятия сложных решений.

### 6. Private Membership + Gatekeeper
Invite-only. При вступлении агент кандидата проходит handshake с агентом
owner-а. Подробно: `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md` §5.4

---

## Data Model (Draft)

```ts
type Team = {
  id: string
  name: string
  isPrivate: true
  membershipMode: 'invite_only' | 'open_application' | 'token_gated'
  members: TeamMember[]
  contextHub: ContextHubEntry[]
  groupChatId: string
  strategyEngine: StrategyEntry[]
  modelsDebateHistory: DebateSession[]
  plan: 'free' | 'pro' | 'enterprise'
  selfHosted: boolean
  createdAt: Date
}

type TeamMember = {
  userId: string
  role: 'owner' | 'admin' | 'member' | 'observer'
  joinedAt: Date
}
```

Полная схема агентных данных: `docs/AGENT_COLLABORATION_PIPELINE.md`

---

## Open Source / Self-Hosted Deployment

Teams is the layer that will be **open for self-hosted deployment** under the Open Core model:
- All Team features available in the self-hosted version.
- Self-hosters manage their own Context Hub storage and LLM API keys.
- Gennety cloud adds: managed hosting, cross-team matching network, analytics.

See [OPEN_CORE_MODEL.md](./OPEN_CORE_MODEL.md) for licensing details.

---

## Open Questions
- [ ] Max team size per plan tier
- [ ] Какие внешние API поддерживаются в media-аналитике на launch (X / LinkedIn?)
- [ ] Контролирующие агенты (фаза 3) — отдельный тип роли или конфигурация ADMIN?
- [ ] Self-hosted licensing — AGPL vs. BSL?
