/**
 * HALAMAN KESESUAIAN DATA di konsol operator — bentuk & kabelnya.
 *
 * ══ YANG DIUJI, DAN KENAPA LEWAT SUMBER ════════════════════════════════════
 * Halaman ini server component yang memanggil `requireOperatorPage()` dan
 * membaca basis data platform; merendernya di tes berarti memalsukan penjaga,
 * sesi operator, dan Prisma sekaligus — tiga tiruan untuk menguji satu hal.
 *
 * Yang benar-benar bisa salah di sini adalah KABELNYA: penjaga yang lupa
 * dipasang, store yang tidak dipakai, nav yang tidak menunjuk ke mana pun,
 * status yang dirender tanpa salah satu dari tiga nilainya. Keempatnya terbaca
 * dari sumber, dan penjaga yang membaca sumber tidak bisa dikelabui tiruan.
 *
 * Fungsi MURNI-nya diuji terpisah di `conformance-heartbeat.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import idDict from "../src/lib/i18n/dictionaries/id.json";
import enDict from "../src/lib/i18n/dictionaries/en.json";
import zhDict from "../src/lib/i18n/dictionaries/zh.json";

const baca = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HALAMAN_PATH = "src/app/(app)/(operator)/operator/conformance/page.tsx";
const HALAMAN = baca(HALAMAN_PATH);
const NAV = baca("src/lib/operator/nav.tsx");
const STORE = baca("src/lib/operator/store.ts");

describe("halaman ada di bidang operator, dan dijaga", () => {
  it("berkasnya ada di grup rute `(operator)`", () => {
    /* Bukan sekadar kerapian: grup rute itulah yang membuat
       `decideOperatorRouting` memperlakukannya sebagai jalur operator — di host
       pelanggan ia 404. Halaman yang lahir di luar grup itu akan terbuka di
       host yang salah. */
    expect(existsSync(join(process.cwd(), HALAMAN_PATH))).toBe(true);
  });

  it("memanggil `requireOperatorPage()` — bukan penjaga pelanggan", () => {
    expect(HALAMAN).toContain("requireOperatorPage");
    expect(HALAMAN).toMatch(/await requireOperatorPage\(\)/);
    // Penjaga pelanggan tidak boleh dipakai di sini: ia menuntut konteks
    // perusahaan, yang tidak ada di bidang operator.
    expect(HALAMAN).not.toContain("requirePagePermission");
  });

  it("`force-dynamic` — riwayat yang disajikan dari cache bukan riwayat", () => {
    expect(HALAMAN).toContain('export const dynamic = "force-dynamic"');
  });
});

describe("kabel ke data", () => {
  it("membaca lewat store, bukan Prisma langsung", () => {
    /* Store-nya yang menelan galat platform menjadi `null`; halaman yang
       memanggil Prisma sendiri akan melempar saat platform tak terjangkau —
       dan konsol operator yang tumbang karena basis data PENAGIHAN mati adalah
       pelanggaran doktrin #137. */
    expect(HALAMAN).toContain("conformanceRunsForOperator");
    expect(HALAMAN).not.toContain("platformDb");
    expect(HALAMAN).not.toContain("@sai/db/client/platform");
  });

  it("store-nya benar-benar ada, dan menelan galat jadi `null`", () => {
    expect(STORE).toContain("export async function conformanceRunsForOperator");
    expect(STORE).toContain("conformanceRun.findMany");
    const fn = STORE.slice(STORE.indexOf("export async function conformanceRunsForOperator"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("return null");
  });

  it("membedakan 'belum bisa dibaca' dari 'belum ada sapuan'", () => {
    /*
     * Dua keadaan yang menuntut kalimat berbeda: `null` = platform tak
     * terjangkau / migrasi 0018 belum diterapkan; `[]` = layanannya baru naik
     * dan belum menyapu. Menyatukannya membuat pemasangan baru terbaca seperti
     * pemasangan rusak — kesalahan yang sama yang dihindari `unknown` vs `late`
     * di putusan denyutnya.
     */
    expect(HALAMAN).toContain("runs === null");
    expect(HALAMAN).toContain("runs.length === 0");
    expect(HALAMAN).toContain("operator.conformance.unavailable");
    expect(HALAMAN).toContain("operator.conformance.empty");
  });
});

describe("KETIGA status dirender — bukan dua", () => {
  it("`ok`, `findings`, dan `error` masing-masing punya lencana & kalimat", () => {
    /*
     * Ini jaminan terpenting di berkas ini. `findings` adalah keadaan yang
     * membuat alat ini berguna; halaman yang hanya mengenal ok/error akan
     * menampilkannya sebagai KEGAGALAN (salah — pemeriksanya bekerja) atau
     * sebagai BERSIH (lebih buruk — temuannya hilang dari layar).
     */
    for (const kunci of ["statusOk", "statusFindings", "statusError"]) {
      expect(HALAMAN, `kalimat ${kunci} tidak dirender`).toContain(
        `operator.conformance.${kunci}`
      );
    }
    expect(HALAMAN).toContain('"findings"');
    /* Variannya dipilih lewat ternary (`variant={… ? "success" : …}`), jadi
       yang dicari adalah ketiga LITERALNYA — bukan bentuk atribut JSX.
       Versi pertama tes ini mencari `variant="success"` dan merah: bentuk itu
       memang tidak pernah muncul di halaman yang memilih variannya. */
    for (const varian of ['"success"', '"warning"', '"danger"']) {
      expect(HALAMAN, `varian ${varian} tidak dipakai`).toContain(varian);
    }
    expect(HALAMAN).toMatch(/variant=\{/);
  });

  it("buku yang GAGAL diperiksa ditandai sekeras temuan", () => {
    /*
     * Buku yang tidak terperiksa BUKAN buku yang bersih. Kolomnya harus
     * berubah penanda saat bukan-nol, sama seperti kolom temuan — kalau tidak,
     * sapuan yang melewatkan satu buku terbaca hijau selamanya.
     */
    expect(HALAMAN).toContain("companiesFailed > 0");
    expect(HALAMAN).toContain("findingCount > 0");
    expect(HALAMAN).toContain("PERLU_TINDAKAN");
  });

  it("angkanya rata kanan + tabular, dan warna bukan sinyal tunggal", () => {
    // MASTER.md: angka `tabular-nums` rata-kanan; warna menguatkan, tidak
    // menggantikan. Angkanya sendiri selalu tercetak.
    expect(HALAMAN).toContain("tabular-nums");
    expect(HALAMAN).toContain('align: "right"');
    expect(HALAMAN).toContain("var(--ant-color-money-negative)");
  });
});

describe("daftar temuan tidak berbohong soal kelengkapannya", () => {
  it("menyebut jumlah UTUH saat daftarnya dipangkas", () => {
    /*
     * Jejaknya dipangkas 200 baris di sumbernya. Daftar yang diam soal itu
     * membuat pembacanya menyangka ia melihat semuanya — dan 200 dari 3.000
     * temuan yang terlihat seperti 200 total adalah kabar yang menyesatkan
     * justru pada putaran terburuk.
     */
    expect(HALAMAN).toContain("findingsTruncated");
    expect(HALAMAN).toContain("latest.findingCount >");
  });
});

describe("nav menunjuk ke halaman ini", () => {
  it("ada entri `/operator/conformance` berlabel dari kamus", () => {
    /* Halaman tanpa entri nav adalah halaman yang hanya bisa ditemukan dengan
       mengetik alamatnya — yaitu halaman yang tidak akan dibuka siapa pun. */
    expect(NAV).toContain('href: "/operator/conformance"');
    expect(NAV).toContain('t("operator.nav.conformance")');
  });
});

describe("terjemahan lengkap di KETIGA bahasa", () => {
  /* `tsc` sudah menolak kunci yang tidak ada di kamus sumber, tetapi ia TIDAK
     tahu apakah `en`/`zh` ikut terisi — itulah yang diperiksa di sini. */
  const blok = (d: unknown) =>
    (d as { operator: { conformance?: Record<string, string> } }).operator.conformance;

  it("blok `operator.conformance` ada di id, en, dan zh", () => {
    for (const [nama, d] of [["id", idDict], ["en", enDict], ["zh", zhDict]] as const) {
      expect(blok(d), `${nama}.json tidak punya blok operator.conformance`).toBeTruthy();
    }
  });

  it("kuncinya SAMA PERSIS di ketiga bahasa", () => {
    const kunci = (d: unknown) => Object.keys(blok(d) ?? {}).sort();
    expect(kunci(enDict)).toEqual(kunci(idDict));
    expect(kunci(zhDict)).toEqual(kunci(idDict));
  });

  it("setiap kunci yang dipakai halaman benar-benar ada di kamus", () => {
    const dipakai = [...HALAMAN.matchAll(/operator\.conformance\.(\w+)/g)].map((m) => m[1]!);
    expect(dipakai.length).toBeGreaterThan(0);
    const tersedia = new Set(Object.keys(blok(idDict) ?? {}));
    for (const k of new Set(dipakai)) {
      expect(tersedia.has(k), `kunci operator.conformance.${k} tidak ada di kamus`).toBe(true);
    }
  });

  it("entri nav ikut diterjemahkan", () => {
    for (const [nama, d] of [["id", idDict], ["en", enDict], ["zh", zhDict]] as const) {
      const nav = (d as { operator: { nav: Record<string, string> } }).operator.nav;
      expect(nav.conformance, `${nama}.json: operator.nav.conformance kosong`).toBeTruthy();
    }
  });
});
