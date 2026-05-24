#!/usr/bin/env node
/**
 * Fail fast before start if production auth/database env is missing.
 * Run from app root (same folder as server.js for standalone).
 */
import "./load-env.mjs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = ["DATABASE_URL", "AUTH_SECRET"];
const recommended = ["AUTH_URL"];

const missing = required.filter((key) => !process.env[key]?.trim());
const warnings = recommended.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  const cwd = process.cwd();
  const hasEnvFile = [".env", ".env.production", ".env.local"].some((f) =>
    existsSync(resolve(cwd, f))
  );

  console.error("ERROR: Missing required environment variables:");
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  console.error("");
  if (!hasEnvFile) {
    console.error(
      "No .env file found in",
      cwd,
      "— create one (see .env.example) or set vars in PM2/systemd."
    );
  } else {
    console.error(
      ".env exists but variables are empty — edit .env and restart the process."
    );
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn("WARNING: Recommended variables not set:", warnings.join(", "));
  console.warn("Set AUTH_URL to your public HTTPS URL, e.g. https://inventory.example.com");
}

if (process.env.NODE_ENV !== "production") {
  console.error(
    "ERROR: NODE_ENV must be 'production' for this app (current:",
    process.env.NODE_ENV ?? "unset",
    ")"
  );
  console.error("Add NODE_ENV=production to .env or run: npm run start:prod");
  process.exit(1);
}

console.log("Environment check OK (NODE_ENV=production)");
