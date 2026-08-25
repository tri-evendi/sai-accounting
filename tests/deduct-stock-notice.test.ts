/**
 * KONFIRMASI "POTONG STOK" DI HALAMAN KONTRAK (issue #491, separuh kedua).
 *
 * == Permintaan yang dijawabnya ============================================
 * Pengguna, 24 Agustus 2026: "setiap kontrak done atau selesai pembayaran dan
 * pengiriman nanti akan potong langsung stok persediaan barang".
 *
 * Diterjemahkan apa adanya, permintaan itu bertabrakan dengan doktrin yang
 * sudah berjalan: stok dipotong SURAT JALAN. Kalau kontrak ikut memotong, satu
 * pengiriman terpotong DUA KALI.
 *
 * Yang sebenarnya hilang bukan pemotongan otomatis melainkan KABAR: kontraknya
 * sudah selesai difakturkan, stoknya masih utuh, dan tidak ada satu pun tanda
 * yang mengatakan kenapa. Jadi keadaannya dikatakan, dan keputusannya
 * diserahkan — lewat jalur yang sudah teruji.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildContractOutstanding } from "@/lib/document-chain";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

const KONTRAK = "app/(app)/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/[id]";

const notice = src(...KONTRAK.split("/"), "deduct-stock-notice.tsx");
const page = src(...KONTRAK.split("/"), "page.tsx");

describe("stok TIDAK dipotong dari layar kontrak", () => {
  it("konfirmasinya membuka surat jalan, bukan menulis ke buku besar", () => {
    /* Sebuah tombol di halaman kontrak yang langsung menulis ke buku besar
       adalah persis jenis kejutan yang doktrin ini dibuat untuk cegah. */
    expect(notice).toMatch(/router\.push\(`\/delivery-orders\/new\?contractId=/);
  });

  it("tidak memanggil satu pun jalur tulis", () => {
    expect(notice).not.toMatch(/apiFetch|fetch\(/);
    expect(notice).not.toMatch(/method:\s*"POST"/);
    expect(notice).not.toMatch(/stockMovement|postForSource/);
  });

  it("konfirmasinya MENGATAKAN bahwa stok belum berkurang saat itu", () => {
    /* Kalau kalimatnya menjanjikan pemotongan seketika, tombolnya berbohong —
       yang terjadi hanyalah sebuah formulir terbuka. */
    const id = JSON.parse(
      readFileSync(join(__dirname, "..", "src", "lib", "i18n", "dictionaries", "id.json"), "utf8")
    );
    expect(id.contracts.deductStockMessage).toMatch(/tidak dipotong dari layar ini/i);
    expect(id.contracts.deductStockMessage).toMatch(/\{qty\}/);
  });
});

describe("kapan pemberitahuannya muncul", () => {
  it("hanya saat difakturkan PENUH dan masih ada yang belum bersurat jalan", () => {
    expect(page).toMatch(/totals\.remainingKg === 0 && totals\.undeliveredKg > 0/);
  });

  /*
   * Sifat angkanya diuji lewat mesinnya sendiri, bukan lewat teks halaman:
   * `undeliveredKg` inilah yang ditawarkan untuk dipotong, jadi ia harus benar.
   */
  const lines = [{ itemId: 6, itemName: "CLOVE", bags: 10, kgPerBag: 100, pricePerKg: 85_000 }];

  it("kontrak yang difakturkan penuh tanpa surat jalan: pemberitahuan MUNCUL", () => {
    const out = buildContractOutstanding({
      lines,
      invoiced: [{ itemId: 6, itemName: "CLOVE", quantity: 1000, price: 85_000 }],
    });
    expect(out.totals.remainingKg).toBe(0);
    expect(out.totals.undeliveredKg).toBe(1000);
  });

  it("kontrak yang sudah bersurat jalan penuh: TIDAK muncul", () => {
    const out = buildContractOutstanding({
      lines,
      delivered: [{ itemId: 6, itemName: "CLOVE", quantity: 1000 }],
      invoiced: [{ itemId: 6, itemName: "CLOVE", quantity: 1000, price: 85_000 }],
    });
    expect(out.totals.undeliveredKg).toBe(0);
  });

  it("kontrak yang belum difakturkan penuh: TIDAK muncul, sebab belum selesai", () => {
    /* Kontrak yang barangnya memang belum dikirim berada di keadaan ini dengan
       BENAR — memberitahunya hanya akan melatih pengguna mengabaikan kabar. */
    const out = buildContractOutstanding({
      lines,
      invoiced: [{ itemId: 6, itemName: "CLOVE", quantity: 400, price: 85_000 }],
    });
    expect(out.totals.remainingKg).toBe(600);
  });
});

describe("surat jalan menerima kontrak yang sudah terpilih", () => {
  const doPage = src(
    "app",
    "(app)",
    "(dashboard)",
    "t",
    "[tenantSlug]",
    "[companySlug]",
    "delivery-orders",
    "new",
    "page.tsx"
  );
  const doForm = src(
    "app",
    "(app)",
    "(dashboard)",
    "t",
    "[tenantSlug]",
    "[companySlug]",
    "delivery-orders",
    "new",
    "delivery-order-form.tsx"
  );

  it("`?contractId=` dibaca dan diteruskan", () => {
    expect(doPage).toMatch(/searchParams/);
    expect(doPage).toMatch(/initialContractId=\{preselectedContractId\}/);
  });

  it("query karangan diabaikan diam-diam, bukan jadi galat halaman", () => {
    expect(doPage).toMatch(/\/\^\\d\+\$\/\.test\(raw\)/);
  });

  it("kontrak terpilih mewarisi consignee-nya, sama seperti dipilih tangan", () => {
    /* Tanpa ini, dua jalan masuk ke layar yang sama menghasilkan formulir yang
       berbeda isinya — dan yang lewat tautan terasa setengah terisi. */
    expect(doForm).toMatch(/initialContractId == null/);
    expect(doForm).toMatch(/consigneeId \?\? null/);
  });
});
