/**
 * Запуск Node-скрипта с прокси из .env.local: node scripts/with-proxy.mjs <скрипт> [аргументы]
 *
 * Node не читает системный прокси Windows, ему нужны HTTPS_PROXY и NODE_USE_ENV_PROXY=1 в окружении
 * до старта процесса. Флаги --env-file/--use-env-proxy для `next dev` не годятся: Next передаёт их
 * дочерним процессам через NODE_OPTIONS, где --env-file-if-exists запрещён. Переменные окружения
 * дочерние процессы наследуют без ограничений.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// уже заданные в окружении переменные loadEnvFile не перезаписывает
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.NODE_USE_ENV_PROXY = "1";

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Использование: node scripts/with-proxy.mjs <скрипт> [аргументы]");
  process.exit(1);
}

const child = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
