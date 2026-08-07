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
import { Textarea } from "@/components/ui/textarea";
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
/* 3b. Tidak ada idref menggantung — DI SELURUH BENTUK ISIAN (#262)     */
/* ------------------------------------------------------------------ */

/*
 * Kelas kegagalan yang dijaga di sini, bukan satu contohnya: **setiap id yang
 * disebut sebuah rujukan harus benar-benar ada di markup yang sama.**
 *
 * Sampai #262 `FormControl` menyebut id deskripsi tanpa syarat, padahal simpul
 * deskripsi hanya dirender di 16 dari 83 isian — 67 sisanya menunjuk ke ruang
 * kosong. Tes lama (§3) tidak menangkapnya karena ia hanya pernah merender
 * bentuk yang MEMANG punya deskripsi. Karena itu yang disapu di sini adalah
 * matriks bentuknya: ada/tanpa deskripsi × ada/tanpa galat × teks/pilihan/area
 * teks/baris centang, ditambah bentuk-bentuk yang dulu diam-diam salah
 * (deskripsi di dalam fragment atau `<div>`, galat tanpa kalimat, pemanggil
 * yang tidak menulis `<FormMessage>` sama sekali).
 *
 * Diukur dari `renderToStaticMarkup`, bukan dari DOM sesudah hidrasi. Itu
 * disengaja: pendaftaran lewat `useEffect` akan LULUS di DOM dan tetap
 * mengirim HTML pertama yang menggantung ke pembaca layar. Kalau perbaikannya
 * tidak bisa dibuktikan dari markup hasil render server, ia bukan perbaikan.
 */

type ControlKind = "text" | "select" | "textarea" | "checkbox" | "none";

interface Shape {
  what: string;
  control: ControlKind;
  label?: string;
  required?: boolean;
  /** `undefined` = `<FormDescription>` tidak ditulis pemanggil. */
  description?: string;
  /** Bagaimana deskripsinya dibungkus sebelum sampai ke `FormItem`. */
  wrap?: "fragment" | "host";
  /** `undefined` = tanpa galat; `""` = galat tanpa kalimat (`setError` manual). */
  message?: string;
  /** Pemanggil sengaja tidak menulis `<FormMessage>` (2 isian di app ini). */
  omitMessage?: boolean;
}

function controlOf(kind: ControlKind, field: Record<string, unknown>) {
  if (kind === "select") {
    return <NativeSelect options={[{ value: "USD", label: "USD" }]} {...field} />;
  }
  if (kind === "textarea") return <Textarea rows={2} {...field} />;
  if (kind === "checkbox") return <TextInput id="probe-checkbox" type="checkbox" {...field} />;
  return <TextInput {...field} />;
}

function ShapeField(shape: Shape) {
  const form = useForm<{ v: string }>({ defaultValues: { v: "" } });
  if (shape.message !== undefined) form.setError("v", { type: "custom", message: shape.message });

  const description =
    shape.description === undefined ? null : <FormDescription>{shape.description}</FormDescription>;

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="v"
        render={({ field }) => (
          <FormItem>
            {/* Baris centang tidak punya `FormLabel`: labelnya adalah `<label>`
                yang membungkus isiannya, persis seperti di `cost-center-form`. */}
            {shape.control !== "checkbox" && shape.label !== undefined && (
              <FormLabel required={shape.required}>{shape.label}</FormLabel>
            )}
            {shape.control === "checkbox" && (
              <label htmlFor="probe-checkbox">
                <FormControl>{controlOf(shape.control, field)}</FormControl>
                <span>{shape.label}</span>
              </label>
            )}
            {shape.control !== "checkbox" && shape.control !== "none" && (
              <FormControl>{controlOf(shape.control, field)}</FormControl>
            )}
            {shape.wrap === "fragment" ? <>{description}</> : null}
            {shape.wrap === "host" ? <div>{description}</div> : null}
            {shape.wrap === undefined ? description : null}
            {!shape.omitMessage && <FormMessage />}
          </FormItem>
        )}
      />
    </Form>
  );
}

/** Semua id yang benar-benar ada di markup. */
function idsIn(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));
}

/**
 * Rujukan yang kita tulis sendiri: `aria-describedby` (pokok #262) dan `for`
 * (penyakit yang sama di atribut lain — label yang menunjuk isian tak dirender).
 *
 * `aria-controls`/`aria-activedescendant` milik rc-select sengaja TIDAK ikut:
 * keduanya menunjuk daftar popup yang memang belum dirender selama daftarnya
 * tertutup, dan itu perilaku paket pihak ketiga, bukan pautan yang dirakit
 * `form.tsx`.
 */
function idrefsIn(html: string): string[] {
  const refs: string[] = [];
  for (const attr of [/\saria-describedby="([^"]*)"/g, /\sfor="([^"]*)"/g]) {
    for (const m of html.matchAll(attr)) refs.push(...m[1].split(/\s+/).filter(Boolean));
  }
  return refs;
}

/** Id `aria-describedby` diterjemahkan menjadi PERANnya, supaya bisa diurutkan. */
function describedKinds(html: string): string[] {
  const kinds: string[] = [];
  for (const m of html.matchAll(/\saria-describedby="([^"]*)"/g)) {
    for (const ref of m[1].split(/\s+/).filter(Boolean)) {
      if (ref.endsWith("-form-item-description")) kinds.push("deskripsi");
      else if (ref.endsWith("-form-item-message")) kinds.push("pesan");
      else kinds.push(ref);
    }
  }
  return kinds;
}

const SHAPES: Shape[] = [
  { what: "teks, tanpa deskripsi, tanpa galat", control: "text", label: "Tanggal" },
  { what: "teks, tanpa deskripsi, wajib", control: "text", label: "Tanggal", required: true },
  { what: "teks, tanpa deskripsi, GALAT", control: "text", label: "Tanggal", message: "Wajib" },
  { what: "teks, deskripsi, tanpa galat", control: "text", label: "Tanggal", description: "Bantuan" },
  {
    what: "teks, deskripsi, GALAT",
    control: "text",
    label: "Tanggal",
    description: "Bantuan",
    message: "Wajib",
  },
  { what: "pilihan, tanpa deskripsi", control: "select", label: "Mata uang" },
  { what: "pilihan, deskripsi + galat", control: "select", label: "Mata uang", description: "Kurs", message: "Wajib" },
  { what: "area teks, tanpa deskripsi", control: "textarea", label: "Alasan" },
  { what: "area teks, deskripsi", control: "textarea", label: "Alasan", description: "Bantuan" },
  { what: "baris centang, tanpa label terangkat", control: "checkbox", label: "Aktif" },
  {
    what: "deskripsi di dalam fragment",
    control: "text",
    label: "Tanggal",
    description: "Bantuan",
    wrap: "fragment",
  },
  {
    what: "deskripsi di dalam <div>",
    control: "text",
    label: "Tanggal",
    description: "Bantuan",
    wrap: "host",
  },
  {
    what: "galat tanpa kalimat — `FormMessage` mengembalikan null",
    control: "text",
    label: "Tanggal",
    message: "",
  },
  {
    what: "pemanggil tidak menulis <FormMessage>, dan ada galat",
    control: "text",
    label: "Tanggal",
    message: "Wajib",
    omitMessage: true,
  },
  {
    what: "tanpa <FormMessage>, tapi ada deskripsi + galat",
    control: "text",
    label: "Tanggal",
    description: "Bantuan",
    message: "Wajib",
    omitMessage: true,
  },
  {
    /*
     * Panel berlabel yang TIDAK punya isian — bentuk nyata: "kata sandi sudah
     * tersimpan" di `mail-settings-form`. Yang dijaga di sini penyakit yang
     * sama pada atribut lain: `<label for>` yang menunjuk isian tak dirender.
     */
    what: "berlabel + deskripsi, tapi tanpa isian sama sekali",
    control: "none",
    label: "Kata sandi",
    description: "Sudah tersimpan",
    omitMessage: true,
  },
];

describe("aria-describedby tidak pernah menunjuk id yang tidak ada (#262)", () => {
  for (const shape of SHAPES) {
    it(shape.what, () => {
      const html = renderToStaticMarkup(<ShapeField {...shape} />);
      const ids = idsIn(html);

      // 1. Tidak ada rujukan yang menggantung — inti issue #262.
      expect(idrefsIn(html).filter((ref) => !ids.has(ref))).toEqual([]);

      // 2. …dan tidak ada pautan yang HILANG. Tanpa bagian ini, "hapus saja
      //    atributnya" akan lulus tes ini — dan deskripsi yang tak pernah
      //    diumumkan sama tidak bergunanya dengan deskripsi yang salah alamat.
      const expected: string[] = [];
      if (shape.control !== "none") {
        if (shape.description !== undefined) expected.push("deskripsi");
        if (shape.message && !shape.omitMessage) expected.push("pesan");
      }
      expect(describedKinds(html)).toEqual(expected);

      // 3. Tak ada atribut kosong: `aria-describedby=""` juga menunjuk entah ke
      //    mana, dan tetap dibaca sebagai daftar oleh pembaca layar.
      expect(html).not.toContain('aria-describedby=""');

      // 4. Perilaku yang TIDAK boleh ikut berubah (#192/#216).
      expect(html.includes('aria-invalid="true"')).toBe(shape.message !== undefined);
      expect(html.includes('aria-required="true"')).toBe(Boolean(shape.required));
    });
  }
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
