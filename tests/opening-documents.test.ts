/**
 * Dokumen pembuka piutang & utang (issue #381 tahap 3).
 *
 * ══ CACAT YANG DIJAGA ══════════════════════════════════════════════════════
 * Saldo awal piutang/utang masuk sebagai SATU BARIS JURNAL per mitra ke akun
 * kontrol. Neraca benar. Tetapi buku besar pembantu — umur piutang, daftar
 * tagihan yang bisa dilunasi — membaca DOKUMEN SUMBER, bukan baris jurnal.
 * Akibatnya di hari pertama pelanggan pindahan: umur piutang kosong walau
 * neraca menunjukkan miliaran, dan faktur lama tidak bisa dilunasi.
 *
 * ══ DUA SIFAT YANG PALING MUDAH HILANG ═════════════════════════════════════
 *  1. Faktur pembuka WAJIB punya baris item. Total faktur di seluruh aplikasi
 *     ini dihitung dari `invoice_items`, bukan dari sebuah kolom nilai — faktur
 *     tanpa baris bernilai NOL dan dilewati diam-diam oleh umur piutang, yaitu
 *     persis kegagalan yang tahap ini ada untuk memperbaikinya.
 *  2. Dokumen pembuka TIDAK BOLEH memposting. Membuat barisnya saja memang
 *     tidak memposting apa pun — tapi SUNTINGAN pertama memanggil
 *     `repostForSource`, dan saat itu ia menerbitkan jurnal DI ATAS nilai yang
 *     sudah tercatat di jurnal pembuka.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const tanpaKomentar = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const opening = read("src", "lib", "opening-balance.ts");
const posting = read("src", "lib", "posting", "index.ts");

describe("dokumen pembuka diterbitkan bersama jurnalnya", () => {
  it("piutang menjadi FAKTUR, utang menjadi transaksi pemasok", () => {
    expect(opening).toContain("tx.invoice.create");
    expect(opening).toContain("tx.supplierTransaction.create");
  });

  it("keduanya ditandai `isOpening`", () => {
    // Penanda inilah yang menahan penggandaan di kedua sisi.
    const kode = tanpaKomentar(opening);
    expect((kode.match(/isOpening: true/g) ?? []).length).toBe(2);
  });

  it("faktur pembuka membawa SATU baris item", () => {
    // Tanpa baris, `invoiceSubtotal(inv.items)` = 0 dan `receivables.ts`
    // melewatinya (`if (total <= EPSILON) continue`) — fakturnya ada di basis
    // data dan tidak pernah muncul di umur piutang.
    const blok = opening.slice(opening.indexOf("tx.invoice.create"));
    expect(blok.slice(0, 900)).toContain("items: {");
    expect(blok.slice(0, 900)).toContain("quantity: 1");
    expect(blok.slice(0, 900)).toContain("price: amount");
  });

  it("sisi UTANG sengaja tanpa baris item", () => {
    // `supplier_transactions` dibaca dari kolom `amount`. Menambahkan baris
    // "demi konsistensi" berarti membuat baris yang tidak dibaca siapa pun.
    const blok = opening.slice(opening.indexOf("tx.supplierTransaction.create"));
    expect(blok.slice(0, 600)).not.toContain("items: {");
    expect(blok.slice(0, 600)).toContain("amount,");
  });

  it("nilai IDR base ikut disimpan, bukan diturunkan ulang nanti", () => {
    const blok = opening.slice(opening.indexOf("tx.invoice.create"));
    expect(blok.slice(0, 900)).toContain("baseAmount");
  });

  it("dokumennya lahir di TRANSAKSI yang sama dengan jurnal pembuka", () => {
    // Setengahnya saja — jurnal tanpa dokumen, atau dokumen tanpa jurnal —
    // adalah persis cacat yang sedang diperbaiki.
    const mulai = opening.indexOf("prisma.$transaction");
    expect(mulai).toBeGreaterThan(-1);
    expect(opening.indexOf("tx.invoice.create")).toBeGreaterThan(mulai);
    expect(opening.indexOf("tx.supplierTransaction.create")).toBeGreaterThan(mulai);
  });
});

describe("dokumen pembuka tidak pernah memposting", () => {
  it("mesin posting menolaknya SEBELUM entrinya dibangun", () => {
    const kode = tanpaKomentar(posting);
    expect(kode).toContain("isOpeningDocument");
    // Di `buildStampedEntry` — satu tempat, bukan di setiap pembangun:
    // pemeriksaan yang harus diingat berkali-kali akan terlupa pada jenis
    // dokumen berikutnya.
    const blok = kode.slice(kode.indexOf("async function buildStampedEntry"));
    expect(blok.slice(0, 400)).toContain("if (await isOpeningDocument(client, ctx)) return null;");
  });

  it("kedua jenis dokumen dikenali penjaganya", () => {
    const kode = tanpaKomentar(posting);
    const blok = kode.slice(kode.indexOf("OPENING_AWARE"));
    expect(blok.slice(0, 700)).toContain("invoice:");
    expect(blok.slice(0, 700)).toContain("supplier_transaction:");
  });

  it("penjaganya berlaku juga di jalur SUNTING", () => {
    /*
     * `repostForSource` memanggil `buildStampedEntry` yang sama, jadi penjaga
     * di sana otomatis menutup jalur sunting. Yang diuji di sini: keduanya
     * memang lewat satu pintu — kalau suatu hari `repostForSource` memanggil
     * `buildEntry` langsung, penjaganya terlewat dan penggandaan kembali.
     */
    const kode = tanpaKomentar(posting);
    const repost = kode.slice(kode.indexOf("export async function repostForSource"));
    expect(repost.slice(0, 900)).toContain("buildStampedEntry");
    expect(repost.slice(0, 900)).not.toMatch(/await buildEntry\(/);
  });
});

describe("dokumen pembuka terkunci dari sunting & hapus", () => {
  const invoiceRoute = read("src", "app", "api", "invoices", "[id]", "route.ts");
  const supplierRoute = read(
    "src", "app", "api", "suppliers", "[id]", "transactions", "route.ts"
  );

  it("faktur: PUT dan DELETE sama-sama menolak", () => {
    // Nilainya ada di jurnal pembuka, bukan di jurnalnya sendiri — menyuntingnya
    // tidak menggerakkan buku besar, ia hanya membuat dokumen dan akun
    // kontrolnya berhenti sama, diam-diam.
    expect((invoiceRoute.match(/openingDocumentLocked/g) ?? []).length).toBe(2);
  });

  it("transaksi pemasok: PUT dan DELETE sama-sama menolak", () => {
    expect((supplierRoute.match(/openingDocumentLocked/g) ?? []).length).toBe(2);
  });

  it("ditolak 409, bukan 400 — permintaannya sah, keadaannya yang menolak", () => {
    expect(invoiceRoute).toMatch(/openingDocumentLocked[\s\S]{0,60}status: 409/);
    expect(supplierRoute).toMatch(/openingDocumentLocked[\s\S]{0,60}status: 409/);
  });
});

describe("rincian dokumen bersifat opsional", () => {
  it("nomor, tanggal, dan jatuh tempo boleh kosong", () => {
    // Wisaya mengumpulkan satu TOTAL per mitra — orang yang mengetik saldo awal
    // jarang punya rincian fakturnya. Impor berkas yang membawa rinciannya.
    expect(opening).toContain("documentNo?: string | null;");
    expect(opening).toContain("documentDate?: Date | null;");
    expect(opening).toContain("dueDate?: Date | null;");
  });

  it("tanpa tanggal, dokumennya bertanggal jurnal pembuka", () => {
    /* Diukur dari blok PEMBUATAN DOKUMEN, bukan dari `for (const r of
       input.receivables)` yang pertama — kalimat itu muncul lebih dulu di
       penyusun BARIS JURNAL, dan mengukur dari sana menguji blok yang salah. */
    const at = opening.indexOf("tx.invoice.create");
    const blok = opening.slice(Math.max(0, at - 400), at + 200);
    expect(blok).toContain("r.documentDate ?? input.company.fiscalYearStart");
  });
});

describe("aset tetap: register DAN jurnalnya (#381 tahap 4)", () => {
  it("harga perolehan didebit, akumulasi dikredit — pencatatan KOTOR", () => {
    /*
     * Menuliskan nilai bukunya saja (perolehan − akumulasi) menghasilkan neraca
     * yang angkanya benar tetapi kehilangan informasi yang justru dicari
     * pembacanya: berapa yang sudah disusutkan.
     */
    expect(opening).toContain("assetByAccount");
    expect(opening).toContain("accumulatedByAccount");
    const blok = opening.slice(opening.indexOf("for (const [accountId, amount] of assetByAccount)"));
    expect(blok.slice(0, 300)).toContain('side: "debit"');
    const kredit = opening.slice(
      opening.indexOf("for (const [accountId, amount] of accumulatedByAccount)")
    );
    expect(kredit.slice(0, 300)).toContain('side: "credit"');
  });

  it("DIGABUNG per akun, bukan satu baris per aset", () => {
    // Perusahaan dengan 400 aset akan punya jurnal pembuka yang mustahil dibaca
    // manusia kalau setiap aset punya barisnya sendiri — alasan yang sama
    // dengan persediaan di #379.
    expect(opening).toContain("new Map<number, number>()");
    expect(opening).toMatch(/assetByAccount\.set\(a\.assetAccountId/);
  });

  it("registernya lahir di transaksi yang SAMA", () => {
    // Register tanpa jurnal = daftar aset terisi, neraca nol. Jurnal tanpa
    // register = neraca terisi, tidak ada yang bisa disusutkan. Keduanya adalah
    // bentuk cacat F-3 di permukaan baru.
    const mulai = opening.indexOf("prisma.$transaction");
    expect(opening.indexOf("tx.fixedAsset.create")).toBeGreaterThan(mulai);
  });

  it("keadaan penyusutannya ikut, riwayatnya TIDAK", () => {
    const blok = opening.slice(opening.indexOf("tx.fixedAsset.create"));
    expect(blok.slice(0, 900)).toContain("accumulatedDepreciation: a.accumulated");
    expect(blok.slice(0, 900)).toContain("lastDepreciationYear");
    expect(opening).not.toContain("fixedAssetDepreciation");
  });
});
