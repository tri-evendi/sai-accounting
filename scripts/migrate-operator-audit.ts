/**
 * Pindahkan jejak audit BIDANG OPERATOR dari berkas ke tabel
 * (migration platform 0002; syarat pemisahan `apps/operator`, dok 14 §5).
 *
 * Cerminan `scripts/migrate-tenant-audit.ts` (#484):
 *   - Sumber: `data/audit/operators/audit.jsonl` (atau `OPERATOR_AUDIT_DIR`).
 *   - Tujuan: `sai_platform.operator_audit_logs`.
 *   - IDEMPOTEN lewat `legacy_id` UNIK + `skipDuplicates`, bukan
 *     periksa-lalu-tulis: dua kali jalan tidak menggandakan apa pun.
 *   - Berkas lama DIGANTI NAMA menjadi `audit.jsonl.dipindahkan`, TIDAK
 *     dihapus: menghapus jejak audit secara otomatis adalah kebalikan dari
 *     alasan jejak itu ada.
 *
 * Jalankan SESUDAH `bun run db:migrate:all`. Image `runner` (app-operator)
 * TIDAK memuat `scripts/` maupun `tsx`, jadi jalankan lewat image `migrator`
 * dengan volume `audit` DIPASANG — nama lengkapnya ber-awalan proyek; nama
 * polos `audit` akan membuat volume BARU yang kosong dan melaporkan "tidak ada
 * yang dipindahkan":
 *
 *   docker compose run --rm -v sai-accounting_audit:/app/data/audit \
 *     migrate bun run migrate:operator-audit            # laporan saja
 *   docker compose run --rm -v sai-accounting_audit:/app/data/audit \
 *     migrate bun run migrate:operator-audit --apply    # memindahkan
 */
import "dotenv/config";
import { readFile, rename } from "node:fs/promises";
import path from "node:path";

import { platformDb } from "@/lib/platform-db";
import {
  operatorAuditRowFromLegacy,
  type LegacyOperatorEntry,
  type OperatorAuditRow,
} from "@/lib/operator/audit-legacy";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

const DIR =
  process.env.OPERATOR_AUDIT_DIR ?? path.join(process.cwd(), "data", "audit", "operators");
const FILE = path.join(DIR, "audit.jsonl");

async function main() {
  let raw: string;
  try {
    raw = await readFile(FILE, "utf8");
  } catch {
    console.log(`Tidak ada ${FILE} — tidak ada yang dipindahkan.`);
    return;
  }

  let read = 0;
  let skipped = 0;
  const rows: OperatorAuditRow[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    read += 1;
    try {
      const row = operatorAuditRowFromLegacy(JSON.parse(trimmed) as LegacyOperatorEntry);
      if (row) rows.push(row);
      else skipped += 1;
    } catch {
      /* Baris korup dilewati — jejak lain di sekitarnya tetap pindah. */
      skipped += 1;
    }
  }

  let written = 0;
  if (APPLY) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const res = await platformDb.operatorAuditLog.createMany({
        data: rows.slice(i, i + BATCH),
        skipDuplicates: true,
      });
      written += res.count;
    }
    /* Bukti SEBELUM berkas diganti nama: setiap legacy_id yang siap memang
       ada di tabel. Ganti nama tanpa bukti ini bisa "memindahkan" jejak ke
       ketiadaan bila sebagian sisipan gagal tanpa melempar. */
    const ids = rows.map((r) => r.legacyId);
    let present = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      present += await platformDb.operatorAuditLog.count({
        where: { legacyId: { in: ids.slice(i, i + BATCH) } },
      });
    }
    if (present !== new Set(ids).size) {
      throw new Error(
        `Hanya ${present} dari ${new Set(ids).size} entri ada di tabel — berkas TIDAK diganti nama.`
      );
    }
    await rename(FILE, `${FILE}.dipindahkan`);
  }

  console.log(`Berkas      : ${FILE}`);
  console.log(`Dibaca      : ${read}`);
  console.log(`Siap        : ${rows.length}`);
  console.log(`Dilewati    : ${skipped} (tanpa id / tanpa aksi / waktu rusak / korup)`);
  if (APPLY) {
    console.log(`Tertulis    : ${written} (duplikat dilewati constraint)`);
    console.log(`Berkas lama : diganti nama jadi audit.jsonl.dipindahkan`);
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
  .finally(() => platformDb.$disconnect());
