/**
 * KLASIFIKASI BUKU: PRODUKSI atau UJI — dengan dasar yang BUKAN NAMANYA.
 *
 * ══ MASALAH YANG DISELESAIKAN ═══════════════════════════════════════════════
 * Instans produksi memuat buku yang namanya berpola uji (`..._uji_wisaya_416`,
 * `..._data_dummy`, `..._demo`) dan beberapa kelompok nama yang nyaris kembar
 * (`pt_saro`, `pt_saroo`, `pt_saro_sejati`). Dua hal menjadi tidak bisa
 * dijawab tanpa menebak: temuan `check-data-conformance` mana yang tentang data
 * SUNGGUHAN, dan buku mana yang sebenarnya tidak dipakai siapa pun.
 *
 * ⚠ NAMA BUKAN BUKTI, dan itu sebabnya modul ini ada. `sai_t4_sai` dan
 * `sai_t4_selamat` terdengar seperti uji tetapi bisa saja buku sungguhan;
 * `sai_t5_pt_rio_alexander_silaban` terdengar sungguhan tetapi bisa saja
 * percobaan. Satu-satunya dasar yang jujur adalah ISI bukunya.
 *
 * ══ YANG DIPAKAI SEBAGAI BUKTI ══════════════════════════════════════════════
 * Dua tanda yang tidak bisa dipalsukan oleh penamaan:
 *
 *   • PELANGGAN & KONTRAK NYATA — baris yang namanya TIDAK bertanda `[CONTOH]`.
 *     Wisaya penyiapan menyemai data contoh ke setiap PT baru, dan semuanya
 *     bertanda; apa pun di luar itu diketik orang.
 *
 *   • BENTUK SEMAI. Semai itu punya bentuk yang tetap — 28 dokumen
 *     (12 kas + 7 faktur + 5 pembayaran + 4 pemasok) + 1 saldo awal. Buku yang
 *     jurnalnya PERSIS sebentuk itu belum pernah dipakai; yang melebihinya
 *     punya aktivitas tambahan.
 *
 * Dan satu tanda turunan yang menjelaskan banyak hal: `reversal` dalam jumlah
 * besar (~28) adalah jejak data contoh yang DIBERSIHKAN (izin `sample.clear`).
 * Buku seperti itu pernah disiapkan, lalu dikosongkan — dan itu pola percobaan,
 * bukan pola pemakaian.
 *
 * ══ MODUL INI TIDAK PERNAH MENYARANKAN PENGHAPUSAN ══════════════════════════
 * Keluarannya klasifikasi, bukan rekomendasi. Menghapus basis data tidak bisa
 * dibalik, dan "tampaknya tidak dipakai" bukan dasar yang memadai untuk
 * tindakan yang tak bisa dibalik — buku yang tidur enam bulan tetap buku
 * seseorang. Yang boleh diotomatiskan hanya MENGETAHUINYA.
 *
 * MURNI: tanpa Prisma, tanpa I/O. Diuji langsung.
 */

/** Bentuk semai wisaya penyiapan, per 11 Okt 2026. */
export const SEED_DOCUMENT_COUNT = 28;

/** Ambang "punya data sungguhan" — di atas ini, bukunya jelas dipakai orang. */
export const REAL_DATA_THRESHOLD = 5;

/** Bukti yang dibaca dari satu buku. Semuanya hasil `COUNT(*)`. */
export interface BookEvidence {
  databaseName: string;
  /** Baris yang namanya TIDAK bertanda `[CONTOH]`. */
  realCustomers: number;
  realContracts: number;
  /** Jurnal bertanda `[CONTOH]` di catatannya. */
  sampleJournals: number;
  /** Jurnal selain itu — termasuk saldo awal & pembalikan. */
  otherJournals: number;
  /** Jurnal `type = 'reversal'` — jejak data contoh yang dibersihkan. */
  reversalJournals: number;
  /** Hari sejak aktivitas terakhir (jurnal atau jejak audit). `null` = tak pernah. */
  daysSinceActivity: number | null;
}

export type BookClass =
  /** Data pelanggan sungguhan dalam jumlah berarti. Perlakukan sebagai buku nyata. */
  | "produksi"
  /** Ada aktivitas di luar semai, tetapi datanya sedikit. Bisa percobaan, bisa pelanggan baru. */
  | "dipakai-ringan"
  /** Isinya hanya semai wisaya (ada jurnal bertanda `[CONTOH]`) — belum dipakai. */
  | "semai-saja"
  /**
   * Beberapa jurnal, TANPA satu pun tanda semai. Dibuka, dicoba sedikit,
   * ditinggalkan.
   *
   * Dibedakan dari `semai-saja` karena sebabnya berbeda: yang satu berisi data
   * yang DISEMAI sistem, yang satu berisi data yang DIKETIK orang — sedikit,
   * tapi diketik. Menyatukannya akan membuat buku kedua dilaporkan "≈ bentuk
   * semai" padahal nol barisnya bertanda `[CONTOH]`, dan alasan yang salah
   * lebih buruk daripada kelas yang kurang halus.
   */
  | "nyaris-kosong"
  /** Semai pernah disemai lalu DIBERSIHKAN. Pola percobaan. */
  | "semai-dibersihkan"
  /** Nol jurnal. Dibuat, tidak pernah dipakai. */
  | "kosong";

export interface BookVerdict {
  databaseName: string;
  klass: BookClass;
  /** Kalimat yang menyebut BUKTI-nya, bukan namanya. */
  reason: string;
  /** Apakah temuan kesesuaian dari buku ini layak dipercaya sebagai data nyata. */
  conformanceRelevant: boolean;
}

/**
 * Putusan untuk satu buku.
 *
 * Urutannya menentukan, dan sengaja begini: data pelanggan sungguhan
 * MENGALAHKAN setiap tanda lain. Buku yang punya 66 pelanggan nyata tetap buku
 * produksi walau ia juga menyimpan sisa semai — dan keliru ke arah ini jauh
 * lebih murah daripada keliru ke arah sebaliknya.
 */
export function classifyBook(e: BookEvidence): BookVerdict {
  const nyata = e.realCustomers + e.realContracts;
  const totalJurnal = e.sampleJournals + e.otherJournals;

  if (nyata > REAL_DATA_THRESHOLD) {
    return {
      databaseName: e.databaseName,
      klass: "produksi",
      reason: `${e.realCustomers} pelanggan + ${e.realContracts} kontrak nyata (bukan [CONTOH])`,
      conformanceRelevant: true,
    };
  }

  if (totalJurnal === 0) {
    return {
      databaseName: e.databaseName,
      klass: "kosong",
      reason: "nol jurnal — dibuat, tidak pernah dipakai",
      conformanceRelevant: false,
    };
  }

  /* Pembalikan sebanyak bentuk semai = data contoh yang dibersihkan. Diperiksa
     SEBELUM "semai-saja": buku yang semainya sudah dibersihkan punya jejak yang
     berbeda, dan menyatukan keduanya menghilangkan petunjuk bahwa seseorang
     pernah membereskannya dengan sengaja. */
  if (e.reversalJournals >= SEED_DOCUMENT_COUNT - 2) {
    return {
      databaseName: e.databaseName,
      klass: "semai-dibersihkan",
      reason: `${e.reversalJournals} pembalikan ≈ bentuk semai (${SEED_DOCUMENT_COUNT}) — data contoh disemai lalu dibersihkan`,
      conformanceRelevant: false,
    };
  }

  /*
   * SEMAI vs NYARIS-KOSONG. Pembedanya tanda `[CONTOH]`, bukan jumlah jurnal.
   *
   * Versi pertama aturan ini memakai `totalJurnal <= SEED + 2` untuk keduanya,
   * dan akibatnya buku dengan 5 jurnal yang NOL bertanda `[CONTOH]` dilaporkan
   * "≈ bentuk semai" — alasan yang tidak benar tentang buku yang isinya justru
   * diketik orang. Terlihat saat menjalankannya di produksi, dan diperbaiki
   * karena seluruh guna modul ini adalah alasan yang bisa dipercaya.
   */
  if (e.sampleJournals > 0 && (e.otherJournals <= 2 || totalJurnal <= SEED_DOCUMENT_COUNT + 2)) {
    return {
      databaseName: e.databaseName,
      klass: "semai-saja",
      reason:
        `${totalJurnal} jurnal, ${e.sampleJournals} bertanda [CONTOH] ≈ bentuk semai` +
        `, ${nyata} data nyata`,
      conformanceRelevant: false,
    };
  }

  if (e.sampleJournals === 0 && totalJurnal <= SEED_DOCUMENT_COUNT + 2) {
    return {
      databaseName: e.databaseName,
      klass: "nyaris-kosong",
      reason:
        `${totalJurnal} jurnal, NOL bertanda [CONTOH], ${nyata} data nyata` +
        " — diketik orang, bukan disemai sistem" +
        (e.daysSinceActivity != null ? `; aktivitas terakhir ${e.daysSinceActivity} hari lalu` : ""),
      conformanceRelevant: false,
    };
  }

  return {
    databaseName: e.databaseName,
    klass: "dipakai-ringan",
    reason:
      `${totalJurnal} jurnal, ${e.otherJournals} di luar semai, ${nyata} data nyata` +
      (e.daysSinceActivity != null ? ` — aktivitas terakhir ${e.daysSinceActivity} hari lalu` : ""),
    conformanceRelevant: true,
  };
}

/** Ringkasan untuk seluruh instans. */
export function summarizeBooks(verdicts: readonly BookVerdict[]) {
  const perKlass = new Map<BookClass, number>();
  for (const v of verdicts) perKlass.set(v.klass, (perKlass.get(v.klass) ?? 0) + 1);
  return {
    total: verdicts.length,
    perKlass,
    /** Buku yang temuan kesesuaiannya layak dipercaya sebagai data nyata. */
    relevan: verdicts.filter((v) => v.conformanceRelevant).map((v) => v.databaseName),
  };
}
