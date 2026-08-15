/**
 * REKONSILIASI PERSEDIAAN (issue #379) — dua angka yang harus sama, diadu.
 *
 * ══ KENAPA INI PERLU ADA SAMA SEKALI ════════════════════════════════════════
 * Pertanyaan "berapa nilai persediaan kami" dijawab dua tempat, dari sumber
 * yang sama sekali terpisah:
 *
 *   • Neraca membacanya dari BARIS JURNAL (akun Persediaan);
 *   • laporan stok membacanya dari `stock_movements` (rata-rata tertimbang).
 *
 * Dalam operasi normal keduanya sinkron secara konstruksi — satu pembelian
 * menerbitkan jurnal debit Persediaan DAN gerakan stok masuk. Tapi "sinkron
 * secara konstruksi" adalah janji yang tidak pernah diperiksa siapa pun, dan
 * janji semacam itu selalu putus di suatu tempat: di #379 tempatnya adalah
 * jalur pembukaan, yang selama ini menerbitkan salah satu sisinya saja.
 *
 * Yang membuat cacat itu bertahan bukan sulitnya diperbaiki — perbaikannya
 * beberapa baris — melainkan **tidak adanya satu pun permukaan yang pernah
 * membandingkan kedua angka itu**. Modul ini permukaannya.
 *
 * ══ MURNI ══════════════════════════════════════════════════════════════════
 * Tanpa Prisma: pemanggil membaca kedua angka, modul ini memutuskan. Dengan
 * begitu aturan "berapa selisih yang masih boleh disebut nol" bisa diuji tanpa
 * basis data, dan tidak punya salinan kedua di halaman laporan.
 */

import { round2 } from "@/lib/posting/rules";

/**
 * Ambang selisih yang masih dianggap NOL: satu rupiah.
 *
 * Bukan `=== 0`. Nilai persediaan adalah hasil rata-rata tertimbang atas
 * banyak gerakan — pembagian yang dibulatkan pada setiap langkahnya —
 * sementara saldo akun adalah penjumlahan baris jurnal yang sudah bulat.
 * Keduanya bisa berselisih beberapa sen tanpa ada yang salah, dan sebuah
 * penjaga yang berbunyi untuk selisih Rp 0,01 adalah penjaga yang akan
 * dimatikan orang dalam seminggu.
 *
 * Selisih yang BERARTI selalu jauh lebih besar dari ini: ia sebesar satu
 * dokumen yang tidak pernah menerbitkan salah satu sisinya.
 */
export const INVENTORY_TOLERANCE = 1;

export interface InventoryReconciliation {
  /** Σ nilai persediaan dari `stock_movements` (buku pembantu). */
  stockValue: number;
  /** Saldo akun Persediaan dari baris jurnal (buku besar). */
  accountBalance: number;
  /** pembantu − besar. Positif = stok lebih besar dari yang dicatat jurnal. */
  difference: number;
  /** `true` bila keduanya bertemu dalam ambang. */
  balanced: boolean;
}

export function reconcileInventory(
  stockValue: number,
  accountBalance: number
): InventoryReconciliation {
  const difference = round2(stockValue - accountBalance);
  return {
    stockValue: round2(stockValue),
    accountBalance: round2(accountBalance),
    difference,
    balanced: Math.abs(difference) <= INVENTORY_TOLERANCE,
  };
}

/**
 * Kalimat yang menjelaskan selisihnya kepada orang yang bukan akuntan.
 *
 * MURNI dan memulangkan KUNCI kamus, bukan kalimat jadi — modul ini dipakai
 * halaman berbahasa tiga, dan kalimat yang ditulis di sini akan menjadi
 * kalimat keempat yang tidak pernah diterjemahkan.
 *
 * Arah selisihnya disebut, bukan hanya besarnya: "stok lebih besar" dan "buku
 * besar lebih besar" menuntut pemeriksaan yang berbeda — yang pertama berarti
 * ada barang masuk tanpa jurnal, yang kedua berarti ada jurnal tanpa barang.
 */
export type InventoryVerdictKey =
  | "reports.inventoryReconciled"
  | "reports.inventoryStockHigher"
  | "reports.inventoryLedgerHigher";

export function inventoryVerdictKey(result: InventoryReconciliation): InventoryVerdictKey {
  if (result.balanced) return "reports.inventoryReconciled";
  return result.difference > 0
    ? "reports.inventoryStockHigher"
    : "reports.inventoryLedgerHigher";
}
