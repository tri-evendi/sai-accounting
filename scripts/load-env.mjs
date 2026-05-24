/**
 * Load .env files without Node 20+ --env-file (works on Node 18+).
 * Does not override variables already set in the environment.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export function loadEnvFiles(files) {
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}

export function loadEnv() {
  const files =
    process.env.NODE_ENV === "production"
      ? [".env", ".env.production"]
      : [".env", ".env.local"];
  loadEnvFiles(files);
}

loadEnv();
