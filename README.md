# agent-hub-plugins

Реестр плагинов [Agent Hub](../agent-hub) — монорепа: плагины, проверка в CI, подписанный каталог `index.json`,
из которого менеджер плагинов приложения ставит плагины.

```
plugins/<id>/<id>.<interval>.<ext>   README.md   fixtures/   test/
scripts/check.sh        ← один вход для CI и автора
scripts/build-index.mjs ← index.json + архивы (собирает CI только на main после мерджа)
blocklist.json  official.json  CODEOWNERS  CONTRIBUTING.md  SECURITY.md  LICENSE (MIT)
```

## Как это работает

1. Автор присылает PR с папкой `plugins/<id>/`.
2. CI (`.github/workflows/ci.yml`, macOS и Windows, без сети и секретов, без `pull_request_target`) запускает
   `scripts/check.sh --base <база PR>`:
   - разбор метаданных **тем же парсером, что у демона** (`scripts/vendor/meta.mjs`);
   - линтер прав: запрещены `~/.claude/projects`, `*.key`, `.env`, `auth.json`, `~/.cmuxterm/workstream.jsonl`
     (и маски, которые их охватывают) — для всех, без исключений по метке; effects — только `open.*` и
     `cmux.focus`; `<agenthub.action>` — только у `official` (уровень не ниже `confirm`, `arg="имя:^шаблон$"`);
     у каждого права — пояснение «— зачем»;
   - пробный запуск на синтетическом HOME (`fixtures/home`), окружение как у демона, таймаут 5 с; вывод не
     может предложить effect, которого нет в метаданных;
   - тесты плагина `test/*.test.mjs`;
   - дифф прав с базой: в сводке job и в артефакте; рост прав → метка `permissions` (`perms-label.yml`) и
     второй ревьюер.
3. После мерджа в `main` job `sign` (environment `registry-signing`) собирает `index.json` с sha256 архивов и
   `tier` каждого плагина (`official` — из `official.json`, иначе `community`), подписывает его (minisign/Ed25519)
   и публикует. Демон берёт уровень плагина только отсюда (через `plugins.lock`), не из метаданных.
4. Менеджер в демоне (`agent-hub/daemon/lib/plugins.mjs`) проверяет подпись открытым ключом из конфига,
   ставит архив только с совпавшим sha256, показывает окно прав с «зачем», пишет согласованные права в
   `plugins.lock` и при росте прав в обновлении спрашивает снова. `blocklist.json` попадает в подписанный
   индекс и принудительно отключает плагин.

## Автору

```sh
scripts/check.sh --only my-plugin            # проверка своего плагина
scripts/check.sh --base origin/main          # как в CI, с диффом прав
node scripts/build-index.mjs --out /tmp/idx  # посмотреть, что попадёт в индекс (без подписи)
```

Нужен Node ≥ 22. Подробности — [CONTRIBUTING.md](CONTRIBUTING.md). Язык вывода — из `AGENTHUB_LANG=ru|en`
(хаб передаёт его плагину; без перевода плагин показывается как есть), переводы метаданных — теги с `lang="en"`.

## Вендоринг разборщиков ядра

CI не видит репу `agent-hub`, поэтому модули демона лежат побайтной копией в `scripts/vendor/`
(`meta.mjs`, `output.mjs`, `registry/minisign.mjs`, `registry/tarball.mjs`, `registry/perms.mjs` +
заглушка `native.mjs`). Обновление — только `node scripts/sync-vendor.mjs [--from ../agent-hub]`;
`check.sh` сверяет копии с `scripts/vendor/VENDOR.json`, а если рядом лежит `agent-hub` — ещё и с исходником.

## Тесты самой репы

```sh
env -u NODE_OPTIONS node --test 'test/*.test.mjs'
```

Ключи подписи в тестах генерируются во временном каталоге и удаляются.
