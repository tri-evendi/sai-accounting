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
 * konteks yang ditanam `enterWith` SESUDAH sebuah `await` tidak merambat ke
 * pemanggil, dan penjaga selalu membaca basis data kendali lebih dulu (diukur
 * di #333; lihat kepala `company-context.ts`). Penyimpan per-permintaan inilah
 * yang benar-benar membawa konteks sampai ke query — di route handler maupun
 * di render.
 *
 * ══ KENAPA `next/headers` DITIRU, DAN APA YANG DITIRU ══════════════════════
 * Sampai #333 berkas ini menukar `cache()` React dengan memoizer yang
 * benar-benar mengingat — dan dengan begitu menguji sebuah fiksi: di runtime,
 * `cache()` di LUAR render tidak memoisasi sama sekali, jadi penyimpan yang
 * diuji "bekerja" di sini justru tidak pernah bekerja untuk satu pun route
 * handler. Tiruannya sekarang jatuh pada tempat yang benar: jangkar
 * per-permintaan milik Next. Sifat yang ditirukan DIUKUR di route handler dan
 * render Next 16.2.1 yang sungguhan — dua panggilan `headers()` dalam satu
 * permintaan mengembalikan objek yang IDENTIK, permintaan lain mendapat objek
 * lain. Pemisahan antar-permintaan karena itu ikut diuji di sini (tes
 * terakhir), bukan diandaikan.
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

/** PT di tab SEBELAH, yang permintaannya berjalan bersamaan. */
const OTHER_COMPANY = {
  companyId: 12,
  slug: "pt-sejahtera",
  databaseName: "sai_t1_pt-sejahtera",
};

const auth = vi.hoisted(() => vi.fn());
const getCompany = vi.hoisted(() => vi.fn());
const headersFn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/company-registry", () => ({ getCompany }));
vi.mock("next/headers", () => ({ headers: headersFn }));

import { runWithoutCompany } from "@/lib/company-context";
import { currentCompany, setRouteCompany } from "@/lib/current-company";

/** Mulai sebuah permintaan baru: satu objek header, dipakai seterusnya. */
function beginRequest(): void {
  const requestHeaders = { get: () => null };
  headersFn.mockResolvedValue(requestHeaders);
}

/** Tidak ada permintaan sama sekali — skrip, cron, tes unit. */
function outsideAnyRequest(): void {
  headersFn.mockRejectedValue(new Error("headers() dipanggil di luar permintaan"));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "5", companyId: SESSION_COMPANY.companyId } });
  getCompany.mockResolvedValue(SESSION_COMPANY);
  beginRequest();
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

  it("di LUAR permintaan mana pun juga MELEMPAR — tidak ada perusahaan untuk ditebak", async () => {
    /*
     * `headers()` melempar di skrip, cron, dan seed. Itu bukan kegagalan
     * melainkan jawaban: di sana memang tidak ada permintaan yang bisa membawa
     * lingkup, dan pemanggilnya wajib menyebut perusahaannya sendiri lewat
     * `runWithCompany()`.
     */
    outsideAnyRequest();
    await expect(runWithoutCompany(() => currentCompany())).rejects.toThrow(
      /Konteks perusahaan tidak ada/
    );
  });

  it("SEKARANG: jalur menang atas cookie, jadi tiap tab menulis ke bukunya sendiri", async () => {
    const answer = await runWithoutCompany(async () => {
      await setRouteCompany(ROUTE_COMPANY);
      return currentCompany();
    });

    expect(answer).toEqual(ROUTE_COMPANY);
    // Sesi tidak dibaca sama sekali — dan sejak #158 tidak ada lagi kode yang
    // bisa membacanya dari sini.
    expect(auth).not.toHaveBeenCalled();
  });

  it("penyimpannya PER-PERMINTAAN: permintaan berikutnya tidak mewarisi yang sebelumnya", async () => {
    /*
     * Sifat yang membuat penyimpan ini boleh ada sama sekali. Kalau ia tingkat
     * modul, dua permintaan yang dilayani proses yang sama akan saling
     * mewarisi — dan itu persis "buku PT A ditulisi PT B" yang seluruh #104
     * dibangun untuk mencegah.
     */
    const first = await runWithoutCompany(async () => {
      await setRouteCompany(ROUTE_COMPANY);
      return currentCompany();
    });
    expect(first).toEqual(ROUTE_COMPANY);

    beginRequest(); // permintaan BARU: jangkar baru, penyimpan baru
    await expect(runWithoutCompany(() => currentCompany())).rejects.toThrow(
      /Konteks perusahaan tidak ada/
    );

    await runWithoutCompany(() => setRouteCompany(OTHER_COMPANY));
    await expect(runWithoutCompany(() => currentCompany())).resolves.toEqual(OTHER_COMPANY);
  });

  it("konteks ALS tetap menang atas jalur — skrip yang membungkus dirinya tidak bisa dibajak", async () => {
    /*
     * `runWithCompany(PT_A)` di pekerjaan latar adalah pernyataan paling
     * eksplisit yang bisa dibuat kode tentang buku mana yang sedang dikerjakan.
     * Nilai dari jalur tidak boleh menggesernya; urutannya sengaja tetap
     * ALS → jalur. (Konteks bawaan berkas tes ini berasal dari
     * tests/setup-company-context.ts.)
     */
    await setRouteCompany(ROUTE_COMPANY);
    const answer = await currentCompany();
    expect(answer.slug).toBe("pt-tes");
  });
});
