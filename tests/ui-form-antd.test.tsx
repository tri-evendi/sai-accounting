/**
 * Pola FORM di atas Ant Design (issue #192, fase B6) — penjaga keputusannya.
 *
 * Keputusan yang dijaga berkas ini: **react-hook-form + zod tetap mesinnya,
 * AntD hanya kulit.** `Form.Item` dipakai TANPA `Form` AntD — tanpa `name`,
 * tanpa `rules` — sehingga kontrak "satu skema zod, dua sisi" (MASTER.md
 * §Konvensi Form aturan 1) selamat utuh.
 *
 * Empat kelas kegagalan yang khusus dijaga, semuanya lahir dari fakta bahwa
 * `Form.Item` di luar `Form` berperilaku berbeda dari yang tertulis di dokumen
 * AntD:
 *
 *  1. **Pesan galat yang hilang dari DOM.** Slot `help` — yang paling alami
 *     untuk pesan validasi — tidak pernah muncul pada render pertama tanpa
 *     `name`. Diukur di sini, terhadap paket `antd` yang benar-benar terpasang,
 *     supaya "kenapa `help` tidak dipakai" tidak berubah menjadi cerita rakyat.
 *  2. **Pautan ARIA yang putus.** AntD hanya menyuntikkan
 *     `aria-describedby`/`aria-invalid` di cabang ber-`name`. Tanpa `name` ia
 *     tidak memasang satu atribut pun, jadi seluruh pautan tetap milik
 *     `FormControl` — dan kalau seseorang menghapusnya karena "AntD kan sudah
 *     mengurusnya", tidak ada yang gagal selain pembaca layar.
 *  3. **Tanda wajib yang lenyap.** Label kini digambar AntD dari prop, bukan
 *     dari anak; tanda `*` harus ikut berpindah bersamanya.
 *  4. **Bahasa yang membeku.** Pesan zod dipanggang saat modul dimuat; yang
 *     membuatnya tetap berpindah bahasa adalah `FormMessage` sebagai batas
 *     tampilan. Rantai penuhnya diuji di sini: skema valas → `zodResolver` →
 *     `FormMessage` → kalimat dalam tiga bahasa.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Form as AntdForm } from "antd";
import { useForm, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { applyPaymentServerErrors } from "@/components/shared/payment-form";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";
import { paymentFormSchema, type PaymentFormInput } from "@/lib/validations/payment";

/* ------------------------------------------------------------------ */
/* Satu field lengkap, dirender statis                                 */
/* ------------------------------------------------------------------ */

interface FieldProbe {
  label?: string;
  required?: boolean;
  description?: string;
  message?: string;
}

/**
 * `setError` dipanggil di badan render SEBELUM `FormField` dirender, sehingga
 * `useFormState` membacanya pada bacaan pertama — satu-satunya cara menguji
 * komponen ini tanpa DOM (suite ini berjalan di environment `node`).
 */
function OneField({ label, required, description, message }: FieldProbe) {
  const form = useForm<{ date: string }>({ defaultValues: { date: "" } });
  if (message) form.setError("date", { type: "custom", message });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="date"
        render={({ field }) => (
          <FormItem style={{ gridColumn: "span 2" }}>
            {label !== undefined && <FormLabel required={required}>{label}</FormLabel>}
            <FormControl>
              <TextInput {...field} />
            </FormControl>
            {description !== undefined && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

function render(probe: FieldProbe, dictionary?: Dictionary): string {
  const node = <OneField {...probe} />;
  return renderToStaticMarkup(
    dictionary ? (
      <LocaleProvider locale="en" dictionary={dictionary}>
        {node}
      </LocaleProvider>
    ) : (
      node
    )
  );
}

/* ------------------------------------------------------------------ */
/* 1. Kulit AntD benar-benar dipakai — dan hanya sebagai kulit         */
/* ------------------------------------------------------------------ */

describe("FormItem berdiri di atas Form.Item AntD", () => {
  it("merender simpul `ant-form-item` bertata letak vertikal", () => {
    const html = render({ label: "Tanggal" });
    expect(html).toContain("ant-form-item");
    // Label DI ATAS isian. Tanpa ini `Form.Item` jatuh ke tata letak horizontal
    // bawaan konteks kosong dan labelnya duduk di kiri — bentuk yang tidak
    // dipakai satu pun formulir di aplikasi ini.
    expect(html).toContain("ant-form-item-vertical");
    expect(html).toContain("ant-form-item-label");
  });

  it("gaya pemanggil mendarat di simpul terluar, bukan di baris dalam", () => {
    /*
     * `Form.Item` AntD menyebarkan SISA propnya ke baris DALAM
     * (`.ant-form-item-row`), bukan ke simpul terluar — itu sebabnya props
     * `FormItem` dipersempit (lihat `form.tsx`). Yang dikunci di sini adalah
     * bahwa jalan keluar yang disediakan benar-benar mengenai simpul terluar:
     * field yang harus membentang mengatur kolomnya SENDIRI, dan gaya yang
     * mendarat di baris dalam tidak akan membentangkan apa pun — tanpa satu
     * galat pun.
     *
     * Sampai #203 bentuknya `className="sm:col-span-2"`; ia berganti menjadi
     * gaya sebaris bersama pencabutan Tailwind.
     */
    const html = render({ label: "Tanggal" });
    expect(html.startsWith('<div class="ant-form-item')).toBe(true);
    expect(html.slice(0, html.indexOf(">"))).toContain("grid-column:span 2");
  });

  it("keadaan error menular ke isian AntD di dalamnya", () => {
    const html = render({ label: "Tanggal", message: "validation.dateRequired" });
    expect(html).toContain("ant-form-item-has-error");
    expect(html).toContain("ant-input-status-error");
    expect(render({ label: "Tanggal" })).not.toContain("ant-form-item-has-error");
  });

  it("TIDAK memakai `Form` AntD — tak ada state formulir kedua", () => {
    const source = readFileSync(
      join(__dirname, "..", "src", "components", "ui", "form.tsx"),
      "utf8"
    );
    // Baris komentar dibuang: kepala berkas MENYEBUT nama-nama ini justru untuk
    // menjelaskan kenapa keduanya tidak dipakai, dan penjaga yang tersandung
    // pada penjelasannya sendiri hanya mengajari orang menghapus penjelasan.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");
    // `Form.useForm`/`rules`/`validateMessages` adalah mesin formulir AntD.
    // Memakainya berarti aturan validasi hidup di dua tempat, dan skema zod
    // berhenti menjadi satu-satunya kebenaran (issue #192).
    expect(code).not.toMatch(/AntdForm\.useForm|\brules=|validateMessages/);
    // Yang boleh dipakai hanyalah `Form.Item`-nya.
    expect(code).toContain("AntdForm.Item");
  });
});

/* ------------------------------------------------------------------ */
/* 2. `help` diukur, lalu sengaja ditolak                              */
/* ------------------------------------------------------------------ */

describe("slot `help` AntD tidak cukup untuk pesan validasi", () => {
  it("tanpa `name`, `help` tidak muncul pada render pertama", () => {
    /*
     * Sebabnya ada di `antd/es/form/FormItem/ItemHolder.js`: daftar galat baru
     * dirender bila `marginBottom !== null || errors.length || warnings.length`.
     * Tanpa `name` tidak ada Field, jadi `errors` selalu kosong, dan
     * `marginBottom` baru terisi di sebuah `useLayoutEffect` — yang tidak
     * pernah berjalan di render statis. Kalau versi AntD baru memperbaikinya,
     * tes ini yang akan memberi tahu bahwa `help` kembali layak dipakai.
     */
    const html = renderToStaticMarkup(
      <AntdForm.Item label="Tanggal" help="Tanggal wajib diisi">
        <input />
      </AntdForm.Item>
    );
    expect(html).not.toContain("ant-form-item-explain");
    expect(html).not.toContain("Tanggal wajib diisi");
  });

  it("`FormMessage` karena itu merender simpulnya sendiri, selalu ada", () => {
    const html = render({ label: "Tanggal", message: "validation.dateRequired" });
    expect(html).toContain('data-slot="form-message"');
    expect(html).toContain("Tanggal wajib diisi");
  });
});

/* ------------------------------------------------------------------ */
/* 3. Pautan ARIA & tanda wajib                                        */
/* ------------------------------------------------------------------ */

describe("pautan label–isian–deskripsi–galat terpasang otomatis", () => {
  it("label AntD menunjuk id isian yang sebenarnya", () => {
    const html = render({ label: "Tanggal" });
    const htmlFor = html.match(/<label for="([^"]+)"/)?.[1];
    expect(htmlFor).toBeTruthy();
    expect(html).toContain(`id="${htmlFor}"`);
  });

  it("aria-describedby menunjuk deskripsi, lalu deskripsi + pesan saat galat", () => {
    const clean = render({ label: "Tanggal", description: "Bantuan" });
    const cleanIds = clean.match(/aria-describedby="([^"]+)"/)?.[1]?.split(" ") ?? [];
    expect(cleanIds).toHaveLength(1);
    expect(clean).toContain(`id="${cleanIds[0]}"`);

    const failed = render({
      label: "Tanggal",
      description: "Bantuan",
      message: "validation.dateRequired",
    });
    const failedIds = failed.match(/aria-describedby="([^"]+)"/)?.[1]?.split(" ") ?? [];
    expect(failedIds).toHaveLength(2);
    for (const target of failedIds) expect(failed).toContain(`id="${target}"`);
    expect(failed).toContain('aria-invalid="true"');
    expect(failed).toContain('role="alert"');
  });

  it("isian wajib bertanda `*`, terbaca pembaca layar, dan `aria-required`", () => {
    const html = render({ label: "Tanggal", required: true });
    expect(html).toContain(">*<");
    expect(html).toContain("(wajib)");
    // Baru sejak #192 — sebelumnya tanda `*` berdiri sendirian, dan `Select`
    // AntD sudah kehilangan `required` native di #188 (issue #216).
    expect(html).toContain('aria-required="true"');
    expect(render({ label: "Tanggal" })).not.toContain("aria-required");
  });

  it("isian PILIHAN wajib ikut mengumumkannya — bukan hanya isian teks", () => {
    /*
     * `NativeSelect` memasang `aria-required` sendiri dari prop `required`, dan
     * atribut eksplisit itu berada SETELAH `{...props}` — jadi ia sempat
     * menimpa `aria-required` yang disuntik `FormControl` dengan `undefined`.
     * Justru isian pilihan yang paling membutuhkannya: `Select` AntD kehilangan
     * `required` native di #188 (issue #216).
     */
    function SelectField() {
      const form = useForm<{ currency: string }>({ defaultValues: { currency: "" } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Mata uang</FormLabel>
                <FormControl>
                  <NativeSelect options={[{ value: "USD", label: "USD" }]} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      );
    }
    expect(renderToStaticMarkup(<SelectField />)).toContain('aria-required="true"');
  });
});

/* ------------------------------------------------------------------ */
/* 4. Rantai valas: superRefine → zodResolver → kalimat berbahasa      */
/* ------------------------------------------------------------------ */

const resolver = zodResolver(paymentFormSchema);

/** Bentuk masukan yang diterima resolver — diturunkan, bukan ditulis ulang. */
type ResolverValues = Parameters<typeof resolver>[0];

async function resolveErrors(values: ResolverValues) {
  const result = await resolver(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
  return result.errors as Record<string, { message?: string } | undefined>;
}

describe("kurs bersyarat: satu skema, dari zod sampai ke layar", () => {
  const base = { date: "2026-03-15", amount: 1000, note: "" };

  it("USD tanpa kurs ditolak DI CLIENT, dengan KUNCI kamus (bukan kalimat)", async () => {
    const errors = await resolveErrors({ ...base, currency: "USD" });
    // Kunci, bukan kalimat: inilah yang membuat pesannya bisa berganti bahasa
    // di batas tampilan. `tests/i18n-validation.test.tsx` menjaga sisi skemanya.
    expect(errors.rate?.message).toBe("validation.rateRequiredUsd");
  });

  it("CNY punya kuncinya sendiri; IDR tidak menuntut kurs sama sekali", async () => {
    expect((await resolveErrors({ ...base, currency: "CNY" })).rate?.message).toBe(
      "validation.rateRequiredCny"
    );
    expect((await resolveErrors({ ...base, currency: "IDR" })).rate).toBeUndefined();
    expect(
      (await resolveErrors({ ...base, currency: "USD", rate: 16250 })).rate
    ).toBeUndefined();
  });

  it("kuncinya menjadi kalimat dalam bahasa yang sedang aktif", () => {
    const probe = { label: "Kurs", required: true, message: "validation.rateRequiredUsd" };
    expect(render(probe, id as Dictionary)).toContain(
      "Kurs ke IDR wajib diisi untuk mata uang USD."
    );
    expect(render(probe, en as Dictionary)).toContain("An exchange rate to IDR is required");
    expect(render(probe, zh as Dictionary)).toContain("美元");
    // Kunci mentah tidak boleh pernah sampai ke layar, di bahasa mana pun.
    for (const dictionary of [id, en, zh, undefined]) {
      expect(render(probe, dictionary as Dictionary | undefined)).not.toContain(
        "validation.rateRequiredUsd"
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. Server tetap penjaga terakhir (aturan 7)                         */
/* ------------------------------------------------------------------ */

describe("kegagalan server dipetakan ke field-nya", () => {
  function recorder() {
    const calls: { name: string; message: string }[] = [];
    const setError = ((name: string, error: { message?: string }) => {
      calls.push({ name, message: String(error.message) });
    }) as unknown as UseFormSetError<PaymentFormInput>;
    return { calls, setError };
  }

  it("fieldErrors mendarat di isiannya, bukan sebagai satu pita merah", () => {
    const { calls, setError } = recorder();
    applyPaymentServerErrors(
      setError,
      { error: "Isian belum benar", details: { fieldErrors: { rate: ["Kurs harus > 0"] } } },
      "gagal"
    );
    expect(calls).toEqual([{ name: "rate", message: "Kurs harus > 0" }]);
  });

  it("galat yang menunjuk field di luar layar naik menjadi galat formulir", () => {
    // `invoiceId` disuntik server dari URL — ia tidak punya isian di layar,
    // jadi menaruh pesannya di sana berarti pesan yang tak pernah terbaca.
    const { calls, setError } = recorder();
    applyPaymentServerErrors(
      setError,
      { details: { fieldErrors: { invoiceId: ["Tagihan tidak ditemukan"] } } },
      "gagal"
    );
    expect(calls).toEqual([{ name: "root", message: "Tagihan tidak ditemukan" }]);
  });

  it("tanpa fieldErrors sama sekali, pesan server menjadi galat formulir", () => {
    const { calls, setError } = recorder();
    applyPaymentServerErrors(setError, { error: "Periode sudah dikunci" }, "gagal");
    expect(calls).toEqual([{ name: "root", message: "Periode sudah dikunci" }]);
  });

  it("jawaban kosong pun tetap memberi kalimat, bukan diam", () => {
    const { calls, setError } = recorder();
    applyPaymentServerErrors(setError, {}, "Pembayaran gagal disimpan");
    expect(calls).toEqual([{ name: "root", message: "Pembayaran gagal disimpan" }]);
  });
});
