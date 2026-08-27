/**
 * KREDENSIAL GERBANG PEMBAYARAN MILIK PT (issue #466, butir 5 & 6).
 *
 * ══ SATU ATURAN YANG MENGATASI SEMUA YANG LAIN DI BERKAS INI ═══════════════
 * **Tidak ada kredensial → gerbangnya `manual`. TIDAK PERNAH jatuh ke
 * `MIDTRANS_SERVER_KEY` milik platform.**
 *
 * Kredensial platform melayani satu hal: tagihan langganan SaaS kita sendiri.
 * Memakainya untuk faktur pelanggan sebuah PT berarti uang pelanggan PT itu
 * mendarat di **rekening kita**. Ia tidak akan melempar, tidak akan merah di
 * log, dan tidak akan terlihat sampai seseorang membandingkan mutasi bank
 * dengan buku — kelas kegagalan yang sama persis dengan konteks perusahaan yang
 * hilang di `docs/MULTI-COMPANY.md`, dan sama diamnya.
 *
 * Karena itu berkas ini tidak pernah membaca `process.env.MIDTRANS_*` sama
 * sekali — bukan "membacanya sebagai cadangan", melainkan tidak membacanya.
 * Dijaga `tests/company-payment-settings.test.ts`.
 *
 * ══ LINGKUPNYA BATAS BASIS DATA, BUKAN KLAUSA `WHERE` ══════════════════════
 * Barisnya hidup di `company_settings` DI DALAM basis data PT itu (satu PT =
 * satu basis data, issue #104). Tidak ada `companyId` untuk dibandingkan, jadi
 * tidak ada `companyId` yang bisa lupa dibandingkan. Yang wajib dijaga
 * pemanggil adalah hal lain: bahwa ia memang sedang berada di konteks
 * perusahaan yang benar (`runWithCompany`) — dan itu urusan penjaga rute, bukan
 * berkas ini.
 *
 * ══ SANDBOX vs PRODUKSI DISIMPAN, TIDAK DITEBAK ════════════════════════════
 * Kunci sandbox yang dipakai di produksi tidak pernah gagal dengan berisik: ia
 * menerbitkan nomor VA yang tampak sah dan tidak pernah menerima satu rupiah
 * pun. Pengguna baru akan menyimpulkan pelanggannya tidak membayar.
 */
import "server-only";

import { openSecret, sealSecret } from "@/lib/settings-crypto";
import {
  manualPaymentGateway,
  midtransGatewayWith,
  type PaymentGateway,
} from "@/lib/payment-gateway";

/**
 * Bentuk baris yang dibutuhkan — STRUKTURAL, bukan tipe generated.
 *
 * Pola yang sama dengan `mail-settings.ts`: tes memakai objek biasa, dan
 * penjaga sifat-sifat di bawah tidak butuh basis data sama sekali.
 */
export interface CompanyPaymentRow {
  paymentGateway: string | null;
  paymentClientKey: string | null;
  paymentServerKeyCiphertext: string | null;
  paymentServerKeyIv: string | null;
  paymentServerKeyTag: string | null;
  paymentIsProduction: boolean;
}

export interface CompanyPaymentCredentials {
  clientKey: string | null;
  serverKey: string;
  isProduction: boolean;
}

/**
 * Buka kredensial tersimpan.
 *
 * `null` — bukan lemparan — untuk SETIAP bentuk ketiadaan: kolom kosong, tiga
 * kolom GCM yang tidak lengkap, atau kunci enkripsi yang hilang/berganti.
 * Alasannya sama dengan `storedMailPassword`: fitur pembayaran yang tidak bisa
 * dipakai harus MENGHILANG (butir 6), bukan meruntuhkan halaman fakturnya.
 *
 * Kegagalan membuka tetap ditulis ke log server — ia menandakan
 * `SETTINGS_ENCRYPTION_KEY` berganti, dan itu perlu diketahui operator meski
 * pengguna tidak boleh melihatnya.
 */
export function companyPaymentCredentials(
  row: CompanyPaymentRow | null | undefined
): CompanyPaymentCredentials | null {
  if (!row) return null;
  if (row.paymentGateway !== "midtrans") return null;

  const { paymentServerKeyCiphertext: ciphertext, paymentServerKeyIv: iv, paymentServerKeyTag: tag } = row;
  /* Ketiganya, atau tidak sama sekali. Dua dari tiga bukan "sebagian
     tersimpan", ia baris rusak — dan menebak sisanya berarti menebak kunci. */
  if (!ciphertext || !iv || !tag) return null;

  let serverKey: string;
  try {
    serverKey = openSecret({ ciphertext, iv, tag });
  } catch (error) {
    console.error(
      "[company-payment] server key Midtrans tersimpan tidak bisa dibuka " +
        "(SETTINGS_ENCRYPTION_KEY hilang atau berganti):",
      error instanceof Error ? error.message : error
    );
    return null;
  }

  /* Kunci kosong sesudah dibuka bukan kredensial — ia rahasia yang tersegel
     dengan benar dan tidak berisi apa-apa. */
  if (serverKey.trim() === "") return null;

  return {
    clientKey: row.paymentClientKey,
    serverKey,
    isProduction: row.paymentIsProduction,
  };
}

/**
 * BUTIR 6 — apakah PT ini boleh menawarkan VA/QRIS sama sekali?
 *
 * Dipakai lapisan tampilan untuk MENYEMBUNYIKAN fiturnya, bukan untuk
 * menampilkan tombol yang gagal saat diklik. Tombol yang ujungnya bukan yang
 * dijanjikan lebih buruk daripada tidak ada tombol — catatan yang sama sudah
 * berdiri di `offersInstantPayment`.
 */
export function companyOffersInstantPayment(row: CompanyPaymentRow | null | undefined): boolean {
  return companyPaymentCredentials(row) !== null;
}

/**
 * BUTIR 5 — gerbang untuk faktur PT ini.
 *
 * Tanpa kredensial → `manual`. Baca lagi catatan kepala berkas kalau tergoda
 * menambahkan cadangan yang membaca env di sini.
 *
 * `transport` disuntikkan supaya seluruh alurnya bisa diuji tanpa jaringan;
 * bawaannya `real` di produksi dan `mock` di luar produksi, sehingga sebuah
 * kunci sungguhan yang tak sengaja terpasang di laptop pengembang tidak pernah
 * menghubungi Midtrans.
 */
export function companyPaymentGateway(
  row: CompanyPaymentRow | null | undefined,
  transport: "real" | "mock" = process.env.NODE_ENV === "production" ? "real" : "mock"
): PaymentGateway {
  const credentials = companyPaymentCredentials(row);
  if (!credentials) return manualPaymentGateway();
  return midtransGatewayWith({
    serverKey: credentials.serverKey,
    isProduction: credentials.isProduction,
    transport,
  });
}

export interface SaveCompanyPaymentInput {
  /** `null` / "" mematikan fitur dan MENGHAPUS kunci tersimpan. */
  gateway: "midtrans" | null;
  clientKey?: string | null;
  /** `undefined` = jangan ubah kunci yang sudah tersimpan. */
  serverKey?: string;
  isProduction?: boolean;
}

/**
 * Rakit nilai kolom untuk disimpan — MURNI, tidak menyentuh basis data.
 *
 * Dipisah dari penulisannya supaya penyegelan bisa diuji tanpa Prisma, dan
 * supaya pemanggil tidak pernah punya alasan menyusun kolomnya sendiri.
 *
 * ⚠ `serverKey: undefined` berarti "biarkan yang tersimpan" — itu yang membuat
 * formulir pengaturan bisa menampilkan `••••` dan disimpan ulang tanpa
 * mengharuskan pengguna mengetik ulang kuncinya. `""` BUKAN hal yang sama: ia
 * permintaan eksplisit untuk mengosongkan.
 */
export function companyPaymentUpdate(input: SaveCompanyPaymentInput): Partial<CompanyPaymentRow> {
  if (input.gateway === null) {
    /* Dimatikan → kuncinya ikut dihapus, tidak sekadar ditandai mati. Rahasia
       yang tertinggal di baris yang "tidak dipakai" tetap rahasia yang bocor
       kalau basis datanya bocor. */
    return {
      paymentGateway: null,
      paymentClientKey: null,
      paymentServerKeyCiphertext: null,
      paymentServerKeyIv: null,
      paymentServerKeyTag: null,
      paymentIsProduction: false,
    };
  }

  const update: Partial<CompanyPaymentRow> = {
    paymentGateway: "midtrans",
    paymentClientKey: input.clientKey?.trim() || null,
  };
  if (input.isProduction !== undefined) update.paymentIsProduction = input.isProduction;

  if (input.serverKey !== undefined) {
    const trimmed = input.serverKey.trim();
    if (trimmed === "") {
      update.paymentServerKeyCiphertext = null;
      update.paymentServerKeyIv = null;
      update.paymentServerKeyTag = null;
    } else {
      const sealed = sealSecret(trimmed);
      update.paymentServerKeyCiphertext = sealed.ciphertext;
      update.paymentServerKeyIv = sealed.iv;
      update.paymentServerKeyTag = sealed.tag;
    }
  }

  return update;
}

/**
 * Bentuk yang AMAN dikirim ke peramban.
 *
 * Server key tidak pernah ikut — tidak sebagai teks, tidak sebagai cipher.
 * Yang boleh diketahui layar hanyalah bahwa sebuah kunci ADA.
 */
export interface CompanyPaymentView {
  gateway: "midtrans" | null;
  clientKey: string | null;
  hasServerKey: boolean;
  isProduction: boolean;
}

export function companyPaymentView(row: CompanyPaymentRow | null | undefined): CompanyPaymentView {
  return {
    gateway: row?.paymentGateway === "midtrans" ? "midtrans" : null,
    clientKey: row?.paymentClientKey ?? null,
    /* Diukur dari kolom cipher, BUKAN dari `companyPaymentCredentials()`: kunci
       yang tersimpan tapi tidak bisa dibuka tetap "ada", dan formulirnya harus
       menawarkan mengganti — bukan menyatakan kosong lalu diam-diam menimpa. */
    hasServerKey: Boolean(
      row?.paymentServerKeyCiphertext && row?.paymentServerKeyIv && row?.paymentServerKeyTag
    ),
    isProduction: row?.paymentIsProduction ?? false,
  };
}
