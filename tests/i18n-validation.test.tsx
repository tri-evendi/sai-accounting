/**
 * Pesan validasi (zod) yang mengikuti bahasa — penjaga janji-janjinya.
 *
 * Pesan zod dipanggang saat modul dimuat, jadi skema membawa KUNCI kamus dan
 * kalimatnya baru disusun di batas tampilan (lihat `lib/i18n/validation.ts`).
 * Bentuk itu hanya aman kalau empat hal DIJAMIN, dan keempatnya dijaga di sini:
 *
 *  1. **Tidak ada satu pun kalimat yang tertinggal di dalam skema.** Sebuah
 *     literal yang lolos berarti satu pesan yang selamanya berbahasa Indonesia,
 *     tak terlihat oleh siapa pun sampai seorang pengguna berbahasa Mandarin
 *     membacanya. Inilah penjaga yang membuat fase B & C aman: begitu penjaga
 *     ini hijau, `src/lib/validations/*` tidak bisa lagi mengirim teks mentah.
 *
 *  2. **Setiap kunci yang dipakai skema benar-benar ada di kamus.** `tsc` sudah
 *     menolak kunci salah ketik lewat tipe `ValidationKey`; tes ini menangkap
 *     yang lolos dari tipe (mis. kunci yang dirakit lewat tabel).
 *
 *  3. **Cadangan bahasa sumber tidak menyimpang dari kamus.** `VALIDATION_MESSAGES`
 *     hidup di dua tempat — literal untuk modul murni, kamus untuk tampilan —
 *     pola yang sama dengan `lib/nav.ts` & `lib/quick-actions.ts`.
 *
 *  4. **Batas tampilannya berperilaku benar**: kunci yang dikenal menjadi
 *     kalimat berbahasa pengguna, dan apa pun yang BUKAN kunci (prosa server,
 *     teks yang sudah dimanusiakan) diteruskan apa adanya. Kunci mentah tidak
 *     boleh pernah sampai ke layar; prosa tidak boleh pernah ditelan.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import {
  VALIDATION_MESSAGES,
  isValidationKey,
  translateFieldErrors,
  translateMessage,
  vissue,
  vmsg,
  type ValidationKey,
} from "@/lib/i18n/validation";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

const VALIDATIONS_DIR = join(__dirname, "..", "src", "lib", "validations");

// ───────────────────────── Pembacaan berkas skema ─────────────────────────

/**
 * Buang komentar TANPA merusak string (sebuah `//` di dalam teks bukan
 * komentar). Ditulis sebagai mesin keadaan kecil, bukan regex, karena justru
 * komentarlah yang paling banyak berisi kalimat berbahasa manusia di berkas
 * ini — salah membuangnya membuat penjaga #1 berteriak palsu.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === c) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Semua literal teks (', ", `) beserta isinya. */
function stringLiterals(source: string): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < source.length) {
    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let text = "";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          text += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        text += source[i];
        i++;
      }
      found.push(text);
      continue;
    }
    i++;
  }
  return found;
}

/**
 * `new Error(...)` DIKECUALIKAN dari penjaga #1.
 *
 * Isinya bukan pesan validasi melainkan invarian bagi pemrogram: `fxAmounts`
 * melempar ketika dipanggil lewat jalur yang belum divalidasi, yang berarti ada
 * bug di kode pemanggil — bukan kesalahan pengguna, dan tidak pernah ditampilkan
 * sebagai galat isian.
 */
function stripErrorThrows(source: string): string {
  return source.replace(/new Error\((?:[^()]|\([^()]*\))*\)/g, "new Error()");
}

const SCHEMA_FILES = readdirSync(VALIDATIONS_DIR)
  .filter((name) => name.endsWith(".ts"))
  .sort()
  .map((name) => ({
    name,
    code: stripErrorThrows(stripComments(readFileSync(join(VALIDATIONS_DIR, name), "utf8"))),
  }));

/** Semua jalur-titik yang sah di kamus sumber. */
function dictionaryKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    dictionaryKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

const SOURCE_KEYS = new Set(dictionaryKeys(id));

// ─────────────────── 1. Tidak ada kalimat mentah di skema ───────────────────

describe("skema validasi tidak boleh memuat kalimat mentah", () => {
  it("menemukan berkas skema untuk diperiksa", () => {
    // Kalau pembacaannya rusak, seluruh penjaga di bawah menjadi hampa.
    expect(SCHEMA_FILES.length).toBeGreaterThan(20);
  });

  it("setiap literal berkata-lebih-dari-satu sudah menjadi kunci kamus", () => {
    // Sebuah pesan SELALU punya spasi ("Tanggal wajib diisi"); kunci kamus,
    // nilai enum, kode mata uang, dan nama field TIDAK PERNAH punya. Jadi
    // "literal dengan spasi" adalah definisi operasional dari "kalimat yang
    // belum disapu" — tanpa perlu daftar putih yang gampang basi.
    const offenders = SCHEMA_FILES.flatMap(({ name, code }) =>
      stringLiterals(code)
        .filter((text) => /\s/.test(text))
        .map((text) => `${name}: ${JSON.stringify(text)}`)
    );

    expect(
      offenders,
      "Pesan berikut masih ditulis sebagai kalimat di dalam skema. Ganti dengan " +
        'kunci kamus lewat `vmsg("validation.…")` (atau `vissue()` bila pesannya ' +
        "membawa nominal), lalu tambahkan kuncinya ke ketiga kamus."
    ).toEqual([]);
  });

  it("setiap kunci yang dipakai skema ada di id.json", () => {
    const used = SCHEMA_FILES.flatMap(({ name, code }) =>
      stringLiterals(code)
        .filter((text) => text.startsWith("validation."))
        .map((key) => ({ name, key }))
    );

    // Penjaga anti-hampa: kalau ekstraksinya rusak, daftar ini akan kosong dan
    // tes di atas ikut hijau tanpa memeriksa apa pun.
    expect(new Set(used.map((u) => u.key)).size).toBeGreaterThan(60);

    const missing = used
      .filter(({ key }) => !SOURCE_KEYS.has(key))
      .map(({ name, key }) => `${name}: ${key}`);
    expect(missing, "Kunci berikut dipakai skema tetapi tidak ada di id.json").toEqual([]);
  });

  it("tidak ada kunci `validation.*` yang menganggur di kamus", () => {
    // Kunci yang tak dipakai siapa pun adalah sisa penyapuan: ia lolos `tsc`
    // (tipenya sah) dan lolos penjaga di atas (tidak ada yang mencarinya).
    const used = new Set(
      SCHEMA_FILES.flatMap(({ code }) =>
        stringLiterals(code).filter((text) => text.startsWith("validation."))
      )
    );
    // `invalidInput` bukan pesan field: ia amplop jawaban 400 di route handler.
    used.add("validation.invalidInput");

    const unused = [...SOURCE_KEYS].filter((key) => key.startsWith("validation.") && !used.has(key));
    expect(unused, "Kunci berikut ada di kamus tetapi tidak dipakai skema mana pun").toEqual([]);
  });
});

// ──────────────── 2. Cadangan bahasa sumber sejalan dengan kamus ────────────────

describe("VALIDATION_MESSAGES tidak menyimpang dari kamus", () => {
  const dictionaryValidationKeys = [...SOURCE_KEYS].filter((key) => key.startsWith("validation."));

  it("berkunci sama persis dengan namespace `validation` di id.json (urut sama)", () => {
    expect(Object.keys(VALIDATION_MESSAGES)).toEqual(dictionaryValidationKeys);
  });

  it("teksnya sama kata demi kata dengan id.json", () => {
    for (const [key, text] of Object.entries(VALIDATION_MESSAGES)) {
      expect(translateMessage(id, key), key).toBe(text);
    }
  });

  it("ketiga bahasa punya kalimat untuk setiap kunci validasi", () => {
    for (const key of dictionaryValidationKeys) {
      for (const [locale, dictionary] of [
        ["id", id],
        ["en", en],
        ["zh", zh],
      ] as const) {
        const text = translateMessage(dictionary as Dictionary, key);
        expect(text, `${locale}: ${key}`).not.toBe(key);
        expect(text.trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

// ─────────────────────── 3. translateMessage / isValidationKey ───────────────────────

describe("translateMessage: kunci diterjemahkan, selain itu diteruskan", () => {
  it("kunci yang dikenal menjadi kalimat dalam bahasa yang diminta", () => {
    expect(translateMessage(id, "validation.dateRequired")).toBe("Tanggal wajib diisi");
    expect(translateMessage(en, "validation.dateRequired")).toBe("Date is required");
    expect(translateMessage(zh, "validation.dateRequired")).toBe("请填写日期");
  });

  it("kunci tanpa kamus jatuh ke bahasa sumber — BUKAN ke kunci mentah", () => {
    // Inilah yang menjaga batas tampilan yang belum disapu (fase B & C) tetap
    // menampilkan kalimat, bukan `validation.dateRequired` di layar pengguna.
    expect(translateMessage(null, "validation.dateRequired")).toBe("Tanggal wajib diisi");
    expect(translateMessage(undefined, "validation.dateRequired")).toBe("Tanggal wajib diisi");
  });

  it("pesan yang bukan kunci diteruskan APA ADANYA", () => {
    const prose = "Kontrak sumber tidak ditemukan.";
    expect(translateMessage(id, prose)).toBe(prose);
    expect(translateMessage(en, prose)).toBe(prose);
    expect(translateMessage(null, prose)).toBe(prose);
    // Keluaran mentah zod juga bukan kunci — jangan ditelan.
    expect(translateMessage(en, "Too small: expected number to be >0")).toBe(
      "Too small: expected number to be >0"
    );
    expect(translateMessage(id, "")).toBe("");
  });

  it("tidak bisa ditembus lewat prototipe objek", () => {
    // `VALIDATION_MESSAGES["constructor"]` adalah fungsi, bukan kalimat.
    expect(translateMessage(id, "constructor")).toBe("constructor");
    expect(translateMessage(null, "toString")).toBe("toString");
    expect(isValidationKey("constructor")).toBe(false);
  });

  it("menyisipkan penampung untuk pesan berparameter", () => {
    expect(
      translateMessage(id, "validation.allocationExceedsPayment", {
        total: "1.500",
        payment: "1.000",
      })
    ).toBe("Total alokasi (1.500) melebihi jumlah pembayaran (1.000).");
  });

  it("isValidationKey membedakan kunci dari prosa", () => {
    expect(isValidationKey("validation.dateRequired")).toBe(true);
    expect(isValidationKey("validation.tidakAdaKunciIni")).toBe(false);
    expect(isValidationKey("Tanggal wajib diisi")).toBe(false);
  });
});

describe("vmsg & vissue", () => {
  it("vmsg mengembalikan kuncinya sendiri — nilainya ada pada TIPE argumennya", () => {
    expect(vmsg("validation.dateRequired")).toBe("validation.dateRequired");
  });

  it("vissue mengisi kalimat bahasa sumber DAN menitipkan kunci di params", () => {
    const issue = vissue("validation.allocationExceedsPayment", {
      total: "1.500",
      payment: "1.000",
    });
    // `message` sudah terisi: batas tampilan yang belum disapu tetap membaca
    // kalimat, sama persis seperti sebelum penyapuan.
    expect(issue.message).toBe("Total alokasi (1.500) melebihi jumlah pembayaran (1.000).");
    expect(issue.params.i18nKey).toBe("validation.allocationExceedsPayment");
    expect(issue.params.i18nValues).toEqual({ total: "1.500", payment: "1.000" });
  });
});

// ───────────────────── 4. Batas SERVER: translateFieldErrors ─────────────────────

describe("translateFieldErrors: batas tampilan sisi server (route handler)", () => {
  const schema = z
    .object({
      date: z.string().min(1, vmsg("validation.dateRequired")),
      amount: z.coerce.number().positive(vmsg("validation.amountPositive")),
      // Pesan yang memang BUKAN kunci — harus lolos tanpa disentuh.
      note: z.string().max(3, "Catatan ini terlalu panjang untuk contoh."),
    })
    .superRefine((data, ctx) => {
      if (data.amount > 10) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          ...vissue("validation.allocationExceedsPayment", { total: "20", payment: "10" }),
        });
      }
    });

  function errorsFor(dictionary: Dictionary | null) {
    const parsed = schema.safeParse({ date: "", amount: 20, note: "terlalu panjang" });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("skema contoh seharusnya gagal");
    return translateFieldErrors(parsed.error, dictionary);
  }

  it("menerjemahkan kunci ke bahasa pengguna", () => {
    expect(errorsFor(en).fieldErrors.date).toEqual(["Date is required"]);
    expect(errorsFor(zh).fieldErrors.date).toEqual(["请填写日期"]);
    expect(errorsFor(id).fieldErrors.date).toEqual(["Tanggal wajib diisi"]);
  });

  it("pesan yang BUKAN kunci lewat tanpa diubah, di bahasa mana pun", () => {
    for (const dictionary of [id, en, zh, null]) {
      expect(errorsFor(dictionary as Dictionary | null).fieldErrors.note).toEqual([
        "Catatan ini terlalu panjang untuk contoh.",
      ]);
    }
  });

  it("pesan berparameter disusun ulang dari `params`, bukan dari teksnya", () => {
    expect(errorsFor(en).fieldErrors.amount).toEqual([
      "The allocations (20) add up to more than the payment (10).",
    ]);
    expect(errorsFor(id).fieldErrors.amount).toEqual([
      "Total alokasi (20) melebihi jumlah pembayaran (10).",
    ]);
  });

  it("tanpa kamus, semuanya jatuh ke bahasa sumber — tak ada kunci mentah", () => {
    const flat = errorsFor(null);
    for (const messages of Object.values(flat.fieldErrors)) {
      for (const message of messages ?? []) {
        expect(message).not.toMatch(/^validation\./);
      }
    }
  });

  it("bentuknya tetap `flatten()` — formErrors + fieldErrors", () => {
    const flat = errorsFor(id);
    expect(Array.isArray(flat.formErrors)).toBe(true);
    expect(Object.keys(flat.fieldErrors).sort()).toEqual(["amount", "date", "note"]);
  });
});

// ───────────────────── 5. Batas CLIENT: <FormMessage /> ─────────────────────

/**
 * Satu field dengan galat yang sudah ditanam, dirender statis.
 *
 * `setError` dipanggil di badan render SEBELUM `FormField` dirender, sehingga
 * `useFormState` di dalam `FormMessage` membaca galatnya pada bacaan pertama —
 * satu-satunya cara menguji komponen ini tanpa DOM dan tanpa efek.
 */
function OneField({ message }: { message: string }) {
  const form = useForm<{ date: string }>({ defaultValues: { date: "" } });
  form.setError("date", { type: "custom", message });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="date"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

function renderMessage(message: string, dictionary: Dictionary | null): string {
  const field = <OneField message={message} />;
  return renderToStaticMarkup(
    dictionary ? (
      <LocaleProvider locale="en" dictionary={dictionary}>
        {field}
      </LocaleProvider>
    ) : (
      field
    )
  );
}

describe("FormMessage: batas tampilan sisi client", () => {
  it("kunci yang dikenal dirender sebagai kalimat berbahasa pengguna", () => {
    expect(renderMessage("validation.dateRequired", en)).toContain("Date is required");
    expect(renderMessage("validation.dateRequired", zh)).toContain("请填写日期");
    expect(renderMessage("validation.dateRequired", id)).toContain("Tanggal wajib diisi");
  });

  it("kunci mentah TIDAK PERNAH sampai ke layar", () => {
    for (const dictionary of [id, en, zh, null]) {
      expect(renderMessage("validation.dateRequired", dictionary as Dictionary | null)).not.toContain(
        "validation.dateRequired"
      );
    }
  });

  it("di luar LocaleProvider, kunci jatuh ke kalimat bahasa Indonesia", () => {
    expect(renderMessage("validation.dateRequired", null)).toContain("Tanggal wajib diisi");
  });

  it("pesan yang BUKAN kunci dirender apa adanya", () => {
    // Prosa dari server (`form.setError("root", …)`) dan teks yang sudah
    // dimanusiakan harus tetap terbaca utuh, bukan dianggap kunci hilang.
    const prose = "Kontrak sumber tidak ditemukan.";
    expect(renderMessage(prose, en)).toContain(prose);
    expect(renderMessage(prose, null)).toContain(prose);
    expect(renderMessage("Too small: expected number to be &gt;0", en)).toContain("Too small");
  });

  it("tetap diumumkan pembaca layar (role=alert) apa pun bahasanya", () => {
    expect(renderMessage("validation.dateRequired", zh)).toContain('role="alert"');
  });
});

// ───────────── 6. Jalur pesan API: humanizeFieldMessage tetap utuh ─────────────

describe("kunci yang lewat jalur pesan API tetap menjadi kalimat", () => {
  it("humanizeFieldMessage menerjemahkan kunci dan tidak menulisnya ulang", async () => {
    const { humanizeFieldMessage } = await import("@/lib/form-guards");
    // Tanpa kamus: kalimat bahasa Indonesia yang SAMA seperti sebelum penyapuan.
    expect(humanizeFieldMessage("date", "validation.dateRequired")).toBe("Tanggal wajib diisi.");
    // Dengan kamus (fase C): kalimatnya ikut bahasa pengguna, dan `RULES` tidak
    // menulis ulang terjemahan Inggris "Date is required" menjadi Indonesia.
    expect(humanizeFieldMessage("date", "validation.dateRequired", en)).toBe("Date is required.");
    expect(humanizeFieldMessage("date", "validation.dateRequired", zh)).toBe("请填写日期。");
  });

  it("pesan yang bukan kunci tetap melewati aturan lama, tanpa perubahan", () => {
    // Penjaga anti-regresi untuk `tests/form-guards.test.ts`: jalur non-kunci
    // tidak boleh ikut berubah oleh cabang baru di atasnya.
    const key: ValidationKey = "validation.dateRequired";
    expect(isValidationKey("Contract number is required")).toBe(false);
    expect(isValidationKey(key)).toBe(true);
  });
});
