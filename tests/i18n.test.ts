/**
 * Fondasi multibahasa (id/en/zh) — penjaga janji-janjinya.
 *
 * Aplikasi ini akan disapu halaman demi halaman ke kamus (fase 2, ~1600 teks).
 * Penyapuan sebesar itu hanya aman kalau tiga hal DIJAMIN, dan ketiganya
 * dijaga di sini:
 *
 *  1. **Ketiga kamus punya kunci yang PERSIS SAMA.** Kunci yang hilang di satu
 *     bahasa tidak akan pernah kelihatan saat menyapu (siapa yang membuka
 *     aplikasi dalam bahasa Mandarin setiap kali menambah satu teks?) — ia baru
 *     muncul sebagai kunci mentah di layar pengguna. `tsc` sudah menolak kunci
 *     yang HILANG lewat tipe `Dictionary` di `lib/i18n/server.ts`; yang tak
 *     terlihat olehnya adalah kunci BERLEBIH (sisa terjemahan yang kuncinya
 *     sudah dihapus dari sumber), dan itu tugas tes ini.
 *
 *  2. **Tidak ada nilai kosong, dan tidak ada terjemahan yang "lupa
 *     diterjemahkan".** Menyalin `en.json` dari `id.json` lalu lupa mengisinya
 *     adalah kegagalan paling umum di proyek multibahasa — hasilnya bukan galat,
 *     melainkan UI Inggris berbahasa Indonesia yang lolos review.
 *
 *  3. **Bahasa sumber tidak menyimpang dari kode.** Label menu, Aksi Cepat, dan
 *     peta enum di `lib/constants.ts` hidup di DUA tempat (nilai literal untuk
 *     modul murni + kamus untuk tampilan). Tes ini yang menahannya tetap satu
 *     kata.
 *
 * Ditambah perilaku runtime-nya: penyempitan `isLocale`, negosiasi
 * `Accept-Language` (termasuk header rusak), pencarian jalur-titik,
 * interpolasi `{placeholder}`, dan cadangan saat kunci tidak ada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  isLocale,
  negotiateLocale,
  type Locale,
} from "@/lib/i18n/config";
import { translate, type Dictionary } from "@/lib/i18n/dictionary";
import {
  accountTypeLabels,
  approvalDecisionMessage,
  approvalDocumentTypeLabels,
  approvalStatusLabels,
  cashTypeLabels,
  contractStatusLabels,
  documentTypeLabels,
  permissionLabels,
  permissionResourceLabels,
  roleLabels,
  statusFilterLabels,
} from "@/lib/i18n/labels";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import {
  CASH_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_FILTER_LABELS,
} from "@/lib/constants";
import {
  APPROVAL_DOCUMENT_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  decisionMessage,
} from "@/lib/approvals";
import { PERMISSION_LABELS, RESOURCE_LABELS } from "@/lib/authz-labels";
import { NAV_GROUPS, NAV_HOME } from "@/lib/nav";
import { QUICK_ACTIONS } from "@/lib/quick-actions";
import { WORKFLOWS } from "@/lib/workflows";
import { PURCHASE_STEPS, SALES_STEPS } from "@/lib/wizard";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

const DICTIONARIES: Record<Locale, Dictionary> = { id, en, zh };

/** Bahasa terjemahan — bahasa sumber (`id`) dibandingkan TERHADAP mereka. */
const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/**
 * Kunci yang nilainya memang SAH sama dengan bahasa Indonesia. Bukan
 * kelalaian menerjemahkan — istilah dagang & singkatan resmi yang justru
 * salah bila "diterjemahkan".
 */
const SAME_AS_SOURCE_ALLOWED: Partial<Record<Locale, ReadonlySet<string>>> = {
  en: new Set([
    // Istilah dagang internasional; "Bill of Lading" memang dipakai apa adanya
    // di dokumen ekspor berbahasa Indonesia.
    "documentType.bl",
    // Nama jenis kas; kata yang sama di kedua bahasa.
    "cashType.bank",
    // Lencana sakelar Mode Akuntan. "ON"/"OFF" adalah konvensi antarmuka yang
    // dipakai apa adanya dalam bahasa Indonesia maupun Inggris (bahasa Mandarin
    // memakai 开/关).
    "accountantMode.on",
    "accountantMode.off",
    // Kata serapan yang ejaannya IDENTIK di kedua bahasa — "menerjemahkan"-nya
    // hanya akan menghasilkan kata yang sama.
    "common.status",
    "common.total",
    // Istilah pembukuan berpasangan: "Debit" ditulis sama di kedua bahasa
    // (pasangannya "Kredit"/"Credit" memang berbeda). Bahasa Mandarin memakai
    // 借方/贷方.
    "common.debit",
    "contracts.advStatus",
    "invoices.totalCurrency",
    "deliveryOrders.colTotalKg",
    "returns.colTotalIdr",
    "journal.colTotalIdr",
    // "Total {section}" — pola yang sama di kedua bahasa; hanya bahasa Mandarin
    // membalik urutannya ({section}合计).
    "reports.sectionTotal",
    // "Total Debit" — dua kata serapan berurutan; pasangannya "Total Kredit"/
    // "Total Credit" memang berbeda.
    "periods.totalDebit",
    // "Debit (IDR)" — kata serapan + kode mata uang; hanya bahasa Mandarin yang
    // berbeda (借方（IDR）).
    "journal.colDebitIdr",
    // Ekor kalimat setelah tautan nomor jurnal. Dalam bahasa Indonesia maupun
    // Inggris kalimatnya berakhir tepat di tautan, jadi yang tersisa hanya titik;
    // bahasa Mandarin masih perlu kata kerjanya di belakang (…冲销。).
    "journal.reversedByAfter",
    "journal.reversalOfAfter",
    // Istilah dagang karung: "bags" dan "kg/bag" dipakai apa adanya di dokumen
    // ekspor berbahasa Indonesia maupun Inggris (bahasa Mandarin memakai 袋).
    "common.bags",
    "common.kgPerBag",
    "sales.shipKgPerBag",
    "deliveryOrders.totalBags",
    // Judul kolom di /payables dan label pilihan di form uang muka. Teks bahasa
    // Indonesianya memang "Supplier" (bukan "Pemasok") dan kata itu identik
    // dalam bahasa Inggris.
    "payables.colSupplier",
    "advances.partySupplier",
    // Kata benda mitra pada kalimat kompensasi uang muka ke transaksi
    // pembelian — teks Indonesianya memang "supplier", identik dengan Inggris.
    "advances.compPartySupplier",
    // Nama bulan yang ejaannya sama dalam bahasa Indonesia & Inggris (bahasa
    // Mandarin memakai 4月/9月/11月).
    "month.m4",
    "month.m9",
    "month.m11",
    // Pola "bulan tahun": sama di kedua bahasa Latin, dibalik di bahasa Mandarin
    // ({year}年{month}).
    "common.monthOfYear",
    // "Target" adalah kata serapan yang ejaannya identik; label & judul kolom
    // Target Penjualan memakainya apa adanya.
    "budget.targetAmountField",
    "budget.colTarget",
    // "Bank (IDR)" — nama jenis kas + kode mata uang, identik di kedua bahasa
    // (bandingkan `cashType.bank` yang sudah terdaftar di atas).
    "reconciliation.accountBank",
    // "Draft" adalah kata serapan yang dipakai apa adanya di kedua bahasa;
    // bahasa Mandarin memakai 草稿.
    "reconciliation.statusDraft",
    // Ampersand penyambung dua nama kolom CSV (debit & credit).
    "reconciliation.csvHintAnd",
    // Kurung tutup + titik setelah dua contoh nama akun yang dicetak miring —
    // sama di kedua bahasa Latin, penuh-lebar di bahasa Mandarin (）。).
    "finance.exampleTail",
    // Tanda titik penutup kalimat yang terpotong oleh penekanan <strong> —
    // sama di kedua bahasa Latin, berbeda di bahasa Mandarin (。).
    "common.fullStop",
    // Ekor kalimat "sebelumnya ditolak": hanya titik dua + tanda kutip yang
    // mengapit catatan penolakan. Tidak ada satu kata pun di dalamnya; bahasa
    // Mandarin memakai tanda baca penuh-lebar (：“…”).
    "approvals.resubmittedNote",
    // Nama mata uang yang ditekankan <strong> pada penjelasan Aturan
    // Persetujuan. "rupiah" ditulis sama dalam bahasa Indonesia maupun Inggris;
    // bahasa Mandarin memakai 印尼盾.
    "approvals.rulesDescStrong1",
    // Judul kolom alamat IP di catatan audit — singkatan teknis yang sama di
    // ketiga bahasa.
    "audit.colIp",
    // Isian Email pada langkah mitra wizard: kata yang sama dalam bahasa
    // Indonesia maupun Inggris (bahasa Mandarin memakai 电子邮箱).
    "wizard.partner.emailField",
    // Judul kartu total di ringkasan umur piutang/utang. Frasa Inggris
    // "Total Outstanding" memang dipakai apa adanya pada layar berbahasa
    // Indonesia (bahasa Mandarin memakai 未结清合计).
    "aging.totalOutstanding",
    // Nama isian unggah dokumen: kata "File" identik di kedua bahasa Latin
    // (bahasa Mandarin memakai 文件).
    "documents.fileField",
    // Label aksesibilitas sel matriks izin: "{peran}: {izin}" — hanya dua
    // penampung dan sebuah titik dua, jadi tidak ada yang bisa diterjemahkan
    // (bahasa Mandarin memakai titik dua penuh-lebar).
    "permissions.cellAria",
  ]),
};

/** Semua pasangan [jalur-titik, teks] dari sebuah kamus. */
function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key)
  );
}

function keysOf(dictionary: Dictionary): string[] {
  return flatten(dictionary).map(([key]) => key);
}

const SOURCE_ENTRIES = flatten(id);
const SOURCE_KEYS = keysOf(id);

describe("kamus: ketiga bahasa berkunci identik", () => {
  it("kamus sumber (id) tidak kosong dan berkunci jalur-titik yang wajar", () => {
    expect(SOURCE_KEYS.length).toBeGreaterThan(100);
    for (const key of SOURCE_KEYS) {
      expect(key, `kunci aneh: ${key}`).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/);
    }
  });

  for (const locale of TRANSLATED_LOCALES) {
    it(`"${locale}" tidak kehilangan satu kunci pun dari kamus sumber`, () => {
      const present = new Set(keysOf(DICTIONARIES[locale]));
      const missing = SOURCE_KEYS.filter((key) => !present.has(key));
      expect(
        missing,
        `Kunci berikut ada di id.json tetapi TIDAK di ${locale}.json — ` +
          "tambahkan terjemahannya (bukan salinan bahasa Indonesia)."
      ).toEqual([]);
    });

    it(`"${locale}" tidak punya kunci berlebih di luar kamus sumber`, () => {
      const source = new Set(SOURCE_KEYS);
      const extra = keysOf(DICTIONARIES[locale]).filter((key) => !source.has(key));
      expect(
        extra,
        `Kunci berikut ada di ${locale}.json tetapi TIDAK di id.json — ` +
          "sisa terjemahan lama, atau kuncinya salah ketik. Bahasa Indonesia adalah sumbernya."
      ).toEqual([]);
    });
  }

  it("urutan kunci sama persis di ketiga kamus (memudahkan diff penerjemah)", () => {
    for (const locale of TRANSLATED_LOCALES) {
      expect(keysOf(DICTIONARIES[locale]), `urutan kunci ${locale}.json`).toEqual(SOURCE_KEYS);
    }
  });
});

describe("kamus: isi terjemahan", () => {
  for (const locale of LOCALES) {
    it(`"${locale}" tidak punya nilai kosong atau berspasi tepi`, () => {
      const offenders = flatten(DICTIONARIES[locale])
        .filter(([, text]) => text.trim().length === 0 || text !== text.trim())
        .map(([key]) => key);
      expect(offenders, `nilai kosong / berspasi tepi di ${locale}.json`).toEqual([]);
    });

    it(`"${locale}" memakai placeholder yang sama dengan bahasa sumber`, () => {
      // `{name}` yang hilang di terjemahan = nama pengguna hilang dari layar.
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
      const translated = new Map(flatten(DICTIONARIES[locale]));
      const offenders = SOURCE_ENTRIES.filter(
        ([key, sourceText]) =>
          JSON.stringify(placeholders(sourceText)) !==
          JSON.stringify(placeholders(translated.get(key) ?? ""))
      ).map(([key]) => key);
      expect(offenders, `placeholder tidak cocok di ${locale}.json`).toEqual([]);
    });
  }

  for (const locale of TRANSLATED_LOCALES) {
    it(`"${locale}" benar-benar diterjemahkan (tidak menyalin bahasa Indonesia)`, () => {
      const allowed = SAME_AS_SOURCE_ALLOWED[locale] ?? new Set<string>();
      const translated = new Map(flatten(DICTIONARIES[locale]));
      const untouched = SOURCE_ENTRIES.filter(
        ([key, sourceText]) => !allowed.has(key) && translated.get(key) === sourceText
      ).map(([key]) => key);
      expect(
        untouched,
        `Nilai berikut di ${locale}.json masih persis sama dengan id.json. ` +
          "Terjemahkan, atau — bila memang istilah yang sama di kedua bahasa — " +
          "daftarkan di SAME_AS_SOURCE_ALLOWED beserta alasannya."
      ).toEqual([]);
    });
  }

  it("bahasa Mandarin memang beraksara Han (bukan sisa bahasa Inggris)", () => {
    const han = /\p{Script=Han}/u;
    // Sebagian nilai memang sah tanpa aksara Han (nama produk, "e-Faktur"),
    // jadi yang dijaga adalah proporsinya, bukan setiap baris.
    const values = flatten(zh).map(([, text]) => text);
    const withHan = values.filter((text) => han.test(text)).length;
    expect(withHan / values.length).toBeGreaterThan(0.9);
  });
});

describe("kamus: bahasa sumber tidak menyimpang dari kode", () => {
  it("label menu sama persis dengan nilai kamus `id`", () => {
    const items = [NAV_HOME, ...NAV_GROUPS.flatMap((g) => g.items)];
    for (const item of items) {
      expect(translate(id, item.labelKey), `${item.href} (${item.labelKey})`).toBe(item.label);
    }
    for (const group of NAV_GROUPS) {
      expect(translate(id, group.labelKey), `grup ${group.id}`).toBe(group.label);
    }
  });

  it("label & penjelasan Aksi Cepat sama persis dengan nilai kamus `id`", () => {
    for (const action of QUICK_ACTIONS) {
      expect(translate(id, action.labelKey), action.key).toBe(action.label);
      expect(translate(id, action.descriptionKey), action.key).toBe(action.description);
    }
  });

  it("label & penjelasan Alur Kerja sama persis dengan nilai kamus `id`", () => {
    for (const workflow of WORKFLOWS) {
      expect(translate(id, workflow.labelKey), workflow.id).toBe(workflow.label);
      expect(translate(id, workflow.descriptionKey), workflow.id).toBe(workflow.description);
      for (const step of workflow.steps) {
        expect(translate(id, step.labelKey), `${workflow.id} / ${step.href}`).toBe(step.label);
        expect(translate(id, step.descriptionKey), `${workflow.id} / ${step.href}`).toBe(
          step.description
        );
      }
    }
  });

  it("judul & penjelasan langkah wizard sama persis dengan nilai kamus `id`", () => {
    for (const steps of [SALES_STEPS, PURCHASE_STEPS]) {
      for (const step of steps) {
        expect(translate(id, step.titleKey), step.id).toBe(step.title);
        expect(translate(id, step.descriptionKey), step.id).toBe(step.description);
      }
    }
  });

  it("peta label enum di constants.ts sama persis dengan kamus `id`", () => {
    expect(roleLabels(id)).toEqual(ROLE_LABELS);
    expect(contractStatusLabels(id)).toEqual(CONTRACT_STATUS_LABELS);
    expect(statusFilterLabels(id)).toEqual(STATUS_FILTER_LABELS);
    expect(documentTypeLabels(id)).toEqual(DOCUMENT_TYPE_LABELS);
    expect(cashTypeLabels(id)).toEqual(CASH_TYPE_LABELS);
    // Tipe akun sumbernya `ACCOUNT_TYPES` (lib/accounting.ts), bukan constants.ts.
    expect(accountTypeLabels(id)).toEqual(
      Object.fromEntries(ACCOUNT_TYPES.map((type) => [type.value, type.label]))
    );
    // Peta persetujuan sumbernya `lib/approvals.ts` (modul murni).
    expect(approvalDocumentTypeLabels(id)).toEqual(APPROVAL_DOCUMENT_TYPE_LABELS);
    expect(approvalStatusLabels(id)).toEqual(APPROVAL_STATUS_LABELS);
    // Label matriks izin sumbernya `lib/authz-labels.ts` (modul murni juga).
    expect(permissionResourceLabels(id)).toEqual(RESOURCE_LABELS);
    expect(permissionLabels(id)).toEqual(PERMISSION_LABELS);
  });

  it("kalimat keadaan pengajuan `id` sama persis dengan decisionMessage()", () => {
    for (const status of ["approved", "rejected", "pending_approval", "draft"]) {
      for (const request of [
        { status, documentType: "invoice", documentNo: "SI.1" },
        { status, documentType: "payment", documentNo: null },
        // Jenis dokumen tak dikenal jatuh ke nilainya sendiri di kedua jalur.
        { status, documentType: "surat_jalan", documentNo: "SJ-9" },
      ]) {
        expect(approvalDecisionMessage(id, request), `${status} ${request.documentType}`).toBe(
          decisionMessage(request)
        );
      }
    }
  });

  it("tanpa kamus, peta label jatuh ke bahasa Indonesia — bukan nilai mentah DB", () => {
    expect(contractStatusLabels(null)).toEqual(CONTRACT_STATUS_LABELS);
    expect(documentTypeLabels(undefined).bl).toBe(DOCUMENT_TYPE_LABELS.bl);
    expect(cashTypeLabels(null).kas_kecil).toBe(CASH_TYPE_LABELS.kas_kecil);
    expect(roleLabels(null).bos).toBe(ROLE_LABELS.bos);
    expect(accountTypeLabels(null).cash_bank).toBe(ACCOUNT_TYPES[0].label);
  });

  it("peta label enum lengkap di KETIGA bahasa (jaminan issue #68 dikali tiga)", () => {
    for (const locale of LOCALES) {
      const dictionary = DICTIONARIES[locale];
      for (const [name, labels] of [
        ["contractStatus", contractStatusLabels(dictionary)],
        ["documentType", documentTypeLabels(dictionary)],
        ["cashType", cashTypeLabels(dictionary)],
        ["role", roleLabels(dictionary)],
        ["accountType", accountTypeLabels(dictionary)],
        ["approvalDocumentType", approvalDocumentTypeLabels(dictionary)],
        ["approvalStatus", approvalStatusLabels(dictionary)],
        ["permissionResource", permissionResourceLabels(dictionary)],
        ["permission", permissionLabels(dictionary)],
      ] as const) {
        for (const [key, label] of Object.entries(labels)) {
          expect(label?.trim().length, `${locale}: ${name}.${key} kosong`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("label kelompok menu tak pernah kembar dengan label itemnya, di bahasa mana pun", () => {
    // Penjaga yang sama dengan tests/quick-actions.test.ts, tetapi untuk
    // terjemahan: "Laporan" berisi "Laporan" membingungkan dalam bahasa apa pun.
    for (const locale of LOCALES) {
      const dictionary = DICTIONARIES[locale];
      for (const group of NAV_GROUPS) {
        const groupLabel = translate(dictionary, group.labelKey);
        for (const item of group.items) {
          expect(
            translate(dictionary, item.labelKey),
            `${locale}: ${group.id} / ${item.href}`
          ).not.toBe(groupLabel);
        }
      }
    }
  });
});

describe("isLocale", () => {
  it("menerima ketiga bahasa yang didukung", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  it("menolak apa pun di luar daftar, tanpa melempar", () => {
    for (const value of ["ID", "en-US", "jv", "", " id", null, undefined, 7, {}, ["id"]]) {
      expect(isLocale(value), String(value)).toBe(false);
    }
  });

  it("bahasa bawaan adalah bahasa yang didukung", () => {
    expect(isLocale(DEFAULT_LOCALE)).toBe(true);
    expect(DEFAULT_LOCALE).toBe("id");
  });

  it("setiap bahasa punya nama dalam bahasanya sendiri", () => {
    expect(Object.keys(LOCALE_LABELS).sort()).toEqual([...LOCALES].sort());
    expect(LOCALE_LABELS.id).toBe("Bahasa Indonesia");
    expect(LOCALE_LABELS.en).toBe("English");
    expect(LOCALE_LABELS.zh).toBe("中文");
  });
});

describe("negotiateLocale", () => {
  it("mengambil bahasa yang cocok persis", () => {
    expect(negotiateLocale("en")).toBe("en");
    expect(negotiateLocale("zh")).toBe("zh");
    expect(negotiateLocale("id")).toBe("id");
  });

  it("mencocokkan subtag utama dari tag berwilayah", () => {
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("zh-Hans-CN")).toBe("zh");
    expect(negotiateLocale("id-ID")).toBe("id");
    // Mandarin Tradisional ikut ke Mandarin Sederhana — satu-satunya yang ada,
    // dan jauh lebih baik daripada jatuh ke bahasa Indonesia.
    expect(negotiateLocale("zh-TW")).toBe("zh");
  });

  it("menghormati bobot q, bukan urutan penulisan", () => {
    expect(negotiateLocale("en;q=0.3,zh;q=0.9")).toBe("zh");
    expect(negotiateLocale("zh;q=0.2,en;q=0.8,id;q=0.1")).toBe("en");
  });

  it("q sama → yang tertulis lebih dulu yang menang", () => {
    expect(negotiateLocale("en;q=0.5,zh;q=0.5")).toBe("en");
  });

  it("melewati bahasa yang tidak didukung", () => {
    expect(negotiateLocale("fr-FR,de;q=0.8,zh;q=0.5")).toBe("zh");
  });

  it("q=0 berarti 'tidak diterima' dan dibuang", () => {
    expect(negotiateLocale("en;q=0,zh;q=0.4")).toBe("zh");
    // Semua ditolak → bahasa bawaan.
    expect(negotiateLocale("en;q=0,zh;q=0")).toBe(DEFAULT_LOCALE);
  });

  it("'*' berarti apa saja → bahasa bawaan", () => {
    expect(negotiateLocale("*")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("fr,*;q=0.5")).toBe(DEFAULT_LOCALE);
  });

  it("header kosong, hilang, atau rusak → bahasa bawaan, tanpa melempar", () => {
    for (const header of [
      null,
      undefined,
      "",
      "   ",
      ",,,",
      ";q=0.5",
      "!!!",
      "en;q=abc",
      "en;q=9",
      "en;;q=",
      " ",
    ]) {
      expect(() => negotiateLocale(header)).not.toThrow();
    }
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(",,,")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("!!!")).toBe(DEFAULT_LOCALE);
    // q rusak (di luar 0..1) membuang entrinya, bukan seluruh header.
    expect(negotiateLocale("en;q=9,zh;q=0.4")).toBe("zh");
    // q yang tak terbaca sama sekali diperlakukan sebagai q=1 (bawaan RFC).
    expect(negotiateLocale("en;q=abc")).toBe("en");
  });

  it("tahan terhadap spasi dan huruf besar", () => {
    expect(negotiateLocale("  EN-US ; q=0.9 ,  ZH ; q=1.0 ")).toBe("zh");
  });
});

describe("translate: jalur-titik, interpolasi, dan cadangan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Kunci hilang HARUS berisik saat pengembangan. Tesnya sekaligus membungkam
   * `console.error` supaya keluaran suite tetap bersih — kalau tidak, perilaku
   * yang benar justru terlihat seperti tes yang rusak.
   */
  function silenceMissingKey() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("mengambil teks lewat jalur bertitik", () => {
    expect(translate(id, "common.save")).toBe("Simpan");
    expect(translate(en, "common.save")).toBe("Save");
    expect(translate(zh, "common.save")).toBe("保存");
    expect(translate(id, "status.contract.signed")).toBe("Sah");
  });

  it("mengganti {placeholder} dengan nilainya", () => {
    expect(translate(id, "table.page", { page: 2, pages: 7 })).toBe("Halaman 2 dari 7");
    expect(translate(en, "table.page", { page: 2, pages: 7 })).toBe("Page 2 of 7");
    expect(
      translate(id, "userMenu.trigger", { name: "Budi", role: "Pimpinan" })
    ).toBe("Akun: Budi (Pimpinan)");
  });

  it("placeholder tanpa nilai dibiarkan apa adanya (bocor terlihat, bukan lubang senyap)", () => {
    expect(translate(id, "table.page", { page: 3 })).toBe("Halaman 3 dari {pages}");
    expect(translate(id, "table.page")).toBe("Halaman {page} dari {pages}");
  });

  it("nilai 0 dan string kosong tetap disisipkan", () => {
    expect(translate(id, "table.page", { page: 0, pages: "" })).toBe("Halaman 0 dari ");
  });

  it("kunci yang tidak ada dikembalikan apa adanya, tanpa melempar", () => {
    const spy = silenceMissingKey();
    expect(translate(id, "tidak.ada.kunci.ini")).toBe("tidak.ada.kunci.ini");
    // Simpul di tengah pohon bukan teks — diperlakukan sebagai tidak ada.
    expect(translate(id, "common")).toBe("common");
    expect(translate(id, "")).toBe("");
    expect(() => translate(id, "nav.items.dashboard.terlalu.dalam")).not.toThrow();
    // Berisik saat pengembangan: setiap kunci hilang meninggalkan jejak.
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toContain("tidak.ada.kunci.ini");
  });

  it("kamus kosong (mis. di luar LocaleProvider) tidak menjatuhkan apa pun", () => {
    silenceMissingKey();
    expect(translate(null, "common.save")).toBe("common.save");
    expect(translate(undefined, "common.save")).toBe("common.save");
  });

  it("tidak bisa menembus prototipe objek", () => {
    silenceMissingKey();
    // "constructor"/"__proto__" ada di setiap objek JS; keduanya bukan teks,
    // jadi harus jatuh ke cadangan — bukan mengembalikan fungsi.
    expect(translate(id, "constructor")).toBe("constructor");
    expect(translate(id, "__proto__.toString")).toBe("__proto__.toString");
  });
});
