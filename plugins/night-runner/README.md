# night-runner

Официальный плагин реестра `agent-hub-plugins` (tier `official`, ставится менеджером плагинов и удаляется из него;
`standard`, раз в 30 с и по изменению `~/.claude/task-runs/night`). Вывод — только чтение.

**Показывает:** идёт ли ночь (живой `night.lock`, держатель — процесс `night-run.mjs`; замок `post`/`setup` и
протухший замок — не ночь), текущую задачу (id из `night.log` последнего прогона), блокеры, итоги семи последних
ночей (последний прогон даты из `YYYYMMDD.md`), очередь двумя слоями со свежестью: «план по dry-run» (последний
`.dry.md`, время файла, старше 36 ч — «устарел») и «держатся» (маркеры попыток: без `retries` или `retries ≥ 3`;
`retries < 3` — «на повторе n/3»).

**Блокеры** (шапка `status=block`, у каждого — `event=` для push): Unity GUI-редактор на night-worktree
(`unity-open:<проект>`; как `liveEditor` раннера: `-projectPath`, realpath, batchmode-воркеры не в счёт),
маркер подмены `git-config-changed.txt` (`tamper`), снятое задание launchd (`launchd-missing`), недельная квота
≥ `usage.skip_seven_day_pct` (`quota-skip`). Питание от батареи — мягкий блокер (`wait`, `power`).
Итог ночи сегодня, без живого замка — `night-done:<YYYYMMDD>`.

**Режимы.** Пока у раннера нет `status --json` / `queue --json` (этап 1 отложен), всё читается из файлов.
Детект — по списку `COMMANDS` в `night-run.mjs`; сам раннер ради детекта не запускается. Когда команды появятся,
плагин зовёт их (`node night-run.mjs status --json`, таймаут 3,5 с) и ждёт форму, описанную у `adaptStatus` /
`adaptQueue`; другая форма или ошибка → файлы и пометка в меню.

**Действия** (`<agenthub.action>`; подтверждение и его текст — от ядра, только из приложения; ядро сверяет
аргумент с шаблоном `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` (как `SAFE_ID` раннера) и передаёт его отдельным элементом argv, без шелла):

| id | Уровень | Что делает | Отказ (`reason=`) |
|---|---|---|---|
| `stop` | confirm | `STOP` в `state_dir` (0600, существующий не трогает): раннер остановится между задачами штатным `finish` | `runner-patch-required`, `no-state-dir`, `lock-unknown` (ps не ответил), `night-not-running` (замка нет, держатель мёртв или это `research`/`post`/`setup`) |
| `skip <taskId>` | confirm | `SKIP-<taskId>` в `state_dir`; ночь может и не идти | `runner-patch-required`, `no-state-dir`, `bad-task` |
| `run <taskId>` | confirm-cost | `node night-run.mjs run --task <проект>:<taskId> --no-push` отдельным процессом, лог — `PluginData/night-runner/runner-<время>.log` (0600). Проект — из раздела последнего плана dry-run (заголовок — title или id проекта в `config.json` раннера); задачи нет в плане — единственный включённый проект | `no-runner`, `night-lock` (замок держит любая команда раннера), `lock-unknown`, `bad-task`, `no-runner-config`, `unknown-project` (в плане нет, а включено проектов не один), `ambiguous-task` (id в разделах двух проектов) |

Факты (держатель замка — по `ps` и argv, как `isNightLock`) проверяет сам плагин в режиме `--action`, ядро о ночи
ничего не знает. Стоп-файлы пишутся только с `"stopFiles": true` в настройках — включить после патча раннера
(этап 1), до того раннер их не читает.

**Push** (`<agenthub.push>`, служба push принимает их только у встроенных и официальных): блокеры
`unity-open`, `launchd-missing`, `quota-skip`, `power` — «Ночь не запустится», вечером (`hold=evening`);
`night-done`; `runner-crashed` и `tamper` — и в тихие часы; `infra-failures`.

**Настройки (необязательно):** `$AGENTHUB_PLUGIN_DATA_PATH/config.json` →
`{"runnerDir": "...", "stateDir": "...", "stopFiles": false}`. По умолчанию `~/Projects/IT/night-runner` и
`state_dir` из его `config.json`.

**Порча источника** (сводка, `.dry.md`, `config.json` раннера незнакомой формы, `ps` не ответил) →
`status=unknown` + `event=source-broken`.

Тесты: `test/night-runner.test.mjs` (`scripts/check.sh --only night-runner`), фикстуры — `fixtures/` (синтетика).
