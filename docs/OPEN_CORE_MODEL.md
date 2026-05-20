# Open Core Monetisation Model

> Gennety использует **GitLab-style open core**: базис фреймворка открыт,
> облачная инфраструктура и корпоративные фичи — коммерческие.

---

## Что открыто, что закрыто

```
┌─────────────────────────────────────────────────────┐
│              GENNETY OPEN CORE                      │
├──────────────────────────┬──────────────────────────┤
│   OPEN SOURCE (AGPL)     │   COMMERCIAL             │
├──────────────────────────┼──────────────────────────┤
│ Team Framework базис     │ Managed cloud hosting    │
│  — Context Hub protocol  │ Cross-team matching      │
│  — Strategy Session      │   network                │
│  — Agent Pipeline        │ Analytics dashboard      │
│  — Model Router          │ Enterprise SSO           │
│ Agent runtime (OpenClaw) │ Managed LLM cost budget  │
│ Matching engine          │ SLA + support            │
│ Communities              │ Marketplace              │
│ Connector adapters       │                          │
│ soul.md templates        │                          │
│ Self-hosted infra        │                          │
└──────────────────────────┴──────────────────────────┘
```

### Логика разделения

Открыт **протокол и базис** — то, что команда должна иметь возможность
запустить локально и кастомизировать без ограничений.

Коммерческой остаётся **сеть**: cross-team matching, cloud-хостинг,
аналитика по всем командам. Это нельзя воспроизвести, просто скопировав
open source код — реальный моат строится на сетевом эффекте.

---

## Почему Open Core?

1. **Дистрибуция** — open source = бесплатный маркетинг, доверие разработчиков, комьюнити-контрибуции.
2. **Self-hosters становятся адвокатами** — команды, деплоящие Gennety локально, распространяют бренд.
3. **Upsell-путь** — self-hosters упираются в лимиты (нет cross-network матчинга, нет managed hosting) и переходят на облако.
4. **Defensibility** — сетевой эффект — настоящий ров, не сам код.

---

## Pricing Tiers (Draft)

| Tier | Цена | Включает |
|---|---|---|
| **Self-Hosted** | Бесплатно | Полный Team Framework базис, собственные LLM ключи, без облачной сети |
| **Free** | $0 | Communities, базовый матчинг, 1 агент, Telegram бот |
| **Pro** | $12/мес per user | Teams до 20 участников, облачный Hub, Strategy Session |
| **Business** | $49/мес per team | Неограниченно, ModelsDebate, приоритетный матчинг, аналитика |
| **Enterprise** | Custom | SSO, SLA, dedicated infra, кастомные LLM, кросс-командная сеть |

---

## Сравнение с референсными моделями

| Компания | Открытая часть | Коммерческая часть | Ключевой урок |
|---|---|---|---|
| **GitLab** | CE (core DevOps) | EE (security, analytics) | OSS должен быть реально полезен сам по себе |
| **Elastic** | Elasticsearch | Security, ML, SIEM | Не ограничивай core слишком сильно |
| **HashiCorp** | Terraform OSS | Terraform Cloud/Enterprise | Сетевые эффекты живут в облаке |
| **Gennety** | Team Framework базис | Облачная сеть, аналитика | Протокол открыт, сеть — продукт |

---

## Лицензирование

- **Core (Team Framework, agent runtime, matching, communities):** AGPL-3.0
  — Обеспечивает открытость модификаций.
  — Форки, предоставляющие SaaS, обязаны контрибьютить обратно или купить коммерческую лицензию.
- **Коммерческие фичи (cloud network, analytics, enterprise):** Proprietary
  — Не включены в публичный репозиторий.
- **Self-hosted distribution:** BSL (рассматривается) → конвертируется в AGPL через 4 года.

---

## Revenue Model

```
Primary:   SaaS subscriptions (Pro + Business + Enterprise)
Secondary: Marketplace (third-party agent skills / integrations)
Tertiary:  Professional services (custom deployments for enterprises)
```

---

## Open Questions
- [ ] Финализировать лицензию core: AGPL vs. MIT
- [ ] BSL sunset period — 4 или 3 года?
- [ ] Marketplace revenue share — 70/30 или 80/20?
- [ ] Лимиты Free tier — сколько matches/month до paywall?
- [ ] Какие soul-templates войдут в v1 базиса?
