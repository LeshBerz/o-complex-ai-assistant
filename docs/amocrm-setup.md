# Интеграция с amoCRM

Цепочка: клиент пишет в чат amoCRM → вебхук `add_message` → `POST /api/amocrm/webhook` → сервис
собирает контекст сделки → ядро `assist()` → примечание «🤖 Черновик ответа… / 💡 Допродажа…» в
карточке сделки.

Документация, по которой сверялось (даты обращения: 2026-09-30):
- вебхуки, формат: https://www.amocrm.ru/developers/content/crm_platform/webhooks-format
- вебхуки, API подписки: https://www.amocrm.ru/developers/content/crm_platform/webhooks-api
- примечания и события: https://www.amocrm.ru/developers/content/crm_platform/events-and-notes
- сделки / контакты / беседы / воронки: `leads-api`, `contacts-api`, `talks-api`, `leads_pipelines` в том же разделе
- виды интеграций: https://www.amocrm.ru/developers/content/crm_platform/platform-abilities
- долгосрочный токен: https://www.amocrm.ru/developers/content/oauth/step-by-step
- лимиты: https://www.amocrm.ru/developers/content/api/recommendations

## Что проверено в документации

| Факт | Где |
|---|---|
| Приватная интеграция: amoМаркет → «⋯» → «Создать интеграцию», без модерации, работает в одном аккаунте | platform-abilities |
| Долгосрочный токен (с февраля 2024): вкладка «Ключи» интеграции → «Сгенерировать токен», срок от 1 дня до 5 лет, без refresh_token, виден один раз | oauth/step-by-step |
| Запросы: заголовок `Authorization: Bearer {token}` | oauth/step-by-step |
| Вебхук приходит как `x-www-form-urlencoded`, вида `{entity:{action:{"0":{…}}}}` | webhooks-format |
| amoCRM ждёт ответ **не дольше 2 с**. Успех — HTTP 100–299. Повторы через 5 мин, 15 мин, 15 мин, 1 ч. Более 100 невалидных откликов за 2 ч отключают хук | webhooks-format |
| События подписки: `add_message` (входящее от клиента), `add_outgoing_message`, `status_lead`, `add_lead`, `note_lead` и др. | webhooks-api |
| Подписка через UI (amoМаркет → «WEB HOOKS») или `POST /api/v4/webhooks` с `destination` и `settings` | webhooks-format, webhooks-api |
| Тело `message[add][0]`: `id`, `chat_id`, `talk_id`, `contact_id`, `text`, `created_at`, `message_type`, `origin`, `author{id,type,name}`, `element_id`, `element_type` | webhooks-format (пример входящего сообщения) |
| Тело `leads[status][0]`: `id`, `name`, `status_id`, `old_status_id`, `price`, `responsible_user_id`, `account_id`, … (**`pipeline_id` в примере нет**) | webhooks-format |
| Блок `account{subdomain,id,_links.self}` есть в примерах событий сделок и неразобранного | webhooks-format |
| `GET /api/v4/leads/{id}?with=contacts` → `status_id`, `pipeline_id`, `_embedded.contacts[{id,is_main}]` | leads-api |
| `GET /api/v4/contacts/{id}` → `first_name`, `name`, `custom_fields_values[{field_id,field_name,field_code,field_type,values[{value}]}]` | contacts-api |
| `GET /api/v4/talks/{id}` → `entity_id`, `entity_type` (`lead`/`customer`), `contact_id` | talks-api |
| `GET /api/v4/leads/pipelines/{pipeline_id}/statuses/{id}` → `name`. Системные этапы 142 (успешно) и 143 (не реализовано) | leads_pipelines |
| `GET /api/v4/leads/{id}/notes`: `limit` ≤ 250, `order[id|updated_at]`, `filter[note_type]`, ответ `_embedded.notes[{note_type, params.text, created_at}]` | events-and-notes |
| `POST /api/v4/leads/{id}/notes`: тело — **массив**, `note_type: "common"`, `params.text` | events-and-notes |
| Типы примечаний: `common`, `sms_in`, `sms_out`, `call_in`, `call_out`, `service_message`, `extended_service_message`, … | events-and-notes |
| События `incoming_chat_message` / `outgoing_chat_message` в `value_after` содержат только `message.id`, **без текста** | events-and-notes |
| Лимиты: 7 запросов/с на интеграцию, 50 запросов/с на аккаунт. При превышении 429, при многократном нарушении блокировка с 403 | api/recommendations |

## Что НЕ проверено (предположения)

- **`account` в вебхуке `add_message`**: в примере документации блока нет. В фикстуре он есть, сервис его не использует.
- **`element_type = "2"` означает сделку.** В описании вебхука значения не расписаны. Основной путь к сделке идёт через `talk_id` → `GET /api/v4/talks/{id}` (проверено), `element_*` используется только как запасной.
- **`GET /api/v4/leads/{id}/notes` возвращает 204 при пустом списке.** Так ведут себя списки v4, но для этого метода в таблице кодов 204 не указан. Клиент обрабатывает оба варианта.
- **Точная форма ответа `POST …/notes`.** В документации есть `id`, `entity_id`, `request_id` внутри `_embedded.notes`. Клиент читает `_embedded.notes[0].id` и не падает, если поля нет.
- **Поддомен `.amocrm.ru`.** Аккаунты на `amocrm.com` / Kommo в этой версии не поддержаны.
- **Поле «Купленные товары» у контакта.** Это наша договорённость для демо, а не стандарт amoCRM (см. ниже).
- Реальный аккаунт на момент написания не подключался: live-режим проверен только typecheck'ом, запросы по документации.

## Откуда берётся контекст

| Поле контракта | Источник |
|---|---|
| `client_message` | `message[add][0][text]` из вебхука. Для `status_lead` / `add_lead`: последнее сообщение клиента из локальной истории. Если его нет, событие пропускается |
| `dialog_history` | локальная история (`logs/amocrm-messages.jsonl`) + примечания `sms_in`/`sms_out`, последние 20 реплик |
| `customer_context.name` | `first_name` (или `name`) главного контакта сделки |
| `customer_context.past_purchases` | доп. поле контакта с id `AMOCRM_PURCHASES_FIELD_ID`: id товаров из `data/kb/products.json` через запятую. Неизвестные id отбрасываются |
| `customer_context.deal_status` | название этапа (`…/pipelines/{p}/statuses/{s}`), при ошибке `status_id` |

**Ограничение по истории чата.** REST API не отдаёт текст переписки из чатов: события содержат
только id сообщения, а Chat API предназначен для интеграций-каналов. Поэтому сервис сам копит
тексты из вебхуков `add_message` (клиент) и `add_outgoing_message` (менеджер). История начинается
с момента подключения вебхука. Хранилище — файл: для демо этого достаточно, в продакшене нужна БД.
Обычные примечания `common` в историю не берутся, потому что это внутренние комментарии
сотрудников. Наши примечания (начинаются с 🤖) тоже не берутся.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `AMOCRM_MODE` | `mock` (по умолчанию) или `live` |
| `AMOCRM_SUBDOMAIN` | `example` для `https://example.amocrm.ru` |
| `AMOCRM_ACCESS_TOKEN` | долгосрочный токен приватной интеграции |
| `AMOCRM_WEBHOOK_SECRET` | секрет в `?secret=` вебхука. Без него эндпоинт отвечает 503 |
| `AMOCRM_PURCHASES_FIELD_ID` | **новая**, необязательная: id доп. поля контакта с купленными товарами (в mock 700001) |

## Демо в mock-режиме (без amoCRM)

```bash
# терминал 1 (в .env.local: AMOCRM_MODE=mock, AMOCRM_WEBHOOK_SECRET=любая-строка)
npm run dev
# терминал 2
npx tsx scripts/amocrm-mock-webhook.ts message-add
npx tsx scripts/amocrm-mock-webhook.ts lead-status
```

Скрипт шлёт `data/amocrm-mock/webhook-*.form.txt` так же, как amoCRM
(`x-www-form-urlencoded`), печатает ответ (200 за доли секунды) и ждёт, когда в
`logs/amocrm-notes.jsonl` появится примечание. Текст примечания также выводится в консоли `next dev`.
Повторная отправка того же `message-add` пропускается как дубль, пока жив процесс сервера.
Чтобы начать заново, удалите `logs/amocrm-*.jsonl` и перезапустите сервер.

## Реальный режим (live)

1. **Пробный аккаунт.** Регистрация на amocrm.ru, триал 14 дней. TODO: проверить срок на сайте.
   Нужны права администратора.
2. **Приватная интеграция.** amoМаркет → «⋯» в правом верхнем углу → «Создать интеграцию».
   Заполнить название и описание, дать доступ к данным аккаунта, сохранить.
3. **Токен.** В интеграции вкладка «Ключи» → «Сгенерировать токен» → выбрать срок → скопировать
   в `.env.local` как `AMOCRM_ACCESS_TOKEN`. Токен показывается один раз.
4. **Поле товаров (необязательно).** Настройки → поля контакта → текстовое поле
   «Купленные товары». Его id (виден в настройках поля или в `GET /api/v4/contacts/custom_fields`)
   записать в `AMOCRM_PURCHASES_FIELD_ID`.
5. **`.env.local`:** `AMOCRM_MODE=live`, `AMOCRM_SUBDOMAIN=<поддомен>`, `AMOCRM_ACCESS_TOKEN=…`,
   `AMOCRM_WEBHOOK_SECRET=<длинная случайная строка>`.
6. **Туннель** до локального `npm run dev`:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   (или `ngrok http 3000`). Получить публичный `https://…` адрес.
7. **Вебхук.** amoМаркет → «WEB HOOKS» → URL
   `https://<туннель>/api/amocrm/webhook?secret=<AMOCRM_WEBHOOK_SECRET>`. События:
   «Получено входящее сообщение» и «Отправлено исходящее сообщение» (для истории), по желанию
   «Смена статуса сделки». Сохранить. Можно и через API: `POST /api/v4/webhooks` с
   `{"destination": "<url>", "settings": ["add_message", "add_outgoing_message", "status_lead"]}`.
8. **Чат.** Чтобы появились сообщения, подключить канал (например, Telegram-бота или виджет
   чата на сайте) в разделе «Настройки → Каналы». TODO: проверить название раздела в интерфейсе.

**Что нажать для демо:** написать клиентом в подключённый чат → открыть сделку этого чата →
через несколько секунд (сколько занимает LLM) в ленте карточки появится примечание 🤖. Второй
вариант: перетащить сделку на другой этап, тогда подсказка построится по последнему сообщению клиента.

## Безопасность и надёжность

- Секрет в query сравнивается за постоянное время (`timingSafeEqual`). Без секрета 401, если
  секрет не настроен — 503.
- Тело валидируется zod-схемой: неверный формат → 400. Неподдерживаемые события → 200, чтобы
  amoCRM не слал повторы и не отключил хук.
- Ответ отдаётся сразу, обработка идёт в `after()` из `next/server` (стабилен с Next 15.1;
  в Next 16 работает на Node-сервере и в Docker). Для serverless задан `maxDuration = 60`.
- Повторная доставка того же сообщения отсекается по `id` (в памяти процесса).
- При 429 клиент делает два повтора с паузами 1 и 3 с. Запросы внутри одного вебхука идут
  последовательно по событиям.
- Секрет в URL может попасть в логи туннеля или прокси. Для демо это приемлемо, в продакшене
  лучше подпись или IP-allowlist. TODO: проверить, подписывает ли amoCRM вебхуки аккаунта: в
  документации к этому типу вебхуков подписи не нашёл.
