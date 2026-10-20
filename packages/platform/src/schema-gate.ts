/**
 * GERBANG SKEMA SAAT BOOT (02 §12) — aplikasi MENOLAK MELAYANI bila
 * skema yang ditemuinya tidak sepadan dengan yang dibawa image-nya.
 *
 * ══ PENGAMAN YANG DIPINDAH, BUKAN DICABUT ══════════════════════════════════
 * Hari ini `app-customer` menunggu container `migrate` lewat
 * `service_completed_successfully`. Begitu pekerjaan latar menjadi LAYANAN yang
 * berjalan terus, pengaman itu hilang bersamanya: layanan yang berjalan terus
 * tidak pernah "selesai", jadi tidak ada lagi yang bisa ditunggu.
 *
 * Gerbangnya karena itu pindah ke DALAM aplikasi — dan di situ ia justru lebih
 * kuat: berlaku di orkestrator mana pun (termasuk mesin customer yang tidak
 * memakai compose kita), berlaku pada SETIAP restart, bukan hanya pada deploy,
 * dan bisa dibuat per perusahaan sehingga sejalan dengan expand/contract.
 *
 * ══ KENAPA INI PANTAS MEMBUAT APLIKASI DIAM ════════════════════════════════
 * Image yang lebih baru daripada skemanya akan menulis kolom yang belum ada.
 * Kegagalannya tidak seragam: halaman yang tidak menyentuh kolom baru tetap
 * bekerja sempurna, jadi yang terlihat adalah aplikasi yang "sebagian rusak" —
 * dan sebagian rusak pada pembukuan berarti ada angka yang masuk dan ada yang
 * diam-diam tidak. Lebih baik 503 yang jelas selama satu menit daripada satu
 * jam penulisan separuh.
 *
 * ⚠ Arah sebaliknya TIDAK memblokir. Skema yang MENDAHULUI image (rollback ke
 * versi lama setelah migration maju) dilaporkan tapi tetap dilayani: itu justru
 * keadaan yang disengaja saat rollback darurat, dan memblokirnya akan membuat
 * jalan keluar dari insiden ikut tertutup — expand/contract memang dirancang
 * supaya skema baru tetap bisa dibaca kode lama.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { vonisVersi, type RingkasanMigrasiDb, type StatusVersi } from "@sai/core/schema-version";

export interface SchemaGateVerdict {
  /** `false` = aplikasi harus menolak melayani. */
  serve: boolean;
  status: StatusVersi;
  /** Migration terakhir yang terpasang di basis data kendali. */
  found: string | null;
  /** Yang dibawa image ini. */
  expected: string;
  /** Kalimat untuk log & probe — menyebut tindakan, bukan hanya keadaan. */
  reason: string | null;
}

async function ringkasanKendali(): Promise<RingkasanMigrasiDb | null> {
  try {
    const rows = await controlDb.$queryRaw<{ terapan: bigint; menggantung: bigint; terakhir: string | null }[]>`
      SELECT COUNT(*)::bigint AS terapan,
             COUNT(*) FILTER (WHERE finished_at IS NULL)::bigint AS menggantung,
             MAX(migration_name) FILTER (WHERE finished_at IS NOT NULL) AS terakhir
        FROM _prisma_migrations`;
    const r = rows[0];
    if (!r) return null;
    return {
      terapan: Number(r.terapan),
      menggantung: Number(r.menggantung),
      terakhir: r.terakhir,
    };
  } catch {
    /* Tabel tidak ada, atau basis datanya tak terjangkau. Keduanya "tak
       terbaca" — dan dibedakan dari "tertinggal" dengan sengaja: basis data
       yang sedang restart tidak boleh terbaca sebagai skema yang kedaluwarsa. */
    return null;
  }
}

/**
 * Vonis gerbang untuk basis data KENDALI.
 *
 * Kendali dipilih sebagai gerbang boot karena ia satu-satunya basis data yang
 * PASTI ada di setiap pemasangan dan di setiap profil, dan karena ia yang
 * memuat registry perusahaan — tanpanya tidak ada satu buku pun yang bisa
 * dibuka, jadi memeriksanya tidak menambah ketergantungan baru.
 */
export async function schemaGateVerdict(): Promise<SchemaGateVerdict> {
  const expected = MIGRATION_TERAKHIR.control;
  const ringkasan = await ringkasanKendali();
  const status = vonisVersi(ringkasan, expected);
  const found = ringkasan?.terakhir ?? null;

  if (status === "tertinggal") {
    return {
      serve: false,
      status,
      found,
      expected,
      reason:
        `skema kendali TERTINGGAL: terpasang ${found ?? "(belum ada)"}, ` +
        `image ini membawa ${expected}. Jalankan \`bun run db:migrate:all\` ` +
        "sebelum melayani — image yang lebih baru daripada skemanya akan " +
        "menulis kolom yang belum ada, dan kegagalannya tidak seragam.",
    };
  }

  if (status === "menggantung") {
    return {
      serve: false,
      status,
      found,
      expected,
      reason:
        "ada migration yang MENGGANTUNG (dimulai, tidak pernah selesai). " +
        "Keadaan skemanya tidak diketahui, dan menulis ke skema yang tidak " +
        "diketahui bentuknya lebih buruk daripada diam.",
    };
  }

  if (status === "tak_terbaca") {
    /* TIDAK memblokir: basis data yang belum siap saat container baru naik
       adalah keadaan normal selama beberapa detik, dan memblokirnya akan
       membuat setiap deploy gagal berdasarkan perlombaan waktu. Probe kendali
       yang sudah ada (`health-report`) yang menangani "benar-benar tak
       terjangkau", dan ia memang menjawab 503. */
    return {
      serve: true,
      status,
      found,
      expected,
      reason: "riwayat migration kendali belum bisa dibaca — dibiarkan melayani; probe kendali yang memutuskan",
    };
  }

  if (status === "mendahului") {
    return {
      serve: true,
      status,
      found,
      expected,
      reason:
        `skema kendali MENDAHULUI image (terpasang ${found}, image ${expected}). ` +
        "Dilayani apa adanya: ini keadaan rollback yang disengaja, dan " +
        "expand/contract memang dirancang supaya skema baru tetap terbaca kode lama.",
    };
  }

  return { serve: true, status, found, expected, reason: null };
}
