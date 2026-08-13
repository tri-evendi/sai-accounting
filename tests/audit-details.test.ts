/**
 * Kolom "Rincian" jejak audit (issue #355) — tidak pernah lagi JSON mentah.
 *
 * Audit produksi 13 Agustus 2026 menemukan barisnya berbunyi
 * `{"coaCreated":0,"coaExisting":38,"journalNumb…` — potongan `JSON.stringify`
 * yang berhenti di tengah nama field. Jejak audit dibaca justru saat sedang ada
 * masalah, dan struktur data internal yang bocor ke layar pada saat itu memaksa
 * pembacanya menerjemahkan nama field sendiri, tepat ketika ia paling tidak
 * punya waktu.
 *
 * Diuji dari SUMBER: `formatDetails` tidak diekspor (ia detail komponen), dan
 * mengekspornya hanya demi tes akan menambah permukaan publik yang tak dipakai
 * siapa pun. Yang dijaga di sini adalah sifat yang mudah hilang tanpa gejala —
 * cadangan JSON yang dihidupkan kembali "sementara" oleh orang berikutnya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src", "components", "settings", "audit-log-panel.tsx"),
  "utf8"
);
/** Tanpa komentar: berkas itu MENJELASKAN kenapa `JSON.stringify` dibuang. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const dict = (lang: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "..", "src", "lib", "i18n", "dictionaries", `${lang}.json`), "utf8")
  ) as { audit: Record<string, string> };

describe("kolom Rincian tidak memuntahkan struktur data", () => {
  it("tidak ada lagi JSON.stringify sebagai cadangan", () => {
    expect(code).not.toContain("JSON.stringify");
  });

  /*
   * Cadangannya harus kalimat, bukan string kosong: sel kosong terbaca sebagai
   * "gagal memuat", yang justru kesimpulan yang salah.
   */
  it("aksi tanpa kalimat khusus menjawab dengan kalimat, bukan sel kosong", () => {
    expect(code).toContain('t("audit.unavailable")');
  });

  it("dua jejak yang dulu bocor kini punya kalimatnya sendiri", () => {
    // setup.create — sumber persis dari temuan audit.
    expect(code).toContain("d.coaCreated");
    expect(code).toContain('t("audit.setupDone"');
    // company_setting.modules.update — detailnya juga tanpa `name`/`description`.
    expect(code).toContain("d.modules");
    expect(code).toContain('t("audit.modulesUpdated"');
  });

  /*
   * `journalNumber` bisa saja tidak ada (penyiapan tanpa saldo awal). Kalimat
   * yang menyebut "saldo awal undefined" lebih buruk daripada JSON yang
   * digantikannya, jadi ada kalimat kedua tanpa nomor jurnal.
   */
  it("punya kalimat cadangan saat nomor jurnal tidak ada", () => {
    expect(code).toContain('t("audit.setupDonePlain")');
  });
});

describe("kalimatnya ada di KETIGA kamus", () => {
  for (const lang of ["id", "en", "zh"]) {
    it(`${lang} memuat keempat kunci baru`, () => {
      const audit = dict(lang).audit;
      for (const key of ["setupDone", "setupDonePlain", "modulesUpdated", "unavailable"]) {
        expect(audit[key], `${lang}.audit.${key}`).toBeTruthy();
      }
    });
  }

  /*
   * Placeholder yang salah ketik menghasilkan "{created}" tercetak apa adanya
   * di layar — kegagalan yang diam, dan justru pada kalimat yang menggantikan
   * kegagalan diam sebelumnya.
   */
  it("placeholder setupDone & modulesUpdated konsisten di ketiga bahasa", () => {
    for (const lang of ["id", "en", "zh"]) {
      const audit = dict(lang).audit;
      for (const token of ["{created}", "{existing}", "{journal}"]) {
        expect(audit.setupDone, `${lang}.audit.setupDone`).toContain(token);
      }
      expect(audit.modulesUpdated, `${lang}.audit.modulesUpdated`).toContain("{count}");
    }
  });
});
