# plugins/

Каждый плагин — папка `plugins/<id>/`:

```
plugins/<id>/
  <id>.<интервал>.<расширение>   ← исполняемый файл (или <id>.<расширение> для streamable / по расписанию)
  README.md                      ← что показывает, какие права и зачем
  fixtures/home/                 ← синтетический HOME для тестов (необязательно)
  test/*.test.mjs                ← тесты плагина (необязательно), запускаются на синтетическом HOME
```

Формат файла, метаданные и вывод — контракт плагина Agent Hub (`agent-hub/docs/extension-points.md`, раздел
«Контракт плагина»): теги `<agenthub.*>` в комментариях, вывод в стиле SwiftBar. В архив плагина идёт всё,
кроме `test/`, `fixtures/` и dot-файлов.

## Официальные плагины

`night-runner`, `hermes`, `clickup` — официальные (список — `official.json`, правит только владелец; в индексе —
`tier: "official"`). Мейнтейнер — владелец реестра. Встроенные плагины Agent Hub (claude-sessions, agents, quota)
лежат в `agent-hub/plugins/` и в реестр не входят.

Метка `official` даёт в CI и в демоне три вещи, и ревьюер смотрит все три как привилегию:
- объявленные действия `<agenthub.action>` (уровень не ниже `confirm`; подтверждение и его текст — от ядра);
- свои правила push `<agenthub.push …>`: ярлык события, `hold`, `macOnly`, `cooldown`, `away` и `quiet="true"` —
  проход в Telegram **в тихие часы** (у community теги игнорируются: только macOS, без текста плагина);
- статус доверенного (`trusted`): текст строки с `event=` попадает в уведомление (у community — нет).

Демон считает плагин официальным, только пока подписанный индекс называет его `official` и файлы на диске —
ровно архив с sha256 из индекса: убрали id из `official.json` — у установленной копии эти три вещи пропадают
после следующего `POST /registry/fetch`. Потолок effects (`open.*`, `cmux.focus`) и запрет упоминать запретные
места — те же, что у всех. Параметризованное действие:

```
// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9_-]{1,64}$" title="…">night-runner.30s.mjs --action skip {taskId}</agenthub.action>
```

В выводе: `Пропустить | action=skip arg=<значение>`. Ядро сверяет значение с шаблоном (обёрнутым в `^(?:…)$`;
ещё — без управляющих и форматирующих символов Unicode (Cc, Cf: bidi, нулевая ширина) и U+2028/2029, не с «-»,
до 256 символов) и запускает главный файл плагина его же
интерпретатором, подставив значение отдельным элементом argv вместо `{taskId}` (или в конец). Факты (держатель
замка, есть ли задача) действие проверяет само; отказ — код выхода ≠ 0 и последняя строка `reason=<код>`.
Свои правила push — `<agenthub.push key=… hold=… quiet=…>Ярлык</agenthub.push>`.

Тесты плагина — `plugins/<id>/test/*.test.mjs`; общие помощники (разборщики ядра из `scripts/vendor/`, временный
HOME) — `scripts/lib/plugin-test.mjs`.

## Локальная установка для разработки (без публикации)

```sh
node scripts/keygen.mjs /tmp/ahp-key                      # тестовый ключ вне репы (не связка ключей)
node scripts/build-index.mjs --out /tmp/ahp-idx --sign-key-file /tmp/ahp-key/agent-hub-index.key
AGENTHUB_HOME=/tmp/ah-dev node ../agent-hub/daemon/bin/agenthub install \
  --registry-pubkey /tmp/ahp-key/agent-hub-index.pub --registry-url /tmp/ahp-idx/index.json --apply --no-launchd
AGENTHUB_HOME=/tmp/ah-dev node ../agent-hub/daemon/bin/agenthub plugins install night-runner   # окно прав в терминале
```
