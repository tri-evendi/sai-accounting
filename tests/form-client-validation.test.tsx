/**
 * Isian wajib yang kosong ditolak DI CLIENT (issue #216) — penjaga regresinya.
 *
 * ── Regresi yang dijaga ────────────────────────────────────────────────────
 * Sampai #188 isian pilihan adalah `<select required>`: peramban memblokir
 * submit dan memunculkan gelembung "pilih barang" seketika, tanpa satu paket
 * jaringan pun. `Select` AntD bukan kontrol native — `required` di sana tidak
 * divalidasi siapa pun — dan tujuh formulir yang memakainya TIDAK punya
 * `zodResolver` sebagai gantinya. Akibatnya formulir kosong terkirim, pengguna
 * menunggu satu perjalanan bolak-balik, lalu membaca galat dari server.
 *
 * Berkas ini karena itu menguji hal yang berbeda dari "skemanya ada": ia
 * menjalankan MESIN VALIDASI CLIENT yang sesungguhnya — `useForm` +
 * `zodResolver(skema)` + `handleSubmit` — dengan nilai sebuah formulir yang
 * belum disentuh, lalu menuntut dua hal:
 *
 *   1. penangan submit TIDAK PERNAH dipanggil (tidak ada permintaan yang
 *      berangkat), dan
 *   2. galatnya menunjuk ISIAN yang harus diisi, dengan kalimat berbahasa
 *      pengguna — bukan kunci mentah dan bukan prosa bawaan zod.
 *
 * Kalau suatu saat seseorang mencabut `zodResolver` dari salah satu formulir
 * itu, atau melonggarkan skemanya sehingga `""` lolos sebagai `0`, tes di sini
 * gagal — bukan pengguna yang menemukannya.
 *
 * ── Kenapa nilainya ditulis ulang di sini, bukan diimpor dari formulirnya ──
 * `defaultValues` tiap formulir bergantung pada propnya (tahun berjalan,
 * kategori pertama, mitra yang sudah dikunci layar pemanggil), jadi tidak ada
 * satu objek pun yang bisa diimpor. Yang mengikat tes ini ke berkas formulir
 * yang sebenarnya adalah bagian terakhir: penjaga sumber yang menuntut
 * ketujuhnya memakai `zodResolver` dengan skema BERSAMA yang sama seperti route
 * handler-nya, dan tidak lagi memakai `required` pada kontrol yang tak
 * memvalidasinya.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm, type DefaultValues, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { NativeSelect } from "@/components/ui/select";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import { translateMessage } from "@/lib/i18n/validation";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

import { advancePaymentSchema } from "@/lib/validations/advance";
import { budgetSchema, salesTargetSchema } from "@/lib/validations/budget";
import { cashTransactionSchema } from "@/lib/validations/finance";
import {
  fixedAssetCategorySchema,
  fixedAssetSchema,
} from "@/lib/validations/fixed-asset";
import { stockUpdateSchema } from "@/lib/validations/inventory";

/* ------------------------------------------------------------------ */
/* Mesin: satu submit sungguhan, tanpa DOM                             */
/* ------------------------------------------------------------------ */

/**
 * Jalankan submit formulir seperti yang dijalankan peramban: `useForm` dengan
 * `zodResolver` skema yang bersangkutan, lalu `handleSubmit`.
 *
 * Suite ini berjalan di environment `node`, jadi komponennya dirender sekali
 * dengan `renderToStaticMarkup` semata-mata untuk MENJALANKAN hook-nya; objek
 * form ditangkap saat render, dan submit-nya dipanggil sesudahnya. Yang diuji
 * adalah jalur yang sama persis dengan yang ditempuh di peramban: resolver
 * menilai nilai, dan `handleSubmit` memutuskan apakah penangannya dipanggil.
 */
function Probe<TValues extends FieldValues>({
  schema,
  values,
  onReady,
}: {
  schema: z.ZodType;
  values: TValues;
  onReady: (form: ReturnType<typeof useForm<TValues>>) => void;
}) {
  const form = useForm<TValues>({
    // Skemanya diketik longgar di sini (tujuh bentuk berbeda lewat satu
    // fungsi); yang penting justru RUNTIME-nya: resolver yang dijalankan adalah
    // skema bersama itu sendiri, apa adanya.
    resolver: zodResolver(schema as never) as unknown as Resolver<TValues>,
    defaultValues: values as DefaultValues<TValues>,
  });
  onReady(form);
  return null;
}

async function submitForm<TValues extends FieldValues>(
  schema: z.ZodType,
  values: TValues
): Promise<{ accepted: boolean; errors: Record<string, string>; parsed: unknown }> {
  let captured: ReturnType<typeof useForm<TValues>> | null = null;
  const keep = (form: ReturnType<typeof useForm<TValues>>) => {
    captured = form;
  };

  renderToStaticMarkup(<Probe schema={schema} values={values} onReady={keep} />);
  const form = captured as unknown as ReturnType<typeof useForm<TValues>>;
  expect(form, "form belum terbentuk").not.toBeNull();

  let parsed: unknown = null;
  const onValid = vi.fn((data: unknown) => {
    parsed = data;
  });
  /*
   * Galat dibaca dari penangan KEDUA `handleSubmit`, bukan dari
   * `form.formState`: tanpa akar React yang merender ulang, snapshot formState
   * yang ditangkap saat render tidak pernah diperbarui. `onInvalid` menerima
   * objek galat yang sama — dan ia memang API yang dipakai formulir kas untuk
   * membuka bagian yang menyembunyikan isian bermasalah.
   */
  const onInvalid = vi.fn();
  await form.handleSubmit(onValid, onInvalid)();

  const raised = (onInvalid.mock.calls[0]?.[0] ?? {}) as Record<string, { message?: string }>;
  const errors: Record<string, string> = {};
  for (const [name, error] of Object.entries(raised)) {
    if (typeof error?.message === "string") errors[name] = error.message;
  }

  return { accepted: onValid.mock.calls.length > 0, errors, parsed };
}

/** Kalimat berbahasa Indonesia untuk sebuah pesan galat field. */
const sentence = (message: string) => translateMessage(id, message);

/**
 * Kalimat, bukan kunci mentah dan bukan prosa bawaan zod. Keduanya adalah cara
 * paling umum sebuah pesan "ada" tetapi tak bisa dibaca pengguna.
 */
function expectHumanSentence(message: string, label: string) {
  const text = sentence(message);
  expect(text, label).not.toMatch(/^validation\./);
  expect(text, label).not.toMatch(/^(Invalid|Too small|Too big|Expected)/);
  expect(text.length, label).toBeGreaterThan(5);
}

/* ------------------------------------------------------------------ */
/* 1. Tujuh formulir: submit kosong ditolak, dan menunjuk isiannya     */
/* ------------------------------------------------------------------ */

const today = "2026-08-07";

/**
 * Nilai sebuah formulir yang BELUM DISENTUH — persis bentuk yang dibawa kontrol
 * HTML: string kosong untuk pilihan yang belum dijatuhkan, `undefined` untuk
 * isian yang memang tidak dirender (kurs saat mata uangnya rupiah).
 */
const UNTOUCHED = {
  advance: {
    type: "sales" as const,
    date: today,
    customerId: "",
    supplierId: "",
    contractId: "",
    amount: "",
    currency: "IDR",
    rate: undefined,
    note: "",
  },
  budget: { accountId: "", year: "2026", month: "8", amount: "" },
  salesTarget: { year: "2026", month: "8", customerId: "", itemId: "", amount: "" },
  asset: {
    categoryId: "",
    name: "",
    acquisitionDate: today,
    location: "",
    acquisitionCost: "",
    residualValue: "0",
    usefulLifeMonths: "",
    depreciationMethod: "straight_line",
    assetAccountId: "",
    accumulatedAccountId: "",
    expenseAccountId: "",
  },
  category: {
    name: "",
    defaultUsefulLifeMonths: "",
    defaultMethod: "straight_line",
    assetAccountId: "",
    accumulatedAccountId: "",
    expenseAccountId: "",
  },
  stock: {
    itemId: "",
    type: "in" as const,
    quantity: "",
    unitCost: undefined,
    date: today,
    note: "",
  },
  cash: {
    type: "bank" as const,
    date: today,
    description: "",
    debit: "0",
    credit: "0",
    counterAccountId: "",
    currency: "IDR",
    rate: undefined,
    note: "",
  },
};

/** Isian yang HARUS mengeluh saat formulirnya dikirim tanpa disentuh. */
const CASES: {
  form: string;
  schema: z.ZodType;
  values: FieldValues;
  complains: string[];
}[] = [
  {
    form: "advances/new",
    schema: advancePaymentSchema,
    values: UNTOUCHED.advance,
    // Pelanggan (isian PILIHAN — yang kehilangan `required` di #188) dan jumlah.
    complains: ["customerId", "amount"],
  },
  {
    form: "budget/accounts",
    schema: budgetSchema,
    values: UNTOUCHED.budget,
    complains: ["accountId", "amount"],
  },
  {
    form: "budget/targets",
    schema: salesTargetSchema,
    values: UNTOUCHED.salesTarget,
    complains: ["amount"],
  },
  {
    form: "fixed-assets/new",
    schema: fixedAssetSchema,
    values: UNTOUCHED.asset,
    complains: [
      "categoryId",
      "name",
      "acquisitionCost",
      "usefulLifeMonths",
      "assetAccountId",
      "accumulatedAccountId",
      "expenseAccountId",
    ],
  },
  {
    form: "fixed-assets/categories",
    schema: fixedAssetCategorySchema,
    values: UNTOUCHED.category,
    complains: [
      "name",
      "defaultUsefulLifeMonths",
      "assetAccountId",
      "accumulatedAccountId",
      "expenseAccountId",
    ],
  },
  {
    form: "inventory/update",
    schema: stockUpdateSchema,
    values: UNTOUCHED.stock,
    complains: ["itemId", "quantity", "unitCost"],
  },
  {
    form: "finance/new",
    schema: cashTransactionSchema,
    values: UNTOUCHED.cash,
    // "Isi salah satu: masuk atau keluar" ditaruh skema pada `debit`.
    complains: ["description", "counterAccountId", "debit"],
  },
];

describe("formulir kosong ditolak SEBELUM permintaan berangkat", () => {
  for (const { form, schema, values, complains } of CASES) {
    it(`${form}: submit tanpa disentuh tidak pernah memanggil penangannya`, async () => {
      const { accepted, errors } = await submitForm(schema, values);

      expect(accepted, `${form}: formulir kosong TERKIRIM`).toBe(false);
      for (const field of complains) {
        expect(errors[field], `${form}: ${field} tidak mengeluh`).toBeTypeOf("string");
        expectHumanSentence(errors[field], `${form}: ${field}`);
      }
    });
  }

  it("isian pilihan yang kosong berbunyi WAJIB DIPILIH, bukan angka terlalu kecil", async () => {
    // `Number("")` adalah `0`; tanpa pesan yang benar pengguna membaca keluhan
    // zod tentang angka, untuk sebuah isian yang tak pernah ia ketik.
    const budget = await submitForm(budgetSchema, UNTOUCHED.budget);
    expect(sentence(budget.errors.accountId)).toBe("Akun wajib dipilih");

    const asset = await submitForm(fixedAssetSchema, UNTOUCHED.asset);
    expect(sentence(asset.errors.categoryId)).toBe("Kategori wajib dipilih");
    expect(sentence(asset.errors.assetAccountId)).toBe("Akun wajib dipilih");

    const stock = await submitForm(stockUpdateSchema, UNTOUCHED.stock);
    expect(sentence(stock.errors.itemId)).toBe("Pilih barang dari master stok.");

    const advance = await submitForm(advancePaymentSchema, UNTOUCHED.advance);
    expect(sentence(advance.errors.customerId)).toBe(
      "Pelanggan wajib dipilih untuk uang muka penjualan."
    );
  });

  it("nominal kosong BUKAN nol — anggaran & target menolaknya", async () => {
    // Keduanya `nonnegative()`, jadi nol adalah angka yang SAH. Tanpa pemisahan
    // "kosong" dari "nol", isian yang tak tersentuh tersimpan sebagai rencana
    // nol rupiah dan tak bisa dibedakan dari kekeliruan.
    const budget = await submitForm(budgetSchema, UNTOUCHED.budget);
    expect(sentence(budget.errors.amount)).toBe("Jumlah wajib diisi");

    const target = await submitForm(salesTargetSchema, UNTOUCHED.salesTarget);
    expect(sentence(target.errors.amount)).toBe("Jumlah wajib diisi");

    // Nol yang DIKETIK tetap diterima — ia sebuah nilai, bukan ketiadaan nilai.
    const zero = await submitForm(budgetSchema, {
      ...UNTOUCHED.budget,
      accountId: "5",
      amount: "0",
    });
    expect(zero.accepted).toBe(true);
  });

  it("pesannya ikut berpindah bahasa (id/en/zh)", async () => {
    const { errors } = await submitForm(budgetSchema, UNTOUCHED.budget);
    const message = errors.accountId;
    expect(translateMessage(id, message)).toBe("Akun wajib dipilih");
    expect(translateMessage(en as Dictionary, message)).toBe("Please choose an account");
    expect(translateMessage(zh as Dictionary, message)).toBe("请选择科目");
  });
});

/* ------------------------------------------------------------------ */
/* 2. Isian yang terisi lolos — penjaga anti-hampa                     */
/* ------------------------------------------------------------------ */

describe("formulir yang terisi benar tetap lolos", () => {
  it("anggaran akun lengkap diterima, dan angkanya sudah ter-coerce", async () => {
    const { accepted, parsed } = await submitForm(budgetSchema, {
      accountId: "12",
      year: "2026",
      month: "8",
      amount: "1500000",
    });

    expect(accepted).toBe(true);
    // Yang sampai ke penangan adalah muatan yang SUDAH divalidasi skema — itu
    // yang membuat formulir dan route handler tidak bisa menyimpang: yang
    // dikirim ke `/api/budget` persis objek ini.
    expect(parsed).toMatchObject({ accountId: 12, year: 2026, month: 8, amount: 1500000 });
  });

  it("gerakan stok masuk yang lengkap diterima; harga pokoknya wajib", async () => {
    const filled = { ...UNTOUCHED.stock, itemId: "3", quantity: "10.5", unitCost: "12000" };
    expect((await submitForm(stockUpdateSchema, filled)).accepted).toBe(true);

    // Tanpa harga pokok, barang MASUK ditolak — HPP saat keluar tak bisa
    // dihitung, dan labanya diam-diam terlalu besar.
    const noCost = { ...filled, unitCost: undefined };
    const result = await submitForm(stockUpdateSchema, noCost);
    expect(result.accepted).toBe(false);
    expect(sentence(result.errors.unitCost)).toMatch(/wajib diisi untuk barang masuk/);

    // Barang KELUAR tidak menanyakannya sama sekali.
    expect(
      (await submitForm(stockUpdateSchema, { ...noCost, type: "out" as const })).accepted
    ).toBe(true);
  });

  it("valas tanpa kurs ditolak di client, sama seperti di server", async () => {
    const usd = {
      ...UNTOUCHED.cash,
      description: "Bayar supplier",
      counterAccountId: "9",
      credit: "1000",
      currency: "USD",
    };
    const missing = await submitForm(cashTransactionSchema, usd);
    expect(missing.accepted).toBe(false);
    expect(sentence(missing.errors.rate)).toBe(
      "Kurs ke IDR wajib diisi untuk mata uang USD."
    );

    expect((await submitForm(cashTransactionSchema, { ...usd, rate: "16250" })).accepted).toBe(
      true
    );
    // Rupiah tidak menuntut kurs, dan isian kursnya memang tidak dirender.
    expect(
      (await submitForm(cashTransactionSchema, { ...usd, currency: "IDR" })).accepted
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Tanda wajib pada isian PILIHAN                                   */
/* ------------------------------------------------------------------ */

describe("isian pilihan wajib mengumumkan dirinya wajib", () => {
  function PickerField({ required }: { required?: boolean }) {
    const form = useForm<{ accountId: string }>({ defaultValues: { accountId: "" } });
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel required={required}>Akun</FormLabel>
              <FormControl>
                <NativeSelect options={[{ value: "1", label: "1000 · Kas" }]} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    );
  }

  it("memasang `aria-required` dan tanda `*` — pengganti `required` yang hilang", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as Dictionary}>
        <PickerField required />
      </LocaleProvider>
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("*");
    // Tanda `*` bisu bagi pembaca layar; kata "(wajib)" yang menemaninya tidak.
    expect(html).toContain("(wajib)");
  });

  it("isian yang tidak wajib tidak mengaku wajib", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as Dictionary}>
        <PickerField />
      </LocaleProvider>
    );
    expect(html).not.toContain("aria-required");
    expect(html).not.toContain("(wajib)");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Galat server mendarat di isiannya — dan tak pernah ditelan       */
/* ------------------------------------------------------------------ */

describe("applyServerFieldErrors", () => {
  it("menaruh galat pada field yang ADA di layar", () => {
    const setError = vi.fn();
    applyServerFieldErrors(
      setError,
      { details: { fieldErrors: { amount: ["Jumlah terlalu besar"] } } },
      ["amount"],
      "gagal"
    );
    expect(setError).toHaveBeenCalledWith("amount", {
      type: "server",
      message: "Jumlah terlalu besar",
    });
  });

  it("menaikkan galat field DI LUAR layar menjadi galat formulir", () => {
    // Kelas kegagalan yang sama dengan issue ini: pesan yang tak pernah terlihat
    // siapa pun, dan tombol Simpan yang seolah tidak melakukan apa-apa.
    const setError = vi.fn();
    applyServerFieldErrors(
      setError,
      { details: { fieldErrors: { costCenterId: ["Pusat biaya tidak dikenal"] } } },
      ["amount"],
      "gagal"
    );
    expect(setError).toHaveBeenCalledWith("root", { message: "Pusat biaya tidak dikenal" });
  });

  it("jatuh ke pesan cadangan saat jawabannya tidak menerangkan apa pun", () => {
    const setError = vi.fn();
    applyServerFieldErrors(setError, {}, ["amount"], "Data belum bisa disimpan.");
    expect(setError).toHaveBeenCalledWith("root", { message: "Data belum bisa disimpan." });
  });

  it("mengabaikan daftar pesan kosong (bentuk yang benar-benar dikirim zod)", () => {
    const setError = vi.fn();
    applyServerFieldErrors(
      setError,
      { details: { fieldErrors: { amount: [], name: ["Nama wajib diisi"] } } },
      ["amount", "name"],
      "gagal"
    );
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "Nama wajib diisi",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 5. Penjaga sumber: ketujuh berkas benar-benar memakai pola ini      */
/* ------------------------------------------------------------------ */

const APP = join(__dirname, "..", "src", "app", "(dashboard)", "t", "[tenantSlug]", "[companySlug]");

/** Ketujuh berkas yang dicatat issue #216, beserta skema bersamanya. */
const FORM_FILES = [
  { path: join(APP, "advances", "new", "advance-form.tsx"), schema: "advancePaymentSchema" },
  {
    path: join(APP, "budget", "accounts", "budget-accounts-client.tsx"),
    schema: "budgetSchema",
  },
  {
    path: join(APP, "budget", "targets", "sales-target-client.tsx"),
    schema: "salesTargetSchema",
  },
  { path: join(APP, "fixed-assets", "new", "asset-form.tsx"), schema: "fixedAssetSchema" },
  {
    path: join(APP, "fixed-assets", "categories", "category-form.tsx"),
    schema: "fixedAssetCategorySchema",
  },
  { path: join(APP, "inventory", "update", "stock-form.tsx"), schema: "stockUpdateSchema" },
  { path: join(APP, "finance", "new", "transaction-form.tsx"), schema: "cashTransactionSchema" },
];

describe("ketujuh formulir memakai pola Form (MASTER.md §Konvensi Form)", () => {
  for (const { path, schema } of FORM_FILES) {
    const name = path.slice(APP.length + 1);
    const code = readFileSync(path, "utf8");

    it(`${name}: memvalidasi dengan ${schema} yang sama seperti route handler`, () => {
      expect(code).toContain(`zodResolver(${schema})`);
      expect(code).toContain("@/lib/validations/");
    });

    it(`${name}: submit lewat handleSubmit, dengan validasi peramban dimatikan`, () => {
      // `noValidate`: dua bahasa galat di satu layar (gelembung peramban di
      // samping pesan inline) adalah formulir yang tampak rusak.
      expect(code).toContain("form.handleSubmit(");
      expect(code).toContain("noValidate");
    });

    it(`${name}: tidak ada lagi kontrol komposit ber-\`required\` di luar pola Form`, () => {
      // `<Select … required>` adalah bentuk yang justru menjadi regresi #216:
      // atributnya tak divalidasi siapa pun, dan tandanya berbohong.
      expect(code).not.toMatch(/<Select\b/);
      expect(code).not.toMatch(/<Input\b/);
    });
  }
});
