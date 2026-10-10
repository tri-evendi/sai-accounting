/**
 * Nilai enum-like basis data PLATFORM (issue #137).
 *
 * Kolomnya `VARCHAR` — basis data tidak menolak apa pun, jadi daftar nilai sah
 * hidup di SATU tempat ini dan dipakai `z.enum(...)` di setiap pintu masuk
 * (konvensi docs/DATABASE.md §2; pelajaran issue #111: nilai di luar daftar
 * tidak gagal berisik, ia salah hitung dalam diam).
 *
 * Dipisah dari `lib/constants.ts` dengan sengaja: berkas itu milik ranah
 * PERUSAHAAN (buku besar) dan diimpor luas; nilai platform hanya dibutuhkan
 * kode penagihan, dan modulnya tidak boleh menyeret apa pun ke jalur panas.
 */

import { z } from "zod";

/**
 * Siklus hidup langganan (docs/MULTI-TENANT.md §7.4, issue #140):
 *
 *   trialing ──(bayar)──> active ──(gagal bayar)──> past_due
 *       │                    ↑                          │
 *       └──(trial habis)─────┘                          └─(tenggang habis)─> suspended
 *   suspended ──(bayar)──> active
 *   suspended ──(berhenti)──> cancelled   [buku besar TIDAK PERNAH dihapus otomatis]
 *
 * `suspended` berarti HANYA-BACA, bukan terkunci — pelanggan yang menunggak
 * tetap wajib (secara hukum) bisa membaca & mengekspor pembukuannya.
 */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/**
 * MODE PENAGIHAN sebuah langganan — menjawab "akun ini boleh ditagih OTOMATIS?",
 * pertanyaan yang sampai sekarang tidak pernah ditanyakan siapa pun.
 *
 * ══ KENAPA KOLOM INI ADA ═══════════════════════════════════════════════════
 * Sampai ia ada, penjadwal menerbitkan tagihan untuk SETIAP langganan yang masa
 * uji cobanya habis — tanpa satu pun pemeriksaan, dan harga nol pun tidak
 * dilewati (`scripts/subscription-scheduler.ts`). Dua tenant internal selamat
 * BUKAN karena dilindungi, melainkan karena kebetulan tidak pernah melewati
 * jalur `trialing → habis`.
 *
 * Akibatnya terjadi dua kali di produksi: sembilan akun UJI COBA di paket `pro`
 * ditagih Rp 664.890, ditagih ulang lewat 40 surel pengingat, lalu lima di
 * antaranya ditangguhkan menjadi hanya-baca — padahal tidak satu pun pernah
 * setuju membeli apa pun. Rinciannya di `docs/KOMERSIALISASI.md` §1.1.
 *
 * Preseden bentuknya ada di penjadwal itu sendiri: dunning SENGAJA mengecualikan
 * tagihan perpindahan paket (`targetPlanId: null`) karena "tagihan selisih
 * naik-paket adalah tawaran, bukan kewajiban". Sistem ini sudah tahu sebagian
 * TAGIHAN tidak boleh memicu penagihan; yang kurang pengetahuan yang sama
 * tentang AKUN.
 *
 *   `none`    tidak pernah ditagih — internal, penguji, pilot, demo.
 *   `manual`  ditagih DI LUAR sistem (faktur dari buku PT penyedia sendiri,
 *             `docs/KOMERSIALISASI.md` §3.4). Hak pakainya penuh; penjadwal
 *             tidak menerbitkan, tidak menagih, dan tidak menangguhkan.
 *   `auto`    siklus penuh penjadwal — satu-satunya mode yang bisa menerbitkan
 *             tagihan, mendorong ke `past_due`, dan menangguhkan.
 *
 * ⚠ BAWAANNYA `none`, DAN ITU ARAH YANG DISENGAJA. Baris baru yang dibuat kode
 * LAMA (image yang belum tahu kolom ini) mendapat bawaan basis data, jadi
 * bawaannya harus yang paling tidak merugikan orang: kurang tagih bisa
 * diperbaiki dengan satu faktur, sedangkan buku pelanggan yang terkunci karena
 * tagihan yang tidak pernah ia setujui tidak bisa ditarik kembali. Akun menjadi
 * `auto` lewat tindakan manusia — tidak pernah lewat berakhirnya waktu.
 */
export const BILLING_MODES = ["none", "manual", "auto"] as const;
export const billingModeSchema = z.enum(BILLING_MODES);
export type BillingMode = z.infer<typeof billingModeSchema>;

/** Bawaan untuk langganan baru — lihat ⚠ di atas. */
export const DEFAULT_BILLING_MODE: BillingMode = "none";

/** SATU-SATUNYA mode yang boleh disentuh penjadwal penagihan. */
export function billingModeIsAutomatic(mode: string): boolean {
  return mode === "auto";
}

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export const billingCycleSchema = z.enum(BILLING_CYCLES);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

/** Tagihan KAMI ke pelanggan (`platform_invoices`). `void` = dibatalkan tanpa
 *  dihapus — dokumen bernomor tidak pernah dihapus. */
export const PLATFORM_INVOICE_STATUSES = ["draft", "issued", "paid", "void"] as const;
export const platformInvoiceStatusSchema = z.enum(PLATFORM_INVOICE_STATUSES);
export type PlatformInvoiceStatus = z.infer<typeof platformInvoiceStatusSchema>;

export const PLATFORM_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
] as const;
export const platformPaymentStatusSchema = z.enum(PLATFORM_PAYMENT_STATUSES);
export type PlatformPaymentStatus = z.infer<typeof platformPaymentStatusSchema>;

/** Metode & gateway pembayaran Indonesia — diisi sungguhan di issue #141. */
export const PAYMENT_METHODS = [
  "virtual_account",
  "qris",
  "card",
  "manual_transfer",
] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Kunci `usage_counters.key` — apa yang dihitung per tenant. */
export const USAGE_COUNTER_KEYS = ["companies", "users"] as const;
export const usageCounterKeySchema = z.enum(USAGE_COUNTER_KEYS);
export type UsageCounterKey = z.infer<typeof usageCounterKeySchema>;
