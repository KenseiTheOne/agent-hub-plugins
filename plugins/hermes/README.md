# hermes — задачи cron Hermes

Официальный плагин реестра `agent-hub-plugins` (tier `official`, ставится менеджером и удаляется из него).
Standard, раз в 60 с. Вывод — только чтение.

**Показывает:** жив ли gateway (пульс `state/gateway.heartbeat`, процесс по `gateway_state.json`), тикает ли
планировщик каждого профиля (`cron/ticker_heartbeat`), ESTOP (`~/.hermes/ESTOP` и `profiles/*/ESTOP`),
задачи из `cron/jobs.json` с последним запуском из `executions.db` и расходом из `usage_audit.jsonl`.

**«Можно ли выключать» (1.2.2):** шапка несёт `activity=` для вердикта хаба «можно ли выключать компьютер» (ядро
Agent Hub с 07.11; прав не требует) — «Hermes: 1 задача в работе», пока у задачи идёт запуск (`running`/`claimed` в
`executions.db`, иначе `state: running` в `jobs.json`); задач в работе нет — пустое значение (плагин участвует, тихо). Служба молчит (`gateway-silent`, `ticker-silent-*`)
или данные не читаются (`source-broken`) — ключа нет: что идёт у Hermes, неизвестно, и в «проверено» он не попадает.

**События:**

| Ключ | Когда | Статус |
|---|---|---|
| `job-failed-<id>` | последний запуск задачи упал | error |
| `job-costly-<id>` | последний запуск потратил ≥ 2× медианы прошлых (нужно ≥ 3 прошлых) | wait |
| `gateway-silent` | gateway объявлен `running`, но пульс старше 180 с или процесса нет | error |
| `ticker-silent-<профиль>` | пульс планировщика старше 200 с (как в Hermes: 3 × 60 + 20); при ESTOP корня или этого профиля не поднимается | error |
| `estop` | весь Hermes на паузе (`~/.hermes/ESTOP`) — подсказка «`hermes resume`», кнопки паузы нет | wait |
| `estop-<профиль>` | на паузе только профиль (`profiles/<n>/ESTOP`, `hermes -p <n> pause`; так он работает в `agent/estop.py` Hermes) — подсказка «`hermes -p <n> resume`», остальные профили и кнопка паузы всего Hermes — как обычно (с 1.2.1) | wait |
| `source-broken` | незнакомая форма `jobs.json`, `gateway_state.json`, схемы `executions.db` | unknown |

**Чего не читает:** `prompt`, `origin`, `last_error`, `last_failure.detail` из `jobs.json`; текст колонки
`error` (только факт наличия); файлы ключей и токенов Hermes, `config.yaml`, `state.db`, `sessions/`.
`executions.db` открывается `sqlite3 -readonly 'file:…?immutable=1'` — без блокировок и без записи. База Hermes — в
режиме WAL, а при `immutable` файл `-wal` не читается: пока у Hermes открыто соединение, свежие запуски (и провал)
лежат только в нём. Поэтому при непустом `executions.db-wal` (с 1.2.1) база и журнал копируются во временный каталог
(`$AGENTHUB_PLUGIN_DATA_PATH` или системный tmp), копия читается обычным read-only соединением и сразу удаляется;
в каталоге Hermes не появляется ни `-shm`, ни других файлов. Сбой чтения `immutable`, пока появился `-wal` (checkpoint
во время чтения), — повтор по копии. Поломки источников выводятся на языке хаба (коды, а не готовые русские строки).
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
| `pause` (кнопка «Поставить Hermes на паузу (ESTOP)», пока ESTOP нет) | confirm | `hermes pause` | `hermes-paused` (есть `~/.hermes/ESTOP`; до 1.3.0 — `already-paused`) |

Общие отказы: `no-hermes` (нет `~/.local/bin/hermes`), `no-hermes-home` (программа есть, а папки `~/.hermes` с
задачами нет; с 1.3.0, раньше — тоже `no-hermes`), `bad-job`, `unknown-job`, `ambiguous-job` (одинаковый id в
двух профилях), `no-jobs-file`, `hermes-failed`, `timeout`. Профиль задачи плагин находит сам по `jobs.json`
(корень — без `-p`).

**Текст отказа** (с 1.3.0, контракт 2): перед `reason=<код>` плагин печатает `message=<объяснение>` на языке хаба
(`AGENTHUB_LANG`), оболочка показывает его после названия кнопки как есть — «"Пауза": Задача уже на паузе.». Своих
текстов для кодов плагинов в хабе больше нет; без `message=` оболочка написала бы только «плагин отказал (<код>)». Тексты —
`REFUSALS` в `hermes.60s.mjs`, у каждого кода ru и en (тест сверяет, что ни один код не забыт).

**Push** (`<agenthub.push>`): `job-failed`, `job-costly`, `ticker-silent`, `gateway-silent` (только macOS), `estop`.
С 1.3.0 все — `kind="plugin" was="runs"`: их гасит свой переключатель «Hermes» в «Настройках → Уведомления» (строку хаб
строит из установленного плагина: нет плагина — нет строки). `was="runs"` переносит прежний выбор: если вид «Прогоны
агентов» (контракт 1) был выключен, переключатель «Hermes» после обновления тоже выключен.

## Контракт 2 (1.3.0)

Хаб с 09.11 о Hermes ничего не знает (`docs/contract/extension-points.md`, «Версии контракта»): значок, переключатель
уведомлений и тексты отказов плагин объявляет сам.

| Объявление | Зачем |
|---|---|
| `<agenthub.contract>2</agenthub.contract>` | плагину нужен хаб с контрактом 2 (`kind="plugin"`, `message=`). Хаб версии 2 с контрактом старше покажет «Нужен хаб новее»; хаб контракта 1 тег не знает и поставит 1.3.0, потеряв правила `kind="plugin"` и тексты `message=` — публиковать после обновления хаба |
| `<agenthub.icon symbol="alarm" color="#30D158">` | значок плитки — тот же, что раньше был зашит в оболочку |
| `kind="plugin" was="runs"` у правил push | свой переключатель «Hermes» вместо общего вида «Прогоны агентов» |
| `message=` у отказов действий | объяснение отказа на языке хаба: тексты, которые раньше держала оболочка |

**Права 1.3.0** не менялись: новых прав нет, значок, контракт и вид уведомлений правами не считаются — обновление без
окна согласия.

Тесты: `test/hermes.test.mjs` (`scripts/check.sh --only hermes`), синтетический HOME из `fixtures/`.
