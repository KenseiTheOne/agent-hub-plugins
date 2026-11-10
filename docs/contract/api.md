<!-- Копия из agent-hub, контракт v3. Не править: файл пишет node scripts/sync-vendor.mjs, --check ловит расхождение. -->
> **Копия из agent-hub, контракт v3 — не править.** Источник: `docs/api.md`, разделы: «POST /actions/:id», «Подключения». Обновляет
> `node scripts/sync-vendor.mjs` (рядом с agent-hub); `node scripts/sync-vendor.mjs --check` и CI ловят расхождение.
> Пути и ссылки в тексте — от корня репозитория agent-hub. Нужна возможность, которой здесь нет, — запишите, что
> нужно, и отдайте в сессию хаба (CLAUDE.md реестра).

### `POST /actions/:id` — app, cli
`:id` — `offer.id` из `/state` (предложение плагина: аргументы берутся из предложения, `args` из тела
игнорируются) **или** имя примитива (`open.url`) с аргументами в теле. Объявленное действие плагина
(`<agenthub.action>`) вызывается только через предложение.

Тело: `{"args": {...}, "confirmToken": "…"}` (оба необязательны).

Порядок проверок ядра: цель → класс собеседника → пауза хаба (estop) → аргументы прямого вызова примитива → `verifyFacts` →
подтверждение → запуск. Аргументы проверяются **после** класса собеседника: `POST /actions/session.stop` с пустым телом
от cli получает `403 peer:cli`, а не `400 args:…` (UI-проход 05.11).

- Уровень `immediate` и не app-only — `app` и `cli`.
- Уровни `confirm`/`confirm-cost` и app-only примитивы (`session.respond|launch|stop|interrupt`, `process.*`) —
  **только `app`**; иначе `403 peer:cli`. Действия не встроенных плагинов — **всегда только `app`**, при любом уровне
  (в предложении — `"appOnly": true`): официальный (и свой) плагин без объявленной сети может объявить `immediate`
  (с 09.11 — например, переключатель режима) — тогда без окна подтверждения, но не из cli; с сетью или с ценой у действия
  (`cost=`) — не ниже `confirm-cost`.
- Подтверждение решает ядро: первый запрос без токена →
  `428 {"error":"confirm-required","needsConfirm":true,"token":"…","level":"confirm","text":"<текст ядра>","cost":null|"…","expiresInMs":120000}`.
  Приложение показывает `text`/`cost` в `NSAlert` и повторяет запрос с `confirmToken`. Токен одноразовый,
  живёт 120 с, привязан к действию с аргументами, к отпечатку действия плагина (команда, уровень, шаблон
  аргумента, версия и уровень плагина) и к pid запросившего: токен, выданный на текст одной версии, после обновления
  плагина даёт `403 confirm:invalid`.
- Успех: `200 {"ok":true|false,"result":{…только скаляры…}}`. После действия standard-плагин перезапускается,
  streamable получает `actionResult` в stdin.
- Действие плагина: текст подтверждения пишет ядро на языке хаба (`lib/i18n.mjs`) — `«<название>» (<уровень>) просит:
  «<title>» для <значение>. Выполнится: <команда>` / `"<title>" (<tier>) asks to: …`, где команда показана так, как
  запустится: значение — вместо слова `{имя}`, а без него — в конце (`my-tool.30s.mjs --action skip ABC-1`); цена — от ядра
  (`confirm-cost`: «Команда может выходить в сеть: <хосты>») и слова автора с пометкой «По словам плагина: …».
  `title`/`cost` берутся на языке хаба из `title-xx`/`cost-xx` метаданных, если есть; в отпечаток действия входят
  все варианты, поэтому смена языка не даёт `facts:action-changed`. Перед подтверждением и запуском ядро перечитывает метаданные файла плагина с диска:
  аргумент не проходит текущий шаблон — `409 facts:bad-arg`; сменились команда, уровень, шаблон, версия или уровень
  плагина (файл заменили до пересканирования, обновили, понизили) — `409 facts:action-changed`. Команда —
  argv без шелла, значение аргумента — отдельный элемент. `result`: `code`, `timedOut`, `durationMs`, `reason`
  (последняя строка stdout действия `reason=<код>` — машинная причина отказа самого плагина) и `message` (контракт 2:
  строка `message=<текст>` среди последних 5 строк stdout — объяснение для человека на языке хаба, плагин получает
  `AGENTHUB_LANG`; чистится как фразы `activity=`, до 120 графем). Оболочка показывает отказ как ««<кнопка>»: <message>»;
  без `message` — «плагин отказал (<reason>)». Своих текстов для кодов конкретных плагинов у хаба нет.

### Подключения — `GET /connections` (app, cli), `POST /connections/:id/connect|cancel|disconnect` (только app), `POST /connections/:id/mcp` (процесс плагина)
Вход хаба во внешние сервисы по OAuth 2.1 и вызовы их MCP-серверов за плагины (служба `oauth`,
`daemon/lib/services/oauth.mjs`, `lib/oauth.mjs`, `lib/mcp-client.mjs`; маршруты — `lib/routes/connections.mjs`;
решение 09.11). **Какие подключения есть, ядро не знает** (контракт 2): их объявляют сами плагины тегом
`<agenthub.connection id=… type="mcp" url="https://…" scope=… tools=… interval=… budget=… title=…>зачем</…>`
(`docs/extension-points.md`). Ядро берёт объявление только у доверенных (builtin/official/own), с id плагина или
`<id плагина>.<имя>` (весь id — с буквы, до 64), и только если хост `url` (и `hosts` сервера авторизации) входит в
`<agenthub.net>` плагина; иначе — журнал `connection-rejected {plugin, connection, why: id|net|duplicate|taken}` и
подключения нет. Перезапуск плагина (`plugin.removed` с `restart: true`) подключение не трогает: идущий вход и кэш
результатов остаются. Плагин удалён (или перестал объявлять подключение), а вход в связке остался — подключение
**осиротевшее**: в списке с `orphan: true`, только `disconnect` (`connect` — `409 oauth:orphan`, вызовы плагинам —
`409 oauth:orphan`); после перезапуска демона такие находятся по `Cache/oauth-<id>.json` (там — отметки вызовов,
id плагина и название, без токенов); «Отключить» удаляет вход, строку и этот файл (журнал `connection-orphaned`).
Вернулся плагин — снова обычное подключение с прежним входом. Удаление плагина «с данными» (`POST /registry/remove`
с `purge`, событие `plugins.removed {purge: true}`) удаляет и вход его подключений (журнал `connection-purged`). У своего плагина
подключение — право вида `connections` в окне согласия (адрес, scope, белый список; новое — рост прав). Службы нет —
`503 oauth:disabled`; неизвестный `:id` — `404`. Ниже в примерах — подключение `tix` к `https://mcp.example.com/mcp`.

**Вход** (`POST /connections/tix/connect`, тело не нужно) → `200 {authorizeUrl, expiresAt, connection}`. Страницу
`authorizeUrl` открывает оболочка (браузер по умолчанию); подтверждение — на сайте сервиса, своего окна хаб не
показывает. Ядро перед этим:
- находит сервер авторизации: запрос без токена → `401` с `WWW-Authenticate … resource_metadata=` → метаданные ресурса
  (RFC 9728; только с того же источника, что ресурс; `resource` должен совпасть) → метаданные сервера (RFC 8414;
  `issuer` должен совпасть). Без `S256` в `code_challenge_methods_supported`, без `registration_endpoint` или без
  `none` среди способов аутентификации клиента — отказ `oauth:discovery`. Все адреса — https на хостах подключения
  (хост `url` и `hosts` из объявления); в тестовом режиме — ещё двойник на 127.0.0.1/localhost. Метаданные кэшируются на час;
- регистрирует **публичного** клиента (RFC 7591: `token_endpoint_auth_method: none`, без client_secret; `grant_types` —
  пересечение `authorization_code`, `refresh_token` с объявленными сервером — бывает и только `authorization_code`;
  ответ 200 и 201 — оба успех). Регистрация хранится и при следующем входе используется снова,
  если свободен тот же порт приёмника (иначе — новая регистрация с новым адресом возврата);
- поднимает **временный приёмник** `http://127.0.0.1:<случайный порт>/oauth/callback` — единственное место, где демон
  слушает TCP: только 127.0.0.1, только `GET` этого пути, срок 5 мин (`loginTimeoutMs`), один приём: первый запрос с
  верным `state` (сравнение за постоянное время) и верным `iss` (RFC 9207: сервер его объявил — без `iss` не
  принимается) закрывает приёмник; чужой `state` — `400`, вход ждёт дальше; `error=access_denied` — вход отменён;
- PKCE `S256` (verifier — 32 случайных байта), `state` — 24 байта, `scope` — слова из объявления плагина, которые
  сервер называет у себя (например, `read`: тогда «только чтение» держит сам сервер), `resource=<адрес MCP>` (RFC 8707). Код, verifier и state — только в памяти.

Обмен кода (`code_verifier`, `resource`, `redirect_uri`, `client_id`) — до ответа браузеру: страница говорит правду
(«<название из объявления> подключён — вкладку можно закрыть» / «не получилось»; название экранируется), на языке хаба. Ошибки (`connection.error` и `error`
ответа маршрута, `oauth:<код>`): `discovery` (уточнение — `reason` ответа и `connection.errorReason`:
`resource-mismatch`, `issuer-url`, `no-s256`, `no-public-client`, …; `no-resource-metadata`/`no-as-metadata` бывают и
от сбоя сервера), `register`, `exchange`, `invalid-grant`, `denied`, `iss-mismatch`, `timeout`, `keychain`,
`keychain-read` (`503`: связка не ответила), `no-keychain` (`409`: служба secrets выключена или в тестовом режиме нет
двойника `security`), `net`, `http`. `POST …/cancel` — прервать идущий вход (состояние возвращается прежним). Повторный `connect` прерывает
прежний вход.

**Хранение.** Регистрация клиента и токены — **только в связке ключей**, через службу `secrets` (факт `secrets.store`):
служба `agent-hub.oauth`, записи `<id>.client` и `<id>.token` (id подключения; до контракта 2 те же имена — уже
сделанный вход сохраняется), значение — JSON в base64url. Токен помнит адрес ресурса, для которого выдан (`resource`):
плагин сменил `url` — прежний токен на новый адрес не уходит, подключение `disconnected` (журнал
`oauth-resource-changed`), нужен новый вход. Запись до контракта 2 адреса не помнит: при первом чтении она
закрепляется за адресом объявления (журнал `oauth-resource-pinned`), если подключение объявил встроенный или
официальный плагин; у своего (own) — не принимается (журнал `oauth-resource-unknown`, нужен новый вход): свой плагин
с тем же id мог появиться после удаления официального. Запись — через stdin
`security -i` (`lib/keychain.mjs`), не через argv. Ключи `oauth.*` плагинам не отдаются (`denyReason` → `reserved`, в
том числе плагину с id `oauth`). Ни токен, ни код, ни verifier не попадают в журнал, шину, SSE, `/state`, ответы
маршрутов и плагинам; сам токен служба читает из связки на каждый вызов. `security -i` читает строку не длиннее 4095
знаков: длиннее запись не пишется одной строкой (`writeItem` → `too-large` без вызова `security`, прежняя запись цела),
а хранилище делит значение на части `<запись>.<a|b><n>` с заголовком `parts_<поколение>_<n>_<sha256>` (заголовок —
последним, части прежнего поколения удаляются после). Сбой чтения связки (таймаут, связка заблокирована, код ≠ 44) —
не «записи нет»: при старте подключение остаётся `unknown` с ошибкой `keychain-read` и перечитывается через `reloadMs`
(60 с) или при вызове плагина, во время вызова — бэкофф `error`, без отметки отказа входа. **«Отключить»** (`POST
…/disconnect`) удаляет обе записи; не удалился токен — `500 oauth:keychain-delete`, состояние прежнее (вход остался в
связке), кнопка «Отключить» остаётся. Отзывать выданный доступ на стороне сервиса хаб не берётся (серверы MCP обычно не
объявляют `revocation_endpoint`) — оболочка подсказывает сделать это в настройках сервиса.

**Срок и отзыв.** Сервер дал refresh-токен — служба обновляет доступ сама (заранее, если до конца < 1 мин, и на `401`
от MCP; новый refresh-токен заменяет прежний — ротация; обновляет только ядро). Нет refresh-токена (сервер его не
выдал), он отозван (`invalid_grant`) или сервер ответил `401` — состояние `expired`: в оболочке «Вход истёк или
доступ отозван — подключите снова», плагину — `409 oauth:expired`, журнал `oauth-expired`. Сбой сети или `5xx` при
обновлении — не истечение: плагину `200` с `error: oauth:refresh`, бэкофф `error`, refresh-токен цел. `403` от MCP
(кроме `invalid_token`; `insufficient_scope` — входу не хватает прав) — тоже не истечение: `error: mcp:forbidden`,
`connection.error: forbidden` (`errorReason` — error из `WWW-Authenticate`), бэкофф `why: forbidden` на час.

**Вызов MCP за плагин** (`POST /connections/tix/mcp {tool, args}`, класс собеседника `cli`). Ядро узнаёт плагин
по pid собеседника на сокете (факт `pluginByPid`: идущий запуск standard или процесс streamable, не действие и не
потомок), плагин должен быть **доверенным** (builtin/official/own), **тем, кто объявил подключение**, и с хостом
сервиса в `<agenthub.net>`; инструмент — из белого списка объявления (`tools=`). Отказы: `403 mcp:not-a-plugin|
mcp:untrusted|mcp:not-owner|mcp:net-not-declared|mcp:tool-not-allowed`, `400 args:tool:required|args:args:type`, `413 too-large` (аргументы > 8 КБ), `409
oauth:not-connected|oauth:expired|oauth:unavailable` (с `connection`). Ответ `200`:
`{ok, result: <результат tools/call: content, structuredContent?> | null, fetchedAt, nextAt, why, intervalMs,
calls24h, dailyBudget, fresh, pending?, error?, errorText?}`. Результат с `isError` (не лимит) — не успешное
обновление: в память не кладётся, `lastOkAt` не сдвигается, прошлый результат остаётся, `error: mcp:tool-error` и
`errorText` — текст сервиса одной строкой до 300 знаков (до удачного вызова повторяется и в ответах из памяти), бэкофф
`why: tool-error`. Протокол — Streamable HTTP: `initialize` и
`notifications/initialized` один раз на сессию (`Mcp-Session-Id`, `MCP-Protocol-Version`), ответ JSON или SSE; сервер
забыл сессию (`404`) — одна попытка с новой.

**Частоту держит ядро, а не плагин.** Один и тот же запрос (плагин + инструмент + аргументы) — не чаще `intervalMs`
(`interval=` из объявления, по умолчанию 15 мин; ядро держит его в пределах 5 мин … 24 ч); между вызовами
плагин получает прошлый результат из памяти службы (`fresh: false`). Суточный бюджет: вызовов за 24 ч не больше
`dailyBudget − 4` (`budget=` из объявления, по умолчанию 100; пределы ядра 1…10000; тарифов сервиса ядро не знает)
(`why: budget`). Лимит сервиса — `RATE_LIMIT_EXCEEDED` в ошибке JSON-RPC или в результате
инструмента (`retryAfter` — секунды, мс или отметка эпохи; 1 мин … 24 ч), `429` с `Retry-After` — бэкофф (`why:
rate-limit`; без `retryAfter` — 15 мин → 30 мин → 1 ч → 3 ч → 6 ч); `x-ratelimit-remaining ≤ 2` — ждать
`x-ratelimit-reset` (`why: http-limit`); прочие сбои — 1 → 2 → 5 → 10 мин (`why: error`). Ответа сервиса нет за
`callWaitMs` (3 с) — `pending: true`, вызов доходит в фоне и попадает в память службы. Отметки вызовов, бэкофф и
отметка отказа входа переживают перезапуск: `<home>/Cache/oauth-<id>.json` (0600; только время — отметок не меньше
суточного бюджета, иначе бюджет выше 500 не держался бы, — id плагина и название, без токенов и содержимого). Содержимое ответов — только в памяти демона. Журнал: `mcp-call {connector, plugin, tool, ok, error?, ms}`,
`mcp-call-failed {kind, status, waitS}`, `mcp-denied`.

`/state.connections` и `GET /connections` → `[{id, title, note, plugin, orphan?, host, tools, state, since, error, errorReason, scope, expiresAt, refresh,
login: {startedAt, expiresAt} | null, intervalMs, dailyBudget, calls24h, lastOkAt, nextAt, why, keychain}]`; `state`:
`unknown` (связка ещё не прочитана), `unavailable` (нет связки), `disconnected`, `connecting`, `connected`, `expired`;
`title` и `note` — из объявления плагина на языке хаба (без `title=` — название плагина). Смена — событие
`connections.changed {connections}`; появление и пропажа — журнал `connection-added`, `connection-removed`. Журнал входа: `oauth-login-start {port, scope}`,
`oauth-client-registered {grants}`, `oauth-connected {scope, refresh, expiresInS}`, `oauth-login-failed {error}`,
`oauth-login-cancelled`, `oauth-refreshed {rotated}`, `oauth-refresh-failed`, `oauth-disconnected`; служба secrets —
`secret-store {op, account, ok}`.

Настройки (`config.json → services.oauth`): `enabled`; `<id>.intervalMs` и `<id>.dailyBudget` — поверх объявления
плагина, в тех же пределах ядра; `<id>.loginTimeoutMs` (300000), `<id>.callWaitMs` (3000), `<id>.reloadMs` (60000 —
перечитать связку, если она не ответила при старте); в тестовом режиме — `<id>.resource` и `<id>.hosts` (двойник на
127.0.0.1; в живом подмена не принимается). Доверенным плагинам служба даёт переменную `AGENTHUB_HUB_SOCKET` — путь к сокету хаба.
