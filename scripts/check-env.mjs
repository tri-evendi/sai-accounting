#!/usr/bin/env node
/**
 * Fail fast before start if production auth/database env is missing.
 * Run from app root (same folder as server.js for standalone).
 */
import "./load-env.mjs";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
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

/*
 * nodemailer tercantum di package.json tapi node_modules bisa saja lebih tua
 * dari package.json (#159 temuan 6) — dan ketiadaannya SENYAP sampai gagal:
 * di produksi ber-SMTP surel berhenti terkirim; di pengembangan bahkan lebih
 * buruk, Turbopack tetap me-resolve `await import("nodemailer")` di
 * src/lib/mailer-core.ts walau cabang smtp tidak pernah jalan, sehingga
 * /api/auth/register menjawab 500. Obatnya selalu sama: `bun install`.
 */
const require = createRequire(import.meta.url);
let mailerInstalled = true;
try {
  require.resolve("nodemailer");
} catch {
  mailerInstalled = false;
}
if (!mailerInstalled) {
  const message =
    "nodemailer tidak ditemukan di node_modules padahal tercantum di package.json — " +
    "node_modules Anda lebih tua dari package.json. Jalankan: bun install";
  if (process.env.MAIL_TRANSPORT === "smtp") {
    // Transport smtp MEMBUTUHKANNYA di jalur kirim — gagal cepat di sini,
    // bukan 500 pertama saat orang mengatur ulang kata sandinya.
    console.error("ERROR:", message);
    process.exit(1);
  }
  console.warn("WARNING:", message);
}

/*
 * SETTINGS_ENCRYPTION_KEY (#169) — kunci AES-256 untuk kata sandi SMTP yang
 * disimpan dari konsol operator. TIDAK wajib: tanpa kunci, pengaturan surel
 * tetap berjalan dari environment seperti sebelumnya; yang ditolak hanyalah
 * MENYIMPAN kata sandi dari layar (gagal-tertutup — tidak pernah tersimpan
 * mentah). Kunci yang SALAH BENTUK adalah cerita lain: ia terlihat benar
 * sampai seseorang mencoba menyimpan, jadi disuarakan di sini.
 */
const settingsKey = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
if (!settingsKey) {
  console.warn(
    "WARNING: SETTINGS_ENCRYPTION_KEY belum diset — pengaturan surel di /operator/mail " +
      "akan MENOLAK menyimpan kata sandi SMTP (surel tetap jalan lewat env). " +
      "Buat kunci dengan: openssl rand -hex 32"
  );
} else if (!/^[0-9a-fA-F]{64}$/.test(settingsKey)) {
  console.error(
    "ERROR: SETTINGS_ENCRYPTION_KEY harus 64 karakter heksadesimal (32 byte). " +
      "Buat dengan: openssl rand -hex 32"
  );
  process.exit(1);
}

if (process.env.NODE_ENV !== "production") {
  console.error(
    "ERROR: NODE_ENV must be 'production' for this app (current:",
    process.env.NODE_ENV ?? "unset",
    ")"
  );
  console.error("Add NODE_ENV=production to .env or run: bun run start:prod");
  process.exit(1);
}

console.log("Environment check OK (NODE_ENV=production)");
