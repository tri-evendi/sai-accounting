/**
 * LAPORAN PERUBAHAN EKUITAS (issue #555) — bentuk dan rekonsiliasinya.
 *
 * ══ SATU DARI LIMA LAPORAN YANG DITUNTUT PSAK, DAN SATU-SATUNYA YANG HILANG ═
 * Neraca ada, Laba Rugi ada, Arus Kas ada, bahan CALK ada (#445). Yang tidak
 * pernah bisa dibuat adalah laporan ini — sebab ia justru laporan yang
 * MEMISAHKAN hasil tahun berjalan dari tahun-tahun sebelumnya, dan sampai #555
 * tidak ada tutup buku tahunan yang memisahkan keduanya.
 *
 * ══ APA YANG DIJAWABNYA, YANG TIDAK DIJAWAB NERACA ═════════════════════════
 * Neraca menyebut ekuitas pada SATU tanggal. Laporan ini menyebut bagaimana ia
 * SAMPAI ke sana: berapa saldo awalnya, berapa yang ditambahkan pemilik, berapa
 * yang ditarik, berapa laba yang masuk, dan apa yang dipindahkan tutup buku.
 * Pertanyaan "kenapa ekuitas kami berubah" tidak punya tempat lain untuk
 * dijawab.
 *
 * ══ MURNI ═════════════════════════════════════════════════════════════════
 * Tanpa Prisma dan tanpa React — pemanggil yang mengumpulkan angkanya. Yang di
 * sini bentuk dan REKONSILIASINYA, dan rekonsiliasi itulah seluruh nilainya:
 * sebuah laporan perubahan ekuitas yang saldo akhirnya tidak sama dengan
 * ekuitas di Neraca tanggal yang sama lebih buruk daripada tidak ada.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Satu akun ekuitas sepanjang periode. Semua besaran POSITIF-DEBIT. */
export interface EquityComponentInput {
  code: string;
  name: string;
  /** Saldo sebelum periode (debit − kredit; ekuitas biasanya negatif). */
  openingRaw: number;
  /** Mutasi debit selama periode — penarikan/pembagian. */
  periodDebit: number;
  /** Mutasi kredit selama periode — setoran, dan hasil tutup buku. */
  periodCredit: number;
}

/**
 * Satu baris laporan. Ditampilkan dalam TANDA AKUNTANSI (ekuitas positif),
 * bukan positif-debit — pembacanya bukan pembukuan, dan ekuitas yang tampil
 * negatif akan terbaca sebagai defisit.
 */
export interface EquityComponentRow {
  code: string;
  name: string;
  opening: number;
  /** Penambahan (setoran, laba yang ditutup ke sini). Selalu ≥ 0. */
  additions: number;
  /** Pengurangan (prive, pembagian). Selalu ≥ 0. */
  reductions: number;
  closing: number;
}

/**
 * Satu pemilik/sekutu (bentuk usaha, 24 Okt 2026) — angka GABUNGAN akun Modal
 * dan Prive miliknya, semua POSITIF-DEBIT kecuali `opening`.
 *
 * Gabungan, bukan per akun: tutup buku memindahkan prive ke modal (D Modal,
 * K Prive), dan dua baris itu saling meniadakan pada gabungannya — sehingga
 * mutasi JURNAL PENUTUP atas gabungan Modal+Prive adalah TEPAT bagian laba
 * sekutu itu, tanpa perlu membedakan baris laba dari baris prive.
 */
export interface EquityPartnerInput {
  name: string;
  role: string | null;
  shareBp: number;
  isActive: boolean;
  /** Saldo awal Modal + Prive, TANDA AKUNTANSI (kredit positif). */
  opening: number;
  /** Mutasi selama periode dari jurnal BUKAN penutup. */
  periodDebit: number;
  periodCredit: number;
  /** Mutasi selama periode dari jurnal PENUTUP (bagian laba ± prive yang ditutup). */
  closingDebit: number;
  closingCredit: number;
}

/** Satu baris rincian per pemilik/sekutu. Tanda akuntansi. */
export interface EquityPartnerRow {
  name: string;
  role: string | null;
  shareBp: number;
  isActive: boolean;
  /** Modal awal (Modal + Prive pada awal periode). */
  opening: number;
  /** Bagian laba (positif) / rugi (negatif) yang ditutup ke modalnya. */
  profitShare: number;
  /** Setoran modal selama periode. Selalu ≥ 0. */
  contributions: number;
  /** Prive / penarikan selama periode. Selalu ≥ 0. */
  drawings: number;
  closing: number;
}

export interface EquityStatementInput {
  /**
   * Pemilik/sekutu (CV, Firma, usaha perorangan). Kosong/tidak disebut untuk
   * PT — keluaran PT tidak berubah sedikit pun (paritas Go dijaga).
   */
  partners?: readonly EquityPartnerInput[];
  components: readonly EquityComponentInput[];
  /** Laba BELUM DITUTUP pada awal periode (tanda akuntansi: laba positif). */
  openingUnclosedIncome: number;
  /** Laba BELUM DITUTUP pada akhir periode. */
  closingUnclosedIncome: number;
}

export interface EquityStatement {
  components: EquityComponentRow[];
  /**
   * Laba yang belum ditutup, sebagai komponen ekuitas TANPA akun.
   *
   * Ia memang tidak punya akun — itulah keadaan yang membuat laporan ini perlu
   * ada. Menyembunyikannya akan membuat saldo akhir tidak berjumlah ekuitas di
   * Neraca, dan menaruhnya di baris akun mana pun akan berbohong tentang akun
   * itu.
   */
  unclosedIncome: { opening: number; movement: number; closing: number };
  totalOpening: number;
  totalClosing: number;
  /**
   * Rincian per pemilik/sekutu — RINGKASAN tambahan atas akun Modal & Prive
   * yang sudah ada di `components`, bukan komponen baru: tidak ikut total.
   * Kosong untuk PT.
   */
  partners: EquityPartnerRow[];
}

/**
 * Rincian per pemilik/sekutu.
 *
 *   modal akhir = modal awal + bagian laba + setoran − prive
 *
 * `bagian laba` = mutasi bersih jurnal PENUTUP atas Modal+Prive (lihat
 * `EquityPartnerInput`); `setoran`/`prive` = kredit/debit jurnal lainnya.
 * Sekutu tanpa saldo dan tanpa gerak dilewati — aturan yang sama dengan
 * komponen.
 */
export function buildEquityPartners(partners: readonly EquityPartnerInput[]): EquityPartnerRow[] {
  const rows: EquityPartnerRow[] = [];
  for (const p of partners) {
    const opening = round2(p.opening);
    const profitShare = round2(p.closingCredit - p.closingDebit) + 0;
    const contributions = round2(p.periodCredit);
    const drawings = round2(p.periodDebit);
    if (opening === 0 && profitShare === 0 && contributions === 0 && drawings === 0) continue;
    rows.push({
      name: p.name,
      role: p.role,
      shareBp: p.shareBp,
      isActive: p.isActive,
      opening,
      profitShare,
      contributions,
      drawings,
      closing: round2(opening + profitShare + contributions - drawings),
    });
  }
  return rows;
}

/**
 * Susun laporan dari angka yang sudah dikumpulkan.
 *
 * ── Kenapa mutasi dipecah menjadi TAMBAH dan KURANG ───────────────────────
 * Satu kolom "mutasi bersih" menyembunyikan setoran Rp 500 juta yang pada bulan
 * yang sama diikuti prive Rp 500 juta — dua peristiwa yang sangat berbeda
 * artinya, tampil sebagai nol. Laporan perubahan ekuitas yang tidak menunjukkan
 * keduanya tidak menjelaskan perubahan apa pun.
 */
export function buildEquityStatement(input: EquityStatementInput): EquityStatement {
  const components: EquityComponentRow[] = [];
  let totalOpening = 0;
  let totalClosing = 0;

  for (const c of input.components) {
    /* Positif-debit → tanda akuntansi: ekuitas bersaldo kredit menjadi positif. */
    const opening = round2(-c.openingRaw);
    const additions = round2(c.periodCredit);
    const reductions = round2(c.periodDebit);
    const closing = round2(opening + additions - reductions);

    /* Akun yang tidak bersaldo dan tidak bergerak dilewati — ia tidak
       menjelaskan perubahan apa pun, dan barisnya hanya memanjangkan laporan. */
    if (opening === 0 && additions === 0 && reductions === 0) continue;

    components.push({ code: c.code, name: c.name, opening, additions, reductions, closing });
    totalOpening = round2(totalOpening + opening);
    totalClosing = round2(totalClosing + closing);
  }

  const opening = round2(input.openingUnclosedIncome);
  const closing = round2(input.closingUnclosedIncome);
  const unclosedIncome = {
    opening,
    /*
     * Pergerakannya DITURUNKAN, bukan dijumlahkan sendiri dari laba periode.
     * Ia memikul DUA hal sekaligus — laba yang lahir periode ini DAN laba yang
     * dipindahkan keluar oleh tutup buku — dan menghitungnya dari salah satu
     * saja akan membuat saldo akhirnya meleset persis sebesar yang lain.
     */
    movement: round2(closing - opening),
    closing,
  };

  return {
    components,
    unclosedIncome,
    totalOpening: round2(totalOpening + opening),
    totalClosing: round2(totalClosing + closing),
    partners: buildEquityPartners(input.partners ?? []),
  };
}

/**
 * REKONSILIASI — seluruh nilai laporan ini.
 *
 * Saldo akhir HARUS sama dengan ekuitas di Neraca pada tanggal yang sama, yaitu
 * `balanceSheetEquityTotal()`. Sebuah laporan perubahan ekuitas yang tidak
 * berjumlah demikian lebih buruk daripada tidak ada: ia terbaca resmi, ia
 * ditandatangani, dan ia membantah laporan di sebelahnya.
 */
export function equityReconciles(statement: EquityStatement, balanceSheetEquity: number): boolean {
  return Math.round(statement.totalClosing * 100) === Math.round(balanceSheetEquity * 100);
}
