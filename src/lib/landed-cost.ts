/**
 * BIAYA IMPOR YANG DATANG BELAKANGAN (issue #495 butir 1).
 *
 * ══ APA YANG SUDAH ADA, DAN DI MANA BATASNYA ═══════════════════════════════
 * #510 sudah menempelkan ongkos sampai gudang ke harga pokok — tetapi hanya
 * ongkos yang ditagihkan **pemasok yang sama pada faktur pembelian itu juga**.
 * Batas itu disengaja: ia yang membuat #510 tidak butuh mesin jurnal baru.
 *
 * Bentuk lazim biaya impor justru kebalikannya. Bea masuk datang dari Bea
 * Cukai; freight dan asuransi dari forwarder. Vendor berbeda, dokumen berbeda,
 * **tanggal berbeda** — kerap berminggu-minggu sesudah barangnya masuk gudang
 * dan sebagian sudah terjual.
 *
 * ══ KENAPA TIDAK BOLEH SEKADAR MENGUBAH `unit_cost` KE BELAKANG ════════════
 * Menyebar biaya itu mundur ke gerakan stok yang HPP-nya SUDAH diposting
 * berarti mengubah jurnal yang sudah terbit. Laporan yang sudah dicetak,
 * ditandatangani, dan mungkin sudah dilaporkan pajaknya akan diam-diam berbeda
 * dari basis datanya. Itu bukan koreksi, itu penulisan ulang sejarah.
 *
 * ══ ATURANNYA: HANYA YANG BELUM TERJUAL ════════════════════════════════════
 * Biaya yang jatuh pada barang yang **masih di gudang** boleh menempel — HPP-nya
 * belum lahir, jadi tidak ada yang ditulis ulang. Yang jatuh pada barang yang
 * **sudah terjual** tidak bisa lagi mengubah HPP yang sudah diposting; ia jatuh
 * ke selisih HPP periode berjalan. Itu perlakuan baku, dan itu yang membedakan
 * berkas ini dari mengubah angka ke belakang.
 *
 * ══ ⚠ INI PROPORSI, BUKAN IDENTITAS LOT — DAN ITU HARUS DIKATAKAN ══════════
 * Buku ini memakai RATA-RATA TERTIMBANG (`weightedAverageUnitCost`), bukan
 * FIFO berlot. Di bawah rata-rata tertimbang **tidak ada** cara jujur untuk
 * mengatakan "180 kg dari pembelian ini yang terjual" — unit-unitnya sudah
 * bercampur, dan memang itu maksud metodenya.
 *
 * Jadi yang dipakai proporsi tingkat BARANG: berapa bagian dari kuantitas yang
 * dibeli itu yang masih tersisa di saldo barangnya hari ini. Ia perkiraan, dan
 * ia perkiraan yang tepat ketika tak ada pembelian lain di antaranya — yaitu
 * kasus yang justru paling lazim untuk satu kontainer impor.
 *
 * Menyebutnya identitas lot akan menjadi kebohongan yang tidak pernah ketahuan.
 * Karena itu ia ditulis di sini, dan halamannya wajib menyebutkannya juga.
 */
import { round2 } from "@/lib/posting/rules";
import { allocateAdditionalCost, type AdditionalCostBasis } from "@/lib/wizard";

export type { AdditionalCostBasis };

/** Satu baris pembelian yang menerima sebaran biaya. */
export interface LandedCostLine {
  /** Barang — dipakai pemanggil untuk mencocokkan saldo; tidak dibaca di sini. */
  itemId: number;
  /** Nilai baris saat dibeli (kuantitas × harga), mata uang dokumen. */
  value: number;
  /** Kuantitas yang MASUK gudang dari pembelian ini. */
  quantity: number;
  /**
   * Saldo barang ini SEKARANG, dari seluruh gerakan — bukan sisa baris ini.
   *
   * Di bawah rata-rata tertimbang tidak ada "sisa baris ini". Lihat catatan
   * §PROPORSI di kepala berkas.
   */
  onHand: number;
}

export interface LandedCostSplit {
  itemId: number;
  /** Bagian biaya yang jatuh pada baris ini. */
  allocated: number;
  /** Menempel di persediaan — HPP-nya belum lahir. */
  capitalized: number;
  /** Jatuh ke selisih HPP — HPP-nya sudah terbit dan tidak ditulis ulang. */
  expensed: number;
}

export interface LandedCostPlan {
  lines: LandedCostSplit[];
  totalAllocated: number;
  totalCapitalized: number;
  totalExpensed: number;
  /** Dasar sebar yang dipakai — ikut dilaporkan supaya bisa dipertanggungjawabkan. */
  basis: AdditionalCostBasis;
}

/**
 * Berapa bagian sebuah baris yang masih boleh menempel di persediaan.
 *
 * Memulangkan 0–1. Empat keadaan, dan tiga di antaranya bukan hitungan:
 *
 *  • dibeli ≤ 0    → 0. Tidak ada yang bisa ditempeli.
 *  • saldo ≤ 0     → 0. Semuanya sudah keluar; tak ada yang tersisa untuk
 *                    menanggung biayanya.
 *  • saldo ≥ dibeli → 1. Tidak satu pun unit dari pembelian ini yang bisa sudah
 *                    terjual — dan ini keadaan yang paling lazim ketika biaya
 *                    impornya datang cepat.
 *  • sisanya       → proporsional.
 */
export function onHandShare(quantity: number, onHand: number): number {
  if (quantity <= 0) return 0;
  if (onHand <= 0) return 0;
  if (onHand >= quantity) return 1;
  return onHand / quantity;
}

/**
 * Rencanakan sebaran biaya yang datang belakangan.
 *
 * MURNI — tanpa Prisma, tanpa tanggal, tanpa jurnal. Seluruh kebenaran fitur
 * ini bisa diuji di sini, dan lapisan posting hanya menuliskan apa yang sudah
 * diputuskan.
 *
 * Sebarannya memakai `allocateAdditionalCost` (#510) apa adanya — bukan
 * salinannya. Dua penyebar yang "sama" adalah dua penyebar yang suatu hari
 * membulatkan berbeda, lalu dua dokumen atas kontainer yang sama menghasilkan
 * harga pokok yang berbeda.
 */
export function planLandedCost(
  lines: readonly LandedCostLine[],
  total: number,
  basis: AdditionalCostBasis
): LandedCostPlan {
  const shares = allocateAdditionalCost(
    lines.map((l) => ({ value: l.value, quantity: l.quantity })),
    total,
    basis
  );

  const split: LandedCostSplit[] = lines.map((line, i) => {
    const allocated = shares[i] ?? 0;
    const capitalized = round2(allocated * onHandShare(line.quantity, line.onHand));
    /* Selisihnya dihitung dengan PENGURANGAN, bukan dengan perkalian kedua.
       Dua pembulatan yang berdiri sendiri bisa berjumlah meleset satu sen dari
       yang dialokasikan — dan satu sen yang tidak ke mana-mana adalah jurnal
       yang tidak seimbang. */
    return { itemId: line.itemId, allocated, capitalized, expensed: round2(allocated - capitalized) };
  });

  const sum = (pick: (s: LandedCostSplit) => number) =>
    round2(split.reduce((acc, s) => acc + pick(s), 0));

  return {
    lines: split,
    totalAllocated: sum((s) => s.allocated),
    totalCapitalized: sum((s) => s.capitalized),
    totalExpensed: sum((s) => s.expensed),
    basis,
  };
}
