/**
 * PENJAGA: env var instans basis data (tahap 4) sampai ke SETIAP layanan yang
 * membuka buku PT — lewat SATU jalan, yaitu `env_file: .env`.
 *
 * `db_instances.url_env_var` hanya menyebut NAMA env var; nilainya dibaca dari
 * environment proses (`packages/db/src/company-url.ts`, cermin Go-nya
 * `services/integrator/internal/db/instans.go`). Instans baru berarti satu
 * baris baru di `.env` — dan baris itu wajib sampai ke `app-customer`,
 * `app-operator`, `migrate`, `svc-*`, `job-*`, DAN `svc-tenant` sekaligus.
 *
 * Bentuk kegagalan yang dijaga tidak menghasilkan galat di tempat yang salah:
 * layanan yang tidak menerima env itu tetap jalan, lalu melempar hanya saat
 * membuka buku PT di instans tersebut. Untuk `svc-tenant` itu berarti buku PT
 * yang dipindah TIDAK dicadangkan (putarannya `error`, tapi baru ketahuan
 * sesudah pemindahan). Satu jalan masuk untuk semua layanan membuat "sampai ke
 * satu, terlewat di yang lain" tidak bisa terjadi:
 *
 *   1. Setiap layanan yang dibangun dari repo ini memakai `env_file: .env`.
 *   2. Tidak satu berkas compose pun menulis `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE`
 *      di `environment:` — penimpaan per layanan adalah persis cara satu nilai
 *      sampai ke satu layanan dan tidak ke yang lain.
 *
 * Akibat aturan 2: URL instans di `.env` dipakai apa adanya oleh SEMUA layanan,
 * jadi ia wajib LANGSUNG ke PostgreSQL (bukan PgBouncer) — `migrate` butuh
 * advisory lock sesi dan `svc-tenant` butuh `pg_database` utuh. Go menolak URL
 * instans yang menyatakan `pgbouncer=true`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";

const read = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");
const tanpaKomentar = (text: string) =>
  text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

/** Nama layanan di bawah `services:` (indentasi dua spasi). */
function layanan(text: string): string[] {
  const lines = text.split("\n");
  const mulai = lines.findIndex((l) => l === "services:");
  if (mulai < 0) return [];
  const out: string[] = [];
  for (let i = mulai + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\S/.test(l)) break;
    const m = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(l);
    if (m) out.push(m[1]!);
  }
  return out;
}

/** Blok satu layanan (berbasis indentasi dua spasi). */
function blok(text: string, service: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l === `  ${service}:`);
  if (i < 0) return "";
  const end = lines.findIndex((l, j) => j > i && /^ {0,2}\S/.test(l));
  return lines.slice(i, end < 0 ? undefined : end).join("\n");
}

/** Bentuk nama env var instans — sama dengan `DB_INSTANCE_URL_ENV_PATTERN`. */
const ENV_INSTANS = /\bCOMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE\b/;

const BERKAS_COMPOSE = readdirSync(AKAR_REPO).filter((f) => /^docker-compose(\..+)?\.ya?ml$/.test(f));
const DASAR = tanpaKomentar(read("docker-compose.yml"));

/** Layanan yang DIBANGUN dari repo ini — merekalah yang membuka buku. */
const LAYANAN_REPO = layanan(DASAR).filter((s) => {
  const b = blok(DASAR, s);
  return /^\s+build:/m.test(b) || b.includes("${SAI_IMAGE");
});

describe("env var instans basis data: satu jalan masuk untuk semua layanan", () => {
  it("compose dasar terbaca, dan layanan pembuka buku ditemukan", () => {
    /* Penjaga yang tidak menemukan apa pun lulus dengan nol pelanggar. */
    for (const wajib of [
      "migrate",
      "job-scheduler",
      "job-conformance",
      "job-backup",
      "svc-ledger",
      "svc-interactive",
      "svc-tenant",
      "app-customer",
      "app-operator",
    ]) {
      expect(LAYANAN_REPO, wajib).toContain(wajib);
    }
    expect(BERKAS_COMPOSE).toContain("docker-compose.yml");
  });

  it("setiap layanan yang dibangun dari repo ini memakai `env_file: .env`", () => {
    const tanpa = LAYANAN_REPO.filter((s) => !/^\s+env_file: \.env\s*$/m.test(blok(DASAR, s)));
    expect(tanpa, "layanan tanpa `env_file: .env` tidak menerima env var instans").toEqual([]);
  });

  it("tidak satu berkas compose pun menimpa env var instans per layanan", () => {
    const pelanggar: string[] = [];
    for (const f of BERKAS_COMPOSE) {
      const isi = tanpaKomentar(read(f));
      for (const s of layanan(isi)) {
        const b = blok(isi, s);
        const m = ENV_INSTANS.exec(b);
        if (m) pelanggar.push(`${f} → ${s}: ${m[0]}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("tidak satu berkas override pun mengganti `env_file` layanan repo", () => {
    /* `env_file:` di override MENGGANTI daftar dasar — layanan itu lalu tidak
       lagi membaca `.env` yang sama dengan layanan lain. */
    const pelanggar: string[] = [];
    for (const f of BERKAS_COMPOSE.filter((x) => x !== "docker-compose.yml")) {
      const isi = tanpaKomentar(read(f));
      for (const s of layanan(isi)) {
        const b = blok(isi, s);
        if (/^\s+env_file:/m.test(b) && !/^\s+env_file: \.env\s*$/m.test(b)) {
          pelanggar.push(`${f} → ${s}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("pola nama env var di penjaga ini sama dengan penyelesai TS dan Go", () => {
    const ts = read("packages/db/src/company-url.ts");
    const go = read("services/integrator/internal/db/instans.go");
    const pola = "^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE$";
    expect(ts).toContain(`/${pola}/`);
    expect(go).toContain("`" + pola + "`");
    expect(ENV_INSTANS.test("COMPANY_DB2_DATABASE_URL_TEMPLATE")).toBe(true);
    // Env instans BAWAAN dan replika baca bukan env instans tambahan.
    expect(ENV_INSTANS.test("COMPANY_DATABASE_URL_TEMPLATE")).toBe(false);
    expect(ENV_INSTANS.test("COMPANY_DATABASE_READ_URL_TEMPLATE")).toBe(false);
  });
});
