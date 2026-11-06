#!/usr/bin/env node
// Ночной раннер: режим ночи (задачи, исследование рынка), идёт ли ночь, блокеры, очередь, итоги ночей, отчёт рынка.
//
// <agenthub.title>Ночь</agenthub.title>
// <agenthub.title lang="en">Night</agenthub.title>
// <agenthub.version>0.5.0</agenthub.version>
// <agenthub.author.name>Kensei</agenthub.author.name>
// <agenthub.author.github>KenseiTheOne</agenthub.author.github>
// <agenthub.desc>Ночной раннер: режим ночи (задачи или исследование рынка), запустится ли она, бюджет квоты, что мешает, итоги и отчёт</agenthub.desc>
// <agenthub.desc lang="en">Night runner: tonight's mode (tasks or market research), will it start, quota budget, what's in the way, results and report</agenthub.desc>
// <agenthub.status value="ok" label="Ночь готова или идёт">Ничего не мешает ночному запуску</agenthub.status>
// <agenthub.status value="ok" lang="en" label="Night ready">Nothing is in the way of tonight's run</agenthub.status>
// <agenthub.status value="wait" label="Ночь может не стартовать">Мягкое препятствие (мак не на зарядке) или ночи нечего делать</agenthub.status>
// <agenthub.status value="wait" lang="en" label="Night may not start">A soft obstacle (the Mac isn't plugged in) or nothing for the night to do</agenthub.status>
// <agenthub.status value="block" label="Ночь не запустится">Блокер, маркер подмены или раннер упал — нужно вмешаться</agenthub.status>
// <agenthub.status value="block" lang="en" label="Night won't run">A blocker, a tamper marker or a crashed runner — needs you</agenthub.status>
// <agenthub.status value="unknown" label="Файлы раннера не читаются">Состояние ночи не разобрано</agenthub.status>
// <agenthub.status value="unknown" lang="en" label="Can't read runner files">The night's state couldn't be read</agenthub.status>
// <agenthub.platforms>macos</agenthub.platforms>
// <agenthub.watch>~/.claude/task-runs/night — замок и сводки появляются здесь</agenthub.watch>
// <agenthub.watch lang="en">~/.claude/task-runs/night — the night's lock and summaries appear here</agenthub.watch>
// <agenthub.watch>$AGENTHUB_USAGE_FILE — служба usage записала свежую квоту: пересчитать бюджет ночи сразу</agenthub.watch>
// <agenthub.watch lang="en">$AGENTHUB_USAGE_FILE — the usage service wrote fresh quota: recompute the night budget right away</agenthub.watch>
// <agenthub.fsRead>~/Projects/IT/night-runner/config.json — настройки ночи: во сколько старт, какие проекты в работе и включено ли исследование рынка</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Projects/IT/night-runner/config.json — night settings: start time, which projects are included and whether market research is on</agenthub.fsRead>
// <agenthub.fsRead>~/Projects/IT/night-runner/night-run.mjs — узнать, умеет ли раннер сам сообщать своё состояние</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Projects/IT/night-runner/night-run.mjs — to check whether the runner can report its own state</agenthub.fsRead>
// <agenthub.fsRead>~/.claude/task-runs/night — идёт ли ночь или исследование, что в плане, чем закончились прошлые ночи, какая задача в работе, сколько агентов исследования отработало и есть ли отчёт рынка (дата и число находок)</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/.claude/task-runs/night — whether a night or research is running, what's planned, how past nights ended, which task is in progress, how many research agents finished and whether a market report exists (date and number of findings)</agenthub.fsRead>
// <agenthub.fsRead>$AGENTHUB_USAGE_FILE — кэш квоты Agent Hub (проценты недели и время сброса, без токенов): сколько ночь возьмёт и не пропустит ли запуск</agenthub.fsRead>
// <agenthub.fsRead lang="en">$AGENTHUB_USAGE_FILE — Agent Hub's quota cache (weekly percentages and reset time, no tokens): how much the night will use and whether it skips</agenthub.fsRead>
// <agenthub.fsRead>~/Library/LaunchAgents/com.kensei.night-runner.plist — на месте ли расписание ночного запуска</agenthub.fsRead>
// <agenthub.fsRead lang="en">~/Library/LaunchAgents/com.kensei.night-runner.plist — whether the night's schedule is still installed</agenthub.fsRead>
// <agenthub.exec>/bin/ps -axww -o pid=,ppid=,command= — не открыт ли Unity на проекте ночи и жива ли сама ночь или исследование</agenthub.exec>
// <agenthub.exec lang="en">/bin/ps -axww -o pid=,ppid=,command= — whether Unity is open on the night's project and the night or research itself is alive</agenthub.exec>
// <agenthub.exec>/usr/bin/pmset -g batt — подключён ли мак к сети: на батарее ночь по расписанию не стартует</agenthub.exec>
// <agenthub.exec lang="en">/usr/bin/pmset -g batt — whether the Mac is plugged in: on battery the scheduled night won't start</agenthub.exec>
// <agenthub.exec>node night-run.mjs status --json / queue --json — состояние и очередь от самого раннера, когда он это научится отдавать; пока не запускается</agenthub.exec>
// <agenthub.exec lang="en">node night-run.mjs status --json / queue --json — state and queue from the runner itself, once it can report them; not run yet</agenthub.exec>
// <agenthub.exec>node night-run.mjs run --task <project>:<id> --no-push — кнопка «Запустить днём»: одна задача, без отправки в git, только когда раннер свободен</agenthub.exec>
// <agenthub.exec lang="en">node night-run.mjs run --task <project>:<id> --no-push — the Run now button: one task, nothing pushed to git, only while the runner is free</agenthub.exec>
// <agenthub.exec>node night-run.mjs research --minutes <30|60|120> — кнопка «Исследовать сейчас»: исследование рынка агентами с веб-поиском, только когда раннер свободен</agenthub.exec>
// <agenthub.exec lang="en">node night-run.mjs research --minutes <30|60|120> — the Research now button: market research by agents with web search, only while the runner is free</agenthub.exec>
// <agenthub.fsWrite>~/.claude/task-runs/night/STOP — кнопка «Остановить»: ночь закончится после текущей задачи</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/task-runs/night/STOP — the Stop button: the night ends after the current task</agenthub.fsWrite>
// <agenthub.fsWrite>~/.claude/task-runs/night/SKIP-* — кнопка «Пропустить»: задача не пойдёт в эту ночь</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/.claude/task-runs/night/SKIP-* — the Skip button: the task is left out of tonight's run</agenthub.fsWrite>
// <agenthub.fsWrite>~/Projects/IT/night-runner/config.json — переключатель режима ночи: меняет только research.enabled и enabled проектов, прежняя копия файла — в данных плагина</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/Projects/IT/night-runner/config.json — the night mode switch: changes only research.enabled and the projects' enabled, the previous copy goes to the plugin's data</agenthub.fsWrite>
// <agenthub.fsWrite>~/Projects/IT/night-runner/.config.json.agenthub-*.tmp — временный файл атомарной записи config.json: сразу переименовывается в него</agenthub.fsWrite>
// <agenthub.fsWrite lang="en">~/Projects/IT/night-runner/.config.json.agenthub-*.tmp — temporary file for the atomic write of config.json: renamed over it right away</agenthub.fsWrite>
// <agenthub.effects>open.file,open.url</agenthub.effects>
// <agenthub.action id="stop" level="confirm" title="Остановить ночь после текущей задачи" title-en="Stop the night after the current task">night-runner.30s.mjs --action stop</agenthub.action>
// <agenthub.action id="skip" level="confirm" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Пропустить в ночи задачу" title-en="Skip this task tonight">night-runner.30s.mjs --action skip {taskId}</agenthub.action>
// <agenthub.action id="run" level="confirm-cost" arg="taskId:^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" title="Запустить днём без пуша задачу" title-en="Run this task now without pushing" cost="расход квоты Claude на задачу целиком" cost-en="uses Claude quota for the whole task">night-runner.30s.mjs --action run {taskId}</agenthub.action>
// <agenthub.action id="mode-tasks" level="confirm" title="Режим ночи «Задачи»: в config.json раннера research.enabled = false; если все проекты выключены — включить те, что были включены до «Только исследование». Остальное в файле не меняется, прежняя копия — в данных плагина" title-en="Night mode Tasks: set research.enabled = false in the runner's config.json; if every project is off, turn on the ones that were on before Research only. Nothing else in the file changes, the previous copy goes to the plugin's data">night-runner.30s.mjs --action mode tasks</agenthub.action>
// <agenthub.action id="mode-tasks-research" level="confirm-cost" cost="каждая ночь тратит квоту Claude ещё и на агентов исследования с веб-поиском — весь остаток окна" cost-en="every night also spends Claude quota on research agents with web search for the rest of the window" title="Режим ночи «Задачи + исследование в остаток окна»: в config.json раннера research.enabled = true; если все проекты выключены — включить те, что были включены до «Только исследование». Остальное в файле не меняется, прежняя копия — в данных плагина" title-en="Night mode Tasks + research: set research.enabled = true in the runner's config.json; if every project is off, turn on the ones that were on before Research only. Nothing else in the file changes, the previous copy goes to the plugin's data">night-runner.30s.mjs --action mode tasks-research</agenthub.action>
// <agenthub.action id="mode-research-only" level="confirm-cost" cost="каждая ночь тратит квоту Claude на агентов исследования с веб-поиском — всё окно" cost-en="every night spends Claude quota on research agents with web search for the whole window" title="Режим ночи «Только исследование»: в config.json раннера выключить все проекты (enabled = false, какие были включены — запомнить для возврата) и research.enabled = true. Остальное в файле не меняется, прежняя копия — в данных плагина" title-en="Night mode Research only: in the runner's config.json turn every project off (enabled = false, the ones that were on are remembered for the way back) and set research.enabled = true. Nothing else in the file changes, the previous copy goes to the plugin's data">night-runner.30s.mjs --action mode research-only</agenthub.action>
// <agenthub.action id="research" level="confirm-cost" arg="minutes:^(?:30|60|120)$" title="Исследовать рынок сейчас (night-run.mjs research), окно в минутах" title-en="Research the market now (night-run.mjs research), window in minutes" cost="расход квоты Claude: агенты-исследователи с веб-поиском на всё окно" cost-en="uses Claude quota: research agents with web search for the whole window">night-runner.30s.mjs --action research {minutes}</agenthub.action>
// <agenthub.push key="unity-open" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="launchd-missing" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="quota-skip" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="power" hold="evening" cooldown="0s">Ночь не запустится</agenthub.push>
// <agenthub.push key="night-done">Ночь закончилась</agenthub.push>
// <agenthub.push key="runner-crashed" quiet="true">Раннер упал</agenthub.push>
// <agenthub.push key="tamper" quiet="true">Маркер подмены</agenthub.push>
// <agenthub.push key="infra-failures">Инфраструктурные провалы подряд</agenthub.push>
// <agenthub.push key="unity-open" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="launchd-missing" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="quota-skip" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="power" lang="en">Night won't start</agenthub.push>
// <agenthub.push key="night-done" lang="en">Night finished</agenthub.push>
// <agenthub.push key="runner-crashed" lang="en">Runner crashed</agenthub.push>
// <agenthub.push key="tamper" lang="en">Tamper marker</agenthub.push>
// <agenthub.push key="infra-failures" lang="en">Infrastructure failures in a row</agenthub.push>
//
// Официальный плагин реестра agent-hub-plugins. Вывод — только чтение. Управление — только объявленными
// действиями (<agenthub.action>): ядро показывает своё подтверждение, сверяет аргумент с шаблоном и запускает
// этот же файл с `--action <id> [<taskId>]` отдельными элементами argv, без шелла. Факты (держатель замка по
// argv, жив ли он, есть ли state_dir) проверяет сам плагин в режиме действия; отказ — код выхода ≠ 0 и строка
// `reason=<код>`. Стоп-файлы STOP / SKIP-<id> пишутся только с флагом `stopFiles: true` в настройках плагина —
// его включают после патча раннера (этап 1), до того действие отвечает reason=runner-patch-required.
// События: runner-crashed:<дата> — замок ночи есть, а держателя нет (или сводка дня «прогон не завершён»);
// infra-failures:<дата> — ночь остановлена инфраструктурными провалами подряд. Пока у раннера нет `status --json` /
// `queue --json` (детект — по списку COMMANDS в night-run.mjs, сам раннер для детекта не запускается),
// всё читается из файлов. Незнакомая форма источника → status=unknown + event=source-broken.
//
// Режим ночи (с 0.5.0) — из config.json раннера, как его понимает сам раннер (_config-modes.mjs, modeOf):
// «Задачи», «Задачи + исследование в остаток окна», «Только исследование» (все проекты выключены, research.enabled),
// «Ночь ничего не делает». Исследование рынка видно и ночное (фаза после задач в night.log ночи), и ручное
// (`night-run.mjs research` держит замок): сколько агентов отработало — по строкам «исследование: …» его night.log.
// Последний отчёт — research/<дата>-<время>/report.html и findings.json (дата и число находок; сами идеи хаб не
// показывает), открыть — research/latest.html и лента research/index.html через open.file. Действия mode-* меняют
// в config.json раннера только research.enabled и enabled проектов (атомарно, копия прежнего — в данных плагина),
// research <30|60|120> запускает `night-run.mjs research --minutes N`; всё — только пока раннер свободен.
//
// Квота — из кэша хаба (служба ядра usage): путь в AGENTHUB_USAGE_FILE, ядро даёт его встроенным и официальным
// плагинам; за этим файлом плагин и следит (<agenthub.watch>$AGENTHUB_USAGE_FILE: путь подставляет ядро, только
// доверенным) — бюджет ночи пересчитывается сразу после записи кэша, а не через 30 с. Нет переменной — «квота недоступна» (бюджета ночи нет, блокера по квоте тоже). Бюджет ночи считается
// так же, как у раннера (night-runner/lib/schedule.mjs, nightBudget): night_share_pct недели на семь ночей, не больше
// остатка до stop_seven_day_pct; последняя ночь перед сбросом недели берёт весь остаток. Идущей ночи — бюджет из её
// сводки (квота на старте), строки со сброшенным resets_at не в счёт.
//
// Необязательные настройки: $AGENTHUB_PLUGIN_DATA_PATH/config.json → {"runnerDir": "...", "stateDir": "..."}.
// Там же — night-mode.json (какие проекты вернуть после «Только исследование»), config-backups/ (копии config.json
// раннера перед каждой правкой) и логи runner-*.log / research-*.log запусков из хаба (0600).
// Для тестов: AGENTHUB_TEST_BIN_DIR — каталог с двойниками ps/pmset/node; AGENTHUB_TEST_NOW — «сейчас» (ISO).
// Демон эти переменные плагину не передаёт (окружение очищено), так что в работе они не действуют.

import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { backupConfig, clearMemory, commitConfig, configProblem, dropStaged, editConfigText, modeOf, parseJsonSpans, planModeChange, readMemory, stageConfig, SWITCHABLE, writeMemory } from "./_config-modes.mjs";

export { commitConfig, configProblem, editConfigText, modeOf, parseJsonSpans, planModeChange, readMemory, stageConfig };

export const LAUNCHD_LABEL = "com.kensei.night-runner";
export const TAMPER_FILE = "git-config-changed.txt";
export const MAX_RETRIES = 3;
const DAY_MS = 86_400_000;
const PLAN_STALE_MS = 36 * 3_600_000;
const USAGE_DEFAULTS = { skip_seven_day_pct: 80, stop_seven_day_pct: 85, night_share_pct: 30 };
const HOUR_MS = 3_600_000;
const WEEK_NIGHTS = 7;
const QUOTA_STALE_MS = HOUR_MS;
const MIN_MS = 60_000;
// schedule.max_wait_for_reset_min раннера по умолчанию (night-runner/lib/config.mjs, SCHEDULE)
const MAX_WAIT_DEFAULT_MIN = 240;
// research раннера по умолчанию (night-runner/lib/config.mjs, RESEARCH): окно ручного исследования — не меньше
// synthesis_reserve_min + min_agent_min (night-run.mjs, researchCommand)
const RESEARCH_DEFAULTS = { synthesis_reserve_min: 20, min_agent_min: 8, stop_seven_day_pct: 70 };
// После дедлайна окна раннер ещё качает картинки отчёта (до 160 штук по 6 сразу, таймаут 15 с: ≈7 мин в худшем
// случае, lib/research/assets.mjs) и пишет HTML, findings.json и ленту — замок держится ещё до ~10 минут.
export const RESEARCH_TAIL_MS = 10 * 60_000;
// Подкоманды раннера (night-run.mjs, COMMANDS рабочего дерева) и флаги со значением из его parseFlags: значение флага —
// не подкоманда (`night-run.mjs --minutes 90 research` — это research, а не ночь).
const RUNNER_SUBCOMMANDS = ["run", "setup", "check", "install", "uninstall", "migrate-state", "post", "research"];
const VALUE_FLAGS = new Set(["--minutes", "--task", "--project", "--config", "--plugin-dir", "--max-tasks", "--scheduled", "--to"]);
// Окна кнопки «Исследовать сейчас» — те же значения, что в шаблоне аргумента действия research.
export const RESEARCH_MINUTES = [30, 60, 120];
const RESEARCH_DEFAULT_MIN = 60;

// id задачи раннера — [A-Za-z0-9_-] до 64 символов, первый — буква или цифра (SAFE_ID в night-runner/lib/config.mjs).
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// id проекта раннера (PROJECT_ID в night-runner/lib/config.mjs).
export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Аргумент действия: SAFE_ID и не похож на ключ (ядро тоже отклоняет «-…»; здесь — вторая линия).
const argOk = (id) => SAFE_ID.test(String(id || "")) && !String(id).startsWith("-");

// ---------- мелочи ----------

export function expand(p, home = homedir()) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

// Текст из внешних источников — в одну строку, без управляющих символов и без префиксов формата SwiftBar.
export function clean(text, max = 120) {
  // «|» — разделитель параметров: в чужом тексте он подменил бы их, поэтому заменяется на «¦».
  let s = String(text ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\|/g, "¦").replace(/\s+/g, " ").trim();
  s = s.replace(/^[-~]+/, "").trim();
  if ([...s].length > max) s = [...s].slice(0, max - 1).join("") + "…";
  return s;
}

// Значение параметра в кавычках.
export function q(v) {
  return `"${clean(v, 400).replace(/["\\]/g, "\\$&")}"`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tryStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fmtTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fmtAgo(ms, lang = "ru") {
  const m = Math.max(0, Math.round(ms / 60_000));
  const en = lang === "en";
  if (m < 60) return en ? `${m} min ago` : `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return en ? `${h} h ago` : `${h} ч назад`;
  return en ? `${Math.round(h / 24)} d ago` : `${Math.round(h / 24)} дн назад`;
}
export function dateStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
const stampLabel = (s) => `${s.slice(6, 8)}.${s.slice(4, 6)}`;

function run(file, args, { timeoutMs = 2000, env } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env }, (err, stdout) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : -1) : 0, stdout: String(stdout || ""), error: err ? String(err.code || err.message) : null });
    });
  });
}

// Двойник для тестов или системная программа.
function bin(name, system) {
  const dir = process.env.AGENTHUB_TEST_BIN_DIR;
  if (dir && existsSync(join(dir, name))) return join(dir, name);
  return system;
}

// ---------- конфигурация раннера ----------

// → { ok, stateDir, start, usage, windowHours, maxWaitMin, projects:[{id, title, enabled, worktree, unityDir}], problem? }
// problem — код (переводит render): "not-object" | "no-projects" | "project-no-id".
// researchSupported — раннер умеет исследование (research в COMMANDS night-run.mjs). Порча режима (enabled не bool,
// research не объект, пустой projects…) не роняет остальное: state_dir и расписание нужны, чтобы видеть идущую ночь;
// тогда ok:true, mode:null и modeProblem — код порчи (collect кладёт его в broken).
export function parseRunnerConfig(raw, home = homedir(), { researchSupported = true } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problem: "not-object" };
  const stateDir = expand(typeof raw.state_dir === "string" ? raw.state_dir : "~/.claude/task-runs/night", home);
  const start = typeof raw.schedule?.start === "string" && /^\d{1,2}:\d{2}$/.test(raw.schedule.start) ? raw.schedule.start : "04:30";
  const usage = { ...USAGE_DEFAULTS, ...(raw.usage && typeof raw.usage === "object" ? raw.usage : {}) };
  const windowHours = Number.isFinite(raw.schedule?.window_hours) && raw.schedule.window_hours > 0 ? raw.schedule.window_hours : 5;
  // сколько раннер ждёт сброса недели, упёршейся в порог, вместо пропуска ночи (decideStart, schedule.mjs)
  const maxWaitMin = Number.isFinite(raw.schedule?.max_wait_for_reset_min) && raw.schedule.max_wait_for_reset_min >= 0 ? raw.schedule.max_wait_for_reset_min : MAX_WAIT_DEFAULT_MIN;
  let list = raw.projects;
  if (list === undefined && typeof raw.worktree === "string") {
    // конфиг v1: один проект PerfectWar (night-runner/lib/config.mjs, upgradeV1)
    list = [{ id: "perfectwar", worktree: raw.worktree, profile: { type: "unity", project_path: "Client/PerfectWar" } }];
  }
  if (!Array.isArray(list)) return { ok: false, problem: "no-projects" };
  const projects = [];
  for (const p of list) {
    if (!p || typeof p !== "object" || typeof p.id !== "string") return { ok: false, problem: "project-no-id" };
    const main = typeof p.main_checkout === "string" ? expand(p.main_checkout, home) : null;
    const worktree = typeof p.worktree === "string" ? expand(p.worktree, home) : main ? `${main}-night` : null;
    const unity = p.profile?.type === "unity" && typeof p.profile.project_path === "string";
    projects.push({
      id: p.id,
      title: typeof p.title === "string" && p.title ? p.title : p.id, // как в раннере: title ?? id
      enabled: p.enabled !== false,
      worktree,
      unityDir: unity && worktree ? join(worktree, p.profile.project_path) : null,
    });
  }
  // режим ночи — как его поймёт раннер (проекты enabled, research.enabled); research не объект — конфиг не пройдёт проверку раннера
  const m = modeOf(raw, { researchSupported });
  const v1 = raw.schema === undefined && raw.projects === undefined;
  const rc = raw.research && typeof raw.research === "object" && !Array.isArray(raw.research) && !v1 ? raw.research : {};
  // как researchProblems раннера: минуты — числа от 1 до 300 (дробные тоже), порог — процент от 1 до 100
  const num = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? v : d);
  const research = {
    enabled: m.ok && m.research,
    supported: researchSupported,
    reserveMin: num(rc.synthesis_reserve_min, 1, 300, RESEARCH_DEFAULTS.synthesis_reserve_min),
    agentMin: num(rc.min_agent_min, 1, 300, RESEARCH_DEFAULTS.min_agent_min),
    stopPct: num(rc.stop_seven_day_pct, 1, 100, RESEARCH_DEFAULTS.stop_seven_day_pct),
  };
  return { ok: true, stateDir, start, usage, windowHours, maxWaitMin, projects, mode: m.ok ? m.mode : null, modeProblem: m.ok ? null : m.problem, research };
}

// Поддерживает ли раннер команду: только по списку COMMANDS в night-run.mjs (запускать раннер ради детекта нельзя:
// неизвестная команда у него не ошибка разбора, а риск запустить ночь).
export function runnerCommands(source) {
  const m = /const\s+COMMANDS\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!m) return [];
  return [...m[1].matchAll(/["'`]([\w-]+)["'`]/g)].map((x) => x[1]);
}

// Умеет ли раннер исследование: research в COMMANDS (раннер до фичи — нет). null — night-run.mjs не прочитан.
export function researchSupport(commands) {
  return commands.length ? commands.includes("research") : null;
}

// Объявленный в правах плагина config.json раннера — только его плагин и правит.
export const DECLARED_CONFIG = "~/Projects/IT/night-runner/config.json";

// `--config <путь>` в ProgramArguments задания launchd (night-runner/lib/platform/darwin.mjs, render). → путь | null
export function launchdConfigArg(home = homedir()) {
  let text;
  try {
    text = readFileSync(join(home, "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`), "utf8");
  } catch {
    return null;
  }
  const arr = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text);
  if (!arr) return null;
  const xml = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const args = [...arr[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => xml(m[1]));
  const i = args.indexOf("--config");
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// Где лежит config.json, который читает плановая ночь, и можно ли его править. → { scheduled: путь|null, elsewhere }
//   scheduled — задание launchd запускает раннер с другим --config: плановая ночь читает не этот файл;
//   elsewhere — плагин настроен на другой runnerDir: путь вне объявленного права fsWrite.
export function configWhere(cfgPath, home = homedir()) {
  const same = (a, b) => {
    if (a === b) return true;
    try {
      return realpathSync(a) === realpathSync(b);
    } catch {
      return false;
    }
  };
  const sched = launchdConfigArg(home);
  return { scheduled: sched && !same(expand(sched, home), cfgPath) ? sched : null, elsewhere: cfgPath !== expand(DECLARED_CONFIG, home) };
}

// ---------- процессы ----------

// `ps -axww -o pid=,ppid=,command=` → [{pid, ppid, cmd}]
export function parsePs(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] });
  }
  return out;
}

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slashes = (t) => t.replaceAll("\\", "/");
const BATCH = /(?:^|\s)-batchmode(?=\s|$)/i;

// Как night-runner/lib/profiles/unity.mjs: -projectPath/-projectpath, путь и его realpath, без учёта регистра.
export function unityOnProject(procs, projectDir) {
  const paths = new Set([slashes(projectDir)]);
  try {
    paths.add(slashes(realpathSync(projectDir)));
  } catch {}
  const re = new RegExp(`(?:^|\\s)-projectpath\\s+["']?(?:${[...paths].map(escapeRe).join("|")})/?(?=["'\\s]|$)`, "i");
  return procs.filter((p) => re.test(slashes(p.cmd))).map((p) => ({ pid: p.pid, ppid: p.ppid, batch: BATCH.test(p.cmd) }));
}

// Живой GUI-редактор на night-worktree — блокер ночи (preflight профиля unity).
export function liveEditor(procs, projectDir) {
  return unityOnProject(procs, projectDir).find((p) => !p.batch)?.pid ?? null;
}

// ---------- файлы state_dir ----------

// Подкоманда раннера из командной строки держателя замка: `node …/night-run.mjs research --x` → "research".
// Нет подкоманды → null.
export function holderSubcommand(cmd) {
  const words = String(cmd || "").trim().split(/\s+/);
  const i = words.findIndex((w) => /(^|\/)night-run\.mjs$/.test(w));
  if (i < 0) return null;
  // как parseFlags раннера: значение флага со значением пропускается, первое слово из COMMANDS — подкоманда
  for (let k = i + 1; k < words.length; k++) {
    const w = words[k];
    if (VALUE_FLAGS.has(w)) k++;
    else if (w.startsWith("-")) continue;
    else return RUNNER_SUBCOMMANDS.includes(w) ? w : /^[a-z][\w-]{0,31}$/.test(w) ? w : null;
  }
  return null;
}

// Замок держит именно ночь: command в замке — null (до патча этапа 1 у ночи его нет) или "run", и подкоманда
// держателя — run (или её нет). research, setup, migrate-state, post тоже берут замок — это не ночь.
// Та же логика — в действии stop (actionStop).
export function isNightLock(command, subcommand) {
  return (command === null || command === undefined || command === "run") && (subcommand === null || subcommand === undefined || subcommand === "run");
}

// Последний сегмент ссылки задачи как её id (ClickUp …/t/<id>, GitHub …/issues/<n>), если он SAFE_ID.
export function taskIdFromUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  const seg = url.replace(/[?#].*$/, "").split("/").filter(Boolean).pop();
  return seg && SAFE_ID.test(seg) ? seg : null;
}

// night.lock → { pid, startedAt, command? } | null (нет файла) | { broken: true }
export function readLock(stateDir) {
  const path = join(stateDir, "night.lock");
  if (!existsSync(path)) return null;
  try {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    if (Number.isInteger(lock?.pid) && lock.pid > 0 && typeof lock.startedAt === "string") {
      return { pid: lock.pid, startedAt: lock.startedAt, command: typeof lock.command === "string" ? lock.command : null };
    }
  } catch {}
  return { broken: true };
}

export function readTamper(stateDir) {
  const path = join(stateDir, TAMPER_FILE);
  if (!existsSync(path)) return null;
  try {
    return { path, text: clean(readFileSync(path, "utf8").split("\n")[0], 160) };
  } catch {
    return { path, text: null };
  }
}

// Сводка YYYYMMDD.md: прогоны одной даты разделены `---`; берём последний. → {ok, date, range, stop, tasks, prs} | {ok:false}
export function parseSummary(text) {
  const blocks = String(text).split(/\n---\n\n(?=# )/);
  const last = blocks[blocks.length - 1];
  const lines = last.split("\n");
  const m = /^# Ночной прогон (\d{8})\s*$/.exec(lines[0] || "");
  if (!m) return { ok: false };
  const head = (lines[2] || "").split(" · ");
  const out = { ok: true, date: m[1], range: null, stop: null, tasks: null, prs: null, quota: null };
  for (const part of head) {
    let x;
    if ((x = /^(\d{2}:\d{2})–(\d{2}:\d{2}|…)$/.exec(part))) out.range = `${x[1]}–${x[2]}`;
    else if ((x = /^остановка: (.*)$/.exec(part))) out.stop = clean(x[1], 200);
    else if ((x = /^задач (\d+)$/.exec(part))) out.tasks = Number(x[1]);
    else if ((x = /^PR (\d+)$/.exec(part))) out.prs = Number(x[1]);
    else if (/^квота/.test(part)) {
      out.quota = clean(part, 80);
      out.nightQuota = parseNightQuota(part);
    }
  }
  if (out.tasks === null || out.stop === null) return { ok: false };
  return out;
}

// Часть «квота: …» сводки ночи (night-runner/lib/report.mjs, quotaText) → квота на старте ночи, которой раннер
// фиксирует бюджет (trackUsage: state.start). → { startPct, budgetPct, lastNight, fiveHour } | null
//   «квота: неделя 40% → 42%, бюджет ночи 4.3 п. п. недели[ — неделя сбрасывается до следующей ночи, …]»
//   «квота 5ч 10% → 30%, неделя 44%» — ночь в 5-часовом окне, бюджета недели нет
export function parseNightQuota(part) {
  const t = String(part);
  if (/^квота 5ч /.test(t)) return { startPct: null, budgetPct: null, lastNight: false, fiveHour: true };
  const m = /^квота: неделя (\d+(?:\.\d+)?)% → /.exec(t);
  if (!m) return null;
  const b = /бюджет ночи (\d+(?:\.\d+)?) п\. п\./.exec(t);
  return { startPct: Number(m[1]), budgetPct: b ? Number(b[1]) : null, lastNight: /неделя сбрасывается до следующей ночи/.test(t), fiveHour: false };
}

// План dry-run: пункты «**В плане:**» по секциям проектов. → {ok, sections:[{title, tasks:[{name,url}]}], skipped}
export function parseDryPlan(text) {
  const blocks = String(text).split(/\n---\n\n(?=# )/);
  const last = blocks[blocks.length - 1];
  if (!/^# Ночной прогон \d{8}/.test(last)) return { ok: false };
  const sections = [];
  let cur = null;
  let mode = null;
  let skipped = 0;
  for (const line of last.split("\n")) {
    if (line.startsWith("## ")) {
      cur = { title: clean(line.slice(3).split(" · ")[0], 60), tasks: [] };
      sections.push(cur);
      mode = null;
    } else if (/^\*\*В плане:\*\*/.test(line)) mode = "plan";
    else if (/^\*\*Пропущено:\*\*/.test(line)) mode = "skip";
    else if (line.startsWith("- ") && cur && mode === "plan") {
      const t = /^- \[(.*)\]\(([^)\s]*)\)/.exec(line);
      if (t) cur.tasks.push({ name: clean(t[1], 90), url: t[2] });
    } else if (line.startsWith("- ") && cur && mode === "skip") skipped++;
    else if (!line.startsWith("  ")) mode = null; // пустая строка или новый блок закрывают список
  }
  return { ok: true, sections, skipped };
}

// Последние n сводок (без .dry). → [{stamp, path, mtimeMs}]
export function listSummaries(stateDir, { dry = false, n = 7 } = {}) {
  let names = [];
  try {
    names = readdirSync(stateDir);
  } catch {
    return [];
  }
  const re = dry ? /^(\d{8})\.dry\.md$/ : /^(\d{8})\.md$/;
  return names
    .map((f) => re.exec(f))
    .filter(Boolean)
    .map((m) => ({ stamp: m[1], path: join(stateDir, m[0]) }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1))
    .slice(0, n)
    .map((s) => ({ ...s, mtimeMs: tryStat(s.path)?.mtimeMs ?? 0 }));
}

// Маркеры попыток: держатся — без retries (park/published) или retries ≥ 3; иначе повтор n/3.
export function readAttempts(stateDir, projectId) {
  const dir = join(stateDir, "projects", projectId, "attempts");
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { held: [], retry: [], newestMs: 0, broken: 0 };
  }
  const held = [];
  const retry = [];
  let newestMs = 0;
  let broken = 0;
  for (const f of names.sort()) {
    const path = join(dir, f);
    let m;
    try {
      m = readJson(path);
    } catch {
      broken++;
      continue;
    }
    if (!m || typeof m !== "object" || typeof m.outcome !== "string") {
      broken++;
      continue;
    }
    newestMs = Math.max(newestMs, tryStat(path)?.mtimeMs ?? 0);
    const item = { project: projectId, id: basename(f, ".json"), outcome: clean(m.outcome, 80), date: typeof m.date === "string" ? m.date : null, retries: Number.isInteger(m.retries) ? m.retries : null, draft: Boolean(m.questions?.draft) };
    if (item.retries === null || item.retries >= MAX_RETRIES) held.push(item);
    else retry.push(item);
  }
  return { held, retry, newestMs, broken };
}

// Последние 64 КБ файла.
function tail(path, bytes = 64 * 1024) {
  const st = tryStat(path);
  if (!st) return "";
  const size = Math.min(st.size, bytes);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, st.size - size);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

// Текущая задача идущей ночи — по night.log последнего прогона: «задача X: старт» без итоговой строки
// «проект P, задача X: …». Из лога берётся только id задачи.
export function currentTaskFromLog(text) {
  let current = null;
  for (const line of String(text).split("\n")) {
    let m;
    if ((m = /^\S+ задача (\S+): старт(?=[,\s]|$)/.exec(line))) current = m[1];
    else if ((m = /^\S+ проект \S+, задача (\S+?): /.exec(line)) && m[1] === current) current = null;
  }
  return current;
}

function latestRunLog(stateDir, nowMs) {
  for (const stamp of [dateStamp(nowMs), dateStamp(nowMs - DAY_MS)]) {
    const dir = join(stateDir, stamp);
    let runs = [];
    try {
      // только прогоны run: каталог ручного исследования — «HHMMSS-research», его ищет researchRunLog
      runs = readdirSync(dir).filter((d) => /^\d{6}$/.test(d)).sort();
    } catch {
      continue;
    }
    for (const r of runs.reverse()) {
      const log = join(dir, r, "night.log");
      if (existsSync(log)) return log;
    }
  }
  return null;
}

// Есть ли каталог прогона run, заведённый перед замком: state_dir/<YYYYMMDD>/<HHMMSS>/night.log (research — с
// суффиксом «-research», setup и migrate-state каталога не заводят). Раннер заводит его до nightLock, а тот ждёт
// чужой замок до минуты — каталог не позже startedAt и не раньше чем за 5 мин до него.
export function hasRunDir(stateDir, startedAt) {
  const at = Date.parse(startedAt || "");
  if (!Number.isFinite(at)) return false;
  for (const stamp of new Set([dateStamp(at), dateStamp(at - 5 * MIN_MS)])) {
    let runs = [];
    try {
      runs = readdirSync(join(stateDir, stamp)).filter((d) => /^\d{6}$/.test(d));
    } catch {
      continue;
    }
    for (const r of runs) {
      const ms = runDirMs(stamp, r);
      if (ms <= at + 1000 && at - ms <= 5 * MIN_MS && existsSync(join(stateDir, stamp, r, "night.log"))) return true;
    }
  }
  return false;
}

// Время каталога прогона (местное): <YYYYMMDD>/<HHMMSS>[-research].
function runDirMs(stamp, r) {
  return new Date(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)), Number(r.slice(0, 2)), Number(r.slice(2, 4)), Number(r.slice(4, 6))).getTime();
}

// ---------- исследование рынка ----------

// Каталог ручного исследования (`night-run.mjs research`): state_dir/<YYYYMMDD>/<HHMMSS>-research. Раннер заводит его
// сразу после замка (researchCommand: started — после nightLock), так что он не раньше startedAt замка (с точностью до
// секунды) и вскоре после него. night.log в нём появляется лишь с первой строкой лога — после сбора чартов (openLog
// только создаёт каталог): каталог без файла — это «собирает чарты», а не «лога нет». → { dir, log | null } | null
export function researchRunLog(stateDir, startedAt) {
  const at = Date.parse(startedAt || "");
  if (!Number.isFinite(at)) return null;
  let best = null;
  for (const stamp of new Set([dateStamp(at), dateStamp(at + 10 * MIN_MS)])) {
    let runs = [];
    try {
      runs = readdirSync(join(stateDir, stamp)).filter((d) => /^\d{6}-research$/.test(d));
    } catch {
      continue;
    }
    for (const r of runs) {
      const d = runDirMs(stamp, r) - at;
      const dir = join(stateDir, stamp, r);
      if (d >= -60_000 && d <= 10 * MIN_MS && isDir(dir) && (!best || Math.abs(d) < best.d)) best = { d: Math.abs(d), dir };
    }
  }
  if (!best) return null;
  const log = join(best.dir, "night.log");
  return { dir: best.dir, log: existsSync(log) ? log : null };
}

// Ход фазы исследования по night.log (night-runner/lib/research/index.mjs, log; строки «<ISO> исследование: …»):
//   «агент N — <тема> (до M мин)» — агент стартовал; «<тема> — находка» или «<тема> — <причина>» — отработал;
//   «чартов N, игр M» — чарты собраны; «отчёт <путь>» — отчёт готов; «не запускалось — <почему>» — фазы не было.
// Агенту засчитывается итог только по теме уже стартовавшего агента — чужие строки «… — …» не в счёт.
// → { started, firstAt, skipped, charts, agentsStarted, agentsDone, findings, report }
export function parseResearchLog(text) {
  const out = { started: false, firstAt: null, skipped: null, charts: false, agentsStarted: 0, agentsDone: 0, findings: 0, report: null };
  const pending = [];
  for (const line of String(text).split("\n")) {
    const m = /^(\S+) исследование: (.*)$/.exec(line);
    if (!m) continue;
    const rest = m[2];
    let x;
    if ((x = /^не запускалось — (.*)$/.exec(rest))) {
      out.skipped = clean(x[1], 120);
      continue;
    }
    if (!out.started) {
      out.started = true;
      const at = Date.parse(m[1]);
      out.firstAt = Number.isFinite(at) ? at : null;
    }
    if (/^чартов \d+/.test(rest)) out.charts = true;
    else if ((x = /^агент \d+ — (.*) \(до \d+ мин\)$/.exec(rest))) {
      out.agentsStarted++;
      pending.push(x[1]);
    } else if ((x = /^отчёт (\S.*)$/.exec(rest))) out.report = x[1];
    else {
      const k = pending.findIndex((t) => rest.startsWith(`${t} — `));
      if (k >= 0) {
        out.agentsDone++;
        if (rest.slice(pending[k].length + 3) === "находка") out.findings++;
        pending.splice(k, 1);
      }
    }
  }
  return out;
}

// Длительность ручного исследования из командной строки держателя замка (`research --minutes N`); нет — 60 (умолчание раннера).
// Замок держится дольше окна на RESEARCH_TAIL_MS (картинки и HTML отчёта после дедлайна).
export function holderMinutes(cmd) {
  const m = /(?:^|\s)--minutes\s+(\d{1,3})(?=\s|$)/.exec(String(cmd || ""));
  return m ? Number(m[1]) : RESEARCH_DEFAULT_MIN;
}

const FINDINGS_MAX_BYTES = 16 * 1024 * 1024;
const REPORT_FRESH_MS = 60_000;

// Последний отчёт исследования: свежий каталог research/<YYYYMMDD>-<HHMMSS>[-research] с report.html. Из
// findings.json — только дата (meta.date) и число находок; идеи хаб не показывает. Открыть — research/latest.html
// (копия последнего отчёта, раннер пишет её следом), нет её — report.html прогона; лента — research/index.html.
// latest.html старше report.html этого прогона (раннер не смог его обновить) — открывается report.html прогона.
// findings.json пишется сразу после report.html: пока report.html свежий (REPORT_FRESH_MS), его отсутствие или обрыв —
// «ещё дописывается», а не порча. → { dir, date, manual, findings: n|null, broken, pending, open, feed } | null
export function readLastReport(stateDir, nowMs = Date.now()) {
  const root = join(stateDir, "research");
  let dirs = [];
  try {
    dirs = readdirSync(root).filter((d) => /^\d{8}-\d{6}(?:-research)?$/.test(d)).sort().reverse();
  } catch {
    return null;
  }
  for (const d of dirs) {
    const report = join(root, d, "report.html");
    const rst = tryStat(report);
    if (!rst?.isFile()) continue;
    let findings = null;
    let broken = false;
    let date = d.slice(0, 8);
    const fj = join(root, d, "findings.json");
    const st = tryStat(fj);
    if (st && st.size <= FINDINGS_MAX_BYTES) {
      try {
        const j = readJson(fj);
        if (Array.isArray(j?.findings)) findings = j.findings.length;
        else broken = true;
        if (typeof j?.meta?.date === "string" && /^\d{8}$/.test(j.meta.date)) date = j.meta.date;
      } catch {
        broken = true;
      }
    } else broken = true;
    const pending = broken && nowMs - rst.mtimeMs < REPORT_FRESH_MS;
    if (pending) broken = false;
    const latest = join(root, "latest.html");
    const lst = tryStat(latest);
    const feed = join(root, "index.html");
    const open = lst?.isFile() && lst.mtimeMs >= rst.mtimeMs ? latest : report;
    return { dir: d, date, manual: d.endsWith("-research"), findings, broken, pending, open, feed: tryStat(feed)?.isFile() ? feed : null };
  }
  return null;
}

// ---------- квота и питание ----------

export function weeklyPct(usageJson) {
  return weeklyRow(usageJson)?.percent ?? null;
}

// Строка недели из кэша хаба → { percent, resetsMs } | null. С nowMs строка, чей сброс уже прошёл, не в счёт: служба
// usage при истёкшем токене или без сети оставляет прежние строки, и после сброса недели их процент ничего не значит.
export function weeklyRow(usageJson, nowMs = null) {
  const rows = Array.isArray(usageJson?.rows) ? usageJson.rows : [];
  const row = rows.find((r) => r && r.kind === "weekly_all" && typeof r.percent === "number" && Number.isFinite(r.percent));
  if (!row) return null;
  const resetsMs = typeof row.resets_at === "string" ? Date.parse(row.resets_at) : NaN;
  if (nowMs !== null && Number.isFinite(resetsMs) && resetsMs <= nowMs) return null;
  return { percent: row.percent, resetsMs: Number.isFinite(resetsMs) ? resetsMs : null };
}

// Есть ли 5-часовое окно (строка session): с ним раннер ограничивает ночь окном, а не бюджетом недели.
export function hasFiveHour(usageJson) {
  return (Array.isArray(usageJson?.rows) ? usageJson.rows : []).some((r) => r && (r.kind === "session" || r.group === "session") && typeof r.percent === "number");
}

// Бюджет ночи — формула раннера (night-runner/lib/schedule.mjs, nightBudget): доля недели на ночь
// (night_share_pct / 7), но не больше остатка до stop_seven_day_pct; ночь, после которой следующая начнётся уже
// у сброса (до сброса меньше суток и окна ночи), — последняя: берёт весь остаток до потолка.
// atMs — момент старта ночи. → { pct, stopAt, lastNight }
export function nightBudget(weekPct, resetsMs, atMs, usageCfg, windowHours = 5) {
  const room = Math.max(0, usageCfg.stop_seven_day_pct - weekPct);
  const lastNight = resetsMs !== null && resetsMs !== undefined && resetsMs - atMs < DAY_MS + windowHours * HOUR_MS;
  const pct = lastNight ? room : Math.min(usageCfg.night_share_pct / WEEK_NIGHTS, room);
  return { pct, stopAt: weekPct + pct, lastNight };
}

// Кэш квоты хаба (AGENTHUB_USAGE_FILE). → { ok:true, week:{percent, resetsMs}|null, rolled, rolledAt, fiveHour, ageMs, error }
// (week = null и rolled — неделя уже сброшена, а свежих строк нет)
// | { ok:false, why: "no-env" | "no-file" | "broken" }
export function readQuota(file, nowMs) {
  if (!file) return { ok: false, why: "no-env" };
  let j;
  try {
    j = readJson(file);
  } catch (e) {
    return { ok: false, why: e.code === "ENOENT" ? "no-file" : "broken" };
  }
  if (!j || typeof j !== "object" || Array.isArray(j) || (j.rows !== undefined && !Array.isArray(j.rows))) return { ok: false, why: "broken" };
  const fetchedMs = typeof j.fetched_at === "number" ? j.fetched_at * 1000 : null;
  const week = weeklyRow(j, nowMs);
  const any = weeklyRow(j);
  const error = typeof j.error === "string" && /^[a-z0-9-]{1,40}$/.test(j.error) ? j.error : typeof j.error === "string" ? "other" : null;
  return { ok: true, week, rolled: !week && Boolean(any), rolledAt: !week && any ? any.resetsMs : null, fiveHour: hasFiveHour(j), ageMs: fetchedMs === null ? null : nowMs - fetchedMs, error };
}

export function parsePower(text) {
  if (text.includes("AC Power")) return true;
  if (text.includes("Battery Power")) return false;
  return null;
}

// Время ближайшего старта ночи (локальное): тот же час по часам завтра, а не +24 ч — в день перехода на летнее
// или зимнее время launchd стартует по часам (StartCalendarInterval).
export function nextStart(start, nowMs) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(nowMs);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= nowMs) {
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

// Неделя, упёршаяся в порог пропуска, к старту ночи — как decideStart раннера (night-runner/lib/schedule.mjs):
// сброс не позже старта — к старту недели уже нет (раннер читает квоту заново); сброс не позже
// max_wait_for_reset_min после старта — ночь подождёт его, а не пропустится. → "reset" | "wait" | "skip" | null
// (null — неделя ниже порога или неизвестна).
export function weekAtStart(week, startMs, usageCfg, maxWaitMin = MAX_WAIT_DEFAULT_MIN) {
  if (!week || !Number.isFinite(week.percent)) return null;
  if (Number.isFinite(week.resetsMs) && week.resetsMs <= startMs) return "reset";
  if (week.percent < usageCfg.skip_seven_day_pct) return null;
  if (Number.isFinite(week.resetsMs) && week.resetsMs - startMs <= maxWaitMin * MIN_MS) return "wait";
  return "skip";
}

// ---------- режим команд (после этапа 1) ----------

// Ожидаемая форма `status --json` (этап 1): {running, lock:{pid,startedAt,command,alive?}|null, task:{id,project}|null,
// tamper: string|null, crashed?: bool, blockers:[{id,text}]} (упавший раннер — crashed=true или блокер
// с id runner-crashed). `queue --json`: {as_of, plan:{as_of, sections:[{project,
// tasks:[{id,name,url}]}]}, held:[{project,id,outcome,date,retries}]}. Другая форма → файловый режим.
export function adaptStatus(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.blockers) || typeof j.running !== "boolean") return null;
  return {
    running: j.running,
    lock: j.lock && Number.isInteger(j.lock.pid) ? { pid: j.lock.pid, startedAt: String(j.lock.startedAt || ""), command: j.lock.command || null, ...(typeof j.lock.alive === "boolean" ? { alive: j.lock.alive } : {}) } : null,
    crashed: j.crashed === true || j.blockers.some((b) => b && b.id === "runner-crashed"),
    task: j.task && j.task.id ? String(j.task.id) : null,
    tamper: typeof j.tamper === "string" && j.tamper ? clean(j.tamper, 160) : null,
    blockers: j.blockers.filter((b) => b && typeof b.text === "string").map((b) => ({ id: /^[\w.:-]{1,60}$/.test(b.id || "") ? b.id : "blocker", text: clean(b.text, 160) })),
  };
}

export function adaptQueue(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.held) || !j.plan || !Array.isArray(j.plan.sections)) return null;
  const asOf = Date.parse(j.plan.as_of || j.as_of || "");
  return {
    planAsOf: Number.isFinite(asOf) ? asOf : null,
    sections: j.plan.sections.map((s) => ({
      title: clean(s.project, 60),
      tasks: (Array.isArray(s.tasks) ? s.tasks : []).map((t) => ({
      name: clean(t.name || t.id, 90),
      url: typeof t.url === "string" ? t.url : null,
      id: typeof t.id === "string" && SAFE_ID.test(t.id) ? t.id : null,
    })),
    })),
    held: j.held.filter((h) => h && h.id).map((h) => ({ project: clean(h.project, 40), id: clean(h.id, 40), outcome: clean(h.outcome, 80), date: h.date || null, retries: Number.isInteger(h.retries) ? h.retries : null })),
  };
}

async function runnerJson(runnerDir, args) {
  const node = bin("node", process.execPath);
  const r = await run(node, [join(runnerDir, "night-run.mjs"), ...args], { timeoutMs: 3500, env: { HOME: process.env.HOME || homedir(), PATH: process.env.PATH || "/usr/bin:/bin", LANG: "en_US.UTF-8" } });
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ---------- сбор фактов ----------

function pluginSettings() {
  const dir = process.env.AGENTHUB_PLUGIN_DATA_PATH;
  if (!dir) return {};
  try {
    const j = readJson(join(dir, "config.json"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export async function collect({ home = homedir(), nowMs = Date.now(), settings = pluginSettings(), usageFile = process.env.AGENTHUB_USAGE_FILE || null, dataDir = process.env.AGENTHUB_PLUGIN_DATA_PATH || null } = {}) {
  // mode — откуда данные (files | status); nightMode — режим ночи из config.json раннера (null — не прочитан)
  const facts = { nowMs, broken: [], notes: [], blockers: [], mode: "files", nightMode: null, researchLive: null, report: null, memory: null };
  const runnerDir = expand(settings.runnerDir || "~/Projects/IT/night-runner", home);
  facts.runnerDir = runnerDir;
  // конфиг раннера
  let cfg = { ok: true, stateDir: expand("~/.claude/task-runs/night", home), start: "04:30", usage: { ...USAGE_DEFAULTS }, windowHours: 5, maxWaitMin: MAX_WAIT_DEFAULT_MIN, projects: [] };
  facts.usage = cfg.usage;
  // команды раннера: этап 1 (status/queue) и умеет ли он исследование (research в COMMANDS; раннер в git HEAD — нет)
  let commands = [];
  try {
    commands = runnerCommands(readFileSync(join(runnerDir, "night-run.mjs"), "utf8"));
  } catch {}
  facts.researchSupported = researchSupport(commands);
  const cfgPath = join(runnerDir, "config.json");
  if (existsSync(cfgPath)) {
    let raw = null;
    try {
      raw = readJson(cfgPath);
    } catch {
      facts.broken.push({ k: "cfgUnparsed" });
    }
    if (raw) {
      const c = parseRunnerConfig(raw, home, { researchSupported: facts.researchSupported !== false });
      if (c.ok) {
        cfg = c;
        facts.nightMode = c.mode;
        if (c.modeProblem) facts.broken.push({ k: "cfg", problem: c.modeProblem });
      } else facts.broken.push({ k: "cfg", problem: c.problem });
    }
  } else facts.notes.push({ k: "noConfig" });
  facts.cfgPath = cfgPath;
  // Задание launchd с `--config <путь>` — плановая ночь читает другой файл: режим по нашему не определить, а писать
  // плагину можно только объявленный ~/Projects/IT/night-runner/config.json.
  facts.cfgWhere = configWhere(cfgPath, home);
  if (facts.cfgWhere.scheduled) facts.nightMode = null;
  facts.memory = readMemory(dataDir, cfgPath);
  if (settings.stateDir) cfg.stateDir = expand(settings.stateDir, home);
  facts.cfg = cfg;
  facts.usage = cfg.usage;
  const stateDir = cfg.stateDir;
  // квота — из кэша хаба (служба usage); без переменной — «недоступна»
  facts.quota = readQuota(usageFile, nowMs);
  if (facts.quota.ok && facts.quota.week) facts.week = facts.quota.week.percent;

  const [psOut, power, statusJ, queueJ] = await Promise.all([
    run(bin("ps", "/bin/ps"), ["-axww", "-o", "pid=,ppid=,command="]),
    run(bin("pmset", "/usr/bin/pmset"), ["-g", "batt"]),
    commands.includes("status") ? runnerJson(runnerDir, ["status", "--json"]) : null,
    commands.includes("queue") ? runnerJson(runnerDir, ["queue", "--json"]) : null,
  ]);
  const procs = psOut.code === 0 ? parsePs(psOut.stdout) : null;
  if (!procs) facts.broken.push({ k: "ps" });
  const status = statusJ ? adaptStatus(statusJ) : null;
  const queue = queueJ ? adaptQueue(queueJ) : null;
  if (commands.includes("status") && !status) facts.notes.push({ k: "badJson", cmd: "status" });
  if (commands.includes("queue") && !queue) facts.notes.push({ k: "badJson", cmd: "queue" });
  if (status) facts.mode = "status";

  // замок и текущая задача
  if (status) {
    facts.lock = status.lock;
    facts.running = status.running;
    facts.task = status.task;
    if (status.crashed) facts.crashed = { since: status.lock?.startedAt || null };
  } else {
    const lock = readLock(stateDir);
    if (lock?.broken) {
      facts.notes.push({ k: "badLock" });
      facts.lock = null;
    } else facts.lock = lock;
    facts.running = false;
    if (facts.lock && procs) {
      const holder = procs.find((p) => p.pid === facts.lock.pid && p.cmd.includes("night-run.mjs"));
      facts.lock.alive = Boolean(holder);
      facts.lock.holder = holder ? holderSubcommand(holder.cmd) : null;
      facts.running = Boolean(holder) && isNightLock(facts.lock.command, facts.lock.holder);
      // Держателя нет, а замок ночи остался — раннер упал посреди ночи. Без command в замке (до патча этапа 1)
      // замок берут и setup, migrate-state, research, а Ctrl+C на них оставляет его: ночь — только если рядом
      // каталог прогона run (state_dir/<дата>/<HHMMSS>/night.log), заведённый перед этим замком.
      if (!holder && isNightLock(facts.lock.command, null) && (facts.lock.command === "run" || hasRunDir(stateDir, facts.lock.startedAt))) {
        facts.crashed = { since: facts.lock.startedAt };
      }
      facts.lock.minutes = holder ? holderMinutes(holder.cmd) : null;
    }
    if (facts.running) {
      const log = latestRunLog(stateDir, nowMs);
      facts.task = log ? currentTaskFromLog(tail(log)) : null;
      // фаза исследования ночи — после задач, в том же night.log
      const r = log ? parseResearchLog(tail(log, 256 * 1024)) : null;
      if (r && r.started && !r.report) facts.researchLive = { kind: "night", sinceMs: r.firstAt, untilMs: null, logFound: true, ...r };
    }
  }
  // Замок держит исследование при тебе (`night-run.mjs research`): жив — идёт исследование, а не «раннер занят».
  // В файловом режиме живость — только по ps (не ответил — не утверждаем); в режиме status — по его lock.alive.
  if (facts.lock && !facts.lock.broken && !facts.running) {
    const alive = status ? facts.lock.alive !== false : facts.lock.alive === true;
    if (alive && (facts.lock.command === "research" || facts.lock.holder === "research")) {
      const since = Date.parse(facts.lock.startedAt || "");
      const run = researchRunLog(stateDir, facts.lock.startedAt);
      const r = parseResearchLog(run?.log ? tail(run.log, 256 * 1024) : "");
      const minutes = facts.lock.minutes ?? RESEARCH_DEFAULT_MIN;
      // «до ≈» — с хвостом после дедлайна: замок держится, пока раннер качает картинки и пишет отчёт
      facts.researchLive = { kind: "manual", sinceMs: Number.isFinite(since) ? since : null, untilMs: Number.isFinite(since) ? since + minutes * MIN_MS + RESEARCH_TAIL_MS : null, minutes, logFound: Boolean(run), ...r };
    }
  }
  facts.report = readLastReport(stateDir, nowMs);

  // блокеры
  const tamper = status ? (status.tamper ? { text: status.tamper, path: join(stateDir, TAMPER_FILE) } : null) : readTamper(stateDir);
  if (tamper) facts.blockers.push({ id: "tamper", event: "tamper", kind: "tamper", detail: tamper.text, text: `маркер подмены: ${tamper.text}`, path: tamper.path });
  if (status) {
    for (const b of status.blockers) if (b.id !== "tamper") facts.blockers.push({ id: b.id, event: b.id, text: b.text });
  } else {
    if (procs) {
      const unity = [];
      for (const p of cfg.projects.filter((x) => x.enabled && x.unityDir)) {
        const pid = liveEditor(procs, p.unityDir);
        if (pid) unity.push({ id: `unity:${p.id}`, event: `unity-open:${p.id}`, kind: "unity", project: p.id, where: basename(String(p.unityDir).replace(/\/+$/, "")) || p.id, pid, text: `на night-worktree ${p.id} открыт редактор Unity (pid ${pid})` });
      }
      // Unity — проверка проекта (preflightProject): проект выбывает из ночи, а с исследованием окно уходит ему
      // (night.mjs: «ни один проект не готов» останавливает ночь только без исследования). Тогда это не «ночь не
      // запустится» и не вечерний push, а пометка о задачах проекта.
      if (facts.nightMode === "tasks-research") {
        const all = unity.length === cfg.projects.filter((x) => x.enabled).length;
        for (const b of unity) Object.assign(b, { kind: "unity-note", soft: true, notice: true, event: null, all });
      }
      facts.blockers.push(...unity);
    }
    const ac = power.code === 0 ? parsePower(power.stdout) : null;
    if (ac === false) facts.blockers.push({ id: "power", event: "power", kind: "power", text: "не на питании от сети — ночь по расписанию не стартует", soft: true });
    const plist = join(home, "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    if (!existsSync(plist)) facts.blockers.push({ id: "launchd", event: "launchd-missing", kind: "launchd", text: "задание launchd снято — ночь не запустится сама" });
    const week = facts.quota.ok ? facts.quota.week : null;
    // как decideStart раннера: сброс до старта или вскоре после него (≤ max_wait_for_reset_min) — не пропуск
    const atStart = facts.running ? null : weekAtStart(week, nextStart(cfg.start, nowMs), cfg.usage, cfg.maxWaitMin);
    if (atStart === "wait") facts.weekWait = { untilMs: week.resetsMs + MIN_MS };
    if (atStart === "skip") {
      facts.blockers.push({ id: "quota", event: "quota-skip", kind: "quota", week: Math.round(week.percent), skip: cfg.usage.skip_seven_day_pct, text: `недельная квота ${Math.round(week.percent)}% ≥ ${cfg.usage.skip_seven_day_pct}% — ночь пропустит` });
    }
  }
  // Ночи нечего делать (ни проектов, ни исследования): условия запуска — питание, launchd, квота — ни на что не
  // влияют, а их push «Ночь не запустится» был бы шумом. Маркер подмены и блокеры раннера остаются.
  if (facts.nightMode === "idle") {
    facts.blockers = facts.blockers.filter((b) => !["power", "launchd", "quota"].includes(b.kind));
    facts.weekWait = null;
  }
  // Свой недельный порог исследования (research.stop_seven_day_pct, по умолчанию 70 — ниже, чем у задач): при неделе
  // ≥ порога researchGate не стартует ни одного агента. Неделя сбросится до старта — к старту она новая.
  if ((facts.nightMode === "research-only" || facts.nightMode === "tasks-research") && facts.quota.ok && facts.quota.week) {
    const week = facts.quota.week;
    const fresh = !facts.running && Number.isFinite(week.resetsMs) && week.resetsMs <= nextStart(cfg.start, nowMs);
    if (!fresh && week.percent >= cfg.research.stopPct) {
      facts.researchQuota = { week: Math.round(week.percent), stop: cfg.research.stopPct };
      if (facts.nightMode === "research-only" && !facts.running) {
        facts.blockers.push({ id: "research-quota", event: null, kind: "research-quota", soft: true, week: Math.round(week.percent), stop: cfg.research.stopPct, text: "исследование не начнётся: неделя выше порога исследования" });
      }
    }
  }
  // Ручное исследование ещё идёт к старту ночи — раннер не ждёт чужой замок (nightLock ждёт только post): ночь
  // пропустит запуск. Мягкий блокер без push.
  const live = facts.researchLive;
  if (live?.kind === "manual" && live.untilMs && facts.nightMode && facts.nightMode !== "idle" && live.untilMs >= nextStart(cfg.start, nowMs)) {
    facts.blockers.push({ id: "overlap", event: null, kind: "overlap", soft: true, untilMs: live.untilMs, text: "исследование при тебе ещё идёт к старту ночи — ночь пропустит запуск" });
  }

  // итоги ночей
  facts.summaries = [];
  for (const s of listSummaries(stateDir, { n: 7 })) {
    let parsed = { ok: false };
    try {
      parsed = parseSummary(readFileSync(s.path, "utf8"));
    } catch {}
    facts.summaries.push({ ...s, ...parsed });
  }
  if (facts.summaries.length && !facts.summaries[0].ok) facts.broken.push({ k: "summary", file: `${facts.summaries[0].stamp}.md` });
  // Идёт ночь — её бюджет раннер зафиксировал по квоте на старте (trackUsage: state.start), и он есть в сводке
  // ночи (дата — день старта по замку). Текущая неделя для бюджета идущей ночи не берётся.
  if (facts.running) {
    const startedMs = Date.parse(facts.lock?.startedAt || "");
    const stamp = Number.isFinite(startedMs) ? dateStamp(startedMs) : dateStamp(nowMs);
    const cur = facts.summaries.find((x) => x.ok && x.stamp === stamp);
    facts.nightStart = cur?.nightQuota ?? null;
  }
  // Сводка дня осталась «прогон не завершён», а живого замка нет — раннер упал (замок мог снять перезапуск).
  const today = facts.summaries.find((x) => x.ok && x.stamp === dateStamp(nowMs));
  if (!facts.crashed && today && /^прогон не завершён/.test(today.stop || "") && !(facts.lock && facts.lock.alive !== false)) {
    facts.crashed = { since: null, stamp: today.stamp };
  }

  // очередь
  if (queue) {
    facts.plan = { asOf: queue.planAsOf, sections: queue.sections, path: null };
    facts.held = queue.held.filter((h) => h.retries === null || h.retries >= MAX_RETRIES);
    facts.retry = queue.held.filter((h) => h.retries !== null && h.retries < MAX_RETRIES);
    facts.heldAsOf = queue.planAsOf;
  } else {
    const dry = listSummaries(stateDir, { dry: true, n: 1 })[0];
    facts.plan = null;
    if (dry) {
      let p = { ok: false };
      try {
        p = parseDryPlan(readFileSync(dry.path, "utf8"));
      } catch {}
      if (p.ok) {
        let stop = null;
        try {
          stop = parseSummary(readFileSync(dry.path, "utf8")).stop ?? null;
        } catch {}
        facts.plan = { asOf: dry.mtimeMs, stamp: dry.stamp, sections: p.sections, skipped: p.skipped, path: dry.path, stop };
      }
      else facts.broken.push({ k: "summary", file: `${dry.stamp}.dry.md` });
    }
    facts.held = [];
    facts.retry = [];
    facts.heldAsOf = 0;
    let broken = 0;
    for (const p of cfg.projects) {
      const a = readAttempts(stateDir, p.id);
      facts.held.push(...a.held);
      facts.retry.push(...a.retry);
      facts.heldAsOf = Math.max(facts.heldAsOf, a.newestMs);
      broken += a.broken;
    }
    if (broken) facts.notes.push({ k: "badMarkers", n: broken });
  }
  return facts;
}

// ---------- вывод ----------

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function fileEffect(path) {
  return path && !/\s/.test(path) ? ` effect=${q(`open.file ${path}`)}` : "";
}

// Язык — AGENTHUB_LANG (ru | en) от ядра; без переменной — ru.
export function envLang() {
  return process.env.AGENTHUB_LANG === "en" ? "en" : "ru";
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plEn = (n, one, other) => (n === 1 ? one : other);

export const T = {
  ru: {
    stamp: (s) => `${s.slice(6, 8)}.${s.slice(4, 6)}`,
    dt: (ms) => fmtDateTime(ms),
    blocker: (b, start) =>
      b.kind === "unity" ? `Unity открыт на ${b.where} — закройте до ${start}`
      : b.kind === "tamper" ? "Найден маркер подмены — ночь заблокирована до проверки"
      : b.kind === "power" ? "мак не на зарядке"
      : b.kind === "launchd" ? "снято задание launchd — включите его снова"
      : b.kind === "quota" ? `неделя ${b.week}% ≥ ${b.skip}% — ночь пропустит запуск`
      : b.kind === "overlap" ? T.ru.overlap(fmtTime(b.untilMs))
      : b.kind === "unity-note" ? `Unity открыт на ${b.where} — задачи проекта ${b.project} не пойдут${b.all ? ", ночь займётся исследованием" : ", остальное — как обычно"}`
      : b.kind === "research-quota" ? `исследование не начнётся: неделя ${b.week}% ≥ ${b.stop}% (research.stop_seven_day_pct)`
      : b.text,
    blockerDetail: (b) => (b.kind === "unity" || b.kind === "unity-note" ? `процесс Unity ${b.pid}` : b.kind === "tamper" ? b.detail ?? "файл маркера не читается" : null),
    running: (since, task) => `Ночь идёт${since ? ` с ${since}` : ""}${task ? ` · задача ${task}` : ""}`,
    crashed: "Ночь оборвалась (раннер упал) — откройте night.log",
    wontStart: (b) => `Ночь не запустится: ${b}`,
    mayNot: (b) => `Ночь может не стартовать: ${b}`,
    ready: (t) => `Ночь готова · старт в ${t}`,
    readyWait: (t) => `Ночь готова · старт после сброса недели, в ${t}`,
    tileRunning: "идёт",
    broken: "Не получается прочитать файлы раннера",
    brokenItem: (x) =>
      x.k === "cfgUnparsed" ? "config.json раннера не разобран"
      : x.k === "cfg" ? `config.json раннера: ${({ "not-object": "не объект", "no-projects": "нет списка projects", "project-no-id": "проект без id", "project-enabled": "enabled проекта — не true/false", "research-not-object": "research — не объект", "research-enabled": "research.enabled — не true/false", "projects-empty": "projects пуст — раннер требует непустой список", "research-unsupported": "ключ research, а этот раннер исследования не знает (его проверка отвергнет конфиг)" })[x.problem] || x.problem}`
      : x.k === "ps" ? "ps не ответил"
      : x.k === "summary" ? `сводка ${x.file}: незнакомая форма`
      : String(x.k ?? x),
    crashLine: (d) => `Раннер упал посреди ночи ${d} — разберите night.log`,
    stop: "Остановить ночь после текущей задачи",
    skipTask: (id) => `Пропустить задачу ${id}`,
    blockers: (n) => `Что мешает (${n})`,
    noBlockers: "Ничего не мешает",
    lockStale: (when) => `Ночь не идёт; остался старый замок от ${when} — раннер уберёт его сам`,
    lockHeld: (h, when) => `Раннер занят командой «${h}» с ${when}`,
    lockNight: (when, task) => `Ночь идёт с ${when}${task ? ` · задача ${task}` : ""}`,
    lockPid: (pid) => `процесс ${pid}`,
    noLock: (when) => `Следующий старт ${when}`,
    lastNight: (d, tasks, prs, stop) => `Последняя ночь ${d}: задач ${tasks}, PR ${prs} · ${stop}`,
    nightDone: (d) => `Итог ночи ${d} готов`,
    infra: (stop) => `Ночь остановлена: ${stop}`,
    history: "Последние ночи",
    stStart: "Следующий запуск",
    stNote: { running: "ночь идёт сейчас", crashed: "раннер упал", blocked: "не запустится", maybe: "может не стартовать", ready: "всё готово" },
    stPlanTitle: "План на ночь",
    stPlan: (n) => `${n} ${plural(n, "задача", "задачи", "задач")}`,
    stHeld: (n) => `отложено ${n}`,
    stNoHeld: "отложенных нет",
    stNoPlan: "плана пока нет",
    stWeek: "Квота недели",
    stWeekNote: (skip) => `при ≥ ${skip}% ночь пропустит запуск`,
    stWeekOff: "квота недоступна",
    stWeekIdle: "ночь её не тратит",
    budgetTitle: "Бюджет ночи",
    budgetNote: "доля недели",
    budget: (b, last) => `Ночь возьмёт не больше ${b} недели${last ? " — последняя ночь перед сбросом" : ""}`,
    budgetStop: (stop) => `Ночь остановится, когда неделя дойдёт до ${stop}`,
    budgetSkip: (w, n) => `Ночь пропустит запуск: неделя ${w} ≥ ${n}`,
    budgetWait: (w, n, t) => `Неделя ${w} ≥ ${n}: ночь подождёт её сброса до ${t} и возьмёт бюджет от новой недели`,
    budgetAfterReset: (when) => `Неделя сбросится до старта (${when}) — бюджет ночи раннер посчитает от новой недели`,
    budgetFive: "Есть 5-часовое окно — ночь ограничит себя им, а не бюджетом недели",
    budgetStale: (ago) => `квота обновлялась ${ago}`,
    budgetDefaults: "Пороги ночи — по умолчанию: настройки раннера не прочитаны",
    budgetFixed: (w) => `бюджет зафиксирован на старте ночи, при неделе ${w}`,
    budgetRunningUnknown: "Ночь идёт: бюджет раннер считает от квоты на старте ночи — в сводке ночи его пока нет",
    quotaNoWeek: (why) => `Квота недоступна: ${why} — бюджет ночи не посчитать`,
    quotaRolled: (when) => `неделя сброшена${when ? ` ${when}` : ""}, свежей квоты пока нет`,
    quotaWhy: (code) =>
      ({
        "no-token": "нет входа в Claude Code",
        "token-expired": "токен Claude Code истёк, хаб ждёт, пока его обновит Claude Code",
        "http-401": "Claude Code не пускает к квоте",
        "http-403": "нет доступа к квоте",
        "http-429": "Anthropic просит подождать",
        network: "нет связи с Anthropic",
        timeout: "Anthropic не ответил вовремя",
        "bad-response": "незнакомый ответ Anthropic",
      })[code] || (code ? `ошибка службы квоты ${code}` : "хаб ещё не получил квоту"),
    quotaOff: (why) => `Квота недоступна: ${why === "no-env" ? "хаб не передал кэш квоты (служба usage выключена или хаб старый)" : why === "no-file" ? "хаб ещё не загрузил квоту" : "кэш квоты хаба не разобран"} — бюджет ночи не посчитать`,
    stripNote: (tasks, prs) => `задач ${tasks} · PR ${prs}`,
    stripBad: "сводка не разобрана",
    detailsTitle: "Подробности",
    histLine: (d, range, tasks, prs, stop) => `${d}${range ? ` ${range}` : ""}: задач ${tasks}, PR ${prs} · ${stop}`,
    histBad: (d) => `${d}: сводка не разобрана`,
    plan: (n, asOf, stale, why) => `План на ночь (пробный прогон${asOf ? ` ${asOf}` : ""}): ${n} ${plural(n, "задача", "задачи", "задач")}${stale ? " — устарел" : ""}${why}`,
    planAsOf: (when, ago) => `от ${when}, ${ago}`,
    skipTonight: "Пропустить в ночи",
    runNow: "Запустить днём без пуша",
    filtered: (n) => `пропущено по фильтрам: ${n}`,
    noPlan: "Плана на ночь пока нет",
    held: (n, retry, asOf) => `Отложены: ${n}${retry ? ` · повторятся: ${retry}` : ""}${asOf ? ` (на ${asOf})` : ""}`,
    heldLine: (h, d) => `${h.id} · ${h.outcome}${d ? ` · ${d}` : ""}${h.draft ? " · вопросы не отправлены" : ""}`,
    retryLine: (h, max) => `${h.id} · повтор ${h.retries}/${max} · ${h.outcome}`,
    sourceTitle: "Откуда данные",
    source: (st) => (st ? "night-run.mjs status --json" : "файлы раннера (status --json ещё нет)"),
    // режим ночи и исследование рынка (0.5.0)
    modeLabel: { tasks: "Задачи", "tasks-research": "Задачи + исследование в остаток окна", "research-only": "Только исследование", idle: "Ночь ничего не делает" },
    modeShort: { tasks: "Задачи", "tasks-research": "Задачи + исследование", "research-only": "Только исследование" },
    modeHead: (m) => `Режим ночи: ${m}`,
    modeCaption: "Режим ночи",
    modeSwitch: "Переключить режим",
    modeSuffix: { tasks: "", "tasks-research": " · задачи + исследование", "research-only": " · только исследование", idle: "" },
    modeWhat: (mode, list, start) =>
      mode === "tasks" ? `ночью — задачи проектов: ${list}; исследование рынка выключено`
      : mode === "tasks-research" ? `ночью — задачи проектов: ${list}, в остаток окна — исследование рынка`
      : mode === "research-only" ? "задачи ночью не берутся (все проекты выключены), окно целиком — исследованию рынка"
      : `нет включённых проектов и исследование выключено — раннер в ${start} остановится с ошибкой «нет включённых проектов»`,
    modeBack: (list) => `вернуть задачи — снова включатся проекты: ${list}`,
    modeNoBack: "вернуть задачи из хаба нельзя: не запомнено, какие проекты были включены, — включите их в config.json раннера",
    modeUnknown: "Режим ночи не определён — config.json раннера не прочитан",
    idleTitle: "Ночь ничего не делает: нет включённых проектов, исследование выключено",
    tileOff: "выкл",
    tileResearch: "рынок",
    runningResearch: " · исследует рынок",
    researchNowTitle: (since, until) => `Идёт исследование рынка (вручную)${since ? ` с ${since}` : ""}${until ? ` до ≈${until}` : ""}`,
    stIdle: "ничего не делает",
    stResearchNow: "сейчас идёт исследование",
    stPlanResearch: "исследование",
    stNoTasks: "задачи не берутся",
    tasksTitle: "Задачи",
    tasksOff: (mode) => mode === "research-only" ? "Задачи ночью не берутся: все проекты выключены — режим «Только исследование»" : "Задачи ночью не берутся: нет включённых проектов",
    researchTitle: "Исследование рынка",
    resManual: (since, until) => `Идёт исследование (вручную)${since ? ` с ${since}` : ""}${until ? `, окно до ≈${until}` : ""}`,
    resNight: (since) => `Ночь исследует рынок${since ? ` с ${since}` : ""}`,
    resProgress: (r) => (!r.agentsStarted ? (r.charts ? "агенты ещё не стартовали" : "собирает чарты App Store") : `агентов отработало ${r.agentsDone}${r.agentsStarted > r.agentsDone ? `, в работе ${r.agentsStarted - r.agentsDone}` : ""}, находок ${r.findings}`),
    resNoLog: "night.log исследования не найден — сколько агентов отработало, не видно",
    resAfterTasks: "Исследование — после задач, в остаток окна ночи",
    resPlan: { tasks: "Ночью исследование выключено", "tasks-research": "Ночью — в остаток окна после задач", "research-only": "Ночью — всё окно", idle: "Ночью исследование выключено" },
    reportLine: (d, manual, n) => `Последний отчёт ${d}${manual ? " (вручную)" : ""}: ${n === null ? "находок —" : `находок ${n}`}`,
    reportBroken: "findings.json не разобран — число находок неизвестно",
    reportOpen: "Открыть отчёт",
    feedOpen: "Лента всех ночей",
    noReport: "Отчётов исследования пока нет",
    researchNow: "Исследовать сейчас",
    researchMin: (n) => `${n} мин`,
    researchBusy: "раннер занят — запуск, когда освободится",
    researchCost: "агенты Claude с веб-поиском на всё окно (квота)",
    overlap: (t) => `исследование при тебе идёт до ≈${t} — ночь пропустит запуск: замок занят`,
    readyNote: (t, note) => `Ночь готова · старт в ${t} · ${note}`,
    modeScheduled: (p) => `Задание launchd запускает раннер с --config ${p}: плановая ночь читает его, а не ~/Projects/IT/night-runner/config.json — режим ночи отсюда не определить и не переключить`,
    modeBlocked: (r) =>
      r === "night-lock" ? "сменить режим можно, когда раннер свободен (замок ночи не занят)"
      : r === "config-elsewhere" ? "переключать можно только ~/Projects/IT/night-runner/config.json — плагин настроен на другой каталог раннера"
      : r === "config-symlink" ? "config.json раннера — ссылка: переключение заменило бы её файлом, правьте его сами"
      : r === "config-hardlink" ? "у config.json раннера несколько жёстких ссылок: переключение разъединило бы их, правьте его сами"
      : r === "config-readonly" ? "config.json раннера закрыт от записи — переключение не будет его менять"
      : r === "no-runner-config" ? "config.json раннера не найден"
      : r,
    modeNoResearch: "этот раннер не умеет исследование (в night-run.mjs нет команды research) — режимы с исследованием недоступны",
    runnerUnread: "night-run.mjs раннера не прочитан — что он умеет, не видно: исследование отсюда не запустить",
    resUnsupported: "Этот раннер не умеет исследование рынка: в night-run.mjs нет команды research",
    resQuotaStop: (w, n, running) => (running ? `Агенты исследования больше не стартуют: неделя ${w} ≥ ${n}` : `Исследование не начнётся: неделя ${w} ≥ ${n} (research.stop_seven_day_pct)`),
    resCeiling: (c) => `Агенты исследования не стартуют после недели ${c}`,
    resCeilingWhy: (stop, budget) => `порог исследования ${stop}${budget ? `, остановка ночи по бюджету — ${budget}` : ""}: что раньше`,
    reportPending: "findings.json ещё дописывается — число находок появится через минуту",
    researchTooShort: (n) => `раннер примет окно не короче ${n} мин (synthesis_reserve_min + min_agent_min) — кнопок нет`,
    researchNoWindow: (t) => `до старта ночи в ${t} ни одно окно не успеет (с отчётом) — запуск сорвал бы ночь; исследуйте после неё`,
    researchSomeHidden: (t) => `окна, что не успеют до старта ночи в ${t}, скрыты: ночь не ждёт занятый замок`,
    pluginError: "Сбой плагина ночи",
    note: (x) =>
      x.k === "noConfig" ? "config.json раннера не найден — state_dir по умолчанию"
      : x.k === "badJson" ? `${x.cmd} --json: нет ответа или незнакомая форма — читаю файлы`
      : x.k === "badLock" ? "night.lock не разобран (раннер сочтёт его протухшим)"
      : x.k === "badMarkers" ? `маркеров попыток не разобрано: ${x.n}`
      : String(x.k ?? x),
  },
  en: {
    stamp: (s) => `${MON[Number(s.slice(4, 6)) - 1]} ${Number(s.slice(6, 8))}`,
    dt: (ms) => {
      const d = new Date(ms);
      return `${MON[d.getMonth()]} ${d.getDate()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    },
    blocker: (b, start) =>
      b.kind === "unity" ? `Unity is open on ${b.where} — close it before ${start}`
      : b.kind === "tamper" ? "Tamper marker found — night blocked until checked"
      : b.kind === "power" ? "Mac isn't plugged in"
      : b.kind === "launchd" ? "the launchd job was removed — turn it back on"
      : b.kind === "quota" ? `week at ${b.week}% ≥ ${b.skip}% — the night will skip`
      : b.kind === "overlap" ? T.en.overlap(fmtTime(b.untilMs))
      : b.kind === "unity-note" ? `Unity is open on ${b.where} — project ${b.project}'s tasks won't run${b.all ? ", the night goes to research" : ", the rest runs as usual"}`
      : b.kind === "research-quota" ? `research won't start: week at ${b.week}% ≥ ${b.stop}% (research.stop_seven_day_pct)`
      : b.text,
    blockerDetail: (b) => (b.kind === "unity" || b.kind === "unity-note" ? `Unity process ${b.pid}` : b.kind === "tamper" ? b.detail ?? "the marker file can't be read" : null),
    running: (since, task) => `Night running${since ? ` since ${since}` : ""}${task ? ` · task ${task}` : ""}`,
    crashed: "Night stopped (runner crashed) — open night.log",
    wontStart: (b) => `Night won't start: ${b}`,
    mayNot: (b) => `Night may not start: ${b}`,
    ready: (t) => `Night ready · starts at ${t}`,
    readyWait: (t) => `Night ready · starts after the weekly reset, at ${t}`,
    tileRunning: "running",
    broken: "Can't read runner files",
    brokenItem: (x) =>
      x.k === "cfgUnparsed" ? "the runner's config.json couldn't be parsed"
      : x.k === "cfg" ? `the runner's config.json: ${({ "not-object": "not an object", "no-projects": "no projects list", "project-no-id": "a project without an id", "project-enabled": "a project's enabled isn't true/false", "research-not-object": "research isn't an object", "research-enabled": "research.enabled isn't true/false", "projects-empty": "projects is empty — the runner needs a non-empty list", "research-unsupported": "a research key, but this runner doesn't know research (its check will reject the config)" })[x.problem] || x.problem}`
      : x.k === "ps" ? "ps didn't answer"
      : x.k === "summary" ? `summary ${x.file}: unknown format`
      : String(x.k ?? x),
    crashLine: (d) => `Runner crashed during the night of ${d} — check night.log`,
    stop: "Stop the night after the current task",
    skipTask: (id) => `Skip task ${id}`,
    blockers: (n) => `In the way (${n})`,
    noBlockers: "Nothing in the way",
    lockStale: (when) => `Not running; a stale lock from ${when} is left — the runner will clear it`,
    lockHeld: (h, when) => `Runner busy with "${h}" since ${when}`,
    lockNight: (when, task) => `Night running since ${when}${task ? ` · task ${task}` : ""}`,
    lockPid: (pid) => `process ${pid}`,
    noLock: (when) => `Next start ${when}`,
    lastNight: (d, tasks, prs, stop) => `Last night ${d}: ${tasks} ${plEn(tasks, "task", "tasks")}, ${prs} PR · ${stop}`,
    nightDone: (d) => `Night of ${d} finished`,
    infra: (stop) => `Night stopped: ${stop}`,
    history: "Recent nights",
    stStart: "Next start",
    stNote: { running: "running now", crashed: "runner crashed", blocked: "won't start", maybe: "may not start", ready: "all set" },
    stPlanTitle: "Tonight's plan",
    stPlan: (n) => `${n} ${plEn(n, "task", "tasks")}`,
    stHeld: (n) => `${n} on hold`,
    stNoHeld: "nothing on hold",
    stNoPlan: "no plan yet",
    stWeek: "Weekly quota",
    stWeekNote: (skip) => `at ≥ ${skip}% the night skips`,
    stWeekOff: "quota unavailable",
    stWeekIdle: "the night doesn't use it",
    budgetTitle: "Night budget",
    budgetNote: "share of the week",
    budget: (b, last) => `The night will use at most ${b} of the week${last ? " — last night before reset" : ""}`,
    budgetStop: (stop) => `The night stops once the week reaches ${stop}`,
    budgetSkip: (w, n) => `The night will skip: week at ${w} ≥ ${n}`,
    budgetWait: (w, n, t) => `Week at ${w} ≥ ${n}: the night waits for the reset until ${t} and takes its budget from the new week`,
    budgetAfterReset: (when) => `The week resets before the start (${when}) — the runner will set the night budget from the new week`,
    budgetFive: "There's a 5-hour window — the night limits itself by it, not by a weekly budget",
    budgetStale: (ago) => `quota updated ${ago}`,
    budgetDefaults: "Night thresholds are defaults: runner settings weren't read",
    budgetFixed: (w) => `budget fixed at the night's start, with the week at ${w}`,
    budgetRunningUnknown: "Night running: the runner sets its budget from the quota at the start — not in the night's summary yet",
    quotaNoWeek: (why) => `Quota unavailable: ${why} — no night budget`,
    quotaRolled: (when) => `the week reset${when ? ` ${when}` : ""}, no fresh quota yet`,
    quotaWhy: (code) =>
      ({
        "no-token": "not signed in to Claude Code",
        "token-expired": "the Claude Code token expired; the hub waits for Claude Code to refresh it",
        "http-401": "Claude Code isn't allowed to read quota",
        "http-403": "no access to quota",
        "http-429": "Anthropic asks to wait",
        network: "can't reach Anthropic",
        timeout: "Anthropic didn't answer in time",
        "bad-response": "unexpected answer from Anthropic",
      })[code] || (code ? `quota service error ${code}` : "the hub hasn't got the quota yet"),
    quotaOff: (why) => `Quota unavailable: ${why === "no-env" ? "the hub didn't pass its quota cache (usage service off or an older hub)" : why === "no-file" ? "the hub hasn't loaded the quota yet" : "the hub's quota cache couldn't be read"} — no night budget`,
    stripNote: (tasks, prs) => `${tasks} ${plEn(tasks, "task", "tasks")} · ${prs} PR`,
    stripBad: "summary unreadable",
    detailsTitle: "Details",
    histLine: (d, range, tasks, prs, stop) => `${d}${range ? ` ${range}` : ""}: ${tasks} ${plEn(tasks, "task", "tasks")}, ${prs} PR · ${stop}`,
    histBad: (d) => `${d}: summary couldn't be read`,
    plan: (n, asOf, stale, why) => `Tonight's plan (dry run${asOf ? ` ${asOf}` : ""}): ${n} ${plEn(n, "task", "tasks")}${stale ? " — out of date" : ""}${why}`,
    planAsOf: (when, ago) => `from ${when}, ${ago}`,
    skipTonight: "Skip tonight",
    runNow: "Run now without pushing",
    filtered: (n) => `skipped by filters: ${n}`,
    noPlan: "No plan for tonight yet",
    held: (n, retry, asOf) => `On hold: ${n}${retry ? ` · will retry: ${retry}` : ""}${asOf ? ` (as of ${asOf})` : ""}`,
    heldLine: (h, d) => `${h.id} · ${h.outcome}${d ? ` · ${d}` : ""}${h.draft ? " · questions not sent" : ""}`,
    retryLine: (h, max) => `${h.id} · retry ${h.retries}/${max} · ${h.outcome}`,
    sourceTitle: "Where the data comes from",
    source: (st) => (st ? "night-run.mjs status --json" : "runner files (no status --json yet)"),
    // night mode and market research (0.5.0)
    modeLabel: { tasks: "Tasks", "tasks-research": "Tasks + research in the rest of the window", "research-only": "Research only", idle: "Night does nothing" },
    modeShort: { tasks: "Tasks", "tasks-research": "Tasks + research", "research-only": "Research only" },
    modeHead: (m) => `Night mode: ${m}`,
    modeCaption: "Night mode",
    modeSwitch: "Switch mode",
    modeSuffix: { tasks: "", "tasks-research": " · tasks + research", "research-only": " · research only", idle: "" },
    modeWhat: (mode, list, start) =>
      mode === "tasks" ? `at night — tasks of projects: ${list}; market research is off`
      : mode === "tasks-research" ? `at night — tasks of projects: ${list}, the rest of the window goes to market research`
      : mode === "research-only" ? "no tasks at night (every project is off), the whole window goes to market research"
      : `no enabled projects and research is off — at ${start} the runner stops with "no enabled projects"`,
    modeBack: (list) => `back to tasks — these projects get turned on again: ${list}`,
    modeNoBack: "can't switch back to tasks from the hub: which projects were on isn't remembered — turn them on in the runner's config.json",
    modeUnknown: "Night mode unknown — the runner's config.json couldn't be read",
    idleTitle: "Night does nothing: no enabled projects, research is off",
    tileOff: "off",
    tileResearch: "market",
    runningResearch: " · researching the market",
    researchNowTitle: (since, until) => `Market research running (manual)${since ? ` since ${since}` : ""}${until ? ` until ≈${until}` : ""}`,
    stIdle: "does nothing",
    stResearchNow: "research running now",
    stPlanResearch: "research",
    stNoTasks: "no tasks taken",
    tasksTitle: "Tasks",
    tasksOff: (mode) => mode === "research-only" ? "No tasks at night: every project is off — Research only mode" : "No tasks at night: no enabled projects",
    researchTitle: "Market research",
    resManual: (since, until) => `Research running (manual)${since ? ` since ${since}` : ""}${until ? `, window until ≈${until}` : ""}`,
    resNight: (since) => `The night is researching the market${since ? ` since ${since}` : ""}`,
    resProgress: (r) => (!r.agentsStarted ? (r.charts ? "no agent started yet" : "collecting App Store charts") : `${r.agentsDone} ${plEn(r.agentsDone, "agent", "agents")} done${r.agentsStarted > r.agentsDone ? `, ${r.agentsStarted - r.agentsDone} running` : ""}, ${r.findings} ${plEn(r.findings, "finding", "findings")}`),
    resNoLog: "the research night.log wasn't found — can't tell how many agents finished",
    resAfterTasks: "Research comes after the tasks, in the rest of the night's window",
    resPlan: { tasks: "Research is off at night", "tasks-research": "At night — the rest of the window after tasks", "research-only": "At night — the whole window", idle: "Research is off at night" },
    reportLine: (d, manual, n) => `Last report ${d}${manual ? " (manual)" : ""}: ${n === null ? "findings —" : `${n} ${plEn(n, "finding", "findings")}`}`,
    reportBroken: "findings.json couldn't be read — the number of findings is unknown",
    reportOpen: "Open report",
    feedOpen: "All nights feed",
    noReport: "No research reports yet",
    researchNow: "Research now",
    researchMin: (n) => `${n} min`,
    researchBusy: "the runner is busy — start it once it's free",
    researchCost: "Claude agents with web search for the whole window (quota)",
    overlap: (t) => `manual research runs until ≈${t} — the night will skip its start: the lock is held`,
    readyNote: (t, note) => `Night ready · starts at ${t} · ${note}`,
    modeScheduled: (p) => `The launchd job runs the runner with --config ${p}: the scheduled night reads that, not ~/Projects/IT/night-runner/config.json — the mode can't be told or switched from here`,
    modeBlocked: (r) =>
      r === "night-lock" ? "the mode can be changed once the runner is free (the night lock isn't held)"
      : r === "config-elsewhere" ? "only ~/Projects/IT/night-runner/config.json can be switched — the plugin is set to another runner directory"
      : r === "config-symlink" ? "the runner's config.json is a symlink: switching would replace it with a file, edit it yourself"
      : r === "config-hardlink" ? "the runner's config.json has several hard links: switching would split them, edit it yourself"
      : r === "config-readonly" ? "the runner's config.json is write-protected — switching won't change it"
      : r === "no-runner-config" ? "the runner's config.json wasn't found"
      : r,
    modeNoResearch: "this runner can't research (no research command in night-run.mjs) — modes with research are unavailable",
    runnerUnread: "the runner's night-run.mjs couldn't be read — can't tell what it supports: research can't be started from here",
    resUnsupported: "This runner can't do market research: no research command in night-run.mjs",
    resQuotaStop: (w, n, running) => (running ? `Research agents no longer start: week at ${w} ≥ ${n}` : `Research won't start: week at ${w} ≥ ${n} (research.stop_seven_day_pct)`),
    resCeiling: (c) => `Research agents stop starting once the week reaches ${c}`,
    resCeilingWhy: (stop, budget) => `research threshold ${stop}${budget ? `, the night's budget stop — ${budget}` : ""}: whichever comes first`,
    reportPending: "findings.json is still being written — the number of findings shows up in a minute",
    researchTooShort: (n) => `the runner takes a window of at least ${n} min (synthesis_reserve_min + min_agent_min) — no buttons`,
    researchNoWindow: (t) => `no window would finish (with its report) before the night starts at ${t} — it would break the night; research after it`,
    researchSomeHidden: (t) => `windows that wouldn't finish before the night starts at ${t} are hidden: the night doesn't wait for a held lock`,
    pluginError: "Night plugin failure",
    note: (x) =>
      x.k === "noConfig" ? "runner config.json not found — using the default state_dir"
      : x.k === "badJson" ? `${x.cmd} --json: no reply or unknown format — reading files`
      : x.k === "badLock" ? "night.lock couldn't be read (the runner will treat it as stale)"
      : x.k === "badMarkers" ? `attempt markers that couldn't be read: ${x.n}`
      : String(x.k ?? x),
  },
};

const points = (v, lang) => {
  const r = String(Math.round(v * 10) / 10);
  return `${lang === "en" ? r : r.replace(".", ",")}%`;
};

// Бюджет ближайшей ночи: карточка с полосой (доля недели) и строки под ней; квоты нет — одна строка «недоступна».
// Идёт ночь — бюджет из её сводки (квота на старте, как у раннера), «пропустит запуск» не показывается.
export function budgetLines(f, startMs, L, lang) {
  const q0 = f.quota;
  if (!q0) return [];
  if (!q0.ok) return [`${clean(L.quotaOff(q0.why), 160)} | sfimage=moon.zzz color=gray`, "---"];
  const usage = f.usage || USAGE_DEFAULTS;
  const out = [];
  const card = (pct, last, stopAt) => {
    out.push(`${L.budgetTitle} | gauge=${Math.round(Math.min(100, Math.max(0, pct)))} note=${q(L.budgetNote)} color=#BF5AF2 sfimage=moon.stars`);
    out.push(`--${L.budget(points(pct, lang), last)}`);
    out.push(`--${L.budgetStop(`${Math.round(stopAt)}%`)}`);
  };
  if (f.running) {
    const ns = f.nightStart;
    if (ns && ns.fiveHour) out.push(`${L.budgetFive} | sfimage=moon.stars color=gray`);
    else if (ns && ns.startPct !== null && ns.budgetPct !== null) {
      card(ns.budgetPct, ns.lastNight, ns.startPct + ns.budgetPct);
      out.push(`--${L.budgetFixed(`${Math.round(ns.startPct)}%`)} | color=gray`);
    } else out.push(`${L.budgetRunningUnknown} | sfimage=moon.stars color=gray`);
    out.push("---");
    return out;
  }
  const week = q0.week;
  if (!week) {
    // кэш есть, а недели в нём нет: служба ещё не получила квоту, вход потерян, нет сети — или неделя уже сброшена
    const why = q0.rolled ? L.quotaRolled(q0.rolledAt ? L.dt(q0.rolledAt) : null) : L.quotaWhy(q0.error);
    out.push(`${clean(L.quotaNoWeek(why), 160)} | sfimage=moon.zzz color=gray`);
    if (q0.ageMs !== null && q0.ageMs > QUOTA_STALE_MS) out.push(`--${L.budgetStale(fmtAgo(q0.ageMs, lang))} | color=gray`);
    out.push("---");
    return out;
  }
  const atStart = weekAtStart(week, startMs, usage, f.cfg?.maxWaitMin ?? MAX_WAIT_DEFAULT_MIN);
  if (atStart === "reset") {
    out.push(`${clean(L.budgetAfterReset(L.dt(week.resetsMs)), 160)} | sfimage=moon.stars color=gray`);
  } else if (atStart === "wait") {
    out.push(`${clean(L.budgetWait(`${Math.round(week.percent)}%`, `${usage.skip_seven_day_pct}%`, fmtTime(week.resetsMs + MIN_MS)), 160)} | sfimage=moon.stars color=gray`);
  } else if (atStart === "skip") {
    out.push(`${L.budgetSkip(`${Math.round(week.percent)}%`, `${usage.skip_seven_day_pct}%`)} | sfimage=moon.zzz color=orange`);
  } else if (q0.fiveHour) {
    out.push(`${L.budgetFive} | sfimage=moon.stars color=gray`);
  } else {
    // момент старта ночи — ближайший старт по расписанию (как start.at у раннера)
    const b = nightBudget(week.percent, week.resetsMs, startMs, usage, f.cfg?.windowHours ?? 5);
    card(b.pct, b.lastNight, b.stopAt);
  }
  if (q0.ageMs !== null && q0.ageMs > QUOTA_STALE_MS) out.push(`--${L.budgetStale(fmtAgo(q0.ageMs, lang))} | color=gray`);
  if (f.notes.some((n) => n.k === "noConfig")) out.push(`--${L.budgetDefaults} | color=gray`);
  out.push("---");
  return out;
}

// Шапка отвечает на «запустится ли ночь и что сделать»: идёт → упала → блокер → мягкое → исследование при тебе →
// ночи нечего делать → готова. Вторая строка шапки — режим ночи. tile= — плитка.
export function render(f, lang = envLang()) {
  const L = T[lang] || T.ru;
  const out = [];
  const hard = f.blockers.filter((b) => !b.soft);
  // пометки (notice) — не «ночь может не стартовать»: ночь стартует, но часть задач уйдёт (Unity при исследовании)
  const soft = f.blockers.filter((b) => b.soft && !b.notice);
  const notices = f.blockers.filter((b) => b.notice);
  const startMs = nextStart(f.cfg.start, f.nowMs);
  const startT = fmtTime(startMs);
  const mode = f.nightMode || null;
  const live = f.researchLive || null;
  const manual = live?.kind === "manual" ? live : null;
  const noTasks = mode === "research-only" || mode === "idle";
  const suffix = mode ? L.modeSuffix[mode] : "";
  let status = "ok";
  let title;
  let tile = startT;
  const crashStamp = f.crashed ? f.crashed.stamp || (Number.isFinite(Date.parse(f.crashed.since || "")) ? dateStamp(Date.parse(f.crashed.since)) : dateStamp(f.nowMs)) : null;
  if (f.running) {
    const since = Date.parse(f.lock?.startedAt || "");
    title = L.running(Number.isFinite(since) ? fmtTime(since) : null, f.task ? clean(f.task, 40) : null) + (live?.kind === "night" && !f.task ? L.runningResearch : "");
    tile = L.tileRunning;
  } else if (f.crashed) {
    status = "block";
    title = L.crashed;
  } else if (hard.length) {
    status = "block";
    title = L.wontStart(clean(L.blocker(hard[0], startT), 90));
  } else if (soft.length) {
    status = "wait";
    title = L.mayNot(clean(L.blocker(soft[0], startT), 90));
  } else if (manual) {
    title = L.researchNowTitle(manual.sinceMs ? fmtTime(manual.sinceMs) : null, manual.untilMs ? fmtTime(manual.untilMs) : null);
    tile = L.tileResearch;
  } else if (mode === "idle") {
    // ни проектов, ни исследования: раннер в час старта остановится с ошибкой — внимание, но не блокер
    status = "wait";
    title = L.idleTitle;
    tile = L.tileOff;
  } else if (notices.length) {
    status = "wait";
    title = L.readyNote(startT, clean(L.blocker(notices[0], startT), 100));
  } else if (f.weekWait) {
    // неделя у порога, а сброс вскоре после старта — раннер подождёт его (decideStart: wait), а не пропустит ночь
    title = L.readyWait(fmtTime(f.weekWait.untilMs)) + suffix;
    tile = fmtTime(f.weekWait.untilMs);
  } else {
    title = L.ready(startT) + suffix;
  }
  if (!f.running && f.blockers.some((b) => b.id === "tamper")) status = "block";
  if (f.broken.length && status === "ok") status = "unknown";
  out.push(`${title} | status=${status} tile=${q(tile)} sfimage=moon.stars`);
  if (mode) out.push(`${L.modeHead(L.modeLabel[mode])} | sfimage=${noTasks ? "binoculars" : "checklist"}`);
  out.push("---");

  // карточки-цифры страницы плагина (Panel.dc.html): следующий запуск, план, квота недели
  {
    const planN = f.plan ? f.plan.sections.reduce((a, s) => a + s.tasks.length, 0) : null;
    const key = f.running ? "running" : f.crashed ? "crashed" : hard.length ? "blocked" : soft.length ? "maybe" : "ready";
    const color = status === "block" ? "red" : status === "wait" ? "orange" : "green";
    const quiet = !f.running && !f.crashed && !hard.length && !soft.length;
    const startNote = quiet && mode === "idle" ? L.stIdle : quiet && manual ? L.stResearchNow : L.stNote[key];
    const startVal = f.running ? L.tileRunning : quiet && mode === "idle" ? L.tileOff : f.weekWait && !f.crashed && !hard.length ? fmtTime(f.weekWait.untilMs) : startT;
    out.push(`${startVal} | stat=${q(L.stStart)} note=${q(startNote)} color=${color}`);
    const held = (f.held || []).length;
    if (mode === "research-only") out.push(`${L.stPlanResearch} | stat=${q(L.stPlanTitle)} note=${q(L.stNoTasks)}`);
    else if (mode === "idle") out.push(`— | stat=${q(L.stPlanTitle)} note=${q(L.stNoTasks)} color=gray`);
    else out.push(`${planN === null ? "—" : L.stPlan(planN)} | stat=${q(L.stPlanTitle)} note=${q(planN === null ? L.stNoPlan : held ? L.stHeld(held) : L.stNoHeld)}`);
    const skip = f.usage?.skip_seven_day_pct ?? USAGE_DEFAULTS.skip_seven_day_pct;
    if (Number.isFinite(f.week)) {
      // ночи нечего делать — порог пропуска ей ни о чём не говорит
      if (mode === "idle") out.push(`${Math.round(f.week)}% | stat=${q(L.stWeek)} note=${q(L.stWeekIdle)}`);
      else out.push(`${Math.round(f.week)}% | stat=${q(L.stWeek)} note=${q(L.stWeekNote(skip))}${f.week >= skip ? " color=orange" : ""}`);
    } else if (f.quota) out.push(`— | stat=${q(L.stWeek)} note=${q(L.stWeekOff)} color=gray`);
    out.push("---");
    // ночи нечего делать — ни бюджета, ни «пропустит запуск»
    if (mode !== "idle") out.push(...budgetLines(f, startMs, L, lang));
  }

  if (f.broken.length) {
    out.push(`${L.broken} | status=unknown event=source-broken sfimage=exclamationmark.triangle`);
    out.push(`--${clean(f.broken.map((x) => (typeof x === "string" ? x : L.brokenItem(x))).join("; "), 160)}`);
  }
  if (f.crashed) {
    out.push(`${L.crashLine(L.stamp(crashStamp))} | status=block event=runner-crashed:${crashStamp} sfimage=exclamationmark.octagon color=red`);
    if (f.lock?.pid) {
      out.push(`--${L.detailsTitle} | details=true`);
      out.push(`----${L.lockPid(f.lock.pid)}`);
    }
  }

  // управление идущей ночью — объявленные действия (подтверждает ядро; факты действие проверит само)
  if (f.running) {
    out.push(`${L.stop} | action=stop sfimage=stop.circle`);
    if (f.task && argOk(f.task)) out.push(`${L.skipTask(f.task)} | action=skip arg=${f.task} sfimage=forward.end`);
  }

  // блокеры
  if (f.blockers.length) {
    out.push(`${L.blockers(f.blockers.length)} | sfimage=hand.raised`);
    for (const b of f.blockers) {
      out.push(`--${clean(L.blocker(b, startT), 140)} | status=${b.soft ? "wait" : "block"}${b.event ? ` event=${b.event}` : ""}${fileEffect(b.path)}`);
      const d = L.blockerDetail(b);
      // номер процесса — во второй уровень; пояснение маркера подмены — на виду
      if (d && (b.kind === "unity" || b.kind === "unity-note")) out.push(`----${L.detailsTitle} | details=true`, `------${clean(d, 140)}`);
      else if (d) out.push(`----${clean(d, 140)}`);
    }
  } else out.push(`${L.noBlockers} | sfimage=checkmark.circle`);

  // замок
  if (f.lock) {
    const since = Date.parse(f.lock.startedAt || "");
    const when = Number.isFinite(since) ? L.dt(since) : "?";
    const holder = !f.running ? f.lock.command || f.lock.holder : null;
    if (f.lock.alive === false) out.push(`${L.lockStale(when)} | sfimage=lock.open`);
    else if (manual) out.push(`${L.researchNowTitle(when, null)} | sfimage=lock`);
    else if (holder) out.push(`${L.lockHeld(clean(holder, 30), when)} | sfimage=lock`);
    else out.push(`${L.lockNight(when, f.task ? clean(f.task, 40) : null)} | sfimage=lock`);
    out.push(`--${L.detailsTitle} | details=true`);
    out.push(`----${L.lockPid(f.lock.pid)}`);
  } else out.push(`${L.noLock(L.dt(startMs))} | sfimage=clock`);

  // последняя ночь и итоги
  const last = f.summaries.find((s) => s.ok);
  if (last) {
    out.push(`${L.lastNight(L.stamp(last.stamp), last.tasks, last.prs ?? 0, clean(last.stop, 80))} |${fileEffect(last.path)} sfimage=doc.text`);
    const today = dateStamp(f.nowMs);
    // живость замка неизвестна (ps не ответил) — считаем, что ночь может идти: «прогон не завершён» сводки
    // раннер пишет уже на старте, и ложный night-done занял бы ключ настоящего итога
    if (!f.running && last.stamp === today && !(f.lock && f.lock.alive !== false)) {
      out.push(`--${L.nightDone(L.stamp(last.stamp))} | event=night-done:${last.stamp}`);
      if (/инфраструктурн\S* провал\S* подряд/.test(last.stop || "")) out.push(`--${L.infra(clean(last.stop, 80))} | status=block event=infra-failures:${last.stamp}`);
    }
  }
  // лента «Последние ночи» (strip=true): старые слева, ячейка — дата, итог, щелчок открывает сводку
  if (f.summaries.length) {
    out.push(`${L.history} | strip=true sfimage=calendar`);
    for (const s of [...f.summaries].slice(0, 7).reverse()) {
      if (s.ok) {
        const ok = (s.tasks || 0) > 0;
        out.push(`--${L.stamp(s.stamp)} | note=${q(L.stripNote(s.tasks, s.prs ?? 0))} tooltip=${q(L.histLine(L.stamp(s.stamp), s.range, s.tasks, s.prs ?? 0, clean(s.stop, 90)))} sfimage=${ok ? "checkmark.circle.fill" : "minus.circle.fill"} color=${ok ? "green" : "gray"}${fileEffect(s.path)}`);
      } else out.push(`--${L.stamp(s.stamp)} | note=${q(L.stripBad)} sfimage=xmark.circle.fill color=red${fileEffect(s.path)}`);
    }
  }

  // режим ночи и переключатель (действия mode-*; подтверждение — от ядра, факты действие проверит само)
  out.push("---");
  out.push(...modeLines(f, L, startT));

  // раздел «Задачи»: очередь — план по dry-run и отложенные
  out.push("---");
  out.push(`${L.tasksTitle} | sfimage=checklist color=gray size=11`);
  if (noTasks) {
    // «только исследование» и «ничего не делает» — задач ночью нет по режиму, а не из-за поломки
    out.push(`${L.tasksOff(mode)} | sfimage=list.bullet color=gray`);
  } else if (f.plan) {
    const n = f.plan.sections.reduce((a, s) => a + s.tasks.length, 0);
    const age = f.plan.asOf ? f.nowMs - f.plan.asOf : null;
    const stale = age !== null && age > PLAN_STALE_MS;
    const asOf = f.plan.asOf ? L.planAsOf(L.dt(f.plan.asOf), fmtAgo(age, lang)) : null;
    const why = !n && f.plan.stop ? ` · ${clean(f.plan.stop, 70)}` : "";
    out.push(`${L.plan(n, asOf, stale, why)} |${fileEffect(f.plan.path)} sfimage=list.bullet${stale ? " color=gray" : ""}`);
    const many = f.plan.sections.length > 1;
    for (const s of f.plan.sections) {
      if (many) out.push(`--${s.title} (${s.tasks.length}) | sfimage=folder`);
      for (const t of s.tasks.slice(0, 30)) {
        const href = t.url && /^https:\/\//.test(t.url) && !/\s/.test(t.url) ? ` href=${q(t.url)}` : "";
        const lvl = many ? "----" : "--";
        out.push(`${lvl}${t.name} |${href}`);
        const id = t.id || taskIdFromUrl(t.url);
        if (id && argOk(id)) {
          out.push(`${lvl}--${L.skipTonight} | action=skip arg=${id} sfimage=forward.end`);
          // днём, без замка: одна задача без пуша (подтверждение с ценой)
          if (!f.lock || f.lock.alive === false) out.push(`${lvl}--${L.runNow} | action=run arg=${id} sfimage=play.circle`);
        }
      }
    }
    if (f.plan.skipped) out.push(`--${L.filtered(f.plan.skipped)}`);
  } else out.push(`${L.noPlan} | sfimage=list.bullet color=gray`);

  // очередь: отложенные (без задач в режиме — только если что-то отложено с прошлых ночей)
  if (!noTasks || f.held.length || f.retry.length) {
    out.push(`${L.held(f.held.length, f.retry.length, f.heldAsOf ? L.dt(f.heldAsOf) : null)} | sfimage=pause.circle`);
    for (const h of f.held.slice(0, 30)) out.push(`--${L.heldLine(h, h.date ? L.stamp(h.date) : null)}`);
    for (const h of f.retry.slice(0, 30)) out.push(`--${L.retryLine(h, MAX_RETRIES)}`);
  }

  // раздел «Исследование рынка»
  out.push("---");
  out.push(...researchLines(f, L));

  out.push("---");
  out.push(`${L.sourceTitle} | color=gray size=11`);
  for (const n of f.notes) out.push(`--${clean(typeof n === "string" ? n : L.note(n), 140)} | color=gray`);
  out.push(`--${L.source(f.mode === "status")} | color=gray size=11`);
  return out.join("\n") + "\n";
}

// Раннер свободен: замка нет или он протух (держатель мёртв). ps не ответил или замок занят — нет.
const runnerFree = (f) => !f.lock || f.lock.alive === false;

// Почему переключение режима заведомо откажет — тот же расчёт, что у действия (actionMode). → null | reason
export function modeBlock(f) {
  if (f.cfgWhere?.scheduled || f.cfgWhere?.elsewhere) return "config-elsewhere";
  if (!runnerFree(f)) return "night-lock";
  return configProblem(f.cfgPath);
}

// Режим ночи и кнопки переключения. Переключатели, которые заведомо откажут, не показываются — вместо них одна строка
// причины: раннер занят, config.json не тот или его нельзя заменить, раннер не умеет исследование, не запомнено, какие
// проекты вернуть.
export function modeLines(f, L, startT) {
  const mode = f.nightMode;
  const out = [`${L.modeCaption} | sfimage=switch.2 color=gray size=11`];
  if (f.cfgWhere?.scheduled) return [...out, `${clean(L.modeScheduled(f.cfgWhere.scheduled), 160)} | sfimage=questionmark.circle color=gray`];
  if (!mode) return [...out, `${L.modeUnknown} | sfimage=questionmark.circle color=gray`];
  const noTasks = mode === "research-only" || mode === "idle";
  out.push(`${L.modeLabel[mode]} | sfimage=${noTasks ? "binoculars" : "checklist"}${mode === "idle" ? " color=orange" : ""}`);
  const enabled = (f.cfg?.projects || []).filter((p) => p.enabled).map((p) => p.id);
  out.push(`--${clean(L.modeWhat(mode, enabled.join(", "), startT), 160)}`);
  const ids = new Set((f.cfg?.projects || []).map((p) => p.id));
  const back = f.memory ? f.memory.projects.filter((id) => ids.has(id)) : [];
  if (noTasks) out.push(`--${clean(back.length ? L.modeBack(back.join(", ")) : L.modeNoBack, 160)}`);
  out.push(`${L.modeSwitch} | sfimage=arrow.triangle.2.circlepath`);
  const block = modeBlock(f);
  if (block) {
    out.push(`--${clean(L.modeBlocked(block), 160)} | color=gray`);
    return out;
  }
  const research = f.researchSupported === true;
  for (const target of SWITCHABLE) {
    if (target === mode) continue;
    if (target !== "tasks" && !research) continue;
    if (target !== "research-only" && noTasks && !back.length) continue;
    out.push(`--${L.modeShort[target]} | action=mode-${target} sfimage=${target === "research-only" ? "binoculars" : "checklist"}`);
  }
  if (!research) out.push(`--${f.researchSupported === false ? L.modeNoResearch : L.runnerUnread} | color=gray`);
  return out;
}

// Потолок недели для агентов исследования ближайшей (или идущей) ночи: свой порог research.stop_seven_day_pct и
// остановка ночи по бюджету (usageStop) — что раньше. → { stop, budgetStop|null, ceiling }
export function researchCeiling(f, startMs) {
  const stop = f.cfg?.research?.stopPct ?? RESEARCH_DEFAULTS.stop_seven_day_pct;
  const q0 = f.quota;
  const usage = f.usage || USAGE_DEFAULTS;
  let budgetStop = null;
  if (f.running) {
    const ns = f.nightStart;
    if (ns && ns.startPct !== null && ns.budgetPct !== null) budgetStop = ns.startPct + ns.budgetPct;
  } else if (q0?.ok && q0.week && !q0.fiveHour && !weekAtStart(q0.week, startMs, usage, f.cfg?.maxWaitMin ?? MAX_WAIT_DEFAULT_MIN)) {
    budgetStop = nightBudget(q0.week.percent, q0.week.resetsMs, startMs, usage, f.cfg?.windowHours ?? 5).stopAt;
  }
  return { stop, budgetStop, ceiling: budgetStop === null ? stop : Math.min(stop, budgetStop) };
}

// Окно «Исследовать сейчас» успевает до ночи: замок (окно + хвост отчёта) свободен к её старту. Ночи нечего делать —
// мешать нечему. Режим не прочитан — считаем, что ночь будет.
export function researchFits(nowMs, minutes, startMs, mode) {
  return mode === "idle" || nowMs + minutes * MIN_MS + RESEARCH_TAIL_MS < startMs;
}

// Раздел «Исследование рынка»: идёт ли сейчас (ночное или ручное, сколько агентов отработало), порог квоты, последний
// отчёт (дата, число находок; открыть его и ленту — open.file), «Исследовать сейчас» с окном 30/60/120 мин.
export function researchLines(f, L) {
  const out = [`${L.researchTitle} | sfimage=binoculars color=gray size=11`];
  if (f.researchSupported === false) return [...out, `${L.resUnsupported} | sfimage=questionmark.circle color=gray`];
  const live = f.researchLive;
  const mode = f.nightMode;
  const startMs = nextStart(f.cfg.start, f.nowMs);
  if (live) {
    const since = live.sinceMs ? fmtTime(live.sinceMs) : null;
    out.push(`${live.kind === "manual" ? L.resManual(since, live.untilMs ? fmtTime(live.untilMs) : null) : L.resNight(since)} | sfimage=hourglass color=#0A84FF`);
    out.push(`--${live.logFound ? L.resProgress(live) : L.resNoLog}`);
  } else if (f.running && mode === "tasks-research") out.push(`${L.resAfterTasks} | sfimage=hourglass color=gray`);
  else if (mode) out.push(`${L.resPlan[mode]} | sfimage=moon.stars color=gray`);
  // недельный порог исследования (только когда ночь его вообще позовёт)
  if (mode === "research-only" || mode === "tasks-research") {
    if (f.researchQuota) out.push(`${L.resQuotaStop(`${f.researchQuota.week}%`, `${f.researchQuota.stop}%`, f.running)} | sfimage=exclamationmark.circle color=orange`);
    else if (!live || live.kind === "night") {
      const c = researchCeiling(f, startMs);
      out.push(`${L.resCeiling(`${Math.round(c.ceiling)}%`)} | sfimage=gauge color=gray`);
      out.push(`--${L.resCeilingWhy(`${c.stop}%`, c.budgetStop === null ? null : `${Math.round(c.budgetStop)}%`)} | color=gray`);
    }
  }
  const r = f.report;
  if (r) {
    out.push(`${L.reportLine(L.stamp(r.date), r.manual, r.findings)} | sfimage=doc.richtext`);
    if (r.broken) out.push(`--${L.reportBroken} | color=gray`);
    if (r.pending) out.push(`--${L.reportPending} | color=gray`);
    if (!/\s/.test(r.open)) out.push(`--${L.reportOpen} | effect=${q(`open.file ${r.open}`)} sfimage=doc.richtext`);
    if (r.feed && !/\s/.test(r.feed)) out.push(`--${L.feedOpen} | effect=${q(`open.file ${r.feed}`)} sfimage=list.bullet.rectangle`);
  } else out.push(`${L.noReport} | sfimage=doc.richtext color=gray`);
  out.push(`${L.researchNow} | sfimage=play.circle`);
  out.push(`--${L.researchCost} | color=gray`);
  if (!runnerFree(f)) {
    out.push(`--${L.researchBusy} | color=gray`);
    return out;
  }
  if (f.researchSupported !== true) {
    out.push(`--${L.runnerUnread} | color=gray`);
    return out;
  }
  // окна короче резерва синтеза + одного агента раннер не примет; окна, что не успеют до ночи, сорвали бы её старт
  const least = (f.cfg?.research?.reserveMin ?? RESEARCH_DEFAULTS.synthesis_reserve_min) + (f.cfg?.research?.agentMin ?? RESEARCH_DEFAULTS.min_agent_min);
  const long = RESEARCH_MINUTES.filter((n) => n >= least);
  const ok = long.filter((n) => researchFits(f.nowMs, n, startMs, mode));
  for (const n of ok) out.push(`--${L.researchMin(n)} | action=research arg=${n} sfimage=play.circle`);
  if (!long.length) out.push(`--${L.researchTooShort(least)} | color=gray`);
  else if (!ok.length) out.push(`--${L.researchNoWindow(fmtTime(startMs))} | color=gray`);
  else if (ok.length < long.length) out.push(`--${L.researchSomeHidden(fmtTime(startMs))} | color=gray`);
  return out;
}

// ---------- действия (запускает ядро после подтверждения в приложении) ----------

// Каталоги раннера и state_dir — как в collect (настройки плагина, config.json раннера).
export function resolveDirs({ home = homedir(), settings = pluginSettings() } = {}) {
  const runnerDir = expand(settings.runnerDir || "~/Projects/IT/night-runner", home);
  let stateDir = expand("~/.claude/task-runs/night", home);
  try {
    const c = parseRunnerConfig(readJson(join(runnerDir, "config.json")), home);
    if (c.ok) stateDir = c.stateDir;
  } catch {}
  if (settings.stateDir) stateDir = expand(settings.stateDir, home);
  return { runnerDir, stateDir };
}

// Держатель замка по таблице процессов. → { state: "none"|"alive"|"stale"|"unknown"|"broken", pid?, command?, holder? }
export async function lockState(stateDir) {
  const lock = readLock(stateDir);
  if (!lock) return { state: "none" };
  if (lock.broken) return { state: "broken" };
  const ps = await run(bin("ps", "/bin/ps"), ["-axww", "-o", "pid=,ppid=,command="]);
  if (ps.code !== 0) return { state: "unknown", pid: lock.pid, command: lock.command };
  const holder = parsePs(ps.stdout).find((p) => p.pid === lock.pid && p.cmd.includes("night-run.mjs"));
  if (!holder) return { state: "stale", pid: lock.pid, command: lock.command };
  return { state: "alive", pid: lock.pid, command: lock.command, holder: holderSubcommand(holder.cmd) };
}

function isDir(p) {
  return Boolean(tryStat(p)?.isDirectory());
}

// Стоп-файл: 0600, «wx» — существующий не трогаем. → { ok, reason?, created? }
function writeStopFile(path, extra) {
  try {
    writeFileSync(path, JSON.stringify({ by: "agent-hub", at: new Date().toISOString(), ...extra }) + "\n", { mode: 0o600, flag: "wx" });
    return { ok: true, created: true };
  } catch (e) {
    if (e.code === "EEXIST") return { ok: true, created: false };
    return { ok: false, reason: "write-failed" };
  }
}

// stop: STOP в state_dir, только если замок держит идущая ночь (command null|run, подкоманда держателя run|нет).
export async function actionStop({ settings = pluginSettings(), home = homedir() } = {}) {
  if (settings.stopFiles !== true) return { ok: false, reason: "runner-patch-required" };
  const { stateDir } = resolveDirs({ home, settings });
  if (!isDir(stateDir)) return { ok: false, reason: "no-state-dir" };
  const lock = await lockState(stateDir);
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  if (lock.state !== "alive" || !isNightLock(lock.command, lock.holder)) return { ok: false, reason: "night-not-running" };
  return writeStopFile(join(stateDir, "STOP"), { nightPid: lock.pid });
}

// skip <taskId>: SKIP-<taskId> в state_dir; ночь может и не идти — пропуск ставится на ближайшую.
export async function actionSkip(taskId, { settings = pluginSettings(), home = homedir() } = {}) {
  if (!argOk(taskId)) return { ok: false, reason: "bad-task" };
  if (settings.stopFiles !== true) return { ok: false, reason: "runner-patch-required" };
  const { stateDir } = resolveDirs({ home, settings });
  if (!isDir(stateDir)) return { ok: false, reason: "no-state-dir" };
  return writeStopFile(join(stateDir, `SKIP-${taskId}`), { taskId });
}

// Проект задачи для `--task <проект>:<id>`: раннер принимает голый id, только когда включён ровно один проект.
// Ищем задачу в разделах последнего плана dry-run (заголовок раздела — title или id проекта из config.json
// раннера). → { ref } | { reason }
export function taskRef(taskId, { runnerDir, stateDir, home = homedir() }) {
  let cfg = null;
  try {
    cfg = parseRunnerConfig(readJson(join(runnerDir, "config.json")), home);
  } catch {}
  if (!cfg?.ok) return { reason: "no-runner-config" };
  const hits = new Set();
  const dry = listSummaries(stateDir, { dry: true, n: 1 })[0];
  if (dry) {
    let p = { ok: false };
    try {
      p = parseDryPlan(readFileSync(dry.path, "utf8"));
    } catch {}
    for (const sec of p.ok ? p.sections : []) {
      if (!sec.tasks.some((t) => (t.id || taskIdFromUrl(t.url)) === taskId)) continue;
      const proj = cfg.projects.find((x) => x.id === sec.title) || cfg.projects.find((x) => x.title && clean(x.title, 60) === sec.title);
      hits.add(proj ? proj.id : null);
    }
  }
  if (hits.has(null)) return { reason: "unknown-project" };
  if (hits.size > 1) return { reason: "ambiguous-task" };
  if (hits.size === 1) {
    const project = [...hits][0];
    return PROJECT_ID.test(project) ? { ref: `${project}:${taskId}` } : { reason: "unknown-project" };
  }
  // в плане задачи нет: голый id раннер примет только при одном включённом проекте
  const enabled = cfg.projects.filter((x) => x.enabled);
  if (enabled.length === 1 && PROJECT_ID.test(enabled[0].id)) return { ref: `${enabled[0].id}:${taskId}` };
  return { reason: "unknown-project" };
}

// run <taskId>: `node night-run.mjs run --task <проект>:<id> --no-push` отдельным процессом (detached), вывод — в
// лог 0600 в каталоге данных плагина. Только без живого замка (ночь или другая команда раннера идёт — отказ).
export async function actionRun(taskId, { settings = pluginSettings(), home = homedir(), dataDir = process.env.AGENTHUB_PLUGIN_DATA_PATH } = {}) {
  if (!argOk(taskId)) return { ok: false, reason: "bad-task" };
  const { runnerDir, stateDir } = resolveDirs({ home, settings });
  if (!existsSync(join(runnerDir, "night-run.mjs"))) return { ok: false, reason: "no-runner" };
  const lock = await lockState(stateDir);
  if (lock.state === "alive") return { ok: false, reason: "night-lock" };
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  const t = taskRef(taskId, { runnerDir, stateDir, home });
  if (t.reason) return { ok: false, reason: t.reason };
  return spawnRunner(["run", "--task", t.ref, "--no-push"], { runnerDir, home, dataDir, logPrefix: "runner" });
}

// `node night-run.mjs <args>` отдельным процессом (detached) в каталоге раннера; вывод — в лог 0600 в каталоге данных
// плагина (<logPrefix>-<время>.log). Окружение — минимальное: HOME, PATH и пара системных.
function spawnRunner(args, { runnerDir, home, dataDir, logPrefix }) {
  const node = bin("node", process.execPath);
  const env = { HOME: home, PATH: process.env.PATH || "/usr/bin:/bin" };
  for (const k of ["USER", "LOGNAME", "LANG", "TMPDIR"]) if (process.env[k]) env[k] = process.env[k];
  let fd = "ignore";
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fd = openSync(join(dataDir, `${logPrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`), "a", 0o600);
  }
  return new Promise((resolve) => {
    let child;
    const done = (r) => {
      if (typeof fd === "number") closeSync(fd);
      resolve(r);
    };
    try {
      child = spawn(node, ["night-run.mjs", ...args], { cwd: runnerDir, env, detached: true, stdio: ["ignore", fd, fd] });
    } catch {
      return done({ ok: false, reason: "spawn-failed" });
    }
    child.once("spawn", () => {
      child.unref();
      done({ ok: true, pid: child.pid });
    });
    child.once("error", () => done({ ok: false, reason: "spawn-failed" }));
  });
}

// research <30|60|120>: `node night-run.mjs research --minutes N` отдельным процессом, лог — research-<время>.log
// (0600) в каталоге данных плагина. Только без живого замка: раннер сам откажет («идёт ночной прогон»), но плагин
// не запускает его зря. Окно короче резерва синтеза и одного агента раннер не примет — отказ до запуска; маркер
// подмены — тоже (researchCommand проверяет его первым).
export async function actionResearch(minutes, { settings = pluginSettings(), home = homedir(), dataDir = process.env.AGENTHUB_PLUGIN_DATA_PATH, nowMs = Date.now() } = {}) {
  // ровно «30», «60» или «120», как в шаблоне аргумента (ядро сверит и само; здесь — вторая линия)
  if (!RESEARCH_MINUTES.map(String).includes(String(minutes ?? ""))) return { ok: false, reason: "bad-minutes" };
  const n = Number(minutes);
  const { runnerDir, stateDir } = resolveDirs({ home, settings });
  let source;
  try {
    source = readFileSync(join(runnerDir, "night-run.mjs"), "utf8");
  } catch {
    return { ok: false, reason: "no-runner" };
  }
  if (researchSupport(runnerCommands(source)) !== true) return { ok: false, reason: "runner-no-research" };
  const lock = await lockState(stateDir);
  if (lock.state === "alive") return { ok: false, reason: "night-lock" };
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  let cfg = null;
  try {
    cfg = parseRunnerConfig(readJson(join(runnerDir, "config.json")), home);
  } catch {
    return { ok: false, reason: "no-runner-config" };
  }
  if (!cfg.ok || cfg.modeProblem) return { ok: false, reason: "bad-config" };
  if (n < cfg.research.reserveMin + cfg.research.agentMin) return { ok: false, reason: "too-short" };
  // ночь не ждёт занятый замок (nightLock ждёт только post): окно с хвостом отчёта не должно задеть её старт
  if (!researchFits(nowMs, n, nextStart(cfg.start, nowMs), cfg.mode)) return { ok: false, reason: "overlaps-night" };
  if (existsSync(join(stateDir, TAMPER_FILE))) return { ok: false, reason: "tamper" };
  return spawnRunner(["research", "--minutes", String(n)], { runnerDir, home, dataDir, logPrefix: "research" });
}

// mode <tasks|tasks-research|research-only>: правка config.json раннера — только research.enabled и enabled проектов
// (_config-modes.mjs). Сначала всё, что может отказать, без побочных эффектов: путь — объявленный и тот, что читает
// плановая ночь; раннер умеет исследование; файл — обычный, одно имя, с правом записи; замок свободен; план и правка.
// Затем: копия прежнего файла в данные плагина → память включённых проектов (до правки: упади запись конфига —
// память лишняя, а не потерянная) → временный файл → замок ещё раз → сверка и rename. Уже в этом режиме — ok без записи.
export async function actionMode(target, { settings = pluginSettings(), home = homedir(), dataDir = process.env.AGENTHUB_PLUGIN_DATA_PATH } = {}) {
  if (!SWITCHABLE.includes(target)) return { ok: false, reason: "bad-mode" };
  if (!dataDir) return { ok: false, reason: "no-data-dir" };
  const { runnerDir, stateDir } = resolveDirs({ home, settings });
  const cfgPath = join(runnerDir, "config.json");
  const where = configWhere(cfgPath, home);
  if (where.elsewhere || where.scheduled) return { ok: false, reason: "config-elsewhere" };
  let commands = [];
  try {
    commands = runnerCommands(readFileSync(join(runnerDir, "night-run.mjs"), "utf8"));
  } catch {}
  const researchSupported = researchSupport(commands) === true;
  if (target !== "tasks" && !researchSupported) return { ok: false, reason: "runner-no-research" };
  const bad = configProblem(cfgPath);
  if (bad) return { ok: false, reason: bad };
  let text;
  try {
    text = readFileSync(cfgPath, "utf8");
  } catch {
    return { ok: false, reason: "no-runner-config" };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "bad-config" };
  }
  const lock = await lockState(stateDir);
  if (lock.state === "alive") return { ok: false, reason: "night-lock" };
  if (lock.state === "unknown") return { ok: false, reason: "lock-unknown" };
  const plan = planModeChange(raw, target, readMemory(dataDir, cfgPath), { researchSupported });
  if (plan.reason) return { ok: false, reason: plan.reason };
  const edit = editConfigText(text, plan.changes);
  if (!edit.ok) return { ok: false, reason: edit.reason };
  if (!edit.changed) return { ok: true, changed: false };
  try {
    backupConfig(dataDir, text);
  } catch {
    return { ok: false, reason: "backup-failed" };
  }
  try {
    if (plan.remember) writeMemory(dataDir, plan.remember, cfgPath);
  } catch {
    return { ok: false, reason: "memory-failed" };
  }
  const staged = stageConfig(cfgPath, edit.text);
  if (!staged.ok) return staged;
  // замок мог занять старт ночи или команда раннера, пока шла правка: раннер читает конфиг на старте
  const again = await lockState(stateDir);
  if (again.state === "alive" || again.state === "unknown") {
    dropStaged(staged.tmp);
    return { ok: false, reason: again.state === "alive" ? "night-lock" : "lock-unknown" };
  }
  const w = commitConfig(cfgPath, staged.tmp, text);
  if (!w.ok) return w;
  if (plan.clearMemory) {
    try {
      clearMemory(dataDir);
    } catch {}
  }
  return { ok: true, changed: true };
}

// `--action <id> [<аргумент>]` → код выхода 0 / 3 и строка reason=<код> (ядро передаёт её оболочке).
export async function runAction(argv) {
  const [id, arg] = argv;
  const r =
    id === "stop" ? await actionStop()
    : id === "skip" ? await actionSkip(arg)
    : id === "run" ? await actionRun(arg)
    : id === "mode" ? await actionMode(arg)
    : id === "research" ? await actionResearch(arg, { nowMs: testNow() })
    : { ok: false, reason: "unknown-action" };
  process.stdout.write(r.ok ? "ok\n" : `reason=${r.reason}\n`);
  process.exitCode = r.ok ? 0 : 3;
}

// «Сейчас»: AGENTHUB_TEST_NOW только в тестах (демон окружение очищает).
function testNow() {
  return process.env.AGENTHUB_TEST_NOW ? Date.parse(process.env.AGENTHUB_TEST_NOW) : Date.now();
}

async function main() {
  const ai = process.argv.indexOf("--action");
  if (ai >= 2) return runAction(process.argv.slice(ai + 1));
  const now = testNow();
  let text;
  try {
    text = render(await collect({ nowMs: now }));
  } catch (e) {
    text = `${T[envLang()].pluginError} | status=unknown\n---\n${clean(e?.message || e, 140)} | event=source-broken\n`;
  }
  process.stdout.write(text);
}

// Запуск как программы (не импорт из тестов). realpath: node отдаёт import.meta.url уже без symlink.
function isMain() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) main();
