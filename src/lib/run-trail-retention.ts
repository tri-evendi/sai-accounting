/**
 * PEMANGKASAN JEJAK PUTARAN — dan EMPAT hal yang tidak boleh ikut terpangkas.
 *
 * ══ MASALAHNYA KECIL, TAPI TUMBUH SELAMANYA ═════════════════════════════════
 * `scheduler_runs` menulis satu baris per jam: ~8.760 baris per tahun, tanpa
 * batas, dan ikut dalam setiap dump cadangan. Per 11 Okt 2026 ia 1.251 baris
 * (1.246 `ok`, 5 `error`) — belum masalah, dan justru itulah saat yang tepat
 * untuk memasang aturannya, sebelum angkanya menjadi alasan untuk memangkas
 * dengan tergesa.
 *
 * ══ PEMANGKASAN NAIF MENGHAPUS BUKTI, BUKAN SAMPAH ══════════════════════════
 * `DELETE WHERE finished_at < cutoff` terlihat benar dan salah dalam dua cara
 * yang keduanya baru terasa pada hari insiden:
 *
 *   1. LAYANAN YANG SUDAH LAMA MATI kehilangan SELURUH jejaknya. Penjadwal yang
 *      berhenti 100 hari lalu punya baris terakhir berumur 100 hari — di luar
 *      ambang — jadi pemangkasan menghapus justru satu-satunya catatan KAPAN ia
 *      berhenti. Tabel yang kosong terbaca sebagai "belum pernah jalan"
 *      (`unknown`), bukan "berhenti pada tanggal X". Pemangkasan yang
 *      menyembunyikan kegagalan lebih buruk daripada tabel yang gemuk.
 *
 *   2. BUKTI KEBERHASILAN TERAKHIR hilang. `lib/health-report.ts` membaca baris
 *      `ok` TERAKHIR secara terpisah (`where: { status: "ok" }`) untuk menjawab
 *      "kapan terakhir berhasil". Kalau cadangan pernah berhasil sekali lalu
 *      gagal 90 hari berturut-turut, memangkas baris `ok` tua itu mengubah
 *      "berhasil terakhir 3 bulan lalu" — kalimat yang berguna — menjadi "tidak
 *      pernah berhasil". Keduanya buruk, tetapi yang kedua menghapus satu-
 *      satunya petunjuk bahwa mekanismenya pernah bekerja.
 *
 * ══ EMPAT ATURAN, DAN KEEMPATNYA MENANGGUNG BEBAN ═══════════════════════════
 *   1. Baris yang lebih BARU dari ambang selalu disimpan.
 *   2. Baris yang statusnya BUKAN `ok` disimpan TANPA BATAS WAKTU. Kegagalan
 *      dan temuan adalah baris yang paling berharga di tabel ini; memangkasnya
 *      berarti memangkas satu-satunya isi yang dibaca orang.
 *   3. Baris TERAKHIR di tabel selalu disimpan — menutup cacat (1).
 *   4. Baris `ok` TERAKHIR selalu disimpan — menutup cacat (2).
 *
 * Aturan 3 & 4 TIDAK diturunkan dari aturan 1: keduanya justru berlaku ketika
 * aturan 1 tidak lagi melindungi apa pun, yaitu saat seluruh tabel sudah lebih
 * tua dari ambang. Itu keadaan yang paling perlu dijelaskan, bukan yang paling
 * boleh dihapus.
 *
 * ══ MURNI, DAN ITU DISENGAJA ════════════════════════════════════════════════
 * Keputusan "baris mana yang dibuang" diuji sebagai FUNGSI — bukan lewat basis
 * data. Aturan penghapusan adalah tempat terakhir yang pantas diuji dengan
 * cara yang sulit diulang: sebuah `DELETE` yang salah tidak punya langkah
 * balik, dan satu-satunya yang tahu apakah aturannya benar adalah tesnya.
 */

/**
 * Berapa lama baris `ok` disimpan.
 *
 * 90 hari dipilih dari pemakaiannya, bukan dari selera: pertanyaan yang
 * dijawab tabel ini ("masih berdetak?", "apa yang terbit bulan lalu?",
 * "kapan ia mulai gagal?") semuanya berjangka pekan sampai kuartal. Di luar
 * itu yang dibaca orang adalah barisnya yang GAGAL — dan itu tidak pernah
 * dipangkas.
 */
export const TRAIL_RETENTION_DAYS = 90;

/** Satu baris jejak, sebanyak yang dibutuhkan keputusannya. */
export interface TrailRow {
  id: number;
  finishedAt: Date;
  /** `ok` = berhasil/bersih. Nilai lain (`error`, `findings`) tidak pernah dipangkas. */
  status: string;
}

export interface PruneDecision {
  /** Id yang boleh dihapus. Kosong = tidak ada yang perlu dikerjakan. */
  prune: number[];
  /** Id yang ditahan MESKI lebih tua dari ambang, beserta sebabnya. */
  kept: { id: number; reason: "status-bukan-ok" | "baris-terakhir" | "ok-terakhir" }[];
  /** Ambang yang dipakai, ikut dipulangkan supaya pemanggilnya tidak menebak. */
  cutoff: Date;
}

/**
 * Ambang waktu: baris `ok` yang lebih tua dari ini boleh dipangkas.
 *
 * Dipisah sebagai fungsi tersendiri supaya ia bisa diuji tanpa menyiapkan satu
 * baris pun — dan supaya pemanggil yang ingin MENYARING di SQL (bukan di
 * memori) memakai ambang yang sama, bukan menghitungnya ulang.
 */
export function trailCutoff(now: Date = new Date(), days: number = TRAIL_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 3_600_000);
}

/**
 * Putusan pemangkasan untuk SATU tabel jejak.
 *
 * Menerima SELURUH baris, dan itu disengaja pada skala ini: tabel terbesar
 * 1.251 baris per 11 Okt 2026, dan memutuskan di memori membuat keempat
 * aturannya terbaca sebagai satu daftar yang bisa diuji. Kalau kelak tabelnya
 * berukuran ratusan ribu, yang berubah adalah cara MENGAMBIL kandidatnya
 * (saring `finished_at < cutoff AND status = 'ok'` di SQL lebih dulu, lalu
 * lindungi dua baris dari `trailCutoff` + dua kueri `findFirst`) — bukan
 * aturannya.
 */
export function decideTrailPrune(
  rows: readonly TrailRow[],
  now: Date = new Date(),
  days: number = TRAIL_RETENTION_DAYS
): PruneDecision {
  const cutoff = trailCutoff(now, days);

  /* Urut dari yang TERBARU. `id` jadi pemutus saat stempel waktunya sama:
     dua putaran dalam milidetik yang sama tidak boleh membuat "baris terakhir"
     bergantung pada urutan yang dikembalikan basis data. */
  const terbaru = [...rows].sort(
    (a, b) => b.finishedAt.getTime() - a.finishedAt.getTime() || b.id - a.id
  );

  const barisTerakhir = terbaru[0]?.id;
  const okTerakhir = terbaru.find((r) => r.status === "ok")?.id;

  const prune: number[] = [];
  const kept: PruneDecision["kept"] = [];

  for (const row of rows) {
    const tua = row.finishedAt.getTime() < cutoff.getTime();
    if (!tua) continue; // aturan 1 — masih dalam ambang

    if (row.status !== "ok") {
      kept.push({ id: row.id, reason: "status-bukan-ok" }); // aturan 2
      continue;
    }
    if (row.id === barisTerakhir) {
      kept.push({ id: row.id, reason: "baris-terakhir" }); // aturan 3
      continue;
    }
    if (row.id === okTerakhir) {
      kept.push({ id: row.id, reason: "ok-terakhir" }); // aturan 4
      continue;
    }
    prune.push(row.id);
  }

  return { prune, kept, cutoff };
}
