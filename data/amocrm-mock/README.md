# Моки amoCRM

> ⚠️ **Предположение, уточнит amocrm-integrator.** Форматы ниже собраны по памяти и не сверены с документацией amoCRM API v4.
> amoCRM шлёт вебхуки как `application/x-www-form-urlencoded` с ключами вида `leads[status][0][id]`;
> `webhook-*.json` — это тело уже после разбора в объект.

- `webhook-lead-status.form.txt` — «сырое» тело вебхука смены статуса сделки.
- `webhook-lead-status.json` — то же после разбора.
- `lead-with-history.json` — сделка с контактом и историей переписки, в формате, который ядро получает на вход
  (`deal` → то, что вернёт GET /api/v4/leads/{id}?with=contacts; `notes`/`messages` → история).
