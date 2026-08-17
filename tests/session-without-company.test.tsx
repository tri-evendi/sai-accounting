/**
 * PT YANG BARU LAHIR HARUS LANGSUNG DIPILIH SESI (issue #339).
 *
 * ══ Bug yang dijaga di sini, apa adanya ════════════════════════════════════
 * Pendaftar baru di produksi menempuh alur paling wajar yang ada — daftar →
 * masuk → buat perusahaan pertama — dan berakhir di layar "Memuat sesi…" yang
 * tidak pernah selesai, tanpa satu pun galat. Sesinya: `role: null`,
 * `companyId: null`, `companyCount: 1`. Datanya SEHAT; yang tertinggal hanya
 * token JWT-nya, sebab pemilihan otomatis cuma terjadi saat MASUK (`authorize`
 * di `lib/auth.ts`) dan ia masuk ketika perusahaannya masih nol.
 *
 * ══ Kenapa berkas ini hanya menjaga SEPARUH ════════════════════════════════
 * Bug ini punya dua sisi, dan keduanya diperbaiki terpisah:
 *
 *   • **Gejalanya** — pemuat yang mengunci penambalnya sendiri — sudah ditutup
 *     di `develop` oleh `4c1424b` (14 Agu 2026), yang merender `children`
 *     tersembunyi di rute berperusahaan supaya `CompanySessionSync` terpasang
 *     dan token tertambal sendiri. Cabang ini semula membawa perbaikan gejala
 *     versinya sendiri (pantulan ke `/select-company`); versi `develop` lebih
 *     baru dan menyembuhkan di tempat, jadi versi itulah yang dipakai dan tes
 *     pantulannya dibuang bersamanya. Yang menjaga perilaku itu sekarang ada
 *     di berkas tes milik commit tersebut, bukan di sini.
 *
 *   • **Akarnya** — tidak ada satu pun jalur yang MEMILIHKAN perusahaan yang
 *     baru dibuat — belum tersentuh di `develop`, dan itulah yang dijaga di
 *     bawah ini. Selama akarnya terbuka, penyembuhan-sendiri milik `4c1424b`
 *     tetap harus bekerja pada setiap pendaftar baru; menutup akarnya membuat
 *     keadaan itu tidak pernah terjadi sejak awal.
 *
 * Keputusan pemilihannya (`lib/company-selection.ts`) MURNI, jadi ia diuji
 * sebagai fungsi — tanpa DOM, tanpa React, tanpa Prisma. Dua pemakainya
 * (formulir dan aliran penyediaan) dijaga lewat pembacaan sumber: lebih lemah
 * daripada menjalankannya, dan ditulis apa adanya supaya tidak ada yang
 * membaca hijau lalu menyangka alirannya sudah pernah dijalankan sungguhan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { companyToAdoptAfterCreate } from "@/lib/company-selection";

const SRC = join(__dirname, "..", "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("perusahaan yang baru lahir: dipilih hanya bila belum ada", () => {
  it("pendaftar baru (belum ada yang dipilih) mengambil PT yang barusan dibuat", () => {
    expect(companyToAdoptAfterCreate(null, 3)).toBe(3);
    expect(companyToAdoptAfterCreate(undefined, 3)).toBe(3);
  });

  it("yang sedang bekerja di PT A lalu membuat PT B TIDAK dipindahkan bukunya", () => {
    /*
     * Kelas kesalahan termahal di aplikasi ini: berpindah buku tanpa diminta
     * tidak berbunyi saat terjadi, dan muncul berbulan-bulan kemudian sebagai
     * neraca yang tidak cocok.
     */
    expect(companyToAdoptAfterCreate(1, 2)).toBeNull();
  });

  it("aliran tanpa id (server lebih tua daripada #339) bukan kegagalan — tidak ada yang diubah", () => {
    expect(companyToAdoptAfterCreate(null, undefined)).toBeNull();
  });

  it("formulir pembuatan memakai keputusan itu, bukan salinannya", () => {
    const form = read("app/(app)/(tenant)/(panel)/companies/new/company-form.tsx");
    expect(form).toMatch(/companyToAdoptAfterCreate\(session\?\.user\?\.companyId/);
    expect(form).toMatch(/update\(\{ companyId: adopt \}\)/);
  });

  it("aliran penyediaan membawa id perusahaannya di tahap `done`", () => {
    // Tanpa angka itu formulir hanya tahu slug — dan slug bukan yang diterima
    // pemeriksaan keanggotaan di `update({ companyId })`.
    expect(read("lib/company-provisioning.ts")).toMatch(
      /phase: "done"[\s\S]{0,400}?companyId,/
    );
  });
});
