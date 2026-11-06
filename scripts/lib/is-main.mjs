// Скрипт запущен как программа, а не импортирован. Обе стороны — по realpath: node отдаёт import.meta.url уже
// без symlink (на macOS /tmp → /private/tmp, symlink на ~/Projects), а process.argv[1] — путь как его набрали;
// простое resolve() молча давало «не программа» и код выхода 0 без единой проверки.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
