<!-- Копия из agent-hub, контракт v2. Не править: файл пишет node scripts/sync-vendor.mjs, --check ловит расхождение. -->
> **Копия из agent-hub, контракт v2 — не править.** Источник: `docs/extension-points.md` целиком. Обновляет
> `node scripts/sync-vendor.mjs` (рядом с agent-hub); `node scripts/sync-vendor.mjs --check` и CI ловят расхождение.
> Пути и ссылки в тексте — от корня репозитория agent-hub. Нужна возможность, которой здесь нет, — запишите, что
> нужно, и отдайте в сессию хаба (CLAUDE.md реестра).

# Точки расширения демона

Это **контракт** для всех, кто дописывает Agent Hub (примитивы этапа 5, ответы сессиям этапа 6, push этапа 4,
мост, реестр плагинов этапа 8, встроенные плагины). Ядро (`daemon/lib/core.mjs`, `server.mjs`, `peer.mjs`,
`runner.mjs`, `output.mjs`, `meta.mjs`, `ctx.mjs`) правит только его владелец; всё остальное добавляется
**новыми файлами** в каталоги ниже. Нужна правка ядра — опишите её в отчёте, не правьте сами.

| Что | Куда | Подхватывается |
|---|---|---|
| Примитив ядра | `daemon/lib/primitives/<имя>.mjs` | при старте демона |
| HTTP-маршрут | `daemon/lib/routes/<имя>.mjs` | при старте демона |
| Фоновая служба | `daemon/lib/services/<имя>.mjs` | при старте демона, **до** плагинов |
| Встроенный плагин | `plugins/<id>.<interval>.<ext>` или `plugins/<id>/<id>.<interval>.<ext>` | на лету (каталог отслеживается) |
| Установленный плагин | `<AGENTHUB_HOME>/Plugins/<id>/…` | на лету |
| Локальный плагин (разработка) | `<AGENTHUB_HOME>/Plugins/local/…` | на лету |
| Свой плагин (09.11) | папка в репозитории своего инструмента `agenthub/<id>/` → копия в `<AGENTHUB_HOME>/Plugins/<id>/` | заявка `agenthub plugins install --from <папка>` или «Добавить из папки…», ставит человек в приложении; дальше хаб сам следит за папкой (`docs/plugins-registry.md`, «Свои источники») |

Файлы, чьё имя начинается с `_` или `.`, не загружаются (образцы: `routes/_example.mjs`, `services/_example.mjs`).
Модули грузятся по алфавиту имени файла. Ошибка загрузки модуля не роняет демон — пишется `load-error` в журнал.

## Каталог состояния и тестовый режим

- По умолчанию `~/Library/Application Support/AgentHub/`: `hub.sock`, `journal.jsonl`, `config.json`, `ESTOP`,
  `Plugins/`, `plugins.lock` (этап 8), `Registry/` (каталог реестра, карантин), `PluginData/<id>/`, `Cache/<id>/`,
  `Cache/usage.json` (квота подписки Claude от службы `usage`, 0600; формат — `docs/api.md`),
  `logs/`, `push-state.json` (служба push), `launch/` (0700, промпты `session.launch`; брошенные старше 10 мин
  удаляет служба actions).
- `AGENTHUB_HOME=<каталог>` — всё то же во временном каталоге (тесты, ручные проверки). Путь сокета ≤ 103 байт:
  берите короткий `mktemp -d /tmp/ah-XXXX`.
- Встроенные плагины живого демона — **копия** `<home>/Builtin` (0700/0600, исполняемые — 0700; опись
  `.agenthub-builtin.json`): её кладёт `agenthub install --apply` (полная установка с launchd) и обновляет
  `agenthub builtin update`, а `config.json` получает `builtinPluginsDir: "<home>/Builtin"`. Правка в `<repo>/plugins`
  в работающий хаб не попадает, пока не обновить копию (`agenthub builtin` — совпадает ли она с репой и работает
  ли на ней демон, по `/state.hub.builtinDir`). Без установки и в тестовом режиме (`AGENTHUB_HOME`) — как раньше,
  из `<repo>/plugins`; `agenthub install --apply` с launchd из окружения с `AGENTHUB_HOME` на другой каталог
  отказывает (LaunchAgent поднимает живой хаб, копия ушла бы не туда).
- Прочие переменные для тестов: `AGENTHUB_BUILTIN_PLUGINS` (вместо `<repo>/plugins` и копии), `AGENTHUB_CLAUDE_HOME`
  (вместо `~/.claude`), `AGENTHUB_SERVICES=none|a,b` (какие службы стартуют), `AGENTHUB_TEST_EXEC_LOG=<файл>`
  (`ctx.exec` не запускает программы, а пишет `{file,args}` строкой JSON в файл и возвращает `code: 0`),
  `AGENTHUB_PLUGIN_HOME` (HOME плагинов — синтетический `~`; действует только вместе с `AGENTHUB_HOME`).
- `config.json` сливается поверх значений по умолчанию (`daemon/lib/config.mjs`, `DEFAULTS`). Ключи:
  `requirements.app`, `requirements.claudeCode`, `peer.*`, `claudeHome`, `builtinPluginsDir`, `plugins.*`,
  `journal.maxBytes`, `services.<имя>.enabled` (false — служба не стартует) и любые `services.<имя>.*` для самой службы.

## Контекст расширения (`ctx`, `daemon/lib/ctx.mjs`)

Одинаковый для примитивов, маршрутов и служб. Объект заморожен.

| Поле | Что |
|---|---|
| `name` | имя расширения: `primitive:<имя>`, `route:<файл>`, `service:<имя>` |
| `config`, `paths` | конфигурация демона и пути каталога состояния (только чтение) |
| `journal.write(entry)` | запись в `journal.jsonl`; добавляется `source: ctx.name`. **Только метаданные**: значения — скаляры (строка ≤ 200), массивы скаляров ≤ 20; объекты выбрасываются; ключи `tool_input`, `prompt`, `text`, `body`, `content`, `token`, `secret`, `password`, `transcript`, `stdout`, `stderr`, `env`, `message`, `input`, `output`, `answer`, `updatedInput`, … заменяются на `[скрыто]`. Не пишите туда текст переписки даже под другим ключом. |
| `journal.tail(n)` | последние n записей |
| `state.snapshot()` | то же, что `GET /state` |
| `state.plugin(id)`, `state.plugins()`, `state.worstStatus()` | копии состояния плагинов |
| `state.pluginEvent(id, key)` | лёгкие сведения для текста события: `{id, title, trusted, error, itemTitle, pushRules}` (без копии всего состояния; `null` — плагина нет) |
| `state.pluginSignals()` | для вердикта «можно ли выключать» (служба idle): `[{id, title, tier, trusted, status, type, intervalMs, lastRunAt, signalsAt, activity, needsOn}]` — без копии кадров; `activity`/`needsOn` — `null` (плагин не сообщает), `[]` (сообщает, что тихо) или фразы; `lastRunAt` и `signalsAt` (когда фразы пришли в последний раз) — мс эпохи; `intervalMs` — интервал по расписанию (`null` у cron и streamable) |
| `peer.verifySigned(pid, requirementName)` | `Promise<{ok, pid, path?, startSec?, reason?}>` — `codesign --verify --strict -R=<config.requirements[requirementName]>` по исполняемому файлу процесса; кэш по (pid, время старта, путь) и по файлу. `reason`: `no-requirement`, `bad-pid`, `no-process`, `foreign-uid`, `no-path`, `no-file`, `signature` |
| `peer.classifyPid(pid)` | класс процесса так, как его определил бы сервер |
| `peer.verifyHookSession(peerInfo, sessionId)` | `{ok}` или `{ok:false, reason:"peer:session-mismatch"\|"peer:no-session-file"\|"peer:not-hook"}` |
| `facts` | факты ядра для сверки аргументов (ниже) |
| `sessions` | реестр сессий (ниже) |
| `emit(event)` | событие в шину: `{type, ...}`; `type` — `[\w.:-]{1,64}`, для своих событий — с префиксом расширения (`push.sent`, `bridge.connected`). Добавляются `id`, `ts`, `source`. Уходит подписчикам `ctx.on` и в SSE `GET /events`. Только метаданные. |
| `on(type, fn)`, `off(type, fn)` | подписка на шину; `type = "event"` — все события. Внутреннее событие ядра `app.peer` (`{connected, pid, startSec, path, alive?, count}` — соединение класса app открылось или закрылось; `alive` — жив ли процесс, `count` — сколько соединений app осталось) идёт только подписчикам `on("app.peer")`, в SSE и в `on("event")` — нет |
| `estop()` | `true`, если хаб на паузе (есть файл `ESTOP`; в интерфейсе — «Пауза хаба») |
| `lang()`, `t(key, params)` | действующий язык хаба (`ru` \| `en`, настройка — `<home>/settings.json`, `docs/api.md`) и сообщение ядра на нём (`daemon/lib/i18n.mjs`) |
| `settings.get(key)` | настройка оболочки из `<home>/settings.json`, только чтение: `lang`, `checkPluginUpdates` (служба plugins — фоновая проверка обновлений), `checkHubUpdates` (служба hub-update), `launchAtLogin` (служба app — «Запускать при входе»). Пишет только app (`PUT /settings/*`); смена — событие `settings.changed` с этим ключом |
| `exec(file, args, {timeoutMs, cwd, env})` | `Promise<{code, stdout, stderr, timedOut?}>` через `execFile` (без shell); в тестовом режиме — запись в `AGENTHUB_TEST_EXEC_LOG` |
| `sendToPlugin(pluginId, obj)` | NDJSON в stdin streamable-плагина (`{"type":"inbound",...}` от хука и т.п.); `false`, если не streamable/не запущен |
| `refreshPlugin(pluginId, reason)` | перезапуск standard / `{"type":"refresh"}` streamable |
| `rescanPlugins()` | пересканировать каталоги плагинов сейчас и пересмотреть политику уже запущенных (после установки, удаления, blocklist). Хост и сам пересканирует раз в `plugins.rescanIntervalMs` (60 с): fs.watch теряет события |
| `onHook(handler)` | регистрирует обработчик `POST /hook` (этап 6): `handler(body, {peer, signal})`, `signal` — `AbortSignal` обрыва соединения хука; возвращает функцию снятия. Обработчики зовутся по порядку; первый, вернувший не `undefined`/`null`, задаёт ответ хуку. Нет обработчика, ESTOP или ошибка → `{}`; на паузе хаба обработчики зовутся только для `SessionStart`, `SessionEnd`, `Stop` (ответ — `{}`) |
| `providePluginEnv(name, value)` | служба даёт **доверенным** плагинам (`builtin` и `official` — по политике ядра, не по метаданным) переменную окружения: `AGENTHUB_<ИМЯ>` (не `AGENTHUB_SECRET_*` и не занятые ядром: `AGENTHUB_PLUGIN_ID`, `…_DATA_PATH`, `…_CACHE_PATH`, `AGENTHUB_REFRESH_REASON`, `AGENTHUB_LANG`); `value: null` — снять. Значение — не секрет (путь к своему кэшу и т.п.). Уже запущенные плагины увидят её со следующего запуска; службы стартуют до плагинов. Сейчас: `AGENTHUB_USAGE_FILE` (служба `usage`), `AGENTHUB_HUB_SOCKET` (служба `oauth`: путь к сокету хаба — так плагин зовёт `POST /connections/:id/mcp`) |
| `registerSecretsProvider(fn)` | `fn(pluginId, key, plugin) → Promise<string|undefined>`; ядро зовёт его для каждого `<agenthub.secrets>` плагина и кладёт значение в окружение как `AGENTHUB_SECRET_<KEY>` (`example.token` → `AGENTHUB_SECRET_EXAMPLE_TOKEN`). Один провайдер на демон; сейчас его ставит служба `secrets` (связка ключей, `agent-hub.<служба>` / `<запись>`; встроенным — любые ключи кроме `telegram.*` и `oauth.*`, установленным — только `<id>.*` (и не `oauth.*`, даже у плагина с id `oauth`), `Plugins/local` — ничего; в тестовом режиме связка не читается). Та же служба даёт другим службам факт `secrets.store` — `get/set/delete` записей `agent-hub.oauth` / `<подключение>.client|token` (JSON; запись через stdin `security -i`, не argv): так служба `oauth` хранит регистрацию клиента и токены |
| `setPluginPolicy(fn)` | этап 8: `fn(plugin, defaults) → {allowed, reason?, effects?, tier?}`; `tier: "official"` уважается только у `installed` (служба plugins даёт его, только если проверенный каталог сейчас называет id official, sha256 из `plugins.lock` подписан как официальный — текущим каталогом или сохранённым прежним индексом `Registry/attest/<id>` (вышедшая новая версия не понижает установленную до обновления), а файлы — с сохранённым архивом `Registry/archives/<id>.tar.gz`); ядро всё равно режет effects не встроенных до потолка и запрещает `<agenthub.action>` всем, кроме `builtin` и `official`. Политики нет (служба plugins выключена, не в `AGENTHUB_SERVICES` или упала на старте) — установленные (`Plugins/<id>`) не допускаются (`policy:no-manager` в журнале); встроенные и локальные работают как обычно |
| `invoke({id, args, confirmToken, peer})` | вызвать действие так же, как `POST /actions/:id`. `peer` передаётся как есть — передавайте только настоящий `peer` из обработчика маршрута |

### `facts`

| Метод | Что |
|---|---|
| `estop()` | хаб на паузе (estop) |
| `lang()` | действующий язык хаба: `ru` \| `en` |
| `plugin(id)` | внутреннее состояние плагина или `null` |
| `offer(id)` | предложение плагина (`{id, pluginId, kind, primitive?, args?, action?, level, label}`) |
| `session(sessionId)`, `sessionByPid(pid)`, `sessions()` | записи реестра сессий (только проверенные подписью) |
| `appConnections()` | живые соединения класса `app`: `[{pid, startSec, path}]` (служба app — надзор за приложением) |
| `stopping()` | `true`, если демон останавливается (`POST /shutdown`, SIGTERM): закрытие соединений — не падение |
| `runningActions()` | действия плагинов, которые выполняются сейчас (`POST /actions/:id` → команда действия): `[{action, plugin, title, since}]`; начало — событие `action.started {action, plugin, actionId}`, конец — `action`. Служба idle показывает их строкой «<плагин>: выполняется «…»» |
| `provide(name, fn)` | расширение добавляет свой факт (`"bridge.online"`, `"bridge.surfaces"`, `"hook.pending"` — ждущие карточки `[{requestId, sessionId, kind, tool, subagent}]`, `"plugins.busy"` — идущие установки плагинов, `"idle.state"` — вердикт «можно ли выключать», `"secrets.store"` — хранилище подключений в связке (служба secrets), `"oauth.connections"` — состояние подключений без токенов, `"oauth.api"` — служба oauth для своих маршрутов…). Имя — один раз на демон |
| `get(name, ...args)` | значение факта (`undefined`, если такого нет) |
| `pluginByPid(pid)` | чей это процесс: идущий запуск standard или процесс streamable плагина (не действие, не потомок) → `{id, source, tier, trusted, net}` или `null`. Для маршрутов, которые обслуживают сами плагины: pid собеседника на сокете — из ядра (`peer.pid`), не из запроса (`POST /connections/:id/mcp`) |

### `sessions` — реестр сессий Claude Code

Сессией считается **только процесс, чей исполняемый файл проходит `requirements.claudeCode`**
(`com.anthropic.claude-code`, Team ID `Q6L2SF6YDW`). Шим cmux и подброшенный `~/.claude/sessions/<pid>.json`
с чужим pid проверку не проходят.

- `register(sessionId, {pid, source, status?, waitingFor?, name?, interactive?, surfaceId?, workspaceId?})` →
  `Promise<{verified, reason?}>`. `source` — откуда сведения (`plugin:<id>`, `hook`). Не прошедшая проверку
  сессия в реестр не попадает.
- `unregister(sessionId, source)` — снять источник; запись удаляется, когда источников не осталось.
- `get(id)`, `list()`, `waitingCount()` (сессии со `status: "waiting"`).
- Изменение реестра → событие `sessions` в шине.
- `interactive: true` выставляет этап 6 по `SessionStart` от хука; только такие сессии могут получать `allow`.

Плагину достаточно указать в строке вывода `session=<sessionId> pid=<pid>` — ядро само проверит подпись
(см. «Контракт плагина»). В реестр (статус, вкладка, имя сессии) такие строки пишут только доверенные плагины —
builtin, official и own; у community и local ядро лишь помечает `verified` в их собственном кадре.

## Примитив (`daemon/lib/primitives/<имя>.mjs`)

Образцы: `open.url.mjs`, `open.file.mjs`.

```js
export const name = "session.stop";          // [a-z][\w]*(\.[a-zA-Z][\w]*)+ ; уникально
export const level = "confirm";              // "immediate" | "confirm" | "confirm-cost"
export const remoteAllowed = false;          // флаг для будущих удалённых каналов (сейчас только виден в /state)
export const appOnly = true;                 // необязательно: принимать только от app
export const safeUnderEstop = false;         // необязательно: true — работает и на паузе хаба (только безвредное)
export const argsSchema = {                  // лишние аргументы → 400 args:<имя>:unknown
  sessionId: { type: "string", required: true, positional: true, pattern: "^[0-9a-fA-F-]{36}$" },
  // type: "string"|"integer"|"number"|"boolean"; required, positional, pattern, maxLength, min, max, enum, default
};
// третий аргумент: { peer, plugin (id предложившего плагина или null), config }; может быть async
export function verifyFacts(args, facts, { peer, plugin }) {
  return facts.session(args.sessionId) ? { ok: true } : { ok: false, reason: "unknown-session" };  // → 409 facts:<reason>
}
// текст подтверждения пишет ядро (этот код — часть ядра), не плагин; lang — действующий язык хаба (ru | en),
// строки — через таблицу lib/i18n.mjs: t(lang, "prim.<имя>", {…})
export function describe(args, facts, lang = "ru") {
  const s = facts.session(args.sessionId);
  return { text: t(lang, "prim.session.stop", { who: s?.name, sessionId: args.sessionId }), cost: null };   // cost — «цена» для confirm-cost
}
export async function run(args, ctx) {       // ctx + ctx.requester (peer) + ctx.plugin (id предложившего плагина или null)
  const s = ctx.facts.session(args.sessionId); // pid — из реестра ядра, не из аргументов
  const r = await ctx.exec("/bin/kill", ["-TERM", String(s.pid)]);
  return { ok: r.code === 0, code: r.code }; // в ответ и журнал попадают только скаляры
}
```

Правила, которые ядро навязывает **независимо от модуля**:

- `session.respond|launch|stop|interrupt`, `process.*` — только от `app` (`appOnly` выставляется принудительно,
  `safeUnderEstop` для них игнорируется).
- Примитивы — только общее и про Claude Code. Управление внешними агентами в ядро не добавляется: это объявленные
  действия их плагинов (ниже, «Действия плагина»).
- Уровень не `immediate` — только от `app` и только с подтверждением (см. `docs/api.md`, 428).
- На паузе хаба (estop) работают лишь примитивы с `safeUnderEstop: true` (сейчас `open.url`, `open.file`); остальное — 423.
- Сторонний плагин может предложить только `open.*` и `cmux.focus` (`Plugins/local` — только `open.*`),
  что бы ни стояло в его `<agenthub.effects>`.
- `verifyFacts` зовётся перед каждым запуском — и для предложений плагинов, и для прямых вызовов из приложения.

## Маршрут (`daemon/lib/routes/<имя>.mjs`)

```js
export const routes = [
  {
    method: "POST",                 // GET | POST | PUT | DELETE
    path: "/bridge/next/:id",       // параметры — :имя
    peers: ["bridge"],              // кому доступен: подмножество app | cli | hook | bridge
    maxBody: 64 * 1024,             // необязательно
    raw: false,                     // true — обработчик сам пишет в res (поток); тело не читается
    handler: async ({ req, res, params, query, body, peer, ctx }) => ({ status: 200, body: { ok: true } }),
  },
];
```

- Встроенные маршруты (`docs/api.md`) перекрыть нельзя; повтор `method path` — `load-error`, маршрут пропущен.
- Класс собеседника проверяется до вызова обработчика; чужой класс → `403 {"error":"peer:<класс>"}`.
- `body` — разобранный JSON (или `undefined`); не JSON → 400. Вернули `undefined` → 204.
- `peer`: `{class, pid, path, startSec, reason?, claudePid?}`.

## Служба (`daemon/lib/services/<имя>.mjs`)

```js
export const name = "push";                  // иначе имя файла
export async function start(ctx) { ... }     // подписки ctx.on, таймеры (.unref()), ctx.facts.provide, ctx.onHook
export async function stop(ctx) { ... }      // снять подписки и таймеры; ctx — тот же, что у start
```

- Стартуют **до** плагинов (политика и секреты действуют с первого скана), по алфавиту; ошибка `start` →
  `service-error` в журнале, демон работает дальше. `stop(ctx)` получает тот же ctx, что `start`: в одном
  процессе (тесты) бывает несколько ядер, и останавливать надо только своё.
- `config.services.<name>.enabled = false` или `AGENTHUB_SERVICES` без этого имени — не стартует.
- Сеть, Telegram, Keychain — только в своих службах, только по команде пользователя и с тестами на двойниках.
- Службы сейчас: `app` (надзор за приложением: перезапуск упавшего закреплённого AgentHub.app по пути сборки и
  запуск при старте демона, лимит 3 за 10 мин, `services.app.supervise: false` — выключить; в тестовом режиме
  настоящее приложение не запускается — только двойник `services.app.test.launch`, таблица процессов —
  `services.app.test.processes`; `docs/api.md`, раздел «Надзор за приложением»), `actions` (мост cmux, `bridge.online`/`bridge.channel`, состояние моста — в `/state.bridge`),
  `hook`, `oauth` (подключения к внешним сервисам по OAuth 2.1 и вызовы их MCP за доверенные плагины — какие именно,
  объявляют сами плагины тегом `<agenthub.connection>`, ниже; `docs/api.md` «Подключения»; сеть — только хосты
  объявленного подключения и временный приёмник кода на 127.0.0.1; токены — только в связке через `secrets.store`; в
  тестовом режиме — двойники `services.oauth.<id>.resource` на 127.0.0.1 и `services.secrets.securityPath`), `plugins` (реестр), `push`, `secrets`, `usage` (квота подписки Claude → `Cache/usage.json`, переменная
  `AGENTHUB_USAGE_FILE` доверенным плагинам; сеть — только `api.anthropic.com`; токен Claude Code не покидает службу:
  ни на диск, ни в журнал, ни в шину, ни плагинам; истёкший не обновляется. В тестовом режиме — только двойники:
  `services.usage.securityPath`, `services.usage.credentialsFile`, `services.usage.url` на 127.0.0.1/localhost;
  `services.usage.live: true` — настоящие связка и хост и в тестовом каталоге, для живой проверки).

## Контракт плагина (то, что ядро понимает)

Формат по образцу SwiftBar, подробно — раздел 2 дизайна. Здесь — что именно реализовано.

**Имя файла:** `{id}.{interval}.{ext}` (интервал `\d+(ms|s|m|h|d)`, минимум 1 с), `{id}.{ext}` (без интервала —
запуск при старте, по `refresh`/`watch`, либо по `<agenthub.schedule>`), или папка `{id}/` с таким файлом.
Игнорируются `.md .txt .json .lock .log`, имена с `_`/`.`. Запуск: `.mjs/.js/.cjs` — текущим node,
`.py` — `/usr/bin/python3`, `.sh/.bash/.zsh` — соответствующим shell, остальное — по биту x.

**Метаданные** — теги `<agenthub.X>…</agenthub.X>` в первых 64 КБ файла (у бинарника — xattr
`com.kensei.agenthub.meta`, текст или base64): `title`, `version`, `desc`, `author.*`, `type`
(`standard|streamable`), `schedule` (cron, 5 полей), `platforms` (`macos,windows`), повторяемые `watch`, `fsRead`,
`fsWrite`, `exec`, `secrets`, `net` (запись «что — зачем»), `effects` (через запятую, `open.*` допустимо),
`<agenthub.action id="…" level="immediate|confirm|confirm-cost" title="…" cost="…" arg="имя:^шаблон$">команда</agenthub.action>`
(без `level` — `confirm`), `<agenthub.push key="…" …>Ярлык</agenthub.push>` (правила push, `daemon/lib/push/README.md`),
`<agenthub.requires name="Tool" url="https://…" check="~/.tool">зачем</agenthub.requires>` (09.11, до 8) — зависимость:
внешняя программа, без которой плагин бесполезен. Это не право: ядро только проверяет, есть ли путь `check` (`~/…` —
от HOME плагинов), и каталог менеджера показывает «Нужен Tool» ссылкой на `url` (только `https://`); нет пути —
«Установить» приглушена с подсказкой, поставить всё равно можно. Перевод — тот же тег с `lang="en"` и тем же `name`
(текст — пояснение, `title=` — название). `check` без масок и «..», запретные места — ошибка линтера. Название
программы объявляет плагин: ядро и оболочка о конкретных программах не знают.
`<agenthub.status value="ok|wait|block|error|unknown" label="Короткий ярлык">пояснение</agenthub.status>` — свой
ярлык статуса: оболочка показывает его на плитке и в карточке, пояснение — подсказкой; без тега — общая таблица
(«Всё в порядке», «Нужно внимание», «Мешает работе», «Сбой», «Нет данных»). Пишите однозначно для своего
плагина: у квоты `wait` — «Квота на исходе», у сессий — «Сессия ждёт вас».

**Контракт 2 (09.11): что плагин объявляет о себе сам.** Хаб (демон, оболочка, CLI) не знает ни одного конкретного
плагина: ни названий, ни значков, ни видов уведомлений, ни текстов ошибок. Всё плагинное — из этих тегов и вывода.

- `<agenthub.contract>2</agenthub.contract>` — минимальная версия контракта, которую плагин требует от хаба (целое ≥ 1;
  нет тега — 1). Хаб с контрактом старше отказывает в установке и обновлении понятным «нужен хаб новее»
  (`registry:hub-too-old` / `own:hub-too-old` с `need` и `have`; каталог помечает запись `needsHub`), а не ошибкой
  линтера. Объявляйте 2, если пользуетесь чем-то из этого списка. Ядро отдаёт свою версию в `/state.contract`,
  `/health.contract` и `agenthub version`.
- `<agenthub.icon symbol="star" color="#FF9F0A"></agenthub.icon>` — значок плитки: `symbol` — имя SF Symbol
  (`^[a-z0-9]+(\.[a-z0-9]+){0,7}$`, до 64 знаков), `color` — `#RRGGBB` (необязателен; низ градиента оболочка
  затемняет сама). Неверный тег — предупреждение разбора (у своего плагина это ошибка проверки папки), значка нет;
  без тега — нейтральный значок (`puzzlepiece.extension`, серый). Значок — в `/state.plugins[].icon`, в записи
  индекса (`icon`), в заявке своего плагина и в окне согласия.
- `<agenthub.connection id="tix.tasks" type="mcp" url="https://mcp.example.com/mcp" scope="read" title="Tix"
  tools="get_user,filter_tasks" interval="15m" budget="100" hosts="auth.example.com">зачем</agenthub.connection>` —
  подключение к внешнему сервису, вход в который ведёт хаб (служба `oauth`, `docs/api.md` «Подключения»): `id` —
  id плагина (по умолчанию) или `<id плагина>.<имя>` (имя — `a-z`, `0-9`, `-`, с буквы, до 32; весь id — с буквы и до
  64 знаков, иначе отказ: это же имя записи в связке). Точки в id плагина не бывает, поэтому подключение всегда
  принадлежит одному плагину: `foo` не может объявить подключение плагина `foo-bar` (до 10.11 было `<id>-…` — так
  можно было); `type` — только `mcp`; `url` — https на имени хоста (IP-адрес — нет) без порта и учётных данных;
  `hosts` — ещё хосты сервера авторизации; **хост `url` и все `hosts` обязаны быть в `<agenthub.net>` плагина**
  (линтер — ошибка, ядро — отказ `connection-rejected`); `scope` — что просить при входе (слова через пробел);
  `tools` — белый список инструментов MCP (1–32), других плагин не вызовет; `interval` — не чаще одного одинакового
  вызова (ядро держит 5 мин … 24 ч, по умолчанию 15 мин); `budget` — вызовов за скользящие сутки (1…10000, по
  умолчанию 100); `title` — название сервиса в оболочке (по умолчанию — название плагина). Текст тега — «зачем» для
  окна согласия и «Настроек». Перевод — тот же тег с `lang="en"` и тем же `id` (`title=` и текст). До 4 подключений.
  Только у `builtin`, `official`, `own` (у стороннего плагина линтер реестра считает тег ошибкой — право в окне
  согласия обещало бы то, чего ядро не сделает); в правах — вид `connections` (адрес, scope, белый список; новое —
  рост прав). Вызов — `POST /connections/<id>/mcp` через `AGENTHUB_HUB_SOCKET`, только процессом этого плагина.
  Записи связки — `agent-hub.oauth` / `<id>.client|token`; вход помнит адрес (`url`), для которого выдан: сменили
  адрес — нужен новый вход. Вход, сделанный до контракта 2 (без адреса), закрепляется за адресом при первом чтении,
  если подключение объявил встроенный или официальный плагин; своему (own) он не достаётся. «Только чтение» оболочка
  из `scope` не выводит: что можно вызвать — это `tools`, его и показывает. Плагин удалён, а вход остался —
  подключение «осиротевшее» (`orphan: true`, только «Отключить»); удаление «с данными» удаляет и вход.
- `<agenthub.push … kind="plugin" was="runs|night">` — свой переключатель уведомлений плагина (ниже, «Ключи `event=`»).
- `message=<текст>` в выводе действия — объяснение отказа (ниже, «Действия плагина»).

**Язык (UI-проход 05.11).** Ядро передаёт плагину `AGENTHUB_LANG=ru|en` (действующий язык хаба; `LANG` остаётся
`en_US.UTF-8`) и при смене языка перезапускает streamable и вне очереди запускает интервальные. Плагин без
перевода показывается как есть. Переводы метаданных: повтор тега с `lang="xx"` — `<agenthub.title lang="en">Quota</agenthub.title>`,
`desc`, `status` (с `value` и `label`), `push` (тот же `key`, ярлык — содержимым; правило без `lang` должно идти
раньше), записи прав `fsRead`/`exec`/… (`<agenthub.fsRead lang="en">~/x — why in English</agenthub.fsRead>` — только
пояснение, права не добавляет; окно прав установки показывает его на языке хаба — из самого архива, запасной — из
`i18n.<lang>.why` индекса; у слежения `watch` «зачем» отделяется от пути только для показа); у действия — атрибуты
`title-xx`, `cost-xx`. Смены языка подряд идут цепочкой: у streamable всегда живёт один процесс; плагин, не
запущенный при старте (`not-executable`), при смене языка не запускается. Тег без `lang` — язык плагина по
умолчанию. Отпечаток действия включает все варианты `title`/`cost`, поэтому смена языка не ломает подтверждение.
`build-index.mjs` реестра переносит переводы названия и описания в `index.json` (`i18n: {en: {title, desc}}`).
Право `watch` в записи `index.json` хранится в прежнем виде — вся строка метаданных с « — зачем», `why: null`
(`indexPermissions` в `lib/registry/perms.mjs`): ядро до 05.11 сверяет права архива с записью по всей строке, новое
разбирает её на путь и пояснение — один индекс ставится обоими.
Форматы чисел и дат плагин делает сам: RU «1,2 млн», «05.11 11:00», «пн»; EN «1.2M», «Nov 5, 11:00», «Mon».

**Уровень плагина (`tier`)** — `own` (09.11: свой плагин из локальной папки, установку которого человек подтвердил в
закреплённом приложении; копия в `Plugins/<id>`, запись `plugins.lock` с `tier: "own"` и `own.path` — делает её только
менеджер после окна согласия; официальным не становится, архива и свидетельства реестра у него нет), `builtin` (каталог приложения: claude-sessions, agents, quota), `official` /
`community` (установлен менеджером; что именно — по подписанному каталогу в момент проверки: official, только пока
индекс называет id official с тем же sha256 архива, что в `plugins.lock`, и файлы на диске — ровно этот архив; запись
lock сама по себе уровня не даёт), `local` (`Plugins/local`). Метаданные плагина на уровень не влияют (тег `<agenthub.tier>` —
просто неизвестный тег). `trusted` = `builtin`, `official` или `own` (`trustedPlugin` в `core.mjs`): только им ядро даёт
`<agenthub.action>` (у `own` — как у официального: без сети и без цены — объявленный уровень, в том числе `immediate`),
правила push, переменные служб (`AGENTHUB_USAGE_FILE`, `AGENTHUB_HUB_SOCKET`, `$ПЕРЕМЕННАЯ` в `<agenthub.watch>`), запись в
реестр сессий и вызовы MCP через хаб.

**Действия плагина.** Только у `builtin`, `official` и `own`. У не встроенных — только из приложения (класс `app`, при
любом уровне: `offer.appOnly`), с объявленной сетью или с ценой у действия (`cost=`, `cost-<язык>=`) — не ниже
`confirm-cost`; официальному без сети ядро оставляет объявленный уровень, в том числе `immediate` — без окна
подтверждения (решение 09.11: например, переключатель режима; линтер помечает каждое такое действие для
ревьюера реестра — `docs/plugins-registry.md`); иначе — подтверждение, текст которого пишет ядро. Запуск любого уровня — в журнале (`type=action`).
Смена уровня — смена права (`actions: <id> [<уровень>] <команда>`): понижение в обновлении — рост прав, окно согласия. Команда
разбирается в argv **без shell** (кавычки, `\`, `~/`); первое слово — имя главного файла плагина
(`my-tool.30s.mjs --action stop`) — запускается тем же интерпретатором, что и плагин. cwd — каталог плагина,
окружение — как у плагина, таймаут 30 с.

**Параметризованное действие:** `arg="taskId:^[A-Za-z0-9_-]{1,64}$"` (имя `[A-Za-z][A-Za-z0-9_]{0,31}`, шаблон с
`^` и `$`, до 200 символов; иначе действие отброшено с предупреждением). В выводе — `action=<id> arg=<значение>`.
Ядро принимает предложение, только если значение проходит шаблон (обёрнутый в `^(?:…)$`), не пустое, до 256
символов, без управляющих и форматирующих символов Unicode (`\p{Cc}`, `\p{Cf}`: C0/C1, bidi-переопределения,
нулевая ширина) и U+2028/2029, не начинается с `-`; иначе предложения нет и предупреждение в журнал. Перед
подтверждением и запуском ядро перечитывает метаданные файла с диска: значение — против текущего шаблона
(`409 facts:bad-arg`), команда/уровень/шаблон/версия — против того, что было в предложении
(`409 facts:action-changed`); токен подтверждения привязан к этому отпечатку. Значение передаётся **отдельным
элементом argv** вместо слова `{taskId}` (или в конец).
Аргумент из тела `POST /actions/:id` не принимается. Факты своего мира (держатель замка, есть ли задача) действие
проверяет само; отказ — код выхода ≠ 0 и последняя строка stdout `reason=<код>` (уходит в `result.reason`).
**Объяснение отказа пишет сам плагин** (контракт 2): строка `message=<текст>` среди последних 5 строк stdout (обычно
перед `reason=`) — на языке хаба (`AGENTHUB_LANG`), чистится как фразы `activity=` (до 120 графем); уходит в
`result.message`, и оболочка показывает его как есть: «"кнопка": текст». Без `message=` оболочка пишет «плагин
отказал (<код>)» — своих текстов для кодов конкретных плагинов в хабе нет.

**Окружение плагина:** `HOME`, `PATH` (как у агентов под launchd: `~/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`),
`TMPDIR`, `LANG`, `USER`, `AGENTHUB_PLUGIN_ID`, `AGENTHUB_PLUGIN_DATA_PATH`, `AGENTHUB_PLUGIN_CACHE_PATH`,
`AGENTHUB_LANG` (`ru|en` — язык интерфейса хаба), `AGENTHUB_REFRESH_REASON` (`FirstLaunch|Schedule|FileChanged|MenuAction|Manual|LanguageChanged`), `OS_PLATFORM`,
`OS_VERSION_MAJOR|MINOR|PATCH`, `OS_APPEARANCE`, `OS_LAST_SLEEP_TIME`, `OS_LAST_WAKE_TIME` (ISO),
`AGENTHUB_SECRET_*` для объявленных секретов; **только встроенным, официальным и своим** — переменные служб ядра
(`ctx.providePluginEnv`): `AGENTHUB_USAGE_FILE` — путь к кэшу квоты хаба `<home>/Cache/usage.json` (служба `usage`;
нет переменной — служба выключена `services.usage.enabled = false`: плагин показывает «квота недоступна» и сам файл не
ищет; право объявляется как `<agenthub.fsRead>$AGENTHUB_USAGE_FILE — зачем</agenthub.fsRead>`); `AGENTHUB_HUB_SOCKET` —
сокет хаба (служба `oauth`): плагин зовёт `POST /connections/<id>/mcp` и получает результат инструмента MCP без токена
(ядро сверяет pid процесса, доверие и объявленный `<agenthub.net>` с хостом сервиса; частоту и лимит держит ядро). На Windows ещё `USERPROFILE` (= `HOME`: `os.homedir()` там читает
его) и системные `SystemRoot`, `windir`, `COMSPEC`, `PATHEXT`, `TEMP`, `TMP`. Больше ничего (нет `NODE_OPTIONS`).

**Вывод:** шапка до первого `---`, тело после; `Заголовок | k=v k2="v 2"` (разделитель — последний `|`, справа
от которого только параметры); `--` — уровень вложенности; `---` в теле — разделитель. Параметры:

| Параметр | Смысл |
|---|---|
| `status=ok\|wait\|block\|error\|unknown` | в шапке; худший из шапки — статус плагина. Нет — `ok`; пустой вывод — `unknown` |
| `tileLabel="…"` | в первой строке шапки: короткая подпись плитки поповера вместо названия плагина (плитка держит одну строку ~110 pt): «Агенты» вместо «Фоновые агенты». Нет — название плагина |
| `tile="…"` | в первой строке шапки: короткое значение для плитки поповера и бейджа панели: что происходит («04:30», «2 ждут», «62%», «1 проблема»), не «!» — тревогу показывает значок статуса; шапка целиком отвечает на «нужно ли мне что-то делать» простыми словами |
| `activity="…"` | в шапке, **любой уровень плагина** (это не право): «у меня сейчас идёт работа» — для вердикта хаба «можно ли выключать» (`/state.idle`, служба idle): «Прогон «m81-gold» идёт, 12 мин». Не путать со `status=wait` («ждёт/внимание»). Пустое значение (`activity=""`) — «я участвую в проверке, у меня тихо»: плагин попадает в «Ещё проверено»; ключа нет — плагин в вердикте не участвует. Каждая строка шапки может нести свою фразу; берутся первые 4 разных. Фраза чистится (управляющие и форматирующие символы Unicode — bidi, нулевая ширина, U+2028/2029 — и переводы строк → пробел, кроме ZWJ между эмодзи; не больше 3 комбинирующих знаков на графему; пробелы схлопнуты) и режется до 120 графем (с «…»). Фразы плагинов не встроенных и не официальных хаб показывает с приставкой «<название плагина>: » (если фраза с него не начинается) и в заголовок карточки не ставит. Плагин со сбоем (exit ≠ 0, таймаут, пустой вывод; `status=error` при нормальном выходе — предметная ошибка, не сбой) или замолчавший (нет кадра дольше 3 интервалов, не меньше 2 мин) показывается строкой «<плагин>: сбой — последнее: <фраза> (HH:MM)», а не фразой как есть; пустой кадр с ошибкой (exit ≠ 0 без вывода) последние фразы не стирает. **streamable** с непустыми `activity=`/`needsOn=` повторяет кадр хотя бы раз в 2 мин (встроенный agents — раз в минуту): молчит дольше 5 мин — считается зависшим. В теле не понимается: предупреждение `параметр activity= понимается только в шапке`. В `params` не попадает; в состоянии плагина — `activity: string[] \| null` |
| `needsOn="…"` | в шапке, любой уровень: «мне понадобится включённый компьютер позже» — «Сборка в 04:30 — нужен включённый Mac». Только needsOn и ничего больше — вердикт `quiet-needs-on` («можно, но …»). Пишите коротко: часть до « — » оболочка ставит в заголовок карточки («Можно, но сборка в 04:30»; только у встроенных, официальных и своих плагинов, у прочих — «Можно, но не всё пройдёт»). Те же пределы, чистка и правила пустого значения, что у `activity=`; ключ без учёта регистра (`needson=`). В состоянии плагина — `needsOn: string[] \| null` |
| `effect="<примитив> <арг>…"` | предложить примитив; аргумент — `ключ=значение` или позиционный (`effect="open.url https://…"`) |
| `action=<id>` | действие из `<agenthub.action>`; `arg=<значение>` — аргумент параметризованного действия |
| `href=<url>` | то же, что `effect="open.url <url>"` |
| `event=<ключ>` | событие для push: ядро шлёт `event.raised` при появлении ключа и `event.cleared` при исчезновении (ключ в шине — `<pluginId>:<ключ>`) |
| `session=<sessionId> pid=<pid>` | строка о сессии Claude Code: ядро проверяет подпись pid и пишет в элемент `session: {id, pid, verified, label?}` (`verified: false` → `label` на языке хаба: «подпись не подтверждена», «подпись не проверить: Claude Code обновился»); прошедшие — в реестр, но только от builtin, official и own (community и local реестр сессий не меняют) |
| `sessionStatus=busy\|waiting\|idle`, `waitingFor=…`, `sessionName=…`, `sessionCwd=…`, `surfaceId=…`, `workspaceId=…` | сведения о сессии для реестра |
| `sessionEffort=low\|medium\|high\|xhigh\|max`, `sessionUltracode=true\|false` | effort последнего хода и ⚡ultracode (claude-sessions — по полям метаданных хвоста транскрипта); незнакомое значение отбрасывается; в `/state.sessions[].effort`/`ultracode` |
| `bash=`, `shell=`, `terminal=`, `paramN=` | **запрещены**: выбрасываются, предупреждение в журнал |
| `stat="<подпись>"`, `note="…"` | карточка-цифра на странице плагина: заголовок строки — значение («04:30»), `stat` — подпись, `note` — строка под ним (`color=` — её цвет); подряд идущие — в ряд |
| `gauge=<0…100>`, `gaugeLabel="…"` | в теле — карточка с полосой заполнения (`note` справа, дети — строки под полосой); в первой строке шапки — кольцо на странице плагина (`gaugeLabel` — подпись под числом) |
| `strip=true` | дети строки — лентой ячеек (`sfimage`, заголовок, `note`; ячейка с `effect` — кнопка): «Последние прогоны» |
| `details=true` | дети строки свёрнуты во второй уровень («Подробности»): номера процессов, cron-строки, id |
| прочее (`color`, `sfimage`, `badge`, `tooltip`, `font`, `size`, …) | оформление, передаётся как есть в `params` |

Код выхода ≠ 0 → статус `error` (элементы вывода сохраняются) и событие `plugin-error`. Таймаут standard
(5 с) → kill всей группы процессов, `error: "timeout"`. Больше 1 МБ вывода → `output-too-large`.

**streamable:** долгоживущий процесс; **кадр завершается строкой `~~~`** (печатайте кадр, затем `~~~`).
В stdin — NDJSON: `{"type":"fileChanged","path":…}` (по `<agenthub.watch>`), `{"type":"refresh","reason":…}`,
`{"type":"actionResult","id":…,"actionId"|"primitive":…,"ok":…,"code":…}`, `{"type":"inbound",…}` от расширений.
Упал — перезапуск с бэкоффом 1 с → 60 с, статус `error` до следующего кадра.

**watch:** путь или маска в последнем сегменте (`~/.claude/sessions/*.json`); дебаунс 300 мс. Пути нет, а каталог над
ним есть — слежение за каталогом по имени (появление файла сразу даёт запуск); нет и каталога — повторная попытка раз в
30 с. Запись может начинаться с переменной службы ядра: `<agenthub.watch>$AGENTHUB_USAGE_FILE — зачем</agenthub.watch>`
(или `${ИМЯ}/…`) — путь подставляет ядро из тех же переменных `ctx.providePluginEnv`, что попадают в окружение
плагина, то есть **только встроенным, официальным и своим**; у остальных и при выключенной службе запись пропускается
(предупреждение в журнале), плагин живёт по интервалу из имени файла. Так встроенный quota (`quota.5m.mjs`) и любой
доверенный плагин с такой записью запускаются сразу после записи кэша квоты службой usage; интервал — запасной.

Незнакомая форма источника → плагин сам печатает `status=unknown` и `event=source-broken`.

**Ключи `event=`** выбирайте из общей таблицы push (`daemon/lib/push/README.md`) или опишите своё правило тегом
`<agenthub.push key="…">Ярлык</agenthub.push>` (берётся только у `builtin`, `official` и `own`): правило выбирается по
ключу, суффикс экземпляра — через `:` (`session-waiting:<sessionId>`, `build-done:<YYYYMMDD>`). Заголовок строки
с `event=` уходит в уведомление — только метаданные. Атрибут `kind="sessions|updates|problems|other|plugin|security"`
относит событие к выключателю в «Настройках → Уведомления»; без него — вид правила ядра с тем же ключом, иначе «прочее».
`kind="plugin"` (контракт 2) — **свой переключатель плагина**: строка с названием плагина в «Настройках»
(`/state.notifications.plugins`), её хаб строит из установленных плагинов — нет плагина, нет строки. `was="runs|night"`
рядом с `kind="plugin"` — прежний вид контракта 1 для переноса выбора пользователя; устаревшие `kind="runs"` и
`kind="night"` принимаются как `kind="plugin" was="…"` с предупреждением линтера (`daemon/lib/push/README.md`, «Перенос»).
`security` (не выключается) объявляют только для сигналов о подмене — ревьюер реестра проверяет каждый такой тег
(`scripts/check.sh` реестра предупреждает о нём и о ключах, которые ядро поднимает само: `app-restart-stopped`,
`app-pin-changed`, `hub-update-*` и т. п.). Событие плагина с ключом правила ядра вида `security` исключением не
становится: вид, баннер мимо оболочки и тихие часы ядра — только у событий самого хаба. `services.push.rules` в
`config.json` к правилам вида `security` не применяется.

## Версии контракта

Ядро объявляет версию контракта плагинов (`CONTRACT_VERSION` в `daemon/lib/meta.mjs`; `/state.contract`,
`/health.contract`, `agenthub version`). Плагин объявляет минимальную нужную ему —
`<agenthub.contract>N</agenthub.contract>`; новее, чем у хаба, — установка и обновление отказывают «нужен хаб новее»
(CLI, окно, каталог), уже стоящий плагин работает как есть (журнал `plugin-contract-newer`).

| Версия | Когда | Что |
|---|---|---|
| 1 | до 09.11 (неявно) | всё, что выше, без пунктов версии 2. Виды push: `sessions`, `runs`, `night`, `updates`, `problems`, `other`, `security`. Одно подключение и значки нескольких плагинов были зашиты в ядро и оболочку |
| 2 | 09.11–10.11 | **Чистка ядра от названий плагинов.** `<agenthub.contract>`; `<agenthub.icon>` (значок и цвет плитки вместо словаря в оболочке); `<agenthub.connection>` (подключение объявляет плагин, а не ядро; право `connections`; вызов MCP — только своего подключения, иначе `mcp:not-owner`); `kind="plugin"` и `was=` у `<agenthub.push>` — свой переключатель плагина вместо видов `runs`/`night` (они — устаревшие синонимы с предупреждением линтера; перенос выключенных — `daemon/lib/push/README.md`); `message=` в выводе действия — текст отказа от плагина (оболочка больше не знает кодов плагинов); правила `blocker`, `session-died`, `workflow-*` ушли из таблицы ядра в метаданные плагинов; встроенные `agents` 1.2.0, `claude-sessions` 0.4.0, `quota` 0.5.0 объявляют значок, контракт и свои правила push (`quota` — `week-80`, `pace-85`, `token-lost`: правила `quota-*` ушли из таблицы ядра, переопределения `services.push.rules` по их прежним именам больше не действуют — пишите по ключу плагина). Ревью 10.11: id подключения — `<id плагина>.<имя>` (не `<id>-…`), с буквы и до 64; подключение — только у официальных и своих (линтер); адрес — имя хоста, не IP; суточный бюджет до 10000 действительно держится; «осиротевшие» подключения; отказ «нужен хаб новее» — раньше линтера и для своего плагина; версия, которой нужен хаб новее, не считается «доступным обновлением»; непонятный `contract` записи индекса — «нужен хаб новее» для неё, а не отказ каталога |

**Что ломается у плагинов контракта 1 на хабе версии 2.** Правила таблицы ядра `blocker` (вечером, без паузы между
повторами, вид «Ночь»), `session-died` и `workflow-*` (вид «Прогоны агентов») и `quota-*` ушли в метаданные плагинов.
Плагин контракта 1, который поднимал эти ключи без своего `<agenthub.push>`, на хабе версии 2 получает правило по
умолчанию: сразу, без вечерней задержки, вид «Прочее» — до перехода на свою версию с тегами. Встроенные плагины уже
перешли; из своих и официальных это касается `night-runner` до 0.7.0. Значок такого плагина — нейтральный.

**Хабы контракта 1 версию контракта не знают.** Тег `<agenthub.contract>` и поле `contract` индекса им неизвестны:
плагин контракта 2 они ставят молча и теряют то, чего не понимают, — правила `kind="plugin"` отбрасываются (разбор
v1 их не принимает; у плагина остаются только правила с видами контракта 1), подключение `<agenthub.connection>` не
работает (в окне согласия его нет: права вида `connections` старое ядро не учитывает), текст `message=` не
показывается. Защиты «нужен хаб новее» у них нет — она начинается с хаба версии 2.

**Порядок выкатки контракта 2** (живой хаб — контракта 1):
1. Обновить хаб до версии 2 (`agenthub hub update` / установщик). Перенос выключенных «Прогоны агентов» и «Ночь» —
   при первом старте (`daemon/lib/push/README.md`, «Перенос»).
2. Сразу перевести `night-runner` на свой 0.7.0 из папки (`agenthub plugins install --from …/agenthub/night-runner`):
   стоящая версия контракта 1 теряет правило `blocker` ядра (выше).
3. Только потом публиковать в реестр плагины контракта 2 (`clickup` 1.3.0, `hermes` 1.3.0): хаб контракта 1 поставил
   бы их без своих правил push.
4. Откат хаба на версию 1 (`agenthub hub rollback`) настройки уведомлений не теряет (там же, «Перенос»), но плагины
   контракта 2 на нём работают урезанно (абзац выше).
