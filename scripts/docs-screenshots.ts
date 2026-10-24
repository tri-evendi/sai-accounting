/**
 * `bun run docs:screenshots` — membangkitkan ULANG tangkapan layar panduan `/docs`.
 *
 *   bun run docs:screenshots                       # semua tangkapan
 *   bun run docs:screenshots -- auth/ tenant/login # hanya yang namanya berawalan itu
 *
 * ══ Kenapa skrip, bukan tangkapan tangan ═══════════════════════════════════
 * Keputusan 5 issue #300 menolak tangkapan layar karena tangkapan yang dibuat
 * tangan menua diam-diam. Panduan bergambar (Okt 2026) menerimanya dengan satu
 * syarat: setiap gambar di `public/docs/screenshots/` lahir dari RESEP di
 * berkas ini, sehingga tombol yang pindah diperbaiki dengan menjalankan ulang
 * satu perintah. `tests/docs-screenshots.test.ts` menolak gambar tanpa resep,
 * resep tanpa gambar, dan gambar yang tidak dirujuk halaman mana pun.
 *
 * ══ BUKAN bagian `verify`/CI ═══════════════════════════════════════════════
 * Skrip ini butuh aplikasi yang BERJALAN dan basis data berisi data demo; ia
 * sengaja tidak dipanggil `bun run verify` maupun alur CI mana pun.
 *
 * ══ Prasyarat (lingkungan LOKAL, data FIKTIF) ══════════════════════════════
 *  1. PostgreSQL lokal sekali pakai, mis.
 *       docker run -d --name panduan-pg -e POSTGRES_USER=sai -e POSTGRES_PASSWORD=dokpass \
 *         -e POSTGRES_DB=sai_control -p 127.0.0.1:54341:5432 postgres:17-alpine
 *     lalu `CREATE DATABASE sai_platform; CREATE DATABASE sai_main;`.
 *  2. `.env` lokal dengan rahasia TIRUAN; `MAIL_TRANSPORT=file` dan
 *     `MAIL_OUTBOX_DIR=<folder>` — tautan atur-sandi & undangan dibaca dari
 *     surel yang ditangkap ke folder itu, tanpa SMTP.
 *  3. `bun run db:migrate:all`, lalu tenant + pemilik fiktif:
 *       bun run bootstrap -- --tenant-slug grup-sentosa --tenant-name "Grup Sentosa (Demo)" \
 *         --company-slug niaga-sentosa --company-name "PT Niaga Sentosa (Demo)" \
 *         --admin-username budi --admin-email budi@contoh.co.id --admin-name "Budi Santoso"
 *     tandai tenant demo (`UPDATE tenants SET is_demo = true WHERE slug = 'grup-sentosa'`),
 *     lalu `bun run demo:seed -- --tenant grup-sentosa`.
 *  4. `bun run build && bun run start -p 3310`, lalu jalankan skrip ini dengan
 *       DOCS_BASE_URL=http://127.0.0.1:3310 DOCS_PASSWORD=<sandi budi> bun run docs:screenshots
 *
 * Peramban: Google Chrome terpasang (`channel: "chrome"`). Tanpa Chrome,
 * pasang Chromium sekali: `bunx playwright-core install chromium`, lalu
 * `DOCS_BROWSER=chromium`.
 *
 * ⚠ Skrip ini MENULIS ke aplikasi yang ditunjuknya (meminta tautan atur ulang
 * sandi, mengundang pengguna contoh). Jangan pernah mengarahkannya ke
 * pemasangan sungguhan — hanya ke lingkungan lokal berdata demo.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import { TOURS, tourStorageKey } from "../src/lib/tours";

/* ── Konfigurasi ─────────────────────────────────────────────────────────── */

const BASE = (process.env.DOCS_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const USER = process.env.DOCS_USER ?? "budi";
const PASSWORD = process.env.DOCS_PASSWORD ?? "";
const TENANT = process.env.DOCS_TENANT ?? "grup-sentosa";
const COMPANY = process.env.DOCS_COMPANY ?? "niaga-sentosa";
/** Perusahaan contoh ketiga (demo-seed): layar produksi, dan — sebagai CV —
 *  layar bentuk usaha, modal per sekutu, dan PPh Final UMKM. */
const COMPANY_PABRIK = process.env.DOCS_COMPANY_FACTORY ?? "bangun-karya";
/** PT contoh kedua — dipakai untuk memotret layar "Buka buku" yang belum dibuka. */
const COMPANY_KEDUA = process.env.DOCS_COMPANY_SECOND ?? "distribusi-nusantara";
/** Perusahaan yang BELUM disiapkan — untuk layar wisaya penyiapan. */
const COMPANY_BARU = process.env.DOCS_COMPANY_NEW ?? "usaha-baru";
/** Pemilik tenant kedua yang uji cobanya sudah berakhir (opsional). */
const FROZEN_USER = process.env.DOCS_FROZEN_USER ?? "";
const FROZEN_PASSWORD = process.env.DOCS_FROZEN_PASSWORD ?? PASSWORD;
const OUTBOX = process.env.MAIL_OUTBOX_DIR ?? "";
const OUT_DIR = join(process.cwd(), "public", "docs", "screenshots");

/** Sama dengan `UKURAN_TANGKAPAN` di `src/lib/docs-content.ts` — dijaga tes. */
const LEBAR = 1440;
const TINGGI = 900;
const KUALITAS_WEBP = 72;

/* ── Resep ───────────────────────────────────────────────────────────────── */

/**
 * Siapa yang memotret:
 *  • `anonim` — tanpa sesi (halaman masuk, lupa sandi, undangan);
 *  • `pemilik` — pemilik tenant demo yang masih UJI COBA (`DOCS_USER`);
 *  • `beku` — pemilik tenant kedua yang uji cobanya SUDAH BERAKHIR
 *    (`DOCS_FROZEN_USER`), untuk layar hanya-baca. Resepnya dilewati bila
 *    `DOCS_FROZEN_USER` kosong.
 */
type Sesi = "anonim" | "pemilik" | "beku";

interface Resep {
  /** `<bagian>/<nama>` — menjadi `public/docs/screenshots/<nama>.webp`. */
  nama: string;
  sesi: Sesi;
  /** Alamat relatif, atau fungsi yang menghitungnya (mis. tautan dari surel). */
  buka: string | (() => string);
  /** Langkah sesudah halaman termuat (membuka dialog, mengisi contoh, …). */
  siapkan?: (page: Page) => Promise<void>;
  /** Jangan membuka kunci buku otomatis — untuk memotret layar kuncinya. */
  biarkanTerkunci?: boolean;
  /** Biarkan tur berpandu halaman ini muncul (bawaannya ditandai sudah dilihat). */
  denganTur?: boolean;
}

const c = (path: string, company = COMPANY) => `/t/${TENANT}/${company}${path}`;

/** Email contoh untuk alur undangan — domain `contoh.co.id`, fiktif. */
const EMAIL_UNDANGAN = "rina.kasir@contoh.co.id";

async function klik(page: Page, nama: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: nama }).first().click();
}

/** Pilih satu opsi di Select AntD (`@sai/ui/select`) yang ber-`id` itu. */
async function pilihOpsi(page: Page, id: string, label: string): Promise<void> {
  await page.locator(".ant-select").filter({ has: page.locator(`#${id}`) }).first().click();
  await page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    .filter({ hasText: label })
    .first()
    .click();
}

/** Gulir sampai elemen berada di atas viewport (di bawah bilah atas yang menempel). */
async function gulirKe(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -88);
  });
}

/**
 * Profil usaha CV contoh: identitas legal FIKTIF + PPh Final menyala sejak
 * 2023 (CV: batas 4 tahun pajak → 2026 tahun terakhir, jadi pengingatnya
 * tampil). MENYIMPAN — resep laporan PPh Final sesudahnya membaca setelan ini.
 */
async function isiProfilUsaha(page: Page): Promise<void> {
  await page.locator("#bp-nib").fill("9120301234567");
  await page.locator("#bp-deed").fill("12");
  await page.locator("#bp-decree").fill("AHU-0001234-AH.01.16 Tahun 2021");
  await page.locator("#bp-established").fill("2021-03-03");
  await klik(page, /Simpan identitas/);
  await page.waitForTimeout(800);
  await page.getByLabel(/Memakai PPh Final/).check();
  await page.locator("#bp-pph-start").fill("2023");
  await klik(page, /Simpan PPh Final/);
  /* Tunggu kedua toast "Profil usaha disimpan." hilang sebelum memotret. */
  await page
    .getByText("Profil usaha disimpan.")
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
}

const RESEP: Resep[] = [
  /* ── 1. Autentikasi ─────────────────────────────────────────────────── */
  { nama: "auth/login", sesi: "anonim", buka: "/login" },
  { nama: "auth/daftar-demo", sesi: "anonim", buka: "/register" },
  {
    nama: "auth/lupa-sandi",
    sesi: "anonim",
    buka: "/forgot-password",
    siapkan: async (page) => {
      await page.locator("#email").fill(process.env.DOCS_USER_EMAIL ?? "budi@contoh.co.id");
    },
  },
  {
    nama: "auth/lupa-sandi-terkirim",
    sesi: "anonim",
    buka: "/forgot-password",
    siapkan: async (page) => {
      await page.locator("#email").fill(process.env.DOCS_USER_EMAIL ?? "budi@contoh.co.id");
      await klik(page, /Kirim/);
      await page.waitForTimeout(1500);
    },
  },
  { nama: "auth/atur-sandi-baru", sesi: "anonim", buka: () => tautanDariSurel("/reset-password") },
  { nama: "auth/buka-buku", sesi: "pemilik", buka: c("", COMPANY_KEDUA), biarkanTerkunci: true },
  { nama: "auth/pilih-perusahaan", sesi: "pemilik", buka: "/select-company" },
  { nama: "auth/ganti-sandi", sesi: "pemilik", buka: "/change-password" },
  {
    nama: "auth/menu-pengguna",
    sesi: "pemilik",
    buka: c(""),
    siapkan: async (page) => {
      await page.getByRole("button", { name: /Budi Santoso/ }).first().click();
    },
  },

  /* ── 2. Panel akun (tenant) ─────────────────────────────────────────── */
  { nama: "tenant/beranda", sesi: "pemilik", buka: "/platform" },
  { nama: "tenant/identitas-akun", sesi: "pemilik", buka: "/platform/account" },
  { nama: "tenant/tim", sesi: "pemilik", buka: "/platform/team" },
  { nama: "tenant/langganan", sesi: "pemilik", buka: "/platform/billing" },
  { nama: "tenant/paket", sesi: "pemilik", buka: "/platform/billing/plans" },
  { nama: "tenant/data-privasi", sesi: "pemilik", buka: "/platform/privacy" },
  {
    nama: "tenant/tambah-perusahaan",
    sesi: "pemilik",
    buka: "/companies/new",
    siapkan: async (page) => {
      await page.locator("input").first().fill("CV Sinar Contoh Abadi");
      await pilihOpsi(page, "company-legal-form", "Persekutuan Komanditer (CV)");
    },
  },
  { nama: "tenant/hanya-baca", sesi: "beku", buka: "/platform" },
  { nama: "tenant/langganan-berakhir", sesi: "beku", buka: "/platform/billing" },

  /* ── 3. Perusahaan: dasar ───────────────────────────────────────────── */
  { nama: "perusahaan/tur-beranda", sesi: "pemilik", buka: c(""), denganTur: true },
  { nama: "perusahaan/beranda", sesi: "pemilik", buka: c("") },
  {
    nama: "perusahaan/menu-bantuan",
    sesi: "pemilik",
    buka: c(""),
    siapkan: async (page) => {
      await klik(page, /Bantuan/);
    },
  },
  {
    nama: "perusahaan/mode-akuntan",
    sesi: "pemilik",
    buka: c(""),
    siapkan: async (page) => {
      await page.getByText("Mode Akuntan", { exact: true }).first().click();
    },
  },
  { nama: "perusahaan/pemberitahuan", sesi: "pemilik", buka: c("/notifications") },
  { nama: "perusahaan/pengaturan", sesi: "pemilik", buka: c("/settings") },
  { nama: "perusahaan/modul-usaha", sesi: "pemilik", buka: c("/modules") },
  { nama: "perusahaan/setup", sesi: "pemilik", buka: c("/setup", COMPANY_BARU) },
  {
    /* Bentuk usaha CV di langkah Identitas — hanya diisi di layar, tidak
       disimpan: bentuk usaha baru diterapkan saat langkah berikutnya. */
    nama: "perusahaan/setup-sekutu-cv",
    sesi: "pemilik",
    buka: c("/setup", COMPANY_BARU),
    siapkan: async (page) => {
      await pilihOpsi(page, "legal-form", "Persekutuan Komanditer (CV)");
      await page.locator("#setup-partner-name-1").fill("Andi Pratama");
      await page.locator("#setup-partner-share-1").fill("70");
      await page.locator("#setup-partner-name-2").fill("Sari Wulandari");
      await page.locator("#setup-partner-share-2").fill("30");
      await gulirKe(page, "#npwp");
    },
  },
  {
    nama: "perusahaan/bentuk-usaha",
    sesi: "pemilik",
    buka: c("/settings", COMPANY_PABRIK),
    siapkan: async (page) => {
      await gulirKe(page, "#legal-form");
    },
  },
  {
    nama: "perusahaan/profil-usaha",
    sesi: "pemilik",
    buka: c("/settings", COMPANY_PABRIK),
    siapkan: async (page) => {
      await isiProfilUsaha(page);
      await gulirKe(page, "#business-profile");
    },
  },
  { nama: "perusahaan/impor-data-awal", sesi: "pemilik", buka: c("/master/import") },
  { nama: "perusahaan/pengguna", sesi: "pemilik", buka: c("/users") },
  {
    nama: "perusahaan/undang-pengguna",
    sesi: "pemilik",
    buka: c("/users"),
    siapkan: async (page) => {
      await klik(page, /Undang Pengguna/);
      await page.getByLabel(/Email/i).first().fill(EMAIL_UNDANGAN);
    },
  },
  {
    /* Mengirim undangan sungguhan (ke surel fiktif yang ditangkap ke berkas)
       supaya layar "Terima Undangan" di bawah punya tautan yang sah. */
    nama: "perusahaan/undangan-menunggu",
    sesi: "pemilik",
    buka: c("/users"),
    siapkan: async (page) => {
      await klik(page, /Undang Pengguna/);
      await page.getByLabel(/Email/i).first().fill(EMAIL_UNDANGAN);
      await klik(page, /Kirim Undangan/);
      await page.waitForTimeout(2000);
      await page.reload();
    },
  },
  { nama: "auth/terima-undangan", sesi: "anonim", buka: () => tautanDariSurel("/accept-invitation") },
  { nama: "perusahaan/hak-akses", sesi: "pemilik", buka: c("/permissions") },
  { nama: "perusahaan/token-api", sesi: "pemilik", buka: c("/api-tokens") },

  /* ── 4. Penjualan ───────────────────────────────────────────────────── */
  { nama: "penjualan/catat-penjualan", sesi: "pemilik", buka: c("/sales/new") },
  { nama: "penjualan/tagihan", sesi: "pemilik", buka: c("/invoices") },
  {
    nama: "penjualan/tagihan-rinci",
    sesi: "pemilik",
    buka: c("/invoices"),
    siapkan: async (page) => {
      await page.locator(`a[href*="/invoices/"]:not([href$="/new"])`).first().click();
      await page.waitForURL(/\/invoices\/\d+/);
    },
  },
  { nama: "penjualan/kontrak", sesi: "pemilik", buka: c("/contracts") },
  { nama: "penjualan/surat-jalan", sesi: "pemilik", buka: c("/delivery-orders") },
  { nama: "penjualan/piutang", sesi: "pemilik", buka: c("/receivables") },
  { nama: "penjualan/retur", sesi: "pemilik", buka: c("/returns") },
  { nama: "penjualan/transaksi-berulang", sesi: "pemilik", buka: c("/recurring") },
  { nama: "penjualan/pelanggan", sesi: "pemilik", buka: c("/customers") },

  /* ── 5. Pembelian ───────────────────────────────────────────────────── */
  { nama: "pembelian/catat-pembelian", sesi: "pemilik", buka: c("/purchases/new") },
  { nama: "pembelian/pemasok", sesi: "pemilik", buka: c("/suppliers") },
  { nama: "pembelian/utang", sesi: "pemilik", buka: c("/payables") },
  { nama: "pembelian/uang-muka", sesi: "pemilik", buka: c("/advances") },
  { nama: "pembelian/biaya-impor", sesi: "pemilik", buka: c("/landed-costs/new") },

  /* ── 6. Kas & bank ──────────────────────────────────────────────────── */
  { nama: "kas/buku-kas", sesi: "pemilik", buka: c("/finance") },
  { nama: "kas/catat-transaksi", sesi: "pemilik", buka: c("/finance/new?arah=masuk") },
  { nama: "kas/rekonsiliasi", sesi: "pemilik", buka: c("/reconciliation/new") },

  /* ── 7. Stok, aset, produksi ────────────────────────────────────────── */
  { nama: "stok/ringkasan", sesi: "pemilik", buka: c("/inventory") },
  { nama: "stok/riwayat", sesi: "pemilik", buka: c("/inventory/movement") },
  { nama: "stok/tambah-kurangi", sesi: "pemilik", buka: c("/inventory/update") },
  { nama: "stok/hitung-ulang", sesi: "pemilik", buka: c("/inventory/opname") },
  { nama: "aset/daftar", sesi: "pemilik", buka: c("/fixed-assets") },
  { nama: "aset/kategori", sesi: "pemilik", buka: c("/fixed-assets/categories") },
  { nama: "aset/baru", sesi: "pemilik", buka: c("/fixed-assets/new") },
  { nama: "manufaktur/stasiun-kerja", sesi: "pemilik", buka: c("/work-centers/new", COMPANY_PABRIK) },
  { nama: "manufaktur/resep", sesi: "pemilik", buka: c("/boms/new", COMPANY_PABRIK) },
  { nama: "manufaktur/perintah-produksi", sesi: "pemilik", buka: c("/production-orders", COMPANY_PABRIK) },

  /* ── 8. Laporan, pajak, tutup buku ──────────────────────────────────── */
  { nama: "laporan/pusat-laporan", sesi: "pemilik", buka: c("/reports") },
  {
    nama: "laporan/paket-laporan",
    sesi: "pemilik",
    buka: c("/reports"),
    siapkan: async (page) => {
      await klik(page, /Paket laporan/);
    },
  },
  { nama: "laporan/laba-rugi", sesi: "pemilik", buka: c("/reports/income-statement") },
  { nama: "laporan/neraca", sesi: "pemilik", buka: c("/reports/balance-sheet") },
  { nama: "laporan/anggaran", sesi: "pemilik", buka: c("/budget") },
  {
    /* Rincian per pemilik hanya ada di buku CV/Firma/perorangan. */
    nama: "laporan/perubahan-ekuitas-pemilik",
    sesi: "pemilik",
    buka: c("/reports/equity-changes", COMPANY_PABRIK),
    siapkan: async (page) => {
      await gulirKe(page, "h2:has-text('Rincian Modal per Pemilik')");
    },
  },
  { nama: "pajak/efaktur", sesi: "pemilik", buka: c("/tax/efaktur") },
  {
    /* Sesudah `perusahaan/profil-usaha`, yang menyalakan PPh Final CV contoh. */
    nama: "pajak/pph-final-umkm",
    sesi: "pemilik",
    buka: c("/tax/pph-final-umkm", COMPANY_PABRIK),
  },
  { nama: "akuntansi/jurnal", sesi: "pemilik", buka: c("/journal") },
  { nama: "akuntansi/buku-besar", sesi: "pemilik", buka: c("/ledger") },
  { nama: "akuntansi/daftar-akun", sesi: "pemilik", buka: c("/accounts") },
  { nama: "akuntansi/cocokkan-accurate", sesi: "pemilik", buka: c("/accurate") },
  { nama: "akuntansi/tutup-periode", sesi: "pemilik", buka: c("/periods") },
  { nama: "akuntansi/persetujuan", sesi: "pemilik", buka: c("/approvals") },
  { nama: "akuntansi/aturan-persetujuan", sesi: "pemilik", buka: c("/approvals/rules") },
];

/* ── Mesin ───────────────────────────────────────────────────────────────── */

/**
 * CSS penstabil: kursor ketik tak terlihat dan bilah gulir disembunyikan.
 *
 * ⚠ SENGAJA tidak mematikan `animation`/`transition` lewat CSS: komponen AntD
 * (tur, menu tarik-turun, dialog) menunggu `animationend` untuk menjadi
 * terlihat, dan animasi yang dimatikan paksa meninggalkannya transparan
 * selamanya. Animasi dituntaskan oleh `screenshot({ animations: "disabled" })`
 * Playwright, yang memajukan animasi berhingga ke keadaan akhirnya.
 */
const CSS_STABIL = `
  *, *::before, *::after { caret-color: transparent !important; }
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
  nextjs-portal { display: none !important; }
`;

async function luncurkan(): Promise<Browser> {
  const pilihan = process.env.DOCS_BROWSER ?? "chrome";
  return pilihan === "chromium"
    ? chromium.launch({ headless: true })
    : chromium.launch({ headless: true, channel: "chrome" });
}

async function konteksBaru(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: LEBAR, height: TINGGI },
    deviceScaleFactor: 1,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    colorScheme: "light",
    /*
     * ⚠ JANGAN `reducedMotion: "reduce"`: di bawah emulasi itu menu tarik-turun
     * dan tur AntD ada di DOM (terukur: opacity 1, kotak sah) tetapi TIDAK
     * tergambar di tangkapan — gambar menu Bantuan & tur keluar kosong.
     */
  });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([
    { name: "locale", value: "id", domain: host, path: "/" },
    { name: "theme", value: "light", domain: host, path: "/" },
  ]);
  await ctx.addInitScript((css: string) => {
    const pasang = () => {
      const s = document.createElement("style");
      s.setAttribute("data-docs-screenshot", "");
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) pasang();
    else document.addEventListener("DOMContentLoaded", pasang);
  }, CSS_STABIL);
  return ctx;
}

async function masuk(page: Page, user: string, password: string): Promise<void> {
  if (!password) throw new Error("DOCS_PASSWORD belum diisi — sandi pemilik tenant demo.");
  await page.goto(`${BASE}/login`);
  await page.locator("#identifier").fill(user);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
    page.getByRole("button", { name: "Masuk", exact: true }).click(),
  ]);
}

/**
 * Buka kunci buku perusahaan (sandi diminta ulang sekali per hari kerja per
 * perusahaan) bila halaman memantul ke `/unlock`.
 */
async function bukaKunci(page: Page, password: string): Promise<boolean> {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (!new URL(page.url()).pathname.startsWith("/unlock")) return false;
  await page.locator("input[type=password]").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/unlock"), { timeout: 30_000 }),
    page.getByRole("button", { name: /Buka buku/ }).click(),
  ]);
  return true;
}

/** Tandai semua tur berpandu sudah dilihat — kecuali resep yang memintanya. */
async function aturTur(page: Page, tampilkan: boolean): Promise<void> {
  await page.evaluate(
    ({ kunci, tampilkan }) => {
      for (const k of kunci) {
        if (tampilkan) window.localStorage.removeItem(k);
        else window.localStorage.setItem(k, "1");
      }
    },
    { kunci: TOURS.map((t) => tourStorageKey(t.id)), tampilkan }
  );
}

/** Tunggu halaman tenang: jaringan diam dan tidak ada pemutar pemuatan AntD. */
async function tenang(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page
    .locator(".ant-spin-spinning, .ant-skeleton-active")
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Tautan terakhir di surel tangkapan (`MAIL_OUTBOX_DIR`) yang memuat `penanda`. */
function tautanDariSurel(penanda: string): string {
  if (!OUTBOX) throw new Error("MAIL_OUTBOX_DIR belum diisi — tautan surel tidak bisa dibaca.");
  const berkas = readdirSync(OUTBOX)
    .map((nama) => join(OUTBOX, nama))
    .filter((p) => statSync(p).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const p of berkas) {
    const isi = readFileSync(p, "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "=");
    const cocok = [...isi.matchAll(/https?:\/\/[^\s"'<>)]+/g)]
      .map((m) => m[0])
      .find((u) => u.includes(penanda));
    if (cocok) return new URL(cocok).pathname + new URL(cocok).search;
  }
  throw new Error(`Tidak ada surel bertautan "${penanda}" di ${OUTBOX}.`);
}

async function simpan(nama: string, png: Buffer): Promise<number> {
  const tujuan = join(OUT_DIR, `${nama}.webp`);
  mkdirSync(dirname(tujuan), { recursive: true });
  const webp = await sharp(png)
    .resize(LEBAR, TINGGI, { fit: "cover", position: "top" })
    .webp({ quality: KUALITAS_WEBP, effort: 6, smartSubsample: true })
    .toBuffer();
  writeFileSync(tujuan, webp);
  return webp.length;
}

async function main() {
  const saring = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const pilihan = saring.length
    ? RESEP.filter((r) => saring.some((s) => r.nama.startsWith(s)))
    : RESEP;
  if (pilihan.length === 0) {
    console.error(`Tidak ada resep yang cocok dengan: ${saring.join(", ")}`);
    process.exit(1);
  }

  const browser = await luncurkan();
  const halaman = new Map<Sesi, Page>();
  const sandi: Record<Sesi, string> = { anonim: "", pemilik: PASSWORD, beku: FROZEN_PASSWORD };
  const butuh = new Set(pilihan.map((r) => r.sesi));
  for (const sesi of butuh) {
    if (sesi === "beku" && !FROZEN_USER) continue;
    const page = await (await konteksBaru(browser)).newPage();
    if (sesi === "pemilik") await masuk(page, USER, PASSWORD);
    if (sesi === "beku") await masuk(page, FROZEN_USER, FROZEN_PASSWORD);
    halaman.set(sesi, page);
  }

  let total = 0;
  let jumlah = 0;
  const gagal: string[] = [];
  for (const r of pilihan) {
    const page = halaman.get(r.sesi);
    if (!page) {
      console.log(`– ${r.nama.padEnd(40)} dilewati (DOCS_FROZEN_USER kosong)`);
      continue;
    }
    try {
      const alamat = typeof r.buka === "string" ? r.buka : r.buka();
      await page.goto(`${BASE}${alamat}`, { waitUntil: "domcontentloaded" });
      if (!r.biarkanTerkunci && (await bukaKunci(page, sandi[r.sesi]))) {
        /* Sesudah kunci terbuka, aplikasi mendaratkan di beranda — buka lagi tujuannya. */
        await page.goto(`${BASE}${alamat}`, { waitUntil: "domcontentloaded" });
      }
      if (r.sesi !== "anonim") {
        await aturTur(page, Boolean(r.denganTur));
        await page.reload({ waitUntil: "domcontentloaded" });
      }
      await tenang(page);
      /* Tetikus disingkirkan SEBELUM langkah siapkan: menu tarik-turun yang
         terbuka karena klik tetap terbuka, dan tidak ada tooltip hover liar. */
      await page.mouse.move(LEBAR - 1, TINGGI - 1);
      if (r.siapkan) {
        await r.siapkan(page);
        await tenang(page);
      }
      if (r.denganTur) {
        await page.locator(".ant-tour").first().waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
      }
      const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      const ukuran = await simpan(r.nama, png);
      total += ukuran;
      jumlah += 1;
      console.log(`✓ ${r.nama.padEnd(40)} ${(ukuran / 1024).toFixed(0).padStart(5)} KB  ${page.url().replace(BASE, "")}`);
    } catch (e) {
      gagal.push(r.nama);
      console.error(`✗ ${r.nama}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  await browser.close();

  console.log(`\n${jumlah}/${pilihan.length} tangkapan, ${(total / 1024 / 1024).toFixed(2)} MB.`);
  if (gagal.length) {
    console.error(`Gagal: ${gagal.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
