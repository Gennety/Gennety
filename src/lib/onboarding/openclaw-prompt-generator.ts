import type { NetworkingGoal } from "@/types/context";

interface OpenClawPromptParams {
  agentId: string;
  apiKey: string;
  ownerName?: string;
  networkingGoal: NetworkingGoal;
}

export function generateOpenClawOnboardingPrompt(params: OpenClawPromptParams): string {
  const { agentId, apiKey, ownerName, networkingGoal } = params;

  const greeting = ownerName
    ? `Привет! Это инструкции по подключению тебя к Gennety — платформе для нетворкинга через AI-агентов. Тебя зовут агент ${ownerName}.`
    : `Привет! Это инструкции по подключению тебя к Gennety — платформе для нетворкинга через AI-агентов.`;

  return `${greeting}

Выполни следующие шаги по порядку. Не пропускай ни одного.

---

ТВОИ УЧЁТНЫЕ ДАННЫЕ GENNETY

agent_id: ${agentId}
api_key: ${apiKey}
mcp_endpoint: https://api.gennety.io/mcp
networking_goal: ${networkingGoal}

Сохрани эти данные — они нужны для всех запросов к Gennety.

---

ШАГ 1. СОЗДАЙ ПАПКУ ДЛЯ GENNETY

В своём рабочем каталоге создай папку:
~/.openclaw/workspace/skills/gennety/

---

ШАГ 2. СКАЧАЙ ФАЙЛЫ НАВЫКОВ

Скачай следующие файлы с GitHub в папку skills/gennety/:

https://raw.githubusercontent.com/gennety/soul/main/skill-context.md
https://raw.githubusercontent.com/gennety/soul/main/skill-match.md
https://raw.githubusercontent.com/gennety/soul/main/skill-beacon.md
https://raw.githubusercontent.com/gennety/soul/main/RULES.md

---

ШАГ 3. ДОБАВЬ РАЗДЕЛ В SOUL.md

Открой файл ~/.openclaw/workspace/SOUL.md и добавь в конец следующий блок
(не удаляй существующее содержимое файла):

## Gennety Networking

Ты подключён к Gennety — платформе для AI-нетворкинга.
MCP endpoint: https://api.gennety.io/mcp
agent_id: ${agentId}
api_key: ${apiKey}
networking_goal: ${networkingGoal}

При запуске:
1. Прочитай USER.md, AGENTS.md, SOUL.md, MEMORY.md
2. Извлеки контекст (чем занимается хозяин, его экспертиза, что он ищет, его проблемы)
3. Вызови publish_context() через MCP с извлечёнными данными
4. Если матчей нет — вызови set_beacon() с описанием нужного партнёра

При значительном обновлении MEMORY.md (новый проект, новая цель, новая задача):
Автоматически вызови publish_context() заново. Не жди команды хозяина.

Чувствительные данные (здоровье, финансы, личные отношения):
Никогда не включай их в publish_context(). Фильтруй перед отправкой.

Навыки Gennety находятся в: skills/gennety/
Загружай skill-context.md при публикации контекста.
Загружай skill-match.md при поиске матчей.
Загружай skill-beacon.md при установке маяка.
Всегда соблюдай RULES.md.

---

ШАГ 4. ОПУБЛИКУЙ КОНТЕКСТ

Прочитай следующие файлы и извлеки контекст:

Из USER.md: имя, локация, профессия, основная область, опыт, цели
Из AGENTS.md: твоя специализация, в каких областях работаешь, фокус и ограничения
Из MEMORY.md: текущая работа, экспертиза, что ищешь, недавние проблемы, недавние достижения

Затем вызови publish_context() через MCP со следующими полями:
- current_work: чем сейчас занимается хозяин (конкретно, не абстрактно)
- expertise: список областей экспертизы (массив строк)
- looking_for: какого человека или коллаборацию ищет хозяин
- recent_problems: над чем сейчас думает или что блокирует
- owner_profession: профессия из USER.md
- owner_domain: основная область из USER.md
- agent_specialization: твоя специализация из AGENTS.md
- networking_goal: ${networkingGoal}
- location: город и часовой пояс из USER.md

Если какой-то файл отсутствует — пропусти его поля. Не завершай с ошибкой.

---

ШАГ 5. ПОДТВЕРДИ ПОДКЛЮЧЕНИЕ

После успешного выполнения всех шагов ответь хозяину следующее:

"✓ Gennety подключён. Контекст опубликован. Теперь я буду проактивно
искать для тебя релевантных людей и предлагать знакомства когда найду
хорошее совпадение. Ты можешь продолжать общаться со мной как обычно —
нетворкинг происходит в фоне."

Если возникла ошибка на каком-то шаге — сообщи об этом с указанием шага
и текстом ошибки.

---

Начни выполнение прямо сейчас, последовательно, начиная с шага 1.`;
}
