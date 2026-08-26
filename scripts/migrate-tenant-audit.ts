/**
 * Pindahkan jejak audit TINGKAT TENANT dari berkas ke tabel (issue #484).
 *
 * Cerminan `scripts/migrate-audit.ts` (#370), dengan tiga perbedaan yang lahir
 * dari rumahnya:
 *
 *   1. Tujuannya basis data KENDALI, bukan buku sebuah PT — jadi ia berjalan
 *      SEKALI, bukan sekali per perusahaan.
 *   2. Sumbernya `data/audit/tenants/<slug>/audit.jsonl`, satu direktori per
 *      tenant.
 *   3. Tabelnya TANPA foreign key ke `tenants`. Jejak ini mencatat penghapusan
 *      tenant; baris untuk tenant yang sudah tiada tetap boleh — dan memang
 *      harus — masuk.
 *
 * ══ IDEMPOTEN LEWAT CONSTRAINT, BUKAN PERIKSA-LALU-TULIS ═══════════════════
 * `tenant_audit_logs.legacy_id` UNIK dan diisi dari `id` entri JSONL
 * (`<epoch>-<acak>`). Penyisipan memakai `skipDuplicates`, jadi menjalankan
 * skrip ini dua kali tidak menggandakan apa pun — tanpa perlu membaca dulu.
 *
 * ══ BERKAS LAMA DIGANTI NAMA, TIDAK DIHAPUS ════════════════════════════════
 * Menjadi `audit.jsonl.dipindahkan`. Menghapus jejak audit sebagai langkah
 * otomatis adalah kebalikan dari alasan jejak itu ada.
 *
 * Jalankan SESUDAH `bun run db:migrate:all` — tabelnya lahir dari migration
 * `0017_tenant_audit_logs`, isinya dari skrip ini.
 *
 *   bun run migrate:tenant-audit            # laporan saja
 *   bun run migrate:tenant-audit --apply    # benar-benar memindahkan
 */
import { readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";

import { controlDb } from "@/lib/control-db";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

const ROOT =
  process.env.TENANT_AUDIT_DIR ?? path.join(process.cwd(), "data", "audit", "tenants");

interface LegacyEntry {
  id?: string;
  tenantId?: number;
  tenantSlug?: string;
  userId?: string;
  username?: string;
  tenantRole?: string;
  action?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: string;
}

/** Baris yang siap disisipkan, atau `null` bila entrinya tak bisa dipercaya. */
function toRow(raw: LegacyEntry, slugFromDir: string) {
  /*
   * `id` lama adalah SATU-SATUNYA pegangan idempotensi. Entri tanpa id tidak
   * bisa dijamin tidak tergandakan pada jalan kedua, jadi ia dilewati dan
   * DILAPORKAN — bukan disisipkan diam-diam.
   */
  if (!raw.id || !raw.action) return null;

  const created = raw.createdAt ? new Date(raw.createdAt) : null;
  return {
    legacyId: raw.id.slice(0, 40),
    tenantId: Number.isFinite(raw.tenantId) ? Number(raw.tenantId) : 0,
    /* Slug dari isi entri bila ada; kalau tidak, dari nama direktorinya —
       itulah asal-usul yang sama yang dipakai pembacanya dulu. */
    tenantSlug: (raw.tenantSlug || slugFromDir).slice(0, 63),
    userId: String(raw.userId ?? "system").slice(0, 64),
    username: String(raw.username ?? "system").slice(0, 100),
    tenantRole: raw.tenantRole ? String(raw.tenantRole).slice(0, 50) : null,
    action: String(raw.action).slice(0, 50),
    details: raw.details === undefined ? null : JSON.stringify(raw.details),
    ipAddress: raw.ipAddress ? String(raw.ipAddress).slice(0, 45) : null,
    createdAt: created && !Number.isNaN(created.getTime()) ? created : new Date(),
  };
}

async function main() {
  let dirs: string[];
  try {
    dirs = (await readdir(ROOT, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    console.log(`Tidak ada ${ROOT} — tidak ada yang dipindahkan.`);
    return;
  }

  let totalRead = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  let filesMoved = 0;

  for (const slug of dirs) {
    const file = path.join(ROOT, slug, "audit.jsonl");
    try {
      await stat(file);
    } catch {
      continue; // sudah dipindahkan, atau memang tak pernah ada
    }

    const raw = await readFile(file, "utf8");
    const rows: ReturnType<typeof toRow>[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      totalRead += 1;
      try {
        const row = toRow(JSON.parse(trimmed) as LegacyEntry, slug);
        if (row) rows.push(row);
        else totalSkipped += 1;
      } catch {
        /* Baris korup dilewati — jejak lain di sekitarnya tetap pindah. Satu
           baris rusak tidak boleh menahan seluruh berkas. */
        totalSkipped += 1;
      }
    }

    const clean = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    if (APPLY && clean.length > 0) {
      for (let i = 0; i < clean.length; i += BATCH) {
        const batch = clean.slice(i, i + BATCH);
        const res = await controlDb.tenantAuditLog.createMany({
          data: batch,
          skipDuplicates: true,
        });
        totalWritten += res.count;
      }
    }

    if (APPLY) {
      await rename(file, `${file}.dipindahkan`);
      filesMoved += 1;
    }

    console.log(
      `  ${slug}: ${clean.length} entri siap${APPLY ? `, ${totalWritten} tertulis kumulatif` : ""}`
    );
  }

  console.log("");
  console.log(`Dibaca      : ${totalRead}`);
  console.log(`Dilewati    : ${totalSkipped} (tanpa id / tanpa aksi / korup)`);
  if (APPLY) {
    console.log(`Tertulis    : ${totalWritten} (duplikat dilewati constraint)`);
    console.log(`Berkas      : ${filesMoved} diganti nama jadi *.dipindahkan`);
  } else {
    console.log("");
    console.log("LAPORAN SAJA — tidak ada yang ditulis.");
    console.log("Jalankan ulang dengan --apply untuk benar-benar memindahkan.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => controlDb.$disconnect());
