/**
 * DUA TAB, DUA PERUSAHAAN — kegagalan yang issue #157 hapus dan #158 tutup,
 * dibuktikan di tempat kegagalannya benar-benar terjadi: `currentCompany()`.
 *
 * ══ KEADAAN LAMA ═══════════════════════════════════════════════════════════
 * Sampai #158, jawaban terakhir `currentCompany()` adalah SESI. Cookie sesi
 * dibagi seluruh tab, jadi urutannya begini: tab A membuka buku PT A; tab B
 * berganti ke PT B dan menulis ulang cookie-nya; tab A — yang masih
 * memperlihatkan PT A di layar — menjalankan query berikutnya dan mendapat
 * PT B. Tidak ada galat, tidak ada jejak.
 *
 * ══ APA YANG BERUBAH ═══════════════════════════════════════════════════════
 * Penjaga menuliskan perusahaan DARI PERMINTAAN ke penyimpan yang lingkupnya
 * satu permintaan, dan sejak #158 sesi TIDAK LAGI menjadi jawaban cadangan sama
 * sekali. Permintaan tanpa konteks tidak jatuh ke perusahaan mana pun — ia
 * MELEMPAR. Tes pertama di bawah mengunci justru itu: bukan "jawabannya benar",
 * melainkan "tidak ada jawaban yang bisa diarang".
 *
 * Kenapa penyimpan itu perlu padahal penjaga juga memanggil `enterCompanyContext`:
 * `company-context.ts` menyebut rambatan `enterWith` sebagai JALAN PINTAS, bukan
 * jaminan. Sabuk kedua ini yang membuat kegagalan rambatan berbunyi keras
 * alih-alih diam-diam menjawab dengan perusahaan lain.
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
  it("tanpa konteks apa pun: MELEMPAR — sesi tidak lagi punya suara (issue #158)", async () => {
    /*
     * Inilah hadiah sesungguhnya dari Fase 2. Selama sesi masih menjawab di
     * sini, setiap jalur yang lupa membawa perusahaannya TETAP BEKERJA — dengan
     * PT yang kebetulan terakhir dibuka di tab mana pun — dan bekerja dengan
     * diam adalah cara kesalahan ini bertahan hidup. Sekarang tidak ada
     * perusahaan bawaan untuk didarati, jadi tidak bisa ada pendaratan yang
     * salah.
     */
    await expect(runWithoutCompany(() => currentCompany())).rejects.toThrow(
      /Konteks perusahaan tidak ada/
    );
    // Dan sesi tidak sempat dibaca sama sekali: jawaban yang tidak pernah
    // diminta tidak bisa bocor.
    expect(auth).not.toHaveBeenCalled();
  });

  it("SEKARANG: jalur menang atas cookie, jadi tiap tab menulis ke bukunya sendiri", async () => {
    const answer = await runWithoutCompany(async () => {
      setRouteCompany(ROUTE_COMPANY);
      return currentCompany();
    });

    expect(answer).toEqual(ROUTE_COMPANY);
    // Sesi tidak dibaca sama sekali — dan sejak #158 tidak ada lagi kode yang
    // bisa membacanya dari sini.
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
