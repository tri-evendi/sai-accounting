/**
 * Varians produksi: rencana lawan kenyataan (issue #495 butir 3, tahap 3).
 *
 * Modul MURNI — tanpa Prisma, tanpa I/O.
 *
 * ══ VARIANS DI SINI ADALAH INFORMASI, BUKAN JURNAL ═════════════════════════
 * Buku ini memakai BIAYA SESUNGGUHNYA: WIP menampung nilai bahan pada rata-rata
 * tertimbang saat dikeluarkan, ditambah jam SUNGGUHAN × tarif, dan barang jadi
 * menerima seluruh isinya. Tidak ada selisih yang tertinggal di WIP, jadi tidak
 * ada yang perlu dijurnal — menerbitkan jurnal varians di atas biaya aktual
 * berarti menghitung angka yang sama dua kali.
 *
 * Yang dihitung berkas ini karena itu adalah pertanyaan MANAJEMEN: seberapa
 * jauh kenyataan menyimpang dari resepnya. Ia tidak pernah menyentuh buku besar.
 *
 * ══ YANG TIDAK BISA DIHITUNG DARI DATA INI, DAN KENAPA ═════════════════════
 * Dua varians baku sengaja TIDAK ada di sini, sebab datanya memang tidak ada.
 * Menghitungnya tetap berarti mengarang pembanding:
 *
 *   • **Varians HARGA bahan** — menuntut harga STANDAR per barang. Resep hanya
 *     menyimpan kuantitas; harga yang dipakai adalah rata-rata tertimbang
 *     sesungguhnya. Tanpa harga standar, "selisih harga" hanya bisa dihitung
 *     terhadap dirinya sendiri, dan hasilnya selalu nol.
 *   • **Varians TARIF upah** — tarif stasiun kerja di-snapshot saat perintah
 *     diterbitkan, lalu dipakai apa adanya untuk menyerap. Tarif yang menyerap
 *     dan tarif "standar" adalah angka yang SAMA; selisihnya nol menurut
 *     konstruksi, bukan menurut kenyataan.
 *
 * Keduanya butuh kolom harga/tarif standar tersendiri. Menambahkannya adalah
 * keputusan tersendiri, bukan efek samping tahap ini.
 */

import { round2, round3 } from "./bom";

/**
 * Arah sebuah selisih.
 *
 * `menguntungkan` = memakai lebih sedikit daripada rencana. Disebut dengan kata,
 * bukan hanya tanda: pada laporan biaya, angka negatif bisa berarti "hemat"
 * maupun "kurang dibebankan" tergantung yang membacanya, dan salah satu dari
 * dua tafsir itu selalu terbalik.
 */
export type ArahVarians = "menguntungkan" | "merugikan" | "tepat";

export function arahVarians(selisih: number): ArahVarians {
  if (Math.abs(selisih) < 0.005) return "tepat";
  // Selisih POSITIF berarti pemakaian melebihi rencana → merugikan.
  return selisih > 0 ? "merugikan" : "menguntungkan";
}

export interface VariansBahanBaris {
  itemId: number;
  itemName: string;
  /** Kebutuhan menurut resep, sudah termasuk susut yang diharapkan. */
  rencana: number;
  /** Yang benar-benar dikeluarkan. */
  sungguhan: number;
  /** sungguhan − rencana. Positif = lebih boros. */
  selisihKuantitas: number;
  /** Harga pokok per unit saat dikeluarkan, IDR. */
  hargaPerUnit: number;
  /** selisihKuantitas × hargaPerUnit. */
  selisihNilai: number;
  arah: ArahVarians;
}

export interface KomponenVarians {
  itemId: number;
  itemName: string;
  plannedQuantity: number;
  issuedQuantity: number | null;
  issuedCost: number | null;
}

/**
 * Varians PEMAKAIAN bahan: yang keluar lawan yang diresepkan.
 *
 * Dinilai pada harga pokok saat dikeluarkan — satu-satunya harga yang benar-benar
 * terjadi. Baris yang belum dikeluarkan (`issuedQuantity` null) DILEWATI, bukan
 * dianggap nol: perintah yang belum diterbitkan belum boros dan belum hemat.
 */
export function variansBahan(komponen: readonly KomponenVarians[]): VariansBahanBaris[] {
  const baris: VariansBahanBaris[] = [];
  for (const k of komponen) {
    if (k.issuedQuantity == null) continue;
    const sungguhan = round3(k.issuedQuantity);
    const rencana = round3(k.plannedQuantity);
    const hargaPerUnit =
      k.issuedCost != null && sungguhan > 0 ? round2(k.issuedCost / sungguhan) : 0;
    const selisihKuantitas = round3(sungguhan - rencana);
    const selisihNilai = round2(selisihKuantitas * hargaPerUnit);
    baris.push({
      itemId: k.itemId,
      itemName: k.itemName,
      rencana,
      sungguhan,
      selisihKuantitas,
      hargaPerUnit,
      selisihNilai,
      arah: arahVarians(selisihNilai),
    });
  }
  return baris;
}

export interface VariansOperasiBaris {
  sequence: number;
  name: string;
  jamStandar: number;
  jamSungguhan: number;
  /** jamSungguhan − jamStandar. Positif = lebih lama. */
  selisihJam: number;
  /** selisihJam × tarif upah. */
  selisihUpah: number;
  /** selisihJam × tarif overhead. */
  selisihOverhead: number;
  arah: ArahVarians;
}

export interface OperasiVarians {
  sequence: number;
  name: string;
  standardHours: number;
  actualHours: number | null;
  laborRate: number;
  overheadRate: number;
}

/**
 * Varians EFISIENSI: jam yang terpakai lawan jam standar.
 *
 * Dipisah menjadi bagian upah dan bagian overhead karena keduanya mendarat di
 * akun yang berbeda — menggabungkannya berarti memisahkannya kembali dengan
 * tebakan saat seseorang bertanya "yang mana yang membengkak".
 *
 * Operasi yang belum dilaporkan DILEWATI: `null` adalah "belum diketahui", dan
 * memperlakukannya nol jam akan melaporkan penghematan yang tidak pernah ada.
 */
export function variansEfisiensi(operasi: readonly OperasiVarians[]): VariansOperasiBaris[] {
  const baris: VariansOperasiBaris[] = [];
  for (const op of operasi) {
    if (op.actualHours == null) continue;
    const selisihJam = round3(op.actualHours - op.standardHours);
    const selisihUpah = round2(selisihJam * op.laborRate);
    const selisihOverhead = round2(selisihJam * op.overheadRate);
    baris.push({
      sequence: op.sequence,
      name: op.name,
      jamStandar: round3(op.standardHours),
      jamSungguhan: round3(op.actualHours),
      selisihJam,
      selisihUpah,
      selisihOverhead,
      arah: arahVarians(round2(selisihUpah + selisihOverhead)),
    });
  }
  return baris;
}

export interface VariansHasil {
  rencana: number;
  sungguhan: number;
  /** sungguhan − rencana. NEGATIF berarti hasilnya kurang dari rencana. */
  selisih: number;
  /** Nilai selisihnya pada harga pokok sesungguhnya per unit. */
  selisihNilai: number;
  arah: ArahVarians;
}

/**
 * Varians HASIL: keluaran sungguhan lawan rencana.
 *
 * Perhatikan arahnya TERBALIK dari yang lain: menghasilkan LEBIH SEDIKIT
 * daripada rencana itu merugikan, sedangkan pada bahan justru memakai lebih
 * banyak yang merugikan. Karena itu tandanya dibalik sebelum diartikan —
 * kekeliruan ini adalah yang paling mudah terjadi pada laporan varians, dan
 * hasilnya adalah laporan yang menyebut kerugian sebagai penghematan.
 */
export function variansHasil(
  plannedQuantity: number,
  producedQuantity: number | null,
  hargaPokokPerUnit: number
): VariansHasil | null {
  if (producedQuantity == null) return null;
  const selisih = round3(producedQuantity - plannedQuantity);
  const selisihNilai = round2(selisih * hargaPokokPerUnit);
  return {
    rencana: round3(plannedQuantity),
    sungguhan: round3(producedQuantity),
    selisih,
    selisihNilai,
    // Kurang dari rencana (selisih negatif) = merugikan → tandanya dibalik.
    arah: arahVarians(-selisihNilai),
  };
}

export interface RingkasanVarians {
  bahan: VariansBahanBaris[];
  operasi: VariansOperasiBaris[];
  hasil: VariansHasil | null;
  /** Jumlah selisih nilai bahan. */
  totalBahan: number;
  /** Jumlah selisih upah seluruh operasi. */
  totalUpah: number;
  /** Jumlah selisih overhead seluruh operasi. */
  totalOverhead: number;
  /**
   * totalBahan + totalUpah + totalOverhead.
   *
   * Varians HASIL sengaja TIDAK dijumlahkan ke sini: ia diukur pada sumbu yang
   * berbeda (keluaran, bukan masukan) dan menjumlahkannya akan menghitung
   * penyimpangan yang sama dua kali — bahan yang boros sudah muncul di
   * `totalBahan`, dan akibatnya pada hasil muncul lagi di `hasil`.
   */
  totalMasukan: number;
  arah: ArahVarians;
}

/** Susun seluruh varians sebuah perintah produksi menjadi satu ringkasan. */
export function ringkasanVarians(
  komponen: readonly KomponenVarians[],
  operasi: readonly OperasiVarians[],
  plannedQuantity: number,
  producedQuantity: number | null,
  hargaPokokPerUnit: number
): RingkasanVarians {
  const bahan = variansBahan(komponen);
  const ops = variansEfisiensi(operasi);
  const totalBahan = round2(bahan.reduce((s, b) => s + b.selisihNilai, 0));
  const totalUpah = round2(ops.reduce((s, o) => s + o.selisihUpah, 0));
  const totalOverhead = round2(ops.reduce((s, o) => s + o.selisihOverhead, 0));
  const totalMasukan = round2(totalBahan + totalUpah + totalOverhead);
  return {
    bahan,
    operasi: ops,
    hasil: variansHasil(plannedQuantity, producedQuantity, hargaPokokPerUnit),
    totalBahan,
    totalUpah,
    totalOverhead,
    totalMasukan,
    arah: arahVarians(totalMasukan),
  };
}
