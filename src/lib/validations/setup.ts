/**
 * Setup wizard + Saldo Awal payload validation — issue #20.
 *
 * The division of labour issue #9 set: whatever is knowable from the payload
 * alone is here (currency needs a rate, amounts positive, at least one balance);
 * whatever needs the database (does this account/customer/supplier exist, is the
 * company already set up) is left to `@/lib/opening-balance`, which is
 * authoritative — a Zod check that passes is still re-checked against real rows
 * and the run-once guards.
 */
import { z } from "zod";
import { currencyEnum, rateField, requireRateForForeign } from "./fx";
import { businessModulesPayloadSchema } from "./modules";
import { vmsg } from "@/lib/i18n/validation";

/** One opening cash/bank balance — the user picks a concrete cash_bank account. */
export const openingCashSchema = z
  .object({
    accountId: z.coerce.number().int().positive(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive(vmsg("validation.openingBalancePositive")),
    rate: rateField,
  })
  .superRefine((data, ctx) => requireRateForForeign(data, ctx));

/**
 * One opening receivable/payable.
 *
 * ── Rincian dokumen OPSIONAL (issue #381 tahap 3/4) ────────────────────────
 * Ketiganya boleh kosong, dan itu yang membuat dua jalur masuk hidup
 * berdampingan tanpa dua skema: wisaya mengumpulkan satu TOTAL per mitra, impor
 * berkas membawa nomor & tanggal aslinya. Yang kedua yang membuat umur
 * piutangnya menjadi umur yang SEBENARNYA — tanpa tanggal terbit, setiap
 * dokumen memakai tanggal jurnal pembuka dan seluruh piutang lama tampil di
 * ember umur yang sama pada hari pertama.
 *
 * Karena rinciannya opsional, satu mitra kini boleh muncul BERKALI-KALI —
 * sekali per dokumen. Penjaga "mitra tidak boleh kembar" di bawah karena itu
 * hanya berlaku bagi baris TANPA nomor dokumen.
 */
export const openingPartnerSchema = z
  .object({
    /**
     * `null`/kosong = mitra ini BELUM ADA dan akan dibuat dari `partnerName`
     * bersama saldo awalnya (issue #425).
     *
     * Perusahaan yang pindah dari pembukuan lain tiba di wisaya dengan nol
     * pelanggan dan nol pemasok, dan tidak bisa membuatnya dari sana — gerbang
     * setup memantulkan menu master kembali ke wisaya. Menuntut id di sini
     * berarti menuntut sesuatu yang tidak mungkin ia punya.
     */
    partnerId: z.coerce.number().int().positive().nullish(),
    /** Nama mitra dari berkas impor. Wajib bila `partnerId` kosong. */
    partnerName: z.string().min(1).max(100).trim().optional(),
    currency: currencyEnum.default("IDR"),
    amount: z.coerce.number().positive(vmsg("validation.openingBalancePositive")),
    rate: rateField,
    documentNo: z.string().max(50).trim().optional(),
    /** `YYYY-MM-DD`; kosong → tanggal jurnal pembuka. */
    documentDate: z.string().max(10).trim().optional(),
    dueDate: z.string().max(10).trim().optional(),
  })
  .superRefine((data, ctx) => {
    requireRateForForeign(data, ctx);
    /* Satu dari dua, dan tidak boleh keduanya kosong: baris tanpa id MAUPUN
       nama adalah saldo yang tidak menunjuk siapa pun. */
    if (data.partnerId == null && !data.partnerName) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerId"],
        message: vmsg("validation.openingPartnerRequired"),
      });
    }
  });

/**
 * Satu baris saldo awal PERSEDIAAN, per barang (issue #379).
 *
 * Menggantikan `inventory: number` — satu angka gelondongan yang menerbitkan
 * jurnal TANPA satu pun gerakan stok, sehingga Neraca menunjukkan persediaan
 * sementara laporan stok kosong. Per barang, jalur pembukaan bisa menerbitkan
 * KEDUA sisinya seperti pembelian: jurnalnya dan gerakan stoknya.
 *
 * Kuantitas `Decimal(15,3)` dan harga pokok `Decimal(15,2)` mengikuti
 * docs/DATABASE.md — dan keduanya WAJIB positif: baris nol tidak menambah apa
 * pun ke jurnal maupun ke stok, jadi ia hanya baris yang membingungkan
 * pembacanya. Selalu IDR: harga pokok persediaan adalah nilai base.
 */
export const openingStockSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(vmsg("validation.openingStockPositive")),
  unitCost: z.coerce.number().positive(vmsg("validation.openingStockCostPositive")),
});

/**
 * Satu aset tetap yang dibawa masuk (issue #381 tahap 4).
 *
 * Kategori disebut NAMANYA, bukan id: berkas impor datang dari sistem lain dan
 * tidak tahu id apa pun di sini. Route yang mencocokkannya — dan kategori itu
 * pula yang membawa akun aset/akumulasi/bebannya.
 */
export const openingFixedAssetSchema = z.object({
  assetNo: z.string().min(1).max(50).trim(),
  name: z.string().min(1).max(150).trim(),
  category: z.string().min(1).max(100).trim(),
  acquisitionDate: z.string().min(1),
  cost: z.coerce.number().positive(vmsg("validation.openingBalancePositive")),
  residual: z.coerce.number().min(0).default(0),
  /*
   * ── `.nullish()`, BUKAN `.optional()` (issue #421) ────────────────────────
   *
   * Keempat kolom di bawah datang dari PARSER IMPOR, dan parser itu menuliskan
   * sel kosong sebagai `null` — bukan menghilangkan kuncinya
   * (`lib/import/fixed-assets.ts`: `number | null`, `string | null`). Wisaya
   * meneruskan barisnya apa adanya, jadi `.optional()` — yang hanya menerima
   * kunci yang TIDAK ADA — menolak justru berkas yang menuruti templatnya
   * sendiri: "Opsional — kosong memakai bawaan kategorinya", "Kosong bila belum
   * pernah", "Opsional".
   *
   * Ditolaknya pun di langkah TERAKHIR, sesudah seluruh wisaya diisi. Kelas
   * yang sama dengan #416, di permukaan yang lain.
   *
   * ⚠ Yang paling mahal bukan yang 400. `lastDepreciationYear` dulu
   * `.optional()` tanpa batas bawah: `z.coerce.number()(null)` = 0, dan 0 LOLOS
   * `.int()` — sel kosong diam-diam menjadi "terakhir disusutkan tahun 0",
   * keadaan penyusutan yang tidak pernah dimaksudkan siapa pun dan tidak
   * meninggalkan satu galat pun. Batas `.min(1900)` menutupnya: tahun yang
   * mustahil kini ditolak, bukan disimpan.
   *
   * Sisi pemakainya sudah lama siap menerima null (`api/setup/route.ts`
   * menulis `a.usefulLifeMonths ?? category.defaultUsefulLifeMonths`,
   * `a.lastDepreciationYear ?? null`, `a.location ?? null`) — yang kurang hanya
   * izin lewat di sini.
   */
  /** Kosong → bawaan kategorinya. */
  usefulLifeMonths: z.coerce.number().int().positive().nullish(),
  accumulated: z.coerce.number().min(0).default(0),
  lastDepreciationYear: z.coerce.number().int().min(1900).max(2999).nullish(),
  lastDepreciationMonth: z.coerce.number().int().min(1).max(12).nullish(),
  location: z.string().max(150).trim().nullish(),
});

/**
 * Seller tax identity (issue #17) — the NPWP + tax name/address any e-Faktur
 * output needs. All optional: a legacy setup predates them, and the e-Faktur
 * export surfaces a missing NPWP rather than the wizard forcing it here.
 */
export const companyTaxIdentitySchema = z.object({
  npwp: z.string().max(30).trim().optional(),
  /**
   * PKP — Pengusaha Kena Pajak (issue #368).
   *
   * Menentukan apakah perusahaan ini memungut PPN sama sekali. Bawaannya
   * `true`: perilaku setiap perusahaan yang sudah ada hari ini, jadi wisaya
   * yang dilewati begitu saja tidak mengubah apa pun.
   */
  isPkp: z.coerce.boolean().default(true),
  taxName: z.string().max(150).trim().optional(),
  taxAddress: z.string().max(1000).trim().optional(),
});

export const companyIdentitySchema = z
  .object({
    name: z.string().min(1, vmsg("validation.companyNameRequired")).max(150).trim(),
    address: z.string().max(1000).trim().optional(),
    baseCurrency: currencyEnum.default("IDR"),
    /** Awal tahun buku (YYYY-MM-DD). The opening journal is dated here. */
    fiscalYearStart: z.string().min(1, vmsg("validation.fiscalYearStartRequired")),
  })
  .merge(companyTaxIdentitySchema)
  /**
   * Modul per kategori usaha (issue #99). Bentuknya DIPAKAI ULANG dari skema
   * API modul (`validations/modules.ts`), bukan disalin — wizard dan halaman
   * Pengaturan tidak boleh bisa menyimpang diam-diam (Konvensi Form MASTER.md).
   *
   * Keduanya opsional, dan itu memang intinya: wizard yang melewati langkah ini
   * meninggalkan kolomnya NULL, dan NULL berarti semua modul aktif — aplikasi
   * berperilaku persis seperti sebelum fitur ini ada.
   */
  .merge(businessModulesPayloadSchema.partial());

export type CompanyTaxIdentityInput = z.infer<typeof companyTaxIdentitySchema>;

/**
 * The whole wizard submission. `superRefine` enforces that SOMETHING is being
 * opened — an empty opening journal is meaningless and the poster would refuse
 * it anyway, so we say so at the field level (422 → 400).
 *
 * Sejak issue #416 penjaga itu punya SATU pintu keluar bernama:
 * `noOpeningBalances`. Ia tidak melonggarkan aturannya (payload yang lupa diisi
 * tetap ditolak) — ia memisahkan "lupa mengisi" dari "memang tidak ada", dua
 * keadaan yang dulu dijawab dengan tombol mati yang sama.
 */
export const setupSchema = z
  .object({
    company: companyIdentitySchema,
    cash: z.array(openingCashSchema).max(200).default([]),
    receivables: z.array(openingPartnerSchema).max(1000).default([]),
    payables: z.array(openingPartnerSchema).max(1000).default([]),
    /** Saldo awal persediaan, PER BARANG (issue #379). */
    inventory: z.array(openingStockSchema).max(2000).default([]),
    /** Aset tetap yang dibawa masuk (issue #381 tahap 4). */
    fixedAssets: z.array(openingFixedAssetSchema).max(2000).default([]),
    /**
     * "Mulai tanpa saldo awal" — pengakuan EKSPLISIT bahwa buku ini memang
     * dimulai dari nol (issue #416).
     *
     * Tanpa bendera ini, aturan "minimal satu saldo" mengunci dua keadaan yang
     * sama-sama sah: perusahaan yang benar-benar baru, dan perusahaan yang
     * seluruh modul bersaldonya dimatikan (`cash_bank` bukan modul inti, jadi
     * langkah Saldo Awal bisa sah-sah saja tidak menampilkan satu isian pun).
     * Keduanya berakhir di wisaya yang tidak bisa diselesaikan — dan karena
     * gerbang setup memantulkan halaman lain ke sana, di aplikasi yang tidak
     * bisa dibuka sama sekali.
     *
     * Ia bendera, bukan pelonggaran diam-diam: payload yang lupa mengisi saldan
     * tetap ditolak persis seperti dulu. Yang berubah hanya adanya kalimat yang
     * bisa dipilih orangnya.
     */
    noOpeningBalances: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasAny =
      data.cash.length > 0 ||
      data.receivables.length > 0 ||
      data.payables.length > 0 ||
      data.inventory.length > 0 ||
      data.fixedAssets.length > 0;
    if (!hasAny && !data.noOpeningBalances) {
      ctx.addIssue({
        code: "custom",
        path: ["cash"],
        message: vmsg("validation.atLeastOneOpeningBalance"),
      });
    }

    /* Satu barang hanya boleh punya SATU baris saldo awal. Dua baris untuk
       barang yang sama akan menerbitkan dua gerakan stok pembuka dengan harga
       pokok berbeda — dan rata-rata tertimbangnya menjadi angka yang tidak
       pernah dimaksudkan siapa pun. */
    const seenItems = new Set<number>();
    data.inventory.forEach((row, index) => {
      if (seenItems.has(row.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["inventory", index, "itemId"],
          message: vmsg("validation.openingStockDuplicateItem"),
        });
      }
      seenItems.add(row.itemId);
    });

    // No partner may appear twice on the same side — one opening balance per
    // customer / per supplier keeps the memo sub-ledger unambiguous.
    /*
     * ⚠ Penjaga ini kini hanya berlaku bagi baris TANPA nomor dokumen
     * (issue #381 tahap 4). Sebelumnya "satu saldo awal per mitra" benar tanpa
     * kecuali: setiap mitra menghasilkan satu baris jurnal ke akun kontrol, dan
     * dua baris untuk mitra yang sama akan menjadi dua memo yang tak
     * terbedakan.
     *
     * Sejak saldo awal AR/AP lahir sebagai DOKUMEN, seorang pelanggan dengan
     * dua belas faktur terbuka memang MENGHASILKAN dua belas baris — dan itu
     * justru yang dimaksud: dua belas dokumen yang bisa dilunasi satu per satu.
     * Yang membedakannya nomor dokumennya, dan kekembarannya dijaga di sana
     * (`invoices.invoice_no` UNIK, plus penjaga kembar di parser impor).
     *
     * Baris tanpa nomor tetap dijaga seperti dulu: ia jalur WISAYA, satu total
     * per mitra, dan dua di antaranya tetap tak terbedakan.
     */
    for (const side of ["receivables", "payables"] as const) {
      /* Kunci kekembaran: id bila mitranya sudah terdaftar, NAMA bila ia baru
         (issue #425). Tanpa cabang kedua, dua baris untuk pelanggan baru yang
         sama akan lolos — lalu melahirkan satu master dengan dua saldo awal
         tanpa nomor dokumen, persis yang penjaga ini cegah untuk mitra lama. */
      const seen = new Set<string>();
      data[side].forEach((row, i) => {
        if (row.documentNo) return;
        /* Tanpa template literal: `tests/i18n-validation` menganggap SETIAP
           literal berspasi di berkas skema sebagai kalimat yang lupa
           dikamuskan, dan ekspresi di dalam backtick ikut terbaca begitu. */
        const name = (row.partnerName ?? "").trim().toLowerCase();
        const key = row.partnerId != null ? "#" + row.partnerId : "@" + name;
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [side, i, "partnerId"],
            message: vmsg("validation.partnerTwice"),
          });
        }
        seen.add(key);
      });
    }
  });

export type SetupInput = z.infer<typeof setupSchema>;
