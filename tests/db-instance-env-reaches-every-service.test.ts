/**
 * PENJAGA: env var instans basis data (tahap 4) sampai ke SETIAP layanan yang
 * membuka buku PT — lewat SATU jalan, yaitu grup `x-env.db-instances`
 * (anchor `*env-db-instances`) di `docker-compose.yml`.
 *
 * `db_instances.url_env_var` hanya menyebut NAMA env var; nilainya dibaca dari
 * environment proses (`packages/db/src/company-url.ts`, cermin Go-nya
 * `services/integrator/internal/db/instans.go`). Instans baru berarti satu
 * baris baru di `.env` DAN satu baris tanpa nilai di grup itu — dan baris itu
 * wajib sampai ke `app-customer`, `app-operator`, `migrate`, `svc-worker`,
 * `job-backup`, DAN `svc-integrator` sekaligus.
 *
 * Bentuk kegagalan yang dijaga tidak menghasilkan galat di tempat yang salah:
 * layanan yang tidak menerima env itu tetap jalan, lalu melempar hanya saat
 * membuka buku PT di instans tersebut. Untuk `svc-integrator` itu berarti buku PT
 * yang dipindah TIDAK dicadangkan (putarannya `error`, tapi baru ketahuan
 * sesudah pemindahan). Satu jalan masuk untuk semua layanan membuat "sampai ke
 * satu, terlewat di yang lain" tidak bisa terjadi:
 *
 *   1. Setiap layanan yang dibangun dari repo ini menggabungkan
 *      `*env-db-instances` ke `environment:`-nya.
 *      (Sampai Okt 2026 jalannya `env_file: .env`; itu dicabut karena membawa
 *      SELURUH rahasia ke setiap container — `tests/compose-env-allowlist.test.ts`.)
 *   2. Tidak satu berkas compose pun menulis `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE`
 *      di `environment:` sebuah layanan — penimpaan per layanan adalah persis
 *      cara satu nilai sampai ke satu layanan dan tidak ke yang lain.
 *
 * Akibat aturan 2: URL instans di `.env` dipakai apa adanya oleh SEMUA layanan,
 * jadi ia wajib LANGSUNG ke PostgreSQL (bukan PgBouncer) — `migrate` butuh
 * advisory lock sesi dan jalur `tenant` butuh `pg_database` utuh. Go menolak URL
 * instans yang menyatakan `pgbouncer=true`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { DB_INSTANCE_URL_ENV_PATTERN } from "@sai/db/db-instances";
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

/** Bentuk nama env var instans — `DB_INSTANCE_URL_ENV_PATTERN` (kontrak), tanpa jangkar. */
const ENV_INSTANS = new RegExp(`\\b${DB_INSTANCE_URL_ENV_PATTERN.source.slice(1, -1)}\\b`);

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
      "job-backup",
      "svc-worker",
      "svc-integrator",
      "app-customer",
      "app-operator",
    ]) {
      expect(LAYANAN_REPO, wajib).toContain(wajib);
    }
    expect(BERKAS_COMPOSE).toContain("docker-compose.yml");
  });

  it("setiap layanan yang dibangun dari repo ini menggabungkan `*env-db-instances`", () => {
    const tanpa = LAYANAN_REPO.filter(
      (s) => !/^\s+<<:\s*\[?[^\n]*\*env-db-instances\b/m.test(blok(DASAR, s))
    );
    expect(tanpa, "layanan tanpa `<<: *env-db-instances` tidak menerima env var instans").toEqual([]);
  });

  it("grup `x-env.db-instances` hanya berisi nama env instans, tanpa nilai", () => {
    const doc = load(read("docker-compose.yml")) as { "x-env"?: { "db-instances"?: Record<string, unknown> } };
    const grup = doc["x-env"]?.["db-instances"];
    expect(grup, "grup x-env.db-instances hilang").toBeDefined();
    for (const [nama, nilai] of Object.entries(grup ?? {})) {
      expect(nama).toMatch(DB_INSTANCE_URL_ENV_PATTERN);
      /* Nilainya dari `.env`. Nilai yang ditulis di sini = URL berkredensial di repo. */
      expect(nilai, nama).toBeNull();
    }
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

  it("tidak satu berkas compose pun menghidupkan lagi `env_file`", () => {
    /* `env_file:` mana pun membawa SELURUH berkasnya — termasuk rahasia yang
       tidak dibutuhkan layanan itu. */
    const pelanggar: string[] = [];
    for (const f of BERKAS_COMPOSE) {
      const isi = tanpaKomentar(read(f));
      for (const s of layanan(isi)) {
        if (/^\s+env_file:/m.test(blok(isi, s))) pelanggar.push(`${f} → ${s}`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("pola nama env var di penjaga ini sama dengan penyelesai TS dan Go", () => {
    /* Sejak `contract/db-instances.yaml` keduanya MEMBACA pola bangkitan —
       kesamaan teksnya dijaga `tests/contract-db-instances.test.ts`. Yang
       diperiksa di sini: keduanya memang membacanya, bukan menulis sendiri. */
    const ts = read("packages/db/src/company-url.ts");
    const go = read("services/integrator/internal/db/instans.go");
    expect(ts).toContain('from "./generated/db-instances"');
    expect(go).toContain("regexp.MustCompile(contract.DBInstanceURLEnvPattern)");
    expect(ENV_INSTANS.test("COMPANY_DB2_DATABASE_URL_TEMPLATE")).toBe(true);
    // Env instans BAWAAN dan replika baca bukan env instans tambahan.
    expect(ENV_INSTANS.test("COMPANY_DATABASE_URL_TEMPLATE")).toBe(false);
    expect(ENV_INSTANS.test("COMPANY_DATABASE_READ_URL_TEMPLATE")).toBe(false);
  });
});
