# clickup — тикеты ClickUp и связь с работой

Официальный плагин реестра `agent-hub-plugins` (tier `official`, ставится менеджером и удаляется из него).
Standard, раз в 2 мин. Только чтение, действий нет.

**API:** REST v2 `https://api.clickup.com`, **только GET** и только пути из белого списка
(`/api/v2/user`, `/api/v2/team`, `/api/v2/team/{id}/task`, `/api/v2/list/{id}/task`, `/api/v2/task/{id}`)
с разрешёнными параметрами; редиректы запрещены. Записей в ClickUp нет (вне рамок).
`user` и `team` кэшируются на сутки — обычный запуск делает один запрос на рабочее пространство.

**Токен:** секрет `clickup.token` → `AGENTHUB_SECRET_CLICKUP_TOKEN` (ядро зовёт провайдер секретов; Keychain
`agent-hub.clickup` заводит пользователь). Без токена — `status=unknown`, ни одного запроса. Токен не попадает
в вывод, кэш и журнал.

**Лимит:** учитываются `X-RateLimit-Remaining` / `X-RateLimit-Reset` (осталось ≤ 3 — ждём сброса окна);
на 429 — бэкофф 1, 2, 4… мин (до 30 мин, не раньше Reset), прошлые тикеты остаются на экране.

**Настройки** (необязательно) — `<AGENTHUB_PLUGIN_DATA_PATH>/config.json`:
`{"teamIds": ["…"], "listIds": ["…"], "assignee": "me" | null, "limit": 15}`. По умолчанию — открытые тикеты
на владельца токена во всех его рабочих пространствах (до 3).

**Связь тикет ↔ работа** (дизайн, раздел 4), уверенность видна в строке:

| Связь | Откуда | Уверенность |
|---|---|---|
| ночь | `~/.claude/task-runs/night/projects/*/attempts/<id>.json`, `night/<дата>/<id>/agent.json`, ночной `RUN.md` (ветка `night/…`, каталог `*-night`, `unattended`) | точно |
| /ticket | `~/.claude/task-runs/<repo>/<id>/RUN.md` | точно |
| сессия | `session_id` в `RUN.md` | точно |
| сессия | живая сессия на ветке из `RUN.md` в том же репо, или ветка/каталог сессии содержит id тикета | сильно |
| сессия | живая сессия в репо `RUN.md` (свежего, < 6 ч), ветка не совпала | возможно |

Из `RUN.md` читаются только ключи `task_id, task_ref, branch, repo_root, worktree, status, outcome, mode,
session_id, unattended` и имя последнего `step`. Сессии — `~/.claude/sessions/<pid>.json` (файлы ключей рядом не читаются),
живость — `ps -p`, ветка — `.git/HEAD` (и `gitdir:` у worktree) без запуска git.

**Предлагает:** `open.url` — тикет в браузере; `cmux.focus` — у строки связи с сессией, если её вкладка
известна по `~/.cmuxterm/claude-hook-sessions.json` (только идентификаторы).

**События:** `auth-failed` (401/403, status=error; правило push «ClickUp: токен не принят» — `<agenthub.push>`),
`source-broken` (незнакомая форма ответа, status=unknown).

Тесты — только на двойнике HTTP на 127.0.0.1 (подмена адреса принимается только для loopback):
`test/clickup.test.mjs` (`scripts/check.sh --only clickup`).
