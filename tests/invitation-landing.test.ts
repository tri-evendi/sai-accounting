/**
 * Ke mana orang yang BARU DIUNDANG mendarat sesudah masuk.
 *
 * ══ MASALAHNYA ═════════════════════════════════════════════════════════════
 * Seseorang yang diundang ke sebuah PT menerima undangannya, lalu — sampai
 * perbaikan ini — ditautkan ke `/login` telanjang. Sesudah masuk,
 * `resolvePostLoginPath` mengantarnya ke `/platform`: panel AKUN, berisi
 * langganan, kuota, dan daftar PT untuk akun yang BUKAN miliknya. Tiga layar
 * sesudah menerima undangan, dan yang di tengah tidak menjawab satu pun
 * pertanyaan yang ia bawa — ia datang untuk membukukan, bukan mengurus akun.
 *
 * Yang dikunci di sini adalah janji perilakunya, di tingkat aturan tujuan
 * (fungsi MURNI, tanpa basis data): `callbackUrl` ke jalur perusahaan
 * DIHORMATI — baik ketika sesi sudah membawa perusahaan (anggota satu PT)
 * maupun ketika belum (diundang ke PT kedua, jadi pemilihannya tertunda).
 *
 * Kalau suatu hari `/platform` dijadikan gerbang yang menelan semua tujuan,
 * tes ini merah — dan itu memang harus merah: tautan dalam dari surel adalah
 * hal pertama yang mati ketika sebuah pendaratan menjadi gerbang.
 */
import { describe, expect, it } from "vitest";

import { POST_LOGIN_PATH, resolvePostLoginPath } from "@/lib/post-login";
import { tenantPath } from "@/lib/tenant-routes";

const BOOKS = tenantPath("acme", "pusat", "/dashboard");

describe("pendaratan orang yang baru diundang", () => {
  it("dengan satu PT di sesi: callbackUrl perusahaan menang atas /platform", () => {
    expect(
      resolvePostLoginPath(
        false,
        { companyId: 9, tenantSlug: "acme", companySlug: "pusat" },
        BOOKS
      )
    ).toBe(BOOKS);
  });

  it("tanpa PT di sesi (diundang ke PT kedua): tetap dihormati", () => {
    /* Konteks perusahaan datang dari URL sejak #157/#158, jadi jalur bertenant
     * tetap bisa dibuka walau sesi belum memilih perusahaan. */
    expect(resolvePostLoginPath(false, { companyId: null }, BOOKS)).toBe(BOOKS);
  });

  it("tanpa callbackUrl: pendaratannya tetap /platform (tidak ada yang berubah)", () => {
    expect(
      resolvePostLoginPath(false, { companyId: 9, tenantSlug: "acme", companySlug: "pusat" }, null)
    ).toBe(POST_LOGIN_PATH);
  });

  it("wajib ganti kata sandi tetap menang atas tujuan mana pun", () => {
    /* Undangan tidak boleh menjadi jalan memutar sekitar kewajiban ganti kata
     * sandi — urutannya diputuskan di satu tempat, dan di sinilah ia dikunci. */
    expect(
      resolvePostLoginPath(
        true,
        { companyId: 9, tenantSlug: "acme", companySlug: "pusat" },
        BOOKS
      )
    ).toBe("/change-password");
  });

  it("tujuan absolut ke luar TIDAK diikuti", () => {
    // `callbackUrl` datang dari parameter kueri; ia tidak pernah boleh menjadi
    // pengalihan terbuka.
    expect(
      resolvePostLoginPath(
        false,
        { companyId: 9, tenantSlug: "acme", companySlug: "pusat" },
        "https://jahat.example.com/"
      )
    ).toBe(POST_LOGIN_PATH);
    expect(
      resolvePostLoginPath(false, { companyId: 9, tenantSlug: "acme", companySlug: "pusat" }, "//jahat.example.com")
    ).toBe(POST_LOGIN_PATH);
  });
});
