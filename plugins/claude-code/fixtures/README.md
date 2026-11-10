# Фикстуры плагина claude-code

Синтетические данные, ничего настоящего: id сессий, pid, пути `/work/*`, стили и плагин `demo-plugin` выдуманы.

- `home/` — HOME для пробного запуска `scripts/check.sh` и тестов: `.local/bin/claude` (пустой файл — «Claude Code
  установлен»), `.claude/settings.json` (с маркерами `fixture-secret-do-not-print` — плагин не должен их печатать),
  `.claude/output-styles`, `.claude/plugins` (`installPath` содержит `HOME_PLACEHOLDER` — тесты подставляют путь),
  `.claude/sessions/*.json`, `.cmuxterm/claude-hook-sessions.json` (маркер текста переписки в `lastBody`).
- `hub-sessions.json` — файл хаба с моделью и effort сессий (`$AGENTHUB_CLAUDE_SESSIONS_FILE`, заявка хабу 10.11).

Процессы (`ps`) и cmux в тестах — двойники-скрипты в `AGENTHUB_TEST_BIN_DIR`.
