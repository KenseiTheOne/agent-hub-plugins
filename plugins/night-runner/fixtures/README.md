# Фикстуры night-runner

Синтетика по форме реальных файлов раннера (поля и формат строк — из кода night-runner, значения выдуманы):

- `home/` — синтетический HOME: `Projects/IT/night-runner/config.json` (схема 2), двойник `night-run.mjs` без `status`,
  `state_dir` с сводками (`YYYYMMDD.md`, в т.ч. два прогона одной даты через `---`), планом `.dry.md`, маркерами
  попыток, `night.log` (только строки старта/итога задачи), кэш квоты, plist launchd (только наличие).
- `ps.txt` — вывод `ps -axww -o pid=,ppid=,command=` (`{{HOME}}` подставляет тест): GUI-редактор Unity на
  night-worktree, его импорт-воркер, редактор на основном чекауте, процесс раннера.
- `pmset-*.txt` — `pmset -g batt` на сети и на батарее.
- `runner-v2/` — двойник раннера после этапа 1 (`status --json`, `queue --json`).
