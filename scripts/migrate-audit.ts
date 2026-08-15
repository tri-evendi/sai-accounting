/**
 * PEMINDAHAN JEJAK AUDIT (issue #370) — dari `data/audit/<slug>/audit.jsonl`
 * ke tabel `audit_logs` di basis data perusahaan masing-masing.
 *
 *   bun run migrate:audit            # laporan saja, tidak menulis apa pun
 *   bun run migrate:audit --apply    # benar-benar memindahkan
 *
 * ══ DIBACA BARIS DEMI BARIS ════════════════════════════════════════════════
 * Lewat `readline` di atas `createReadStream`, BUKAN `readFile`. Itu bukan
 * kerapian: membaca berkas utuh ke memori adalah persis keluhan yang membuat
 * issue ini ada, dan skrip pemindahnya akan menemuinya dalam bentuk paling
 * parah — berkas terbesar yang pernah ada, di mesin yang sedang menjalankan
 * produksi.
 *
 * ══ IDEMPOTEN LEWAT CONSTRAINT ═════════════════════════════════════════════
 * `audit_logs.legacy_id` UNIK. Penyisipan memakai `skipDuplicates`, jadi
 * menjalankan skrip ini dua kali tidak bisa menggandakan satu baris pun —
 * jaminan dari basis data, bukan dari periksa-lalu-tulis yang bisa kalah
 * balapan (doktrin yang sama dengan `payments.gateway_ref`).
 *
 * Entri lama yang TIDAK punya `id` (berkas pra-#104) diberi id turunan yang
 * DETERMINISTIK dari nomor baris + isinya, sehingga menjalankan ulang skrip
 * menghasilkan nilai yang sama — dan `skipDuplicates` tetap bekerja.
 *
 * ══ BERKASNYA DIGANTI NAMA, TIDAK DIHAPUS ══════════════════════════════════
 * Menjadi `audit.jsonl.dipindahkan`. Menghapus jejak audit sebagai langkah
 * otomatis adalah persis kebalikan dari alasan jejak itu ada; yang menghapusnya
 * harus manusia yang sudah memeriksa hasilnya.
 */

import "dotenv/config";
import { createReadStream } from "node:fs";
import { rename, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import path from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaClient as CompanyClient } from "../src/generated/prisma/client.js";

const APPLY = process.argv.includes("--apply");
const AUDIT_ROOT = path.join(process.cwd(), "data", "audit");
/** Sisipkan per potongan — bukan satu `createMany` raksasa di akhir. */
const BATCH = 500;

function adapterFor(rawUrl: string, database?: string): PrismaMariaDb {
  const url = new URL(rawUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ?? url.pathname.replace(/^\//, ""),
    connectionLimit: 2,
  });
}

const controlClient = (url: string) => new ControlClient({ adapter: adapterFor(url) });
const companyClient = (url: string, database: string) =>
  new CompanyClient({ adapter: adapterFor(url, database) });

/** Bentuk entri di berkas JSONL. Semuanya opsional — berkas lama beragam. */
interface LegacyEntry {
  id?: unknown;
  userId?: unknown;
  username?: unknown;
  role?: unknown;
  action?: unknown;
  entity?: unknown;
  entityId?: unknown;
  details?: unknown;
  ipAddress?: unknown;
  createdAt?: unknown;
}

type Row = {
  legacyId: string;
  userId: string;
  username: string;
  role: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.slice(0, max) : null;

/**
 * Satu baris JSONL → satu baris tabel, atau `null` bila barisnya tak bisa
 * dipakai. Baris rusak DILEWATI, tidak menggagalkan pemindahan — sifat yang
 * sama dengan pembaca lamanya.
 */
function toRow(line: string, lineNumber: number): Row | null {
  let parsed: LegacyEntry;
  try {
    parsed = JSON.parse(line) as LegacyEntry;
  } catch {
    return null;
  }

  const action = text(parsed.action, 50);
  const entity = text(parsed.entity, 50);
  if (!action || !entity) return null;

  const legacyId =
    text(parsed.id, 40) ??
    // Turunan deterministik: baris yang sama menghasilkan id yang sama pada
    // setiap jalannya, jadi `skipDuplicates` tetap menjaga idempotensi.
    `L${lineNumber}-${createHash("sha1").update(line).digest("hex").slice(0, 30)}`;

  const rawDate = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;

  return {
    legacyId,
    userId: text(parsed.userId, 64) ?? "0",
    username: text(parsed.username, 50) ?? "(tidak tercatat)",
    role: text(parsed.role, 50),
    action,
    entity,
    entityId: typeof parsed.entityId === "number" ? parsed.entityId : null,
    details:
      parsed.details && typeof parsed.details === "object"
        ? JSON.stringify(parsed.details)
        : null,
    ipAddress: text(parsed.ipAddress, 45),
    // Tanggal yang tak terbaca jatuh ke epoch, BUKAN ke "sekarang": entri lama
    // yang tiba-tiba bertanggal hari ini akan berbohong tentang kapan sesuatu
    // terjadi — kebohongan yang paling tidak boleh ada di jejak audit.
    createdAt: rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate : new Date(0),
  };
}

interface Tally {
  inserted: number;
  skipped: number;
  corrupt: number;
}

async function migrateCompany(
  controlUrl: string,
  company: { id: number; slug: string; databaseName: string }
): Promise<Tally | null> {
  const file = path.join(AUDIT_ROOT, company.slug, "audit.jsonl");
  try {
    if (!(await stat(file)).isFile()) return null;
  } catch {
    return null; // Tidak punya berkas jejak — perusahaan baru, atau sudah pindah.
  }

  const db = companyClient(controlUrl, company.databaseName);
  const tally: Tally = { inserted: 0, skipped: 0, corrupt: 0 };
  let batch: Row[] = [];

  async function flush() {
    if (batch.length === 0) return;
    if (APPLY) {
      const result = await db.auditLog.createMany({ data: batch, skipDuplicates: true });
      tally.inserted += result.count;
      tally.skipped += batch.length - result.count;
    } else {
      tally.inserted += batch.length;
    }
    batch = [];
  }

  try {
    const reader = createInterface({
      input: createReadStream(file, "utf8"),
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    let lineNumber = 0;
    for await (const raw of reader) {
      lineNumber++;
      const line = raw.trim();
      if (!line) continue;

      const row = toRow(line, lineNumber);
      if (!row) {
        tally.corrupt++;
        continue;
      }
      batch.push(row);
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    if (APPLY) await rename(file, `${file}.dipindahkan`);
  } finally {
    await db.$disconnect();
  }

  return tally;
}

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlUrl) {
    console.error("ERROR: CONTROL_DATABASE_URL belum diset di .env");
    process.exit(1);
  }

  const control = controlClient(controlUrl);
  const companies = await control.company.findMany({
    select: { id: true, slug: true, databaseName: true },
    orderBy: { id: "asc" },
  });

  console.log(
    APPLY
      ? `Memindahkan jejak audit ${companies.length} perusahaan ke tabel audit_logs`
      : `PRATINJAU (tanpa --apply — tidak ada yang ditulis). ${companies.length} perusahaan.`
  );

  const total: Tally = { inserted: 0, skipped: 0, corrupt: 0 };
  let withFile = 0;

  for (const company of companies) {
    const tally = await migrateCompany(controlUrl, company);
    if (!tally) {
      console.log(`  ${company.slug}: tidak ada berkas jejak`);
      continue;
    }
    withFile++;
    total.inserted += tally.inserted;
    total.skipped += tally.skipped;
    total.corrupt += tally.corrupt;
    console.log(
      `  ${company.slug}: ${tally.inserted} disisipkan, ${tally.skipped} sudah ada, ` +
        `${tally.corrupt} baris rusak dilewati`
    );
  }

  console.log(
    `\nTotal: ${total.inserted} disisipkan · ${total.skipped} sudah ada · ` +
      `${total.corrupt} baris rusak · ${withFile} perusahaan punya berkas`
  );

  /*
   * Berkas pra-multi-perusahaan. `scripts/adopt-existing-company.ts`
   * memindahkannya ke folder slug perusahaan yang mengadopsinya — kalau ia
   * masih ada di akar, adopsinya belum dijalankan, dan memutuskan buku SIAPA
   * isinya bukan wewenang skrip ini.
   */
  try {
    await stat(path.join(AUDIT_ROOT, "audit.jsonl"));
    console.log(
      `\n⚠ ${path.join(AUDIT_ROOT, "audit.jsonl")} masih ada — jejak pra-multi-PT.\n` +
        "  Ia TIDAK dipindahkan: pemiliknya ditentukan `bun run adopt-company`,\n" +
        "  yang memindahkannya ke folder slug PT yang mengadopsi. Jalankan itu dulu."
    );
  } catch {
    // Tidak ada — pemasangan yang lahir sesudah multi-perusahaan.
  }

  if (!APPLY && total.inserted > 0) {
    console.log("\nJalankan ulang dengan --apply untuk benar-benar memindahkannya.");
  }

  await control.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
