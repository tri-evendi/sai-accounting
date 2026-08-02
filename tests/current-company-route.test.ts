/**
 * DUA TAB, DUA PERUSAHAAN — kegagalan yang issue #157 hapus, dibuktikan di
 * tempat kegagalannya benar-benar terjadi: `currentCompany()`.
 *
 * ══ KEADAAN LAMA, DITIRUKAN LEBIH DULU ═════════════════════════════════════
 * Sebelum issue ini, satu-satunya jawaban selain konteks ALS adalah SESI. Cookie
 * sesi dibagi seluruh tab, jadi urutannya begini: tab A membuka buku PT A; tab B
 * berganti ke PT B dan menulis ulang cookie-nya; tab A — yang masih memperlihatkan
 * PT A di layar — menjalankan query berikutnya dan mendapat PT B. Tidak ada galat.
 * Tes pertama di bawah MENIRUKAN keadaan itu: tanpa konteks jalur, jawabannya
 * memang perusahaan di sesi, siapa pun yang sedang tampil di layar.
 *
 * ══ APA YANG BERUBAH ═══════════════════════════════════════════════════════
 * Penjaga halaman kini menuliskan perusahaan DARI JALUR ke penyimpan yang
 * lingkupnya satu permintaan, dan `currentCompany()` membacanya SEBELUM sesi.
 * Sejak itu, halaman `/t/acme/cv-maju/…` menjalankan querynya di buku CV Maju
 * walaupun cookie di tab sebelah sudah berpindah ke PT lain.
 *
 * Kenapa penyimpan itu perlu padahal penjaga juga memanggil `enterCompanyContext`:
 * `company-context.ts` menyebut rambatan `enterWith` sebagai JALAN PINTAS, bukan
 * jaminan. Di jalur yang rambatannya gagal, tanpa penyimpan ini `currentCompany()`
 * akan jatuh ke sesi — yaitu tepat kembali ke kegagalan lama.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** PT yang tersimpan di COOKIE — "yang terakhir dibuka", mungkin dari tab lain. */
const SESSION_COMPANY = {
  companyId: 99,
  slug: "pt-tab-sebelah",
  name: "PT Tab Sebelah",
  databaseName: "sai_t1_pt-tab-sebelah",
  isActive: true,
};

/** PT yang ada di JALUR tab ini — yang namanya sedang tercetak di layar. */
const ROUTE_COMPANY = {
  companyId: 11,
  slug: "cv-maju",
  databaseName: "sai_t1_cv-maju",
};

const auth = vi.hoisted(() => vi.fn());
const getCompany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/company-registry", () => ({ getCompany }));

/*
 * `cache()` React hanya mengingat DI DALAM lingkup permintaan; di luar render
 * ia menjalankan fungsinya lagi setiap kali. Berkas tes ini bukan permintaan,
 * jadi tanpa tiruan di bawah penyimpan per-permintaan tidak akan pernah
 * mengingat apa pun dan tes ini hanya akan menguji ketiadaan.
 *
 * Tiruannya SETIA pada sifat yang diandalkan kode: satu berkas tes = satu
 * permintaan, jadi `cache()` di sini mengingat sekali dan seterusnya. Yang
 * TIDAK ditiru — pemisahan antar-permintaan — tidak diuji di sini karena ia
 * sifat React, bukan sifat kode ini.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      let memo: R;
      let filled = false;
      return (...args: A): R => {
        if (!filled) {
          memo = fn(...args);
          filled = true;
        }
        return memo;
      };
    },
  };
});

import { runWithoutCompany } from "@/lib/company-context";
import { currentCompany, setRouteCompany } from "@/lib/current-company";

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "5", companyId: SESSION_COMPANY.companyId } });
  getCompany.mockResolvedValue(SESSION_COMPANY);
});

describe("dua tab, dua perusahaan", () => {
  it("KEADAAN LAMA: tanpa jalur, query mengikuti cookie — termasuk yang ditulis tab lain", async () => {
    const answer = await runWithoutCompany(() => currentCompany());
    expect(answer.companyId).toBe(SESSION_COMPANY.companyId);
  });

  it("SEKARANG: jalur menang atas cookie, jadi tiap tab menulis ke bukunya sendiri", async () => {
    const answer = await runWithoutCompany(async () => {
      setRouteCompany(ROUTE_COMPANY);
      return currentCompany();
    });

    expect(answer).toEqual(ROUTE_COMPANY);
    // Sesi tidak dibaca sama sekali begitu jalurnya menjawab — bukan sekadar
    // "dikalahkan": jawaban yang tidak pernah diminta tidak bisa bocor.
    expect(auth).not.toHaveBeenCalled();
  });

  it("konteks ALS tetap menang atas jalur — skrip yang membungkus dirinya tidak bisa dibajak", async () => {
    /*
     * `runWithCompany(PT_A)` di pekerjaan latar adalah pernyataan paling
     * eksplisit yang bisa dibuat kode tentang buku mana yang sedang dikerjakan.
     * Nilai dari jalur tidak boleh menggesernya; urutannya sengaja tetap
     * ALS → jalur → sesi. (Konteks bawaan berkas tes ini berasal dari
     * tests/setup-company-context.ts.)
     */
    setRouteCompany(ROUTE_COMPANY);
    const answer = await currentCompany();
    expect(answer.slug).toBe("pt-tes");
  });
});
