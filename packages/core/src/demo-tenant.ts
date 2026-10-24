/**
 * TENANT DEMO — pagar & profil data contoh untuk `bun run demo:seed` /
 * `demo:reset` (alur demo-first, keputusan pemilik 24 Okt 2026).
 *
 * ══ KENAPA PAGARNYA DI MODUL MURNI ═════════════════════════════════════════
 * Skrip demo MENULIS ke buku tiga PT dan — pada `--reset` — MENGOSONGKAN buku
 * itu sampai ke bagan akunnya. Satu-satunya hal yang memisahkan "alat demo"
 * dari "alat perusak buku sungguhan" adalah keputusan di bawah, jadi ia berdiri
 * sendiri, tanpa basis data, dan diuji habis (`tests/demo-tenant.test.ts`).
 * Skripnya hanya menerjemahkan jawabannya menjadi kalimat dan kode keluar.
 *
 * Aturannya sengaja SEMPIT:
 *   • tenant WAJIB bertanda `tenants.is_demo` (migration kendali 0013) — bendera
 *     yang hanya bisa dinyalakan operator saat membuat tenant di konsol;
 *   • `--reset` WAJIB disertai `--confirm <slug-tenant>` yang diketik ulang
 *     (pola konfirmasi bukti #134/#142, bukan "y");
 *   • tidak ada mode "semua tenant", tidak ada `--force`.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */

import type { LegalForm, PartnerRole } from "./legal-form";

import { businessDate, businessParts } from "./business-date";

export type DemoSeedRefusal =
  /** Slug tidak dikenal. */
  | "not_found"
  /** Tenant ada tetapi BUKAN tenant demo — buku sungguhan tidak pernah disentuh. */
  | "not_demo"
  /** Tenant demo yang sudah dihapus/berhenti/pindah — tidak diisi ulang. */
  | "inactive"
  /** `--reset` tanpa konfirmasi slug yang cocok. */
  | "confirm_mismatch";

/** Status tenant yang boleh diisi data contoh. */
const SEEDABLE_STATUSES: readonly string[] = ["trialing", "active"];

export function demoSeedRefusal(
  tenant: { slug: string; isDemo: boolean; status: string } | null,
  opts: { reset: boolean; confirm: string | null }
): DemoSeedRefusal | null {
  if (!tenant) return "not_found";
  if (!tenant.isDemo) return "not_demo";
  if (!SEEDABLE_STATUSES.includes(tenant.status)) return "inactive";
  if (opts.reset && (opts.confirm ?? "").trim() !== tenant.slug) return "confirm_mismatch";
  return null;
}

/**
 * Tiga PT contoh — satu grup, tiga bidang usaha, supaya laporan KONSOLIDASI
 * punya sesuatu untuk dijumlahkan dan dibandingkan. Slug-nya tetap (bukan
 * diturunkan dari nama tenant): skrip yang dijalankan ulang menemukan PT yang
 * sama, dan nama basis datanya `sai_t{tenantId}_{slug}` tetap unik per tenant,
 * jadi satu tenant demo per mitra tidak saling bertabrakan.
 *
 * NPWP/NITKU di sini FIKTIF dan diawali `0099` — bentuknya sah untuk ekspor
 * Coretax (16 / 22 digit), isinya bukan milik siapa pun.
 */
export interface DemoCompanyProfile {
  slug: string;
  name: string;
  address: string;
  npwp: string;
  nitku: string;
  /** Kode pendek untuk nomor dokumen (`DEMO/<kode>/…`). */
  code: string;
  items: { code: string; name: string; unit: string; unitCost: number; price: number; openingQty: number }[];
  customers: { name: string; address: string; phone: string; npwp: string; nitku: string }[];
  suppliers: { name: string; address: string; phone: string }[];
  /**
   * Bentuk usaha (24 Okt 2026). Tidak disebut = PT. Demo memuat satu CV supaya
   * presentasi bisa menunjukkan modal & prive per sekutu dan tutup buku yang
   * membagi laba.
   */
  legalForm?: LegalForm;
  /** Sekutu CV/Firma (porsi basis poin, jumlah 10000) atau pemilik perorangan. */
  partners?: { name: string; role?: PartnerRole | null; shareBp: number }[];
}

export const DEMO_TAG = "[DEMO]";

export const DEMO_COMPANIES: readonly DemoCompanyProfile[] = [
  {
    slug: "niaga-sentosa",
    name: "PT Niaga Sentosa (Demo)",
    address: "Jl. Gatot Subroto Kav. 21, Jakarta Selatan",
    npwp: "0099111122223001",
    nitku: "0099111122223001000000",
    code: "NS",
    items: [
      { code: "BRS-05", name: "Beras Premium 5 kg", unit: "karung", unitCost: 68_000, price: 82_000, openingQty: 400 },
      { code: "MYK-02", name: "Minyak Goreng 2 L", unit: "botol", unitCost: 31_000, price: 38_500, openingQty: 600 },
      { code: "GLP-01", name: "Gula Pasir 1 kg", unit: "pak", unitCost: 15_500, price: 18_900, openingQty: 800 },
    ],
    customers: [
      { name: "PT Swalayan Makmur Jaya", address: "Jl. Pemuda No. 88, Semarang", phone: "024-8441200", npwp: "0099300000001001", nitku: "0099300000001001000000" },
      { name: "CV Toko Berkah Abadi", address: "Jl. Ahmad Yani No. 15, Bekasi", phone: "021-8853311", npwp: "0099300000002001", nitku: "0099300000002001000000" },
      { name: "PT Ritel Nusantara Sejahtera", address: "Jl. Asia Afrika No. 120, Bandung", phone: "022-4231170", npwp: "0099300000003001", nitku: "0099300000003001000000" },
    ],
    suppliers: [
      { name: "PT Agro Pangan Lestari", address: "Kawasan Industri Jababeka, Cikarang", phone: "021-8934500" },
      { name: "PT Sawit Prima Olah", address: "Jl. Lintas Timur Km 12, Pekanbaru", phone: "0761-571220" },
    ],
  },
  {
    slug: "distribusi-nusantara",
    name: "PT Distribusi Nusantara (Demo)",
    address: "Jl. Raya Rungkut Industri No. 7, Surabaya",
    npwp: "0099111122224001",
    nitku: "0099111122224001000000",
    code: "DN",
    items: [
      { code: "AMN-600", name: "Air Mineral 600 ml (karton 24)", unit: "karton", unitCost: 38_000, price: 46_000, openingQty: 500 },
      { code: "MIE-40", name: "Mi Instan Goreng (karton 40)", unit: "karton", unitCost: 104_000, price: 121_000, openingQty: 300 },
      { code: "KPI-10", name: "Kopi Sachet (renceng 10)", unit: "renceng", unitCost: 9_800, price: 12_500, openingQty: 1_500 },
    ],
    customers: [
      { name: "PT Grosir Timur Raya", address: "Jl. Kapas Krampung No. 45, Surabaya", phone: "031-3812240", npwp: "0099300000004001", nitku: "0099300000004001000000" },
      { name: "CV Mitra Kelontong Bali", address: "Jl. Teuku Umar No. 9, Denpasar", phone: "0361-224580", npwp: "0099300000005001", nitku: "0099300000005001000000" },
      { name: "PT Minimarket Sentral", address: "Jl. Veteran No. 33, Malang", phone: "0341-362210", npwp: "0099300000006001", nitku: "0099300000006001000000" },
    ],
    suppliers: [
      { name: "PT Tirta Sumber Alam", address: "Jl. Raya Pandaan Km 5, Pasuruan", phone: "0343-631100" },
      { name: "PT Pangan Instan Indonesia", address: "Jl. Industri Raya No. 3, Sidoarjo", phone: "031-8962300" },
    ],
  },
  {
    slug: "bangun-karya",
    name: "CV Bangun Karya Mandiri (Demo)",
    legalForm: "cv",
    partners: [
      { name: "Hendra Wijaya", role: "aktif", shareBp: 6000 },
      { name: "Lestari Putri", role: "komanditer", shareBp: 4000 },
    ],
    address: "Jl. Soekarno-Hatta No. 501, Bandung",
    npwp: "0099111122225001",
    nitku: "0099111122225001000000",
    code: "BK",
    items: [
      { code: "SMN-50", name: "Semen Portland 50 kg", unit: "sak", unitCost: 58_000, price: 67_500, openingQty: 1_000 },
      { code: "BSI-10", name: "Besi Beton 10 mm", unit: "batang", unitCost: 72_000, price: 84_000, openingQty: 600 },
      { code: "CAT-05", name: "Cat Tembok 5 kg", unit: "galon", unitCost: 118_000, price: 139_000, openingQty: 200 },
    ],
    customers: [
      { name: "PT Konstruksi Andalan Utama", address: "Jl. Pasteur No. 56, Bandung", phone: "022-2034510", npwp: "0099300000007001", nitku: "0099300000007001000000" },
      { name: "CV Graha Bangunan Prima", address: "Jl. Siliwangi No. 12, Bogor", phone: "0251-8321040", npwp: "0099300000008001", nitku: "0099300000008001000000" },
      { name: "PT Properti Hijau Lestari", address: "Jl. BSD Raya Utama, Tangerang Selatan", phone: "021-53160220", npwp: "0099300000009001", nitku: "0099300000009001000000" },
    ],
    suppliers: [
      { name: "PT Semen Nusa Perkasa", address: "Jl. Raya Narogong Km 11, Bogor", phone: "021-8230050" },
      { name: "PT Baja Logam Utama", address: "Kawasan Industri Krakatau, Cilegon", phone: "0254-311870" },
    ],
  },
];

/**
 * Tanggal ke-`day` pada BULAN PENUH SEBELUM bulan `today` (kalender Jakarta,
 * jam 10.00) — "satu bulan transaksi" selalu bulan yang sudah lewat, jadi
 * laporan bulanannya lengkap dan bisa ditutup di depan prospek. Hari yang
 * melampaui panjang bulan dipotong ke hari terakhirnya.
 */
export function demoDate(today: Date, day: number): Date {
  const { year, month } = businessParts(today);
  const y = month === 0 ? year - 1 : year;
  const m = month === 0 ? 11 : month - 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return businessDate(y, m, Math.min(Math.max(1, day), last), 10);
}

/** Awal tahun buku untuk saldo awal: 1 Januari tahun bulan contoh. */
export function demoFiscalYearStart(today: Date): Date {
  const first = demoDate(today, 1);
  return businessDate(businessParts(first).year, 0, 1);
}
