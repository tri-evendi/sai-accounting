/**
 * KLASIFIKASI BUKU — aturannya diuji sebagai FUNGSI MURNI.
 *
 * Seluruh guna modul ini adalah ALASAN yang bisa dipercaya: ia dipakai untuk
 * memutuskan temuan kesesuaian mana yang tentang data sungguhan, dan kelak
 * mungkin untuk memutuskan buku mana yang boleh dirapikan. Aturan yang
 * memberikan label benar dengan alasan yang salah tidak lebih baik daripada
 * tidak punya aturan — pembacanya akan mempercayai alasannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REAL_DATA_THRESHOLD,
  SEED_DOCUMENT_COUNT,
  classifyBook,
  summarizeBooks,
  type BookEvidence,
} from "@/lib/book-classification";

const bukti = (over: Partial<BookEvidence> = {}): BookEvidence => ({
  databaseName: "sai_contoh",
  realCustomers: 0,
  realContracts: 0,
  sampleJournals: 0,
  otherJournals: 0,
  reversalJournals: 0,
  daysSinceActivity: null,
  ...over,
});

describe("NAMA tidak pernah menjadi bukti", () => {
  it("nama berpola uji tetap `produksi` bila datanya nyata", () => {
    /*
     * Inti modul ini. `sai_t11_data_dummy` terdengar seperti uji, tetapi kalau
     * suatu hari ia berisi 66 pelanggan sungguhan, ia buku produksi — dan
     * keliru ke arah SEBALIKNYA (memperlakukan buku nyata sebagai uji) adalah
     * kekeliruan yang mahal.
     */
    const v = classifyBook(bukti({ databaseName: "sai_t11_data_dummy", realCustomers: 66 }));
    expect(v.klass).toBe("produksi");
    expect(v.conformanceRelevant).toBe(true);
  });

  it("nama yang terdengar sungguhan tetap `kosong` bila bukunya kosong", () => {
    const v = classifyBook(bukti({ databaseName: "sai_t5_pt_rio_alexander_silaban" }));
    expect(v.klass).toBe("kosong");
  });

  it("tak satu pun alasannya menyebut nama basis datanya", () => {
    /* Alasan yang menyebut nama akan membuat pembacanya menyangka nama ikut
       menjadi dasar. Ia tidak, dan tidak boleh terlihat begitu. */
    for (const e of [
      bukti({ databaseName: "sai_t2_demo", sampleJournals: 16, otherJournals: 13 }),
      bukti({ databaseName: "sai_t4_selamat" }),
      bukti({ databaseName: "sai_production", realCustomers: 66, realContracts: 609 }),
    ]) {
      expect(classifyBook(e).reason).not.toContain(e.databaseName);
    }
  });
});

describe("`produksi` — data nyata mengalahkan tanda lain", () => {
  it("66 pelanggan + 609 kontrak nyata (keadaan `sai_production`)", () => {
    const v = classifyBook(bukti({ realCustomers: 66, realContracts: 609, otherJournals: 5 }));
    expect(v.klass).toBe("produksi");
    expect(v.reason).toContain("66 pelanggan");
    expect(v.reason).toContain("609 kontrak");
  });

  it("menang walau bukunya juga menyimpan sisa semai", () => {
    /* Keliru ke arah "ini buku nyata" jauh lebih murah daripada sebaliknya. */
    const v = classifyBook(
      bukti({ realCustomers: 40, sampleJournals: 16, reversalJournals: 28 })
    );
    expect(v.klass).toBe("produksi");
  });

  it("tepat DI ambang belum `produksi` — hanya yang melebihinya", () => {
    expect(classifyBook(bukti({ realCustomers: REAL_DATA_THRESHOLD })).klass).not.toBe("produksi");
    expect(classifyBook(bukti({ realCustomers: REAL_DATA_THRESHOLD + 1 })).klass).toBe("produksi");
  });
});

describe("`kosong` — nol jurnal", () => {
  it("dibuat, tidak pernah dipakai", () => {
    const v = classifyBook(bukti({ daysSinceActivity: 53 }));
    expect(v.klass).toBe("kosong");
    expect(v.conformanceRelevant).toBe(false);
  });
});

describe("`semai-dibersihkan` — pembalikan sebanyak bentuk semai", () => {
  it("28 pembalikan = data contoh disemai lalu dibersihkan", () => {
    const v = classifyBook(bukti({ sampleJournals: 16, otherJournals: 44, reversalJournals: 28 }));
    expect(v.klass).toBe("semai-dibersihkan");
    expect(v.reason).toContain("dibersihkan");
  });

  it("diperiksa SEBELUM `semai-saja` — jejak sengaja dibereskan tidak boleh hilang", () => {
    /* Buku yang semainya sudah dibersihkan punya cerita yang berbeda dari buku
       yang semainya masih utuh; menyatukannya menghapus petunjuk bahwa
       seseorang pernah membereskannya dengan sengaja. */
    const v = classifyBook(bukti({ sampleJournals: 16, otherJournals: 13, reversalJournals: 29 }));
    expect(v.klass).toBe("semai-dibersihkan");
  });

  it("toleransi 2: 26 pembalikan masih dihitung sebentuk semai", () => {
    expect(
      classifyBook(bukti({ sampleJournals: 16, otherJournals: 40, reversalJournals: SEED_DOCUMENT_COUNT - 2 })).klass
    ).toBe("semai-dibersihkan");
  });
});

describe("`semai-saja` vs `nyaris-kosong` — pembedanya TANDA, bukan jumlah", () => {
  it("ada tanda `[CONTOH]` → `semai-saja`", () => {
    const v = classifyBook(bukti({ sampleJournals: 16, otherJournals: 12 }));
    expect(v.klass).toBe("semai-saja");
    expect(v.reason).toContain("bertanda [CONTOH]");
  });

  it("NOL tanda `[CONTOH]` → `nyaris-kosong`, dan alasannya TIDAK menyebut semai", () => {
    /*
     * ══ CACAT YANG DITEMUKAN SAAT MENJALANKANNYA DI PRODUKSI ══════════════
     * Versi pertama aturan ini memakai `totalJurnal <= SEED + 2` untuk
     * keduanya, jadi buku dengan 5 jurnal yang NOL bertanda `[CONTOH]`
     * dilaporkan "≈ bentuk semai" — alasan yang TIDAK BENAR tentang buku yang
     * isinya justru diketik orang.
     *
     * Label yang benar dengan alasan yang salah tidak lebih baik daripada
     * tidak punya aturan: pembacanya akan mempercayai alasannya.
     */
    const v = classifyBook(bukti({ otherJournals: 5, realCustomers: 3 }));
    expect(v.klass).toBe("nyaris-kosong");
    expect(v.reason).toContain("NOL bertanda [CONTOH]");
    expect(v.reason).not.toContain("bentuk semai");
    expect(v.reason).toContain("diketik orang");
  });

  it("keduanya tidak relevan bagi laporan kesesuaian", () => {
    expect(classifyBook(bukti({ sampleJournals: 16, otherJournals: 12 })).conformanceRelevant).toBe(false);
    expect(classifyBook(bukti({ otherJournals: 5 })).conformanceRelevant).toBe(false);
  });
});

describe("`dipakai-ringan` — aktivitas di luar semai", () => {
  it("37 jurnal, 21 di luar semai (keadaan `sai_t1_uji_wisaya_416`)", () => {
    const v = classifyBook(
      bukti({ sampleJournals: 16, otherJournals: 21, realCustomers: 1, daysSinceActivity: 51 })
    );
    expect(v.klass).toBe("dipakai-ringan");
    expect(v.conformanceRelevant).toBe(true);
    expect(v.reason).toContain("51 hari lalu");
  });

  it("namanya berpola uji, tetapi aktivitasnya nyata — dan aturannya tidak menebak", () => {
    /* Apakah buku ini PANTAS dianggap uji adalah keputusan PEMILIK. Aturan ini
       hanya melaporkan bahwa ada aktivitas di luar semai. */
    const v = classifyBook(
      bukti({ databaseName: "sai_t1_uji_wisaya_416", sampleJournals: 16, otherJournals: 21 })
    );
    expect(v.klass).toBe("dipakai-ringan");
  });
});

describe("ringkasan seluruh instans", () => {
  it("menghitung per kelas dan menyebut buku yang relevan", () => {
    const verdicts = [
      classifyBook(bukti({ databaseName: "a", realCustomers: 66 })),
      classifyBook(bukti({ databaseName: "b" })),
      classifyBook(bukti({ databaseName: "c", sampleJournals: 16, otherJournals: 21 })),
    ];
    const r = summarizeBooks(verdicts);
    expect(r.total).toBe(3);
    expect(r.perKlass.get("produksi")).toBe(1);
    expect(r.perKlass.get("kosong")).toBe(1);
    expect(r.relevan).toEqual(["a", "c"]);
  });
});

describe("skripnya HANYA MEMBACA, dan tidak menyarankan penghapusan", () => {
  const SKRIP = readFileSync(join(process.cwd(), "scripts/classify-books.ts"), "utf8");

  it("tidak memuat satu pun pernyataan yang mengubah data", () => {
    for (const kata of ["UPDATE ", "DELETE ", "INSERT ", "DROP ", "TRUNCATE "]) {
      expect(SKRIP.toUpperCase()).not.toContain(kata);
    }
    for (const op of [".create(", ".update(", ".delete(", ".deleteMany(", ".upsert("]) {
      expect(SKRIP, `skrip klasifikasi tidak boleh ${op}`).not.toContain(op);
    }
  });

  it("memakai aturan dari modul, bukan menulis aturannya sendiri", () => {
    expect(SKRIP).toContain("classifyBook");
    expect(SKRIP).toContain("book-classification");
  });

  it("modulnya MURNI — tanpa impor apa pun", () => {
    const modul = readFileSync(join(process.cwd(), "src/lib/book-classification.ts"), "utf8");
    expect(modul.match(/^\s*import\b.*$/gm) ?? []).toHaveLength(0);
  });
});
