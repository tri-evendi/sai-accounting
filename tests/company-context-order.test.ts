/**
 * URUTAN SABUK KONTEKS PERUSAHAAN (issue #336).
 *
 * == Yang dijaga berkas ini ================================================
 * Bukan "konteksnya sampai" — itu tugas `tests/route-handler-company-context.ts`
 * (#333). Yang dijaga di sini adalah dari mana ALS boleh terisi, dan bahwa
 * kedua sabuk tetap menjawab benar di wilayahnya masing-masing.
 *
 * == Risiko yang dilaporkan #336 ===========================================
 * `runWithCompany()` menanam store ALS yang SAH dan memang harus menang untuk
 * skrip, cron, seed, dan tes. Kekhawatiran #336: begitu sesuatu yang berjalan
 * di dalamnya menyentuh jalur permintaan, konteks BASI bisa mengalahkan konteks
 * yang benar untuk permintaan itu — transaksi PT B tertulis ke buku PT A, tanpa
 * galat dan tanpa jejak.
 *
 * == USUL MEMBALIK URUTAN DICOBA, LALU DITOLAK =============================
 * #336 mengusulkan membalik urutannya (jalur dulu) supaya ALS basi tidak bisa
 * mengalahkan permintaan. Dicoba — dan ia MEMATAHKAN jaminan yang disengaja di
 * `tests/current-company-route.test.ts`: *"konteks ALS tetap menang atas jalur
 * — skrip yang membungkus dirinya tidak bisa dibajak"*.
 *
 * Sebabnya mendasar, bukan detail: "ALS basi mengalahkan permintaan" dan
 * "skrip yang membungkus dirinya lalu menyentuh jalur permintaan" adalah
 * konfigurasi yang SAMA PERSIS — kedua penyimpan terisi — dengan jawaban benar
 * yang berlawanan. Urutan tidak bisa membedakan keduanya; membaliknya hanya
 * menukar satu cacat dengan cacat lain.
 *
 * Yang benar-benar menutup risiko #336 karena itu SUMBERNYA, bukan urutannya:
 * sesudah `enterCompanyContext()` dicabut dari `company-route.ts`, satu-satunya
 * yang mengisi ALS adalah `runWithCompany()` — selalu pernyataan yang
 * disengaja, tidak pernah sisa yang basi.
 *
 * Berkas ini karena itu menjaga DUA hal: penjaga jalur berhenti menanam ALS,
 * dan kedua sabuk tetap menjawab benar di wilayahnya masing-masing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

/*
 * `headers()` dipalsukan menjadi jangkar yang STABIL per "permintaan": itulah
 * yang dipakai `requestHolder` untuk menemukan penyimpannya, dan itu pula yang
 * membedakan "ada permintaan" dari "tidak ada". Di luar `withRequest()` ia
 * MELEMPAR — persis seperti di skrip dan cron sungguhan.
 */
let anchor: object | null = null;
vi.mock("next/headers", () => ({
  headers: async () => {
    if (!anchor) throw new Error("headers() di luar lingkup permintaan");
    return anchor;
  },
}));

const { currentCompany, setRouteCompany } = await import("@/lib/current-company");
const { runWithCompany, runWithoutCompany, MissingCompanyContextError } = await import(
  "@/lib/company-context"
);

const PT_A = { companyId: 1, slug: "pt-a", databaseName: "sai_pt_a" };
const PT_B = { companyId: 2, slug: "pt-b", databaseName: "sai_pt_b" };

/** Menjalankan `fn` seolah di dalam satu permintaan HTTP dengan jangkar sendiri. */
async function withRequest<T>(fn: () => Promise<T>): Promise<T> {
  anchor = { request: Symbol("headers") };
  try {
    return await fn();
  } finally {
    anchor = null;
  }
}

beforeEach(() => {
  anchor = null;
});

describe("di dalam permintaan", () => {
  /*
   * Jaminan "runWithCompany yang membungkus tetap menang" TIDAK diulang di
   * sini — ia sudah dijaga `tests/current-company-route.test.ts`, dan tes yang
   * menegaskan hal yang sama di dua tempat adalah dua tempat yang bisa
   * berselisih. Yang disebut di kepala berkas ini hanyalah ALASAN kenapa ia
   * dipertahankan.
   */
  it("tanpa ALS sama sekali, permintaan terjawab penyimpan jalurnya", async () => {
    const landed = await runWithoutCompany(() =>
      withRequest(async () => {
        await setRouteCompany(PT_B);
        return currentCompany();
      })
    );
    expect(landed.companyId).toBe(PT_B.companyId);
  });
});

describe("di luar permintaan: runWithCompany tetap menang", () => {
  it("skrip/cron terjawab oleh ALS-nya sendiri", async () => {
    /*
     * Rambu #336: jangan menyentuh `runWithCompany()`. Ia yang melayani skrip,
     * cron, seed, dan tes — dan di sana `headers()` memang melempar, jadi tidak
     * ada penyimpan permintaan yang bisa menang atasnya.
     */
    const landed = await runWithCompany(PT_A, () => currentCompany());
    expect(landed.companyId).toBe(PT_A.companyId);
  });

  it("tanpa keduanya, MELEMPAR — bukan menebak perusahaan", async () => {
    await expect(runWithoutCompany(() => currentCompany())).rejects.toBeInstanceOf(
      MissingCompanyContextError
    );
  });
});

describe("penjaga jalur tidak lagi menanam ALS", () => {
  it("`enterCompanyContext` sudah tidak dipanggil company-route.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "src", "lib", "company-route.ts"), "utf8");

    /* Ia beban mati sejak #333 (`enterWith` sesudah `await` tidak merambat).
       Sebuah baris yang TAMPAK bekerja padahal tidak adalah bentuk yang membuat
       #333 hidup delapan bulan tanpa terlihat. */
    expect(src).not.toMatch(/^\s*enterCompanyContext\(/m);
    /* Dan penyimpan per-permintaan — sabuk yang benar-benar bekerja — tetap. */
    expect(src).toMatch(/await setRouteCompany\(context\)/);
  });
});
