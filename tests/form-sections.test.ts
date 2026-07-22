/**
 * Progressive disclosure (issue #4) — peta inti/lanjutan dan pemetaan
 * "galat → bagian mana yang harus dibuka".
 *
 * Yang dijaga di sini adalah janji paling penting fitur ini: TIDAK ADA pesan
 * galat yang menunjuk isian tersembunyi tanpa memberi tahu formulir bahwa
 * bagiannya harus ikut terbuka.
 */
import { describe, expect, it } from "vitest";
import {
  ADVANCED_SECTION_TITLE,
  FORM_LAYOUTS,
  firstOffendingField,
  isAdvancedField,
  orderedFields,
  resolveSubmitFailure,
  sectionOfField,
  type FormKey,
} from "@/lib/form-sections";

const FORMS: FormKey[] = ["kontrak", "faktur", "kas"];

describe("peta bagian formulir", () => {
  it("mencakup ketiga formulir utama dengan judul lipatan yang sama", () => {
    expect(Object.keys(FORM_LAYOUTS).sort()).toEqual(["faktur", "kas", "kontrak"]);
    expect(ADVANCED_SECTION_TITLE).toBe("Detail lengkap");
  });

  it("tidak pernah menaruh satu field di dua bagian sekaligus", () => {
    for (const form of FORMS) {
      const { core, advanced } = FORM_LAYOUTS[form];
      const overlap = core.filter((f) => advanced.includes(f));
      expect(overlap, `${form} tumpang tindih`).toEqual([]);
      const all = orderedFields(form);
      expect(new Set(all).size, `${form} punya duplikat`).toBe(all.length);
    }
  });

  it("mempertahankan mitra, tanggal, nilai, dan baris barang sebagai isian inti", () => {
    expect(sectionOfField("kontrak", "buyer")).toBe("inti");
    expect(sectionOfField("kontrak", "date")).toBe("inti");
    expect(sectionOfField("kontrak", "items")).toBe("inti");

    expect(sectionOfField("faktur", "customerId")).toBe("inti");
    expect(sectionOfField("faktur", "invoiceNo")).toBe("inti");
    expect(sectionOfField("faktur", "items")).toBe("inti");

    expect(sectionOfField("kas", "date")).toBe("inti");
    expect(sectionOfField("kas", "description")).toBe("inti");
    expect(sectionOfField("kas", "debit")).toBe("inti");
    expect(sectionOfField("kas", "credit")).toBe("inti");
    expect(sectionOfField("kas", "counterAccountId")).toBe("inti");
  });

  it("melipat termin, catatan, valas, dan dokumen ekspor", () => {
    expect(isAdvancedField("kontrak", "top1")).toBe(true);
    expect(isAdvancedField("kontrak", "top2")).toBe(true);
    expect(isAdvancedField("kontrak", "packaging")).toBe(true);
    expect(isAdvancedField("kontrak", "dueDate")).toBe(true);

    expect(isAdvancedField("faktur", "currency")).toBe(true);
    expect(isAdvancedField("faktur", "rate")).toBe(true);
    expect(isAdvancedField("faktur", "taxRate")).toBe(true);
    expect(isAdvancedField("faktur", "pebNumber")).toBe(true);

    expect(isAdvancedField("kas", "note")).toBe(true);
    expect(isAdvancedField("kas", "currency")).toBe(true);
    expect(isAdvancedField("kas", "rate")).toBe(true);
  });

  it("mengembalikan null untuk field yang bukan milik formulir itu", () => {
    expect(sectionOfField("kas", "pebNumber")).toBeNull();
    expect(isAdvancedField("kontrak", "taxRate")).toBe(false);
  });

  it("mengurutkan field: inti dulu, lanjutan belakangan", () => {
    const urutan = orderedFields("kas");
    expect(urutan.indexOf("debit")).toBeLessThan(urutan.indexOf("note"));
    expect(urutan[0]).toBe("type");
  });
});

describe("firstOffendingField", () => {
  it("memilih menurut urutan tampil formulir, bukan urutan kunci JSON", () => {
    const hit = firstOffendingField("kontrak", {
      top1: ["Terlalu panjang"],
      buyer: ["Buyer is required"],
    });
    expect(hit).toEqual({ field: "buyer", raw: "Buyer is required" });
  });

  it("mengabaikan kunci tanpa pesan berisi", () => {
    const hit = firstOffendingField("kas", { debit: [], description: ["  "], note: ["Terlalu panjang"] });
    expect(hit?.field).toBe("note");
  });

  it("masih melaporkan field asing daripada tidak melaporkan apa pun", () => {
    const hit = firstOffendingField("kas", { supplierId: ["Required"] });
    expect(hit?.field).toBe("supplierId");
  });

  it("null bila memang tidak ada galat field", () => {
    expect(firstOffendingField("faktur", {})).toBeNull();
  });
});

describe("resolveSubmitFailure — galat harus membuka bagian yang menyembunyikannya", () => {
  it("menyuruh membuka 'Detail lengkap' ketika kurs faktur yang gagal", () => {
    const hasil = resolveSubmitFailure("faktur", {
      error: "Invalid input",
      details: { fieldErrors: { rate: ["Rate is required for foreign currency"] } },
    });
    expect(hasil.field).toBe("rate");
    expect(hasil.section).toBe("lanjutan");
    expect(hasil.message).toBe("Kurs wajib diisi.");
  });

  it("tidak membuka apa pun ketika yang gagal isian inti", () => {
    const hasil = resolveSubmitFailure("kontrak", {
      details: { fieldErrors: { contractNo: ["Contract number is required"] } },
    });
    expect(hasil.field).toBe("contractNo");
    expect(hasil.section).toBe("inti");
    expect(hasil.message).toBe("Nomor kontrak wajib diisi.");
  });

  it("memakai catatan kas yang terlipat sebagai contoh field lanjutan", () => {
    const hasil = resolveSubmitFailure("kas", {
      details: { fieldErrors: { note: ["String must contain at most 500 character(s)"] } },
    });
    expect(hasil.section).toBe("lanjutan");
    expect(hasil.message).toContain("Catatan");
  });

  it("memanusiakan galat tingkat formulir tanpa menunjuk field", () => {
    const hasil = resolveSubmitFailure("kas", {
      details: { formErrors: ["Either debit or credit must be greater than 0"] },
    });
    expect(hasil.field).toBeNull();
    expect(hasil.section).toBeNull();
    expect(hasil.message).toBe(
      "Isi salah satu: Uang Masuk atau Uang Keluar. Salah satunya harus lebih dari 0."
    );
  });

  it("meneruskan pesan 422 mesin jurnal apa adanya (sudah berbahasa manusia)", () => {
    const pesan =
      "Periode Maret 2026 sudah ditutup (tutup buku). Data TIDAK tersimpan agar buku besar tetap konsisten.";
    const hasil = resolveSubmitFailure("kas", { error: pesan, code: "period_closed" });
    expect(hasil.message).toBe(pesan);
    expect(hasil.field).toBeNull();
  });

  it("punya kalimat cadangan ketika API tidak menjelaskan apa pun", () => {
    expect(resolveSubmitFailure("faktur", null).message).toContain("belum bisa disimpan");
    expect(resolveSubmitFailure("faktur", {}).message).toContain("belum bisa disimpan");
    expect(resolveSubmitFailure("faktur", { error: "" }, "Gagal membuat faktur.").message).toBe(
      "Gagal membuat faktur."
    );
  });

  it("tahan terhadap bentuk body yang tidak terduga", () => {
    expect(resolveSubmitFailure("kas", "boom").message).toContain("belum bisa disimpan");
    expect(resolveSubmitFailure("kas", { details: "nope" }).message).toContain("belum bisa disimpan");
    expect(resolveSubmitFailure("kas", { details: { fieldErrors: null } }).message).toContain(
      "belum bisa disimpan"
    );
  });
});
