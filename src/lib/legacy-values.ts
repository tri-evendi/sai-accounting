/**
 * Penyelarasan nilai enum-like data legacy (issue #111).
 *
 * ══ MASALAH YANG DIJAGA DI SINI ════════════════════════════════════════════
 * Impor legacy menyalin kolom lama apa adanya: `tb_stok.status` berisi
 * 'IN'/'OUT'/'PROCESS', `tb_penjualan.sumber` berisi 'Kas Kecil'/'Rp'/'USD'/
 * 'CNY'. Kolom tujuannya VARCHAR, jadi basis data menerima semuanya tanpa
 * keluhan — dan kode yang membandingkan `type === "in"` di JavaScript
 * mendapat `false` untuk SETIAP baris. Hasilnya bukan galat, melainkan saldo
 * stok nol dan seluruh kas jatuh ke akun bawaan.
 *
 * Formulir sudah dijaga zod. Yang tidak dijaga adalah pintu satunya lagi:
 * IMPOR. Modul ini menutup pintu itu — dan sengaja MELEMPAR untuk nilai yang
 * tidak dikenal, bukan menebak. Nilai legacy baru yang tak terduga harus
 * memaksa seseorang memutuskan artinya, bukan diam-diam menjadi 'in'.
 *
 * Migration `0043_normalize_legacy_enum_values` memperbaiki baris yang sudah
 * terlanjur masuk; modul ini mencegah baris berikutnya. Keduanya memakai
 * pemetaan yang sama, jadi jangan mengubah salah satu tanpa yang lain.
 */
import {
  CASH_TYPES,
  isStockMovementType,
  type CashType,
  type StockMovementType,
} from "@/lib/constants";

/**
 * Nilai `tb_stok.status` legacy → nilai baku.
 *
 * 'PROCESS' adalah nilai yang SAH, bukan sinonim 'out': barang diserahkan untuk
 * disortir/diolah dan masih milik perusahaan, jadi ia tidak menggeser saldo
 * (lihat `STOCK_MOVEMENT_TYPES`).
 */
const LEGACY_STOCK_TYPES: Record<string, StockMovementType> = {
  in: "in",
  masuk: "in",
  out: "out",
  keluar: "out",
  process: "process",
  proses: "process",
};

/**
 * Nilai `tb_penjualan.sumber` legacy → (jenis buku kas, mata uang).
 *
 * 'Rp'/'USD'/'CNY' bukan tiga jenis kas melainkan TIGA REKENING BANK dengan
 * mata uang berbeda — keterangan barisnya menyebut 'Buku Cek', 'Biaya Admin',
 * 'Pembukaan Rek USD', 'Bunga', 'Pajak'. Karena itu jenisnya sama-sama `bank`
 * dan yang membedakan dikembalikan lewat `currency`.
 *
 * `currency` sengaja opsional: untuk nilai yang tidak menyebut mata uang
 * ('Kas Besar', 'Kas Kecil'), pemanggil mempertahankan mata uang yang memang
 * tercatat di barisnya, bukan dipaksa jadi IDR.
 */
const LEGACY_CASH_TYPES: Record<string, { type: CashType; currency?: string }> = {
  "kas besar": { type: "kas_besar" },
  kas_besar: { type: "kas_besar" },
  kasbesar: { type: "kas_besar" },
  "kas kecil": { type: "kas_kecil" },
  kas_kecil: { type: "kas_kecil" },
  kaskecil: { type: "kas_kecil" },
  bank: { type: "bank" },
  rp: { type: "bank", currency: "IDR" },
  idr: { type: "bank", currency: "IDR" },
  usd: { type: "bank", currency: "USD" },
  cny: { type: "bank", currency: "CNY" },
  rmb: { type: "bank", currency: "CNY" },
};

function normalize(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Nilai baku untuk `stock_movements.type`, atau `null` bila sumbernya kosong.
 * MELEMPAR untuk nilai yang tidak dikenal — lihat catatan modul.
 */
export function canonicalStockType(raw: unknown): StockMovementType | null {
  const key = normalize(raw);
  if (!key) return null;

  const mapped = LEGACY_STOCK_TYPES[key] ?? (isStockMovementType(key) ? key : undefined);
  if (!mapped) {
    throw new LegacyValueError("stock_movements.type", String(raw), Object.keys(LEGACY_STOCK_TYPES));
  }
  return mapped;
}

/**
 * Nilai baku untuk `cash_movements.type` (+ mata uang bila nilai legacy-nya
 * memang menyebut mata uang), atau `null` bila sumbernya kosong.
 */
export function canonicalCashType(
  raw: unknown
): { type: CashType; currency?: string } | null {
  const key = normalize(raw);
  if (!key) return null;

  const mapped =
    LEGACY_CASH_TYPES[key] ??
    ((CASH_TYPES as readonly string[]).includes(key)
      ? { type: key as CashType }
      : undefined);
  if (!mapped) {
    throw new LegacyValueError("cash_movements.type", String(raw), Object.keys(LEGACY_CASH_TYPES));
  }
  return mapped;
}

/**
 * Sengaja menyebut KOLOMNYA dan NILAI ASLINYA: yang membaca pesan ini sedang
 * berdiri di depan dump legacy berisi puluhan ribu baris, dan "invalid enum
 * value" tidak menolongnya menemukan yang mana.
 */
export class LegacyValueError extends Error {
  constructor(
    readonly column: string,
    readonly value: string,
    readonly known: string[]
  ) {
    super(
      `Nilai legacy "${value}" tidak dikenal untuk ${column}. ` +
        `Yang dikenal: ${known.join(", ")}. ` +
        `Tambahkan pemetaannya di src/lib/legacy-values.ts (dan di migration ` +
        `0043 bila baris seperti ini sudah terlanjur masuk) — jangan menebak, ` +
        `sebab tebakan yang salah menghasilkan saldo yang salah tanpa satu pun galat.`
    );
    this.name = "LegacyValueError";
  }
}
