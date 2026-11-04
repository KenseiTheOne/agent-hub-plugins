# hermes — задачи cron Hermes

Официальный плагин реестра `agent-hub-plugins` (tier `official`, ставится менеджером и удаляется из него).
Standard, раз в 60 с. Вывод — только чтение.

**Показывает:** жив ли gateway (пульс `state/gateway.heartbeat`, процесс по `gateway_state.json`), тикает ли
планировщик каждого профиля (`cron/ticker_heartbeat`), ESTOP (`~/.hermes/ESTOP` и `profiles/*/ESTOP`),
задачи из `cron/jobs.json` с последним запуском из `executions.db` и расходом из `usage_audit.jsonl`.

**События:**

| Ключ | Когда | Статус |
|---|---|---|
| `job-failed-<id>` | последний запуск задачи упал | error |
| `job-costly-<id>` | последний запуск потратил ≥ 2× медианы прошлых (нужно ≥ 3 прошлых) | wait |
| `gateway-silent` | gateway объявлен `running`, но пульс старше 180 с или процесса нет | error |
| `ticker-silent-<профиль>` | пульс планировщика старше 200 с (как в Hermes: 3 × 60 + 20); при ESTOP не поднимается | error |
| `estop` | Hermes на паузе | wait |
| `source-broken` | незнакомая форма `jobs.json`, `gateway_state.json`, схемы `executions.db` | unknown |

**Чего не читает:** `prompt`, `origin`, `last_error`, `last_failure.detail` из `jobs.json`; текст колонки
`error` (только факт наличия); файлы ключей и токенов Hermes, `config.yaml`, `state.db`, `sessions/`.
`executions.db` открывается `sqlite3 -readonly 'file:…?immutable=1'` — без блокировок и без записи.
Токенов в `executions.db` нет (проверено 04.11), поэтому расход берётся из `cron/usage_audit.jsonl`
(`total_tokens` за запуск); если в схеме появятся колонки `*token*`, они тоже будут учтены.

**Предлагает:** `open.file` — каталог выводов задачи `cron/output/<id>` в Finder.

**Действия** (`<agenthub.action>`; подтверждение и его текст — от ядра, только из приложения; аргумент `job`
ядро сверяет с `^[A-Za-z0-9_-]{1,64}$` и передаёт отдельным argv):

| id | Уровень | Команда | Отказ (`reason=`) |
|---|---|---|---|
| `cron-pause <job>` | confirm-cost | `hermes [-p <профиль>] cron pause <job>` | `already-paused` |
| `cron-resume <job>` | confirm-cost | `… cron resume <job>` | `not-paused` |
| `cron-run <job>` | confirm-cost | `… cron run <job>` | — |
| `pause` (кнопка «Поставить Hermes на паузу (ESTOP)», пока ESTOP нет) | confirm | `hermes pause` | `already-paused` (есть `~/.hermes/ESTOP`) |

Общие отказы: `no-hermes` (нет `~/.local/bin/hermes`), `bad-job`, `unknown-job`, `ambiguous-job` (одинаковый id в
двух профилях), `no-jobs-file`, `hermes-failed`, `timeout`. Профиль задачи плагин находит сам по `jobs.json`
(корень — без `-p`).

**Push** (`<agenthub.push>`): `job-failed`, `job-costly`, `ticker-silent`, `gateway-silent` (только macOS), `estop`.

Тесты: `test/hermes.test.mjs` (`scripts/check.sh --only hermes`), синтетический HOME из `fixtures/`.
