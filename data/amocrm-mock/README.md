# Моки amoCRM

Фикстуры для `AMOCRM_MODE=mock`. Форматы сверены с официальной документацией amoCRM API v4
(https://www.amocrm.ru/developers/content/crm_platform/), что проверено и что нет, описано в
[`docs/amocrm-setup.md`](../../docs/amocrm-setup.md#что-проверено-в-документации).
Данные вымышленные: сделка 123456, контакт 555, беседа 117.

## Вебхуки (что amoCRM присылает нам)

amoCRM шлёт вебхуки как `application/x-www-form-urlencoded` с ключами вида
`message[add][0][text]=...`. Файл `*.form.txt` содержит сырое тело, `*.json` то же тело после
разбора в объект (без поля `_note`). `.form.txt` сгенерирован из `.json`.

| Файл | Событие (настройка вебхука) | Что делает сервис |
|---|---|---|
| `webhook-message-add.*` | `add_message`: входящее сообщение клиента | главный сценарий: подсказка по этому сообщению |
| `webhook-lead-status.*` | `status_lead`: смена этапа сделки | подсказка по последнему сообщению клиента из истории |

## Ответы API (что mock-клиент отдаёт вместо amoCRM)

Путь внутри `api/` повторяет путь запроса:

| Файл | Запрос в live |
|---|---|
| `api/leads/123456.json` | `GET /api/v4/leads/123456?with=contacts` |
| `api/leads/123456/notes.json` | `GET /api/v4/leads/123456/notes` |
| `api/contacts/555.json` | `GET /api/v4/contacts/555` |
| `api/talks/117.json` | `GET /api/v4/talks/117` |
| `api/pipelines/7777/statuses/35000001.json` | `GET /api/v4/leads/pipelines/7777/statuses/35000001` |

Если фикстуры нет, mock-клиент ведёт себя как 404 (для примечаний: пустой список, как 204 в live).

## История переписки

`lead-with-history.json` засевает локальное хранилище переписки (`src/lib/amocrm/messages.ts`) в
mock-режиме. Это сообщения, которые пришли бы раньше вебхуками `add_message` и
`add_outgoing_message`. REST API текст сообщений чатов не отдаёт, поэтому сервис копит их сам.

## Соглашения для демо (не стандарт amoCRM)

- Купленные товары лежат в доп. поле контакта `700001` «Купленные товары», значения — id из
  `data/kb/products.json`. В live id поля задаётся через `AMOCRM_PURCHASES_FIELD_ID`.
- Покупка в `api/contacts/555.json` — `set-detox` (набор «Детокс») из `data/kb/products.json`. Неизвестные id отфильтровываются.
