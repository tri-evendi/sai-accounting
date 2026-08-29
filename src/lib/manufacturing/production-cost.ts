/**
 * Akumulasi biaya sebuah perintah produksi (issue #495 butir 3).
 *
 * Modul MURNI — tanpa Prisma, tanpa I/O. Yang dihitung di sini menentukan
 * harga pokok barang jadi, dan harga pokok yang salah tidak pernah
 * mengumumkan dirinya: ia muncul bertahun-tahun kemudian sebagai margin yang
 * tak bisa dijelaskan.
 *
 * ══ APA YANG DITAMPUNG BARANG DALAM PROSES ═════════════════════════════════
 *
 *     WIP = bahan yang dikeluarkan
 *         + upah langsung yang diserap    (jam sungguhan × tarif snapshot)
 *         + overhead yang diserap          (jam sungguhan × tarif snapshot)
 *
 * Ketiganya IDR. Bahannya dinilai rata-rata tertimbang SAAT DIKELUARKAN dan
 * nilainya disimpan di barisnya (`issued_cost`) — bukan dihitung ulang saat
 * dibaca, sebab rata-rata bergerak dan jurnal yang sudah terbit tidak boleh
 * ikut bergerak bersamanya.
 *
 * ══ JAM SUNGGUHAN, BUKAN JAM STANDAR ═══════════════════════════════════════
 * Yang DISERAP memakai jam sungguhan. Jam standar hanya pembanding, dan
 * selisihnya adalah varians efisiensi — pekerjaan tahap berikutnya. Menyerap
 * pada jam standar akan membuat setiap perintah selalu "tepat", dan varians
 * tidak akan pernah muncul di mana pun.
 */

import { round2, round3 } from "@/lib/manufacturing/bom";

export interface KomponenTerpakai {
  itemId: number;
  itemName: string;
  /** Kuantitas yang benar-benar dikeluarkan. */
  issuedQuantity: number;
  /** Nilai IDR-nya pada rata-rata tertimbang saat dikeluarkan. */
  issuedCost: number;
}

export interface OperasiTerpakai {
  sequence: number;
  name: string;
  standardHours: number;
  /** Jam SUNGGUHAN. `null` = belum dilaporkan; tidak menyerap apa pun. */
  actualHours: number | null;
  laborRate: number;
  overheadRate: number;
}

export interface AkumulasiBiaya {
  bahan: number;
  tenagaKerja: number;
  overhead: number;
  /** Isi Barang Dalam Proses: bahan + tenaga kerja + overhead. */
  total: number;
  /** Jam sungguhan yang sudah dilaporkan, seluruh operasi. */
  jamSungguhan: number;
  /** Jam standar seluruh operasi — pembanding, bukan dasar penyerapan. */
  jamStandar: number;
}

/** Berapa yang ditampung WIP sebuah perintah produksi. */
export function akumulasiBiaya(
  komponen: readonly KomponenTerpakai[],
  operasi: readonly OperasiTerpakai[]
): AkumulasiBiaya {
  const bahan = round2(komponen.reduce((s, k) => s + k.issuedCost, 0));

  let tenagaKerja = 0;
  let overhead = 0;
  let jamSungguhan = 0;
  let jamStandar = 0;
  for (const op of operasi) {
    jamStandar += op.standardHours;
    // Operasi yang belum dilaporkan tidak menyerap apa pun — `null` adalah
    // "belum diketahui", dan memperlakukannya nol akan terbaca sama dengan
    // "dikerjakan tanpa waktu sama sekali".
    if (op.actualHours == null) continue;
    jamSungguhan += op.actualHours;
    tenagaKerja += op.actualHours * op.laborRate;
    overhead += op.actualHours * op.overheadRate;
  }

  tenagaKerja = round2(tenagaKerja);
  overhead = round2(overhead);
  return {
    bahan,
    tenagaKerja,
    overhead,
    total: round2(bahan + tenagaKerja + overhead),
    jamSungguhan: round3(jamSungguhan),
    jamStandar: round3(jamStandar),
  };
}

/** Perintah produksi yang tidak bisa dinilai — ditolak sebelum memposting. */
export class ProductionCostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionCostError";
  }
}

/**
 * Harga pokok per unit barang jadi = isi WIP ÷ keluaran sungguhan.
 *
 * Keluaran nol DITOLAK, tidak dipulangkan nol: perintah yang menghabiskan bahan
 * tanpa menghasilkan apa pun bukan produksi melainkan kerugian, dan ia harus
 * dicatat sebagai susut proses (#490) yang memang punya akun bebannya sendiri.
 * Memulangkan nol di sini akan diam-diam melenyapkan nilai bahannya dari buku.
 */
export function hargaPokokKeluaran(
  wipTotal: number,
  producedQuantity: number
): number {
  if (!(producedQuantity > 0)) {
    throw new ProductionCostError(
      "Perintah produksi tanpa keluaran tidak punya harga pokok per unit. " +
        "Bahan yang habis tanpa hasil dicatat sebagai susut proses, bukan sebagai produksi."
    );
  }
  return round2(wipTotal / producedQuantity);
}

/**
 * Baris jurnal PENYERAPAN — hanya yang bernilai.
 *
 * Dipisah dari akumulasinya supaya mesin posting tidak perlu tahu aturan
 * "jangan terbitkan baris nol": jurnal dengan baris nol tetap seimbang dan
 * tetap lolos setiap penjaga, tapi ia membuat buku besar penuh baris yang tidak
 * pernah berarti apa-apa bagi siapa pun yang membacanya.
 */
export function bagianPenyerapan(
  biaya: AkumulasiBiaya
): { jenis: "tenaga_kerja" | "overhead"; nilai: number }[] {
  const bagian: { jenis: "tenaga_kerja" | "overhead"; nilai: number }[] = [];
  if (biaya.tenagaKerja > 0) bagian.push({ jenis: "tenaga_kerja", nilai: biaya.tenagaKerja });
  if (biaya.overhead > 0) bagian.push({ jenis: "overhead", nilai: biaya.overhead });
  return bagian;
}
